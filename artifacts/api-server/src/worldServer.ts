import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Server } from 'http';
import { db, meetingsTable, worldKvTable, orgMembersTable, worldBusinessesTable, travelVouchersTable, worldEventsTable, eventResponsesTable } from '@workspace/db';
import { eq, and, gt, ne, isNotNull, sql, inArray } from 'drizzle-orm';
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
  userId?: string;
  name: string;
  class: string;
  company: string;
  cityId: string;
  profileImageUrl: string | null;
  x: number;
  y: number;
  speaking: boolean;
  // Real human players carry a live socket. Server-authoritative bots (Deckard
  // testers) live in the same `players` map with NO socket — they are present to
  // every real client via player_list/player_move but never receive messages.
  ws?: WebSocket;
  isBot?: boolean;
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
  collapsed?: boolean;
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
// ── Basic world-speech moderation ──────────────────────────────────────────
// Masks a small blocklist of slurs/abuse so open-world proximity speech (which
// is broadcast city-wide to everyone) can't be trivially weaponised. Keeps the
// first letter and masks the rest, and survives simple letter-stretching.
// Deliberately conservative — richer filtering and reporting are a later phase.
const MODERATION_PATTERNS: RegExp[] = [
  /\bf+u+c+k+\w*/gi,
  /\bs+h+i+t+\w*/gi,
  /\bb+i+t+c+h+\w*/gi,
  /\bc+u+n+t+\w*/gi,
  /\ba+s+s+h+o+l+e+\w*/gi,
  /\bd+i+c+k+h+e+a+d+\w*/gi,
  /\bn+i+g+g+\w*/gi,
  /\bf+a+g+g+\w*/gi,
  /\br+e+t+a+r+d+\w*/gi,
  /\bk+i+k+e+\b/gi,
  /\bw+h+o+r+e+\w*/gi,
];
const moderateText = (s: string): string => {
  let out = s;
  for (const re of MODERATION_PATTERNS) {
    out = out.replace(re, (w) => (w.length <= 1 ? w : w[0] + '*'.repeat(w.length - 1)));
  }
  return out;
};

const broadcast = (msg: object, exclude?: string) => {
  const data = JSON.stringify(msg);
  for (const [id, p] of players) {
    if (id === exclude) continue;
    if (p.ws?.readyState === WebSocket.OPEN) p.ws.send(data);
  }
};

// City-scoped broadcast: only players currently in `cityId` receive the message.
// Used for presence/movement so each city feels like its own part of the world.
const broadcastCity = (cityId: string, msg: object, exclude?: string) => {
  const data = JSON.stringify(msg);
  for (const [id, p] of players) {
    if (id === exclude) continue;
    if (p.cityId !== cityId) continue;
    if (p.ws?.readyState === WebSocket.OPEN) p.ws.send(data);
  }
};

const broadcastPlayerList = () => {
  // Each player only sees others in their own city.
  for (const [, recip] of players) {
    if (recip.ws?.readyState !== WebSocket.OPEN) continue;
    const list = Array.from(players.values())
      .filter(p => p.cityId === recip.cityId)
      .map(p => ({
        id: p.id, name: p.name, class: p.class, company: p.company,
        x: p.x, y: p.y, speaking: p.speaking, hp: p.hp, maxHp: p.maxHp, paused: p.paused,
      }));
    recip.ws!.send(JSON.stringify({ type: 'player_list', players: list }));
  }
};

const sendTo = (id: string, msg: object) => {
  const p = players.get(id);
  if (p && p.ws?.readyState === WebSocket.OPEN) p.ws.send(JSON.stringify(msg));
};

// ── World Events (in-memory) ───────────────────────────────────────────────────
// Active events per city. DB is written on spawn/resolve; this map drives the
// real-time scheduler and is the source of truth for "is this event still live?"
interface ActiveEvent {
  id: number;
  cityId: string;
  eventType: string;
  locationX: number;
  locationY: number;
  buildingId: string | null;
  rewardFiat: number;
  spawnedAt: number;
  ttlMs: number;
}
const activeWorldEvents = new Map<number, ActiveEvent>();

