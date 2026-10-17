import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { and, count, desc, eq, gte, inArray, isNotNull, lt, lte, sql } from "drizzle-orm";
import {
  db,
  desktopBuildingObjectStatesTable,
  desktopOfficePresenceTable,
  desktopWorkLeasesTable,
  deviceLinksTable,
  hasRoleAccess,
  orgDoorLocksTable,
  orgMembersTable,
  organizationsTable,
  shadowTowerFloorsTable,
  shadowTowerOfficeUnitsTable,
  towerStaffAssignmentsTable,
  shadowTowerWorkstationAssignmentsTable,
  salarymanSavesTable,
  usersTable,
  type OrgRole,
} from "@workspace/db";
import { canAccess } from "./shadow-tower";
import { canDoInOrg, resolveCurrentOrgId } from "../lib/org-permissions";
import { requireDesktopLink } from "../lib/desktop-link-auth";
import desktopConstructionRouter from "./desktop-construction";
import {
  CLEANLINESS_DECAY_PER_DAY,
  CONDITION_DECAY_PER_DAY,
  decayBuildingScore,
  maintenanceTaskReward,
  needsPublicMaintenance,
  publicMaintenanceDurationMs,
  workProgress,
} from "../lib/maintenance-policy";
import {
  getOrganizationMaintenanceBalance,
  getPublicWorkDemand,
  hasOrganizationMaintenanceFunds,
  hasPublicMaintenanceFunds,
  payOrganizationMaintenanceReward,
  payPublicMaintenanceReward,
} from "../lib/pablo-public-works";
import {
  BUILDING_MAINTAINABLE_OBJECTS,
  BUILDING_OBJECT_DEFAULTS,
  BUILDING_PRESENCE_MAX_AGE_MS,
  PLAYABLE_TOWER_FLOORS,
  buildingObject,
  buildingObjectsForRoom,
  catalogRoomForPresence,
  isNearTowerElevator,
  isNearTowerServiceElevator,
  isNearTowerStairwell,
  isWalkableBuildingPosition,
  validateBuildingPresence,
} from "../lib/desktop-building-objects";
import { hasTowerStaffAssignment, TOWER_STAFF_ROLES } from "../lib/tower-staff-access";
import { spendPlayerStamina } from "../lib/desktop-player-stamina";
import { broadcastOfficePresence } from "../chatServer";

const router = Router();
router.use(desktopConstructionRouter);
const FLOOR_COUNT = 67;
const ONLINE_WINDOW_MS = 45_000;
const HISTORY_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;
const ROOM_FOR_UNIT: Record<number, string> = {
  1: "executive",
  2: "public",
  3: "office_03",
  4: "office_04",
};
const ROOM_LABEL: Record<string, string> = {
  lobby: "BUILDING LOBBY",
  hallway: "SHARED HALLWAY",
  elevator: "ELEVATOR",
  office: "ORGANIZATION OFFICE",
  executive_suite: "EXECUTIVE SUITE",
};
const MAINTENANCE_REACH_PX = 1_250;
const BUILDING_MAINTENANCE_STAMINA_COST = 4;
const PUBLIC_WORK_SESSION_MAX_AGE_MS = 15 * 60 * 1_000;
const PUBLIC_WORK_SLOT_LOCK_KEY = 731_904_218;
const TOWER_STAFF_ACCESS_ERROR = "The service elevator is restricted to assigned Tower staff";

function isTowerStaffManager(email: string | null | undefined): boolean {
  const configuredOwners = (process.env.OWNER_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return !!email && configuredOwners.includes(email.trim().toLowerCase());
}

router.put("/desktop-building/staff/:userId", async (req, res): Promise<void> => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  const userId = typeof req.params.userId === "string" ? req.params.userId.trim() : "";
  const role = req.body?.role;
  if (!userId || userId.length > 128
    || typeof role !== "string"
    || !TOWER_STAFF_ROLES.includes(role as (typeof TOWER_STAFF_ROLES)[number])) {
    res.status(400).json({ error: "Provide a user ID and a valid Tower staff role" });
    return;
  }

  try {
    const [manager] = await db.select({ email: usersTable.email }).from(usersTable)
      .where(eq(usersTable.id, link.userId)).limit(1);
    if (!isTowerStaffManager(manager?.email)) {
      res.status(403).json({ error: "Only configured Tower administrators can assign building staff" });
      return;
    }
    const [target] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.id, userId)).limit(1);
    if (!target) {
      res.status(404).json({ error: "Tower staff user was not found" });
      return;
    }
    await db.insert(towerStaffAssignmentsTable).values({
      userId,
      role,
      assignedByUserId: link.userId,
    }).onConflictDoUpdate({
      target: towerStaffAssignmentsTable.userId,
      set: { role, assignedByUserId: link.userId, updatedAt: new Date() },
    });
    res.json({ ok: true, userId, role });
  } catch (error) {
    req.log.error({ err: error }, "Tower staff assignment failed");
    res.status(500).json({ error: "Could not assign Tower staff" });
  }
});

router.delete("/desktop-building/staff/:userId", async (req, res): Promise<void> => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  const userId = typeof req.params.userId === "string" ? req.params.userId.trim() : "";
  if (!userId || userId.length > 128) {
    res.status(400).json({ error: "Provide a valid Tower staff user ID" });
    return;
  }

  try {
    const [manager] = await db.select({ email: usersTable.email }).from(usersTable)
      .where(eq(usersTable.id, link.userId)).limit(1);
    if (!isTowerStaffManager(manager?.email)) {
      res.status(403).json({ error: "Only configured Tower administrators can revoke building staff" });
      return;
    }
    await db.delete(towerStaffAssignmentsTable)
      .where(eq(towerStaffAssignmentsTable.userId, userId));
    res.json({ ok: true, userId, revoked: true });
  } catch (error) {
    req.log.error({ err: error }, "Tower staff revocation failed");
    res.status(500).json({ error: "Could not revoke Tower staff" });
  }
});

type BuildingScope = {
  presence: typeof desktopOfficePresenceTable.$inferSelect;
  room: string;
  scopeKey: string;
  orgId: number | null;
  ownerUserId: string | null;
};

type BuildingScopeResult =
  | { ok: true; value: BuildingScope }
  | { ok: false; status: 403 | 409; error: string };

async function canEnterExecutiveSuite(
  userId: string,
  office: NonNullable<Awaited<ReturnType<typeof resolveUserOffice>>>,
): Promise<boolean> {
  if (office.ownerUserId === userId) return true;
  if (office.orgId == null) return false;
  const doorKey = `${office.key}:suite`;
  const [lock] = await db.select().from(orgDoorLocksTable).where(and(
    eq(orgDoorLocksTable.orgId, office.orgId),
    eq(orgDoorLocksTable.doorKey, doorKey),
  )).limit(1);
  if (!lock) return true;
  const [member] = await db.select({
    role: orgMembersTable.role,
    status: orgMembersTable.status,
  }).from(orgMembersTable).where(and(
    eq(orgMembersTable.orgId, office.orgId),
    eq(orgMembersTable.userId, userId),
  )).limit(1);
  return member?.status === "active"
    && hasRoleAccess(member.role as OrgRole, lock.minRole as OrgRole);
}

