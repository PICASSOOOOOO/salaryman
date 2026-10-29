import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  bankAccountsTable,
  bankTransactionsTable,
  db,
  desktopBuildingObjectStatesTable,
  desktopOfficePresenceTable,
  desktopWorkClaimsTable,
  desktopWorkLeasesTable,
  deviceLinksTable,
  orgAccountTransactionsTable,
  orgAccountsTable,
  organizationsTable,
  shadowTowerFloorsTable,
  shadowTowerOfficeUnitsTable,
  salarymanSavesTable,
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
const maintenanceSessionIds: string[] = [];
let userId = "";
let deviceId = "";
let token = "";
let officeCity = "";
let privateOrgId = 0;
let privateOrgAccountId = 0;
let privateOrgCreated = false;
let privateOrgAccountCreated = false;
let picassoOrgId = 0;
let picassoAccountId = 0;
let picassoOrgCreated = false;
let picassoAccountCreated = false;
let originalPicassoBalance: number | null = null;

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
  await db.insert(salarymanSavesTable).values({
    userId,
    slotIndex: 0,
    charName: "TEST",
    charClass: "salaryman",
    data: { energy: 100, energyUpdatedAt: new Date().toISOString() },
  });
  await db.insert(bankAccountsTable).values({
    userId,
    kind: "checking",
    label: "CHECKING",
    balance: 0,
  });

  const [picasso] = await db.select().from(organizationsTable)
    .where(sql`lower(${organizationsTable.name}) = 'picasso'`).limit(1);
  if (picasso) {
    picassoOrgId = picasso.id;
  } else {
    const [createdPicasso] = await db.insert(organizationsTable).values({
      name: "PICASSO",
      ownerUserId: userId,
      isDeveloper: false,
    }).returning();
    picassoOrgId = createdPicasso.id;
    picassoOrgCreated = true;
  }
  const [picassoChecking] = await db.select().from(orgAccountsTable).where(and(
    eq(orgAccountsTable.orgId, picassoOrgId),
    eq(orgAccountsTable.type, "checking"),
  )).limit(1);
  if (picassoChecking) {
    picassoAccountId = picassoChecking.id;
    originalPicassoBalance = picassoChecking.balanceFiat;
    await db.update(orgAccountsTable)
      .set({ balanceFiat: picassoChecking.balanceFiat + 1_000, updatedAt: new Date() })
      .where(eq(orgAccountsTable.id, picassoChecking.id));
  } else {
    const [createdAccount] = await db.insert(orgAccountsTable).values({
      orgId: picassoOrgId,
      type: "checking",
      label: "TEST REWARD POOL",
      balanceFiat: 1_000,
      apyBps: 0,
    }).returning();
    picassoAccountId = createdAccount.id;
    picassoAccountCreated = true;
  }

  const [privateOrg] = await db.insert(organizationsTable).values({
    name: `Desktop Work Test ${randomUUID()}`,
    ownerUserId: userId,
    isDeveloper: false,
  }).returning();
  privateOrgId = privateOrg.id;
  privateOrgCreated = true;
  const [privateAccount] = await db.insert(orgAccountsTable).values({
    orgId: privateOrgId,
    type: "checking",
    label: "TEST OFFICE CHECKING",
    balanceFiat: 1_000,
    apyBps: 0,
  }).returning();
  privateOrgAccountId = privateAccount.id;
  privateOrgAccountCreated = true;

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
    floorNumber: 6,
    orgId: privateOrgId,
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
  if (maintenanceSessionIds.length) {
    const publicDescriptions = maintenanceSessionIds.map((id) =>
      `Receptionist Mila paid public Tower clean work · session ${id}`);
    await db.delete(orgAccountTransactionsTable).where(inArray(
      orgAccountTransactionsTable.description,
      publicDescriptions,
    ));
    await db.delete(orgAccountTransactionsTable).where(and(
      eq(orgAccountTransactionsTable.orgId, privateOrgId),
      inArray(orgAccountTransactionsTable.description, maintenanceSessionIds.map((id) =>
        `Organization receptionist paid repair work · session ${id}`)),
    ));
  }
  if (privateOrgAccountCreated) {
    await db.delete(orgAccountsTable).where(eq(orgAccountsTable.id, privateOrgAccountId));
  }
  if (privateOrgCreated) {
    await db.delete(organizationsTable).where(eq(organizationsTable.id, privateOrgId));
  }
  if (picassoAccountCreated) {
    await db.delete(orgAccountsTable).where(eq(orgAccountsTable.id, picassoAccountId));
  } else if (picassoAccountId && originalPicassoBalance != null) {
    await db.update(orgAccountsTable)
      .set({ balanceFiat: originalPicassoBalance, updatedAt: new Date() })
      .where(eq(orgAccountsTable.id, picassoAccountId));
  }
  if (picassoOrgCreated) {
    await db.delete(organizationsTable).where(eq(organizationsTable.id, picassoOrgId));
  }
  if (userIds.length) {
    await db.delete(bankTransactionsTable).where(inArray(bankTransactionsTable.userId, userIds));
    await db.delete(bankAccountsTable).where(inArray(bankAccountsTable.userId, userIds));
    await db.delete(salarymanSavesTable).where(inArray(salarymanSavesTable.userId, userIds));
    await db.delete(usersTable).where(inArray(usersTable.id, userIds));
  }
});

