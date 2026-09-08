import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { Router, type NextFunction, type Request, type Response } from "express";
import { and, eq, or, sql } from "drizzle-orm";
import {
  botsTable, db, hasRoleAccess, orgMembersTable, shadowTowerFloorsTable, shadowTowerOfficeUnitsTable,
  shadowTowerSelectedFloorsTable, shadowTowerWorkstationAssignmentsTable, type OrgRole,
} from "@workspace/db";
import {
  BUSINESS_FLOOR_KINDS, BUSINESS_FLOOR_TEMPLATES, SHADOW_TOWER_LISTINGS, consolidateShadowTowerBots, getShadowTowerPlan,
  getShadowTowerOfficeUnitGeometry, isCommercialShadowTowerFloor, isSupportedShadowTowerUpgrade, quoteBusinessFitout, quoteShadowTowerFloor, quoteShadowTowerOfficeUnit, quoteShadowTowerOfficeUnitDetail, selectShadowTowerArchetype, shadowTowerHallwaySchema, SHADOW_TOWER_FLOOR_ENVELOPE, type BusinessFloorKind, type BusinessFloorLaborMode, type ShadowTowerCity,
} from "@workspace/api-zod/shadow-tower";
import { quoteMarketAdjustedFiat } from "@workspace/api-zod/property-market";
import { creditFiat, spendFiat } from "../lib/fiat-wallet";
import { canDoInOrg } from "../lib/org-permissions";
import { isOwnerEmail, isPicassoOrgMemberEmail } from "../lib/plan";
import { getMarketIndex } from "./real-estate";