async function resolveBuildingScope(
  link: { id: string; userId: string },
  password: unknown,
): Promise<BuildingScopeResult> {
  const [presence] = await db.select().from(desktopOfficePresenceTable)
    .where(eq(desktopOfficePresenceTable.userId, link.userId))
    .limit(1);
  if (!presence || presence.linkId !== link.id
    || presence.floorNumber < 1 || presence.floorNumber > FLOOR_COUNT
    || !PLAYABLE_TOWER_FLOORS.has(presence.floorNumber)
    || presence.room === "elevator"
    || Date.now() - presence.lastSeenAt.getTime() > BUILDING_PRESENCE_MAX_AGE_MS) {
    return { ok: false, status: 409, error: "Fresh building presence is required" };
  }

  const isOfficePresence = presence.room === "office" || presence.room === "executive_suite";
  const ownOffice = isOfficePresence
    ? await resolveUserOffice(link.userId, password, presence.floorNumber)
    : null;
  if (isOfficePresence && (!ownOffice
    || ownOffice.floor.floorNumber !== presence.floorNumber
    || (presence.room === "office" && ownOffice.key !== presence.roomKey)
    || (presence.room === "executive_suite" && `${ownOffice.key}:suite` !== presence.roomKey)
    || ownOffice.city !== presence.city)) {
    return { ok: false, status: 403, error: "Authorized organization office access is required" };
  }
  if (presence.room === "executive_suite"
    && (presence.floorNumber !== 1 || ownOffice?.room !== "executive")) {
    return { ok: false, status: 403, error: "The executive suite is only available in Office 01 on Floor 1" };
  }
  if (presence.room === "lobby" && presence.floorNumber !== 1) {
    return { ok: false, status: 403, error: "The building lobby is on Floor 1" };
  }
  if (presence.room === "hallway" && presence.floorNumber >= 6) {
    const orgId = await resolveCurrentOrgId(link.userId);
    const floorOffice = await resolveUserOffice(link.userId, password, presence.floorNumber);
    const assignedWorkstation = floorOffice
      ? null
      : await resolveUserWorkstation(link.userId, orgId, presence.floorNumber);
    const hasOfficeAccess = floorOffice?.floor.floorNumber === presence.floorNumber
      && floorOffice.city === presence.city;
    const hasWorkstationAccess = assignedWorkstation?.floor.floorNumber === presence.floorNumber
      && assignedWorkstation.floor.city === presence.city;
    if (!hasOfficeAccess && !hasWorkstationAccess) {
      return { ok: false, status: 403, error: "An assigned office or workstation is required for this floor" };
    }
  }
  const room = catalogRoomForPresence(
    presence.room as "lobby" | "hallway" | "office" | "executive_suite",
    ownOffice?.room ?? null,
  );
  if (!room || !isWalkableBuildingPosition(room, { x: presence.x, y: presence.y })) {
    return { ok: false, status: 409, error: "Fresh, valid building room presence is required" };
  }
  const scopeKey = isOfficePresence
    ? `${ownOffice!.key}:floor:${presence.floorNumber}:unit:${ownOffice!.unit.unitNumber}${presence.room === "executive_suite" ? ":suite" : ""}`
    : `tower:${presence.city}:floor:${presence.floorNumber}:${presence.roomKey}`;
  return {
    ok: true,
    value: {
      presence,
      room,
      scopeKey,
      orgId: isOfficePresence ? ownOffice!.orgId : null,
      ownerUserId: isOfficePresence ? ownOffice!.ownerUserId : null,
    },
  };
}

function serializeBuildingObject(
  object: (typeof BUILDING_MAINTAINABLE_OBJECTS)[number],
  floorNumber: number,
  saved?: typeof desktopBuildingObjectStatesTable.$inferSelect,
  options: {
    publicWork?: boolean;
    publicSlotsAvailable?: boolean;
    publicPoolBalanceFiat?: number;
    privateOrganizationWork?: boolean;
    organizationBalanceFiat?: number;
    payerLabel?: string | null;
    nowMs?: number;
  } = {},
) {
  const nowMs = options.nowMs ?? Date.now();
  const cleanliness = decayBuildingScore(
    saved?.cleanliness ?? BUILDING_OBJECT_DEFAULTS.cleanliness,
    saved?.lastCleanedAt ?? saved?.createdAt,
    CLEANLINESS_DECAY_PER_DAY,
    nowMs,
  );
  const condition = decayBuildingScore(
    saved?.condition ?? BUILDING_OBJECT_DEFAULTS.condition,
    saved?.lastMaintainedAt ?? saved?.createdAt,
    CONDITION_DECAY_PER_DAY,
    nowMs,
  );
  const workStartedAt = saved?.workStartedAt ?? null;
  const workIsActive = Boolean(saved?.workSessionId && saved?.workAction && workStartedAt);
  const progress = workIsActive
    ? workProgress(workStartedAt!, saved!.workDurationMs, nowMs)
    : 0;
  const activeWork = workIsActive
    ? {
      action: saved!.workAction,
      progress,
      startedAt: workStartedAt!.toISOString(),
      durationMs: saved!.workDurationMs,
      rewardFiat: saved!.workRewardFiat,
      payer: options.payerLabel ?? null,
      waitingForPayment: progress >= 1,
    }
    : null;
  const cleanRewardFiat = maintenanceTaskReward(cleanliness);
  const repairRewardFiat = maintenanceTaskReward(condition);
  const canFundClean = options.publicWork
    ? Boolean(options.publicSlotsAvailable && (options.publicPoolBalanceFiat ?? 0) >= cleanRewardFiat)
    : Boolean(options.privateOrganizationWork && (options.organizationBalanceFiat ?? 0) >= cleanRewardFiat);
  const canFundRepair = options.publicWork
    ? Boolean(options.publicSlotsAvailable && (options.publicPoolBalanceFiat ?? 0) >= repairRewardFiat)
    : Boolean(options.privateOrganizationWork && (options.organizationBalanceFiat ?? 0) >= repairRewardFiat);
  const cleanAvailable = Boolean(!workIsActive && canFundClean && needsPublicMaintenance(cleanliness));
  const repairAvailable = Boolean(!workIsActive && canFundRepair && needsPublicMaintenance(condition));
  const maintenanceWork = {
    cleanAvailable,
    cleanRewardFiat: cleanAvailable ? cleanRewardFiat : 0,
    repairAvailable,
    repairRewardFiat: repairAvailable ? repairRewardFiat : 0,
    payerLabel: options.payerLabel ?? null,
  };
  return {
    objectId: object.id,
    room: object.room,
    label: object.label,
    floorNumber,
    cleanliness,
    condition,
    updatedAt: saved?.updatedAt.toISOString() ?? null,
    lastCleanedAt: (saved?.lastCleanedAt ?? null)?.toISOString() ?? null,
    lastMaintainedAt: (saved?.lastMaintainedAt ?? null)?.toISOString() ?? null,
    activeWork,
    maintenanceWork,
    publicWork: maintenanceWork,
  };
}

function isPublicTowerWork(scope: BuildingScope): boolean {
  return scope.orgId === null
    && scope.presence.floorNumber <= 4
    && (scope.presence.room === "lobby" || scope.presence.room === "hallway");
}

function clearActiveWorkFields() {
  return {
    workSessionId: null,
    workAction: null,
    workUserId: null,
    workStartedAt: null,
    workDurationMs: 0,
    workRewardFiat: 0,
  };
}

function personName(user: { firstName: string | null; lastName: string | null; username: string | null }): string {
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.username || "Employee";
}

function officeKey(orgId: number | null, ownerUserId: string | null): string | null {
  if (orgId != null) return `org:${orgId}`;
  if (ownerUserId) return `personal:${ownerUserId}`;
  return null;
}

function officeRoomForUnit(unitNumber: number): string {
  return ROOM_FOR_UNIT[unitNumber] ?? "executive";
}

