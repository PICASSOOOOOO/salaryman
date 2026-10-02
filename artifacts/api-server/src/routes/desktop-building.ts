import { createHash } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  db,
  desktopOfficePresenceTable,
  deviceLinksTable,
  orgMembersTable,
  organizationsTable,
  shadowTowerFloorsTable,
  shadowTowerOfficeUnitsTable,
  shadowTowerWorkstationAssignmentsTable,
  usersTable,
} from "@workspace/db";
import { canAccess } from "./shadow-tower";
import { canDoInOrg, resolveCurrentOrgId } from "../lib/org-permissions";

const router = Router();
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
};

function hashDesktopToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function requireDesktopLink(req: Request, res: Response) {
  const authorization = req.header("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const deviceId = req.header("x-salaryman-device-id") ?? "";
  if (!token || !/^[a-zA-Z0-9._:-]{8,128}$/.test(deviceId)) {
    res.status(401).json({ error: "Desktop credential required" });
    return null;
  }
  const [link] = await db.select().from(deviceLinksTable).where(and(
    eq(deviceLinksTable.desktopAccessTokenHash, hashDesktopToken(token)),
    eq(deviceLinksTable.desktopDeviceId, deviceId),
    eq(deviceLinksTable.status, "linked"),
  )).limit(1);
  if (!link || !link.scopes.includes("salaryman_app")) {
    res.status(401).json({ error: "Desktop credential is invalid, revoked, or lacks SALARYMAN access" });
    return null;
  }
  await db.update(deviceLinksTable).set({ lastDesktopSeenAt: new Date(), updatedAt: new Date() })
    .where(eq(deviceLinksTable.id, link.id));
  return link;
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

async function resolveUserOffice(userId: string, password?: unknown) {
  const orgId = await resolveCurrentOrgId(userId);
  const rows = await activeOfficeRows();
  const canManageOrgOffice = orgId != null
    && (await canDoInOrg(userId, orgId, "org.settings")).allowed;
  const candidates = rows.filter((row) => {
    const effectiveOrgId = row.unit.orgId ?? row.floor.orgId;
    const effectiveOwner = row.unit.ownerUserId ?? row.floor.ownerUserId;
    return orgId != null
      ? (effectiveOrgId === orgId && canManageOrgOffice) || effectiveOwner === userId
      : effectiveOwner === userId;
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

async function resolveUserWorkstation(userId: string, orgId: number | null) {
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
    const ownOffice = await resolveUserOffice(link.userId, req.header("x-shadow-tower-password"));
    const orgId = ownOffice?.orgId ?? await resolveCurrentOrgId(link.userId);
    const assignedWorkstation = ownOffice
      ? null
      : await resolveUserWorkstation(link.userId, orgId);
    const requestedFloor = req.query.floorNumber == null
      ? null
      : Number(req.query.floorNumber);
    if (requestedFloor != null && (!Number.isInteger(requestedFloor) || requestedFloor < 1 || requestedFloor > FLOOR_COUNT)) {
      res.status(400).json({ error: "floorNumber must be between 1 and 67" });
      return;
    }
    const initialVisit = requestedFloor == null;
    const floorNumber = requestedFloor ?? ownOffice?.floor.floorNumber ?? assignedWorkstation?.floor.floorNumber ?? 1;
    const city = ownOffice?.city ?? assignedWorkstation?.floor.city ?? "minx_city";
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

router.post("/desktop-building/presence", async (req, res): Promise<void> => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  const room = req.body?.room;
  const floorNumber = Number(req.body?.floorNumber);
  const x = Number(req.body?.x);
  const y = Number(req.body?.y);
  const action = req.body?.action;
  const destinationFloor = req.body?.destinationFloor == null ? null : Number(req.body.destinationFloor);
  if (!["lobby", "hallway", "elevator", "office"].includes(room)
    || !Number.isInteger(floorNumber) || floorNumber < 1 || floorNumber > FLOOR_COUNT
    || !Number.isInteger(x) || x < 0 || x > 100_000_000
    || !Number.isInteger(y) || y < 0 || y > 100_000_000
    || !["stand", "walk", "sit", "sleep", "ride"].includes(action)
    || (room === "elevator" && (!Number.isInteger(destinationFloor) || destinationFloor! < 1 || destinationFloor! > FLOOR_COUNT))) {
    res.status(400).json({ error: "Invalid desktop building presence" });
    return;
  }
  try {
    const currentOrgId = await resolveCurrentOrgId(link.userId);
    const ownOffice = await resolveUserOffice(link.userId, req.header("x-shadow-tower-password"));
    const assignedWorkstation = ownOffice
      ? null
      : await resolveUserWorkstation(link.userId, currentOrgId);
    if (room === "office" && (!ownOffice || ownOffice.floor.floorNumber !== floorNumber)) {
      res.status(403).json({ error: "An authorized organization office is required to enter this room" });
      return;
    }
    if (room === "lobby" && floorNumber !== 1) {
      res.status(400).json({ error: "The lobby is on floor 1" });
      return;
    }
    if (room === "hallway" && floorNumber > 4
      && ownOffice?.floor.floorNumber !== floorNumber
      && assignedWorkstation?.floor.floorNumber !== floorNumber) {
      res.status(403).json({ error: "An assigned office or workstation is required for this floor" });
      return;
    }
    const city = ownOffice?.city ?? assignedWorkstation?.floor.city ?? "minx_city";
    const roomKey = room === "office"
      ? ownOffice!.key
      : room === "lobby"
        ? `lobby:${city}`
        : room === "hallway"
          ? `hallway:${city}:${floorNumber}`
          : `elevator:${city}`;
    const now = new Date();
    await db.insert(desktopOfficePresenceTable).values({
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
    res.json({ ok: true, observedAt: now.toISOString(), roomKey });
  } catch (error) {
    req.log.error({ err: error }, "Desktop building presence update failed");
    res.status(500).json({ error: "Could not update desktop presence" });
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