const router = Router();
const cities = new Set<ShadowTowerCity>(["minx_city", "huda_city"]);
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated?.() || !req.user) { res.status(401).json({ error: "Login required" }); return; }
  next();
}
function userId(req: Request) { return String((req.user as { id?: string })?.id ?? ""); }
const scryptAsync = promisify(scrypt);
async function digest(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${(await scryptAsync(password, salt, 64) as Buffer).toString("hex")}`;
}
async function passwordMatches(hash: string | null, password: unknown) {
  if (!hash) return false;
  const [salt, encoded] = hash.split(":");
  if (!salt || !encoded) return false;
  const expected = Buffer.from(encoded, "hex"); const received = await scryptAsync(String(password ?? ""), salt, 64) as Buffer;
  return expected.length === received.length && timingSafeEqual(expected, received);
}
async function membership(userIdValue: string, orgId: number) {
  const [member] = await db.select({ role: orgMembersTable.role }).from(orgMembersTable)
    .where(and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.userId, userIdValue), eq(orgMembersTable.status, "active"))).limit(1);
  return member?.role as OrgRole | undefined;
}
async function canAccess(userIdValue: string, floor: typeof shadowTowerFloorsTable.$inferSelect, password?: unknown) {
  if (floor.ownerUserId === userIdValue) return true;
  if (floor.orgId) {
    const role = await membership(userIdValue, floor.orgId);
    const classificationRole: OrgRole =
      floor.classification === "restricted" ? "owner"
        : floor.classification === "confidential" ? "director"
          : floor.classification === "internal" ? "specialist"
            : "specialist";
    const permission = await canDoInOrg(userIdValue, floor.orgId, floor.accessPermission as Parameters<typeof canDoInOrg>[2]);
    if (
      role
      && hasRoleAccess(role, floor.minAccessRole as OrgRole)
      && hasRoleAccess(role, classificationRole)
      && permission.allowed
    ) return true;
  }
  return passwordMatches(floor.passwordHash, password);
}
function safeFloor(floor: typeof shadowTowerFloorsTable.$inferSelect) {
  const { passwordHash: _passwordHash, ...safe } = floor;
  return { ...safe, hasPassword: Boolean(floor.passwordHash) };
}

router.get("/shadow-tower/catalog", (_req, res) => res.json({ listings: Object.values(SHADOW_TOWER_LISTINGS) }));
router.get("/shadow-tower/availability", async (req, res) => {
  const city = String(req.query.city ?? "") as ShadowTowerCity;
  if (!cities.has(city)) { res.status(400).json({ error: "Valid city required" }); return; }
  const occupied = await db.select({
    floorNumber: shadowTowerFloorsTable.floorNumber,
    officeCount: shadowTowerFloorsTable.officeCount,
    unitNumber: shadowTowerOfficeUnitsTable.unitNumber,
    status: shadowTowerOfficeUnitsTable.status,
  }).from(shadowTowerFloorsTable)
    .leftJoin(shadowTowerOfficeUnitsTable, eq(shadowTowerOfficeUnitsTable.floorId, shadowTowerFloorsTable.id))
    .where(eq(shadowTowerFloorsTable.city, city));
  const byFloor = new Map<number, typeof occupied>();
  for (const row of occupied) byFloor.set(row.floorNumber, [...(byFloor.get(row.floorNumber) ?? []), row]);
  const floors = Array.from({ length: 60 }, (_, index) => index + 5)
    .filter(isCommercialShadowTowerFloor)
    .map((floorNumber) => {
      const rows = byFloor.get(floorNumber) ?? [];
      const unavailable = rows.filter((row) => row.status === "occupied").length;
      return {
        floorNumber,
        totalOffices: 4,
        availableOffices: Math.max(0, 4 - unavailable),
        status: unavailable === 0 ? "open" : unavailable >= 4 ? "full" : "limited",
      };
    });
  res.json({ city, floors });
});
router.get("/shadow-tower/marketplace", async (req, res) => {
  const city = String(req.query.city ?? "") as ShadowTowerCity;
  if (!cities.has(city)) { res.status(400).json({ error: "Valid city required" }); return; }
  const rows = await db
    .select({
      floorId: shadowTowerFloorsTable.id,
      floorNumber: shadowTowerFloorsTable.floorNumber,
      city: shadowTowerFloorsTable.city,
      archetype: shadowTowerFloorsTable.archetype,
      officeCount: shadowTowerFloorsTable.officeCount,
      unitNumber: shadowTowerOfficeUnitsTable.unitNumber,
      status: shadowTowerOfficeUnitsTable.status,
    })
    .from(shadowTowerOfficeUnitsTable)
    .innerJoin(shadowTowerFloorsTable, eq(shadowTowerOfficeUnitsTable.floorId, shadowTowerFloorsTable.id))
    .where(and(
      eq(shadowTowerFloorsTable.city, city),
      or(eq(shadowTowerOfficeUnitsTable.status, "for_sale"), eq(shadowTowerOfficeUnitsTable.status, "for_lease")),
    ));
  const market = await getMarketIndex();
  const listings = rows.map((row) => {
    const tenure = row.status === "for_sale" ? "own" : "lease";
    const baseFiat = quoteShadowTowerOfficeUnit(
      row.archetype as keyof typeof SHADOW_TOWER_LISTINGS,
      row.floorNumber,
      row.unitNumber,
      row.officeCount,
      tenure,
    );
    const quote = { ...quoteMarketAdjustedFiat(baseFiat, market.multiplier), asOf: market.asOf, status: market.status };
    return {
      floorId: row.floorId,
      floorNumber: row.floorNumber,
      city: row.city,
      archetype: row.archetype,
      unitNumber: row.unitNumber,
      listingType: tenure === "own" ? "sale" : "rent_or_sublet",
      tenure,
      priceFiat: quote.totalFiat,
      marketQuote: quote,
    };
  });
  res.json({ city, listings });
});
router.get("/shadow-tower/business-templates", (_req, res) => res.json({
  templates: Object.values(BUSINESS_FLOOR_TEMPLATES),
  customizationOptions: [
    { id: "palette:neon", label: "Neon palette" }, { id: "palette:industrial", label: "Industrial palette" },
    { id: "signage:custom", label: "Custom sign package" }, { id: "fixture:premium", label: "Premium fixtures" },
    { id: "fixture:security", label: "Security package" }, { id: "fixture:guest", label: "Guest comfort package" },
  ],
}));

/** Public market snapshot: no floor verifier or occupant identity is returned. */
router.get("/shadow-tower/floors/:city/:floorNumber/units", async (req, res) => {
  const city = String(req.params.city) as ShadowTowerCity;
  const floorNumber = Number(req.params.floorNumber);
  if (!cities.has(city) || !Number.isInteger(floorNumber)) { res.status(400).json({ error: "Invalid numbered floor identity" }); return; }
  const [floor] = await db.select().from(shadowTowerFloorsTable)
    .where(and(eq(shadowTowerFloorsTable.city, city), eq(shadowTowerFloorsTable.floorNumber, floorNumber))).limit(1);
  if (!floor) { res.status(404).json({ error: "Floor not found" }); return; }
  const units = await db.select().from(shadowTowerOfficeUnitsTable).where(eq(shadowTowerOfficeUnitsTable.floorId, floor.id));
  const geometry = getShadowTowerOfficeUnitGeometry(floor.officeCount);
  const hallway = shadowTowerHallwaySchema.safeParse((floor.settings as Record<string, unknown>)?.hallway);
  const market = await getMarketIndex();
  const marketQuote = (baseFiat: number) => ({ ...quoteMarketAdjustedFiat(baseFiat, market.multiplier), asOf: market.asOf, status: market.status });
  res.json({
    floor: { id: floor.id, city: floor.city, floorNumber: floor.floorNumber, archetype: floor.archetype, officeCount: floor.officeCount, dimensions: SHADOW_TOWER_FLOOR_ENVELOPE },
    hallway: hallway.success ? hallway.data : null,
    units: units.sort((a, b) => a.unitNumber - b.unitNumber).map((unit) => ({
      unitNumber: unit.unitNumber, status: unit.status, tenure: unit.tenure, leaseExpiresAt: unit.leaseExpiresAt,
      geometry: geometry.find((shape) => shape.unitNumber === unit.unitNumber),
      quote: { sale: unit.unitNumber <= floor.officeCount ? quoteShadowTowerOfficeUnitDetail(floor.archetype as keyof typeof SHADOW_TOWER_LISTINGS, floor.floorNumber, unit.unitNumber, floor.officeCount, "own") : null, lease: unit.unitNumber <= floor.officeCount ? quoteShadowTowerOfficeUnitDetail(floor.archetype as keyof typeof SHADOW_TOWER_LISTINGS, floor.floorNumber, unit.unitNumber, floor.officeCount, "lease") : null,
        saleFiat: unit.unitNumber <= floor.officeCount ? quoteShadowTowerOfficeUnit(floor.archetype as keyof typeof SHADOW_TOWER_LISTINGS, floor.floorNumber, unit.unitNumber, floor.officeCount, "own") : null, leaseFiat: unit.unitNumber <= floor.officeCount ? quoteShadowTowerOfficeUnit(floor.archetype as keyof typeof SHADOW_TOWER_LISTINGS, floor.floorNumber, unit.unitNumber, floor.officeCount, "lease") : null,
        marketSale: unit.unitNumber <= floor.officeCount ? marketQuote(quoteShadowTowerOfficeUnit(floor.archetype as keyof typeof SHADOW_TOWER_LISTINGS, floor.floorNumber, unit.unitNumber, floor.officeCount, "own")) : null,
        marketLease: unit.unitNumber <= floor.officeCount ? marketQuote(quoteShadowTowerOfficeUnit(floor.archetype as keyof typeof SHADOW_TOWER_LISTINGS, floor.floorNumber, unit.unitNumber, floor.officeCount, "lease")) : null },
    })),
  });
});

// Hydration endpoint: persisted selection wins; deterministic fallback never leaks a verifier.
router.get("/shadow-tower/floors/current", requireAuth, async (req, res) => {
  const actor = userId(req); const now = new Date();
  const candidates = (await db.select().from(shadowTowerFloorsTable))
    .filter((floor) => !floor.leaseExpiresAt || floor.leaseExpiresAt > now)
    .sort((a, b) => a.id - b.id);
  const [selected] = await db.select().from(shadowTowerSelectedFloorsTable).where(eq(shadowTowerSelectedFloorsTable.userId, actor)).limit(1);
  let floor = selected ? candidates.find((candidate) => candidate.id === selected.floorId && candidate.ownerUserId === actor) : undefined;
  if (!floor && selected) {
    const selectedFloor = candidates.find((candidate) => candidate.id === selected.floorId);
    if (selectedFloor && await canAccess(actor, selectedFloor, req.header("x-shadow-tower-password"))) floor = selectedFloor;
  }
  if (!floor) {
    for (const candidate of candidates.filter((row) => row.orgId != null)) {
      if (await canAccess(actor, candidate, req.header("x-shadow-tower-password"))) { floor = candidate; break; }
    }
  }
  floor ??= candidates.find((candidate) => candidate.ownerUserId === actor);
  if (!floor) { res.status(404).json({ error: "No active accessible Shadow Tower floor" }); return; }
  const [assignments, bots] = await Promise.all([
    db.select().from(shadowTowerWorkstationAssignmentsTable).where(eq(shadowTowerWorkstationAssignmentsTable.floorId, floor.id)),
    floor.orgId ? db.select().from(botsTable).where(and(eq(botsTable.orgId, floor.orgId), eq(botsTable.status, "active"))) : db.select().from(botsTable).where(and(eq(botsTable.ownerId, floor.ownerUserId!), eq(botsTable.status, "active"))),
  ]);
  const canManage = floor.ownerUserId === actor || !!(floor.orgId && (await canDoInOrg(actor, floor.orgId, "org.settings")).allowed);
  res.json({ floor: safeFloor(floor), canManage, plan: getShadowTowerPlan(floor.city as ShadowTowerCity, floor.floorNumber, floor.archetype as keyof typeof SHADOW_TOWER_LISTINGS, floor.upgrades as string[], floor.officeCount), assignments, botGroups: consolidateShadowTowerBots(bots) });
});

router.get("/shadow-tower/floors/:city/:floorNumber", requireAuth, async (req, res) => {
  const city = String(req.params.city) as ShadowTowerCity;
  const floorNumber = Number(req.params.floorNumber);
  if (!cities.has(city) || !Number.isInteger(floorNumber)) { res.status(400).json({ error: "Invalid numbered floor identity" }); return; }
  const [floor] = await db.select().from(shadowTowerFloorsTable).where(and(eq(shadowTowerFloorsTable.city, city), eq(shadowTowerFloorsTable.floorNumber, floorNumber))).limit(1);
  if (!floor) { res.status(404).json({ error: "Floor not found" }); return; }
  if (floor.leaseExpiresAt && floor.leaseExpiresAt <= new Date()) { res.status(410).json({ error: "Lease expired" }); return; }
  if (!await canAccess(userId(req), floor, req.header("x-shadow-tower-password"))) { res.status(403).json({ error: "Floor access denied" }); return; }
  const [assignments, bots] = await Promise.all([
    db.select().from(shadowTowerWorkstationAssignmentsTable).where(eq(shadowTowerWorkstationAssignmentsTable.floorId, floor.id)),
    floor.orgId
      ? db.select().from(botsTable).where(and(eq(botsTable.orgId, floor.orgId), eq(botsTable.status, "active")))
      : db.select().from(botsTable).where(and(eq(botsTable.ownerId, floor.ownerUserId!), eq(botsTable.status, "active"))),
  ]);
  res.json({ floor: safeFloor(floor), plan: getShadowTowerPlan(city, floorNumber, floor.archetype as keyof typeof SHADOW_TOWER_LISTINGS, floor.upgrades as string[], floor.officeCount), assignments, botGroups: consolidateShadowTowerBots(bots) });
});

router.post("/shadow-tower/floors", requireAuth, async (req, res) => {
  const actor = userId(req);
  const city = String(req.body?.city) as ShadowTowerCity;
  const floorNumber = Number(req.body?.floorNumber);
  const tenure = req.body?.tenure === "own" ? "own" : "lease";
  const archetype = req.body?.archetype;
  const requestId = String(req.body?.requestId ?? "");
  const requestedOrgId = Number(req.body?.orgId);
  if (!cities.has(city) || !Number.isInteger(floorNumber) || !/^[0-9a-f-]{36}$/i.test(requestId) || (archetype !== "founder_team" && archetype !== "company")) { res.status(400).json({ error: "Commercial city, exact floorNumber, archetype and requestId required" }); return; }
  const email = (req.user as { email?: string | null })?.email ?? undefined;
  const canAcquireReservedExecutiveFloor =
    (floorNumber === 66 && (isOwnerEmail(email) || isPicassoOrgMemberEmail(email)))
    || (floorNumber === 67 && isOwnerEmail(email));
  if (!isCommercialShadowTowerFloor(floorNumber) && !canAcquireReservedExecutiveFloor) {
    res.status(403).json({ error: `Floor ${floorNumber} is reserved and was not charged.` });
    return;
  }
  const orgId = Number.isInteger(requestedOrgId) && requestedOrgId > 0 ? requestedOrgId : null;
  if (orgId && !(await canDoInOrg(actor, orgId, "org.settings")).allowed) { res.status(403).json({ error: "Organization settings permission required" }); return; }
  const [members, activeBots] = await Promise.all([
    orgId ? db.select({ userId: orgMembersTable.userId }).from(orgMembersTable).where(and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.status, "active"))) : Promise.resolve([{ userId: actor }]),
    orgId ? db.select({ id: botsTable.id }).from(botsTable).where(and(eq(botsTable.orgId, orgId), eq(botsTable.status, "active"))) : db.select({ id: botsTable.id }).from(botsTable).where(and(eq(botsTable.ownerId, actor), eq(botsTable.status, "active"))),
  ]);
  const occupants = members.length + activeBots.length;
  if (occupants > SHADOW_TOWER_LISTINGS[archetype].capacity) {
    res.status(409).json({ error: archetype === "founder_team" ? "Occupants exceed Founder + Team capacity; choose a Company Floor." : "Occupants exceed Company Floor capacity; acquire an additional floor." });
    return;
  }
  const market = await getMarketIndex();
  const basePrice = quoteShadowTowerFloor(archetype, floorNumber, tenure);
  const priceQuote = { ...quoteMarketAdjustedFiat(basePrice, market.multiplier), asOf: market.asOf, status: market.status };
  const price = priceQuote.totalFiat;
  const result = await db.transaction(async (tx) => {
    // FOR UPDATE cannot protect an absent floor row. This transaction lock
    // serializes the first claim for one canonical city/floor identity.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`shadow-tower-floor:${city}:${floorNumber}`}))`);
    const [existing] = await tx.select().from(shadowTowerFloorsTable).where(and(eq(shadowTowerFloorsTable.city, city), eq(shadowTowerFloorsTable.floorNumber, floorNumber))).for("update").limit(1);
    if (existing) {
      if (existing.ownerUserId === actor || (orgId != null && existing.orgId === orgId)) {
        return { status: 200, body: { floor: safeFloor(existing), price, basePrice, marketQuote: priceQuote, duplicate: true } };
      }
      return { status: 409, body: { error: "Floor already held" } };
    }
    const paid = await spendFiat(tx, { userId: actor, amountFiat: price, description: `Shadow Tower ${city} FL ${floorNumber}`, kind: "property", idempotencyKey: `shadow-tower:${requestId}` });
    if (!paid.ok) return { status: 402, body: { error: "Insufficient funds", required: price, balance: paid.spendable } };
    const [floor] = await tx.insert(shadowTowerFloorsTable).values({ city, floorNumber, orgId, ownerUserId: orgId ? null : actor, tenure, leaseExpiresAt: tenure === "lease" ? new Date(Date.now() + 365 * 86400_000) : null, archetype }).returning();
    await tx.insert(shadowTowerOfficeUnitsTable).values([
      { floorId: floor.id, unitNumber: 1, status: "occupied", orgId, ownerUserId: orgId ? null : actor, tenure, leaseExpiresAt: floor.leaseExpiresAt },
    ]);
    // A new floor is an empty shell. Desks are a paid fit-out, so never
    // auto-assign people or bots to workstation slots that do not exist yet.
    const workstationKeys = getShadowTowerPlan(city, floorNumber, archetype, [], floor.officeCount).objects
      .filter((object) => object.kind === "workstation").map((object) => object.id);
    const initialAssignments = [
      ...members.map((member, index) => ({ floorId: floor.id, workstationKey: workstationKeys[index], assigneeType: "human" as const, assigneeUserId: member.userId, botId: null, assignedByUserId: actor })),
      ...activeBots.map((bot, index) => ({ floorId: floor.id, workstationKey: workstationKeys[members.length + index], assigneeType: "bot" as const, assigneeUserId: null, botId: bot.id, assignedByUserId: actor })),
    ].filter((assignment) => Boolean(assignment.workstationKey));
    if (initialAssignments.length) await tx.insert(shadowTowerWorkstationAssignmentsTable).values(initialAssignments);
    await tx.insert(shadowTowerSelectedFloorsTable).values({ userId: actor, floorId: floor.id })
      .onConflictDoUpdate({ target: shadowTowerSelectedFloorsTable.userId, set: { floorId: floor.id, updatedAt: new Date() } });
    return { status: 201, body: { floor: safeFloor(floor), price, basePrice, marketQuote: priceQuote, duplicate: paid.duplicate === true } };
  });
  res.status(result.status).json(result.body);
});