async function activeOfficeRows() {
  const rows = await db.select({
    unit: shadowTowerOfficeUnitsTable,
    floor: shadowTowerFloorsTable,
    orgName: organizationsTable.name,
  }).from(shadowTowerOfficeUnitsTable)
    .innerJoin(shadowTowerFloorsTable, eq(shadowTowerOfficeUnitsTable.floorId, shadowTowerFloorsTable.id))
    .leftJoin(
      organizationsTable,
      sql`${organizationsTable.id} = coalesce(${shadowTowerOfficeUnitsTable.orgId}, ${shadowTowerFloorsTable.orgId})`,
    )
    .where(inArray(shadowTowerOfficeUnitsTable.status, ["occupied", "owner_priority"]));
  const now = new Date();
  return rows
    .filter(({ unit, floor }) =>
      (!unit.leaseExpiresAt || unit.leaseExpiresAt > now)
      && (!floor.leaseExpiresAt || floor.leaseExpiresAt > now)
      && (unit.status === "occupied" || unit.unitNumber <= floor.officeCount))
    .sort((a, b) =>
      a.floor.city.localeCompare(b.floor.city)
      || a.floor.floorNumber - b.floor.floorNumber
      || a.unit.unitNumber - b.unit.unitNumber);
}

type ActiveOfficeRow = Awaited<ReturnType<typeof activeOfficeRows>>[number];

function rowOfficeKey(row: ActiveOfficeRow): string | null {
  return officeKey(row.unit.orgId ?? row.floor.orgId, row.unit.ownerUserId ?? row.floor.ownerUserId);
}

async function resolveUserOffice(userId: string, password?: unknown, floorNumber?: number) {
  const orgId = await resolveCurrentOrgId(userId);
  const rows = await activeOfficeRows();
  const canManageOrgOffice = orgId != null
    && (await canDoInOrg(userId, orgId, "org.settings")).allowed;
  const candidates = rows.filter((row) => {
    const effectiveOrgId = row.unit.orgId ?? row.floor.orgId;
    const effectiveOwner = row.unit.ownerUserId ?? row.floor.ownerUserId;
    return (floorNumber == null || row.floor.floorNumber === floorNumber) && (orgId != null
      ? (effectiveOrgId === orgId && canManageOrgOffice) || effectiveOwner === userId
      : effectiveOwner === userId);
  });
  for (const row of candidates) {
    if (!await canAccess(userId, row.floor, password)) continue;
    const orgIdForRoom = row.unit.orgId ?? row.floor.orgId;
    const ownerUserId = row.unit.ownerUserId ?? row.floor.ownerUserId;
    const key = officeKey(orgIdForRoom, ownerUserId);
    if (!key) continue;
    return {
      key,
      orgId: orgIdForRoom ?? null,
      ownerUserId: orgIdForRoom == null ? ownerUserId : null,
      city: row.floor.city,
      floor: row.floor,
      unit: row.unit,
      room: officeRoomForUnit(row.unit.unitNumber),
      label: orgIdForRoom != null ? row.orgName ?? `ORG ${orgIdForRoom}` : "PRIVATE OFFICE",
    };
  }
  return null;
}

async function resolveUserWorkstation(userId: string, orgId: number | null, floorNumber?: number) {
  const assignments = await db.select({
    assignment: shadowTowerWorkstationAssignmentsTable,
    floor: shadowTowerFloorsTable,
  }).from(shadowTowerWorkstationAssignmentsTable)
    .innerJoin(shadowTowerFloorsTable, eq(shadowTowerWorkstationAssignmentsTable.floorId, shadowTowerFloorsTable.id))
    .where(and(
      eq(shadowTowerWorkstationAssignmentsTable.assigneeType, "human"),
      eq(shadowTowerWorkstationAssignmentsTable.assigneeUserId, userId),
    ));
  const now = new Date();
  const eligible = assignments
    .filter(({ floor }) =>
      (!floor.leaseExpiresAt || floor.leaseExpiresAt > now)
      && (floorNumber == null || floor.floorNumber === floorNumber)
      && (floor.ownerUserId === userId || (orgId != null && floor.orgId === orgId)))
    .sort((a, b) => b.assignment.createdAt.getTime() - a.assignment.createdAt.getTime());
  return eligible[0] ?? null;
}

async function getOrgPresence(orgId: number, now: Date) {
  const rows = await db.select({
    userId: desktopOfficePresenceTable.userId,
    room: desktopOfficePresenceTable.room,
    floorNumber: desktopOfficePresenceTable.floorNumber,
    action: desktopOfficePresenceTable.action,
    destinationFloor: desktopOfficePresenceTable.destinationFloor,
    lastSeenAt: desktopOfficePresenceTable.lastSeenAt,
    firstName: usersTable.firstName,
    lastName: usersTable.lastName,
    username: usersTable.username,
    linkStatus: deviceLinksTable.status,
  }).from(desktopOfficePresenceTable)
    .innerJoin(usersTable, eq(usersTable.id, desktopOfficePresenceTable.userId))
    .leftJoin(deviceLinksTable, eq(deviceLinksTable.id, desktopOfficePresenceTable.linkId))
    .where(and(
      eq(desktopOfficePresenceTable.orgId, orgId),
      gte(desktopOfficePresenceTable.lastSeenAt, new Date(now.getTime() - HISTORY_WINDOW_MS)),
    ))
    .orderBy(desc(desktopOfficePresenceTable.lastSeenAt));
  const [org] = await db.select({ ownerUserId: organizationsTable.ownerUserId })
    .from(organizationsTable).where(eq(organizationsTable.id, orgId)).limit(1);
  const members = await db.select({ userId: orgMembersTable.userId })
    .from(orgMembersTable).where(and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.status, "active")));
  const eligible = new Set(members.map((member) => member.userId));
  if (org?.ownerUserId) eligible.add(org.ownerUserId);
  return rows.filter((row) => eligible.has(row.userId)).map((row) => ({
    userId: row.userId,
    name: personName(row),
    room: row.room,
    roomLabel: ROOM_LABEL[row.room] ?? "OFFICE",
    floorNumber: row.floorNumber,
    action: row.action,
    destinationFloor: row.destinationFloor,
    lastSeenAt: row.lastSeenAt.toISOString(),
    online: row.linkStatus === "linked" && now.getTime() - row.lastSeenAt.getTime() <= ONLINE_WINDOW_MS,
  }));
}

async function getElevatorPassengers(city: string, now: Date, currentUserId?: string) {
  const rows = await db.select({
    userId: desktopOfficePresenceTable.userId,
    floorNumber: desktopOfficePresenceTable.floorNumber,
    destinationFloor: desktopOfficePresenceTable.destinationFloor,
    lastSeenAt: desktopOfficePresenceTable.lastSeenAt,
    firstName: usersTable.firstName,
    lastName: usersTable.lastName,
    username: usersTable.username,
    linkStatus: deviceLinksTable.status,
  }).from(desktopOfficePresenceTable)
    .innerJoin(usersTable, eq(usersTable.id, desktopOfficePresenceTable.userId))
    .innerJoin(deviceLinksTable, eq(deviceLinksTable.id, desktopOfficePresenceTable.linkId))
    .where(and(
      eq(desktopOfficePresenceTable.city, city),
      eq(desktopOfficePresenceTable.room, "elevator"),
      gte(desktopOfficePresenceTable.lastSeenAt, new Date(now.getTime() - ONLINE_WINDOW_MS)),
      eq(deviceLinksTable.status, "linked"),
    ))
    .orderBy(desc(desktopOfficePresenceTable.lastSeenAt));
  return rows.filter((row) => row.userId !== currentUserId).map((row) => ({
    name: personName(row),
    floorNumber: row.floorNumber,
    destinationFloor: row.destinationFloor,
    lastSeenAt: row.lastSeenAt.toISOString(),
  }));
}

function safeOffice(row: ActiveOfficeRow, currentOfficeKey: string | null) {
  const orgId = row.unit.orgId ?? row.floor.orgId;
  const ownerUserId = row.unit.ownerUserId ?? row.floor.ownerUserId;
  const key = officeKey(orgId ?? null, ownerUserId ?? null);
  return {
    roomKey: key,
    room: officeRoomForUnit(row.unit.unitNumber),
    unitNumber: row.unit.unitNumber,
    floorNumber: row.floor.floorNumber,
    orgName: row.orgName,
    label: orgId != null ? row.orgName ?? `ORG ${orgId}` : "PRIVATE OFFICE",
    mine: key != null && key === currentOfficeKey,
  };
}

