import { WebSocketServer, WebSocket, type RawData } from "ws";
import type { IncomingMessage, Server } from "http";
import { resolveClerkWebSocketUser } from "./lib/clerk-websocket-auth";

export const GODOT_RENDER_PATH = "/ws/godot/render";
const MAX_FRAME_BYTES = 12 * 1024 * 1024;

type StoredFrame = {
  data: Buffer;
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "application/octet-stream";
  receivedAt: number;
  sequence: number;
};

let latestFrame: StoredFrame | null = null;
let frameSequence = 0;
let publisherCount = 0;
const viewers = new Set<WebSocket>();

function bridgeToken(req: IncomingMessage): string {
  const url = new URL(req.url ?? "", "http://localhost");
  return url.searchParams.get("token") ?? "";
}

function hasBridgeToken(req: IncomingMessage): boolean {
  const configured = process.env.GODOT_RENDER_TOKEN;
  return Boolean(configured && bridgeToken(req) === configured);
}

function allowUnauthenticatedDevelopmentClient(): boolean {
  return process.env.NODE_ENV !== "production" && !process.env.GODOT_RENDER_TOKEN;
}

function detectMimeType(data: Buffer): StoredFrame["mimeType"] {
  if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (data.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return "image/jpeg";
  if (data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  return "application/octet-stream";
}

function rawDataToBuffer(raw: RawData): Buffer {
  if (Buffer.isBuffer(raw)) return raw;
  if (Array.isArray(raw)) return Buffer.concat(raw.map((part) => Buffer.from(part)));
  return Buffer.from(raw);
}

function sendJson(ws: WebSocket, payload: object): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function sendFrame(ws: WebSocket, frame: StoredFrame): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  sendJson(ws, {
    type: "frame_meta",
    sequence: frame.sequence,
    mimeType: frame.mimeType,
    receivedAt: frame.receivedAt,
    byteLength: frame.data.byteLength,
  });
  ws.send(frame.data, { binary: true });
}

function publishFrame(raw: RawData): void {
  const data = rawDataToBuffer(raw);
  if (data.byteLength === 0 || data.byteLength > MAX_FRAME_BYTES) return;

  latestFrame = {
    data,
    mimeType: detectMimeType(data),
    receivedAt: Date.now(),
    sequence: ++frameSequence,
  };

  for (const viewer of viewers) sendFrame(viewer, latestFrame);
}

export function getGodotRenderStatus() {
  return {
    path: GODOT_RENDER_PATH,
    connected: publisherCount > 0,
    publisherCount,
    viewerCount: viewers.size,
    latestFrame: latestFrame
      ? {
          sequence: latestFrame.sequence,
          mimeType: latestFrame.mimeType,
          receivedAt: latestFrame.receivedAt,
          byteLength: latestFrame.data.byteLength,
        }
      : null,
    tokenConfigured: Boolean(process.env.GODOT_RENDER_TOKEN),
  };
}

/**
 * Godot sends binary PNG/JPEG/WebP frames to this namespaced socket. Browser
 * viewers receive the latest frame immediately and every subsequent frame as a
 * metadata JSON message followed by the binary image payload.
 *
 * The bridge intentionally shares the API server's HTTP listener instead of
 * starting a second process on port 8080. In development it is open for local
 * iteration; production requires GODOT_RENDER_TOKEN for the publisher and a
 * signed Clerk session for viewers.
 */
export function setupGodotRenderBridge(server: Server): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });

  server.on("upgrade", (req, socket, head) => {
    const pathname = (req.url ?? "").split("?")[0];
    if (pathname !== GODOT_RENDER_PATH) return;
    wss.handleUpgrade(req, socket as any, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const role = url.searchParams.get("role") === "publisher" ? "publisher" : "viewer";

    if (role === "publisher") {
      if (!hasBridgeToken(req) && !allowUnauthenticatedDevelopmentClient()) {
        sendJson(ws, { type: "error", error: "Godot publisher token required" });
        ws.close(1008, "Publisher token required");
        return;
      }

      publisherCount += 1;
      let countedPublisher = true;
      const releasePublisher = () => {
        if (!countedPublisher) return;
        countedPublisher = false;
        publisherCount = Math.max(0, publisherCount - 1);
      };
      sendJson(ws, {
        type: "ready",
        role,
        path: GODOT_RENDER_PATH,
        maxFrameBytes: MAX_FRAME_BYTES,
      });

      ws.on("message", (raw, isBinary) => {
        if (isBinary) {
          publishFrame(raw);
          return;
        }
        try {
          const message = JSON.parse(raw.toString());
          if (message?.type === "ping") sendJson(ws, { type: "pong", at: Date.now() });
        } catch {
          // Ignore non-JSON control noise from a publisher.
        }
      });
      ws.on("close", releasePublisher);
      ws.on("error", releasePublisher);
      return;
    }

    const user = await resolveClerkWebSocketUser(req);
    if (!user && !hasBridgeToken(req) && !allowUnauthenticatedDevelopmentClient()) {
      sendJson(ws, { type: "error", error: "Viewer authentication required" });
      ws.close(1008, "Viewer authentication required");
      return;
    }

    viewers.add(ws);
    sendJson(ws, {
      type: "ready",
      role,
      path: GODOT_RENDER_PATH,
      hasFrame: Boolean(latestFrame),
    });
    if (latestFrame) sendFrame(ws, latestFrame);

    ws.on("message", (raw) => {
      try {
        const message = JSON.parse(raw.toString());
        if (message?.type === "ping") sendJson(ws, { type: "pong", at: Date.now() });
      } catch {
        // Viewers are read-only; binary messages are ignored.
      }
    });
    ws.on("close", () => viewers.delete(ws));
    ws.on("error", () => viewers.delete(ws));
  });

  console.log(`[Godot] Render bridge attached at ${GODOT_RENDER_PATH}`);
}