router.post("/shadow-tower/floors/:id/units/:unitNumber/expand", requireAuth, async (req, res) => {
  const id = Number(req.params.id); const unitNumber = Number(req.params.unitNumber); const actor = userId(req); const requestId = String(req.body?.requestId ?? "");
  if (!Number.isInteger(id) || !Number.isInteger(unitNumber) || !/^[0-9a-f-]{36}$/i.test(requestId)) { res.status(400).json({ error: "Valid unit and requestId required" }); return; }
  const market = await getMarketIndex();
  const result = await db.transaction(async (tx) => {
    const [floor] = await tx.select().from(shadowTowerFloorsTable).where(eq(shadowTowerFloorsTable.id, id)).for("update").limit(1);
    if (!floor) return { status: 404, body: { error: "Floor not found" } };
    if (!(floor.ownerUserId === actor || (floor.orgId && (await canDoInOrg(actor, floor.orgId, "org.settings")).allowed))) return { status: 403, body: { error: "Floor owner or organization settings permission required" } };
    let [unit] = await tx.select().from(shadowTowerOfficeUnitsTable).where(and(eq(shadowTowerOfficeUnitsTable.floorId, id), eq(shadowTowerOfficeUnitsTable.unitNumber, unitNumber))).for("update").limit(1);
    if (unitNumber <= floor.officeCount && unit?.status === "owner_priority") return { status: 200, body: { unit, duplicate: true } };
    if (unitNumber !== floor.officeCount + 1 || unitNumber > 4 || (unit && unit.status !== "under_construction")) return { status: 409, body: { error: "Units must be expanded sequentially" } };
    if (!unit) {
      [unit] = await tx.insert(shadowTowerOfficeUnitsTable).values({ floorId: id, unitNumber, status: "under_construction" }).returning();
    }
    const basePrice = quoteShadowTowerOfficeUnit(floor.archetype as keyof typeof SHADOW_TOWER_LISTINGS, floor.floorNumber, unitNumber, unitNumber, "own");
    const priceQuote = { ...quoteMarketAdjustedFiat(basePrice, market.multiplier), asOf: market.asOf, status: market.status };
    const price = priceQuote.totalFiat;
    const paid = await spendFiat(tx, { userId: actor, amountFiat: price, description: `Shadow Tower unit expansion ${id}:${unitNumber}`, kind: "property", idempotencyKey: `shadow-tower-expand:${id}:${unitNumber}:${requestId}` });
    if (!paid.ok) return { status: 402, body: { error: "Insufficient funds", required: price } };
    const [updated] = await tx.update(shadowTowerOfficeUnitsTable).set({ status: "owner_priority", updatedAt: new Date() }).where(eq(shadowTowerOfficeUnitsTable.id, unit.id)).returning();
    await tx.update(shadowTowerFloorsTable).set({ officeCount: unitNumber, updatedAt: new Date() }).where(eq(shadowTowerFloorsTable.id, id));
    return { status: 200, body: { unit: updated, price, basePrice, marketQuote: priceQuote, duplicate: paid.duplicate === true } };
  }); res.status(result.status).json(result.body);
});