router.get("/desktop-building/snapshot", async (req, res): Promise<void> => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  try {
    const requestedFloor = req.query.floorNumber == null
      ? null
      : Number(req.query.floorNumber);
    if (requestedFloor != null && (!Number.isInteger(requestedFloor) || requestedFloor < 1 || requestedFloor > FLOOR_COUNT)) {
      res.status(400).json({ error: "floorNumber must be between 1 and 67" });
      return;
    }
    const password = req.header("x-shadow-tower-password");
    const primaryOffice = await resolveUserOffice(link.userId, password);
    const orgId = primaryOffice?.orgId ?? await resolveCurrentOrgId(link.userId);
    const primaryWorkstation = primaryOffice
      ? null
      : await resolveUserWorkstation(link.userId, orgId);
    const ownOffice = requestedFloor == null
      ? primaryOffice
      : await resolveUserOffice(link.userId, password, requestedFloor);
    const assignedWorkstation = ownOffice
      ? null
      : requestedFloor == null
        ? primaryWorkstation
        : await resolveUserWorkstation(link.userId, orgId, requestedFloor);
    const initialVisit = requestedFloor == null;
    const floorNumber = requestedFloor ?? ownOffice?.floor.floorNumber ?? assignedWorkstation?.floor.floorNumber ?? 1;
    const city = ownOffice?.city
      ?? assignedWorkstation?.floor.city
      ?? primaryOffice?.city
      ?? primaryWorkstation?.floor.city
      ?? "minx_city";
    const rows = (await activeOfficeRows()).filter((row) =>
      row.floor.city === city && row.floor.floorNumber === floorNumber);
    const seenKeys = new Set<string>();
    const offices = rows
      .filter((row) => {
        const key = rowOfficeKey(row);
        if (!key || seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
      })
      .map((row) => safeOffice(row, ownOffice?.key ?? null));
    const now = new Date();
    const canViewPrivateOffice = orgId != null
      && (await canDoInOrg(link.userId, orgId, "org.settings")).allowed;
    const teammates = orgId == null ? [] : (await getOrgPresence(orgId, now))
      .filter((person) => person.userId !== link.userId && (canViewPrivateOffice || person.room !== "office"));
    res.json({
      userId: link.userId,
      city,
      floorNumber,
      start: initialVisit && ownOffice
        ? { room: "office", officeRoom: ownOffice.room, roomKey: ownOffice.key, floorNumber: ownOffice.floor.floorNumber }
        : initialVisit && assignedWorkstation
          ? { room: "hallway", floorNumber: assignedWorkstation.floor.floorNumber }
          : { room: floorNumber === 1 ? "lobby" : "hallway", floorNumber },
      office: ownOffice ? {
        roomKey: ownOffice.key,
        room: ownOffice.room,
        floorId: ownOffice.floor.id,
        unitId: ownOffice.unit.id,
        floorNumber: ownOffice.floor.floorNumber,
        unitNumber: ownOffice.unit.unitNumber,
        orgId: ownOffice.orgId,
        label: ownOffice.label,
      } : null,
      assignedWorkstation: assignedWorkstation ? {
        floorId: assignedWorkstation.floor.id,
        floorNumber: assignedWorkstation.floor.floorNumber,
        city: assignedWorkstation.floor.city,
        workstationKey: assignedWorkstation.assignment.workstationKey,
      } : null,
      offices,
      teammates,
      elevator: {
        passengers: await getElevatorPassengers(city, now, link.userId),
      },
    });
  } catch (error) {
    req.log.error({ err: error }, "Desktop building snapshot failed");
    res.status(500).json({ error: "Could not load the desktop building" });
  }
});

router.get("/desktop-building/office-monitor", async (req, res): Promise<void> => {
  if (!req.isAuthenticated?.() || !req.user?.id) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const userId = String(req.user.id);
  try {
    const orgId = await resolveCurrentOrgId(userId);
    if (orgId == null) {
      res.status(403).json({ error: "Join an organization to view its office monitor" });
      return;
    }
    const [org] = await db.select({ ownerUserId: organizationsTable.ownerUserId })
      .from(organizationsTable).where(eq(organizationsTable.id, orgId)).limit(1);
    const [membership] = await db.select({
      role: orgMembersTable.role,
      status: orgMembersTable.status,
    }).from(orgMembersTable).where(and(
      eq(orgMembersTable.orgId, orgId),
      eq(orgMembersTable.userId, userId),
    )).limit(1);
    if (org?.ownerUserId !== userId && membership?.status !== "active") {
      res.status(403).json({ error: "Active organization membership is required" });
      return;
    }
    const viewerRole = org?.ownerUserId === userId ? "owner" : membership!.role as OrgRole;
    const viewerIsManagement = hasRoleAccess(viewerRole, "manager");
    const now = new Date();
    const rows = await db.select({
      userId: desktopOfficePresenceTable.userId,
      roomKey: desktopOfficePresenceTable.roomKey,
      floorNumber: desktopOfficePresenceTable.floorNumber,
      x: desktopOfficePresenceTable.x,
      y: desktopOfficePresenceTable.y,
      action: desktopOfficePresenceTable.action,
      lastSeenAt: desktopOfficePresenceTable.lastSeenAt,
      role: orgMembersTable.role,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      username: usersTable.username,
      avatarUrl: usersTable.profileImageUrl,
    }).from(desktopOfficePresenceTable)
      .innerJoin(orgMembersTable, and(
        eq(orgMembersTable.orgId, desktopOfficePresenceTable.orgId),
        eq(orgMembersTable.userId, desktopOfficePresenceTable.userId),
        eq(orgMembersTable.status, "active"),
      ))
      .innerJoin(usersTable, eq(usersTable.id, desktopOfficePresenceTable.userId))
      .where(and(
        eq(desktopOfficePresenceTable.orgId, orgId),
        eq(desktopOfficePresenceTable.room, "office"),
        gte(desktopOfficePresenceTable.lastSeenAt, new Date(now.getTime() - 15_000)),
      ));
    const people = rows.filter((person) =>
      viewerIsManagement || !hasRoleAccess(person.role as OrgRole, "manager"))
      .map((person) => ({
        userId: person.userId,
        name: [person.firstName, person.lastName].filter(Boolean).join(" ").trim()
          || person.username || "Employee",
        role: person.role,
        roomKey: person.roomKey,
        floorNumber: person.floorNumber,
        x: person.x,
        y: person.y,
        action: person.action,
        avatarUrl: person.avatarUrl,
        lastSeenAt: person.lastSeenAt.toISOString(),
      }));
    res.json({
      orgId,
      observedAt: now.toISOString(),
      people,
      permissions: {
        canViewManagement: viewerIsManagement,
        canViewPeers: true,
      },
    });
  } catch (error) {
    req.log.error({ err: error }, "Browser office monitor snapshot failed");
    res.status(500).json({ error: "Could not load the office monitor" });
  }
});

