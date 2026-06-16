import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "http";
import { AddressInfo } from "net";
import { randomUUID } from "crypto";
import { WebSocket } from "ws";
import { attachWorldServer } from "../worldServer";

// These tests verify that proximity_chat dialog bubbles are scoped to the
// sender's building interior.  A player chatting inside 'theater' must NOT
// have their bubble delivered to a player inside a different building
// ('megabank'), while a co-occupant of the same building MUST receive it.

let httpServer: Server;
let port: number;
const openSockets: WebSocket[] = [];

const TEST_CITY = `icit_city_${randomUUID().slice(0, 8)}`;

// ---------------------------------------------------------------------------
// BufferedSocket — reused verbatim from world.interior-bid.test.ts pattern.
// Wraps a WebSocket, captures every incoming message from the moment the
// socket opens, and lets tests drain already-received messages before waiting.
// ---------------------------------------------------------------------------
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
      for (let i = 0; i < this.waiters.length; i++) {
        if (this.waiters[i].pred(msg)) {
          const [waiter] = this.waiters.splice(i, 1);
          waiter.resolve(msg);
          return;
        }
      }
    });
  }

  static connect(
    name: string,
    city: string,
    port: number,
  ): Promise<BufferedSocket> {
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

  next(
    predicate: (msg: Record<string, unknown>) => boolean,
    timeoutMs = 5000,
  ): Promise<Record<string, unknown>> {
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

  // Resolve true if a matching message arrives within timeoutMs, false if it
  // does NOT arrive (i.e. the message is absent — used to assert non-delivery).
  async absent(
    predicate: (msg: Record<string, unknown>) => boolean,
    windowMs = 300,
  ): Promise<boolean> {
    if (this.buffer.find(predicate)) return false;
    try {
      await this.next(predicate, windowMs);
      return false;
    } catch {
      return true;
    }
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

// ---------------------------------------------------------------------------
// Helper: wait for a player_list that includes the named player, then return
// that player's server-assigned id.
// ---------------------------------------------------------------------------
async function waitForPlayerId(
  observer: BufferedSocket,
  playerName: string,
): Promise<string> {
  const list = await observer.next(
    (msg) =>
      msg.type === "player_list" &&
      Array.isArray(msg.players) &&
      (msg.players as Array<Record<string, unknown>>).some(
        (p) => p.name === playerName,
      ),
  );
  const entry = (list.players as Array<Record<string, unknown>>).find(
    (p) => p.name === playerName,
  );
  return entry!.id as string;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("interior chat isolation — proximity_chat scoped by interiorBid", () => {
  it("proximity_chat from a theater player is received by a co-occupant in the same building", async () => {
    const nameA = `ICIT_A_${randomUUID().slice(0, 6)}`.toUpperCase();
    const nameB = `ICIT_B_${randomUUID().slice(0, 6)}`.toUpperCase();

    const sockA = await BufferedSocket.connect(nameA, TEST_CITY, port);
    const sockB = await BufferedSocket.connect(nameB, TEST_CITY, port);

    // Resolve A's server id from B's initial player_list.
    const playerAId = await waitForPlayerId(sockB, nameA);

    // Both players enter the same building.
    sockA.send({ type: "move", x: 100, y: 200, interiorBid: "theater" });
    sockB.send({ type: "move", x: 110, y: 200, interiorBid: "theater" });

    // Brief pause so the server processes both move messages.
    await new Promise((r) => setTimeout(r, 80));

    // Listen BEFORE sending the chat message to avoid any race.
    const bubblePromise = sockB.next(
      (msg) =>
        msg.type === "proximity_chat" &&
        msg.id === playerAId,
      4000,
    );

    sockA.send({ type: "chat", text: "Hello from inside theater!" });

    const bubble = await bubblePromise;
    expect(bubble.type).toBe("proximity_chat");
    expect(bubble.id).toBe(playerAId);
    expect(bubble.name).toBe(nameA);
    expect(typeof bubble.text).toBe("string");
  });

  it("proximity_chat from a theater player does NOT reach a player in a different building (megabank)", async () => {
    const nameC = `ICIT_C_${randomUUID().slice(0, 6)}`.toUpperCase();
    const nameD = `ICIT_D_${randomUUID().slice(0, 6)}`.toUpperCase();
    const nameE = `ICIT_E_${randomUUID().slice(0, 6)}`.toUpperCase();

    const sockC = await BufferedSocket.connect(nameC, TEST_CITY, port);
    const sockD = await BufferedSocket.connect(nameD, TEST_CITY, port);
    const sockE = await BufferedSocket.connect(nameE, TEST_CITY, port);

    // Resolve C's server id from D's and E's player lists.
    const playerCId = await waitForPlayerId(sockD, nameC);

    // C and D are co-occupants of the theater; E is in megabank.
    sockC.send({ type: "move", x: 200, y: 300, interiorBid: "theater" });
    sockD.send({ type: "move", x: 210, y: 300, interiorBid: "theater" });
    sockE.send({ type: "move", x: 500, y: 600, interiorBid: "megabank" });

    // Give the server time to process all three move messages.
    await new Promise((r) => setTimeout(r, 80));

    // Set up concurrent listeners so no message from C slips through undetected.
    const dReceives = sockD.next(
      (msg) => msg.type === "proximity_chat" && msg.id === playerCId,
      4000,
    );
    const eAbsent = sockE.absent(
      (msg) => msg.type === "proximity_chat" && msg.id === playerCId,
      600,
    );

    sockC.send({ type: "chat", text: "Secret theater chat" });

    // D (same building) must receive the bubble.
    const dBubble = await dReceives;
    expect(dBubble.type).toBe("proximity_chat");
    expect(dBubble.id).toBe(playerCId);

    // E (different building) must NOT receive the bubble within the window.
    const wasAbsent = await eAbsent;
    expect(wasAbsent).toBe(true);
  });

  it("proximity_chat from an open-world player (no interiorBid) reaches all city players", async () => {
    const nameF = `ICIT_F_${randomUUID().slice(0, 6)}`.toUpperCase();
    const nameG = `ICIT_G_${randomUUID().slice(0, 6)}`.toUpperCase();

    const sockF = await BufferedSocket.connect(nameF, TEST_CITY, port);
    const sockG = await BufferedSocket.connect(nameG, TEST_CITY, port);

    const playerFId = await waitForPlayerId(sockG, nameF);

    // F is on the open map (no interiorBid); G is inside a building.
    sockF.send({ type: "move", x: 50, y: 50 });
    sockG.send({ type: "move", x: 60, y: 60, interiorBid: "megabank" });

    await new Promise((r) => setTimeout(r, 80));

    const bubblePromise = sockG.next(
      (msg) => msg.type === "proximity_chat" && msg.id === playerFId,
      4000,
    );

    sockF.send({ type: "chat", text: "Open world chat, everyone hears!" });

    const bubble = await bubblePromise;
    expect(bubble.type).toBe("proximity_chat");
    expect(bubble.id).toBe(playerFId);
  });
});