export const getActiveWorldEvents = (): ActiveEvent[] => Array.from(activeWorldEvents.values());

export const resolveWorldEvent = (eventId: number): void => {
  activeWorldEvents.delete(eventId);
};

/** Send a WS message to a player identified by their auth userId (not connection id). */
export const sendToPlayer = (userId: string, msg: object): void => {
  for (const p of players.values()) {
    if (p.userId === userId && p.ws?.readyState === WebSocket.OPEN) {
      p.ws.send(JSON.stringify(msg));
      return;
    }
  }
};

// ── Event spawn config ────────────────────────────────────────────────────────
const EVENT_TYPES = ['evt_blackout', 'evt_fire', 'evt_medical'] as const;
const EVENT_TTL: Record<string, number> = {
  evt_blackout: 5 * 60 * 1000,
  evt_fire:     3 * 60 * 1000,
  evt_medical:  3 * 60 * 1000,
};
const EVENT_REWARD_RANGE: Record<string, [number, number]> = {
  evt_blackout: [500, 2000],
  evt_fire:     [1000, 3500],
  evt_medical:  [300, 800],
};
const EVENT_BANNER: Record<string, string> = {
  evt_blackout: '> ALERT — GRID DOWN. Power failure reported. Engineers required at the fusebox.',
  evt_fire:     '> ALERT — STRUCTURE FIRE. Building ablaze. Firewatch personnel respond immediately.',
  evt_medical:  '> ALERT — MEDICAL EMERGENCY. Casualty reported. First-aid personnel on scene.',
};
// Downtown area spawn coordinates (x: 5600-7400, y: 5700-6800)
const DOWNTOWN_SPAWN_POOLS = [
  { x: 6200, y: 6100 }, { x: 6500, y: 5900 }, { x: 6800, y: 6300 },
  { x: 7000, y: 6000 }, { x: 6300, y: 6500 }, { x: 7100, y: 6400 },
  { x: 6600, y: 6700 }, { x: 5800, y: 6200 }, { x: 7300, y: 5800 },
];
const MAX_EVENTS_PER_CITY = 2;
const EVENT_SPAWN_CHANCE = 0.35; // ~35% chance each 60s tick when under cap

const spawnWorldEvent = async (cityId: string): Promise<void> => {
  const type = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
  const loc = DOWNTOWN_SPAWN_POOLS[Math.floor(Math.random() * DOWNTOWN_SPAWN_POOLS.length)];
  const [minR, maxR] = EVENT_REWARD_RANGE[type];
  const reward = minR + Math.floor(Math.random() * (maxR - minR + 1));
  try {
    const [inserted] = await db.insert(worldEventsTable).values({
      cityId,
      eventType: type,
      locationX: loc.x + Math.floor(Math.random() * 200 - 100),
      locationY: loc.y + Math.floor(Math.random() * 200 - 100),
      status: 'active',
      rewardFiat: reward,
      resolverUserIds: [],
    }).returning();
    if (!inserted) return;
    const ev: ActiveEvent = {
      id: inserted.id,
      cityId,
      eventType: type,
      locationX: inserted.locationX,
      locationY: inserted.locationY,
      buildingId: inserted.buildingId ?? null,
      rewardFiat: reward,
      spawnedAt: Date.now(),
      ttlMs: EVENT_TTL[type] ?? 3 * 60 * 1000,
    };
    activeWorldEvents.set(ev.id, ev);
    broadcastCity(cityId, {
      type: 'world_event_start',
      id: ev.id,
      eventType: type,
      locationX: ev.locationX,
      locationY: ev.locationY,
      rewardFiat: reward,
      ttlMs: ev.ttlMs,
      banner: EVENT_BANNER[type] ?? '> ALERT — Emergency reported.',
    });
    console.log(`[Events] Spawned ${type} (id=${ev.id}) in ${cityId} @ (${ev.locationX},${ev.locationY}) reward=ƒ${reward}`);
  } catch (err: any) {
    console.error('[Events] Failed to spawn event:', err.message);
  }
};