router.post("/desktop-building/presence", async (req, res): Promise<void> => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  const room = req.body?.room;
  const floorNumber = Number(req.body?.floorNumber);
  const x = Number(req.body?.x);
  const y = Number(req.body?.y);
  const action = req.body?.action;
  const destinationFloor = req.body?.destinationFloor == null ? null : Number(req.body.destinationFloor);
  if (!["lobby", "hallway", "elevator", "office", "executive_suite"].includes(room)
    || !Number.isInteger(floorNumber) || floorNumber < 1 || floorNumber > FLOOR_COUNT
    || !Number.isInteger(x) || x < 0 || x > 100_000_000
    || !Number.isInteger(y) || y < 0 || y > 100_000_000
    || !["stand", "walk", "sit", "sleep", "ride"].includes(action)
    || (room === "elevator" && action !== "ride")
    || (room === "elevator" && (!Number.isInteger(destinationFloor) || destinationFloor! < 1 || destinationFloor! > FLOOR_COUNT))) {
    res.status(400).json({ error: "Invalid desktop building presence" });
    return;
  }
  if (!PLAYABLE_TOWER_FLOORS.has(floorNumber)
    || (room === "elevator" && !PLAYABLE_TOWER_FLOORS.has(destinationFloor!))
    || (room === "elevator" && destinationFloor === floorNumber)) {
    res.status(403).json({ error: "That floor is under construction or is already selected" });
    return;
  }
  try {
    const currentOrgId = await resolveCurrentOrgId(link.userId);
    const password = req.header("x-shadow-tower-password");
    const accessFloorNumber = room === "elevator" ? destinationFloor! : floorNumber;
    const ownOffice = await resolveUserOffice(link.userId, password, accessFloorNumber);
    const assignedWorkstation = ownOffice
      ? null
      : await resolveUserWorkstation(link.userId, currentOrgId, accessFloorNumber);
    if (room === "office" && (!ownOffice || ownOffice.floor.floorNumber !== floorNumber)) {
      res.status(403).json({ error: "An authorized organization office is required to enter this room" });
      return;
    }
    if (room === "executive_suite"
      && (!ownOffice || ownOffice.floor.floorNumber !== 6 || ownOffice.room !== "executive")) {
      res.status(403).json({ error: "The executive suite is only available in Office 01 on Floor 6" });
      return;
    }
    if (room === "executive_suite" && !await canEnterExecutiveSuite(link.userId, ownOffice!)) {
      res.status(403).json({ error: "Your organization role does not allow access to the executive suite" });
      return;
    }
    if (room === "lobby" && floorNumber !== 1) {
      res.status(400).json({ error: "The lobby is on floor 1" });
      return;
    }
    if (room === "hallway" && floorNumber < 6 && !(floorNumber >= 2 && floorNumber <= 5)) {
      res.status(403).json({ error: "No walkable hallway is available on this floor" });
      return;
    }
    if (room === "elevator" && destinationFloor! >= 6
      && ownOffice?.floor.floorNumber !== destinationFloor
      && assignedWorkstation?.floor.floorNumber !== destinationFloor) {
      res.status(403).json({ error: "An assigned office or workstation is required for Floor 06" });
      return;
    }
    if (room === "hallway" && floorNumber === 6
      && ownOffice?.floor.floorNumber !== floorNumber
      && assignedWorkstation?.floor.floorNumber !== floorNumber) {
      res.status(403).json({ error: "An assigned office or workstation is required for this floor" });
      return;
    }
    const primaryOffice = ownOffice ?? await resolveUserOffice(link.userId, password);
    const primaryWorkstation = assignedWorkstation ?? (primaryOffice
      ? null
      : await resolveUserWorkstation(link.userId, currentOrgId));
    const city = ownOffice?.city
      ?? assignedWorkstation?.floor.city
      ?? primaryOffice?.city
      ?? primaryWorkstation?.floor.city
      ?? "minx_city";
    const roomKey = room === "office"
      ? ownOffice!.key
      : room === "executive_suite"
        ? `${ownOffice!.key}:suite`
      : room === "lobby"
        ? `lobby:${city}`
        : room === "hallway"
          ? `hallway:${city}:${floorNumber}`
          : `elevator:${city}`;
    const now = new Date();
    const isWorkPresence = action === "sit"
      && ((room === "office" && ownOffice?.floor.floorNumber === floorNumber)
        || (room === "hallway" && assignedWorkstation?.floor.floorNumber === floorNumber));
    let presenceValidationError: string | null = null;
    await db.transaction(async (tx) => {
      const [previousPresence] = await tx.select().from(desktopOfficePresenceTable)
        .where(eq(desktopOfficePresenceTable.userId, link.userId))
        .for("update")
        .limit(1);
      if (room === "elevator") {
        const expectedOriginRoom = floorNumber === 1 ? "lobby" : "hallway";
        const ageMs = previousPresence
          ? now.getTime() - previousPresence.lastSeenAt.getTime()
          : null;
        if (!previousPresence
          || previousPresence.linkId !== link.id
          || previousPresence.floorNumber !== floorNumber
          || previousPresence.room !== expectedOriginRoom
          || ageMs == null || ageMs < 0 || ageMs > BUILDING_PRESENCE_MAX_AGE_MS) {
          presenceValidationError = "Approach the elevator from the lobby or Floor 06 hallway";
        } else if (isNearTowerServiceElevator(floorNumber, previousPresence)
          !== isNearTowerServiceElevator(floorNumber, { x, y })) {
          presenceValidationError = "Enter and leave through the same elevator landing";
        } else if (isNearTowerServiceElevator(floorNumber, previousPresence)
          && !await hasTowerStaffAssignment(link.userId)) {
          presenceValidationError = TOWER_STAFF_ACCESS_ERROR;
        } else if (!isNearTowerElevator(floorNumber, previousPresence)
          || !isNearTowerElevator(floorNumber, { x, y })) {
          presenceValidationError = "Stand beside the elevator before selecting a floor";
        }
      } else {
        const arrivedFromServiceElevator = previousPresence?.room === "elevator"
          && isNearTowerServiceElevator(previousPresence.floorNumber, previousPresence);
        if (arrivedFromServiceElevator && !await hasTowerStaffAssignment(link.userId)) {
          presenceValidationError = TOWER_STAFF_ACCESS_ERROR;
        } else {
          presenceValidationError = validateBuildingPresence(
            previousPresence ?? null,
            {
              room: room as "lobby" | "hallway" | "office" | "executive_suite",
              roomKey,
              floorNumber,
              linkId: link.id,
              x,
              y,
            },
            now,
            ownOffice?.room ?? null,
          );
        }
      }
      if (presenceValidationError) return;

      await tx.insert(desktopOfficePresenceTable).values({
        userId: link.userId,
        linkId: link.id,
        orgId: ownOffice?.orgId ?? currentOrgId,
        floorId: ownOffice?.floor.id ?? assignedWorkstation?.floor.id ?? null,
        officeUnitId: ownOffice?.unit.id ?? null,
        city,
        roomKey,
        room,
        floorNumber,
        x,
        y,
        action,
        destinationFloor: room === "elevator" ? destinationFloor : null,
        lastSeenAt: now,
      }).onConflictDoUpdate({
        target: desktopOfficePresenceTable.userId,
        set: {
          linkId: link.id,
          orgId: ownOffice?.orgId ?? currentOrgId,
          floorId: ownOffice?.floor.id ?? assignedWorkstation?.floor.id ?? null,
          officeUnitId: ownOffice?.unit.id ?? null,
          city,
          roomKey,
          room,
          floorNumber,
          x,
          y,
          action,
          destinationFloor: room === "elevator" ? destinationFloor : null,
          lastSeenAt: now,
        },
      });

      const [lease] = await tx.select().from(desktopWorkLeasesTable).where(and(
        eq(desktopWorkLeasesTable.linkId, link.id),
        eq(desktopWorkLeasesTable.status, "active"),
        gte(desktopWorkLeasesTable.expiresAt, now),
      )).for("update").limit(1);
      if (!lease) return;

      const gapMs = lease.presenceLastSeenAt
        ? now.getTime() - lease.presenceLastSeenAt.getTime()
        : null;
      const verifiedDeltaSeconds = isWorkPresence && gapMs != null && gapMs > 0 && gapMs <= ONLINE_WINDOW_MS
        ? Math.floor(gapMs / 1_000)
        : 0;
      await tx.update(desktopWorkLeasesTable).set({
        verifiedSeconds: Math.min(lease.maxMinutes * 60, lease.verifiedSeconds + verifiedDeltaSeconds),
        presenceLastSeenAt: isWorkPresence ? now : null,
      }).where(eq(desktopWorkLeasesTable.id, lease.id));
    });
    if (presenceValidationError) {
      res.status(409).json({ error: presenceValidationError });
      return;
    }
    const presenceOrgId = ownOffice?.orgId ?? currentOrgId;
    if (room === "office" && presenceOrgId != null) {
      await broadcastOfficePresence({
        orgId: presenceOrgId,
        userId: link.userId,
        roomKey,
        floorNumber,
        x,
        y,
        action,
        observedAt: now.toISOString(),
      });
    }
    res.json({ ok: true, observedAt: now.toISOString(), roomKey, workPresence: isWorkPresence });
  } catch (error) {
    req.log.error({ err: error }, "Desktop building presence update failed");
    res.status(500).json({ error: "Could not update desktop presence" });
  }
});

