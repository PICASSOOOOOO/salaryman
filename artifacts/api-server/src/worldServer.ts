import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Server } from 'http';
import { db, meetingsTable, worldKvTable, orgMembersTable } from '@workspace/db';
import { eq, and, gt } from 'drizzle-orm';
import { verifyGuestToken } from './routes/meetings';
import { getSession, SESSION_COOKIE } from './lib/auth';
import { resolveClassroomLiveAccess } from './routes/education';

// Per-realm population cap. Each realm runs the SAME game on its own always-on
// server; the cap keeps a single instance healthy and hosting cost predictable.
// Default 50; raise per deployment (SERVER_MAX_PLAYERS) once a realm's economy
// justifies more compute, or spin up a second city in the same continent.
export const MAX_PLAYERS = Number(process.env.SERVER_MAX_PLAYERS ?? process.env.MAX_PLAYERS) || 50;

// Which realm this (identical) deployment IS. Both servers run the same build;
// only these env vars differ — NA defaults to Minx City, the Asia deployment
// sets SERVER_CITY_ID=huda_city / SERVER_REGION="ASIA".
export const SERVER_CITY_ID = process.env.SERVER_CITY_ID ?? "minx_city";
export const SERVER_REGION = process.env.SERVER_REGION ?? "AMERICAS — NORTH";

// ── City Liberation Progress (shared, persisted) ──────────────────────────────
const LIBERATION_KEY = 'city_liberation_progress';
let liberationProgress = 0;

const loadLiberationProgress = async () => {
  try {
    const rows = await db.select().from(worldKvTable).where(eq(worldKvTable.key, LIBERATION_KEY)).limit(1);
    if (rows.length > 0) liberationProgress = rows[0].value;
    else {
      await db.insert(worldKvTable).values({ key: LIBERATION_KEY, value: 0 });
      liberationProgress = 0;
    }
    console.log(`[World] Liberation progress loaded: ${liberationProgress}%`);
  } catch (err: any) {
    console.error('[World] Failed to load liberation progress:', err.message);
  }
};

const saveLiberationProgress = async () => {
  try {
    await db.update(worldKvTable).set({ value: liberationProgress }).where(eq(worldKvTable.key, LIBERATION_KEY));
  } catch (err: any) {
    console.error('[World] Failed to save liberation progress:', err.message);
  }
};

export const getLiberationProgress = () => liberationProgress;

export const incrementLiberationProgress = async (amount: number) => {
  liberationProgress = Math.min(100, Math.max(0, liberationProgress + amount));
  await saveLiberationProgress();
  return liberationProgress;
};

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
  profileImageUrl: string | null;
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
  killLibContribCount: number;
  killLibContribWindow: number;
  buildingLibContribCount: number;
  buildingLibContribWindow: number;
}

interface BuildingLock {
  password: string;
  ownerId: string;
  ownerName: string;
  company: string;
  message: string;
  rentedAt: number;
}

interface FloorLock {
  password: string;
  ownerId: string;
  ownerName: string;
  company: string;
  label: string;
  setAt: number;
}

// ── State ─────────────────────────────────────────────────────────────────────
const players = new Map<string, Player>();
const buildingLocks = new Map<string, BuildingLock>();
const floorLocks = new Map<string, FloorLock>();
const videoRooms = new Map<string, Set<string>>();
const pendingCalls = new Map<string, { callerId: string; targetId: string; ts: number }>();
const activeCalls = new Map<string, string>();