function reportPresence(
  room: "office" | "lobby" | "hallway" = "office",
  requestedFloor?: number,
  position?: { x: number; y: number },
) {
  const isOffice = room === "office";
  const floorNumber = requestedFloor ?? (isOffice ? 6 : room === "lobby" ? 1 : 6);
  return desktopPost("/api/desktop-building/presence").send({
    room,
    floorNumber,
    x: position?.x ?? (isOffice ? 4_500 : room === "lobby" ? 49_978_000 : 11_000),
    y: position?.y ?? (isOffice ? 5_500 : room === "lobby" ? 50_000_000 : 1_500),
    action: isOffice ? "sit" : "stand",
  });
}

function reportElevator(originFloor: 1 | 6, destinationFloor: 1 | 6) {
  return desktopPost("/api/desktop-building/presence").send({
    room: "elevator",
    floorNumber: originFloor,
    destinationFloor,
    x: originFloor === 1 ? 49_977_000 : 11_000,
    y: originFloor === 1 ? 50_000_000 : 1_500,
    action: "ride",
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

    expect((await reportPresence("lobby", 1)).status).toBe(200);
    expect((await reportElevator(1, 6)).status).toBe(200);
    expect((await reportPresence("hallway", 6)).status).toBe(200);
    const initialPresence = await reportPresence("office", 6);
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
    expect((await reportPresence("hallway", 6)).status).toBe(200);
    expect((await reportElevator(6, 1)).status).toBe(200);
    const leftOffice = await reportPresence("lobby", 1);
    expect(leftOffice.status).toBe(200);
    [lease] = await db.select().from(desktopWorkLeasesTable).where(eq(desktopWorkLeasesTable.id, leaseId));
    expect(lease.presenceLastSeenAt).toBeNull();
    expect((await reportElevator(1, 6)).status).toBe(200);
    expect((await reportPresence("hallway", 6)).status).toBe(200);
    expect((await reportPresence("office", 6)).status).toBe(200);

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

  it("allows only observed physical floor changes and keeps office work on Floor 6", async () => {
    await db.delete(desktopOfficePresenceTable).where(eq(desktopOfficePresenceTable.userId, userId));
    expect((await reportPresence("lobby", 1)).status).toBe(200);
    expect((await reportElevator(1, 6)).status).toBe(200);
    expect((await reportPresence("hallway", 6)).status).toBe(200);
    const floorSixObjects = await desktopGet("/api/desktop-building/objects");
    expect(floorSixObjects.status).toBe(200);
    expect(floorSixObjects.body.floorNumber).toBe(6);
    expect(floorSixObjects.body.objects).toContainEqual(expect.objectContaining({
      objectId: "recreation-vending",
      floorNumber: 6,
      cleanliness: 80,
      condition: 85,
    }));

    const [sharedAtm] = await db.select().from(desktopBuildingObjectStatesTable).where(and(
      eq(desktopBuildingObjectStatesTable.city, officeCity),
      eq(desktopBuildingObjectStatesTable.floorNumber, 6),
      eq(desktopBuildingObjectStatesTable.objectId, "recreation-atm"),
    )).limit(1);
    expect(sharedAtm).toBeDefined();
    await db.update(desktopBuildingObjectStatesTable)
      .set({ lastCleanedAt: new Date(Date.now() - 10 * 365 * 86_400_000) })
      .where(eq(desktopBuildingObjectStatesTable.id, sharedAtm.id));
    await db.update(desktopOfficePresenceTable)
      .set({ lastSeenAt: new Date(Date.now() - 10_000) })
      .where(eq(desktopOfficePresenceTable.userId, userId));
    expect((await reportPresence("hallway", 6, { x: 12_000, y: 5_000 })).status).toBe(200);
    const cleaned = await desktopPost("/api/desktop-building/objects/action").send({
      objectId: "recreation-atm",
      action: "clean",
    });
    expect(cleaned.status, JSON.stringify(cleaned.body)).toBe(200);
    expect(cleaned.body).toMatchObject({ working: true, rewardFiat: 0 });
    expect(cleaned.body.stamina).toBe(96);
    expect(cleaned.body.state).toMatchObject({
      objectId: "recreation-atm",
      floorNumber: 6,
      cleanliness: 0,
    });

    for (const otherFloor of [2, 3, 4, 5, 7, 67]) {
      expect((await reportPresence("hallway", otherFloor)).status).not.toBe(200);
    }
    const stillOnFloorSix = await desktopGet("/api/desktop-building/objects");
    expect(stillOnFloorSix.status).toBe(200);
    expect(stillOnFloorSix.body.floorNumber).toBe(6);
    expect(stillOnFloorSix.body.objects).toContainEqual(expect.objectContaining({
      objectId: "recreation-atm",
      floorNumber: 6,
      cleanliness: 0,
      condition: 85,
    }));

    await db.update(desktopOfficePresenceTable)
      .set({ lastSeenAt: new Date(Date.now() - 10_000) })
      .where(eq(desktopOfficePresenceTable.userId, userId));
    expect((await reportPresence("hallway", 6)).status).toBe(200);
    expect((await reportElevator(6, 1)).status).toBe(200);
    expect((await reportPresence("lobby", 1)).status).toBe(200);
    const movedSession = await desktopPost("/api/desktop-building/objects/action").send({
      objectId: "recreation-atm",
      action: "clean",
      sessionId: cleaned.body.sessionId,
    });
    expect(movedSession.status).toBe(409);
    expect(movedSession.body.error).toMatch(/cancelled/i);

    const lobbyObjects = await desktopGet("/api/desktop-building/objects");
    expect(lobbyObjects.status).toBe(200);
    expect(lobbyObjects.body.floorNumber).toBe(1);
    const [lobbyReception] = await db.select().from(desktopBuildingObjectStatesTable).where(and(
      eq(desktopBuildingObjectStatesTable.city, officeCity),
      eq(desktopBuildingObjectStatesTable.floorNumber, 1),
      eq(desktopBuildingObjectStatesTable.objectId, "lobby-reception-desk"),
    )).limit(1);
    expect(lobbyReception).toBeDefined();
    await db.update(desktopBuildingObjectStatesTable)
      .set({ lastCleanedAt: new Date(Date.now() - 10 * 365 * 86_400_000) })
      .where(eq(desktopBuildingObjectStatesTable.id, lobbyReception.id));
    const publicStart = await desktopPost("/api/desktop-building/objects/action").send({
      objectId: "lobby-reception-desk",
      action: "clean",
    });
    expect(publicStart.status).toBe(200);
    expect(publicStart.body).toMatchObject({
      working: true,
      rewardFiat: 100,
      payerLabel: "MILA",
      stamina: 92,
    });
    const publicSessionId = publicStart.body.sessionId as string;
    maintenanceSessionIds.push(publicSessionId);
    await db.update(desktopBuildingObjectStatesTable)
      .set({ workStartedAt: new Date(Date.now() - publicStart.body.durationMs - 1) })
      .where(eq(desktopBuildingObjectStatesTable.workSessionId, publicSessionId));
    const publicCompleted = await desktopPost("/api/desktop-building/objects/action").send({
      objectId: "lobby-reception-desk",
      action: "clean",
      sessionId: publicSessionId,
    });
    expect(publicCompleted.status).toBe(200);
    expect(publicCompleted.body).toMatchObject({
      completed: true,
      rewardFiat: 100,
      payerLabel: "MILA",
      message: "MILA PAID ƒ100",
    });

    expect((await reportElevator(1, 6)).status).toBe(200);
    expect((await reportPresence("hallway", 6)).status).toBe(200);
    const floorSixAfterReturn = await desktopGet("/api/desktop-building/objects");
    expect(floorSixAfterReturn.body.objects).toContainEqual(expect.objectContaining({
      objectId: "recreation-atm",
      floorNumber: 6,
      cleanliness: 0,
      activeWork: null,
    }));

    expect((await reportPresence("office", 6)).status).toBe(200);
    const officeObjects = await desktopGet("/api/desktop-building/objects");
    expect(officeObjects.status).toBe(200);
    expect(officeObjects.body.floorNumber).toBe(6);
    expect(officeObjects.body.objects).toContainEqual(expect.objectContaining({
      objectId: "executive-suite-door",
      floorNumber: 6,
    }));
    const [suiteDoorState] = await db.select().from(desktopBuildingObjectStatesTable).where(and(
      eq(desktopBuildingObjectStatesTable.city, officeCity),
      eq(desktopBuildingObjectStatesTable.floorNumber, 6),
      eq(desktopBuildingObjectStatesTable.objectId, "executive-suite-door"),
    )).limit(1);
    expect(suiteDoorState).toBeDefined();
    await db.update(desktopBuildingObjectStatesTable)
      .set({ lastMaintainedAt: new Date(Date.now() - 10 * 365 * 86_400_000) })
      .where(eq(desktopBuildingObjectStatesTable.id, suiteDoorState.id));
    await db.update(desktopOfficePresenceTable)
      .set({ lastSeenAt: new Date(Date.now() - 5_000) })
      .where(eq(desktopOfficePresenceTable.userId, userId));
    expect((await reportPresence("office", 6, { x: 3_000, y: 4_800 })).status).toBe(200);
    const repaired = await desktopPost("/api/desktop-building/objects/action").send({
      objectId: "executive-suite-door",
      action: "repair",
    });
    expect(repaired.status).toBe(200);
    expect(repaired.body).toMatchObject({
      working: true,
      rewardFiat: 100,
      payerLabel: "ORGANIZATION RECEPTIONIST",
      stamina: 88,
    });
    const privateSessionId = repaired.body.sessionId as string;
    maintenanceSessionIds.push(privateSessionId);
    await db.update(desktopBuildingObjectStatesTable)
      .set({ workStartedAt: new Date(Date.now() - repaired.body.durationMs - 1) })
      .where(eq(desktopBuildingObjectStatesTable.workSessionId, privateSessionId));
    const completedRepair = await desktopPost("/api/desktop-building/objects/action").send({
      objectId: "executive-suite-door",
      action: "repair",
      sessionId: privateSessionId,
    });
    expect(completedRepair.status).toBe(200);
    expect(completedRepair.body).toMatchObject({
      completed: true,
      rewardFiat: 100,
      payerLabel: "ORGANIZATION RECEPTIONIST",
      message: "ORGANIZATION RECEPTIONIST PAID ƒ100",
    });
    const [privateAccountAfterPay] = await db.select().from(orgAccountsTable)
      .where(eq(orgAccountsTable.id, privateOrgAccountId)).limit(1);
    expect(privateAccountAfterPay.balanceFiat).toBe(900);
    expect(completedRepair.body.state).toMatchObject({
      objectId: "executive-suite-door",
      floorNumber: 6,
      cleanliness: 80,
      condition: 100,
    });

    expect((await reportPresence("hallway", 6)).status).toBe(200);
  });

  it("validates and persists shared object physics actions", async () => {
    await db.delete(desktopOfficePresenceTable).where(eq(desktopOfficePresenceTable.userId, userId));
    expect((await reportPresence("lobby", 1)).status).toBe(200);
    await db.update(desktopOfficePresenceTable)
      .set({ lastSeenAt: new Date(Date.now() - 10_000) })
      .where(eq(desktopOfficePresenceTable.userId, userId));
    expect((await reportPresence("lobby", 1, { x: 49_978_700, y: 50_000_000 })).status).toBe(200);

    const rotated = await desktopPost("/api/desktop-building/objects/physics-action").send({
      objectId: "lobby-reception-desk",
      action: "rotate",
    });
    expect(rotated.status, JSON.stringify(rotated.body)).toBe(200);
    expect(rotated.body.state).toMatchObject({
      objectId: "lobby-reception-desk",
      material: "wood",
      rotationDegrees: 90,
      interactionProfile: { movable: true, rotatable: true, burnable: true },
    });

    const damaged = await desktopPost("/api/desktop-building/objects/physics-action").send({
      objectId: "lobby-reception-desk",
      action: "damage",
    });
    expect(damaged.status).toBe(200);
    expect(damaged.body.state.damage).toBe(20);

    const ignited = await desktopPost("/api/desktop-building/objects/physics-action").send({
      objectId: "lobby-reception-desk",
      action: "ignite",
    });
    expect(ignited.status).toBe(200);
    expect(ignited.body.state.burning).toBe(true);

    const moved = await desktopPost("/api/desktop-building/objects/physics-action").send({
      objectId: "lobby-reception-desk",
      action: "move",
    });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    expect(moved.body.state).toMatchObject({ physicsX: 49_977_802, physicsY: 49_999_201 });

    const snapshot = await desktopGet("/api/desktop-building/objects");
    expect(snapshot.body.objects).toContainEqual(expect.objectContaining({
      objectId: "lobby-reception-desk",
      physicsX: 49_977_802,
      damage: 20,
      burning: true,
    }));
  });
});