router.post("/shadow-tower/floors/:id/units/:unitNumber/list", requireAuth, async (req, res) => {
  const id = Number(req.params.id); const unitNumber = Number(req.params.unitNumber); const listType = req.body?.listType; const actor = userId(req);
  if (!Number.isInteger(id) || !Number.isInteger(unitNumber) || !["sale", "lease"].includes(listType)) { res.status(400).json({ error: "Valid unit and listType required" }); return; }
  const market = await getMarketIndex();
  const result = await db.transaction(async (tx) => {
    const [floor] = await tx.select().from(shadowTowerFloorsTable).where(eq(shadowTowerFloorsTable.id, id)).for("update").limit(1);
    if (!floor) return { status: 404, body: { error: "Floor not found" } };
    if (!(floor.ownerUserId === actor || (floor.orgId && (await canDoInOrg(actor, floor.orgId, "org.settings")).allowed))) return { status: 403, body: { error: "Floor owner or organization settings permission required" } };
    const [unit] = await tx.select().from(shadowTowerOfficeUnitsTable).where(and(eq(shadowTowerOfficeUnitsTable.floorId, id), eq(shadowTowerOfficeUnitsTable.unitNumber, unitNumber))).for("update").limit(1);
    if (!unit || unitNumber < 2 || unitNumber > 4 || unit.status !== "owner_priority") return { status: 409, body: { error: "Only owner-priority units 2-4 may be listed" } };
    const basePrice = quoteShadowTowerOfficeUnit(floor.archetype as keyof typeof SHADOW_TOWER_LISTINGS, floor.floorNumber, unitNumber, floor.officeCount, listType === "sale" ? "own" : "lease");
    const marketQuote = { ...quoteMarketAdjustedFiat(basePrice, market.multiplier), asOf: market.asOf, status: market.status };
    // Store the durable base rate only; every buyer receives a fresh live quote.
    const [updated] = await tx.update(shadowTowerOfficeUnitsTable).set({ status: listType === "sale" ? "for_sale" : "for_lease", saleFiat: listType === "sale" ? basePrice : null, leaseFiat: listType === "lease" ? basePrice : null, updatedAt: new Date() }).where(eq(shadowTowerOfficeUnitsTable.id, unit.id)).returning();
    return { status: 200, body: { unit: updated, price: marketQuote.totalFiat, basePrice, marketQuote } };
  }); res.status(result.status).json(result.body);
});

