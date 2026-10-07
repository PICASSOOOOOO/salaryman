import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { eq } from "drizzle-orm";
import {
  db,
  desktopOfficePresenceTable,
  deviceLinksTable,
  towerStaffAssignmentsTable,
  usersTable,
} from "@workspace/db";
import desktopBuildingRouter from "../routes/desktop-building";

const app = express();
app.use(express.json());
app.use("/api", desktopBuildingRouter);

const managerId = `tower-staff-manager-${randomUUID()}`;
const targetId = `tower-staff-target-${randomUUID()}`;
const regularId = `tower-staff-regular-${randomUUID()}`;
const managerEmail = `${managerId}@test.local`;
const regularEmail = `${regularId}@test.local`;
const managerToken = `tower-staff-token-${randomUUID()}`;
const regularToken = `tower-staff-token-${randomUUID()}`;
const managerDeviceId = `tower-staff-device-${randomUUID()}`;
const regularDeviceId = `tower-staff-device-${randomUUID()}`;
const targetToken = `tower-staff-token-${randomUUID()}`;
const targetDeviceId = `tower-staff-device-${randomUUID()}`;
const linkIds: string[] = [];
let ownerEmailsBefore: string | undefined;

function putAs(token: string, deviceId: string, userId: string, role: string) {
  return request(app).put(`/api/desktop-building/staff/${userId}`)
    .set("Authorization", `Bearer ${token}`)
    .set("x-salaryman-device-id", deviceId)
    .send({ role });
}

function deleteAs(token: string, deviceId: string, userId: string) {
  return request(app).delete(`/api/desktop-building/staff/${userId}`)
    .set("Authorization", `Bearer ${token}`)
    .set("x-salaryman-device-id", deviceId);
}

function targetServiceRide() {
  return request(app).post("/api/desktop-building/presence")
    .set("Authorization", `Bearer ${targetToken}`)
    .set("x-salaryman-device-id", targetDeviceId)
    .send({
      room: "elevator",
      floorNumber: 1,
      x: 49_977_600,
      y: 49_999_100,
      action: "ride",
      destinationFloor: 2,
    });
}

async function createLink(userId: string, desktopDeviceId: string, token: string) {
  const [link] = await db.insert(deviceLinksTable).values({
    userId,
    desktopDeviceId,
    desktopName: "Tower staff authorization test",
    status: "linked",
    linkedAt: new Date(),
    desktopAccessTokenHash: createHash("sha256").update(token).digest("hex"),
    scopes: ["salaryman_app"],
  }).returning({ id: deviceLinksTable.id });
  linkIds.push(link.id);
}

describe("Tower staff assignments", () => {
  beforeAll(async () => {
    ownerEmailsBefore = process.env.OWNER_EMAILS;
    process.env.OWNER_EMAILS = managerEmail;
    await db.insert(usersTable).values([
      { id: managerId, email: managerEmail },
      { id: targetId, email: `${targetId}@test.local` },
      { id: regularId, email: regularEmail },
    ]);
    await createLink(managerId, managerDeviceId, managerToken);
    await createLink(targetId, targetDeviceId, targetToken);
    await db.insert(desktopOfficePresenceTable).values({
      userId: targetId,
      linkId: linkIds[1],
      city: "minx_city",
      roomKey: "lobby:minx_city",
      room: "lobby",
      floorNumber: 1,
      x: 49_977_600,
      y: 49_999_100,
      action: "stand",
      lastSeenAt: new Date(),
    });
    await createLink(regularId, regularDeviceId, regularToken);
  });

  afterAll(async () => {
    await db.delete(desktopOfficePresenceTable)
      .where(eq(desktopOfficePresenceTable.userId, targetId));
    await db.delete(towerStaffAssignmentsTable)
      .where(eq(towerStaffAssignmentsTable.userId, targetId));
    for (const linkId of linkIds) {
      await db.delete(deviceLinksTable).where(eq(deviceLinksTable.id, linkId));
    }
    await db.delete(usersTable).where(eq(usersTable.id, managerId));
    await db.delete(usersTable).where(eq(usersTable.id, targetId));
    await db.delete(usersTable).where(eq(usersTable.id, regularId));
    if (ownerEmailsBefore === undefined) delete process.env.OWNER_EMAILS;
    else process.env.OWNER_EMAILS = ownerEmailsBefore;
  });

  it("lets only configured administrators assign and revoke explicit staff roles", async () => {
    const unauthorized = await putAs(regularToken, regularDeviceId, targetId, "maintenance");
    expect(unauthorized.status).toBe(403);
    const unauthorizedRide = await targetServiceRide();
    expect(unauthorizedRide.status).toBe(409);
    expect(unauthorizedRide.body.error).toContain("assigned Tower staff");

    const invalidRole = await putAs(managerToken, managerDeviceId, targetId, "tenant");
    expect(invalidRole.status).toBe(400);

    const assigned = await putAs(managerToken, managerDeviceId, targetId, "maintenance");
    expect(assigned.status).toBe(200);
    expect(assigned.body).toMatchObject({ ok: true, userId: targetId, role: "maintenance" });
    const [assignment] = await db.select().from(towerStaffAssignmentsTable)
      .where(eq(towerStaffAssignmentsTable.userId, targetId));
    expect(assignment?.role).toBe("maintenance");
    expect(assignment?.assignedByUserId).toBe(managerId);
    expect((await targetServiceRide()).status).toBe(200);

    const revoked = await deleteAs(managerToken, managerDeviceId, targetId);
    expect(revoked.status).toBe(200);
    await db.update(desktopOfficePresenceTable).set({
      room: "lobby",
      roomKey: "lobby:minx_city",
      floorNumber: 1,
      x: 49_977_600,
      y: 49_999_100,
      action: "stand",
      destinationFloor: null,
      lastSeenAt: new Date(),
    }).where(eq(desktopOfficePresenceTable.userId, targetId));
    const deniedAfterRevocation = await targetServiceRide();
    expect(deniedAfterRevocation.status).toBe(409);
    expect(deniedAfterRevocation.body.error).toContain("assigned Tower staff");
    const [removed] = await db.select().from(towerStaffAssignmentsTable)
      .where(eq(towerStaffAssignmentsTable.userId, targetId));
    expect(removed).toBeUndefined();
  });
});