const expireWorldEvents = async (): Promise<void> => {
  const now = Date.now();
  for (const [id, ev] of activeWorldEvents) {
    if (now - ev.spawnedAt >= ev.ttlMs) {
      activeWorldEvents.delete(id);
      try {
        await db.update(worldEventsTable).set({ status: 'expired', resolvedAt: new Date() }).where(eq(worldEventsTable.id, id));
      } catch {}
      broadcastCity(ev.cityId, { type: 'world_event_resolved', id, expired: true });
      console.log(`[Events] Event ${id} (${ev.eventType}) expired in ${ev.cityId}`);
    }
  }
};

const worldEventTick = async (): Promise<void> => {
  await expireWorldEvents();
  const cityIds = new Set<string>([SERVER_CITY_ID]);
  for (const p of players.values()) if (!p.isBot) cityIds.add(p.cityId);
  for (const cityId of cityIds) {
    const cityActive = Array.from(activeWorldEvents.values()).filter(e => e.cityId === cityId).length;
    if (cityActive < MAX_EVENTS_PER_CITY && Math.random() < EVENT_SPAWN_CHANCE) {
      await spawnWorldEvent(cityId);
    }
  }
};

// ── Per-city property locks ───────────────────────────────────────────────────
// Building/floor locks are keyed per-city so the same map spot can be owned
// independently in each city (e.g. Minx vs Huda). Associates must pay/own in
// EACH city (and each branch = each separate building) to hold property there.
const CITY_LOCK_SEP = '::';
const lockKey = (cityId: string, buildingId: string) => `${cityId}${CITY_LOCK_SEP}${buildingId}`;
const floorLockKey = (cityId: string, buildingId: string, floor: number | string) => `${cityId}${CITY_LOCK_SEP}${buildingId}:${floor}`;

// ── Ownership stats helper ────────────────────────────────────────────────────
// Scoped to a single city — a player only ever sees ownership within their city.
const getOwnershipStats = (cityId: string) => {
  const counts: Record<string, { count: number; company: string; buildings: string[] }> = {};
  const prefix = `${cityId}${CITY_LOCK_SEP}`;
  for (const [key, lock] of buildingLocks) {
    if (!key.startsWith(prefix)) continue;
    if (!lock.ownerName) continue;
    const bid = key.slice(prefix.length);
    if (!counts[lock.ownerName]) counts[lock.ownerName] = { count: 0, company: lock.company, buildings: [] };
    counts[lock.ownerName].count++;
    counts[lock.ownerName].buildings.push(bid);
  }
  return counts;
};

// ── Deckard test-bot subsystem ────────────────────────────────────────────────
// Server-authoritative "maintenance" bots. Whenever a real human is present in a
// city, 3–5 Deckards roam it so the live MMO can be exercised with real networked
// presence + comms (not just a single-client sandbox). They live in the shared
// `players` map with NO socket, so every real client renders them via
// player_list/player_move and anything they "say" travels the real broadcast path
// (proximity_chat → dialog bubbles). They introduce themselves as maintenance on
// first contact, then remember and greet people by name.
const DECKARD_COMPANY = 'PABLO CORP · MAINTENANCE';
const DECKARD_TARGET_MIN = 3;
const DECKARD_TARGET_MAX = 5;
const DECKARD_TICK_MS = 260;          // movement/think cadence
const DECKARD_STEP = 5;               // world units per tick
const DECKARD_UNIT_NAMES = ['DECKARD-7F','DECKARD-2A','DECKARD-9C','DECKARD-4E','DECKARD-1B','DECKARD-6D','DECKARD-3G','DECKARD-8H'];
const DECKARD_INTRO_LINES = [
  "Maintenance. Routine sweep — don't mind me.",
  'PABLO CORP facilities. Just checking the conduits.',
  'Maintenance crew. I have access everywhere, ignore the toolbox.',
  "Don't mind me — running a comms diagnostic on this block.",
];
const DECKARD_BANTER = [
  'Grid pressure nominal on this block.',
  "Seeing any packet drops near the plaza? I'm logging it.",
  "Another quiet shift. Quiet means nothing's on fire.",
  'Comms check — you read me clean?',
  'Conduits are holding. For now.',
];

