import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "http";
import { AddressInfo } from "net";
import { randomUUID } from "crypto";
import { WebSocket } from "ws";
import { db, playerCityVisasTable, sessionsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { createSession, deleteSession } from "../lib/auth";
import {
  attachWorldServer,
  getOnlinePlayers,
  recordHeartbeat,
} from "../worldServer";

// These tests stand up the REAL world WebSocket server on a throwaway HTTP
// server and connect a real `ws` client carrying a session cookie, mirroring
// how the browser connects. The connect handler resolves the player's profile
// photo server-side from that session, so we can assert the photo surfaces in
// getOnlinePlayers() without trusting any client-supplied URL.

let httpServer: Server;
let port: number;
const createdSids: string[] = [];
const createdUserIds: string[] = [];
const openSockets: WebSocket[] = [];

// Build a session row whose authenticated user carries the given photo, and
// return the raw session id to send as the `sid` cookie on the WS handshake.
async function createSessionWithPhoto(
  profileImageUrl: string | null,
): Promise<string> {
  const userId = `world-test-${randomUUID()}`;
  const sid = await createSession({
    user: {
      id: userId,
      email: `world-${randomUUID().slice(0, 8)}@example.test`,
      firstName: "WS",
      lastName: "Player",
      profileImageUrl,
    },
    access_token: "test-access-token",
  });
  await db.insert(playerCityVisasTable).values({
    userId,
    cityId: "minx_city",
  });
  createdSids.push(sid);
  createdUserIds.push(userId);
  return sid;
}

// Open a world WS connection with the given name and optional session cookie,
// resolving once the socket is open.
function connectPlayer(name: string, sid?: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const url = `ws://127.0.0.1:${port}/ws?name=${encodeURIComponent(name)}&class=outcast&company=ACME`;
    const ws = new WebSocket(url, {
      headers: sid ? { cookie: `sid=${sid}` } : {},
    });
    openSockets.push(ws);
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

// Poll getOnlinePlayers() until `predicate` is satisfied (the connect handler
// resolves the avatar asynchronously, so the photo lands a tick after open).
async function waitForOnline<T>(
  predicate: (players: ReturnType<typeof getOnlinePlayers>) => T | undefined,
  timeoutMs = 5000,
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const found = predicate(getOnlinePlayers());
    if (found !== undefined) return found;
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for online-player condition");
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

beforeAll(async () => {
  httpServer = createServer();
  attachWorldServer(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  port = (httpServer.address() as AddressInfo).port;
});

afterAll(async () => {
  for (const ws of openSockets) {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  }
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  for (const sid of createdSids) {
    await deleteSession(sid).catch(() => {});
  }
  // Belt-and-suspenders: ensure no test session rows linger.
  for (const sid of createdSids) {
    await db.delete(sessionsTable).where(eq(sessionsTable.sid, sid)).catch(() => {});
  }
  if (createdUserIds.length) {
    await db.delete(playerCityVisasTable)
      .where(inArray(playerCityVisasTable.userId, createdUserIds))
      .catch(() => {});
  }
});

describe("world map presence — live WS player photo", () => {
  it("resolves a live WS player's profile photo from their session", async () => {
    const photo = "https://cdn.example.test/avatars/ws-player.png";
    const sid = await createSessionWithPhoto(photo);
    const name = `WSPHOTO${randomUUID().slice(0, 6)}`.toUpperCase();

    await connectPlayer(name, sid);

    const entry = await waitForOnline((players) =>
      players.find(
        (p) => p.username === name && p.profileImageUrl === photo,
      ),
    );

    expect(entry.profileImageUrl).toBe(photo);
    expect(entry.status).toBe("active");
  });

  it("leaves profileImageUrl null for a WS player with no session cookie", async () => {
    const name = `WSNOAUTH${randomUUID().slice(0, 6)}`.toUpperCase();

    await connectPlayer(name);

    // Give the (no-op) async avatar resolution a chance to run, then assert
    // the player is present but photo-less.
    const entry = await waitForOnline((players) =>
      players.find((p) => p.username === name),
    );
    await new Promise((r) => setTimeout(r, 200));

    const after = getOnlinePlayers().find((p) => p.username === name);
    expect(after).toBeDefined();
    expect(after!.profileImageUrl).toBeNull();
    expect(entry.username).toBe(name);
  });

  it("returns the heartbeat player's photo and does not duplicate a WS player by name", async () => {
    // A heartbeat-only player (no WS connection) shows up with its photo.
    const hbName = `HBONLY${randomUUID().slice(0, 6)}`.toUpperCase();
    const hbPhoto = "https://cdn.example.test/avatars/hb-player.png";
    recordHeartbeat(`hb-${randomUUID()}`, hbName, hbPhoto);

    const hbEntry = getOnlinePlayers().find((p) => p.username === hbName);
    expect(hbEntry).toBeDefined();
    expect(hbEntry!.profileImageUrl).toBe(hbPhoto);
    expect(hbEntry!.status).toBe("online");

    // Now connect that same name over WS, then record a heartbeat under the
    // same name. The WS entry must win and there must be exactly one row for
    // that name (heartbeat dedup by name).
    const wsPhoto = "https://cdn.example.test/avatars/ws-wins.png";
    const sid = await createSessionWithPhoto(wsPhoto);
    const dupName = `DUPNAME${randomUUID().slice(0, 6)}`.toUpperCase();

    await connectPlayer(dupName, sid);
    await waitForOnline((players) =>
      players.find(
        (p) => p.username === dupName && p.profileImageUrl === wsPhoto,
      ),
    );

    // Heartbeat under the SAME name (any casing) must be deduped out.
    recordHeartbeat(`hb-${randomUUID()}`, dupName.toLowerCase(), "https://cdn.example.test/avatars/should-not-appear.png");

    const matches = getOnlinePlayers().filter(
      (p) => p.username.toUpperCase() === dupName,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].profileImageUrl).toBe(wsPhoto);
    expect(matches[0].status).toBe("active");
  });
});
