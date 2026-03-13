import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Server } from 'http';

// ── Types ────────────────────────────────────────────────────────────────────
interface Player {
  id: string;
  name: string;
  class: string;
  x: number;
  y: number;
  speaking: boolean;
  ws: WebSocket;
}

interface ChatMessage {
  type: 'chat';
  room: 'world' | 'dm';
  from: string;
  to?: string;
  text: string;
  ts: number;
}

interface BuildingLock {
  password: string;
  ownerId: string;
  ownerName: string;
}

// ── State ─────────────────────────────────────────────────────────────────────
const players = new Map<string, Player>();
const buildingLocks = new Map<string, BuildingLock>(); // buildingId → lock

let idCounter = 0;
const makeId = () => `p${++idCounter}_${Date.now().toString(36)}`;

// ── Broadcast helpers ─────────────────────────────────────────────────────────
const broadcast = (msg: object, exclude?: string) => {
  const data = JSON.stringify(msg);
  for (const [id, p] of players) {
    if (id === exclude) continue;
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(data);
  }
};

const broadcastPlayerList = () => {
  const list = Array.from(players.values()).map(p => ({
    id: p.id, name: p.name, class: p.class, x: p.x, y: p.y, speaking: p.speaking,
  }));
  broadcast({ type: 'player_list', players: list });
};

const sendTo = (id: string, msg: object) => {
  const p = players.get(id);
  if (p && p.ws.readyState === WebSocket.OPEN) p.ws.send(JSON.stringify(msg));
};

// ── Message handler ───────────────────────────────────────────────────────────
const handleMessage = (player: Player, raw: string) => {
  let msg: any;
  try { msg = JSON.parse(raw); } catch { return; }

  switch (msg.type) {

    case 'move':
      player.x = msg.x ?? player.x;
      player.y = msg.y ?? player.y;
      // Broadcast position to all others
      broadcast({ type: 'player_move', id: player.id, x: player.x, y: player.y }, player.id);
      break;

    case 'speaking':
      player.speaking = !!msg.speaking;
      broadcast({ type: 'player_speaking', id: player.id, speaking: player.speaking }, player.id);
      break;

    case 'chat': {
      if (!msg.text || typeof msg.text !== 'string') break;
      const text = String(msg.text).slice(0, 400);
      if (msg.room === 'dm' && msg.toId) {
        // DM — send to target and back to sender as echo
        const dm: ChatMessage = { type: 'chat', room: 'dm', from: player.name, to: msg.toId, text, ts: Date.now() };
        sendTo(msg.toId, dm);
        sendTo(player.id, { ...dm, echo: true });
      } else {
        // World public chat — broadcast to all
        const worldMsg: ChatMessage = { type: 'chat', room: 'world', from: player.name, text, ts: Date.now() };
        broadcast(worldMsg);
      }
      break;
    }

    case 'building_lock_set': {
      const { buildingId, password } = msg;
      if (!buildingId || !password) break;
      if (buildingLocks.has(buildingId)) {
        // Already locked — must verify owner password to change
        const existing = buildingLocks.get(buildingId)!;
        if (existing.ownerId !== player.id && existing.password !== msg.currentPassword) {
          sendTo(player.id, { type: 'building_lock_result', success: false, buildingId, error: 'Wrong current password.' });
          break;
        }
      }
      buildingLocks.set(buildingId, { password, ownerId: player.id, ownerName: player.name });
      sendTo(player.id, { type: 'building_lock_result', success: true, buildingId, action: 'set' });
      broadcast({ type: 'building_locked', buildingId, ownerName: player.name }, player.id);
      console.log(`[World] ${player.name} locked ${buildingId}`);
      break;
    }

    case 'building_lock_check': {
      const { buildingId, password } = msg;
      const lock = buildingLocks.get(buildingId);
      if (!lock) {
        sendTo(player.id, { type: 'building_lock_result', success: true, buildingId, action: 'open', unlocked: true });
      } else if (lock.password === password) {
        sendTo(player.id, { type: 'building_lock_result', success: true, buildingId, action: 'unlock', unlocked: true });
      } else {
        sendTo(player.id, { type: 'building_lock_result', success: false, buildingId, action: 'unlock', error: 'ACCESS DENIED — Wrong password.' });
      }
      break;
    }

    case 'building_lock_query': {
      // Ask: is this building locked?
      const { buildingId } = msg;
      const lock = buildingLocks.get(buildingId);
      sendTo(player.id, { type: 'building_lock_status', buildingId, locked: !!lock, ownerName: lock?.ownerName ?? null });
      break;
    }

    case 'building_lock_remove': {
      const { buildingId, password } = msg;
      const lock = buildingLocks.get(buildingId);
      if (!lock) break;
      if (lock.ownerId === player.id || lock.password === password) {
        buildingLocks.delete(buildingId);
        sendTo(player.id, { type: 'building_lock_result', success: true, buildingId, action: 'remove' });
        broadcast({ type: 'building_unlocked', buildingId }, player.id);
      } else {
        sendTo(player.id, { type: 'building_lock_result', success: false, buildingId, error: 'Not the owner.' });
      }
      break;
    }
  }
};

// ── Setup ─────────────────────────────────────────────────────────────────────
export const attachWorldServer = (httpServer: Server) => {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  console.log('[World] WebSocket server attached at /ws');

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const params = new URLSearchParams(req.url?.split('?')[1] ?? '');
    const name  = (params.get('name')  ?? 'UNKNOWN').slice(0, 24).toUpperCase();
    const cls   = params.get('class')  ?? 'unknown';
    const startX = parseFloat(params.get('x') ?? '820');
    const startY = parseFloat(params.get('y') ?? '430');
    const id = makeId();

    const player: Player = { id, name, class: cls, x: startX, y: startY, speaking: false, ws };
    players.set(id, player);
    console.log(`[World] ${name} joined (${id}), total: ${players.size}`);

    // Send welcome + lock state
    const locks: Record<string, { ownerName: string }> = {};
    buildingLocks.forEach((v, k) => { locks[k] = { ownerName: v.ownerName }; });
    ws.send(JSON.stringify({ type: 'welcome', id, playerCount: players.size, locks }));

    // Notify others
    broadcastPlayerList();

    ws.on('message', (data: Buffer) => handleMessage(player, data.toString()));

    ws.on('close', () => {
      players.delete(id);
      console.log(`[World] ${name} left, total: ${players.size}`);
      broadcast({ type: 'player_left', id, name });
      broadcastPlayerList();
    });

    ws.on('error', (err) => console.error(`[World] WS error for ${name}:`, err.message));
  });

  // Ping keepalive every 25s
  setInterval(() => {
    for (const [, p] of players) {
      if (p.ws.readyState === WebSocket.OPEN) p.ws.ping();
    }
  }, 25000);

  return wss;
};
