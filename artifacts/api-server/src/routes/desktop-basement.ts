import { randomUUID } from "node:crypto";
import { Router } from "express";
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import {
  db,
  desktopBasementAttackEventsTable,
  desktopBasementPestsTable,
  desktopBasementPresenceTable,
  desktopOfficePresenceTable,
  playerInventoryTable,
  playerLoadoutTable,
  towerOperationsStateTable,
  towerRestroomSessionsTable,
  salarymanSavesTable,
  towerStaffAssignmentsTable,
  towerBuildingVitalsTable,
  towerWasteHaulsTable,
} from "@workspace/db";
import { creditFiat } from "../lib/fiat-wallet";
import { advanceTowerFinance } from "../lib/tower-finance";
import { requireDesktopLink } from "../lib/desktop-link-auth";
import {
  BUILDING_PRESENCE_MAX_AGE_MS,
  isNearTowerServiceElevator as isNearTowerServiceElevatorLanding,
  isWalkableBuildingPosition,
} from "../lib/desktop-building-objects";
import { hasTowerStaffAssignment } from "../lib/tower-staff-access";
import {
  TOWER_RESTROOM_STALLS,
  TOWER_SERVICE_ELEVATOR_BASEMENT,
  TOWER_SERVICE_ELEVATOR_LOBBY,
  TOWER_TRASH_BINS,
} from "../lib/tower-basement-layout";
import {
  TOWER_BASEMENT_BACK_ENTRANCE,
  TOWER_BASEMENT_STATIONS,
  TOWER_LOBBY_BACK_ENTRANCE,
} from "../lib/tower-basement-layout";
import {
  getTowerGhostHideout,
  isTowerBasementMazePointWalkable,
  isTowerBasementMazeSegmentWalkable,
} from "../lib/tower-basement-layout";
import {
  advanceTowerOperations,
  towerOperationsSnapshot,
  wasteNpcLocation,
  utilityNpcLocation,
} from "../lib/tower-operations";
import { recordVerifiedCareerWork } from "../lib/career-progression";
import { completeInternalText } from "../lib/internal-ai";

const router = Router();
const BUILDING_KEY = "shadow_tower";
const BASEMENT_SIZE = 10_000;
const B1_WIDTH = 20_000;
const BASEMENT_STAIRS = { x: 5_000, y: 5_000 };
const TOWER_BASEMENT_STAIRWELLS = [
  { x: 49_978_650, y: 50_000_800 },
  { x: 49_975_350, y: 50_000_900 },
] as const;
const BASEMENT_ACCESS_MODE = "stairs";
const BASEMENT_ACCESS_MODE_TEMPORARY = true;
const STAIRS_RADIUS = 800;
const PRESENCE_MAX_AGE_MS = 15_000;
const MAX_MOVEMENT_PER_SECOND = 750;
const ATTACK_RANGE = 500;
const ATTACK_COOLDOWN_MS = 450;
const ENERGY_REGEN_MS = 60_000;
const VITAL_DECAY_INTERVAL_MS = 3 * 24 * 60 * 60 * 1_000;
const NPC_WORK_INTERVAL_MS = 120_000;
const NPC_WORK_DAMAGE = 3;
const WORK_DURATION_MS = 8_000;
const WORK_MAX_AGE_MS = 10 * 60_000;
const CARCASS_CLAIM_MS = 10 * 60_000;
const CARCASS_PICKUP_RADIUS = 500;
const CARCASS_DROP_POINT = { x: 5_000, y: 7_000 };
const CARCASS_DROP_RADIUS = 650;
const RESTROOM_USE_DURATION_MS = 8_000;
const RESTROOM_MAX_AGE_MS = 10 * 60_000;
const RESTROOM_STAMINA_RESTORE = 20;
const TRASH_PICKUP_RADIUS = 500;
const TRASH_DELIVERY_RADIUS = 650;
const TRASH_CARRY_MAX = 5;
const LOADING_GATE_RADIUS = 650;
const B4_SUPPLY_STORE = { level: 4, x: 5_000, y: 6_500 };
const B4_SUPPLY_STORE_RADIUS = 650;
const CARRIED_ITEM_CAPACITY = 24;

const MOVES = {
  stomp_kick: { damage: 18, stamina: 7, range: 500 },
  punch: { damage: 12, stamina: 4, range: 350 },
  side_kick: { damage: 17, stamina: 7, range: 480 },
  roundhouse_kick: { damage: 22, stamina: 9, range: 500 },
  elbow: { damage: 14, stamina: 5, range: 300 },
  biting: { damage: 11, stamina: 5, range: 220 },
  headbutting: { damage: 13, stamina: 6, range: 250 },
  dirty_fighting: { damage: 16, stamina: 8, range: 320 },
  stabbing: { damage: 26, stamina: 12, range: 450, toolRequired: true },
} as const;

type WorkTarget = "power" | "plumbing" | "upkeep";
type VitalRow = typeof towerBuildingVitalsTable.$inferSelect;
type PestRow = typeof desktopBasementPestsTable.$inferSelect;

const WORK_STATIONS: Record<WorkTarget, { level: number; x: number; y: number }> = {
  power: TOWER_BASEMENT_STATIONS.power,
  plumbing: TOWER_BASEMENT_STATIONS.plumbing,
  upkeep: TOWER_BASEMENT_STATIONS.upkeep,
};

const BASEMENT_WAVES: Record<number, Array<{
  kind: "rat" | "snake";
  x: number;
  y: number;
  health: number;
  bountyFiat: number;
}>> = {
  1: [
    { kind: "rat", x: 3_400, y: 4_000, health: 36, bountyFiat: 1_500 },
    { kind: "snake", x: 6_500, y: 6_000, health: 48, bountyFiat: 3_500 },
  ],
  2: [
    { kind: "rat", x: 3_200, y: 6_500, health: 40, bountyFiat: 1_500 },
    { kind: "snake", x: 6_700, y: 3_600, health: 52, bountyFiat: 3_500 },
  ],
  3: [
    { kind: "rat", x: 2_800, y: 3_500, health: 44, bountyFiat: 1_500 },
    { kind: "snake", x: 7_000, y: 6_600, health: 56, bountyFiat: 3_500 },
  ],
  4: [
    { kind: "rat", x: 3_500, y: 6_800, health: 48, bountyFiat: 1_500 },
    { kind: "snake", x: 6_800, y: 3_300, health: 60, bountyFiat: 3_500 },
  ],
  5: [
    { kind: "rat", x: 2_900, y: 3_300, health: 52, bountyFiat: 1_500 },
    { kind: "snake", x: 7_100, y: 6_700, health: 64, bountyFiat: 3_500 },
  ],
  6: [
    { kind: "rat", x: 3_500, y: 7_500, health: 56, bountyFiat: 1_500 },
    { kind: "snake", x: 6_800, y: 3_400, health: 68, bountyFiat: 3_500 },
  ],
};

const API_NPC_CREW = [
  { id: "pest-tech-1", label: "PEST RESPONSE TECH", x: 4_450, y: 4_500, action: "working" },
  { id: "pest-tech-2", label: "PEST RESPONSE TECH", x: 5_500, y: 4_500, action: "working" },
] as const;

function asInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isNearBasementStairs(point: { x: number; y: number }): boolean {
  return distance(point, BASEMENT_STAIRS) <= STAIRS_RADIUS;
}

function isNearBasementServiceElevator(point: { x: number; y: number }): boolean {
  return distance(point, TOWER_SERVICE_ELEVATOR_BASEMENT) <= STAIRS_RADIUS;
}

function isNearBasementBackEntrance(point: { x: number; y: number }): boolean {
  return distance(point, TOWER_BASEMENT_BACK_ENTRANCE) <= STAIRS_RADIUS;
}

function isNearTowerBasementStairs(floorNumber: number, point: { x: number; y: number }): boolean {
  return floorNumber === 1 && TOWER_BASEMENT_STAIRWELLS.some((stairwell) =>
    distance(point, stairwell) <= STAIRS_RADIUS);
}

function isNearTowerBackEntrance(floorNumber: number, point: { x: number; y: number }): boolean {
  return floorNumber === 1 && distance(point, TOWER_LOBBY_BACK_ENTRANCE) <= STAIRS_RADIUS;
}

