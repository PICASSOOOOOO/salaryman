import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "http";
import { AddressInfo } from "net";
import { randomUUID } from "crypto";
import { WebSocket } from "ws";
import { attachWorldServer } from "../worldServer";

// These tests stand up the REAL world WebSocket server and connect two real
// `ws` clients to the same city, exercising the full move→broadcast path to
// assert that `interiorBid` is forwarded on `player_move` and `player_list`.

let httpServer: Server;
let port: number;
const openSockets: WebSocket[] = [];

// Stable city name isolated from other test files (module-level players Map is
// per-worker in vitest, so it won't collide with world.presence.test.ts).
const TEST_CITY = `ibt_city_${randomUUID().slice(0, 8)}`;

// BufferedSocket wraps a WebSocket and captures every incoming message from the
// moment the socket is open. `next()` drains from the buffer first before
// waiting, avoiding a race between the server sending `player_list` on connect
// and the test registering its listener.
class BufferedSocket {
  readonly ws: WebSocket;
  private readonly buffer: Record<string, unknown>[] = [];
  private readonly waiters: Array<{
    pred: (m: Record<string, unknown>) => boolean;
    resolve: (m: Record<string, unknown>) => void;
  }> = [];

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.on("message", (data: Buffer) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return;
      }
      const msg = parsed as Record<string, unknown>;
      this.buffer.push(msg);
      // Wake any waiting consumers whose predicate now matches.
      for (let i = 0; i < this.waiters.length; i++) {
        if (this.waiters[i].pred(msg)) {
          const [waiter] = this.waiters.splice(i, 1);
          waiter.resolve(msg);
          return;
        }
      }
    });
  }

  static connect(name: string, city: string, port: number): Promise<BufferedSocket> {
    return new Promise((resolve, reject) => {
      const url =
        `ws://127.0.0.1:${port}/ws` +
        `?name=${encodeURIComponent(name)}` +
        `&class=outcast` +
        `&company=ACME` +
        `&city=${encodeURIComponent(city)}`;
      const ws = new WebSocket(url);
      openSockets.push(ws);
      const sock = new BufferedSocket(ws);
      ws.on("open", () => resolve(sock));
      ws.on("error", reject);
    });
  }

  send(payload: object): void {
    this.ws.send(JSON.stringify(payload));
  }

  // Resolve with the first buffered (or future) message satisfying predicate.
  next(
    predicate: (msg: Record<string, unknown>) => boolean,
    timeoutMs = 5000,
  ): Promise<Record<string, unknown>> {
    // Check messages already received before this call.
    const buffered = this.buffer.find(predicate);
    if (buffered) return Promise.resolve(buffered);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.resolve === _resolve);
        if (idx >= 0) this.waiters.splice(idx, 1);
        reject(new Error("Timed out waiting for matching WebSocket message"));
      }, timeoutMs);

      const _resolve = (m: Record<string, unknown>) => {
        clearTimeout(timer);
        resolve(m);
      };
      this.waiters.push({ pred: predicate, resolve: _resolve });
    });
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
});

describe("interiorBid — building presence broadcast", () => {
  it("player_move carries interiorBid when a player enters a building interior", async () => {
    const name1 = `IBT1_${randomUUID().slice(0, 6)}`.toUpperCase();
    const name2 = `IBT2_${randomUUID().slice(0, 6)}`.toUpperCase();

    const sock1 = await BufferedSocket.connect(name1, TEST_CITY, port);
    const sock2 = await BufferedSocket.connect(name2, TEST_CITY, port);

    // Wait for sock2 to receive the player_list that includes sock1 (server
    // sends it on connect; BufferedSocket captures it even if it arrived early).
    const playerList = await sock2.next(
      (msg) =>
        msg.type === "player_list" &&
        Array.isArray(msg.players) &&
        (msg.players as Array<Record<string, unknown>>).some(
          (p) => p.name === name1,
        ),
    );

    const player1Entry = (
      playerList.players as Array<Record<string, unknown>>
    ).find((p) => p.name === name1);
    expect(player1Entry).toBeDefined();
    const player1Id = player1Entry!.id as string;

    // Start listening for sock1's player_move BEFORE sending the move message.
    const movePromise = sock2.next(
      (msg) => msg.type === "player_move" && msg.id === player1Id,
    );

    sock1.send({ type: "move", x: 1000, y: 2000, interiorBid: "theater" });

    const moveMsg = await movePromise;

    expect(moveMsg.type).toBe("player_move");
    expect(moveMsg.id).toBe(player1Id);
    expect(moveMsg.interiorBid).toBe("theater");
  });

  it("player_move has interiorBid undefined when the player is on the open map", async () => {
    const name3 = `IBT3_${randomUUID().slice(0, 6)}`.toUpperCase();
    const name4 = `IBT4_${randomUUID().slice(0, 6)}`.toUpperCase();

    const sock3 = await BufferedSocket.connect(name3, TEST_CITY, port);
    const sock4 = await BufferedSocket.connect(name4, TEST_CITY, port);

    // Get sock3's server-assigned id from sock4's player_list.
    const playerList = await sock4.next(
      (msg) =>
        msg.type === "player_list" &&
        Array.isArray(msg.players) &&
        (msg.players as Array<Record<string, unknown>>).some(
          (p) => p.name === name3,
        ),
    );

    const player3Entry = (
      playerList.players as Array<Record<string, unknown>>
    ).find((p) => p.name === name3);
    expect(player3Entry).toBeDefined();
    const player3Id = player3Entry!.id as string;

    // Listen before sending.
    const movePromise = sock4.next(
      (msg) => msg.type === "player_move" && msg.id === player3Id,
    );

    // Move WITHOUT an interiorBid (open-world position).
    sock3.send({ type: "move", x: 820, y: 430 });

    const moveMsg = await movePromise;

    expect(moveMsg.type).toBe("player_move");
    expect(moveMsg.id).toBe(player3Id);
    // interiorBid must be absent when the player is on the open map.
    expect(moveMsg.interiorBid).toBeUndefined();
  });

  it("player_list includes interiorBid for players already inside a building", async () => {
    const name5 = `IBT5_${randomUUID().slice(0, 6)}`.toUpperCase();
    const name6 = `IBT6_${randomUUID().slice(0, 6)}`.toUpperCase();

    // sock5 connects and moves into a building before sock6 joins.
    const sock5 = await BufferedSocket.connect(name5, TEST_CITY, port);

    // Wait for sock5's own player_list so the server has registered it,
    // then send the interior move.
    await sock5.next((msg) => msg.type === "player_list");
    sock5.send({ type: "move", x: 3000, y: 4000, interiorBid: "megabank" });

    // Brief pause so the server processes the move before sock6 connects.
    await new Promise((r) => setTimeout(r, 80));

    // sock6 connects now; the server's stored state for sock5 already has
    // interiorBid='megabank', so it surfaces in the initial player_list.
    const sock6 = await BufferedSocket.connect(name6, TEST_CITY, port);

    const playerList = await sock6.next(
      (msg) =>
        msg.type === "player_list" &&
        Array.isArray(msg.players) &&
        (msg.players as Array<Record<string, unknown>>).some(
          (p) => p.name === name5,
        ),
    );

    const player5Entry = (
      playerList.players as Array<Record<string, unknown>>
    ).find((p) => p.name === name5);

    expect(player5Entry).toBeDefined();
    expect(player5Entry!.interiorBid).toBe("megabank");
  });
});