router.post("/desktop-building/stairs", async (req, res): Promise<void> => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  const destinationFloor = Number(req.body?.destinationFloor);
  const stairwell = Number(req.body?.stairwell);
  if (!Number.isInteger(destinationFloor) || !PLAYABLE_TOWER_FLOORS.has(destinationFloor)
    || !Number.isInteger(stairwell) || (stairwell !== 1 && stairwell !== 2)) {
    res.status(400).json({ error: "Choose a valid adjacent floor and stairwell" });
    return;
  }
  const now = new Date();
  try {
    if (destinationFloor === 6) {
      const currentOrgId = await resolveCurrentOrgId(link.userId);
      const ownOffice = await resolveUserOffice(
        link.userId,
        req.header("x-shadow-tower-password"),
        destinationFloor,
      );
      const assignedWorkstation = ownOffice
        ? null
        : await resolveUserWorkstation(link.userId, currentOrgId, destinationFloor);
      if (!ownOffice && !assignedWorkstation) {
        res.status(403).json({ error: "An assigned office or workstation is required for Floor 06" });
        return;
      }
    }
    const result = await db.transaction(async (tx) => {
      const [presence] = await tx.select().from(desktopOfficePresenceTable)
        .where(eq(desktopOfficePresenceTable.userId, link.userId))
        .for("update").limit(1);
      if (!presence || presence.linkId !== link.id
        || !PLAYABLE_TOWER_FLOORS.has(presence.floorNumber)
        || now.getTime() - presence.lastSeenAt.getTime() < 0
        || now.getTime() - presence.lastSeenAt.getTime() > BUILDING_PRESENCE_MAX_AGE_MS) {
        return { error: "Fresh building presence is required before using the stairwell" } as const;
      }
      if (Math.abs(presence.floorNumber - destinationFloor) !== 1) {
        return { error: "Stairwells connect only adjacent open floors" } as const;
      }
      if (!isNearTowerStairwell(presence.floorNumber, presence, stairwell)) {
        return { error: "Approach the selected stairwell first" } as const;
      }
      await tx.update(desktopOfficePresenceTable).set({
        action: "stair",
        destinationFloor,
        lastSeenAt: now,
      }).where(eq(desktopOfficePresenceTable.userId, link.userId));
      return { ok: true as const, destinationFloor };
    });
    if ("error" in result) {
      res.status(409).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (error) {
    req.log.error({ err: error }, "Tower stairwell authorization failed");
    res.status(500).json({ error: "Could not authorize stairwell travel" });
  }
});

router.get("/desktop-building/objects", async (req, res): Promise<void> => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  try {
    const scope = await resolveBuildingScope(link, req.header("x-shadow-tower-password"));
    if (!scope.ok) {
      res.status(scope.status).json({ error: scope.error });
      return;
    }
    const objects = buildingObjectsForRoom(scope.value.room);
    if (objects.length === 0) {
      if (scope.value.room === "executive_suite") {
        res.json({
          floorNumber: scope.value.presence.floorNumber,
          room: scope.value.room,
          observedAt: new Date().toISOString(),
          objects: [],
        });
        return;
      }
      res.status(404).json({ error: "No maintainable objects are registered in this room" });
      return;
    }
    const now = new Date();
    await db.insert(desktopBuildingObjectStatesTable).values(objects.map((object) => ({
      scopeKey: scope.value.scopeKey,
      city: scope.value.presence.city,
      floorNumber: scope.value.presence.floorNumber,
      room: object.room,
      objectId: object.id,
      orgId: scope.value.orgId,
      ownerUserId: scope.value.ownerUserId,
      updatedByUserId: link.userId,
      lastCleanedAt: now,
      lastMaintainedAt: now,
    }))).onConflictDoNothing({
      target: [desktopBuildingObjectStatesTable.scopeKey, desktopBuildingObjectStatesTable.objectId],
    });
    const saved = await db.select().from(desktopBuildingObjectStatesTable).where(and(
      eq(desktopBuildingObjectStatesTable.scopeKey, scope.value.scopeKey),
      inArray(desktopBuildingObjectStatesTable.objectId, objects.map((object) => object.id)),
    ));
    const savedById = new Map(saved.map((row) => [row.objectId, row]));
    const publicWork = isPublicTowerWork(scope.value);
    const demand = publicWork ? await getPublicWorkDemand(scope.value.presence.city) : null;
    const privateOrganizationWork = !publicWork && scope.value.orgId != null;
    const organizationBalanceFiat = privateOrganizationWork
      ? await getOrganizationMaintenanceBalance(scope.value.orgId!)
      : 0;
    const payerLabel = publicWork ? "MILA" : privateOrganizationWork ? "ORGANIZATION RECEPTIONIST" : null;
    const [{ total: activePublicJobs }] = publicWork
      ? await db.select({ total: count() }).from(desktopBuildingObjectStatesTable).where(and(
        isNotNull(desktopBuildingObjectStatesTable.workStartedAt),
        gte(desktopBuildingObjectStatesTable.workStartedAt, new Date(now.getTime() - PUBLIC_WORK_SESSION_MAX_AGE_MS)),
        eq(desktopBuildingObjectStatesTable.city, scope.value.presence.city),
        lte(desktopBuildingObjectStatesTable.floorNumber, 4),
        inArray(desktopBuildingObjectStatesTable.room, ["lobby", "hallway"]),
      ))
      : [{ total: 0 }];
    const publicSlotsAvailable = Boolean(demand && activePublicJobs < demand.maxConcurrentJobs);
    res.json({
      floorNumber: scope.value.presence.floorNumber,
      room: scope.value.room,
      observedAt: now.toISOString(),
      publicWorkDemand: demand
        ? {
          maxConcurrentJobs: demand.maxConcurrentJobs,
          activeJobs: activePublicJobs,
          availableSlots: Math.max(0, demand.maxConcurrentJobs - activePublicJobs),
        }
        : null,
      objects: objects.map((object) =>
        serializeBuildingObject(object, scope.value.presence.floorNumber, savedById.get(object.id), {
          publicWork,
          publicSlotsAvailable,
          publicPoolBalanceFiat: demand?.rewardPoolBalanceFiat ?? 0,
          privateOrganizationWork,
          organizationBalanceFiat,
          payerLabel,
          nowMs: now.getTime(),
        })),
    });
  } catch (error) {
    req.log.error({ err: error }, "Desktop building objects read failed");
    res.status(500).json({ error: "Could not load building object state" });
  }
});