function positionIsValid(level: number, x: number, y: number): boolean {
  const maxX = level === 1 ? B1_WIDTH : BASEMENT_SIZE;
  return Number.isInteger(x) && Number.isInteger(y)
    && x >= 0 && x <= maxX && y >= 0 && y <= BASEMENT_SIZE
    && isTowerBasementMazePointWalkable(level, x, y);
}

function fresh(lastSeenAt: Date, now: Date): boolean {
  const ageMs = now.getTime() - lastSeenAt.getTime();
  return ageMs >= 0 && ageMs <= PRESENCE_MAX_AGE_MS;
}

function hasFreshOfficePresence(
  presence: typeof desktopOfficePresenceTable.$inferSelect | undefined,
  linkId: string,
  floorNumber: number,
  room: string,
  point: { x: number; y: number },
  now: Date,
  radius: number,
): boolean {
  const ageMs = presence ? now.getTime() - presence.lastSeenAt.getTime() : Number.POSITIVE_INFINITY;
  return Boolean(presence
    && presence.linkId === linkId
    && presence.floorNumber === floorNumber
    && presence.room === room
    && ageMs >= 0
    && ageMs <= BUILDING_PRESENCE_MAX_AGE_MS
    && isWalkableBuildingPosition(room === "hallway" ? "recreation" : room, presence)
    && distance(presence, point) <= radius);
}

function getEnergy(data: Record<string, unknown>, now: Date): { stamina: number; nextData: Record<string, unknown> } {
  const rawEnergy = data.energy;
  const energy = typeof rawEnergy === "number" && Number.isFinite(rawEnergy)
    ? Math.max(0, Math.min(100, Math.floor(rawEnergy)))
    : 100;
  const rawUpdated = data.energyUpdatedAt;
  const previousMs = typeof rawUpdated === "string" ? Date.parse(rawUpdated) : Number.NaN;
  const lastMs = Number.isFinite(previousMs) && previousMs <= now.getTime() ? previousMs : now.getTime();
  const recovered = Math.floor((now.getTime() - lastMs) / ENERGY_REGEN_MS);
  const stamina = Math.min(100, energy + recovered);
  const nextUpdateMs = stamina >= 100 ? now.getTime() : lastMs + recovered * ENERGY_REGEN_MS;
  return {
    stamina,
    nextData: {
      ...data,
      energy: stamina,
      energyUpdatedAt: new Date(nextUpdateMs).toISOString(),
    },
  };
}

function hasPestResponseUniform(data: Record<string, unknown>): boolean {
  return data.pestResponseUniformWorn === true;
}

function vitalValues(row: VitalRow, now: Date) {
  const intervals = Math.max(0, Math.floor((now.getTime() - row.lastTickAt.getTime()) / VITAL_DECAY_INTERVAL_MS));
  const remainingMs = Math.max(0, now.getTime() - row.lastTickAt.getTime()) % VITAL_DECAY_INTERVAL_MS;
  return {
    powerCondition: Math.max(0, row.powerCondition - intervals),
    plumbingCondition: Math.max(0, row.plumbingCondition - intervals),
    upkeepCondition: Math.max(0, row.upkeepCondition - intervals),
    lastTickAt: new Date(now.getTime() - remainingMs),
  };
}

async function ensureVitals(tx: Parameters<Parameters<typeof db.transaction>[0]>[0]): Promise<VitalRow> {
  await tx.insert(towerBuildingVitalsTable).values({ buildingKey: BUILDING_KEY }).onConflictDoNothing();
  const [row] = await tx.select().from(towerBuildingVitalsTable)
    .where(eq(towerBuildingVitalsTable.buildingKey, BUILDING_KEY))
    .for("update")
    .limit(1);
  if (!row) throw new Error("tower vitality row unavailable");
  return row;
}

async function towerWaterOperational(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  now: Date,
): Promise<boolean> {
  const vitals = await ensureVitals(tx);
  const finance = await advanceTowerFinance(tx, now);
  return vitalValues(vitals, now).plumbingCondition > 0 && finance.waterBillPaid;
}