interface DeckardState { targetX: number; targetY: number; nextSpeakAt: number; }
const deckardState = new Map<string, DeckardState>();
const deckardMet = new Set<string>(); // `${botId}|${otherId}` once they've been introduced
let deckardCounter = 0;

const cityHumanCount = (cityId: string) => {
  let n = 0;
  for (const p of players.values()) if (p.cityId === cityId && !p.isBot) n++;
  return n;
};
const cityDeckards = (cityId: string) =>
  Array.from(players.values()).filter(p => p.cityId === cityId && p.isBot);

const spawnDeckard = (cityId: string) => {
  const id = `deckard_${++deckardCounter}_${Date.now().toString(36)}`;
  const name = DECKARD_UNIT_NAMES[(deckardCounter - 1) % DECKARD_UNIT_NAMES.length];
  // Spawn near an existing human so they're immediately in play; fall back to the
  // default plaza spawn coords used by real connections.
  const humans = Array.from(players.values()).filter(p => p.cityId === cityId && !p.isBot);
  const anchor = humans.length ? humans[Math.floor(Math.random() * humans.length)] : null;
  const x = (anchor ? anchor.x : 820) + (Math.random() * 220 - 110);
  const y = (anchor ? anchor.y : 430) + (Math.random() * 220 - 110);
  const bot: Player = {
    id, name, class: 'replicant', company: DECKARD_COMPANY, cityId,
    profileImageUrl: null, x, y, speaking: false, isBot: true,
    hp: 450, maxHp: 450, money: 0, lastPvpAttack: 0, level: 1, inventory: [],
    weaponId: 'FISTS', lastPveReward: 0, pveRewardCount: 0, pveRewardWindow: 0,
    lastPveHeal: 0, ownedWeapons: new Set(['FISTS']), paused: false,
    killLibContribCount: 0, killLibContribWindow: 0, buildingLibContribCount: 0, buildingLibContribWindow: 0,
  };
  players.set(id, bot);
  deckardState.set(id, { targetX: x, targetY: y, nextSpeakAt: Date.now() + 2500 + Math.random() * 5000 });
  console.log(`[Deckard] ${name} on shift in ${cityId} (${cityDeckards(cityId).length} active)`);
};

const despawnDeckard = (bot: Player) => {
  players.delete(bot.id);
  deckardState.delete(bot.id);
  for (const k of Array.from(deckardMet)) {
    if (k.startsWith(bot.id + '|') || k.endsWith('|' + bot.id)) deckardMet.delete(k);
  }
  broadcastCity(bot.cityId, { type: 'player_left', id: bot.id, name: bot.name });
};

const pickDeckardTarget = (bot: Player): { x: number; y: number } => {
  const humans = Array.from(players.values()).filter(p => p.cityId === bot.cityId && !p.isBot);
  // Tether: if we've drifted far from everyone, head back toward a human so the
  // crew stays where the testing actually happens.
  let nearestHumanDist = Infinity;
  for (const h of humans) nearestHumanDist = Math.min(nearestHumanDist, Math.hypot(h.x - bot.x, h.y - bot.y));
  if (humans.length && (nearestHumanDist > 700 || Math.random() < 0.55)) {
    const h = humans[Math.floor(Math.random() * humans.length)];
    return { x: h.x + (Math.random() * 260 - 130), y: h.y + (Math.random() * 260 - 130) };
  }
  return { x: bot.x + (Math.random() * 360 - 180), y: bot.y + (Math.random() * 360 - 180) };
};