// Guest connection state (room code → set of guest connection objects)
interface GuestConn {
  id: string;
  name: string;
  ws: WebSocket;
  roomCode: string;
}
const guestRooms = new Map<string, Set<GuestConn>>();

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
      // ── Liberation contribution: ~0.5% chance per verified kill, max 5 per hour per player ──
      {
        const libNow = Date.now();
        if (libNow - player.killLibContribWindow > 3600000) {
          player.killLibContribWindow = libNow;
          player.killLibContribCount = 0;
        }
        if (player.killLibContribCount < 5 && Math.random() < 0.005) {
          player.killLibContribCount++;
          incrementLiberationProgress(1).then(progress => {
            broadcast({ type: 'liberation_update', progress });
          });
        }
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

    case 'voice_join': {
      const nearbyPeers = Array.from(players.values()).filter(p =>
        p.id !== player.id &&
        Math.hypot(p.x - player.x, p.y - player.y) < 100
      );
      for (const peer of nearbyPeers) {
        sendTo(peer.id, { type: 'voice_peer_joined', id: player.id, name: player.name });
      }
      break;
    }

    case 'voice_offer': {
      const { to, sdp } = msg;
      if (!to || !sdp || !players.has(to)) break;
      const dist = Math.hypot(player.x - players.get(to)!.x, player.y - players.get(to)!.y);
      const inCall = activeCalls.get(player.id) === to || activeCalls.get(to) === player.id;
      if (dist > 150 && !inCall) break;
      sendTo(to, { type: 'voice_offer', from: player.id, sdp });
      break;
    }

    case 'voice_answer': {
      const { to, sdp } = msg;
      if (!to || !sdp || !players.has(to)) break;
      sendTo(to, { type: 'voice_answer', from: player.id, sdp });
      break;
    }

    case 'voice_ice': {
      const { to, candidate } = msg;
      if (!to || !candidate || !players.has(to)) break;
      sendTo(to, { type: 'voice_ice', from: player.id, candidate });
      break;
    }

    case 'phone_call_invite': {
      const { targetId } = msg;
      if (!targetId) break;
      const target = players.get(targetId);
      if (!target) { sendTo(player.id, { type: 'phone_call_error', error: 'Player not found or offline.' }); break; }
      if (activeCalls.has(player.id)) { sendTo(player.id, { type: 'phone_call_error', error: 'You are already in a call.' }); break; }
      if (activeCalls.has(targetId)) { sendTo(player.id, { type: 'phone_call_error', error: 'Player is already in a call.' }); break; }
      const callKey = `${player.id}_${targetId}`;
      pendingCalls.set(callKey, { callerId: player.id, targetId, ts: Date.now() });
      sendTo(targetId, { type: 'phone_call_incoming', callerId: player.id, callerName: player.name });
      sendTo(player.id, { type: 'phone_call_ringing', targetId, targetName: target.name });
      setTimeout(() => pendingCalls.delete(callKey), 30000);
      break;
    }

    case 'phone_call_accept': {
      const { callerId } = msg;
      if (!callerId) break;
      const callKey = `${callerId}_${player.id}`;
      const pending = pendingCalls.get(callKey);
      if (!pending || pending.callerId !== callerId || pending.targetId !== player.id) {
        sendTo(player.id, { type: 'phone_call_error', error: 'No pending call from this player.' });
        break;
      }
      const caller = players.get(callerId);
      if (!caller) break;
      pendingCalls.delete(callKey);
      activeCalls.set(player.id, callerId);
      activeCalls.set(callerId, player.id);
      const callRoomId = `call_${callerId}_${player.id}_${Date.now()}`;
      sendTo(callerId, { type: 'phone_call_accepted', peerId: player.id, peerName: player.name, roomId: callRoomId });
      sendTo(player.id, { type: 'phone_call_connected', peerId: callerId, peerName: caller.name, roomId: callRoomId });
      break;
    }

    case 'phone_call_decline': {
      const { callerId } = msg;
      if (!callerId) break;
      const callKey = `${callerId}_${player.id}`;
      if (!pendingCalls.has(callKey)) break;
      pendingCalls.delete(callKey);
      sendTo(callerId, { type: 'phone_call_declined', peerId: player.id, peerName: player.name });
      break;
    }

    case 'phone_call_end': {
      const { peerId } = msg;
      if (!peerId) break;
      const partner = activeCalls.get(player.id);
      if (partner !== peerId) break;
      activeCalls.delete(player.id);
      activeCalls.delete(peerId);
      sendTo(peerId, { type: 'phone_call_ended', peerId: player.id, peerName: player.name });
      break;
    }

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
      // ── Liberation contribution: claiming a building (max 2 contributions per player per day) ──
      {
        const libNow = Date.now();
        if (libNow - player.buildingLibContribWindow > 86400000) {
          player.buildingLibContribWindow = libNow;
          player.buildingLibContribCount = 0;
        }
        if (player.buildingLibContribCount < 2) {
          player.buildingLibContribCount++;
          incrementLiberationProgress(1).then(progress => {
            broadcast({ type: 'liberation_update', progress });
          });
        }
      }
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

    case 'floor_lock_set': {
      const { buildingId, floor, password, label } = msg;
      if (!buildingId || floor == null || !password) break;
      const floorKey = `${buildingId}:${floor}`;
      const existing = floorLocks.get(floorKey);
      if (existing && existing.ownerId !== player.id) {
        sendTo(player.id, { type: 'floor_lock_result', success: false, buildingId, floor, error: 'Only the floor admin can change this lock.' });
        break;
      }
      floorLocks.set(floorKey, {
        password: String(password).slice(0, 64),
        ownerId: player.id,
        ownerName: player.name,
        company: player.company,
        label: String(label ?? '').slice(0, 80),
        setAt: Date.now(),
      });
      sendTo(player.id, { type: 'floor_lock_result', success: true, buildingId, floor, action: 'set' });
      console.log(`[World] ${player.name} locked floor ${floor} of ${buildingId}`);
      break;
    }

    case 'floor_lock_check': {
      const { buildingId, floor, password } = msg;
      const floorKey = `${buildingId}:${floor}`;
      const lock = floorLocks.get(floorKey);
      if (!lock) {
        sendTo(player.id, { type: 'floor_lock_result', success: true, buildingId, floor, action: 'open', unlocked: true });
      } else if (lock.ownerId === player.id) {
        sendTo(player.id, { type: 'floor_lock_result', success: true, buildingId, floor, action: 'owner', unlocked: true });
      } else if (lock.company && player.company && lock.company === player.company) {
        sendTo(player.id, { type: 'floor_lock_result', success: true, buildingId, floor, action: 'company', unlocked: true });
      } else if (lock.password === password) {
        sendTo(player.id, { type: 'floor_lock_result', success: true, buildingId, floor, action: 'unlock', unlocked: true });
      } else {
        sendTo(player.id, { type: 'floor_lock_result', success: false, buildingId, floor, action: 'unlock', error: 'ACCESS DENIED — Wrong password.' });
      }
      break;
    }

    case 'floor_lock_remove': {
      const { buildingId, floor } = msg;
      const floorKey = `${buildingId}:${floor}`;
      const lock = floorLocks.get(floorKey);
      if (!lock) break;
      if (lock.ownerId !== player.id) {
        sendTo(player.id, { type: 'floor_lock_result', success: false, buildingId, floor, error: 'Only the floor admin can remove this lock.' });
        break;
      }
      floorLocks.delete(floorKey);
      sendTo(player.id, { type: 'floor_lock_result', success: true, buildingId, floor, action: 'remove' });
      console.log(`[World] ${player.name} removed floor lock ${floor} of ${buildingId}`);
      break;
    }

    case 'floor_lock_query': {
      const { buildingId } = msg;
      const floors: Record<number, { ownerName: string; company: string; label: string; isOwner: boolean }> = {};
      for (const [key, lock] of floorLocks) {
        if (key.startsWith(`${buildingId}:`)) {
          const fl = parseInt(key.split(':')[1], 10);
          floors[fl] = { ownerName: lock.ownerName, company: lock.company, label: lock.label, isOwner: lock.ownerId === player.id };
        }
      }
      sendTo(player.id, { type: 'floor_lock_status', buildingId, floors });
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
      // Include existing guests as peers too
      const existingGuests = guestRooms.has(roomId) ? Array.from(guestRooms.get(roomId)!).map(g => ({ id: g.id, name: `${g.name} [REMOTE]`, isGuest: true })) : [];
      sendTo(player.id, { type: 'rtc_room_peers', roomId, peers: [...existingPeers.map(pid => ({ id: pid, name: players.get(pid)!.name, isGuest: false })), ...existingGuests] });
      for (const pid of existingPeers) {
        sendTo(pid, { type: 'rtc_peer_joined', roomId, peerId: player.id, peerName: player.name });
      }
      // Notify guests that in-game player joined
      const gRoomAtJoin = guestRooms.get(roomId);
      if (gRoomAtJoin) {
        for (const g of gRoomAtJoin) {
          if (g.ws.readyState === WebSocket.OPEN) {
            g.ws.send(JSON.stringify({ type: 'meet_peer_joined', peerId: player.id, peerName: player.name, isGuest: false }));
          }
        }
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
      // Notify guests that in-game player left
      const gRoomAtLeave = guestRooms.get(roomId);
      if (gRoomAtLeave) {
        for (const g of gRoomAtLeave) {
          if (g.ws.readyState === WebSocket.OPEN) {
            g.ws.send(JSON.stringify({ type: 'meet_peer_left', peerId: player.id }));
          }
        }
      }
      break;
    }

    case 'rtc_signal': {
      const { targetId, signal, roomId } = msg;
      if (!targetId || !signal || !roomId) break;

      // Check if target is a guest connection
      const gRoom = guestRooms.get(roomId);
      if (gRoom) {
        const targetGuest = Array.from(gRoom).find(g => g.id === targetId);
        if (targetGuest) {
          if (targetGuest.ws.readyState === WebSocket.OPEN) {
            targetGuest.ws.send(JSON.stringify({ type: 'meet_signal', fromId: player.id, fromName: player.name, signal, isGuest: false }));
          }
          break;
        }
      }

      const sigRoom = videoRooms.get(roomId);
      if (!sigRoom || !sigRoom.has(player.id) || !sigRoom.has(targetId)) break;
      sendTo(targetId, { type: 'rtc_signal', fromId: player.id, fromName: player.name, signal, roomId });
      break;
    }
  }
};