async function ensurePestWave(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], level: number, now: Date): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(${73_812_000 + level})`);
  const rows = await tx.select().from(desktopBasementPestsTable).where(and(
    eq(desktopBasementPestsTable.buildingKey, BUILDING_KEY),
    eq(desktopBasementPestsTable.level, level),
  ));
  if (rows.length === 0) {
    const values = BASEMENT_WAVES[level].map((pest, index) => ({
      buildingKey: BUILDING_KEY,
      level,
      spawnNumber: index + 1,
      kind: pest.kind,
      x: pest.x,
      y: pest.y,
      health: pest.health,
      maxHealth: pest.health,
      bountyFiat: pest.bountyFiat,
      lastNpcWorkedAt: now,
    }));
    await tx.insert(desktopBasementPestsTable).values(values).onConflictDoNothing();
    return;
  }

  const active = rows.some((row) => row.status === "active");
  const allSold = rows.every((row) => row.status === "sold");
  const lastCreatedAt = rows.reduce(
    (latest, row) => Math.max(latest, row.createdAt.getTime()),
    0,
  );
  if (!active && allSold && now.getTime() - lastCreatedAt >= 15 * 60_000) {
    const nextSpawn = rows.reduce((highest, row) => Math.max(highest, row.spawnNumber), 0) + 1;
    const wave = BASEMENT_WAVES[level];
    await tx.insert(desktopBasementPestsTable).values(wave.map((pest, index) => ({
      buildingKey: BUILDING_KEY,
      level,
      spawnNumber: nextSpawn + index,
      kind: pest.kind,
      x: pest.x,
      y: pest.y,
      health: pest.health,
      maxHealth: pest.health,
      bountyFiat: pest.bountyFiat,
      lastNpcWorkedAt: now,
    }))).onConflictDoNothing();
  }
}

async function advanceNpcCrew(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  level: number,
  now: Date,
): Promise<void> {
  const [candidate] = await tx.select().from(desktopBasementPestsTable).where(and(
    eq(desktopBasementPestsTable.buildingKey, BUILDING_KEY),
    eq(desktopBasementPestsTable.level, level),
    eq(desktopBasementPestsTable.status, "active"),
  )).orderBy(desktopBasementPestsTable.createdAt).limit(1);
  if (!candidate || (candidate.lastNpcWorkedAt != null
    && now.getTime() - candidate.lastNpcWorkedAt.getTime() < NPC_WORK_INTERVAL_MS)) return;
  const [pest] = await tx.select().from(desktopBasementPestsTable)
    .where(eq(desktopBasementPestsTable.id, candidate.id))
    .for("update")
    .limit(1);
  if (!pest || pest.status !== "active" || (pest.lastNpcWorkedAt != null
    && now.getTime() - pest.lastNpcWorkedAt.getTime() < NPC_WORK_INTERVAL_MS)) return;

  const health = Math.max(0, pest.health - NPC_WORK_DAMAGE);
  const defeated = health === 0;
  await tx.update(desktopBasementPestsTable).set({
    health,
    status: defeated ? "carcass" : "active",
    defeatedAt: defeated ? now : null,
    defeatedByUserId: null,
    lastNpcWorkedAt: now,
    updatedAt: now,
  }).where(eq(desktopBasementPestsTable.id, pest.id));
}

function serializePest(pest: PestRow, currentUserId: string, now: Date) {
  const claimExpired = pest.claimedAt != null
    && now.getTime() - pest.claimedAt.getTime() > CARCASS_CLAIM_MS;
  return {
    id: pest.id,
    kind: pest.kind,
    x: pest.x,
    y: pest.y,
    health: pest.health,
    maxHealth: pest.maxHealth,
    status: pest.status,
    bountyFiat: pest.bountyFiat,
    claimedByYou: pest.claimedByUserId === currentUserId && !claimExpired,
    carcassClaimed: pest.claimedByUserId != null && !claimExpired,
    defeatedByYou: pest.defeatedByUserId === currentUserId,
    defeatedAt: pest.defeatedAt?.toISOString() ?? null,
  };
}

async function activePresence(userId: string, linkId: string, level?: number) {
  const [presence] = await db.select().from(desktopBasementPresenceTable)
    .where(eq(desktopBasementPresenceTable.userId, userId))
    .limit(1);
  const now = new Date();
  if (!presence || presence.linkId !== linkId || !fresh(presence.lastSeenAt, now)
    || (level != null && presence.level !== level)) return null;
  return presence;
}

router.post("/desktop-building/basement/presence", async (req, res): Promise<void> => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  const level = asInteger(req.body?.level);
  const x = asInteger(req.body?.x);
  const y = asInteger(req.body?.y);
  const action = req.body?.action;
  if (level == null || level < 1 || level > 6 || x == null || y == null || !positionIsValid(level, x, y)
    || !["stand", "walk", "attack", "maintenance"].includes(action)) {
    res.status(400).json({ error: "Provide a valid basement level, position, and action" });
    return;
  }

  const now = new Date();
  try {
    let accessMode: "stairs" | "service_elevator" | "back_entrance" = "stairs";
    const result = await db.transaction(async (tx) => {
      const [previous] = await tx.select().from(desktopBasementPresenceTable)
        .where(eq(desktopBasementPresenceTable.userId, link.userId))
        .for("update")
        .limit(1);
      if (previous && previous.linkId === link.id && fresh(previous.lastSeenAt, now)) {
        if (previous.level !== level) {
          const byStairs = Math.abs(previous.level - level) === 1
            && isNearBasementStairs(previous)
            && isNearBasementStairs({ x, y });
          const byServiceElevator = isNearBasementServiceElevator(previous)
            && isNearBasementServiceElevator({ x, y });
          if (!byStairs && !byServiceElevator) {
            return { error: "Use the basement stairs or service elevator to change levels" } as const;
          }
          if (byServiceElevator && !await hasTowerStaffAssignment(link.userId)) {
            return { error: "The service elevator is restricted to assigned Tower staff" } as const;
          }
          accessMode = byServiceElevator ? "service_elevator" : "stairs";
        } else {
          const elapsedMs = now.getTime() - previous.lastSeenAt.getTime();
          const maxStep = MAX_MOVEMENT_PER_SECOND * Math.max(1, elapsedMs / 1_000) + 350;
          if (distance(previous, { x, y }) > maxStep) {
            return { error: "Basement movement exceeded the walk boundary" } as const;
          }
          if (!isTowerBasementMazeSegmentWalkable(level, previous, { x, y })) {
            return { error: "Basement movement crossed a blocked tunnel wall" } as const;
          }
        }
      } else {
        const [office] = await tx.select().from(desktopOfficePresenceTable)
          .where(eq(desktopOfficePresenceTable.userId, link.userId))
          .for("update")
          .limit(1);
        if (!office || office.linkId !== link.id || !fresh(office.lastSeenAt, now)
          || office.room !== "lobby"
          || (!isNearTowerBasementStairs(office.floorNumber, office)
            && !isNearTowerServiceElevatorLanding(office.floorNumber, office)
            && !isNearTowerBackEntrance(office.floorNumber, office))) {
          return { error: "Approach a lobby stairwell, rear entrance, or service elevator before entering the basement" } as const;
        }
        const enteredByServiceElevator = isNearTowerServiceElevatorLanding(office.floorNumber, office);
        const enteredByBackEntrance = isNearTowerBackEntrance(office.floorNumber, office);
        if (enteredByServiceElevator && !await hasTowerStaffAssignment(link.userId)) {
          return { error: "The service elevator is restricted to assigned Tower staff" } as const;
        }
        accessMode = enteredByServiceElevator
          ? "service_elevator"
          : enteredByBackEntrance
            ? "back_entrance"
            : "stairs";
        if (enteredByServiceElevator
          ? !isNearBasementServiceElevator({ x, y })
          : enteredByBackEntrance
            ? !isNearBasementBackEntrance({ x, y })
            : !isNearBasementStairs({ x, y })) {
          return { error: "Enter B1 beside the selected stairwell, rear entrance, or service elevator" } as const;
        }
      }

      await tx.insert(desktopBasementPresenceTable).values({
        userId: link.userId,
        linkId: link.id,
        level,
        x,
        y,
        action,
        lastSeenAt: now,
      }).onConflictDoUpdate({
        target: desktopBasementPresenceTable.userId,
        set: {
          linkId: link.id,
          level,
          x,
          y,
          action,
          lastSeenAt: now,
        },
      });
      await advanceNpcCrew(tx, level, now);
      return { ok: true as const, accessMode };
    });
    if ("error" in result) {
      res.status(409).json({ error: result.error });
      return;
    }
    res.json({
      ok: true,
      observedAt: now.toISOString(),
      accessMode: result.accessMode,
      accessModeTemporary: BASEMENT_ACCESS_MODE_TEMPORARY,
    });
  } catch (error) {
    req.log.error({ err: error }, "Desktop basement presence update failed");
    res.status(500).json({ error: "Could not update basement presence" });
  }
});

router.post("/desktop-building/basement/exit", async (req, res): Promise<void> => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  const now = new Date();
  try {
    const result = await db.transaction(async (tx) => {
      const [presence] = await tx.select().from(desktopBasementPresenceTable)
        .where(eq(desktopBasementPresenceTable.userId, link.userId))
        .for("update")
        .limit(1);
      if (!presence || presence.linkId !== link.id || presence.level !== 1
        || !fresh(presence.lastSeenAt, now)
        || (!isNearBasementStairs(presence)
          && !isNearBasementServiceElevator(presence)
          && !isNearBasementBackEntrance(presence))) {
        return { error: "Return to B1 stairs, the service elevator, or the rear entrance" } as const;
      }
      if (isNearBasementServiceElevator(presence) && !await hasTowerStaffAssignment(link.userId)) {
        return { error: "The service elevator is restricted to assigned Tower staff" } as const;
      }
      const exitsByBackEntrance = isNearBasementBackEntrance(presence);
      const exitPosition = isNearBasementServiceElevator(presence)
        ? TOWER_SERVICE_ELEVATOR_LOBBY
        : exitsByBackEntrance
          ? TOWER_LOBBY_BACK_ENTRANCE
          : TOWER_BASEMENT_STAIRWELLS[0];
      const [office] = await tx.select().from(desktopOfficePresenceTable)
        .where(eq(desktopOfficePresenceTable.userId, link.userId))
        .for("update")
        .limit(1);
      const city = office?.city ?? "minx_city";
      await tx.insert(desktopOfficePresenceTable).values({
        userId: link.userId,
        linkId: link.id,
        orgId: office?.orgId ?? null,
        floorId: null,
        officeUnitId: null,
        city,
        roomKey: `lobby:${city}`,
        room: "lobby",
        floorNumber: 1,
        x: exitPosition.x,
        y: exitPosition.y,
        action: "stand",
        destinationFloor: null,
        lastSeenAt: now,
      }).onConflictDoUpdate({
        target: desktopOfficePresenceTable.userId,
        set: {
          linkId: link.id,
          floorId: null,
          officeUnitId: null,
          city,
          roomKey: `lobby:${city}`,
          room: "lobby",
          floorNumber: 1,
          x: exitPosition.x,
          y: exitPosition.y,
          action: "stand",
          destinationFloor: null,
          lastSeenAt: now,
        },
      });
      await tx.delete(desktopBasementPresenceTable)
        .where(eq(desktopBasementPresenceTable.userId, link.userId));
      return {
        ok: true as const,
        floor: 1,
        x: exitPosition.x,
        y: exitPosition.y,
        exitVia: exitsByBackEntrance ? "back_entrance" : "lobby",
      };
    });
    if ("error" in result) {
      res.status(409).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (error) {
    req.log.error({ err: error }, "Desktop basement exit failed");
    res.status(500).json({ error: "Could not return to the lobby" });
  }
});

router.post("/desktop-building/basement/uniform", async (req, res): Promise<void> => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  if (typeof req.body?.worn !== "boolean") {
    res.status(400).json({ error: "worn must be a boolean" });
    return;
  }
  try {
    const now = new Date();
    const result = await db.transaction(async (tx) => {
      const [presence] = await tx.select().from(desktopBasementPresenceTable)
        .where(eq(desktopBasementPresenceTable.userId, link.userId))
        .for("update")
        .limit(1);
      const [office] = await tx.select().from(desktopOfficePresenceTable)
        .where(eq(desktopOfficePresenceTable.userId, link.userId))
        .for("update")
        .limit(1);
      const atBasementStation = Boolean(presence && presence.linkId === link.id
        && presence.level === 3 && fresh(presence.lastSeenAt, now)
        && isNearBasementStairs(presence));
      const atLobbyStation = Boolean(office && office.linkId === link.id && office.room === "lobby"
        && fresh(office.lastSeenAt, now)
        && isNearTowerBasementStairs(office.floorNumber, office));
      if (!atBasementStation && !atLobbyStation) {
        return { error: "Use the lobby or B3 response uniform station" } as const;
      }
      const [save] = await tx.select().from(salarymanSavesTable).where(and(
        eq(salarymanSavesTable.userId, link.userId),
        eq(salarymanSavesTable.slotIndex, 0),
      )).for("update").limit(1);
      if (!save) return { error: "Create a character before equipping the uniform" } as const;
      const data = save.data as Record<string, unknown>;
      await tx.update(salarymanSavesTable).set({
        data: { ...data, pestResponseUniformWorn: req.body.worn },
      }).where(eq(salarymanSavesTable.id, save.id));
      return { ok: true as const, uniformWorn: req.body.worn };
    });
    if ("error" in result) {
      res.status(409).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (error) {
    req.log.error({ err: error }, "Desktop pest-response uniform update failed");
    res.status(500).json({ error: "Could not update uniform" });
  }
});

router.get("/desktop-building/basement/snapshot", async (req, res): Promise<void> => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  const level = Number(req.query.level);
  if (!Number.isInteger(level) || level < 1 || level > 6) {
    res.status(400).json({ error: "level must be between 1 and 6" });
    return;
  }
  const now = new Date();
  try {
    const presence = await activePresence(link.userId, link.id, level);
    if (!presence) {
      res.status(409).json({ error: "Basement presence is missing or expired" });
      return;
    }
    const operations = await db.transaction(async (tx) => {
      await ensurePestWave(tx, level, now);
      await ensureVitals(tx);
      return towerOperationsSnapshot(tx, now, link.userId);
    });
    const [vitalsRow] = await db.select().from(towerBuildingVitalsTable)
      .where(eq(towerBuildingVitalsTable.buildingKey, BUILDING_KEY)).limit(1);
    const pests = await db.select().from(desktopBasementPestsTable).where(and(
      eq(desktopBasementPestsTable.buildingKey, BUILDING_KEY),
      eq(desktopBasementPestsTable.level, level),
    )).orderBy(desktopBasementPestsTable.spawnNumber);
    const [save] = await db.select({ data: salarymanSavesTable.data })
      .from(salarymanSavesTable).where(and(
        eq(salarymanSavesTable.userId, link.userId),
        eq(salarymanSavesTable.slotIndex, 0),
      )).limit(1);
    const [activeHaul] = await db.select({ units: towerWasteHaulsTable.units })
      .from(towerWasteHaulsTable).where(and(
        eq(towerWasteHaulsTable.userId, link.userId),
        eq(towerWasteHaulsTable.linkId, link.id),
        isNull(towerWasteHaulsTable.deliveredAt),
      )).limit(1);
    const vitals = vitalsRow ? vitalValues(vitalsRow, now) : null;
    const npcCrew: Array<{ id: string; label: string; x: number; y: number }> = [...API_NPC_CREW];
    const ghostHideout = getTowerGhostHideout(now);
    const ghost = ghostHideout.level === level
      ? {
        id: "tower-ghost",
        label: "THE GHOST",
        x: ghostHideout.x,
        y: ghostHideout.y,
        location: ghostHideout.location,
        neverCaught: true,
      }
      : null;
    const maintenanceRoute = operations.npcs.maintenanceRoute;
    if (maintenanceRoute.floorNumber === level) {
      npcCrew.push({
        id: operations.npcs.generator.id,
        label: `${operations.npcs.generator.name} / ${maintenanceRoute.action}`,
        x: maintenanceRoute.x,
        y: maintenanceRoute.y,
      });
    }
    const wasteRoute = operations.npcs.wasteRoute;
    if (wasteRoute.floorNumber === level) {
      npcCrew.push({
        id: operations.npcs.waste.id,
        label: `${operations.npcs.waste.name} / ${wasteRoute.action}`,
        x: wasteRoute.x,
        y: wasteRoute.y,
      });
    }
    res.json({
      buildingKey: BUILDING_KEY,
      accessMode: BASEMENT_ACCESS_MODE,
      accessModeTemporary: BASEMENT_ACCESS_MODE_TEMPORARY,
      level,
      observedAt: now.toISOString(),
      player: {
        stamina: save ? getEnergy(save.data as Record<string, unknown>, now).stamina : 100,
        uniformWorn: save ? hasPestResponseUniform(save.data as Record<string, unknown>) : false,
        x: presence.x,
        y: presence.y,
        carriedTrash: activeHaul?.units ?? 0,
        backupPowerPowered: operations.backup.currentUserPowered,
      },
      building: vitals ? {
        powerCondition: vitals.powerCondition,
        plumbingCondition: vitals.plumbingCondition,
        upkeepCondition: vitals.upkeepCondition,
        gridPowerOperational: vitals.powerCondition > 0 && operations.finance.powerBillPaid,
        powerOperational: (vitals.powerCondition > 0 && operations.finance.powerBillPaid)
          || operations.backup.poweredInfrastructureUnits > 0,
        emergencyBackupActive: operations.backup.active,
        infrastructureBackupPowered: operations.backup.poweredInfrastructureUnits > 0,
        waterOperational: vitals.plumbingCondition > 0 && operations.finance.waterBillPaid,
      } : null,
      towerOperations: {
        accumulatedTrash: operations.state.accumulatedTrash,
        incomingSupplyCrates: operations.state.incomingSupplyCrates,
        storedSupplyCrates: operations.state.storedSupplyCrates,
        processedTrash: operations.state.processedTrash,
        workSuggestions: operations.workSuggestions,
        operatingBalanceFiat: operations.finance.operatingBalanceFiat,
        powerBillDueFiat: operations.finance.powerBillDueFiat,
        waterBillDueFiat: operations.finance.waterBillDueFiat,
        backupFuelDays: operations.finance.backupFuelDays,
        priceMultiplierPct: operations.finance.priceMultiplierPct,
        backupCustomerUnitsPowered: operations.backup.poweredCustomers,
        backupInfrastructureUnitsPowered: operations.backup.poweredInfrastructureUnits,
      },
      pests: pests.map((pest) => serializePest(pest, link.userId, now)),
      npcCrew,
      ghost,
      carcassDropPoint: CARCASS_DROP_POINT,
      workStations: WORK_STATIONS,
    });
  } catch (error) {
    req.log.error({ err: error }, "Desktop basement snapshot failed");
    res.status(500).json({ error: "Could not load basement state" });
  }
});

router.post("/desktop-building/basement/work-advice", async (req, res): Promise<void> => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  const presence = await activePresence(link.userId, link.id);
  if (!presence) {
    res.status(409).json({ error: "Enter the Tower basement before asking for work advice" });
    return;
  }

  const now = new Date();
  try {
    const operations = await db.transaction(async (tx) => {
      await ensureVitals(tx);
      return towerOperationsSnapshot(tx, now, link.userId);
    });
    const suggestion = operations.workSuggestions[0];
    if (!suggestion) {
      res.json({ answer: "No approved Tower maintenance item currently needs attention." });
      return;
    }

    const completion = await completeInternalText([
      {
        role: "system",
        content: [
          "You are the Tower maintenance adviser inside the SALARYMAN game.",
          "Explain only the provided, server-ranked approved work item in one or two short sentences.",
          "Use only the supplied facts. Do not invent tasks, locations, risks, costs, or game rules.",
          "You have no tools and cannot start work, spend currency, or change game state.",
          "Do not ask the player for personal information or imply that you performed work.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          approvedSuggestion: suggestion,
          powerCondition: operations.vitals?.powerCondition ?? 100,
          plumbingCondition: operations.vitals?.plumbingCondition ?? 100,
          accumulatedTrash: operations.accumulatedTrash,
        }),
      },
    ], { maxTokens: 120 });
    res.json({
      answer: completion.content.replace(/\s+/g, " ").trim().slice(0, 500),
      suggestionId: suggestion.id,
    });
  } catch (error) {
    req.log.error({ err: error }, "Tower work advice generation failed");
    res.status(503).json({ error: "Tower adviser is unavailable right now" });
  }
});

router.post("/desktop-building/restroom/start", async (req, res): Promise<void> => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  const stallKey = req.body?.stallKey;
  const stall = typeof stallKey === "string"
    ? TOWER_RESTROOM_STALLS[stallKey as keyof typeof TOWER_RESTROOM_STALLS]
    : undefined;
  if (!stall) {
    res.status(400).json({ error: "Choose a Tower restroom stall" });
    return;
  }
  const now = new Date();
  try {
    const result = await db.transaction(async (tx) => {
      await tx.delete(towerRestroomSessionsTable).where(lt(
        towerRestroomSessionsTable.startedAt,
        new Date(now.getTime() - RESTROOM_MAX_AGE_MS),
      ));
      const [presence] = await tx.select().from(desktopOfficePresenceTable)
        .where(eq(desktopOfficePresenceTable.userId, link.userId)).for("update").limit(1);
      const presenceRoom = stall.room === "recreation" ? "hallway" : "lobby";
      if (!hasFreshOfficePresence(
        presence,
        link.id,
        stall.floorNumber,
        presenceRoom,
        stall,
        now,
        550,
      )) {
        return { error: "Move beside an open restroom stall first" } as const;
      }
      if (!await towerWaterOperational(tx, now)) {
        await tx.delete(towerRestroomSessionsTable)
          .where(eq(towerRestroomSessionsTable.userId, link.userId));
        return { error: "Tower water is offline; restroom use is unavailable", outage: true } as const;
      }
      const [existing] = await tx.select().from(towerRestroomSessionsTable)
        .where(eq(towerRestroomSessionsTable.userId, link.userId)).for("update").limit(1);
      if (existing) {
        if (existing.linkId === link.id && existing.stallKey === stallKey) {
          return {
            ok: true as const,
            sessionId: existing.sessionId,
            startedAt: existing.startedAt.toISOString(),
            durationMs: RESTROOM_USE_DURATION_MS,
            resumed: true,
          };
        }
        return { error: "Finish the active restroom session on its original device" } as const;
      }
      const [session] = await tx.insert(towerRestroomSessionsTable).values({
        userId: link.userId,
        linkId: link.id,
        floorNumber: stall.floorNumber,
        stallKey,
        startedAt: now,
      }).onConflictDoNothing().returning();
      if (!session) return { error: "That stall is occupied; choose another one" } as const;
      return {
        ok: true as const,
        sessionId: session.sessionId,
        startedAt: session.startedAt.toISOString(),
        durationMs: RESTROOM_USE_DURATION_MS,
        resumed: false,
      };
    });
    if ("error" in result) {
      res.status("outage" in result && result.outage ? 503 : 409).json(result);
      return;
    }
    res.json(result);
  } catch (error) {
    req.log.error({ err: error }, "Desktop restroom session start failed");
    res.status(500).json({ error: "Could not start restroom session" });
  }
});

router.post("/desktop-building/restroom/complete", async (req, res): Promise<void> => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  const sessionId = req.body?.sessionId;
  const stallKey = req.body?.stallKey;
  if (!isUuid(sessionId) || typeof stallKey !== "string"
    || !Object.prototype.hasOwnProperty.call(TOWER_RESTROOM_STALLS, stallKey)) {
    res.status(400).json({ error: "Provide the active restroom session and stall" });
    return;
  }
  const stall = TOWER_RESTROOM_STALLS[stallKey as keyof typeof TOWER_RESTROOM_STALLS];
  const now = new Date();
  try {
    const result = await db.transaction(async (tx) => {
      const [presence] = await tx.select().from(desktopOfficePresenceTable)
        .where(eq(desktopOfficePresenceTable.userId, link.userId)).for("update").limit(1);
      const presenceRoom = stall.room === "recreation" ? "hallway" : "lobby";
      if (!hasFreshOfficePresence(
        presence,
        link.id,
        stall.floorNumber,
        presenceRoom,
        stall,
        now,
        550,
      )) {
        return { error: "Stay inside the same restroom stall until finished" } as const;
      }
      const [session] = await tx.select().from(towerRestroomSessionsTable)
        .where(and(
          eq(towerRestroomSessionsTable.userId, link.userId),
          eq(towerRestroomSessionsTable.linkId, link.id),
          eq(towerRestroomSessionsTable.sessionId, sessionId),
          eq(towerRestroomSessionsTable.stallKey, stallKey),
        )).for("update").limit(1);
      if (!session) return { error: "That restroom session is no longer active" } as const;
      if (!await towerWaterOperational(tx, now)) {
        await tx.delete(towerRestroomSessionsTable)
          .where(eq(towerRestroomSessionsTable.userId, link.userId));
        return { error: "Tower water outage interrupted restroom use", outage: true } as const;
      }
      const elapsedMs = now.getTime() - session.startedAt.getTime();
      if (elapsedMs < RESTROOM_USE_DURATION_MS) {
        return {
          error: "Restroom session is not finished yet",
          remainingMs: RESTROOM_USE_DURATION_MS - elapsedMs,
        } as const;
      }
      if (elapsedMs > RESTROOM_MAX_AGE_MS) {
        await tx.delete(towerRestroomSessionsTable)
          .where(eq(towerRestroomSessionsTable.userId, link.userId));
        return { error: "Restroom session expired; start again" } as const;
      }
      const [save] = await tx.select().from(salarymanSavesTable).where(and(
        eq(salarymanSavesTable.userId, link.userId),
        eq(salarymanSavesTable.slotIndex, 0),
      )).for("update").limit(1);
      if (!save) return { error: "Create a character before using the restroom" } as const;
      const energy = getEnergy(save.data as Record<string, unknown>, now);
      const staminaAfter = Math.min(100, energy.stamina + RESTROOM_STAMINA_RESTORE);
      await tx.update(salarymanSavesTable).set({
        data: { ...energy.nextData, energy: staminaAfter, energyUpdatedAt: now.toISOString() },
      }).where(eq(salarymanSavesTable.id, save.id));
      await tx.delete(towerRestroomSessionsTable)
        .where(eq(towerRestroomSessionsTable.userId, link.userId));
      return {
        ok: true as const,
        completed: true as const,
        staminaBefore: energy.stamina,
        stamina: staminaAfter,
        restored: staminaAfter - energy.stamina,
      };
    });
    if ("error" in result) {
      res.status(result.error === "Create a character before using the restroom" ? 404 : 409).json(result);
      return;
    }
    res.json(result);
  } catch (error) {
    req.log.error({ err: error }, "Desktop restroom session completion failed");
    res.status(500).json({ error: "Could not complete restroom session" });
  }
});

router.post("/desktop-building/waste/pickup", async (req, res): Promise<void> => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  const binId = req.body?.binId;
  if (binId !== "lobby-trash-can" && binId !== "recreation-trash-can") {
    res.status(400).json({ error: "Choose a Tower trash bin" });
    return;
  }
  const now = new Date();
  try {
    const result = await db.transaction(async (tx) => {
      const [presence] = await tx.select().from(desktopOfficePresenceTable)
        .where(eq(desktopOfficePresenceTable.userId, link.userId)).for("update").limit(1);
      const floorNumber = presence?.floorNumber;
      const expectedFloor: 1 | 6 = binId === "lobby-trash-can" ? 1 : 6;
      const bin = TOWER_TRASH_BINS[expectedFloor];
      const room = expectedFloor === 1 ? "lobby" : "hallway";
      if (floorNumber !== expectedFloor || !presence
        || !hasFreshOfficePresence(presence, link.id, expectedFloor, room, bin, now, TRASH_PICKUP_RADIUS)) {
        return { error: "Move beside the correct floor's trash bin first" } as const;
      }
      const [activeHaul] = await tx.select().from(towerWasteHaulsTable).where(and(
        eq(towerWasteHaulsTable.userId, link.userId),
        isNull(towerWasteHaulsTable.deliveredAt),
      )).for("update").limit(1);
      if (activeHaul) return { error: "Deliver the trash you are already carrying" } as const;
      const operations = await advanceTowerOperations(tx, now);
      const units = Math.min(TRASH_CARRY_MAX, operations.state.accumulatedTrash);
      if (units < 1) return { error: "The bin is empty" } as const;
      const [haul] = await tx.insert(towerWasteHaulsTable).values({
        userId: link.userId,
        linkId: link.id,
        units,
        pickedUpFloor: expectedFloor,
        pickedUpAt: now,
      }).onConflictDoNothing().returning();
      if (!haul) return { error: "Deliver the trash you are already carrying" } as const;
      await tx.update(towerOperationsStateTable).set({
        accumulatedTrash: operations.state.accumulatedTrash - units,
        updatedAt: now,
      }).where(eq(towerOperationsStateTable.buildingKey, BUILDING_KEY));
      return { ok: true as const, haulId: haul.id, units, pickedUpFloor: expectedFloor };
    });
    if ("error" in result) {
      res.status("outage" in result && result.outage ? 503 : 409).json(result);
      return;
    }
    res.json(result);
  } catch (error) {
    req.log.error({ err: error }, "Desktop waste pickup failed");
    res.status(500).json({ error: "Could not pick up Tower trash" });
  }
});

router.post("/desktop-building/waste/deliver", async (req, res): Promise<void> => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  const now = new Date();
  try {
    const result = await db.transaction(async (tx) => {
      const [presence] = await tx.select().from(desktopBasementPresenceTable)
        .where(eq(desktopBasementPresenceTable.userId, link.userId)).for("update").limit(1);
      if (!presence || presence.linkId !== link.id || !fresh(presence.lastSeenAt, now)
        || presence.level !== TOWER_BASEMENT_STATIONS.shippingWaste.level
        || distance(presence, TOWER_BASEMENT_STATIONS.shippingWaste) > TRASH_DELIVERY_RADIUS) {
        return { error: "Carry the trash to the rear B1 shipping and waste station" } as const;
      }
      const [haul] = await tx.select().from(towerWasteHaulsTable).where(and(
        eq(towerWasteHaulsTable.userId, link.userId),
        eq(towerWasteHaulsTable.linkId, link.id),
        isNull(towerWasteHaulsTable.deliveredAt),
      )).for("update").limit(1);
      if (!haul) return { error: "You are not carrying a trash load" } as const;
      if (now.getTime() - haul.pickedUpAt.getTime() < 5_000) {
        return { error: "Take the physical route to B1 before delivering" } as const;
      }
      const operations = await advanceTowerOperations(tx, now);
      await tx.update(towerWasteHaulsTable).set({ deliveredAt: now })
        .where(eq(towerWasteHaulsTable.id, haul.id));
      await tx.update(towerOperationsStateTable).set({
        processedTrash: Math.min(1_000_000, operations.state.processedTrash + haul.units),
        updatedAt: now,
      }).where(eq(towerOperationsStateTable.buildingKey, BUILDING_KEY));
      const progression = await recordVerifiedCareerWork(tx, {
        employerKey: "pablo-corp",
        positionKey: "pablo-corp:tower:operations",
        title: "Tower Operations",
        department: "PABLO CORP / SHADOW TOWER",
        userId: link.userId,
        eventKey: `tower-waste-haul:${haul.id}`,
        outputUnits: haul.units,
        startedAt: haul.pickedUpAt,
      }, now);
      return { ok: true as const, deliveredUnits: haul.units, career: progression };
    });
    if ("error" in result) {
      res.status(409).json(result);
      return;
    }
    res.json(result);
  } catch (error) {
    req.log.error({ err: error }, "Desktop waste delivery failed");
    res.status(500).json({ error: "Could not deliver Tower trash" });
  }
});

router.post("/desktop-building/supplies/receive", async (req, res): Promise<void> => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  const now = new Date();
  try {
    const result = await db.transaction(async (tx) => {
      const [presence] = await tx.select().from(desktopBasementPresenceTable)
        .where(eq(desktopBasementPresenceTable.userId, link.userId)).for("update").limit(1);
      if (!presence || presence.linkId !== link.id || !fresh(presence.lastSeenAt, now)
        || presence.level !== TOWER_BASEMENT_STATIONS.loadingGate.level
        || distance(presence, TOWER_BASEMENT_STATIONS.loadingGate) > LOADING_GATE_RADIUS) {
        return { error: "Move to the gated rear B1 loading area" } as const;
      }
      const [assignment] = await tx.select().from(towerStaffAssignmentsTable)
        .where(eq(towerStaffAssignmentsTable.userId, link.userId)).limit(1);
      if (!assignment || !["operations", "maintenance"].includes(assignment.role)) {
        return { error: "The loading gate is restricted to assigned operations or maintenance staff" } as const;
      }
      const operations = await advanceTowerOperations(tx, now);
      if (operations.state.incomingSupplyCrates < 1) {
        return { error: "No incoming supply crates are waiting at the gate" } as const;
      }
      await tx.update(towerOperationsStateTable).set({
        incomingSupplyCrates: operations.state.incomingSupplyCrates - 1,
        storedSupplyCrates: Math.min(1_000_000, operations.state.storedSupplyCrates + 1),
        updatedAt: now,
      }).where(eq(towerOperationsStateTable.buildingKey, BUILDING_KEY));
      return {
        ok: true as const,
        receivedCrates: 1,
        storedSupplyCrates: operations.state.storedSupplyCrates + 1,
        storageLevel: 4,
      };
    });
    if ("error" in result && typeof result.error === "string") {
      res.status(result.error.startsWith("The loading gate") ? 403 : 409).json(result);
      return;
    }
    res.json(result);
  } catch (error) {
    req.log.error({ err: error }, "Desktop supplies receiving failed");
    res.status(500).json({ error: "Could not receive Tower supplies" });
  }
});

router.post("/desktop-building/supplies/issue", async (req, res): Promise<void> => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  const now = new Date();
  try {
    const result = await db.transaction(async (tx) => {
      const [presence] = await tx.select().from(desktopBasementPresenceTable)
        .where(eq(desktopBasementPresenceTable.userId, link.userId)).for("update").limit(1);
      if (!presence || presence.linkId !== link.id || !fresh(presence.lastSeenAt, now)
        || presence.level !== B4_SUPPLY_STORE.level
        || distance(presence, B4_SUPPLY_STORE) > B4_SUPPLY_STORE_RADIUS) {
        return { error: "Move to the B4 vital-supplies issue counter" } as const;
      }
      const [assignment] = await tx.select().from(towerStaffAssignmentsTable)
        .where(eq(towerStaffAssignmentsTable.userId, link.userId)).limit(1);
      if (!assignment || !["operations", "maintenance"].includes(assignment.role)) {
        return { error: "B4 supplies are restricted to assigned operations or maintenance staff" } as const;
      }

      const operations = await advanceTowerOperations(tx, now);
      if (operations.state.storedSupplyCrates < 1) {
        return { error: "B4 vital-supplies storage is empty" } as const;
      }

      const slotIndex = 0;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${link.userId}), ${slotIndex})`);
      const heldItems = await tx.select({ itemId: playerInventoryTable.itemId })
        .from(playerInventoryTable)
        .where(and(
          eq(playerInventoryTable.userId, link.userId),
          eq(playerInventoryTable.slotIndex, slotIndex),
        ));
      const alreadyHasKit = heldItems.some((item) => item.itemId === "tower_clinic_triage_kit");
      if (!alreadyHasKit && heldItems.length >= CARRIED_ITEM_CAPACITY) {
        return { error: "Carried inventory is full; free a slot before collecting supplies" } as const;
      }

      await tx.insert(playerInventoryTable).values({
        userId: link.userId,
        slotIndex,
        itemId: "tower_clinic_triage_kit",
        quantity: 1,
        acquiredVia: "grant",
      }).onConflictDoUpdate({
        target: [playerInventoryTable.userId, playerInventoryTable.slotIndex, playerInventoryTable.itemId],
        set: { quantity: sql`${playerInventoryTable.quantity} + 1` },
      });
      await tx.update(towerOperationsStateTable).set({
        storedSupplyCrates: operations.state.storedSupplyCrates - 1,
        updatedAt: now,
      }).where(eq(towerOperationsStateTable.buildingKey, BUILDING_KEY));

      return {
        ok: true as const,
        itemId: "tower_clinic_triage_kit",
        issued: 1,
        storedSupplyCrates: operations.state.storedSupplyCrates - 1,
      };
    });
    if ("error" in result && typeof result.error === "string") {
      res.status(result.error.startsWith("B4 supplies") ? 403 : 409).json(result);
      return;
    }
    res.json(result);
  } catch (error) {
    req.log.error({ err: error }, "B4 vital-supplies issue failed");
    res.status(500).json({ error: "Could not issue B4 supplies" });
  }
});

