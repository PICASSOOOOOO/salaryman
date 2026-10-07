import { createHash, randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  bankAccountsTable,
  bankTransactionsTable,
  db,
  desktopBasementPresenceTable,
  desktopOfficePresenceTable,
  deviceLinksTable,
  playerLedgerTable,
  towerConstructionContributionsTable,
  usersTable,
  worldBuildPlansTable,
  type WorldBuildTask,
} from "@workspace/db";
import { TOWER_BASEMENT_STATIONS } from "../lib/tower-basement-layout";
import desktopConstructionRouter from "../routes/desktop-construction";

const app = express();
app.use(express.json());
app.use("/api", desktopConstructionRouter);

const userId = `test-tower-build-${randomUUID()}`;
const deviceId = `tower-build-${randomUUID()}`;
const token = `test-token-${randomUUID()}`;
const slug = `test-tower-build-${randomUUID()}`;
const floorNumber = 4;
const rewardPerTask = 175;
const station = TOWER_BASEMENT_STATIONS.power;

let linkId: string | null = null;
let planId: number | null = null;

const powerTaskId = "test-b5-power-export";
const constructionTaskId = "test-structural-frame";
const tasks: WorldBuildTask[] = [
  {
    id: powerTaskId,
    kind: "power_export",
    x: station.x,
    y: station.y,
    label: "EXPORT B5 BACKUP POWER",
    workBasementLevel: station.level,
  },
  {
    id: constructionTaskId,
    kind: "building",
    x: 10_000,
    y: 9_500,
    label: "RAISE THE PREFABRICATED FRAME",
  },
];

function desktopPost(path: string) {
  return request(app).post(path)
    .set("Authorization", `Bearer ${token}`)
    .set("x-salaryman-device-id", deviceId);
}

async function setBasementPresence(level: number, x: number, y: number): Promise<void> {
  if (!linkId) throw new Error("Test desktop link is not ready");
  const now = new Date();
  await db.insert(desktopBasementPresenceTable).values({
    userId,
    linkId,
    level,
    x,
    y,
    action: "stand",
    lastSeenAt: now,
  }).onConflictDoUpdate({
    target: desktopBasementPresenceTable.userId,
    set: { linkId, level, x, y, action: "stand", lastSeenAt: now },
  });
}

async function setOfficePresence(targetFloor: number, x: number, y: number): Promise<void> {
  if (!linkId) throw new Error("Test desktop link is not ready");
  const now = new Date();
  await db.insert(desktopOfficePresenceTable).values({
    userId,
    linkId,
    city: "minx_city",
    roomKey: `hallway:minx_city:${targetFloor}`,
    room: "hallway",
    floorNumber: targetFloor,
    x,
    y,
    action: "stand",
    lastSeenAt: now,
  }).onConflictDoUpdate({
    target: desktopOfficePresenceTable.userId,
    set: {
      linkId,
      roomKey: `hallway:minx_city:${targetFloor}`,
      room: "hallway",
      floorNumber: targetFloor,
      x,
      y,
      action: "stand",
      lastSeenAt: now,
    },
  });
}

async function ageTaskWork(taskId: string): Promise<void> {
  if (!planId) throw new Error("Test construction plan is not ready");
  const [plan] = await db.select().from(worldBuildPlansTable)
    .where(eq(worldBuildPlansTable.id, planId)).limit(1);
  if (!plan || !Array.isArray(plan.tasks)) throw new Error("Test construction tasks are missing");
  const currentTasks = plan.tasks as WorldBuildTask[];
  await db.update(worldBuildPlansTable).set({
    tasks: currentTasks.map((task) => task.id === taskId
      ? { ...task, workStartedAt: new Date(Date.now() - 9_000).toISOString() }
      : task),
  }).where(eq(worldBuildPlansTable.id, planId));
}

beforeAll(async () => {
  await db.insert(usersTable).values({
    id: userId,
    email: `${userId}@test.local`,
  });

  const [link] = await db.insert(deviceLinksTable).values({
    userId,
    desktopDeviceId: deviceId,
    desktopName: "Tower construction integration test",
    status: "linked",
    linkedAt: new Date(),
    desktopAccessTokenHash: createHash("sha256").update(token).digest("hex"),
    scopes: ["salaryman_app"],
  }).returning({ id: deviceLinksTable.id });
  linkId = link.id;

  await db.insert(bankAccountsTable).values({
    userId,
    kind: "cash",
    label: "TEST WALLET",
    balance: 0,
    currency: "FIAT",
  });

  const [plan] = await db.insert(worldBuildPlansTable).values({
    slug,
    title: "TEST TOWER CONSTRUCTION",
    description: "Integration test plan",
    region: "city",
    status: "active",
    areaX: 6_000,
    areaY: 7_000,
    areaW: 10_000,
    areaH: 11_000,
    tasks,
    rewardPerTask,
    createdByUserId: userId,
    createdByName: "TEST",
    targetBuildingKey: "shadow_tower",
    targetFloorNumber: floorNumber,
  }).returning({ id: worldBuildPlansTable.id });
  planId = plan.id;
});

