import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Server } from 'http';

const MAX_PLAYERS = 50;

// ── Types ────────────────────────────────────────────────────────────────────
interface LootItem {
  id: string;
  name: string;
  desc: string;
}

interface Player {
  id: string;
  name: string;
  class: string;
  company: string;
  x: number;
  y: number;
  speaking: boolean;
  ws: WebSocket;
  hp: number;
  maxHp: number;
  money: number;
  lastPvpAttack: number;
  level: number;
  inventory: LootItem[];
  weaponId: string;
  lastPveReward: number;
  pveRewardCount: number;
  pveRewardWindow: number;
  lastPveHeal: number;
  ownedWeapons: Set<string>;
  paused: boolean;
}

interface BuildingLock {
  password: string;
  ownerId: string;
  ownerName: string;
  company: string;
  message: string;
  rentedAt: number;
}

// ── State ─────────────────────────────────────────────────────────────────────
const players = new Map<string, Player>();
const buildingLocks = new Map<string, BuildingLock>();
const videoRooms = new Map<string, Set<string>>();

let idCounter = 0;
const makeId = () => `p${++idCounter}_${Date.now().toString(36)}`;

const PVP_COOLDOWN_MS = 500;
const PVP_RANGE = 80;
const LOOT_MONEY_PCT = 0.15;

const CLASS_HP: Record<string, number> = {
  replicant: 450, outcast: 550, corporate: 350, contractor: 340
};
const CLASS_ATK: Record<string, number> = {
  replicant: 22, outcast: 12, corporate: 3, contractor: 7
};
const CLASS_START_MONEY: Record<string, number> = {
  replicant: 60000, outcast: 15000, corporate: 150000, contractor: 50000
};
const VALID_WEAPON_IDS = new Set(['FISTS', 'SWORD', 'GUN', 'LASER', 'BOMB']);
const WEAPON_ATK: Record<string, number> = {
  FISTS: 0, SWORD: 6, GUN: 8, LASER: 10, BOMB: 12,
};
const calcDamage = (p: Player): number => {
  const baseAtk = 20;
  const classBonus = CLASS_ATK[p.class.toLowerCase()] ?? 5;
  const weaponBonus = WEAPON_ATK[p.weaponId] ?? 0;
  return baseAtk + classBonus + weaponBonus;
};

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
    x: p.x, y: p.y, speaking: p.speaking, hp: p.hp, maxHp: p.maxHp, paused: p.paused,
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

// ── Loot item table ──────────────────────────────────────────────────────────
const LOOT_ITEMS = [
  { id: 'scrap_metal', name: 'SCRAP METAL', desc: 'Salvaged components' },
  { id: 'data_chip', name: 'DATA CHIP', desc: 'Encrypted data fragment' },
  { id: 'med_kit', name: 'MED KIT', desc: 'Emergency medical supplies' },
  { id: 'stim_shot', name: 'STIM SHOT', desc: 'Combat stimulant' },
  { id: 'power_cell', name: 'POWER CELL', desc: 'Portable energy source' },
  { id: 'weapon_parts', name: 'WEAPON PARTS', desc: 'Weapon repair kit' },
];

