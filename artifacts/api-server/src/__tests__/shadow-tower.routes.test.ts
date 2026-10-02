import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import {
  bankAccountsTable, bankTransactionsTable, botMarketplaceTable, botsTable, db, orgMembersTable, organizationsTable,
  shadowTowerFloorsTable, shadowTowerWorkstationAssignmentsTable, userFeaturesTable, usersTable,
} from "@workspace/db";
import { getShadowTowerOfficeUnitGeometry, isCommercialShadowTowerFloor, quoteShadowTowerFloor, quoteShadowTowerOfficeUnitDetail, SHADOW_TOWER_FLOOR_ENVELOPE, SHADOW_TOWER_LISTINGS } from "@workspace/api-zod/shadow-tower";
import { minimumPropertyStartingFiat } from "@workspace/api-zod/property-market";
import shadowTowerRouter from "../routes/shadow-tower";
import botsRouter from "../routes/bots";
import {
  isPublicSaleFloor,
  officeOrdinal,
  PUBLIC_SALE_FLOOR_COUNT,
  TOTAL_PUBLIC_OFFICES,
} from "../lib/shadow-tower-demand";

const auth = { id: "", email: "" };
const users: string[] = []; const orgs: number[] = []; const floors: number[] = []; const bots: number[] = [];
const app = express();
app.use(express.json());
app.use((req, _res, next) => { (req as any).isAuthenticated = () => true; (req as any).user = auth; next(); });
app.use("/api", shadowTowerRouter);
app.use("/api", botsRouter);
function actAs(id: string) { auth.id = id; auth.email = `${id}@test.local`; }
async function user() {
  const email = `tower-${randomUUID()}@test.local`;
  const [created] = await db.insert(usersTable).values({ email }).returning();
  users.push(created.id);
  await db.insert(bankAccountsTable).values({ userId: created.id, kind: "checking", label: "CHECKING", balance: 4_000_000 });
  return created.id;
}
async function freeSaleFloor(city: "minx_city" | "huda_city") {
  const rows = await db.select({ floorNumber: shadowTowerFloorsTable.floorNumber })
    .from(shadowTowerFloorsTable)
    .where(eq(shadowTowerFloorsTable.city, city));
  const occupied = new Set(rows.map((row) => row.floorNumber));
  const floorNumber = Array.from({ length: 50 }, (_, index) => index + 5)
    .find((candidate) => !occupied.has(candidate));
  if (!floorNumber) throw new Error(`No free public sale floor remains in ${city}`);
  return floorNumber;
}
async function freeReservedFloor(city: "minx_city" | "huda_city") {
  const rows = await db.select({ floorNumber: shadowTowerFloorsTable.floorNumber })
    .from(shadowTowerFloorsTable)
    .where(eq(shadowTowerFloorsTable.city, city));
  const occupied = new Set(rows.map((row) => row.floorNumber));
  const floorNumber = Array.from({ length: 13 }, (_, index) => index + 55)
    .find((candidate) => candidate <= 67 && !occupied.has(candidate));
  if (!floorNumber) throw new Error(`No free reserved fixture floor remains in ${city}`);
  return floorNumber;
}
async function org(ownerId: string) {
  const [created] = await db.insert(organizationsTable).values({ name: `TOWER ${randomUUID()}`, ownerUserId: ownerId }).returning();
  orgs.push(created.id);
  await db.insert(orgMembersTable).values({ orgId: created.id, userId: ownerId, role: "owner", status: "active" });
  return created.id;
}
afterAll(async () => {
  if (floors.length) await db.delete(shadowTowerWorkstationAssignmentsTable).where(inArray(shadowTowerWorkstationAssignmentsTable.floorId, floors));
  if (floors.length) await db.delete(shadowTowerFloorsTable).where(inArray(shadowTowerFloorsTable.id, floors));
  if (bots.length) await db.delete(botsTable).where(inArray(botsTable.id, bots));
  if (orgs.length) { await db.delete(orgMembersTable).where(inArray(orgMembersTable.orgId, orgs)); await db.delete(organizationsTable).where(inArray(organizationsTable.id, orgs)); }
  if (users.length) { await db.delete(userFeaturesTable).where(inArray(userFeaturesTable.userId, users)); await db.delete(bankTransactionsTable).where(inArray(bankTransactionsTable.userId, users)); await db.delete(bankAccountsTable).where(inArray(bankAccountsTable.userId, users)); await db.delete(usersTable).where(inArray(usersTable.id, users)); }
});