router.post("/desktop-building/objects/action", async (req, res): Promise<void> => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  const objectId = req.body?.objectId;
  const action = req.body?.action;
  const sessionId = req.body?.sessionId;
  if (typeof objectId !== "string" || objectId.length < 1 || objectId.length > 80
    || (action !== "clean" && action !== "repair")
    || (sessionId !== undefined && (typeof sessionId !== "string" || sessionId.length > 64))) {
    res.status(400).json({ error: "Provide a valid objectId, clean or repair action, and optional work session" });
    return;
  }
  try {
    const scope = await resolveBuildingScope(link, req.header("x-shadow-tower-password"));
    if (!scope.ok) {
      res.status(scope.status).json({ error: scope.error });
      return;
    }
    const isPublic = isPublicTowerWork(scope.value);
    const demand = isPublic ? await getPublicWorkDemand(scope.value.presence.city) : null;
    const privateOrganizationWork = !isPublic && scope.value.orgId != null;
    const payerLabel = isPublic ? "MILA" : privateOrganizationWork ? "ORGANIZATION RECEPTIONIST" : null;
    const organizationBalanceFiat = privateOrganizationWork
      ? await getOrganizationMaintenanceBalance(scope.value.orgId!)
      : 0;
    const result = await db.transaction(async (tx) => {
      const now = new Date();
      const staleBefore = new Date(now.getTime() - PUBLIC_WORK_SESSION_MAX_AGE_MS);
      await tx.update(desktopBuildingObjectStatesTable)
        .set({ ...clearActiveWorkFields(), updatedAt: now })
        .where(and(
          isNotNull(desktopBuildingObjectStatesTable.workStartedAt),
          lt(desktopBuildingObjectStatesTable.workStartedAt, staleBefore),
        ));

      if (typeof sessionId === "string") {
        const [session] = await tx.select().from(desktopBuildingObjectStatesTable)
          .where(and(
            eq(desktopBuildingObjectStatesTable.workSessionId, sessionId),
            eq(desktopBuildingObjectStatesTable.workUserId, link.userId),
          ))
          .for("update").limit(1);
        if (!session || !session.workStartedAt || !session.workAction) {
          return { kind: "error" as const, status: 409 as const, error: "Work session expired; start a new task" };
        }
        const sessionObject = buildingObject(session.room, session.objectId);
        const wrongScope = session.scopeKey !== scope.value.scopeKey
          || session.objectId !== objectId
          || session.workAction !== action
          || !sessionObject;
        if (wrongScope) {
          await tx.update(desktopBuildingObjectStatesTable)
            .set({ ...clearActiveWorkFields(), updatedAt: now })
            .where(eq(desktopBuildingObjectStatesTable.id, session.id));
          return { kind: "error" as const, status: 409 as const, error: "Work cancelled after leaving the assigned area" };
        }

        const distance = Math.hypot(
          scope.value.presence.x - sessionObject.x,
          scope.value.presence.y - sessionObject.y,
        );
        if (distance > MAINTENANCE_REACH_PX) {
          await tx.update(desktopBuildingObjectStatesTable)
            .set({ ...clearActiveWorkFields(), updatedAt: now })
            .where(eq(desktopBuildingObjectStatesTable.id, session.id));
          return { kind: "error" as const, status: 409 as const, error: "Work cancelled; stay beside the object until it finishes" };
        }

        const elapsedMs = now.getTime() - session.workStartedAt.getTime();
        if (elapsedMs < session.workDurationMs) {
          return {
            kind: "working" as const,
            sessionId,
            progress: workProgress(session.workStartedAt, session.workDurationMs, now.getTime()),
            rewardFiat: session.workRewardFiat,
            durationMs: session.workDurationMs,
            state: serializeBuildingObject(sessionObject, session.floorNumber, session, {
              publicWork: isPublic,
              publicSlotsAvailable: false,
              publicPoolBalanceFiat: demand?.rewardPoolBalanceFiat ?? 0,
              privateOrganizationWork,
              organizationBalanceFiat,
              payerLabel,
              nowMs: now.getTime(),
            }),
          };
        }

        const rewardFiat = session.workRewardFiat;
        const wallet = rewardFiat > 0
          ? isPublic
            ? await payPublicMaintenanceReward(tx, {
              userId: link.userId,
              amountFiat: rewardFiat,
              sessionId,
              action,
              floorNumber: scope.value.presence.floorNumber,
            })
            : session.orgId != null
              ? await payOrganizationMaintenanceReward(tx, {
                orgId: session.orgId,
                userId: link.userId,
                amountFiat: rewardFiat,
                sessionId,
                action,
                floorNumber: scope.value.presence.floorNumber,
              })
              : null
          : null;
        if (rewardFiat > 0 && !wallet) {
          return {
            kind: "payment-wait" as const,
            sessionId,
            rewardFiat,
            durationMs: session.workDurationMs,
            payerLabel: payerLabel ?? "RECEPTIONIST",
            state: serializeBuildingObject(sessionObject, session.floorNumber, session, {
              publicWork: isPublic,
              publicSlotsAvailable: false,
              publicPoolBalanceFiat: demand?.rewardPoolBalanceFiat ?? 0,
              privateOrganizationWork,
              organizationBalanceFiat,
              payerLabel,
              nowMs: now.getTime(),
            }),
          };
        }
        const [completed] = await tx.update(desktopBuildingObjectStatesTable)
          .set({
            ...(session.workAction === "clean"
              ? { cleanliness: 100, lastCleanedAt: now }
              : { condition: 100, lastMaintainedAt: now }),
            workCompletedByUserId: link.userId,
            workCompletedAt: now,
            ...clearActiveWorkFields(),
            updatedByUserId: link.userId,
            updatedAt: now,
          })
          .where(eq(desktopBuildingObjectStatesTable.id, session.id))
          .returning();
        return {
          kind: "completed" as const,
          rewardFiat,
          payerLabel,
          balance: wallet?.balance ?? null,
          spendable: wallet?.spendable ?? null,
          state: serializeBuildingObject(sessionObject, session.floorNumber, completed, {
            publicWork: isPublic,
            publicSlotsAvailable: true,
            publicPoolBalanceFiat: Math.max(0, (demand?.rewardPoolBalanceFiat ?? 0) - rewardFiat),
            privateOrganizationWork,
            organizationBalanceFiat: Math.max(0, organizationBalanceFiat - rewardFiat),
            payerLabel,
            nowMs: now.getTime(),
          }),
        };
      }

      const object = buildingObject(scope.value.room, objectId);
      if (!object) {
        return { kind: "error" as const, status: 404 as const, error: "Object is not maintainable in the current room" };
      }
      const distance = Math.hypot(
        scope.value.presence.x - object.x,
        scope.value.presence.y - object.y,
      );
      if (distance > MAINTENANCE_REACH_PX) {
        return { kind: "error" as const, status: 409 as const, error: "Move closer to the object before maintaining it" };
      }

      if (isPublic) await tx.execute(sql`SELECT pg_advisory_xact_lock(${PUBLIC_WORK_SLOT_LOCK_KEY})`);
      await tx.insert(desktopBuildingObjectStatesTable).values({
        scopeKey: scope.value.scopeKey,
        city: scope.value.presence.city,
        floorNumber: scope.value.presence.floorNumber,
        room: object.room,
        objectId: object.id,
        orgId: scope.value.orgId,
        ownerUserId: scope.value.ownerUserId,
        updatedByUserId: link.userId,
        lastCleanedAt: now,
        lastMaintainedAt: now,
      }).onConflictDoNothing({
        target: [desktopBuildingObjectStatesTable.scopeKey, desktopBuildingObjectStatesTable.objectId],
      });
      const [saved] = await tx.select().from(desktopBuildingObjectStatesTable)
        .where(and(
          eq(desktopBuildingObjectStatesTable.scopeKey, scope.value.scopeKey),
          eq(desktopBuildingObjectStatesTable.objectId, object.id),
        ))
        .for("update").limit(1);
      if (!saved) {
        return { kind: "error" as const, status: 500 as const, error: "Object state could not be initialized" };
      }
      if (saved.workSessionId && saved.workStartedAt && saved.workAction) {
        if (saved.workUserId === link.userId && saved.workAction === action) {
          return {
            kind: "working" as const,
            sessionId: saved.workSessionId,
            progress: workProgress(saved.workStartedAt, saved.workDurationMs, now.getTime()),
            rewardFiat: saved.workRewardFiat,
            durationMs: saved.workDurationMs,
            state: serializeBuildingObject(object, saved.floorNumber, saved, {
              publicWork: isPublic,
              publicSlotsAvailable: false,
              publicPoolBalanceFiat: demand?.rewardPoolBalanceFiat ?? 0,
              privateOrganizationWork,
              organizationBalanceFiat,
              payerLabel,
              nowMs: now.getTime(),
            }),
          };
        }
        return { kind: "error" as const, status: 409 as const, error: "Another worker is already maintaining this object" };
      }

      const score = action === "clean"
        ? decayBuildingScore(saved.cleanliness, saved.lastCleanedAt, CLEANLINESS_DECAY_PER_DAY, now.getTime())
        : decayBuildingScore(saved.condition, saved.lastMaintainedAt, CONDITION_DECAY_PER_DAY, now.getTime());
      if (!needsPublicMaintenance(score)) {
        return { kind: "error" as const, status: 409 as const, error: "This object does not need that work yet" };
      }

      const rewardFiat = isPublic || scope.value.orgId != null ? maintenanceTaskReward(score) : 0;
      if (isPublic) {
        const [{ total: activePublicJobs }] = await tx.select({ total: count() })
          .from(desktopBuildingObjectStatesTable)
          .where(and(
            isNotNull(desktopBuildingObjectStatesTable.workStartedAt),
            gte(desktopBuildingObjectStatesTable.workStartedAt, staleBefore),
            eq(desktopBuildingObjectStatesTable.city, scope.value.presence.city),
            lte(desktopBuildingObjectStatesTable.floorNumber, 4),
            inArray(desktopBuildingObjectStatesTable.room, ["lobby", "hallway"]),
          ));
        if (!demand || activePublicJobs >= demand.maxConcurrentJobs) {
          return { kind: "error" as const, status: 409 as const, error: "Mila has enough public work in progress right now" };
        }
      }
      if (rewardFiat > 0) {
        const hasFunds = isPublic
          ? await hasPublicMaintenanceFunds(tx, rewardFiat)
          : scope.value.orgId != null
            ? await hasOrganizationMaintenanceFunds(tx, scope.value.orgId, rewardFiat)
            : false;
        if (!hasFunds) {
          return {
            kind: "error" as const,
            status: 409 as const,
            error: isPublic
              ? "Mila's public maintenance reward pool does not have enough FIAT"
              : "The organization's receptionist cannot fund this task right now",
          };
        }
      }

      const [save] = await tx.select().from(salarymanSavesTable).where(and(
        eq(salarymanSavesTable.userId, link.userId),
        eq(salarymanSavesTable.slotIndex, 0),
      )).for("update").limit(1);
      if (!save) {
        return { kind: "error" as const, status: 404 as const, error: "Create a character before starting building work" };
      }
      const staminaCost = spendPlayerStamina(save.data, BUILDING_MAINTENANCE_STAMINA_COST, now);
      if (!staminaCost) {
        return { kind: "error" as const, status: 402 as const, error: "Too exhausted to work; recover stamina before starting another task" };
      }
      await tx.update(salarymanSavesTable).set({ data: staminaCost.data })
        .where(eq(salarymanSavesTable.id, save.id));

      const workSessionId = randomUUID();
      const durationMs = publicMaintenanceDurationMs(action, score);
      const [started] = await tx.update(desktopBuildingObjectStatesTable)
        .set({
          workSessionId,
          workAction: action,
          workUserId: link.userId,
          workStartedAt: now,
          workDurationMs: durationMs,
          workRewardFiat: rewardFiat,
          updatedByUserId: link.userId,
          updatedAt: now,
        })
        .where(eq(desktopBuildingObjectStatesTable.id, saved.id))
        .returning();
      return {
        kind: "working" as const,
        sessionId: workSessionId,
        progress: 0,
        rewardFiat,
        payerLabel,
        stamina: staminaCost.stamina,
        durationMs,
        state: serializeBuildingObject(object, saved.floorNumber, started, {
          publicWork: isPublic,
          publicSlotsAvailable: false,
          publicPoolBalanceFiat: demand?.rewardPoolBalanceFiat ?? 0,
          privateOrganizationWork,
          organizationBalanceFiat,
          payerLabel,
          nowMs: now.getTime(),
        }),
      };
    });

    if (result.kind === "error") {
      res.status(result.status).json({ error: result.error });
      return;
    }
    if (result.kind === "working") {
      res.json({
        ok: true,
        working: true,
        sessionId: result.sessionId,
        progress: result.progress,
        durationMs: result.durationMs,
        rewardFiat: result.rewardFiat,
        payerLabel: result.payerLabel,
        stamina: "stamina" in result ? result.stamina : undefined,
        message: result.rewardFiat > 0
          ? `WORKING / ${result.payerLabel} PAYS ƒ${result.rewardFiat}`
          : "WORK IN PROGRESS",
        state: result.state,
      });
      return;
    }
    if (result.kind === "payment-wait") {
      res.json({
        ok: true,
        working: true,
        waitingForPayment: true,
        sessionId: result.sessionId,
        progress: 1,
        durationMs: result.durationMs,
        rewardFiat: result.rewardFiat,
        payerLabel: result.payerLabel,
        message: `WORK COMPLETE / WAITING FOR ${result.payerLabel} PAYMENT`,
        state: result.state,
      });
      return;
    }
    res.json({
      ok: true,
      completed: true,
      rewardFiat: result.rewardFiat,
      balance: result.balance,
      spendable: result.spendable,
      payerLabel: result.payerLabel,
      message: result.rewardFiat > 0
        ? `${result.payerLabel} PAID ƒ${result.rewardFiat}`
        : action === "clean" ? "Object cleaned" : "Object repaired",
      state: result.state,
    });
  } catch (error) {
    req.log.error({ err: error }, "Desktop building object maintenance failed");
    res.status(500).json({ error: "Could not save building object maintenance" });
  }
});

