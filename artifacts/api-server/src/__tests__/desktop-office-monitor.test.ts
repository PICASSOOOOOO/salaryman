import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, desktopOfficePresenceTable, deviceLinksTable, orgMembersTable, organizationsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import desktopBuildingRouter from "../routes/desktop-building";

const app = express();
app.use((req, _res, next) => {
  (req as any).user = { id: req.header("x-test-user-id") ?? "" };
  (req as any).isAuthenticated = () => true;
  next();
});
app.use("/api", desktopBuildingRouter);

const suffix = randomUUID();
const ownerId = `office-monitor-owner-${suffix}`;
const managerId = `office-monitor-manager-${suffix}`;
const employeeId = `office-monitor-employee-${suffix}`;
const peerId = `office-monitor-peer-${suffix}`;
const userIds = [ownerId, managerId, employeeId, peerId];
let orgId: number | null = null;
const linkIds: string[] = [];

async function getSnapshot(userId: string) {
  return request(app).get("/api/desktop-building/office-monitor")
    .set("x-test-user-id", userId);
}

beforeAll(async () => {
  await db.insert(usersTable).values(userIds.map((id) => ({
    id,
    email: `${id}@test.local`,
    firstName: id,
  })));
  const [org] = await db.insert(organizationsTable).values({
    name: `OFFICE MONITOR ${suffix}`,
    ownerUserId: ownerId,
  }).returning({ id: organizationsTable.id });
  const createdOrgId = org.id;
  orgId = createdOrgId;
  await db.insert(orgMembersTable).values([
    { orgId: createdOrgId, userId: ownerId, role: "owner", status: "active" },
    { orgId: createdOrgId, userId: managerId, role: "manager", status: "active" },
    { orgId: createdOrgId, userId: employeeId, role: "specialist", status: "active" },
    { orgId: createdOrgId, userId: peerId, role: "specialist", status: "active" },
  ]);
  for (const userId of userIds) {
    const [link] = await db.insert(deviceLinksTable).values({
      userId,
      desktopDeviceId: `office-monitor-device-${userId}`,
      desktopName: "Office monitor test",
      status: "linked",
      linkedAt: new Date(),
      scopes: ["salaryman_app"],
    }).returning({ id: deviceLinksTable.id });
    linkIds.push(link.id);
  }
  const now = new Date();
  await db.insert(desktopOfficePresenceTable).values([
    { userId: ownerId, linkId: linkIds[0], orgId: createdOrgId, city: "minx_city", roomKey: `org:${createdOrgId}`, room: "office", floorNumber: 6, x: 1_800, y: 5_500, action: "sit", lastSeenAt: now },
    { userId: managerId, linkId: linkIds[1], orgId: createdOrgId, city: "minx_city", roomKey: `org:${createdOrgId}`, room: "office", floorNumber: 6, x: 4_500, y: 5_500, action: "stand", lastSeenAt: now },
    { userId: employeeId, linkId: linkIds[2], orgId: createdOrgId, city: "minx_city", roomKey: `org:${createdOrgId}`, room: "office", floorNumber: 6, x: 17_500, y: 5_500, action: "walk", lastSeenAt: now },
    { userId: peerId, linkId: linkIds[3], orgId: createdOrgId, city: "minx_city", roomKey: `org:${createdOrgId}`, room: "office", floorNumber: 6, x: 18_000, y: 6_000, action: "sit", lastSeenAt: now },
  ]);
});

afterAll(async () => {
  for (const userId of userIds) {
    await db.delete(desktopOfficePresenceTable).where(eq(desktopOfficePresenceTable.userId, userId));
  }
  if (orgId != null) await db.delete(orgMembersTable).where(eq(orgMembersTable.orgId, orgId));
  for (const linkId of linkIds) {
    await db.delete(deviceLinksTable).where(eq(deviceLinksTable.id, linkId));
  }
  if (orgId != null) await db.delete(organizationsTable).where(eq(organizationsTable.id, orgId));
  await db.delete(usersTable).where(eq(usersTable.id, ownerId));
  await db.delete(usersTable).where(eq(usersTable.id, managerId));
  await db.delete(usersTable).where(eq(usersTable.id, employeeId));
  await db.delete(usersTable).where(eq(usersTable.id, peerId));
});

describe("browser office monitor privacy", () => {
  it("lets managers see all current organization staff", async () => {
    const response = await getSnapshot(managerId);
    expect(response.status).toBe(200);
    expect(response.body.people.map((person: { userId: string }) => person.userId).sort())
      .toEqual([...userIds].sort());
    expect(response.body.permissions.canViewManagement).toBe(true);
  });

  it("lets employees see peers but filters management before returning the snapshot", async () => {
    const response = await getSnapshot(employeeId);
    expect(response.status).toBe(200);
    expect(response.body.people.map((person: { userId: string }) => person.userId).sort())
      .toEqual([employeeId, peerId].sort());
    expect(response.body.permissions).toEqual({
      canViewManagement: false,
      canViewPeers: true,
    });
  });

  it("rejects users without an authenticated session", async () => {
    const response = await request(express().use("/api", desktopBuildingRouter))
      .get("/api/desktop-building/office-monitor");
    expect(response.status).toBe(401);
  });
});
