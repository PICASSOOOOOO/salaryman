import type { IncomingMessage, Server } from "node:http";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { and, eq } from "drizzle-orm";
import { db, deviceLinkEventsTable, deviceLinksTable } from "@workspace/db";
import { resolveClerkWebSocketUser } from "./lib/clerk-websocket-auth";

export const DEVICE_CONTROL_PATH = "/ws/device-control";
const MAX_MESSAGE_BYTES = 32 * 1024;
const ALLOWED_ROUTES = new Set(["/office", "/tower", "/business", "/world/play", "/phone", "/settings", "/profile"]);

type Role = "desktop" | "mobile";
type Peer = { ws: WebSocket; userId: string; linkId: string; role: Role; deviceId: string };
const peers = new Map<string, Set<Peer>>();

function send(ws: WebSocket, payload: object): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function pathFor(req: IncomingMessage): string {
  return (req.url ?? "").split("?")[0].replace(/\/+$/, "");
}

function relay(peer: Peer, payload: object): void {
  for (const other of peers.get(peer.linkId) ?? []) {
    if (other !== peer && other.role !== peer.role) send(other.ws, payload);
  }
}

function rawLength(raw: RawData): number {
  if (Buffer.isBuffer(raw)) return raw.byteLength;
  if (Array.isArray(raw)) return raw.reduce((total, part) => total + part.byteLength, 0);
  return raw.byteLength;
}

function validControl(message: unknown): { action: "navigate" | "reload" | "request_file_picker"; path?: string } | null {
  if (!message || typeof message !== "object") return null;
  const value = message as Record<string, unknown>;
  if (value.type !== "control") return null;
  if (value.action === "reload") return { action: "reload" };
  if (value.action === "request_file_picker") return { action: "request_file_picker" };
  if (value.action === "navigate" && typeof value.path === "string" && ALLOWED_ROUTES.has(value.path)) {
    return { action: "navigate", path: value.path };
  }
  return null;
}

async function record(linkId: string, userId: string, actor: Role | "server", eventType: string, metadata: Record<string, unknown> = {}) {
  await db.insert(deviceLinkEventsTable).values({ linkId, userId, actor, eventType, metadata });
}

export function setupDeviceControlBridge(server: Server): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

  server.on("upgrade", (req, socket, head) => {
    if (!pathFor(req).startsWith(`${DEVICE_CONTROL_PATH}/`)) return;
    wss.handleUpgrade(req, socket as any, head, (ws) => wss.emit("connection", ws, req));
  });

  wss.on("connection", async (ws, req: IncomingMessage) => {
    const user = await resolveClerkWebSocketUser(req);
    const url = new URL(req.url ?? "", "http://localhost");
    const linkId = url.pathname.slice(`${DEVICE_CONTROL_PATH}/`.length);
    const role = url.searchParams.get("role");
    const deviceId = url.searchParams.get("deviceId") ?? "";

    if (!user || !linkId || (role !== "desktop" && role !== "mobile") || !/^[a-zA-Z0-9._:-]{8,128}$/.test(deviceId)) {
      send(ws, { type: "error", error: "Authenticated device link required" });
      ws.close(1008, "Authenticated device link required");
      return;
    }

    const [link] = await db.select().from(deviceLinksTable).where(and(
      eq(deviceLinksTable.id, linkId),
      eq(deviceLinksTable.userId, user.id),
      eq(deviceLinksTable.status, "linked"),
    )).limit(1);
    const boundDeviceId = role === "desktop" ? link?.desktopDeviceId : link?.mobileDeviceId;
    if (!link || boundDeviceId !== deviceId) {
      send(ws, { type: "error", error: "This device is not authorized for that link" });
      ws.close(1008, "Device not authorized");
      return;
    }

    const peer: Peer = { ws, userId: user.id, linkId, role, deviceId };
    const linkPeers = peers.get(linkId) ?? new Set<Peer>();
    linkPeers.add(peer);
    peers.set(linkId, linkPeers);
    const seenAt = new Date();
    await db.update(deviceLinksTable).set({
      ...(role === "desktop" ? { lastDesktopSeenAt: seenAt } : { lastMobileSeenAt: seenAt }),
      updatedAt: seenAt,
    }).where(eq(deviceLinksTable.id, linkId));
    await record(linkId, user.id, role, "device_connected", { deviceId });
    send(ws, { type: "ready", linkId, role, scopes: link.scopes });
    relay(peer, { type: "peer_online", role });

    const close = () => {
      const current = peers.get(linkId);
      current?.delete(peer);
      if (current && current.size === 0) peers.delete(linkId);
      relay(peer, { type: "peer_offline", role });
      void record(linkId, user.id, role, "device_disconnected", { deviceId });
    };
    ws.on("close", close);
    ws.on("error", close);
    ws.on("message", async (raw) => {
      if (rawLength(raw) > MAX_MESSAGE_BYTES) {
        ws.close(1009, "Message too large");
        return;
      }
      let message: unknown;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      if (role === "mobile") {
        const control = validControl(message);
        if (!control) {
          send(ws, { type: "error", error: "Unsupported control action" });
          return;
        }
        relay(peer, { type: "control", ...control, at: Date.now() });
        await record(linkId, user.id, "mobile", "control_sent", { action: control.action, path: control.path ?? null });
        return;
      }
      if (message && typeof message === "object" && (message as Record<string, unknown>).type === "desktop_status") {
        relay(peer, { type: "desktop_status", state: (message as Record<string, unknown>).state === "ready" ? "ready" : "away" });
      }
    });
  });
}