router.post("/shadow-tower/floors/:id/units/:unitNumber/acquire", requireAuth, async (req, res) => {
  const id = Number(req.params.id); const unitNumber = Number(req.params.unitNumber); const actor = userId(req); const requestId = String(req.body?.requestId ?? ""); const requestedOrgId = Number(req.body?.orgId);
  const orgId = Number.isInteger(requestedOrgId) && requestedOrgId > 0 ? requestedOrgId : null;
  if (!Number.isInteger(id) || !Number.isInteger(unitNumber) || !/^[0-9a-f-]{36}$/i.test(requestId)) { res.status(400).json({ error: "Valid unit and requestId required" }); return; }
  if (orgId && !(await canDoInOrg(actor, orgId, "org.settings")).allowed) { res.status(403).json({ error: "Organization settings permission required" }); return; }
  const market = await getMarketIndex();
  const result = await db.transaction(async (tx) => {
    const [floor] = await tx.select().from(shadowTowerFloorsTable).where(eq(shadowTowerFloorsTable.id, id)).for("update").limit(1);
    const [unit] = await tx.select().from(shadowTowerOfficeUnitsTable).where(and(eq(shadowTowerOfficeUnitsTable.floorId, id), eq(shadowTowerOfficeUnitsTable.unitNumber, unitNumber))).for("update").limit(1);
    if (!floor || !unit) return { status: 404, body: { error: "Unit not found" } };
    if (!["for_sale", "for_lease"].includes(unit.status)) {
      if (unit.status === "occupied" && (unit.ownerUserId === actor || (orgId != null && unit.orgId === orgId))) return { status: 200, body: { unit, duplicate: true } };
      return { status: 409, body: { error: "Unit is not actively listed" } };
    }
    if (floor.orgId) return { status: 409, body: { error: "Organization-owned floor unit settlement is not supported safely" } };
    const tenure = unit.status === "for_sale" ? "own" : "lease";
    const basePrice = quoteShadowTowerOfficeUnit(floor.archetype as keyof typeof SHADOW_TOWER_LISTINGS, floor.floorNumber, unitNumber, floor.officeCount, tenure);
    const priceQuote = { ...quoteMarketAdjustedFiat(basePrice, market.multiplier), asOf: market.asOf, status: market.status };
    const price = priceQuote.totalFiat;
    const paid = await spendFiat(tx, { userId: actor, amountFiat: price, description: `Shadow Tower unit acquire ${id}:${unitNumber}`, kind: "property", idempotencyKey: `shadow-tower-acquire:${id}:${unitNumber}:${requestId}` });
    if (!paid.ok) return { status: 402, body: { error: "Insufficient funds", required: price } };
    if (!floor.ownerUserId) return { status: 409, body: { error: "No settlement recipient" } };
    await creditFiat(tx, { userId: floor.ownerUserId, amountFiat: price, description: `Shadow Tower unit sale ${id}:${unitNumber}`, kind: "property_sale", idempotencyKey: `shadow-tower-sale:${id}:${unitNumber}:${requestId}` });
    const [updated] = await tx.update(shadowTowerOfficeUnitsTable).set({ status: "occupied", orgId, ownerUserId: orgId ? null : actor, tenure, leaseExpiresAt: tenure === "lease" ? new Date(Date.now() + 365 * 86400_000) : null, saleFiat: null, leaseFiat: null, updatedAt: new Date() }).where(eq(shadowTowerOfficeUnitsTable.id, unit.id)).returning();
    return { status: 200, body: { unit: updated, price, basePrice, marketQuote: priceQuote, duplicate: paid.duplicate === true } };
  }); res.status(result.status).json(result.body);
});

