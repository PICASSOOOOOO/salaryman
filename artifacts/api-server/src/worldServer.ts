import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Server } from 'http';

const MAX_PLAYERS = 50;

// ── Types ────────────────────────────────────────────────────────────────────
interface Player {
  id: string;
  name: string;
  class: string;
  company: string;
  x: number;
  y: number;
  speaking: boolean;
  ws: WebSocket;
}

interface BuildingLock {
  password: string;
  ownerId: string;
  ownerName: string;
  company: string;
  message: string;        // contact/access message shown to other players
  rentedAt: number;
}

// ── State ─────────────────────────────────────────────────────────────────────
const players = new Map<string, Player>();
const buildingLocks = new Map<string, BuildingLock>();

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
    id: p.id, name: p.name, class: p.class, company: p.company,
    x: p.x, y: p.y, speaking: p.speaking,
  }));
  broadcast({ type: 'player_list', players: list });
};

const sendTo = (id: string, msg: object) => {
  const p = players.get(id);
  if (p && p.ws.readyState === WebSocket.OPEN) p.ws.send(JSON.stringify(msg));
};

// ── Ownership stats helper ────────────────────────────────────────────────────
const getOwnershipStats = () => {
  const counts: Record<string, { count: number; company: string; buildings: string[] }> = {};
  for (const [bid, lock] of buildingLocks) {
    if (!lock.ownerName) continue;
    if (!counts[lock.ownerName]) counts[lock.ownerName] = { count: 0, company: lock.company, buildings: [] };
    counts[lock.ownerName].count++;
    counts[lock.ownerName].buildings.push(bid);
  }
  return counts;
};

// ── Message handler ───────────────────────────────────────────────────────────
const handleMessage = (player: Player, raw: string) => {
  let msg: any;
  try { msg = JSON.parse(raw); } catch { return; }

  switch (msg.type) {

    case 'move':
      player.x = msg.x ?? player.x;
      player.y = msg.y ?? player.y;
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
        const dm = { type: 'chat', room: 'dm', from: player.name, to: msg.toId, text, ts: Date.now() };
        sendTo(msg.toId, dm);
        sendTo(player.id, { ...dm, echo: true });
      } else {
        broadcast({ type: 'chat', room: 'world', from: player.name, text, ts: Date.now() });
      }
      break;
    }

    case 'building_lock_set': {
      const { buildingId, password, message } = msg;
      if (!buildingId || !password) break;
      if (buildingLocks.has(buildingId)) {
        const existing = buildingLocks.get(buildingId)!;
        if (existing.ownerId !== player.id && existing.password !== msg.currentPassword) {
          sendTo(player.id, { type: 'building_lock_result', success: false, buildingId, error: 'Wrong current password.' });
          break;
        }
      }
      buildingLocks.set(buildingId, {
        password,
        ownerId: player.id,
        ownerName: player.name,
        company: player.company,
        message: String(message ?? '').slice(0, 200),
        rentedAt: Date.now(),
      });
      sendTo(player.id, { type: 'building_lock_result', success: true, buildingId, action: 'set' });
      broadcast({ type: 'building_locked', buildingId, ownerName: player.name, company: player.company }, player.id);
      // Broadcast updated ownership stats
      broadcast({ type: 'ownership_update', stats: getOwnershipStats() });
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
      const { buildingId } = msg;
      const lock = buildingLocks.get(buildingId);
      sendTo(player.id, {
        type: 'building_lock_status',
        buildingId,
        locked: !!lock,
        ownerName: lock?.ownerName ?? null,
        company: lock?.company ?? null,
        message: lock?.message ?? null,
      });
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
        broadcast({ type: 'ownership_update', stats: getOwnershipStats() });
      } else {
        sendTo(player.id, { type: 'building_lock_result', success: false, buildingId, error: 'Not the owner.' });
      }
      break;
    }

    case 'building_set_message': {
      const { buildingId, message } = msg;
      const lock = buildingLocks.get(buildingId);
      if (!lock || lock.ownerId !== player.id) break;
      lock.message = String(message ?? '').slice(0, 200);
      sendTo(player.id, { type: 'building_lock_result', success: true, buildingId, action: 'message_set' });
      break;
    }

    case 'request_ownership_stats':
      sendTo(player.id, { type: 'ownership_update', stats: getOwnershipStats() });
      break;
  }
};

// ── Setup ─────────────────────────────────────────────────────────────────────
export const attachWorldServer = (httpServer: Server) => {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  console.log('[World] WebSocket server attached at /ws');

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    // ── Server capacity check ────────────────────────────────────────────────
    if (players.size >= MAX_PLAYERS) {
      ws.send(JSON.stringify({ type: 'server_full', max: MAX_PLAYERS }));
      ws.close(1013, 'Server at capacity');
      console.log(`[World] Connection rejected — at capacity (${MAX_PLAYERS})`);
      return;
    }

    const params = new URLSearchParams(req.url?.split('?')[1] ?? '');
    const name    = (params.get('name')    ?? 'UNKNOWN').slice(0, 24).toUpperCase();
    const cls     = params.get('class')    ?? 'unknown';
    const company = (params.get('company') ?? '').slice(0, 40).toUpperCase();
    const startX  = parseFloat(params.get('x') ?? '820');
    const startY  = parseFloat(params.get('y') ?? '430');
    const id = makeId();

    const player: Player = { id, name, class: cls, company, x: startX, y: startY, speaking: false, ws };
    players.set(id, player);
    console.log(`[World] ${name} joined (${id}), total: ${players.size}/${MAX_PLAYERS}`);

    // Send welcome + lock state + ownership stats
    const locks: Record<string, { ownerName: string; company: string; message: string }> = {};
    buildingLocks.forEach((v, k) => { locks[k] = { ownerName: v.ownerName, company: v.company, message: v.message }; });
    ws.send(JSON.stringify({
      type: 'welcome',
      id,
      playerCount: players.size,
      maxPlayers: MAX_PLAYERS,
      locks,
      ownershipStats: getOwnershipStats(),
    }));

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