// Resolve an authenticated user's profile photo from their session cookie on a
// raw upgrade request (req.cookies isn't populated for WS handshakes, so parse
// the cookie header ourselves). Returns null when unauthenticated.
const resolveSessionAvatar = async (req: IncomingMessage): Promise<string | null> => {
  try {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return null;
    const sid = cookieHeader
      .split(';')
      .map(c => c.trim())
      .find(c => c.startsWith(`${SESSION_COOKIE}=`))
      ?.slice(SESSION_COOKIE.length + 1);
    if (!sid) return null;
    const session = await getSession(decodeURIComponent(sid));
    return session?.user?.profileImageUrl ?? null;
  } catch {
    return null;
  }
};

// Resolve the authenticated user id from a raw upgrade request's session cookie.
const resolveSessionUserId = async (req: IncomingMessage): Promise<string | null> => {
  try {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return null;
    const sid = cookieHeader
      .split(';')
      .map(c => c.trim())
      .find(c => c.startsWith(`${SESSION_COOKIE}=`))
      ?.slice(SESSION_COOKIE.length + 1);
    if (!sid) return null;
    const session = await getSession(decodeURIComponent(sid));
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
};

// Live WebSocket population, compared against MAX_PLAYERS for the capacity gate.
export const getWorldPlayerCount = () => players.size;

// Is this user an active member (owner or employee) of ANY organization? Used to
// grant businesses + their employees priority: when a realm is at capacity they
// are still admitted (soft overflow) while unaffiliated arrivals are turned away.
const isActiveOrgMember = async (userId: string): Promise<boolean> => {
  try {
    const rows = await db
      .select({ orgId: orgMembersTable.orgId })
      .from(orgMembersTable)
      .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, 'active')))
      .limit(1);
    return rows.length > 0;
  } catch {
    return false;
  }
};