router.put("/shadow-tower/floors/current", requireAuth, async (req, res) => {
  const actor = userId(req); const floorId = Number(req.body?.floorId);
  if (!Number.isInteger(floorId)) { res.status(400).json({ error: "Valid floorId required" }); return; }
  const [floor] = await db.select().from(shadowTowerFloorsTable).where(eq(shadowTowerFloorsTable.id, floorId)).limit(1);
  if (!floor || (floor.leaseExpiresAt && floor.leaseExpiresAt <= new Date())) { res.status(404).json({ error: "Active floor not found" }); return; }
  if (!await canAccess(actor, floor, req.header("x-shadow-tower-password"))) { res.status(403).json({ error: "Floor access denied" }); return; }
  await db.insert(shadowTowerSelectedFloorsTable).values({ userId: actor, floorId })
    .onConflictDoUpdate({ target: shadowTowerSelectedFloorsTable.userId, set: { floorId, updatedAt: new Date() } });
  res.json({ floor: safeFloor(floor), selected: true });
});

router.post("/shadow-tower/floors/:id/upgrades", requireAuth, async (req, res) => {
  const id = Number(req.params.id); const upgrade = req.body?.upgrade; const requestId = String(req.body?.requestId ?? "");
  if (!Number.isInteger(id) || !isSupportedShadowTowerUpgrade(upgrade) || !/^[0-9a-f-]{36}$/i.test(requestId)) { res.status(400).json({ error: "Valid upgrade and requestId required" }); return; }
  const prices = { secure_access: 25_000, extra_desk: 15_000, extra_terminal: 40_000, extra_workstations: 15_000, operations_terminal: 40_000 };
  const actor = userId(req);
  const result = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(shadowTowerFloorsTable).where(eq(shadowTowerFloorsTable.id, id)).for("update").limit(1);
    if (!locked) return { error: "not_found" as const };
    if (locked.leaseExpiresAt && locked.leaseExpiresAt <= new Date()) return { error: "expired" as const };
    const allowed = locked.ownerUserId === actor || !!(locked.orgId && (await canDoInOrg(actor, locked.orgId, "org.settings")).allowed);
    if (!allowed) return { error: "forbidden" as const };
    if ((locked.upgrades as string[]).includes(upgrade)) return { floor: locked, duplicate: true };
    const paid = await spendFiat(tx, { userId: actor, amountFiat: prices[upgrade], description: `Shadow Tower upgrade ${upgrade}`, kind: "upgrade", idempotencyKey: `shadow-tower-upgrade:${id}:${requestId}` });
    if (!paid.ok) return { error: "funds" as const };
    const [updated] = await tx.update(shadowTowerFloorsTable).set({ upgrades: [...(locked.upgrades as string[]), upgrade], updatedAt: new Date() }).where(eq(shadowTowerFloorsTable.id, id)).returning();
    return { floor: updated, duplicate: false };
  });
  if ("error" in result) { res.status(result.error === "forbidden" ? 403 : result.error === "funds" ? 402 : result.error === "expired" ? 410 : 404).json({ error: result.error }); return; }
  res.json({ floor: safeFloor(result.floor), duplicate: result.duplicate });
});

