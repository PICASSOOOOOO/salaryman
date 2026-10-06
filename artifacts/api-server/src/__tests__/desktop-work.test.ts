import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import {
  bankAccountsTable,
  bankTransactionsTable,
  db,
  desktopBuildingObjectStatesTable,
  desktopOfficePresenceTable,
  desktopWorkClaimsTable,
  desktopWorkLeasesTable,
  deviceLinksTable,
  shadowTowerFloorsTable,
  shadowTowerOfficeUnitsTable,
  usersTable,
} from "@workspace/db";
import desktopBuildingRouter from "../routes/desktop-building";
import desktopWorkRouter from "../routes/desktop-work";

const app = express();
app.use(express.json());
app.use("/api", desktopWorkRouter);
app.use("/api", desktopBuildingRouter);

const userIds: string[] = [];
const linkIds: string[] = [];
const floorIds: number[] = [];
let userId = "";
let deviceId = "";
let token = "";
let officeCity = "";

function desktopPost(path: string) {
  return request(app).post(path)
    .set("Authorization", `Bearer ${token}`)
    .set("x-salaryman-device-id", deviceId);
}

function desktopGet(path: string) {
  return request(app).get(path)
    .set("Authorization", `Bearer ${token}`)
    .set("x-salaryman-device-id", deviceId);
}

beforeAll(async () => {
  const email = `desktop-work-${randomUUID()}@test.local`;
  const [user] = await db.insert(usersTable).values({ email }).returning();
  userId = user.id;
  userIds.push(userId);
  await db.insert(bankAccountsTable).values({
    userId,
    kind: "checking",
    label: "CHECKING",
    balance: 0,
  });

  deviceId = `desktop-${randomUUID()}`;
  token = `test-token-${randomUUID()}`;
  officeCity = `test-${randomUUID().slice(0, 8)}`;
  const [link] = await db.insert(deviceLinksTable).values({
    userId,
    desktopDeviceId: deviceId,
    desktopName: "Desktop work test",
    status: "linked",
    linkedAt: new Date(),
    desktopAccessTokenHash: createHash("sha256").update(token).digest("hex"),
    scopes: ["salaryman_app"],
  }).returning();
  linkIds.push(link.id);

  const [floor] = await db.insert(shadowTowerFloorsTable).values({
    city: officeCity,
    floorNumber: 5,
    ownerUserId: userId,
    tenure: "own",
    archetype: "founder_team",
  }).returning();
  floorIds.push(floor.id);
  await db.insert(shadowTowerOfficeUnitsTable).values({
    floorId: floor.id,
    unitNumber: 1,
    status: "occupied",
    ownerUserId: userId,
    tenure: "own",
  });
});

afterAll(async () => {
  await db.delete(desktopBuildingObjectStatesTable)
    .where(eq(desktopBuildingObjectStatesTable.updatedByUserId, userId));
  await db.delete(desktopOfficePresenceTable).where(eq(desktopOfficePresenceTable.userId, userId));
  if (linkIds.length) {
    await db.delete(desktopWorkClaimsTable).where(inArray(desktopWorkClaimsTable.linkId, linkIds));
    await db.delete(desktopWorkLeasesTable).where(inArray(desktopWorkLeasesTable.linkId, linkIds));
    await db.delete(deviceLinksTable).where(inArray(deviceLinksTable.id, linkIds));
  }
  if (floorIds.length) {
    await db.delete(shadowTowerFloorsTable).where(inArray(shadowTowerFloorsTable.id, floorIds));
  }
  if (userIds.length) {
    await db.delete(bankTransactionsTable).where(inArray(bankTransactionsTable.userId, userIds));
    await db.delete(bankAccountsTable).where(inArray(bankAccountsTable.userId, userIds));
    await db.delete(usersTable).where(inArray(usersTable.id, userIds));
  }
});

function reportPresence(room: "office" | "lobby" | "hallway" = "office", requestedFloor?: number) {
  const isOffice = room === "office";
  const floorNumber = requestedFloor ?? (isOffice ? 5 : room === "lobby" ? 1 : 2);
  return desktopPost("/api/desktop-building/presence").send({
    room,
    floorNumber,
    x: isOffice ? 1_800 : room === "lobby" ? 49_978_000 : 4_800,
    y: isOffice ? 6_550 : room === "lobby" ? 50_000_000 : 4_550,
    action: isOffice ? "sit" : "stand",
  });
}