// ── Heartbeat tracking (REST-based, survives WebSocket routing issues) ───────
const heartbeats = new Map<string, { name: string; ts: number; profileImageUrl: string | null }>();
const HEARTBEAT_TTL_MS = 45_000;

export const recordHeartbeat = (userId: string, name: string, profileImageUrl: string | null = null) => {
  heartbeats.set(userId, { name, ts: Date.now(), profileImageUrl });
};

const pruneHeartbeats = () => {
  const cutoff = Date.now() - HEARTBEAT_TTL_MS;
  for (const [uid, hb] of heartbeats) {
    if (hb.ts < cutoff) heartbeats.delete(uid);
  }
};

setInterval(pruneHeartbeats, 10_000);

export const getHeartbeatCount = () => {
  pruneHeartbeats();
  return heartbeats.size;
};

const simpleHash = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
};

export const getOnlinePlayers = () => {
  const wsList = Array.from(players.values()).map(p => ({
    userId: p.id,
    username: p.name,
    firstName: p.name,
    profileImageUrl: p.profileImageUrl,
    x: p.x,
    y: p.y,
    status: p.paused ? 'idle' : 'active',
    class: p.class,
    company: p.company,
    level: p.level,
    hp: p.hp,
    maxHp: p.maxHp,
    speaking: p.speaking,
    lastAction: p.speaking ? 'Speaking' : p.paused ? 'AFK' : null,
  }));
  pruneHeartbeats();
  const wsNames = new Set(wsList.map(p => p.username.toUpperCase()));
  const hbList = Array.from(heartbeats.entries())
    .filter(([, hb]) => !wsNames.has(hb.name.toUpperCase()))
    .map(([uid, hb]) => {
      const h = simpleHash(uid);
      return {
        userId: uid,
        username: hb.name,
        firstName: hb.name,
        profileImageUrl: hb.profileImageUrl,
        x: 6400 + (Math.sin(h * 0.713) * 800),
        y: 6100 + (Math.cos(h * 0.317) * 400),
        status: 'online' as string,
        class: null as string | null,
        company: null as string | null,
        level: null as number | null,
        hp: null as number | null,
        maxHp: null as number | null,
        speaking: false,
        lastAction: null as string | null,
      };
    });
  return [...wsList, ...hbList];
};