// Select a business-specific interior program without allowing the client to
// mutate the shared floor shell. Materials are always paid; self-build records
// labor units for the work board, while hire pays the server-derived crew fee.
const FITOUT_OPTIONS = new Set(["palette:neon", "palette:industrial", "signage:custom", "fixture:premium", "fixture:security", "fixture:guest"]);
router.post("/shadow-tower/floors/:id/business-fitout", requireAuth, async (req, res) => {
  const id = Number(req.params.id); const actor = userId(req);
  const kind = req.body?.kind as BusinessFloorKind;
  const laborMode = req.body?.laborMode as BusinessFloorLaborMode;
  const requestId = String(req.body?.requestId ?? "");
  const options = Array.isArray(req.body?.options) ? req.body.options.filter((v: unknown): v is string => typeof v === "string" && FITOUT_OPTIONS.has(v)).slice(0, 6) : [];
  if (!Number.isInteger(id) || !BUSINESS_FLOOR_KINDS.includes(kind) || !["self", "hire"].includes(laborMode) || !/^[0-9a-f-]{36}$/i.test(requestId)) {
    res.status(400).json({ error: "Valid business kind, laborMode and requestId required" }); return;
  }
  const quote = quoteBusinessFitout(kind, laborMode, options.length);
  const result = await db.transaction(async (tx) => {
    const [floor] = await tx.select().from(shadowTowerFloorsTable).where(eq(shadowTowerFloorsTable.id, id)).for("update").limit(1);
    if (!floor) return { status: 404 as const, body: { error: "Floor not found" } };
    const permitted = floor.ownerUserId === actor || !!(floor.orgId && (await canDoInOrg(actor, floor.orgId, "org.settings")).allowed);
    if (!permitted) return { status: 403 as const, body: { error: "Owner or organization settings permission required" } };
    const settings = (floor.settings && typeof floor.settings === "object" ? floor.settings : {}) as Record<string, unknown>;
    const fitout = settings.businessFitout && typeof settings.businessFitout === "object" ? settings.businessFitout as Record<string, unknown> : {};
    const processed = Array.isArray(fitout.processedRequestIds) ? fitout.processedRequestIds.filter((v): v is string => typeof v === "string") : [];
    if (processed.includes(requestId)) return { status: 200 as const, body: { ok: true, duplicate: true, fitout } };
    const paid = await spendFiat(tx, {
      userId: actor, amountFiat: quote.totalFiat, description: `${BUSINESS_FLOOR_TEMPLATES[kind].label} fit-out`,
      kind: "business_fitout", idempotencyKey: `business-fitout:${id}:${requestId}`,
    });
    if (!paid.ok) return { status: 402 as const, body: { error: "Insufficient funds", required: quote.totalFiat, balance: paid.spendable } };
    const nextFitout = {
      kind, options, laborMode, ...quote,
      status: laborMode === "self" ? "labor_required" : "crew_paid",
      selectedAt: new Date().toISOString(),
      processedRequestIds: [...processed, requestId].slice(-80),
    };
    const [updated] = await tx.update(shadowTowerFloorsTable).set({ settings: { ...settings, businessFitout: nextFitout }, updatedAt: new Date() })
      .where(eq(shadowTowerFloorsTable.id, id)).returning();
    return { status: 200 as const, body: { ok: true, floor: safeFloor(updated), fitout: nextFitout, wallet: paid } };
  });
  res.status(result.status).json(result.body);
});

router.put("/shadow-tower/floors/:id/access", requireAuth, async (req, res) => {
  const id = Number(req.params.id); const actor = userId(req);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid floor id" }); return; }
  const [floor] = await db.select().from(shadowTowerFloorsTable).where(eq(shadowTowerFloorsTable.id, id)).limit(1);
  if (!floor) { res.status(404).json({ error: "Floor not found" }); return; }
  const permitted = floor.ownerUserId === actor || !!(floor.orgId && (await canDoInOrg(actor, floor.orgId, "org.settings")).allowed);
  if (!permitted) { res.status(403).json({ error: "Organization settings permission required" }); return; }
  const updates: { minAccessRole?: string; classification?: string; passwordHash?: string | null; settings?: Record<string, unknown> } = {};
  if (typeof req.body?.minAccessRole === "string" && ["owner", "ceo", "executive", "director", "manager", "specialist"].includes(req.body.minAccessRole)) updates.minAccessRole = req.body.minAccessRole;
  if (typeof req.body?.classification === "string") updates.classification = req.body.classification.slice(0, 40);
  if (typeof req.body?.password === "string") updates.passwordHash = req.body.password ? await digest(req.body.password) : null;
  if (req.body?.settings && typeof req.body.settings === "object" && !Array.isArray(req.body.settings)) updates.settings = req.body.settings;
  const [updated] = await db.update(shadowTowerFloorsTable).set({ ...updates, updatedAt: new Date() }).where(eq(shadowTowerFloorsTable.id, id)).returning();
  res.json({ floor: safeFloor(updated) });
});