// ── Message handler ───────────────────────────────────────────────────────────
const handleMessage = (player: Player, raw: string) => {
  let msg: any;
  try { msg = JSON.parse(raw); } catch { return; }

  switch (msg.type) {

    case 'move':
      player.x = msg.x ?? player.x;
      player.y = msg.y ?? player.y;
      if (typeof msg.paused === 'boolean') player.paused = msg.paused;
      broadcast({ type: 'player_move', id: player.id, x: player.x, y: player.y, paused: player.paused }, player.id);
      break;

    case 'sync_stats': {
      if (typeof msg.hp === 'number' && msg.hp < player.hp) {
        player.hp = Math.max(0, msg.hp);
      }
      if (typeof msg.weaponId === 'string' && VALID_WEAPON_IDS.has(msg.weaponId)) {
        if (msg.weaponId === 'FISTS' || player.ownedWeapons.has(msg.weaponId)) {
          player.weaponId = msg.weaponId;
        }
      }
      break;
    }

    case 'weapon_purchase': {
      if (typeof msg.weaponId === 'string' && VALID_WEAPON_IDS.has(msg.weaponId) && msg.weaponId !== 'FISTS') {
        const cost = typeof msg.cost === 'number' ? Math.max(0, msg.cost) : 0;
        if (cost > 0 && player.money >= cost) {
          player.ownedWeapons.add(msg.weaponId);
          player.money -= cost;
        }
      }
      break;
    }

    case 'pve_heal': {
      const now = Date.now();
      if (now - player.lastPveHeal < 500) break;
      player.lastPveHeal = now;
      if (typeof msg.hp === 'number') {
        player.hp = Math.max(0, Math.min(msg.hp, player.maxHp));
      }
      break;
    }

    case 'pve_kill': {
      const now = Date.now();
      if (now - player.pveRewardWindow > 10000) {
        player.pveRewardWindow = now;
        player.pveRewardCount = 0;
      }
      player.pveRewardCount++;
      if (player.pveRewardCount > 12) break;
      if (now - player.lastPveReward < 400) break;
      player.lastPveReward = now;
      if (typeof msg.exp === 'number' && msg.exp > 0 && msg.exp <= 100) {
        player.level = Math.min(50, player.level + Math.floor(msg.exp / 100));
        player.maxHp = (CLASS_HP[player.class.toLowerCase()] ?? 350) + (player.level - 1) * 10;
      }
      if (Math.random() < 0.25) {
        const loot = LOOT_ITEMS[Math.floor(Math.random() * LOOT_ITEMS.length)];
        player.inventory.push(loot);
        sendTo(player.id, { type: 'npc_loot', item: loot, inventory: player.inventory });
      }
      break;
    }

    case 'money_update': {
      if (typeof msg.money === 'number' && msg.money >= 0) {
        player.money = msg.money;
      }
      break;
    }

    case 'gold_exchange': {
      if (typeof msg.goldBalance === 'number' && msg.goldBalance >= 0) {
        // Gold balance is tracked client-side; server just validates money sync
        if (typeof msg.money === 'number' && msg.money >= 0) {
          player.money = msg.money;
        }
      }
      break;
    }

    case 'treasure_open': {
      if (typeof msg.chestId === 'string' && typeof msg.money === 'number') {
        player.money = Math.max(0, msg.money);
      }
      break;
    }

    case 'dual_weapon_sync': {
      if (typeof msg.primary === 'string') player.weaponId = msg.primary;
      break;
    }

    case 'world_time_sync': {
      // Broadcast world time to nearby players for sync
      broadcast({ type: 'world_time', time: msg.time, calendar: msg.calendar }, player.id);
      break;
    }

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

    case 'pvp_attack': {
      const { targetId, weaponType } = msg;
      if (!targetId) break;
      const now = Date.now();
      if (now - player.lastPvpAttack < PVP_COOLDOWN_MS) break;
      player.lastPvpAttack = now;
      const target = players.get(targetId);
      if (!target) break;
      if (target.hp <= 0) break;
      const dist = Math.hypot(player.x - target.x, player.y - target.y);
      const maxRange = weaponType === 'ranged' ? 200 : PVP_RANGE;
      if (dist > maxRange) break;
      const clampedDmg = Math.max(1, Math.min(calcDamage(player), 100));
      target.hp = Math.max(0, target.hp - clampedDmg);
      sendTo(target.id, {
        type: 'pvp_hit',
        attackerId: player.id,
        attackerName: player.name,
        damage: clampedDmg,
        remainingHp: target.hp,
      });
      sendTo(player.id, {
        type: 'pvp_hit_confirm',
        targetId: target.id,
        targetName: target.name,
        damage: clampedDmg,
        targetHp: target.hp,
        targetMaxHp: target.maxHp,
      });
      if (target.hp <= 0) {
        const moneyLoot = Math.floor(target.money * LOOT_MONEY_PCT);
        let itemLoot: LootItem | null = null;
        if (target.inventory.length > 0 && Math.random() < 0.35) {
          const idx = Math.floor(Math.random() * target.inventory.length);
          itemLoot = target.inventory.splice(idx, 1)[0];
          player.inventory.push(itemLoot);
        } else if (Math.random() < 0.2) {
          itemLoot = LOOT_ITEMS[Math.floor(Math.random() * LOOT_ITEMS.length)];
          player.inventory.push(itemLoot);
        }
        target.money = Math.max(0, target.money - moneyLoot);
        player.money += moneyLoot;
        sendTo(player.id, {
          type: 'pvp_kill',
          targetId: target.id,
          targetName: target.name,
          loot: { money: moneyLoot, item: itemLoot },
          inventory: player.inventory,
        });
        sendTo(target.id, {
          type: 'pvp_death',
          attackerId: player.id,
          attackerName: player.name,
          lostMoney: moneyLoot,
          lostItem: itemLoot,
          inventory: target.inventory,
          remainingMoney: target.money,
        });
        broadcast({
          type: 'pvp_kill_announce',
          killerName: player.name,
          victimName: target.name,
        }, player.id);
        console.log(`[PvP] ${player.name} killed ${target.name} — looted ƒ${moneyLoot}${itemLoot ? ` + ${itemLoot.name}` : ''}`);
      }
      break;
    }

    case 'pvp_projectile': {
      const { targetId } = msg;
      if (!targetId) break;
      const now2 = Date.now();
      if (now2 - player.lastPvpAttack < PVP_COOLDOWN_MS) break;
      player.lastPvpAttack = now2;
      const target2 = players.get(targetId);
      if (!target2) break;
      if (target2.hp <= 0) break;
      const projDist = Math.hypot(player.x - target2.x, player.y - target2.y);
      if (projDist > 300) break;
      const clampedDmg2 = Math.max(1, Math.min(calcDamage(player), 100));
      target2.hp = Math.max(0, target2.hp - clampedDmg2);
      sendTo(target2.id, {
        type: 'pvp_hit',
        attackerId: player.id,
        attackerName: player.name,
        damage: clampedDmg2,
        remainingHp: target2.hp,
      });
      sendTo(player.id, {
        type: 'pvp_hit_confirm',
        targetId: target2.id,
        targetName: target2.name,
        damage: clampedDmg2,
        targetHp: target2.hp,
        targetMaxHp: target2.maxHp,
      });
      if (target2.hp <= 0) {
        const moneyLoot2 = Math.floor(target2.money * LOOT_MONEY_PCT);
        let itemLoot2: LootItem | null = null;
        if (target2.inventory.length > 0 && Math.random() < 0.35) {
          const idx = Math.floor(Math.random() * target2.inventory.length);
          itemLoot2 = target2.inventory.splice(idx, 1)[0];
          player.inventory.push(itemLoot2);
        } else if (Math.random() < 0.2) {
          itemLoot2 = LOOT_ITEMS[Math.floor(Math.random() * LOOT_ITEMS.length)];
          player.inventory.push(itemLoot2);
        }
        target2.money = Math.max(0, target2.money - moneyLoot2);
        player.money += moneyLoot2;
        sendTo(player.id, {
          type: 'pvp_kill',
          targetId: target2.id,
          targetName: target2.name,
          loot: { money: moneyLoot2, item: itemLoot2 },
          inventory: player.inventory,
        });
        sendTo(target2.id, {
          type: 'pvp_death',
          attackerId: player.id,
          attackerName: player.name,
          lostMoney: moneyLoot2,
          lostItem: itemLoot2,
          inventory: target2.inventory,
          remainingMoney: target2.money,
        });
        broadcast({
          type: 'pvp_kill_announce',
          killerName: player.name,
          victimName: target2.name,
        }, player.id);
        console.log(`[PvP] ${player.name} killed ${target2.name} (ranged) — looted ƒ${moneyLoot2}`);
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

    case 'rtc_join_room': {
      const roomId = String(msg.roomId ?? '').slice(0, 64);
      if (!roomId) break;
      if (!videoRooms.has(roomId)) videoRooms.set(roomId, new Set());
      const room = videoRooms.get(roomId)!;
      const existingPeers = Array.from(room).filter(pid => players.has(pid) && pid !== player.id);
      room.add(player.id);
      sendTo(player.id, { type: 'rtc_room_peers', roomId, peers: existingPeers.map(pid => ({ id: pid, name: players.get(pid)!.name })) });
      for (const pid of existingPeers) {
        sendTo(pid, { type: 'rtc_peer_joined', roomId, peerId: player.id, peerName: player.name });
      }
      break;
    }

    case 'rtc_leave_room': {
      const roomId = String(msg.roomId ?? '').slice(0, 64);
      const room = videoRooms.get(roomId);
      if (!room) break;
      room.delete(player.id);
      if (room.size === 0) videoRooms.delete(roomId);
      for (const pid of room) {
        sendTo(pid, { type: 'rtc_peer_left', roomId, peerId: player.id });
      }
      break;
    }

    case 'rtc_signal': {
      const { targetId, signal, roomId } = msg;
      if (!targetId || !signal || !roomId) break;
      const sigRoom = videoRooms.get(roomId);
      if (!sigRoom || !sigRoom.has(player.id) || !sigRoom.has(targetId)) break;
      sendTo(targetId, { type: 'rtc_signal', fromId: player.id, fromName: player.name, signal, roomId });
      break;
    }
  }
};

// ── Setup ─────────────────────────────────────────────────────────────────────
export const attachWorldServer = (httpServer: Server) => {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  console.log('[World] WebSocket server attached at /ws');

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
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

    const maxHp = CLASS_HP[cls.toLowerCase()] ?? 350;
    const startMoney = CLASS_START_MONEY[cls.toLowerCase()] ?? 50000;
    const player: Player = { id, name, class: cls, company, x: startX, y: startY, speaking: false, ws, hp: maxHp, maxHp, money: startMoney, lastPvpAttack: 0, level: 1, inventory: [], weaponId: 'FISTS', lastPveReward: 0, pveRewardCount: 0, pveRewardWindow: 0, lastPveHeal: 0, ownedWeapons: new Set(['FISTS']), paused: false };
    players.set(id, player);
    console.log(`[World] ${name} joined (${id}), total: ${players.size}/${MAX_PLAYERS}`);

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
      for (const [roomId, room] of videoRooms) {
        if (room.has(id)) {
          room.delete(id);
          for (const pid of room) sendTo(pid, { type: 'rtc_peer_left', roomId, peerId: id });
          if (room.size === 0) videoRooms.delete(roomId);
        }
      }
      players.delete(id);
      console.log(`[World] ${name} left, total: ${players.size}`);
      broadcast({ type: 'player_left', id, name });
      broadcastPlayerList();
    });

    ws.on('error', (err) => console.error(`[World] WS error for ${name}:`, err.message));
  });

  setInterval(() => {
    for (const [, p] of players) {
      if (p.ws.readyState === WebSocket.OPEN) p.ws.ping();
    }
  }, 25000);

  return wss;
};