const deckardTick = () => {
  const now = Date.now();
  // 1. Keep the maintenance crew live. The home city (this server's region) is
  //    ALWAYS staffed and never despawned, so the MMO has live networked presence
  //    even with zero humans online. Other cities are staffed only while a real
  //    human is present (and despawned when empty) — this keeps client-supplied
  //    city IDs from accumulating bots forever.
  const cityIds = new Set<string>();
  cityIds.add(SERVER_CITY_ID);
  for (const p of players.values()) cityIds.add(p.cityId);
  let rosterChanged = false;
  for (const cityId of cityIds) {
    const decks = cityDeckards(cityId);
    const keepStaffed = cityId === SERVER_CITY_ID || cityHumanCount(cityId) > 0;
    if (keepStaffed && decks.length < DECKARD_TARGET_MIN) {
      const target = DECKARD_TARGET_MIN + Math.floor(Math.random() * (DECKARD_TARGET_MAX - DECKARD_TARGET_MIN + 1));
      for (let i = decks.length; i < target; i++) spawnDeckard(cityId);
      rosterChanged = true;
    } else if (!keepStaffed && decks.length > 0) {
      for (const b of decks) despawnDeckard(b);
      rosterChanged = true;
    }
  }
  if (rosterChanged) broadcastPlayerList();

  // 2. Move + chatter for every Deckard.
  for (const bot of players.values()) {
    if (!bot.isBot) continue;
    const st = deckardState.get(bot.id);
    if (!st) continue;
    const dx = st.targetX - bot.x, dy = st.targetY - bot.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 8) {
      const t = pickDeckardTarget(bot);
      st.targetX = t.x; st.targetY = t.y;
    } else {
      const step = Math.min(DECKARD_STEP, dist);
      bot.x += (dx / dist) * step;
      bot.y += (dy / dist) * step;
      broadcastCity(bot.cityId, { type: 'player_move', id: bot.id, x: bot.x, y: bot.y, paused: false });
    }

    if (now >= st.nextSpeakAt) {
      st.nextSpeakAt = now + 6000 + Math.random() * 9000;
      let nearest: Player | null = null; let nd = Infinity;
      for (const o of players.values()) {
        if (o.id === bot.id || o.cityId !== bot.cityId) continue;
        const d = Math.hypot(o.x - bot.x, o.y - bot.y);
        if (d < nd) { nd = d; nearest = o; }
      }
      let text: string;
      if (nearest && nd < 280) {
        const key = bot.id + '|' + nearest.id;
        if (!deckardMet.has(key)) {
          deckardMet.add(key);
          text = nearest.isBot
            ? `${nearest.name}. Maintenance shift again, huh.`
            : DECKARD_INTRO_LINES[Math.floor(Math.random() * DECKARD_INTRO_LINES.length)];
        } else {
          text = nearest.isBot
            ? `${nearest.name}, grid's holding.`
            : `${nearest.name} — comms reading clean on my end.`;
        }
      } else {
        text = DECKARD_BANTER[Math.floor(Math.random() * DECKARD_BANTER.length)];
      }
      broadcastCity(bot.cityId, { type: 'proximity_chat', id: bot.id, name: bot.name, text, ts: now });
    }
  }
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
      broadcastCity(player.cityId, { type: 'player_move', id: player.id, x: player.x, y: player.y, paused: player.paused }, player.id);
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
      // Broadcast world time only within the sender's city (each city has its
      // own day/night + weather, so time must not bleed across cities).
      broadcastCity(player.cityId, { type: 'world_time', time: msg.time, calendar: msg.calendar }, player.id);
      break;
    }

    case 'speaking':
      player.speaking = !!msg.speaking;
      broadcastCity(player.cityId, { type: 'player_speaking', id: player.id, speaking: player.speaking }, player.id);
      break;

    case 'voice_join': {
      const nearbyPeers = Array.from(players.values()).filter(p =>
        p.id !== player.id &&
        p.cityId === player.cityId &&
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
      const text = moderateText(String(msg.text).slice(0, 400));
      if (msg.room === 'dm' && msg.toId) {
        const dm = { type: 'chat', room: 'dm', from: player.name, to: msg.toId, text, ts: Date.now() };
        sendTo(msg.toId, dm);
        sendTo(player.id, { ...dm, echo: true });
      } else {
        // World chat is per-city so each city feels like its own place.
        const ts = Date.now();
        broadcastCity(player.cityId, { type: 'chat', room: 'world', from: player.name, text, ts });
        // Also surface it as a proximity dialog bubble above the speaker's head
        // for everyone in the city (sender included — no exclude). Bubbles travel
        // the same path Deckard bots use, so human and bot speech render alike.
        broadcastCity(player.cityId, { type: 'proximity_chat', id: player.id, name: player.name, text, ts });
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
      if (target.cityId !== player.cityId) break;
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
        broadcastCity(player.cityId, {
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
      if (target2.cityId !== player.cityId) break;
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
        broadcastCity(player.cityId, {
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
      const lkey = lockKey(player.cityId, buildingId);
      if (buildingLocks.has(lkey)) {
        const existing = buildingLocks.get(lkey)!;
        if (existing.ownerId !== player.id && existing.password !== msg.currentPassword) {
          sendTo(player.id, { type: 'building_lock_result', success: false, buildingId, error: 'Wrong current password.' });
          break;
        }
      }
      buildingLocks.set(lkey, {
        password,
        ownerId: player.id,
        ownerName: player.name,
        company: player.company,
        message: String(message ?? '').slice(0, 200),
        rentedAt: Date.now(),
      });
      sendTo(player.id, { type: 'building_lock_result', success: true, buildingId, action: 'set' });
      broadcastCity(player.cityId, { type: 'building_locked', buildingId, ownerName: player.name, company: player.company }, player.id);
      broadcastCity(player.cityId, { type: 'ownership_update', stats: getOwnershipStats(player.cityId) });
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
      const lock = buildingLocks.get(lockKey(player.cityId, buildingId));
      if (!lock) {
        sendTo(player.id, { type: 'building_lock_result', success: true, buildingId, action: 'open', unlocked: true });
      } else if (lock.password === password) {
        sendTo(player.id, { type: 'building_lock_result', success: true, buildingId, action: 'unlock', unlocked: true });
      } else {
        sendTo(player.id, { type: 'building_lock_result', success: false, buildingId, action: 'unlock', error: 'ACCESS DENIED — Wrong password.' });
      }
      break;
    }

    case 'player_collapsed_notify': {
      player.collapsed = true;
      broadcastCity(player.cityId, {
        type: 'player_collapsed_ping',
        id: player.id,
        name: player.name,
        x: player.x,
        y: player.y,
      }, player.id);
      break;
    }

    case 'player_stood_up': {
      player.collapsed = false;
      broadcastCity(player.cityId, { type: 'player_revived', id: player.id }, player.id);
      break;
    }

    case 'building_lock_query': {
      const { buildingId } = msg;
      const lock = buildingLocks.get(lockKey(player.cityId, buildingId));
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
      const lkey = lockKey(player.cityId, buildingId);
      const lock = buildingLocks.get(lkey);
      if (!lock) break;
      if (lock.ownerId === player.id || lock.password === password) {
        buildingLocks.delete(lkey);
        sendTo(player.id, { type: 'building_lock_result', success: true, buildingId, action: 'remove' });
        broadcastCity(player.cityId, { type: 'building_unlocked', buildingId }, player.id);
        broadcastCity(player.cityId, { type: 'ownership_update', stats: getOwnershipStats(player.cityId) });
      } else {
        sendTo(player.id, { type: 'building_lock_result', success: false, buildingId, error: 'Not the owner.' });
      }
      break;
    }

    case 'building_set_message': {
      const { buildingId, message } = msg;
      const lock = buildingLocks.get(lockKey(player.cityId, buildingId));
      if (!lock || lock.ownerId !== player.id) break;
      lock.message = String(message ?? '').slice(0, 200);
      sendTo(player.id, { type: 'building_lock_result', success: true, buildingId, action: 'message_set' });
      break;
    }

    case 'floor_lock_set': {
      const { buildingId, floor, password, label } = msg;
      if (!buildingId || floor == null || !password) break;
      const floorKey = floorLockKey(player.cityId, buildingId, floor);
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
      const floorKey = floorLockKey(player.cityId, buildingId, floor);
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
      const floorKey = floorLockKey(player.cityId, buildingId, floor);
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
      const fprefix = `${player.cityId}${CITY_LOCK_SEP}${buildingId}:`;
      for (const [key, lock] of floorLocks) {
        if (key.startsWith(fprefix)) {
          const fl = parseInt(key.slice(fprefix.length), 10);
          floors[fl] = { ownerName: lock.ownerName, company: lock.company, label: lock.label, isOwner: lock.ownerId === player.id };
        }
      }
      sendTo(player.id, { type: 'floor_lock_status', buildingId, floors });
      break;
    }

    case 'request_ownership_stats':
      sendTo(player.id, { type: 'ownership_update', stats: getOwnershipStats(player.cityId) });
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

// Has this user registered a real/in-game business (i.e. finished onboarding as
// an OWNER, not "unemployed")? These are the players we don't want to penalise
// when their proper server is full — they get a free-travel voucher instead.
const isLegitBusinessOwner = async (userId: string): Promise<boolean> => {
  try {
    const rows = await db
      .select({ id: worldBusinessesTable.id })
      .from(worldBusinessesTable)
      .where(and(eq(worldBusinessesTable.userId, userId), ne(worldBusinessesTable.businessType, 'unemployed')))
      .limit(1);
    return rows.length > 0;
  } catch {
    return false;
  }
};

// Issue (or top up) a free intercity-travel voucher. Capped at 1 pending voucher
// per user so a perpetually-full server can't be farmed for unlimited free
// travel — one waiting trip earns at most one free crossing.
const grantTravelVoucher = async (userId: string, reason: string): Promise<boolean> => {
  try {
    await db
      .insert(travelVouchersTable)
      .values({ userId, balance: 1, reason, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: travelVouchersTable.userId,
        set: { balance: sql`LEAST(${travelVouchersTable.balance} + 1, 1)`, reason, updatedAt: new Date() },
      });
    return true;
  } catch (e) {
    console.error('[World] grantTravelVoucher failed:', e);
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
    const params = new URLSearchParams(req.url?.split('?')[1] ?? '');
    const name    = (params.get('name')    ?? 'UNKNOWN').slice(0, 24).toUpperCase();
    const cls     = params.get('class')    ?? 'unknown';
    const company = (params.get('company') ?? '').slice(0, 40).toUpperCase();
    const cityId  = (params.get('city')    ?? SERVER_CITY_ID).slice(0, 40);
    const startX  = parseFloat(params.get('x') ?? '820');
    const startY  = parseFloat(params.get('y') ?? '430');

    // Capacity is per-CITY, not global: each walled city is its own realm with
    // its own MAX_PLAYERS budget, so a packed Minx never locks newcomers out of
    // HUDA. Count only players currently inside the city being joined.
    let cityPop = 0;
    // Deckard test bots must NOT consume real human capacity slots.
    for (const p of players.values()) if (p.cityId === cityId && !p.isBot) cityPop++;
    if (cityPop >= MAX_PLAYERS) {
      // At capacity: businesses (org owners) and their employees still get in
      // (soft overflow) so a company is never locked out of its own realm.
      // Everyone else is turned away until a slot frees up. The membership
      // lookup runs only on the rare at-cap path, so the happy path stays sync.
      const userId = await resolveSessionUserId(req);
      const isBusinessMember = userId ? await isActiveOrgMember(userId) : false;
      if (!isBusinessMember) {
        // Held in the lobby. A registered business owner shouldn't be penalised
        // for their proper server being full — issue a free-travel voucher so
        // they can cross to another city (free) and stay productive while they
        // wait. Non-owners just wait it out.
        let voucherGranted = false;
        if (userId && await isLegitBusinessOwner(userId)) {
          voucherGranted = await grantTravelVoucher(userId, `full:${cityId}`);
        }
        ws.send(JSON.stringify({ type: 'server_full', max: MAX_PLAYERS, online: cityPop, cityId, region: SERVER_REGION, voucherGranted }));
        ws.close(1013, 'Server at capacity');
        console.log(`[World] Connection rejected — ${cityId} at capacity (${MAX_PLAYERS})${voucherGranted ? ' — travel voucher issued to business owner' : ''}`);
        return;
      }
      console.log(`[World] ${cityId} over capacity (${cityPop}/${MAX_PLAYERS}) — admitting business member ${userId} (soft overflow)`);
    }

    const id = makeId();

    const maxHp = CLASS_HP[cls.toLowerCase()] ?? 350;
    const startMoney = CLASS_START_MONEY[cls.toLowerCase()] ?? 50000;
    const player: Player = { id, name, class: cls, company, cityId, profileImageUrl: null, x: startX, y: startY, speaking: false, ws, hp: maxHp, maxHp, money: startMoney, lastPvpAttack: 0, level: 1, inventory: [], weaponId: 'FISTS', lastPveReward: 0, pveRewardCount: 0, pveRewardWindow: 0, lastPveHeal: 0, ownedWeapons: new Set(['FISTS']), paused: false, killLibContribCount: 0, killLibContribWindow: 0, buildingLibContribCount: 0, buildingLibContribWindow: 0 };
    players.set(id, player);
    console.log(`[World] ${name} joined (${id}), total: ${players.size}/${MAX_PLAYERS}`);

    // Resolve the player's profile photo from their authenticated session
    // (trusted server-side; never from a client-supplied URL). Done async so
    // the connection isn't blocked; the photo appears on the next presence poll.
    void resolveSessionAvatar(req).then(url => { if (url) player.profileImageUrl = url; });
    void resolveSessionUserId(req).then(uid => { if (uid) player.userId = uid; });

    // Only this city's locks, re-keyed by raw buildingId so the client is unaware
    // of the per-city composite key.
    const locks: Record<string, { ownerName: string; company: string; message: string }> = {};
    const lockPrefix = `${cityId}${CITY_LOCK_SEP}`;
    buildingLocks.forEach((v, k) => {
      if (!k.startsWith(lockPrefix)) return;
      locks[k.slice(lockPrefix.length)] = { ownerName: v.ownerName, company: v.company, message: v.message };
    });
    const activeEventsForCity = Array.from(activeWorldEvents.values())
      .filter(e => e.cityId === cityId)
      .map(e => ({ id: e.id, eventType: e.eventType, locationX: e.locationX, locationY: e.locationY, rewardFiat: e.rewardFiat, ttlMs: e.ttlMs, spawnedAt: e.spawnedAt, banner: EVENT_BANNER[e.eventType] ?? '' }));
    ws.send(JSON.stringify({
      type: 'welcome',
      id,
      // Per-city count: a player should never perceive other cities' populations.
      // Exclude bots so capacity/headcount reflects real humans only.
      playerCount: Array.from(players.values()).filter(p => p.cityId === cityId && !p.isBot).length,
      maxPlayers: MAX_PLAYERS,
      locks,
      ownershipStats: getOwnershipStats(cityId),
      activeWorldEvents: activeEventsForCity,
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
      // Prune Deckard pair-memory referencing this departing human so it can't
      // grow unbounded across churn while bots persist in a busy city.
      for (const k of Array.from(deckardMet)) {
        if (k.startsWith(id + '|') || k.endsWith('|' + id)) deckardMet.delete(k);
      }
      players.delete(id);
      console.log(`[World] ${name} left, total: ${players.size}`);
      broadcastCity(player.cityId, { type: 'player_left', id, name });
      broadcastPlayerList();
    });

    ws.on('error', (err) => console.error(`[World] WS error for ${name}:`, err.message));
  });

  setInterval(() => {
    for (const [, p] of players) {
      if (p.ws?.readyState === WebSocket.OPEN) p.ws.ping();
    }
  }, 25000);

  // Deckard maintenance crew: keeps 3–5 server-authoritative test bots roaming
  // the home city AROUND THE CLOCK (always staffed, never despawned even with zero
  // humans), plus any other city while a human is present, so the live MMO always
  // has real networked presence/comms to exercise — not just when a human is on.
  setInterval(deckardTick, DECKARD_TICK_MS);

  // ── World Events scheduler (60s cadence) ──────────────────────────────────
  // Spawns active events when under the 2-event cap; expires stale ones.
  setInterval(() => { void worldEventTick(); }, 60_000);

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