describe("desktop office work settlement", () => {
  it("reuses one lease and settles only continuous server-observed office presence", async () => {
    const firstLease = await desktopPost("/api/desktop-work/lease").send({});
    expect(firstLease.status).toBe(200);
    const retryLease = await desktopPost("/api/desktop-work/lease").send({});
    expect(retryLease.status).toBe(200);
    expect(retryLease.body.leaseId).toBe(firstLease.body.leaseId);

    const leaseId = firstLease.body.leaseId as string;
    const earlyEvent = `claim-${randomUUID()}`;
    const early = await desktopPost("/api/desktop-work/claims").send({
      eventId: earlyEvent,
      leaseId,
      workType: "office_shift",
      workMinutes: 1,
      reportedAt: new Date().toISOString(),
    });
    expect(early.status).toBe(422);
    expect(early.body.reason).toBe("work_time_not_elapsed");

    await db.update(desktopWorkLeasesTable)
      .set({ issuedAt: new Date(Date.now() - 5 * 60_000) })
      .where(eq(desktopWorkLeasesTable.id, leaseId));

    const initialPresence = await reportPresence();
    expect(initialPresence.status).toBe(200);
    expect(initialPresence.body.workPresence).toBe(true);

    // A gap beyond the online window starts a new observed interval without
    // crediting the time the desktop was absent.
    await db.update(desktopWorkLeasesTable)
      .set({ presenceLastSeenAt: new Date(Date.now() - 60_000) })
      .where(eq(desktopWorkLeasesTable.id, leaseId));
    expect((await reportPresence()).status).toBe(200);
    let [lease] = await db.select().from(desktopWorkLeasesTable).where(eq(desktopWorkLeasesTable.id, leaseId));
    expect(lease.verifiedSeconds).toBe(0);

    // A short heartbeat interval accrues time, but leaving the office breaks it.
    await db.update(desktopWorkLeasesTable)
      .set({ presenceLastSeenAt: new Date(Date.now() - 30_000) })
      .where(eq(desktopWorkLeasesTable.id, leaseId));
    expect((await reportPresence()).status).toBe(200);
    [lease] = await db.select().from(desktopWorkLeasesTable).where(eq(desktopWorkLeasesTable.id, leaseId));
    expect(lease.verifiedSeconds).toBe(30);
    const partialClaim = await desktopPost("/api/desktop-work/claims").send({
      eventId: `claim-${randomUUID()}`,
      leaseId,
      workType: "office_shift",
      workMinutes: 1,
      reportedAt: new Date().toISOString(),
    });
    expect(partialClaim.status).toBe(422);
    expect(partialClaim.body.reason).toBe("work_presence_not_verified");
    const leftOffice = await reportPresence("lobby");
    expect(leftOffice.status).toBe(200);
    [lease] = await db.select().from(desktopWorkLeasesTable).where(eq(desktopWorkLeasesTable.id, leaseId));
    expect(lease.presenceLastSeenAt).toBeNull();
    expect((await reportPresence()).status).toBe(200);

    // Simulate five more 30-second server heartbeat intervals after returning.
    for (let beat = 0; beat < 5; beat += 1) {
      await db.update(desktopWorkLeasesTable)
        .set({ presenceLastSeenAt: new Date(Date.now() - 30_000) })
        .where(eq(desktopWorkLeasesTable.id, leaseId));
      expect((await reportPresence()).status).toBe(200);
    }
    [lease] = await db.select().from(desktopWorkLeasesTable).where(eq(desktopWorkLeasesTable.id, leaseId));
    expect(lease.verifiedSeconds).toBe(180);

    const eventId = `claim-${randomUUID()}`;
    const claim = {
      eventId,
      leaseId,
      workType: "office_shift",
      workMinutes: 3,
      reportedAt: new Date().toISOString(),
    };
    const settled = await desktopPost("/api/desktop-work/claims").send(claim);
    expect(settled.status).toBe(200);
    expect(settled.body).toMatchObject({ ok: true, status: "accepted", amountFiat: 15, balance: 15 });

    const duplicate = await desktopPost("/api/desktop-work/claims").send(claim);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body).toMatchObject({ ok: true, duplicate: true, status: "accepted", amountFiat: 15 });

    const overClaim = await desktopPost("/api/desktop-work/claims").send({
      ...claim,
      eventId: `claim-${randomUUID()}`,
      workMinutes: 1,
    });
    expect(overClaim.status).toBe(422);
    expect(overClaim.body.reason).toBe("work_presence_not_verified");

    const [account] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.userId, userId));
    expect(account.balance).toBe(15);
  });

  it("maintains shared hallway objects on every floor and private office objects on their assigned floor", async () => {
    const floorThreeEntry = await reportPresence("hallway", 3);
    expect(floorThreeEntry.status).toBe(200);
    const floorThreeObjects = await desktopGet("/api/desktop-building/objects");
    expect(floorThreeObjects.status).toBe(200);
    expect(floorThreeObjects.body.floorNumber).toBe(3);

    const cleaned = await desktopPost("/api/desktop-building/objects/action").send({
      objectId: "hall-office-2-door",
      action: "clean",
    });
    expect(cleaned.status).toBe(200);
    expect(cleaned.body.state).toMatchObject({
      objectId: "hall-office-2-door",
      floorNumber: 3,
      cleanliness: 100,
    });

    expect((await reportPresence("hallway", 2)).status).toBe(200);
    const floorTwoObjects = await desktopGet("/api/desktop-building/objects");
    expect(floorTwoObjects.status).toBe(200);
    expect(floorTwoObjects.body.floorNumber).toBe(2);
    expect(floorTwoObjects.body.objects).toContainEqual(expect.objectContaining({
      objectId: "hall-office-2-door",
      floorNumber: 2,
      cleanliness: 80,
      condition: 85,
    }));

    expect((await reportPresence("hallway", 3)).status).toBe(200);
    const floorThreeAfterReturn = await desktopGet("/api/desktop-building/objects");
    expect(floorThreeAfterReturn.body.objects).toContainEqual(expect.objectContaining({
      objectId: "hall-office-2-door",
      floorNumber: 3,
      cleanliness: 100,
    }));

    expect((await reportPresence("office")).status).toBe(200);
    const officeObjects = await desktopGet("/api/desktop-building/objects");
    expect(officeObjects.status).toBe(200);
    expect(officeObjects.body.floorNumber).toBe(5);
    expect(officeObjects.body.objects).toContainEqual(expect.objectContaining({
      objectId: "executive-chair",
      floorNumber: 5,
    }));
    const repaired = await desktopPost("/api/desktop-building/objects/action").send({
      objectId: "executive-chair",
      action: "repair",
    });
    expect(repaired.status).toBe(200);
    expect(repaired.body.state).toMatchObject({
      objectId: "executive-chair",
      floorNumber: 5,
      cleanliness: 80,
      condition: 100,
    });

    expect((await reportPresence("hallway", 6)).status).toBe(403);
  });
});