describe("Shadow Tower routes", () => {
  it("returns the exact public shared catalog", async () => {
    const response = await request(app).get("/api/shadow-tower/catalog");
    expect(response.status).toBe(200);
    expect(response.body.listings).toEqual(Object.values(SHADOW_TOWER_LISTINGS));
  });

  it("settles a server-priced numbered purchase once and hydrates it safely", async () => {
    const id = await user(); actAs(id); const requestId = randomUUID();
    const floorNumber = await freeSaleFloor("minx_city");
    const before = (await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.userId, id)))[0].balance;
    const first = await request(app).post("/api/shadow-tower/floors").send({ city: "minx_city", floorNumber, archetype: "founder_team", tenure: "own", requestId });
    expect(first.status).toBe(201); floors.push(first.body.floor.id);
    expect(first.body.basePrice).toBe(quoteShadowTowerFloor("founder_team", floorNumber, "own"));
    const retry = await request(app).post("/api/shadow-tower/floors").send({ city: "minx_city", floorNumber, archetype: "founder_team", tenure: "own", requestId });
    expect(retry.status).toBe(200); expect(retry.body.duplicate).toBe(true);
    const after = (await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.userId, id)))[0].balance;
    expect(after).toBe(before - first.body.price);
    const mine = await request(app).get("/api/shadow-tower/floors/current");
    expect(mine.status).toBe(200); expect(mine.body.floor).toMatchObject({ city: "minx_city", floorNumber }); expect(JSON.stringify(mine.body)).not.toContain("passwordHash");
    const units = await request(app).get(`/api/shadow-tower/floors/minx_city/${floorNumber}/units`);
    expect(units.status).toBe(200);
    expect(units.body.units.map((unit: { status: string }) => unit.status)).toEqual(["occupied"]);
  });

  it("provisions the explicitly selected Company card for a small roster", async () => {
    const id = await user(); actAs(id);
    const floorNumber = await freeSaleFloor("huda_city");
    const response = await request(app).post("/api/shadow-tower/floors").send({
      city: "huda_city", floorNumber, archetype: "company", tenure: "own", requestId: randomUUID(),
    });
    expect(response.status).toBe(201);
    floors.push(response.body.floor.id);
    expect(response.body.floor.archetype).toBe("company");
    expect(response.body.basePrice).toBe(quoteShadowTowerFloor("company", floorNumber, "own"));
    const snapshot = await request(app).get(`/api/shadow-tower/floors/huda_city/${floorNumber}`);
    expect(snapshot.body.plan.objects.filter((object: { kind: string }) => object.kind === "workstation")).toHaveLength(0);
    expect(snapshot.body.plan.objects.filter((object: { kind: string }) => object.kind === "office_unit")).toHaveLength(1);
    expect(snapshot.body.plan.objects.filter((object: { kind: string }) => object.kind === "executive_desk")).toHaveLength(1);
    expect(snapshot.body.plan.objects.filter((object: { kind: string }) => object.kind === "terminal")).toHaveLength(1);
  });

  it("keeps subdivision geometry inside the canonical envelope and exposes exactly 200 offices across 50 sale floors", async () => {
    for (const count of [2, 3, 4]) {
      const geometry = getShadowTowerOfficeUnitGeometry(count);
      expect(geometry.reduce((total, unit) => total + unit.squareMeters, 0)).toBe(SHADOW_TOWER_FLOOR_ENVELOPE.squareMeters);
      // Four-suite geometry keeps the authored circulation margin inside the
      // envelope; one-to-three legacy subdivisions span the full width.
      expect(geometry.at(-1)!.xPixels + geometry.at(-1)!.widthPixels)
        .toBeLessThanOrEqual(SHADOW_TOWER_FLOOR_ENVELOPE.widthPixels);
    }
    expect(quoteShadowTowerFloor("founder_team", 1, "own")).toBe(minimumPropertyStartingFiat());
    const unitQuote = quoteShadowTowerOfficeUnitDetail("founder_team", 20, 2, 3, "own");
    expect(unitQuote.squareMeters).toBe(SHADOW_TOWER_FLOOR_ENVELOPE.squareMeters / 3);
    expect(unitQuote.squarePixels).toBe(SHADOW_TOWER_FLOOR_ENVELOPE.widthPixels * SHADOW_TOWER_FLOOR_ENVELOPE.heightPixels / 3);
    expect(unitQuote.totalFiat).toBe(Math.max(
      Math.round(unitQuote.squareMeters * unitQuote.fiatPerSquareMeter * unitQuote.verticalMultiplier),
      Math.round(minimumPropertyStartingFiat() * unitQuote.squareMeters / SHADOW_TOWER_FLOOR_ENVELOPE.squareMeters),
    ));
    expect(PUBLIC_SALE_FLOOR_COUNT).toBe(50);
    expect(TOTAL_PUBLIC_OFFICES).toBe(200);
    expect(isPublicSaleFloor(5)).toBe(true);
    expect(isPublicSaleFloor(54)).toBe(true);
    expect(isPublicSaleFloor(40)).toBe(true);
    expect(isPublicSaleFloor(52)).toBe(true);
    expect(isPublicSaleFloor(55)).toBe(false);
    expect(officeOrdinal(54, 4)).toBe(199);
    expect(isCommercialShadowTowerFloor(5)).toBe(true);
    expect(isCommercialShadowTowerFloor(54)).toBe(true);
    expect(isCommercialShadowTowerFloor(40)).toBe(true);
    expect(isCommercialShadowTowerFloor(52)).toBe(true);
    expect(isCommercialShadowTowerFloor(55)).toBe(false);
    expect(isCommercialShadowTowerFloor(65)).toBe(false);
    expect(isCommercialShadowTowerFloor(67)).toBe(false);
    const id = await user(); actAs(id);
    for (const floorNumber of [55, 62, 64, 65, 66, 67]) {
      expect((await request(app).post("/api/shadow-tower/floors").send({
        city: "minx_city", floorNumber, archetype: "founder_team", tenure: "own", requestId: randomUUID(),
      })).status).toBe(403);
    }
    expect((await request(app).post("/api/shadow-tower/floors").send({
      city: "minx_city", floorNumber: 68, archetype: "founder_team", tenure: "own", requestId: randomUUID(),
    })).status).toBe(403);
    const availability = await request(app).get("/api/shadow-tower/availability?city=minx_city");
    expect(availability.status).toBe(200);
    expect(availability.body.floors).toHaveLength(50);
    expect(availability.body.floors[0].floorNumber).toBe(5);
    expect(availability.body.floors.at(-1).floorNumber).toBe(54);
    expect(availability.body.floors.reduce((total: number, floor: { totalOffices: number }) => total + floor.totalOffices, 0)).toBe(200);
  });

  it("denies ordinary org members access management and purchase", async () => {
    const owner = await user(); const member = await user(); const orgId = await org(owner);
    await db.insert(orgMembersTable).values({ orgId, userId: member, role: "specialist", status: "active" });
    const floorNumber = await freeSaleFloor("huda_city");
    const [floor] = await db.insert(shadowTowerFloorsTable).values({ city: "huda_city", floorNumber, orgId, tenure: "own", archetype: "founder_team", passwordHash: "never-disclose" }).returning(); floors.push(floor.id);
    actAs(member);
    expect((await request(app).put(`/api/shadow-tower/floors/${floor.id}/access`).send({ password: "new-password" })).status).toBe(403);
    expect((await request(app).post("/api/shadow-tower/floors").send({ city: "huda_city", floorNumber: 60, orgId, archetype: "founder_team", tenure: "lease", requestId: randomUUID() })).status).toBe(403);
    const snapshot = await request(app).get(`/api/shadow-tower/floors/huda_city/${floorNumber}`);
    expect(snapshot.status).toBe(403);
  });

  it("checks a Tower password server-side without exposing the stored verifier", async () => {
    const owner = await user(); const visitor = await user();
    const floorNumber = await freeReservedFloor("minx_city");
    const [floor] = await db.insert(shadowTowerFloorsTable).values({
      city: "minx_city", floorNumber, ownerUserId: owner, tenure: "own", archetype: "company",
    }).returning();
    floors.push(floor.id);
    actAs(owner);
    const configured = await request(app).put(`/api/shadow-tower/floors/${floor.id}/access`).send({ password: "tower-secret" });
    expect(configured.status).toBe(200);
    expect(configured.body.floor.hasPassword).toBe(true);
    expect(JSON.stringify(configured.body)).not.toContain("passwordHash");

    actAs(visitor);
    expect((await request(app).get(`/api/shadow-tower/floors/minx_city/${floorNumber}`)).status).toBe(403);
    expect((await request(app).get(`/api/shadow-tower/floors/minx_city/${floorNumber}`).set("x-shadow-tower-password", "wrong")).status).toBe(403);
    const opened = await request(app).get(`/api/shadow-tower/floors/minx_city/${floorNumber}`).set("x-shadow-tower-password", "tower-secret");
    expect(opened.status).toBe(200);
    expect(opened.body.plan.objects.find((object: { kind: string }) => object.kind === "office_unit").door).toMatchObject({ access: "password", side: "bottom" });
    expect(JSON.stringify(opened.body)).not.toContain("passwordHash");
  });

  it("rejects assignment when every workstation is occupied and rejects expired entry", async () => {
    const id = await user(); actAs(id);
    const floorNumber = await freeReservedFloor("huda_city");
    const [floor] = await db.insert(shadowTowerFloorsTable).values({ city: "huda_city", floorNumber, ownerUserId: id, tenure: "own", archetype: "founder_team" }).returning(); floors.push(floor.id);
    for (let i = 0; i < 6; i++) await db.insert(shadowTowerWorkstationAssignmentsTable).values({ floorId: floor.id, workstationKey: `workstation-${i + 1}`, assigneeType: "human", assigneeUserId: i === 0 ? id : `other-${i}`, assignedByUserId: id });
    expect((await request(app).post(`/api/shadow-tower/floors/${floor.id}/workstations`).send({ assigneeType: "human", assigneeUserId: id })).status).toBe(409);
    const expiredFloorNumber = await freeReservedFloor("huda_city");
    const [expired] = await db.insert(shadowTowerFloorsTable).values({ city: "huda_city", floorNumber: expiredFloorNumber, ownerUserId: id, tenure: "lease", leaseExpiresAt: new Date(Date.now() - 1_000), archetype: "founder_team" }).returning(); floors.push(expired.id);
    expect((await request(app).get(`/api/shadow-tower/floors/huda_city/${expiredFloorNumber}`)).status).toBe(410);
  });

  it("keeps an explicit personal-floor selection when an org floor is also accessible", async () => {
    const id = await user(); const orgId = await org(id); actAs(id);
    const orgFloorNumber = await freeReservedFloor("minx_city");
    const personalFloorNumber = await freeReservedFloor("huda_city");
    const [orgFloor] = await db.insert(shadowTowerFloorsTable).values({
      city: "minx_city", floorNumber: orgFloorNumber, orgId, tenure: "own", archetype: "founder_team",
    }).returning();
    const [personalFloor] = await db.insert(shadowTowerFloorsTable).values({
      city: "huda_city", floorNumber: personalFloorNumber, ownerUserId: id, tenure: "own", archetype: "founder_team",
    }).returning();
    floors.push(orgFloor.id, personalFloor.id);

    const selected = await request(app).put("/api/shadow-tower/floors/current").send({ floorId: personalFloor.id });
    expect(selected.status).toBe(200);
    expect(selected.body.floor.id).toBe(personalFloor.id);

    const current = await request(app).get("/api/shadow-tower/floors/current");
    expect(current.status).toBe(200);
    expect(current.body.floor.id).toBe(personalFloor.id);
  });

  it("refuses to activate a bot until a paid workstation exists", async () => {
    const id = await user(); const orgId = await org(id); actAs(id);
    await db.insert(userFeaturesTable).values({
      userId: id,
      featureKey: "claw_bot",
      grantedBy: "test",
      stripeSubscriptionId: `sub_test_${randomUUID()}`,
    });
    const floorNumber = await freeReservedFloor("minx_city");
    const [floor] = await db.insert(shadowTowerFloorsTable).values({
      city: "minx_city", floorNumber, ownerUserId: id, tenure: "own", archetype: "founder_team",
    }).returning();
    floors.push(floor.id);
    const [marketplaceItem] = await db.select().from(botMarketplaceTable)
      .where(eq(botMarketplaceTable.priceMonthly, 0)).limit(1);
    expect(marketplaceItem).toBeTruthy();
    const [bot] = await db.insert(botsTable).values({
      ownerId: id, orgId, name: `Tower Bot ${randomUUID()}`, status: "paused",
      marketplaceItemId: marketplaceItem.id,
    }).returning();
    bots.push(bot.id);

    const activated = await request(app).put(`/api/bots/${bot.id}`).send({ status: "active" });
    expect(activated.status).toBe(409);
    const [assignment] = await db.select().from(shadowTowerWorkstationAssignmentsTable)
      .where(and(eq(shadowTowerWorkstationAssignmentsTable.floorId, floor.id), eq(shadowTowerWorkstationAssignmentsTable.botId, bot.id)));
    expect(assignment).toBeUndefined();
  });
});