router.get("/orgs/:orgId/office-activity", async (req, res): Promise<void> => {
  if (!req.isAuthenticated?.() || !req.user?.id) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const orgId = Number(req.params.orgId);
  if (!Number.isInteger(orgId) || orgId <= 0) {
    res.status(400).json({ error: "Invalid organization id" });
    return;
  }
  try {
    const userId = String((req.user as { id: string }).id);
    const [org] = await db.select({ id: organizationsTable.id, name: organizationsTable.name })
      .from(organizationsTable).where(eq(organizationsTable.id, orgId)).limit(1);
    if (!org) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }
    const officeAccess = await canDoInOrg(userId, orgId, "org.settings");
    if (!officeAccess.allowed) {
      res.status(403).json({ error: "Organization office access requires an owner or administrator role" });
      return;
    }
    const orgOffice = (await activeOfficeRows()).find((row) =>
      (row.unit.orgId ?? row.floor.orgId) === orgId);
    const now = new Date();
    res.json({
      office: orgOffice ? {
        roomKey: `org:${orgId}`,
        orgId,
        orgName: org.name,
        city: orgOffice.floor.city,
        floorNumber: orgOffice.floor.floorNumber,
        unitNumber: orgOffice.unit.unitNumber,
      } : null,
      members: await getOrgPresence(orgId, now),
      onlineWindowSeconds: ONLINE_WINDOW_MS / 1_000,
    });
  } catch (error) {
    req.log.error({ err: error }, "Organization office activity failed");
    res.status(500).json({ error: "Could not load organization office activity" });
  }
});

export default router;