afterAll(async () => {
  if (planId) {
    await db.delete(towerConstructionContributionsTable)
      .where(eq(towerConstructionContributionsTable.planId, planId));
    await db.delete(worldBuildPlansTable).where(eq(worldBuildPlansTable.id, planId));
  }
  await db.delete(desktopBasementPresenceTable).where(eq(desktopBasementPresenceTable.userId, userId));
  await db.delete(desktopOfficePresenceTable).where(eq(desktopOfficePresenceTable.userId, userId));
  await db.delete(bankTransactionsTable).where(eq(bankTransactionsTable.userId, userId));
  await db.delete(bankAccountsTable).where(eq(bankAccountsTable.userId, userId));
  await db.delete(playerLedgerTable).where(eq(playerLedgerTable.userId, userId));
  if (linkId) await db.delete(deviceLinksTable).where(eq(deviceLinksTable.id, linkId));
  await db.delete(usersTable).where(eq(usersTable.id, userId));
});

describe("Tower area-powered construction contracts", () => {
  it("requires a linked desktop credential", async () => {
    const response = await request(app)
      .post("/api/desktop-building/construction/work/start")
      .send({ planId, taskId: powerTaskId });

    expect(response.status).toBe(401);
  });

  it("requires the B5 export and on-site work, then settles each task once", async () => {
    if (!planId) throw new Error("Test construction plan is not ready");

    await setOfficePresence(floorNumber, 10_000, 9_500);
    const blockedBeforeExport = await desktopPost("/api/desktop-building/construction/work/start")
      .send({ planId, taskId: constructionTaskId });
    expect(blockedBeforeExport.status).toBe(409);
    expect(blockedBeforeExport.body.error).toContain("Export power from B5");

    await setBasementPresence(station.level - 1, station.x, station.y);
    const wrongBasement = await desktopPost("/api/desktop-building/construction/work/start")
      .send({ planId, taskId: powerTaskId });
    expect(wrongBasement.status).toBe(409);

    await setBasementPresence(station.level, station.x, station.y);
    const powerStart = await desktopPost("/api/desktop-building/construction/work/start")
      .send({ planId, taskId: powerTaskId });
    expect(powerStart.status).toBe(200);

    const earlyPowerComplete = await desktopPost("/api/desktop-building/construction/work/complete")
      .send({ planId, taskId: powerTaskId, sessionId: powerStart.body.sessionId });
    expect(earlyPowerComplete.status).toBe(409);
    expect(earlyPowerComplete.body.error).toContain("full work session");

    await ageTaskWork(powerTaskId);
    const powerComplete = await desktopPost("/api/desktop-building/construction/work/complete")
      .send({ planId, taskId: powerTaskId, sessionId: powerStart.body.sessionId });
    expect(powerComplete.status).toBe(200);
    expect(powerComplete.body.powered).toBe(true);

    const frameStart = await desktopPost("/api/desktop-building/construction/work/start")
      .send({ planId, taskId: constructionTaskId });
    expect(frameStart.status).toBe(200);

    const earlyFrameComplete = await desktopPost("/api/desktop-building/construction/work/complete")
      .send({ planId, taskId: constructionTaskId, sessionId: frameStart.body.sessionId });
    expect(earlyFrameComplete.status).toBe(409);

    await ageTaskWork(constructionTaskId);
    await setOfficePresence(floorNumber + 1, 10_000, 9_500);
    const awayFromSite = await desktopPost("/api/desktop-building/construction/work/complete")
      .send({ planId, taskId: constructionTaskId, sessionId: frameStart.body.sessionId });
    expect(awayFromSite.status).toBe(409);
    expect(awayFromSite.body.error).toContain("Return to the active construction task");

    await setOfficePresence(floorNumber, 10_000, 9_500);
    const frameComplete = await desktopPost("/api/desktop-building/construction/work/complete")
      .send({ planId, taskId: constructionTaskId, sessionId: frameStart.body.sessionId });
    expect(frameComplete.status).toBe(200);
    expect(frameComplete.body.rewardFiat).toBe(rewardPerTask);

    const replay = await desktopPost("/api/desktop-building/construction/work/complete")
      .send({ planId, taskId: constructionTaskId, sessionId: frameStart.body.sessionId });
    expect(replay.status).toBe(409);

    const [wallet] = await db.select().from(bankAccountsTable)
      .where(eq(bankAccountsTable.userId, userId));
    const contributions = await db.select().from(towerConstructionContributionsTable)
      .where(eq(towerConstructionContributionsTable.planId, planId));
    const transactions = await db.select().from(bankTransactionsTable)
      .where(eq(bankTransactionsTable.userId, userId));

    expect(wallet.balance).toBe(rewardPerTask * 2);
    expect(contributions).toHaveLength(2);
    expect(transactions).toHaveLength(2);
  });
});