router.post("/desktop-building/basement/attack", async (req, res): Promise<void> => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  const pestId = req.body?.pestId;
  const requestId = req.body?.requestId;
  const moveId = req.body?.moveId;
  if (!isUuid(pestId) || !isUuid(requestId) || typeof moveId !== "string"
    || !Object.prototype.hasOwnProperty.call(MOVES, moveId)) {
    res.status(400).json({ error: "Provide a pest ID, request ID, and supported melee move" });
    return;
  }
  const move = MOVES[moveId as keyof typeof MOVES];
  const now = new Date();
  try {
    const result = await db.transaction(async (tx) => {
      const [save] = await tx.select().from(salarymanSavesTable).where(and(
        eq(salarymanSavesTable.userId, link.userId),
        eq(salarymanSavesTable.slotIndex, 0),
      )).for("update").limit(1);
      if (!save) return { error: "Create a character before fighting" } as const;
      const [prior] = await tx.select().from(desktopBasementAttackEventsTable).where(and(
        eq(desktopBasementAttackEventsTable.userId, link.userId),
        eq(desktopBasementAttackEventsTable.requestId, requestId),
      )).limit(1);
      if (prior) {
        const [pest] = await tx.select().from(desktopBasementPestsTable)
          .where(eq(desktopBasementPestsTable.id, prior.pestId)).limit(1);
        return {
          ok: true as const,
          duplicate: true,
          damage: prior.damage,
          stamina: prior.staminaAfter,
          pest: pest ? serializePest(pest, link.userId, now) : null,
        };
      }
      const [presence] = await tx.select().from(desktopBasementPresenceTable)
        .where(eq(desktopBasementPresenceTable.userId, link.userId))
        .for("update").limit(1);
      if (!presence || presence.linkId !== link.id || !fresh(presence.lastSeenAt, now)) {
        return { error: "Basement presence expired" } as const;
      }
      if (presence.workSessionId) return { error: "Finish or leave the current maintenance work first" } as const;
      if ("toolRequired" in move && move.toolRequired) {
        const [weapon] = await tx.select({ itemId: playerLoadoutTable.itemId })
          .from(playerLoadoutTable).where(and(
            eq(playerLoadoutTable.userId, link.userId),
            eq(playerLoadoutTable.slotIndex, 0),
            eq(playerLoadoutTable.equipSlot, "weapon"),
          )).limit(1);
        if (!weapon || !["wpn_service_knife", "wpn_katana"].includes(weapon.itemId)) {
          return { error: "Equip a service knife or katana to use this move" } as const;
        }
      }
      const [pest] = await tx.select().from(desktopBasementPestsTable)
        .where(and(
          eq(desktopBasementPestsTable.id, pestId),
          eq(desktopBasementPestsTable.buildingKey, BUILDING_KEY),
          eq(desktopBasementPestsTable.level, presence.level),
        )).for("update").limit(1);
      if (!pest || pest.status !== "active") return { error: "That pest is no longer active" } as const;
      if (distance(presence, pest) > move.range) return { error: "Move closer to the target" } as const;

      const lastAttack = await tx.select({ createdAt: desktopBasementAttackEventsTable.createdAt })
        .from(desktopBasementAttackEventsTable).where(eq(desktopBasementAttackEventsTable.userId, link.userId))
        .orderBy(desc(desktopBasementAttackEventsTable.createdAt)).limit(1);
      if (lastAttack[0] && now.getTime() - lastAttack[0].createdAt.getTime() < ATTACK_COOLDOWN_MS) {
        return { error: "Recover before making another attack" } as const;
      }

      const currentData = save.data as Record<string, unknown>;
      const energy = getEnergy(currentData, now);
      if (energy.stamina < move.stamina) return { error: "Not enough stamina" } as const;
      const staminaAfter = energy.stamina - move.stamina;
      const data = { ...energy.nextData, energy: staminaAfter, energyUpdatedAt: now.toISOString() };
      const damage = move.damage;
      const health = Math.max(0, pest.health - damage);
      const defeated = health === 0;
      await tx.update(salarymanSavesTable).set({ data })
        .where(eq(salarymanSavesTable.id, save.id));
      await tx.update(desktopBasementPestsTable).set({
        health,
        status: defeated ? "carcass" : "active",
        defeatedByUserId: defeated ? link.userId : pest.defeatedByUserId,
        defeatedAt: defeated ? now : null,
        updatedAt: now,
      }).where(eq(desktopBasementPestsTable.id, pest.id));
      await tx.insert(desktopBasementAttackEventsTable).values({
        userId: link.userId,
        requestId,
        pestId: pest.id,
        moveId,
        damage,
        staminaAfter,
        createdAt: now,
      });
      const [updatedPest] = await tx.select().from(desktopBasementPestsTable)
        .where(eq(desktopBasementPestsTable.id, pest.id)).limit(1);
      return {
        ok: true as const,
        duplicate: false,
        damage,
        stamina: staminaAfter,
        pest: updatedPest ? serializePest(updatedPest, link.userId, now) : null,
      };
    });
    if ("error" in result) {
      res.status(result.error === "Not enough stamina" ? 402 : 409).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (error) {
    req.log.error({ err: error }, "Desktop basement attack failed");
    res.status(500).json({ error: "Could not resolve attack" });
  }
});

router.post("/desktop-building/basement/carcass/claim", async (req, res): Promise<void> => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  const pestId = req.body?.pestId;
  if (!isUuid(pestId)) {
    res.status(400).json({ error: "Provide a valid carcass ID" });
    return;
  }
  const now = new Date();
  try {
    const result = await db.transaction(async (tx) => {
      const [presence] = await tx.select().from(desktopBasementPresenceTable)
        .where(eq(desktopBasementPresenceTable.userId, link.userId)).for("update").limit(1);
      if (!presence || presence.linkId !== link.id || !fresh(presence.lastSeenAt, now)) {
        return { error: "Basement presence expired" } as const;
      }
      const [pest] = await tx.select().from(desktopBasementPestsTable)
        .where(eq(desktopBasementPestsTable.id, pestId)).for("update").limit(1);
      if (!pest || pest.status !== "carcass" || pest.level !== presence.level) {
        return { error: "That carcass is not available here" } as const;
      }
      if (distance(presence, pest) > CARCASS_PICKUP_RADIUS) {
        return { error: "Move closer to the carcass to pick it up" } as const;
      }
      const claimActive = pest.claimedByUserId != null && pest.claimedAt != null
        && now.getTime() - pest.claimedAt.getTime() <= CARCASS_CLAIM_MS;
      if (claimActive && pest.claimedByUserId !== link.userId) {
        return { error: "Another player is carrying that carcass" } as const;
      }
      await tx.update(desktopBasementPestsTable).set({
        claimedByUserId: link.userId,
        claimedAt: now,
        updatedAt: now,
      }).where(eq(desktopBasementPestsTable.id, pest.id));
      return { ok: true as const, pestId: pest.id, bountyFiat: pest.bountyFiat };
    });
    if ("error" in result) {
      res.status(409).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (error) {
    req.log.error({ err: error }, "Desktop basement carcass claim failed");
    res.status(500).json({ error: "Could not claim carcass" });
  }
});

router.post("/desktop-building/basement/carcass/sell", async (req, res): Promise<void> => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  const pestId = req.body?.pestId;
  if (!isUuid(pestId)) {
    res.status(400).json({ error: "Provide a valid carcass ID" });
    return;
  }
  const now = new Date();
  try {
    const result = await db.transaction(async (tx) => {
      const [presence] = await tx.select().from(desktopBasementPresenceTable)
        .where(eq(desktopBasementPresenceTable.userId, link.userId)).for("update").limit(1);
      if (!presence || presence.linkId !== link.id || presence.level !== 3
        || !fresh(presence.lastSeenAt, now)
        || distance(presence, CARCASS_DROP_POINT) > CARCASS_DROP_RADIUS) {
        return { error: "Bring the carcass to the B3 incinerator" } as const;
      }
      const [pest] = await tx.select().from(desktopBasementPestsTable)
        .where(eq(desktopBasementPestsTable.id, pestId)).for("update").limit(1);
      if (!pest || pest.status !== "carcass" || pest.claimedByUserId !== link.userId) {
        return { error: "You are not carrying this carcass" } as const;
      }
      if (pest.claimedAt && now.getTime() - pest.claimedAt.getTime() > CARCASS_CLAIM_MS) {
        return { error: "Carcass claim expired; pick it up again" } as const;
      }
      await tx.update(desktopBasementPestsTable).set({
        status: "sold",
        soldByUserId: link.userId,
        soldAt: now,
        updatedAt: now,
      }).where(eq(desktopBasementPestsTable.id, pest.id));
      const wallet = await creditFiat(tx, {
        userId: link.userId,
        amountFiat: pest.bountyFiat,
        description: `Pest carcass sale (${pest.kind.toUpperCase()})`,
        kind: "world_sale",
        idempotencyKey: `tower-pest-carcass:${pest.id}`,
      });
      return { ok: true as const, bountyFiat: pest.bountyFiat, balanceFiat: wallet.newBalance };
    });
    if ("error" in result) {
      res.status(409).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (error) {
    req.log.error({ err: error }, "Desktop basement carcass sale failed");
    res.status(500).json({ error: "Could not sell carcass" });
  }
});

router.post("/desktop-building/basement/work/start", async (req, res): Promise<void> => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  const target = req.body?.target;
  if (typeof target !== "string" || !Object.prototype.hasOwnProperty.call(WORK_STATIONS, target)) {
    res.status(400).json({ error: "Choose power, plumbing, or upkeep work" });
    return;
  }
  const workTarget = target as WorkTarget;
  const station = WORK_STATIONS[workTarget];
  const now = new Date();
  try {
    const result = await db.transaction(async (tx) => {
      const [presence] = await tx.select().from(desktopBasementPresenceTable)
        .where(eq(desktopBasementPresenceTable.userId, link.userId)).for("update").limit(1);
      if (!presence || presence.linkId !== link.id || !fresh(presence.lastSeenAt, now)
        || presence.level !== station.level || distance(presence, station) > 500) {
        return { error: `Move to the B${station.level} utility station first` } as const;
      }
      const [save] = await tx.select({ data: salarymanSavesTable.data }).from(salarymanSavesTable).where(and(
        eq(salarymanSavesTable.userId, link.userId),
        eq(salarymanSavesTable.slotIndex, 0),
      )).for("update").limit(1);
      if (!save || !hasPestResponseUniform(save.data as Record<string, unknown>)) {
        return { error: "Wear the pest-response work uniform" } as const;
      }
      if (presence.workSessionId && presence.workStartedAt
        && now.getTime() - presence.workStartedAt.getTime() <= WORK_MAX_AGE_MS) {
        return { error: "Finish the current maintenance task first" } as const;
      }
      const workSessionId = randomUUID();
      await tx.update(desktopBasementPresenceTable).set({
        workTarget,
        workSessionId,
        workStartedAt: now,
        action: "maintenance",
      }).where(eq(desktopBasementPresenceTable.userId, link.userId));
      return { ok: true as const, workSessionId, target: workTarget, durationMs: WORK_DURATION_MS };
    });
    if ("error" in result) {
      res.status(409).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (error) {
    req.log.error({ err: error }, "Desktop basement maintenance start failed");
    res.status(500).json({ error: "Could not start utility work" });
  }
});

router.post("/desktop-building/basement/work/complete", async (req, res): Promise<void> => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  const sessionId = req.body?.sessionId;
  if (!isUuid(sessionId)) {
    res.status(400).json({ error: "Provide a valid work session ID" });
    return;
  }
  const now = new Date();
  try {
    const result = await db.transaction(async (tx) => {
      const [presence] = await tx.select().from(desktopBasementPresenceTable)
        .where(eq(desktopBasementPresenceTable.userId, link.userId)).for("update").limit(1);
      if (!presence || presence.linkId !== link.id || !fresh(presence.lastSeenAt, now)) {
        return { error: "Basement presence expired" } as const;
      }
      if (presence.lastCompletedWorkSessionId === sessionId) {
        const [savedVitals] = await tx.select().from(towerBuildingVitalsTable)
          .where(eq(towerBuildingVitalsTable.buildingKey, BUILDING_KEY)).limit(1);
        return { ok: true as const, duplicate: true, building: savedVitals ? vitalValues(savedVitals, now) : null };
      }
      if (presence.workSessionId !== sessionId || !presence.workTarget || !presence.workStartedAt) {
        return { error: "That maintenance session is not active" } as const;
      }
      const target = presence.workTarget as WorkTarget;
      const station = WORK_STATIONS[target];
      if (presence.level !== station.level || distance(presence, station) > 500) {
        return { error: "Stay beside the utility station while working" } as const;
      }
      const elapsedMs = now.getTime() - presence.workStartedAt.getTime();
      if (elapsedMs < WORK_DURATION_MS) {
        return { error: "Maintenance is not finished yet", remainingMs: WORK_DURATION_MS - elapsedMs } as const;
      }
      if (elapsedMs > WORK_MAX_AGE_MS) return { error: "Maintenance session expired" } as const;

      const [save] = await tx.select().from(salarymanSavesTable).where(and(
        eq(salarymanSavesTable.userId, link.userId),
        eq(salarymanSavesTable.slotIndex, 0),
      )).for("update").limit(1);
      if (!save) return { error: "Create a character before doing utility work" } as const;
      const energy = getEnergy(save.data as Record<string, unknown>, now);
      if (!hasPestResponseUniform(save.data as Record<string, unknown>)) {
        return { error: "Wear the pest-response work uniform" } as const;
      }
      if (energy.stamina < 6) return { error: "Not enough stamina" } as const;
      const staminaAfter = energy.stamina - 6;
      await tx.update(salarymanSavesTable).set({
        data: { ...energy.nextData, energy: staminaAfter, energyUpdatedAt: now.toISOString() },
      }).where(eq(salarymanSavesTable.id, save.id));

      const vitalsRow = await ensureVitals(tx);
      const decayed = vitalValues(vitalsRow, now);
      const delta = 12;
      await tx.update(towerBuildingVitalsTable).set({
        powerCondition: target === "power" ? Math.min(100, decayed.powerCondition + delta) : decayed.powerCondition,
        plumbingCondition: target === "plumbing" ? Math.min(100, decayed.plumbingCondition + delta) : decayed.plumbingCondition,
        upkeepCondition: target === "upkeep" ? Math.min(100, decayed.upkeepCondition + delta) : decayed.upkeepCondition,
        lastTickAt: decayed.lastTickAt,
        updatedByUserId: link.userId,
        updatedAt: now,
      }).where(eq(towerBuildingVitalsTable.buildingKey, BUILDING_KEY));
      await tx.update(desktopBasementPresenceTable).set({
        workTarget: null,
        workSessionId: null,
        workStartedAt: null,
        lastCompletedWorkSessionId: sessionId,
        action: "stand",
      }).where(eq(desktopBasementPresenceTable.userId, link.userId));
      const [updated] = await tx.select().from(towerBuildingVitalsTable)
        .where(eq(towerBuildingVitalsTable.buildingKey, BUILDING_KEY)).limit(1);
      const [staffAssignment] = await tx.select().from(towerStaffAssignmentsTable)
        .where(eq(towerStaffAssignmentsTable.userId, link.userId)).limit(1);
      const careerRole = staffAssignment?.role === "maintenance"
        ? "maintenance"
        : "maintenance-worker";
      const careerTitle = careerRole === "maintenance" ? "Tower Maintenance" : "Tower Utility Worker";
      const career = await recordVerifiedCareerWork(tx, {
        employerKey: "pablo-corp",
        positionKey: `pablo-corp:tower:${careerRole}`,
        title: careerTitle,
        department: "PABLO CORP / SHADOW TOWER",
        userId: link.userId,
        eventKey: `tower-utility-work:${sessionId}`,
        outputUnits: delta,
        startedAt: presence.workStartedAt,
      }, now);
      return {
        ok: true as const,
        duplicate: false,
        stamina: staminaAfter,
        target,
        building: updated ? vitalValues(updated, now) : null,
        career,
      };
    });
    if ("error" in result) {
      res.status(result.error === "Not enough stamina" ? 402 : 409).json(result);
      return;
    }
    res.json(result);
  } catch (error) {
    req.log.error({ err: error }, "Desktop basement maintenance completion failed");
    res.status(500).json({ error: "Could not complete utility work" });
  }
});

export default router;
