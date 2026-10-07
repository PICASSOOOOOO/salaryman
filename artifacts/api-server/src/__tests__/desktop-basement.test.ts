import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { and, desc, eq } from "drizzle-orm";
import {
  bankAccountsTable,
  bankTransactionsTable,
  db,
  desktopBasementAttackEventsTable,
  desktopBasementPestsTable,
  desktopBasementPresenceTable,
  desktopOfficePresenceTable,
  deviceLinksTable,
  playerLedgerTable,
  salarymanSavesTable,
  towerBuildingVitalsTable,
  usersTable,
} from "@workspace/db";
import { TOWER_ELEVATOR_POSITIONS } from "../lib/desktop-building-objects";
import desktopBasementRouter from "../routes/desktop-basement";

const app = express();
app.use(express.json());
app.use("/api", desktopBasementRouter);

const userIds: string[] = [];
const linkIds: string[] = [];
const pestIds: string[] = [];
const userId = `test-basement-${randomUUID()}`;
const deviceId = `basement-${randomUUID()}`;
const token = `test-token-${randomUUID()}`;
let linkId = "";

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

async function setLobbyPresence() {
  const now = new Date();
  await db.insert(desktopOfficePresenceTable).values({
    userId,
    linkId,
    city: "minx_city",
    roomKey: "lobby:minx_city",
    room: "lobby",
    floorNumber: 1,
    x: 49_978_650,
    y: 50_000_800,
    action: "stand",
    lastSeenAt: now,
  }).onConflictDoUpdate({
    target: desktopOfficePresenceTable.userId,
    set: {
      linkId,
      roomKey: "lobby:minx_city",
      room: "lobby",
      floorNumber: 1,
      x: 49_978_650,
      y: 50_000_800,
      action: "stand",
      lastSeenAt: now,
    },
  });
}

async function setUniform(worn: boolean) {
  return desktopPost("/api/desktop-building/basement/uniform").send({ worn });
}

async function enterBasement(x = 5_000, y = 5_000) {
  return desktopPost("/api/desktop-building/basement/presence").send({
    level: 1,
    x,
    y,
    action: "stand",
  });
}