// Hallway presentation is constrained to the shared contract; it cannot alter floor geometry.
router.put("/shadow-tower/floors/:id/hallway", requireAuth, async (req, res) => {
  const id = Number(req.params.id); const actor = userId(req);
  const hallway = shadowTowerHallwaySchema.safeParse(req.body);
  if (!Number.isInteger(id) || !hallway.success) { res.status(400).json({ error: "Valid hallway style, lighting, and optional 28-character signage required" }); return; }
  const [floor] = await db.select().from(shadowTowerFloorsTable).where(eq(shadowTowerFloorsTable.id, id)).limit(1);
  if (!floor) { res.status(404).json({ error: "Floor not found" }); return; }
  if (!(floor.ownerUserId === actor || (floor.orgId && (await canDoInOrg(actor, floor.orgId, "org.settings")).allowed))) { res.status(403).json({ error: "Floor owner or organization settings permission required" }); return; }
  const settings = floor.settings && typeof floor.settings === "object" && !Array.isArray(floor.settings) ? floor.settings as Record<string, unknown> : {};
  const [updated] = await db.update(shadowTowerFloorsTable).set({ settings: { ...settings, hallway: hallway.data }, updatedAt: new Date() }).where(eq(shadowTowerFloorsTable.id, id)).returning();
  res.json({ floor: safeFloor(updated), hallway: hallway.data });
});

router.post("/shadow-tower/floors/:id/workstations", requireAuth, async (req, res) => {
  const id = Number(req.params.id); const actor = userId(req);
  const assigneeType = req.body?.assigneeType === "bot" ? "bot" : req.body?.assigneeType === "human" ? "human" : null;
  const assigneeUserId = assigneeType === "human" ? String(req.body?.assigneeUserId ?? "") : null;
  const botId = assigneeType === "bot" ? Number(req.body?.botId) : null;
  if (!Number.isInteger(id) || !assigneeType || (assigneeType === "human" && !assigneeUserId) || (assigneeType === "bot" && !Number.isInteger(botId))) { res.status(400).json({ error: "Valid human or bot assignee required" }); return; }
  const [floor] = await db.select().from(shadowTowerFloorsTable).where(eq(shadowTowerFloorsTable.id, id)).limit(1);
  if (!floor || (floor.leaseExpiresAt && floor.leaseExpiresAt <= new Date())) { res.status(404).json({ error: "Active floor not found" }); return; }
  const role = floor.orgId ? await membership(actor, floor.orgId) : undefined;
  if (floor.ownerUserId !== actor && (!role || !hasRoleAccess(role, "manager"))) { res.status(403).json({ error: "Owner or manager access required" }); return; }
  if (assigneeType === "human") {
    if (floor.orgId ? !await membership(assigneeUserId!, floor.orgId) : assigneeUserId !== floor.ownerUserId) { res.status(409).json({ error: "Human assignee is not an active eligible occupant" }); return; }
  } else {
    const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, botId!)).limit(1);
    if (!bot || !["active", "paused"].includes(bot.status) || (floor.orgId ? bot.orgId !== floor.orgId : bot.ownerId !== floor.ownerUserId)) { res.status(409).json({ error: "Bot assignee is not an eligible active or paused occupant" }); return; }
  }
  const workstations = getShadowTowerPlan(floor.city as ShadowTowerCity, floor.floorNumber, floor.archetype as keyof typeof SHADOW_TOWER_LISTINGS, floor.upgrades as string[], floor.officeCount).objects.filter((o) => o.kind === "workstation").map((o) => o.id);
  const [assignment] = await db.transaction(async (tx) => {
    await tx.select({ id: shadowTowerFloorsTable.id }).from(shadowTowerFloorsTable).where(eq(shadowTowerFloorsTable.id, id)).for("update");
    const occupied = await tx.select().from(shadowTowerWorkstationAssignmentsTable).where(eq(shadowTowerWorkstationAssignmentsTable.floorId, id));
    if (occupied.length >= workstations.length) throw new Error("WORKSTATION_CAPACITY_REACHED");
    if (occupied.some((row) => assigneeType === "bot" ? row.botId === botId : row.assigneeUserId === assigneeUserId)) throw new Error("ASSIGNEE_ALREADY_ASSIGNED");
    const workstationKey = String(req.body?.workstationKey ?? "");
    const selected = workstationKey && workstations.includes(workstationKey) && !occupied.some((row) => row.workstationKey === workstationKey)
      ? workstationKey : workstations.find((key) => !occupied.some((row) => row.workstationKey === key));
    if (!selected) throw new Error("WORKSTATION_CAPACITY_REACHED");
    return tx.insert(shadowTowerWorkstationAssignmentsTable).values({ floorId: id, workstationKey: selected, assigneeType, assigneeUserId, botId, assignedByUserId: actor }).returning();
  }).catch((error: Error) => {
    if (error.message === "WORKSTATION_CAPACITY_REACHED" || error.message === "ASSIGNEE_ALREADY_ASSIGNED") return [];
    throw error;
  });
  if (!assignment) { res.status(409).json({ error: "No compatible free workstation, or assignee already assigned" }); return; }
  res.status(201).json({ assignment });
});

export default router;