// ── Setup ─────────────────────────────────────────────────────────────────────
export const getServerStatus = () => {
  const wsOnline = players.size;
  const hbOnline = getHeartbeatCount();
  return {
    online: Math.max(wsOnline, hbOnline),
    max: MAX_PLAYERS,
    liberationProgress,
  };
};

export const attachWorldServer = (httpServer: Server) => {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  console.log('[World] WebSocket server attached at /ws');
  loadLiberationProgress();

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    if (players.size >= MAX_PLAYERS) {
      // At capacity: businesses (org owners) and their employees still get in
      // (soft overflow) so a company is never locked out of its own realm.
      // Everyone else is turned away until a slot frees up. The membership
      // lookup runs only on the rare at-cap path, so the happy path stays sync.
      const userId = await resolveSessionUserId(req);
      const isBusinessMember = userId ? await isActiveOrgMember(userId) : false;
      if (!isBusinessMember) {
        ws.send(JSON.stringify({ type: 'server_full', max: MAX_PLAYERS, online: players.size, cityId: SERVER_CITY_ID, region: SERVER_REGION }));
        ws.close(1013, 'Server at capacity');
        console.log(`[World] Connection rejected — at capacity (${MAX_PLAYERS})`);
        return;
      }
      console.log(`[World] Over capacity (${players.size}/${MAX_PLAYERS}) — admitting business member ${userId} (soft overflow)`);
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
    const player: Player = { id, name, class: cls, company, profileImageUrl: null, x: startX, y: startY, speaking: false, ws, hp: maxHp, maxHp, money: startMoney, lastPvpAttack: 0, level: 1, inventory: [], weaponId: 'FISTS', lastPveReward: 0, pveRewardCount: 0, pveRewardWindow: 0, lastPveHeal: 0, ownedWeapons: new Set(['FISTS']), paused: false, killLibContribCount: 0, killLibContribWindow: 0, buildingLibContribCount: 0, buildingLibContribWindow: 0 };
    players.set(id, player);
    console.log(`[World] ${name} joined (${id}), total: ${players.size}/${MAX_PLAYERS}`);

    // Resolve the player's profile photo from their authenticated session
    // (trusted server-side; never from a client-supplied URL). Done async so
    // the connection isn't blocked; the photo appears on the next presence poll.
    void resolveSessionAvatar(req).then(url => { if (url) player.profileImageUrl = url; });

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
      const callPartner = activeCalls.get(id);
      if (callPartner) {
        activeCalls.delete(id);
        activeCalls.delete(callPartner);
        sendTo(callPartner, { type: 'phone_call_ended', peerId: id, peerName: name });
      }
      for (const [key] of pendingCalls) {
        if (key.startsWith(id + '_') || key.endsWith('_' + id)) pendingCalls.delete(key);
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

  // ── Guest meeting WebSocket server (/ws/meet/:code) ─────────────────────
  const guestWss = new WebSocketServer({ noServer: true });
  console.log('[Meet] Guest WebSocket server ready (noServer, handles /ws/meet/* upgrades)');

  // ── Conference video WebSocket server (/ws/conf/:roomName) ───────────────
  const confWss = new WebSocketServer({ noServer: true });
  console.log('[Conf] Conference video WebSocket server ready (noServer, handles /ws/conf/* upgrades)');

  httpServer.on('upgrade', (req, socket, head) => {
    const pathname = req.url?.split('?')[0] ?? '';
    if (pathname.includes('/ws/meet')) {
      guestWss.handleUpgrade(req, socket as any, head, (ws) => {
        guestWss.emit('connection', ws, req);
      });
    } else if (pathname.includes('/ws/conf')) {
      confWss.handleUpgrade(req, socket as any, head, (ws) => {
        confWss.emit('connection', ws, req);
      });
    }
  });

  let guestIdCounter = 0;
  const makeGuestId = () => `g${++guestIdCounter}_${Date.now().toString(36)}`;

  const sendToGuest = (conn: GuestConn, msg: object) => {
    if (conn.ws.readyState === WebSocket.OPEN) conn.ws.send(JSON.stringify(msg));
  };

  guestWss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    const urlPath = req.url ?? '';
    const parts = urlPath.split('?');
    const pathSegments = parts[0].split('/').filter(Boolean);
    const roomCode = pathSegments[pathSegments.length - 1] ?? '';
    const params = new URLSearchParams(parts[1] ?? '');
    const guestName = (params.get('name') ?? 'GUEST').slice(0, 24).toUpperCase();
    const guestToken = params.get('token') ?? '';

    if (!roomCode) {
      ws.send(JSON.stringify({ type: 'error', message: 'Room code required' }));
      ws.close(1008, 'Room code required');
      return;
    }

    // Validate short-lived guest token (preferred) or fall back to DB check
    const tokenClaim = guestToken ? verifyGuestToken(guestToken) : null;
    if (guestToken && !tokenClaim) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid or expired guest token' }));
      ws.close(1008, 'Invalid token');
      return;
    }
    if (tokenClaim && tokenClaim.roomCode !== roomCode) {
      ws.send(JSON.stringify({ type: 'error', message: 'Token room mismatch' }));
      ws.close(1008, 'Room mismatch');
      return;
    }

    // Validate meeting exists and is not expired (always check DB for meeting-level expiry)
    let meeting: any;
    try {
      const rows = await db
        .select()
        .from(meetingsTable)
        .where(and(eq(meetingsTable.roomCode, roomCode), gt(meetingsTable.expiresAt, new Date())));
      meeting = rows[0];
    } catch (err) {
      console.error('[Meet] DB error validating room:', err);
      ws.send(JSON.stringify({ type: 'error', message: 'Server error' }));
      ws.close(1011, 'Server error');
      return;
    }

    if (!meeting) {
      ws.send(JSON.stringify({ type: 'error', message: 'Meeting not found or expired' }));
      ws.close(1008, 'Invalid room');
      return;
    }

    const guestId = makeGuestId();
    const guestConn: GuestConn = { id: guestId, name: guestName, ws, roomCode };

    if (!guestRooms.has(roomCode)) guestRooms.set(roomCode, new Set());
    const guestRoom = guestRooms.get(roomCode)!;
    guestRoom.add(guestConn);

    console.log(`[Meet] Guest ${guestName} (${guestId}) joined room ${roomCode}`);

    // Send welcome with existing participants
    const existingGuests = Array.from(guestRoom).filter(g => g.id !== guestId).map(g => ({ id: g.id, name: g.name, isGuest: true }));
    const inGamePlayers = videoRooms.has(roomCode)
      ? Array.from(videoRooms.get(roomCode)!).filter(pid => players.has(pid)).map(pid => ({ id: pid, name: players.get(pid)!.name, isGuest: false }))
      : [];
    ws.send(JSON.stringify({ type: 'meet_welcome', guestId, guestName, meetingTitle: meeting.title, peers: [...existingGuests, ...inGamePlayers] }));

    // Notify existing guests
    for (const g of guestRoom) {
      if (g.id !== guestId) sendToGuest(g, { type: 'meet_peer_joined', peerId: guestId, peerName: guestName, isGuest: true });
    }

    // Notify in-game players currently in this room's video call
    const inGameRoom = videoRooms.get(roomCode);
    if (inGameRoom) {
      for (const pid of inGameRoom) {
        sendTo(pid, { type: 'rtc_guest_joined', roomId: roomCode, guestId, guestName });
      }
    }

    ws.on('message', (data: Buffer) => {
      let msg: any;
      try { msg = JSON.parse(data.toString()); } catch { return; }

      switch (msg.type) {
        case 'meet_signal': {
          const { targetId, signal } = msg;
          if (!targetId || !signal) break;

          // Try guest-to-guest signal
          const targetGuest = guestRoom ? Array.from(guestRoom).find(g => g.id === targetId) : null;
          if (targetGuest) {
            sendToGuest(targetGuest, { type: 'meet_signal', fromId: guestId, fromName: guestName, signal, isGuest: true });
            break;
          }

          // Try guest-to-player signal (in-game player)
          const inRoom = videoRooms.get(roomCode);
          if (inRoom && inRoom.has(targetId)) {
            sendTo(targetId, { type: 'rtc_signal', fromId: guestId, fromName: `${guestName} [REMOTE]`, signal, roomId: roomCode, isGuest: true });
          }
          break;
        }
        default:
          break;
      }
    });

    ws.on('close', () => {
      guestRoom.delete(guestConn);
      if (guestRoom.size === 0) guestRooms.delete(roomCode);

      // Notify other guests
      for (const g of guestRoom) {
        sendToGuest(g, { type: 'meet_peer_left', peerId: guestId });
      }

      // Notify in-game players
      const inRoom = videoRooms.get(roomCode);
      if (inRoom) {
        for (const pid of inRoom) {
          sendTo(pid, { type: 'rtc_guest_left', roomId: roomCode, guestId, guestName });
        }
      }

      console.log(`[Meet] Guest ${guestName} (${guestId}) left room ${roomCode}`);
    });

    ws.on('error', (err) => console.error(`[Meet] WS error for guest ${guestName}:`, err.message));
  });

  // ── Conference video signaling (/ws/conf/:roomName) ───────────────────────
  // Simple room-scoped WebRTC signaling for browser participants in conference rooms.
  // No meeting DB check required — conference rooms are managed by the phone system.
  interface ConfConn {
    id: string;
    name: string;
    ws: WebSocket;
    roomName: string;
  }
  const confRooms = new Map<string, Set<ConfConn>>();
  let confIdCounter = 0;
  const makeConfId = () => `c${++confIdCounter}_${Date.now().toString(36)}`;

  confWss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const urlPath = req.url ?? '';
    const parts = urlPath.split('?');
    const pathSegments = parts[0].split('/').filter(Boolean);
    const roomName = pathSegments[pathSegments.length - 1] ?? '';
    const params = new URLSearchParams(parts[1] ?? '');
    const participantName = (params.get('name') ?? 'PARTICIPANT').slice(0, 32).toUpperCase();

    if (!roomName) {
      ws.send(JSON.stringify({ type: 'error', message: 'Room name required' }));
      ws.close(1008, 'Room name required');
      return;
    }

    // Classroom live lessons use predictable room ids (`class-<id>`); gate them to
    // authenticated classroom members so a teacher's screen share can't be joined
    // by guessing the room. Other conf rooms (phone system) are unaffected.
    const classMatch = /^class-(\d+)$/.exec(roomName);
    if (classMatch) {
      const classroomId = Number(classMatch[1]);
      void (async () => {
        try {
          const sessionUserId = await resolveSessionUserId(req);
          const access = sessionUserId ? await resolveClassroomLiveAccess(classroomId, sessionUserId) : null;
          if (!access) {
            ws.send(JSON.stringify({ type: 'error', message: 'Not authorized for this classroom' }));
            ws.close(1008, 'Not authorized');
            return;
          }
          // The client may have disconnected while auth resolved; don't add a
          // dead socket to the room (it would leave a stale peer + bad count).
          if (ws.readyState !== WebSocket.OPEN) return;
          joinConfRoom(ws, roomName, participantName);
        } catch {
          ws.close(1011, 'Auth error');
        }
      })();
      return;
    }

    joinConfRoom(ws, roomName, participantName);
  });

  // Add a (already-authorized) socket to a conf room and wire up signaling.
  function joinConfRoom(ws: WebSocket, roomName: string, participantName: string) {
    if (ws.readyState !== WebSocket.OPEN) return;
    const connId = makeConfId();
    const conn: ConfConn = { id: connId, name: participantName, ws, roomName };

    if (!confRooms.has(roomName)) confRooms.set(roomName, new Set());
    const room = confRooms.get(roomName)!;

    const existingPeers = Array.from(room).map(c => ({ id: c.id, name: c.name }));
    room.add(conn);

    console.log(`[Conf] ${participantName} (${connId}) joined conf room ${roomName}`);

    ws.send(JSON.stringify({ type: 'conf_welcome', connId, roomName, peers: existingPeers }));

    for (const c of room) {
      if (c.id !== connId && c.ws.readyState === WebSocket.OPEN) {
        c.ws.send(JSON.stringify({ type: 'conf_peer_joined', peerId: connId, peerName: participantName }));
      }
    }

    ws.on('message', (data: Buffer) => {
      let msg: any;
      try { msg = JSON.parse(data.toString()); } catch { return; }

      if (msg.type === 'conf_signal') {
        const { targetId, signal } = msg;
        if (!targetId || !signal) return;
        const target = Array.from(room).find(c => c.id === targetId);
        if (target && target.ws.readyState === WebSocket.OPEN) {
          target.ws.send(JSON.stringify({
            type: 'conf_signal',
            fromId: connId,
            fromName: participantName,
            signal,
          }));
        }
      }
    });

    ws.on('close', () => {
      room.delete(conn);
      if (room.size === 0) confRooms.delete(roomName);
      for (const c of room) {
        if (c.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({ type: 'conf_peer_left', peerId: connId }));
        }
      }
      console.log(`[Conf] ${participantName} (${connId}) left conf room ${roomName}`);
    });

    ws.on('error', (err) => console.error(`[Conf] WS error for ${participantName}:`, err.message));
  }

  return wss;
};