describe("desktop basement survival authority", () => {
  beforeAll(async () => {
    const [user] = await db.insert(usersTable).values({
      id: userId,
      email: `${userId}@test.local`,
    }).returning();
    userIds.push(user.id);

    const [link] = await db.insert(deviceLinksTable).values({
      userId,
      desktopDeviceId: deviceId,
      desktopName: "Basement survival test",
      status: "linked",
      linkedAt: new Date(),
      desktopAccessTokenHash: createHash("sha256").update(token).digest("hex"),
      scopes: ["salaryman_app"],
    }).returning();
    linkId = link.id;
    linkIds.push(linkId);

    await db.insert(salarymanSavesTable).values({
      userId,
      slotIndex: 0,
      charName: "TEST",
      charClass: "salaryman",
      data: { energy: 100, energyUpdatedAt: new Date().toISOString() },
    });
    await db.insert(bankAccountsTable).values({
      userId,
      kind: "cash",
      label: "TEST WALLET",
      balance: 0,
      currency: "FIAT",
    });
    await setLobbyPresence();
  });

  afterAll(async () => {
    if (pestIds.length) {
      await db.delete(desktopBasementPestsTable)
        .where(eq(desktopBasementPestsTable.id, pestIds[0]));
    }
    await db.delete(desktopBasementPresenceTable).where(eq(desktopBasementPresenceTable.userId, userId));
    await db.delete(desktopOfficePresenceTable).where(eq(desktopOfficePresenceTable.userId, userId));
    if (userIds.length) {
      await db.delete(bankTransactionsTable).where(eq(bankTransactionsTable.userId, userId));
      await db.delete(bankAccountsTable).where(eq(bankAccountsTable.userId, userId));
      await db.delete(playerLedgerTable).where(eq(playerLedgerTable.userId, userId));
      await db.delete(salarymanSavesTable).where(eq(salarymanSavesTable.userId, userId));
      await db.delete(usersTable).where(eq(usersTable.id, userId));
    }
    if (linkIds.length) {
      await db.delete(deviceLinksTable).where(eq(deviceLinksTable.id, linkId));
    }
  });

  it("allows basement entry only from the lobby stairs", async () => {
    await db.update(desktopOfficePresenceTable)
      .set({ x: TOWER_ELEVATOR_POSITIONS[1].x, y: TOWER_ELEVATOR_POSITIONS[1].y, lastSeenAt: new Date() })
      .where(eq(desktopOfficePresenceTable.userId, userId));
    const blocked = await enterBasement(8_000, 8_000);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toContain("Approach the lobby stairs");
    const [presence] = await db.select().from(desktopBasementPresenceTable)
      .where(eq(desktopBasementPresenceTable.userId, userId));
    expect(presence).toBeUndefined();

    const elevatorCannotEnter = await enterBasement();
    expect(elevatorCannotEnter.status).toBe(409);
    expect(elevatorCannotEnter.body.error).toContain("lobby stairs");

    await setLobbyPresence();
    const allowed = await enterBasement();
    expect(allowed.status).toBe(200);
    expect(allowed.body.accessMode).toBe("stairs");
    expect(allowed.body.accessModeTemporary).toBe(true);
  });

  it("requires adjacent stair landings and returns to the lobby only from B1", async () => {
    await setLobbyPresence();
    expect((await enterBasement()).status).toBe(200);
    const skipLevel = await desktopPost("/api/desktop-building/basement/presence")
      .send({ level: 3, x: 5_000, y: 5_000, action: "stand" });
    expect(skipLevel.status).toBe(409);

    const b2 = await desktopPost("/api/desktop-building/basement/presence")
      .send({ level: 2, x: 5_000, y: 5_000, action: "stand" });
    expect(b2.status).toBe(200);
    const b4 = await desktopPost("/api/desktop-building/basement/presence")
      .send({ level: 4, x: 5_000, y: 5_000, action: "stand" });
    expect(b4.status).toBe(409);

    const exitFromB2 = await desktopPost("/api/desktop-building/basement/exit").send({});
    expect(exitFromB2.status).toBe(409);
    const b1 = await desktopPost("/api/desktop-building/basement/presence")
      .send({ level: 1, x: 5_000, y: 5_000, action: "stand" });
    expect(b1.status).toBe(200);
    const exit = await desktopPost("/api/desktop-building/basement/exit").send({});
    expect(exit.status).toBe(200);
    expect(exit.body.floor).toBe(1);
  });

  it("stores uniform state in the character save without creating basement presence", async () => {
    await db.delete(desktopBasementPresenceTable).where(eq(desktopBasementPresenceTable.userId, userId));
    await setLobbyPresence();

    const worn = await setUniform(true);
    expect(worn.status).toBe(200);
    expect(worn.body.uniformWorn).toBe(true);

    const [save] = await db.select().from(salarymanSavesTable)
      .where(and(eq(salarymanSavesTable.userId, userId), eq(salarymanSavesTable.slotIndex, 0)));
    expect(save.data.pestResponseUniformWorn).toBe(true);
    const [presence] = await db.select().from(desktopBasementPresenceTable)
      .where(eq(desktopBasementPresenceTable.userId, userId));
    expect(presence).toBeUndefined();
  });

  it("charges stamina once and pays a carcass bounty only once after pickup", async () => {
    const [pest] = await db.insert(desktopBasementPestsTable).values({
      buildingKey: "shadow_tower",
      level: 1,
      spawnNumber: Number.parseInt(randomUUID().slice(0, 8), 16) % 1_000_000_000,
      kind: "rat",
      x: 5_200,
      y: 5_000,
      health: 44,
      maxHealth: 44,
      status: "active",
      bountyFiat: 555,
      lastNpcWorkedAt: new Date(),
    }).returning();
    pestIds.push(pest.id);

    await setLobbyPresence();
    expect((await enterBasement()).status).toBe(200);
    const payload = (requestId: string) => ({
      pestId: pest.id,
      requestId,
      moveId: "roundhouse_kick",
    });
    const first = await desktopPost("/api/desktop-building/basement/attack")
      .send(payload(randomUUID()));
    expect(first.status).toBe(200);
    expect(first.body.stamina).toBe(91);

    const [priorAttack] = await db.select().from(desktopBasementAttackEventsTable)
      .where(eq(desktopBasementAttackEventsTable.userId, userId))
      .orderBy(desc(desktopBasementAttackEventsTable.createdAt))
      .limit(1);
    await db.update(desktopBasementAttackEventsTable)
      .set({ createdAt: new Date(Date.now() - 2_000) })
      .where(eq(desktopBasementAttackEventsTable.id, priorAttack.id));

    const second = await desktopPost("/api/desktop-building/basement/attack")
      .send(payload(randomUUID()));
    expect(second.status).toBe(200);
    expect(second.body.stamina).toBe(82);
    expect(second.body.pest.status).toBe("carcass");

    await db.update(desktopBasementPresenceTable).set({ x: 8_000, y: 8_000 })
      .where(eq(desktopBasementPresenceTable.userId, userId));
    const tooFar = await desktopPost("/api/desktop-building/basement/carcass/claim")
      .send({ pestId: pest.id });
    expect(tooFar.status).toBe(409);
    expect(tooFar.body.error).toContain("closer to the carcass");

    await db.update(desktopBasementPresenceTable).set({ x: 5_000, y: 5_000 })
      .where(eq(desktopBasementPresenceTable.userId, userId));
    const claim = await desktopPost("/api/desktop-building/basement/carcass/claim")
      .send({ pestId: pest.id });
    expect(claim.status).toBe(200);

    const sale = await desktopPost("/api/desktop-building/basement/carcass/sell")
      .send({ pestId: pest.id });
    expect(sale.status).toBe(200);
    expect(sale.body.bountyFiat).toBe(555);
    const duplicateSale = await desktopPost("/api/desktop-building/basement/carcass/sell")
      .send({ pestId: pest.id });
    expect(duplicateSale.status).toBe(409);

    const [wallet] = await db.select().from(bankAccountsTable)
      .where(eq(bankAccountsTable.userId, userId));
    expect(wallet.balance).toBe(555);
    const invalidMove = await desktopPost("/api/desktop-building/basement/attack").send({
      pestId: pest.id,
      requestId: randomUUID(),
      moveId: "toString",
    });
    expect(invalidMove.status).toBe(400);
  });

  it("requires the saved uniform for utility work and settles work once", async () => {
    const blockedTarget = await desktopPost("/api/desktop-building/basement/work/start")
      .send({ target: "toString" });
    expect(blockedTarget.status).toBe(400);

    await setLobbyPresence();
    expect((await enterBasement()).status).toBe(200);
    await setUniform(false);
    await db.update(desktopBasementPresenceTable)
      .set({ x: 7_500, y: 2_000 })
      .where(eq(desktopBasementPresenceTable.userId, userId));
    const noUniform = await desktopPost("/api/desktop-building/basement/work/start")
      .send({ target: "power" });
    expect(noUniform.status).toBe(409);

    await db.update(desktopBasementPresenceTable)
      .set({ x: 5_000, y: 5_000 })
      .where(eq(desktopBasementPresenceTable.userId, userId));
    await setUniform(true);
    await db.update(desktopBasementPresenceTable)
      .set({ x: 7_500, y: 2_000 })
      .where(eq(desktopBasementPresenceTable.userId, userId));
    const started = await desktopPost("/api/desktop-building/basement/work/start")
      .send({ target: "power" });
    expect(started.status).toBe(200);
    const sessionId = started.body.workSessionId as string;
    await db.update(desktopBasementPresenceTable)
      .set({ workStartedAt: new Date(Date.now() - 9_000) })
      .where(eq(desktopBasementPresenceTable.userId, userId));

    const completed = await desktopPost("/api/desktop-building/basement/work/complete")
      .send({ sessionId });
    expect(completed.status).toBe(200);
    expect(completed.body.target).toBe("power");
    expect(completed.body.stamina).toBe(76);

    const duplicate = await desktopPost("/api/desktop-building/basement/work/complete")
      .send({ sessionId });
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.duplicate).toBe(true);
    const [vitals] = await db.select().from(towerBuildingVitalsTable)
      .where(eq(towerBuildingVitalsTable.buildingKey, "shadow_tower"));
    expect(vitals).toBeDefined();
  });
});
