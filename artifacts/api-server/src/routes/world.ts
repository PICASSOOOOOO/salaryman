import { Router } from "express";
import { eq, sql, desc, and } from "drizzle-orm";
import { db, worldBusinessesTable, businessTransactionsTable, businessSnapshotsTable, organizationsTable, orgMembersTable, cityBuildingsTable, botSubscriptionsTable, botMarketplaceTable } from "@workspace/db";
import { getServerStatus, getLiberationProgress, recordHeartbeat, getOnlinePlayers } from "../worldServer";

const router = Router();

/** Derive a display name from the authenticated user without `any` casts. */
function derivePlayerName(req: Express.Request): string {
  const u = req.user!;
  const first = u.firstName ?? "";
  const last = u.lastName ?? "";
  const parts = [first, last].filter(s => s.length > 0);
  const name = parts.length > 0 ? parts.join(" ") : (u.email?.split("@")[0] ?? String(u.id));
  return name.slice(0, 32).toUpperCase();
}

router.get("/world/check-company", async (req, res) => {
  try {
    const rawName = req.query.name;
    if (!rawName || typeof rawName !== "string" || !rawName.trim()) {
      res.status(400).json({ error: "name query param required" });
      return;
    }
    const normalized = rawName.trim().toUpperCase();
    const existing = await db
      .select({ id: worldBusinessesTable.id })
      .from(worldBusinessesTable)
      .where(sql`UPPER(${worldBusinessesTable.companyName}) = ${normalized}`)
      .limit(1);
    res.json({ taken: existing.length > 0 });
  } catch (err: any) {
    console.error("[World] check-company error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/world/register", async (req, res) => {
  try {
    const { playerName, businessType, companyName, industry, companySize, contactEmail, isPaid, payrollProvider, declaredMonthlyIncome, incomeVerified } = req.body;
    if (!playerName || !businessType) {
      res.status(400).json({ error: "playerName and businessType required" });
      return;
    }
    const validTypes = ["minx", "real", "unemployed"];
    const incomingType = businessType === "fictitious" ? "minx" : businessType;
    const finalBizType = validTypes.includes(incomingType) ? incomingType : "minx";

    if (finalBizType === "minx" && companyName) {
      const normalized = String(companyName).trim().toUpperCase();
      if (normalized) {
        const existing = await db
          .select({ id: worldBusinessesTable.id })
          .from(worldBusinessesTable)
          .where(sql`UPPER(${worldBusinessesTable.companyName}) = ${normalized}`)
          .limit(1);
        if (existing.length > 0) {
          res.status(409).json({ error: "Company name already taken" });
          return;
        }
      }
    }

    const sessionId = req.cookies?.session_id ?? null;
    const userId = req.user?.id ? String(req.user.id) : null;
    const [row] = await db
      .insert(worldBusinessesTable)
      .values({
        playerName: String(playerName).slice(0, 32).toUpperCase(),
        userId,
        businessType: finalBizType,
        companyName: finalBizType === "unemployed" ? null : (companyName ? String(companyName).trim().toUpperCase().slice(0, 80) : null),
        industry: finalBizType === "unemployed" ? null : (industry ? String(industry).slice(0, 60) : null),
        companySize: finalBizType === "unemployed" ? null : (companySize ? String(companySize).slice(0, 30) : null),
        contactEmail: finalBizType === "unemployed" ? null : (contactEmail ? String(contactEmail).slice(0, 120) : null),
        payrollProvider: finalBizType === "real" && payrollProvider ? String(payrollProvider).slice(0, 40) : null,
        declaredMonthlyIncome: finalBizType === "real" && typeof declaredMonthlyIncome === "number" ? Math.max(0, Math.min(declaredMonthlyIncome, 10_000_000)) : 0,
        incomeVerified: Boolean(incomeVerified) && finalBizType === "real" && payrollProvider && payrollProvider !== "NONE",
        isPaid: Boolean(isPaid),
        sessionId,
      })
      .returning();

    let formalOrgId: number | null = null;
    if (finalBizType === "real" && userId && companyName) {
      const orgName = String(companyName).trim().toUpperCase().slice(0, 80);
      try {
        const [existingOrg] = await db
          .select()
          .from(organizationsTable)
          .where(sql`lower(${organizationsTable.name}) = lower(${orgName})`);

        if (!existingOrg) {
          const [newOrg] = await db
            .insert(organizationsTable)
            .values({
              name: orgName,
              industry: industry ? String(industry).trim().slice(0, 60) : null,
              size: companySize ? String(companySize).trim().slice(0, 30) : null,
              ownerUserId: userId,
            })
            .returning();

          await db.insert(orgMembersTable).values({
            orgId: newOrg.id,
            userId,
            role: "owner",
            featureBilling: "individual",
            status: "active",
            joinedAt: new Date(),
          });
          formalOrgId = newOrg.id;
        } else {
          formalOrgId = existingOrg.id;
          const [existingMembership] = await db
            .select()
            .from(orgMembersTable)
            .where(and(eq(orgMembersTable.orgId, existingOrg.id), eq(orgMembersTable.userId, userId)));
          if (!existingMembership) {
            await db.insert(orgMembersTable).values({
              orgId: existingOrg.id,
              userId,
              role: "specialist",
              featureBilling: "individual",
              status: "active",
              joinedAt: new Date(),
            });
          } else if (existingMembership.status === "removed") {
            await db
              .update(orgMembersTable)
              .set({ status: "active", joinedAt: new Date() })
              .where(and(eq(orgMembersTable.orgId, existingOrg.id), eq(orgMembersTable.userId, userId)));
          }
        }
      } catch (orgErr: unknown) {
        console.error("[World] formal org creation skipped:", (orgErr as Error).message);
      }
    }

    res.json({ ok: true, id: row.id, formalOrgId });
  } catch (err: any) {
    console.error("[World] register error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

const VALID_CATEGORIES = new Set(["gov_salary", "business_profit", "real_salary", "expense", "income", "general"]);

router.post("/world/transactions", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const { companyName, category, description, amount, balanceAfter } = req.body;
    if (!description || typeof amount !== "number") {
      res.status(400).json({ error: "description and amount required" });
      return;
    }
    if (Math.abs(amount) > 1_000_000) {
      res.status(400).json({ error: "Amount out of range" });
      return;
    }
    const safeCategory = VALID_CATEGORIES.has(String(category)) ? String(category) : "general";
    const playerName = derivePlayerName(req);
    const [row] = await db
      .insert(businessTransactionsTable)
      .values({
        playerName: String(playerName).slice(0, 32).toUpperCase(),
        companyName: companyName ? String(companyName).slice(0, 80) : null,
        category: safeCategory.slice(0, 32),
        description: String(description).slice(0, 200),
        amount: Math.round(amount),
        balanceAfter: Math.round(balanceAfter ?? 0),
      })
      .returning({ id: businessTransactionsTable.id });
    res.json({ ok: true, id: row.id });
  } catch (err: any) {
    console.error("[World] transactions error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/world/declare-salary", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const { slotIndex, realSalaryAmount, proofObjectPath, charClass, companyName } = req.body;
    if (typeof realSalaryAmount !== "number" || realSalaryAmount <= 0 || realSalaryAmount > 1_000_000) {
      res.status(400).json({ error: "realSalaryAmount must be a positive number up to 1,000,000" });
      return;
    }
    const playerName = derivePlayerName(req);
    const userId = String(req.user.id);
    const verified = await db
      .select({ incomeVerified: worldBusinessesTable.incomeVerified, payrollProvider: worldBusinessesTable.payrollProvider })
      .from(worldBusinessesTable)
      .where(eq(worldBusinessesTable.userId, userId))
      .orderBy(desc(worldBusinessesTable.createdAt))
      .limit(1);
    const isVerified = verified.length > 0 && verified[0].incomeVerified === true && verified[0].payrollProvider && verified[0].payrollProvider !== "NONE";
    if (!isVerified) {
      res.status(403).json({ error: "Income verification required. Connect a payroll provider (Gusto, ADP, etc.) to declare salary." });
      return;
    }
    await db.insert(businessSnapshotsTable).values({
      playerName: String(playerName).slice(0, 32).toUpperCase(),
      userId,
      slotIndex: Number(slotIndex ?? 0),
      balance: 0,
      salary: 0,
      businessProfit: 0,
      governmentBaseSalary: 0,
      realSalaryAmount: Math.round(realSalaryAmount),
      incomeType: "real",
      data: { proofObjectPath: proofObjectPath ?? null, companyName: companyName ?? null, declaredAt: new Date().toISOString(), verificationStatus: "pending" },
      snapshotReason: "real_salary_declaration",
    });
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[World] declare-salary error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/world/snapshots", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const { slotIndex, balance, salary, businessProfit, governmentBaseSalary, realSalaryAmount, incomeType, snapshotReason } = req.body;
    if (typeof balance !== "number" || balance < 0) {
      res.status(400).json({ error: "balance required and must be non-negative" });
      return;
    }
    // Server-side plausibility caps — prevents forged balance inflation
    const MAX_BALANCE = 100_000_000; // 100M ƒ absolute ceiling
    const MAX_RATE = 1_000_000;      // 1M ƒ/min rate ceiling
    if (balance > MAX_BALANCE) {
      res.status(400).json({ error: "balance exceeds server ceiling" });
      return;
    }
    const safeIncomeType = ["unemployed","minx","real"].includes(String(incomeType)) ? String(incomeType) : "unemployed";
    const govBase = 0;
    const safeBizProfit = safeIncomeType === "minx" ? Math.min(Math.round(businessProfit ?? 0), MAX_RATE) : 0;
    const safeRealSal = safeIncomeType === "real" ? Math.min(Math.round(realSalaryAmount ?? 0), MAX_RATE) : 0;
    const playerName = derivePlayerName(req);
    await db.insert(businessSnapshotsTable).values({
      playerName: String(playerName).slice(0, 32).toUpperCase(),
      userId: String(req.user.id),
      slotIndex: Number(slotIndex ?? 0),
      balance: Math.round(balance),
      salary: Math.round(Math.min(salary ?? balance, MAX_BALANCE)),
      businessProfit: safeBizProfit,
      governmentBaseSalary: govBase,
      realSalaryAmount: safeRealSal,
      incomeType: safeIncomeType,
      snapshotReason: String(snapshotReason ?? "auto").slice(0, 64),
    });
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[World] snapshots error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/world/snapshots/latest", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const slotIndex = parseInt(String(req.query.slot ?? "0"), 10);
    const snapshots = await db
      .select()
      .from(businessSnapshotsTable)
      .where(and(
        eq(businessSnapshotsTable.userId, String(req.user.id)),
        eq(businessSnapshotsTable.slotIndex, slotIndex),
      ))
      .orderBy(desc(businessSnapshotsTable.createdAt))
      .limit(1);
    if (snapshots.length === 0) {
      res.json({ snapshot: null });
      return;
    }
    res.json({ snapshot: snapshots[0] });
  } catch (err: any) {
    console.error("[World] snapshots/latest error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * GET /world/salary-proof
 * Returns the storage path for the authenticated user's latest real-salary proof document.
 * The client can then fetch /storage/objects/<path> to view the file.
 */
router.get("/world/salary-proof", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const slotIndex = parseInt(String(req.query.slot ?? "0"), 10);
    // Find the latest declaration snapshot for this user+slot
    const declarations = await db
      .select()
      .from(businessSnapshotsTable)
      .where(and(
        eq(businessSnapshotsTable.userId, String(req.user.id)),
        eq(businessSnapshotsTable.slotIndex, slotIndex),
        eq(businessSnapshotsTable.snapshotReason, "real_salary_declaration"),
      ))
      .orderBy(desc(businessSnapshotsTable.createdAt))
      .limit(1);
    if (declarations.length === 0 || !declarations[0].data) {
      res.json({ proofObjectPath: null, realSalaryAmount: null });
      return;
    }
    const data = declarations[0].data as Record<string, unknown>;
    const proofObjectPath = typeof data.proofObjectPath === "string" ? data.proofObjectPath : null;
    res.json({
      proofObjectPath,
      storagePath: proofObjectPath ? `/storage${proofObjectPath}` : null,
      realSalaryAmount: declarations[0].realSalaryAmount,
      declaredAt: data.declaredAt ?? null,
    });
  } catch (err: any) {
    console.error("[World] salary-proof error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * GET /world/business-profit-rate
 * Server-authoritative computation of the player's Minx business profit rate (ƒ/min).
 * Aggregates all server-recorded business_profit category transactions for the player,
 * then divides by the elapsed minutes window to produce a ƒ/min rate.
 * The rate is capped at 500 ƒ/min.
 */
router.get("/world/business-profit-rate", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const playerName = derivePlayerName(req);
    // Sum all business_profit transactions for this player
    const rows = await db
      .select({ total: sql<number>`SUM(${businessTransactionsTable.amount})`, count: sql<number>`COUNT(*)`, minDate: sql<string>`MIN(${businessTransactionsTable.createdAt})` })
      .from(businessTransactionsTable)
      .where(and(
        eq(businessTransactionsTable.playerName, playerName),
        eq(businessTransactionsTable.category, "business_profit"),
      ));
    const total = Number(rows[0]?.total ?? 0);
    const count = Number(rows[0]?.count ?? 0);
    if (count === 0) {
      res.json({ businessProfitRate: 0, transactionCount: 0, totalEarned: 0 });
      return;
    }
    // Rate = total earned / elapsed minutes since first transaction, capped at 500
    const firstDate = rows[0]?.minDate ? new Date(rows[0].minDate).getTime() : Date.now();
    const elapsedMinutes = Math.max(1, (Date.now() - firstDate) / 60_000);
    const rate = Math.min(Math.round(total / elapsedMinutes), 500);
    res.json({ businessProfitRate: rate, transactionCount: count, totalEarned: total });
  } catch (err: any) {
    console.error("[World] business-profit-rate error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/world/my-business", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const playerName = derivePlayerName(req);
    const businesses = await db
      .select()
      .from(worldBusinessesTable)
      .where(eq(worldBusinessesTable.playerName, playerName))
      .orderBy(desc(worldBusinessesTable.createdAt));
    res.json({ businesses });
  } catch (err: any) {
    console.error("[World] my-business error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/world/my-office", async (req, res) => {
  if (!req.isAuthenticated?.() || !req.user) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const userId = String(req.user.id);

    const buildings = await db
      .select()
      .from(cityBuildingsTable)
      .where(and(eq(cityBuildingsTable.ownerId, userId), eq(cityBuildingsTable.demolished, false)));

    const subs = await db
      .select({
        name: botMarketplaceTable.name,
        slug: botMarketplaceTable.slug,
        category: botMarketplaceTable.category,
        tagline: botMarketplaceTable.tagline,
        icon: botMarketplaceTable.icon,
        status: botSubscriptionsTable.status,
      })
      .from(botSubscriptionsTable)
      .innerJoin(botMarketplaceTable, eq(botSubscriptionsTable.marketplaceItemId, botMarketplaceTable.id))
      .where(and(eq(botSubscriptionsTable.userId, userId), eq(botSubscriptionsTable.status, "active")));

    const orgs = await db
      .select({ orgId: organizationsTable.id, orgName: organizationsTable.name, role: orgMembersTable.role })
      .from(orgMembersTable)
      .innerJoin(organizationsTable, eq(orgMembersTable.orgId, organizationsTable.id))
      .where(eq(orgMembersTable.userId, userId));

    const isAdmin = orgs.some(o => o.role === "owner" || o.role === "ceo" || o.role === "executive");

    res.json({
      buildings: buildings.map(b => ({ id: b.id, name: b.name, type: b.buildingType, label: b.label })),
      bots: subs,
      orgs,
      isAdmin,
      hasOffice: buildings.length > 0,
    });
  } catch (err: any) {
    console.error("[World] my-office error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/world/online", (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const all = getOnlinePlayers();
  res.json({ players: all, count: all.length, ts: Date.now() });
});

router.get("/world/server-status", (_req, res) => {
  res.json(getServerStatus());
});

router.post("/world/heartbeat", (req, res): void => {
  const user = req.user;
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const name = derivePlayerName(req);
  recordHeartbeat(String(user.id), name);
  res.json({ ok: true });
});

router.get("/world/liberation", (_req, res) => {
  res.json({ progress: getLiberationProgress() });
});

const BUILDING_TYPES: Record<string, { minW: number; minH: number; maxW: number; maxH: number; baseCost: number }> = {
  shack:     { minW: 40, minH: 30, maxW: 60,  maxH: 50,  baseCost: 200 },
  kiosk:     { minW: 30, minH: 25, maxW: 50,  maxH: 40,  baseCost: 150 },
  office:    { minW: 60, minH: 50, maxW: 120, maxH: 90,  baseCost: 500 },
  shop:      { minW: 50, minH: 40, maxW: 100, maxH: 70,  baseCost: 400 },
  warehouse: { minW: 80, minH: 60, maxW: 160, maxH: 100, baseCost: 800 },
  tower:     { minW: 60, minH: 80, maxW: 120, maxH: 160, baseCost: 2000 },
  compound:  { minW: 100, minH: 80, maxW: 200, maxH: 150, baseCost: 3000 },
};

const VALID_COLORS = ['#38bdf8','#a855f7','#10b981','#f59e0b','#ef4444','#ec4899','#3b82f6','#84cc16','#67e8f9','#fb923c','#f472b6','#a78bfa','#fbbf24','#6ee7b7'];

function calcBuildCost(type: string, w: number, h: number): number {
  const spec = BUILDING_TYPES[type];
  if (!spec) return 9999;
  const area = w * h;
  const baseArea = spec.minW * spec.minH;
  const sizeMultiplier = Math.max(1, area / baseArea);
  return Math.round(spec.baseCost * sizeMultiplier);
}

router.get("/world/buildings", async (req, res) => {
  try {
    const serverId = (req.query.serverId as string) || "minx_prime";
    const rows = await db
      .select()
      .from(cityBuildingsTable)
      .where(and(eq(cityBuildingsTable.serverId, serverId), eq(cityBuildingsTable.demolished, false)));
    res.json({ buildings: rows });
  } catch (err: any) {
    console.error("[World] buildings list error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/world/building-types", (_req, res) => {
  const types = Object.entries(BUILDING_TYPES).map(([id, spec]) => ({
    id,
    label: id.toUpperCase(),
    minW: spec.minW, minH: spec.minH,
    maxW: spec.maxW, maxH: spec.maxH,
    baseCost: spec.baseCost,
  }));
  res.json({ types, colors: VALID_COLORS });
});

router.post("/world/buildings", async (req, res) => {
  const user = req.user;
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const { name, buildingType, x, y, w, h, color, label, description, rentPrice, isPublic, serverId } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "Building name required" }); return;
    }
    const type = buildingType || "office";
    const spec = BUILDING_TYPES[type];
    if (!spec) {
      res.status(400).json({ error: `Invalid building type. Valid: ${Object.keys(BUILDING_TYPES).join(", ")}` }); return;
    }
    const bw = Math.max(spec.minW, Math.min(spec.maxW, Number(w) || spec.minW));
    const bh = Math.max(spec.minH, Math.min(spec.maxH, Number(h) || spec.minH));
    const bx = Number(x) || 0;
    const by = Number(y) || 0;
    const bColor = VALID_COLORS.includes(color) ? color : "#38bdf8";
    const cost = calcBuildCost(type, bw, bh);
    const ownerName = derivePlayerName(req);
    const sid = serverId || "minx_prime";

    const existing = await db
      .select({ id: cityBuildingsTable.id })
      .from(cityBuildingsTable)
      .where(and(eq(cityBuildingsTable.serverId, sid), eq(cityBuildingsTable.demolished, false)));

    for (const eb of existing) {
      const rows = await db.select().from(cityBuildingsTable).where(eq(cityBuildingsTable.id, eb.id));
      if (rows.length === 0) continue;
      const e = rows[0];
      const overlap = bx < e.x + e.w && bx + bw > e.x && by < e.y + e.h && by + bh > e.y;
      if (overlap) {
        res.status(409).json({ error: "Location overlaps existing building" }); return;
      }
    }

    const [inserted] = await db.insert(cityBuildingsTable).values({
      ownerId: String(user.id),
      ownerName,
      name: name.trim().toUpperCase().slice(0, 80),
      buildingType: type,
      x: bx, y: by, w: bw, h: bh,
      color: bColor,
      label: (label || name).trim().toUpperCase().slice(0, 40),
      description: description?.trim().slice(0, 200) || null,
      rentPrice: Math.max(0, Number(rentPrice) || 0),
      buildCost: cost,
      isPublic: isPublic === true,
      serverId: sid,
    }).returning();

    res.json({ building: inserted, cost });
  } catch (err: any) {
    console.error("[World] build error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/world/buildings/:id", async (req, res) => {
  const user = req.user;
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const buildingId = Number(req.params.id as string);
    const rows = await db.select().from(cityBuildingsTable).where(eq(cityBuildingsTable.id, buildingId));
    if (rows.length === 0) { res.status(404).json({ error: "Building not found" }); return; }
    const building = rows[0];
    if (building.ownerId !== String(user.id)) {
      res.status(403).json({ error: "Not your building" }); return;
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const { name, color, label, description, rentPrice, isPublic } = req.body;
    if (name && typeof name === "string") updates.name = name.trim().toUpperCase().slice(0, 80);
    if (color && VALID_COLORS.includes(color)) updates.color = color;
    if (label && typeof label === "string") updates.label = label.trim().toUpperCase().slice(0, 40);
    if (typeof description === "string") updates.description = description.trim().slice(0, 200) || null;
    if (typeof rentPrice === "number") updates.rentPrice = Math.max(0, rentPrice);
    if (typeof isPublic === "boolean") updates.isPublic = isPublic;

    const [updated] = await db.update(cityBuildingsTable)
      .set(updates)
      .where(eq(cityBuildingsTable.id, buildingId))
      .returning();
    res.json({ building: updated });
  } catch (err: any) {
    console.error("[World] building update error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/world/buildings/:id/rent", async (req, res) => {
  const user = req.user;
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const buildingId = Number(req.params.id as string);
    const rows = await db.select().from(cityBuildingsTable).where(eq(cityBuildingsTable.id, buildingId));
    if (rows.length === 0) { res.status(404).json({ error: "Building not found" }); return; }
    const building = rows[0];
    if (building.ownerId === String(user.id)) {
      res.status(400).json({ error: "Cannot rent your own building" }); return;
    }
    if (building.tenantId && building.tenantId !== String(user.id)) {
      res.status(409).json({ error: "Already rented by someone else" }); return;
    }
    if (building.tenantId === String(user.id)) {
      const [updated] = await db.update(cityBuildingsTable)
        .set({ tenantId: null, tenantName: null, updatedAt: new Date() })
        .where(eq(cityBuildingsTable.id, buildingId))
        .returning();
      res.json({ building: updated, action: "vacated" });
      return;
    }
    const tenantName = derivePlayerName(req);
    const [updated] = await db.update(cityBuildingsTable)
      .set({ tenantId: String(user.id), tenantName, updatedAt: new Date() })
      .where(eq(cityBuildingsTable.id, buildingId))
      .returning();
    res.json({ building: updated, action: "rented", rentPrice: building.rentPrice });
  } catch (err: any) {
    console.error("[World] rent error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/world/buildings/:id", async (req, res) => {
  const user = req.user;
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const buildingId = Number(req.params.id as string);
    const rows = await db.select().from(cityBuildingsTable).where(eq(cityBuildingsTable.id, buildingId));
    if (rows.length === 0) { res.status(404).json({ error: "Building not found" }); return; }
    const building = rows[0];
    if (building.ownerId !== String(user.id)) {
      res.status(403).json({ error: "Not your building" }); return;
    }
    const refund = Math.round(building.buildCost * 0.4);
    await db.update(cityBuildingsTable)
      .set({ demolished: true, updatedAt: new Date() })
      .where(eq(cityBuildingsTable.id, buildingId));
    res.json({ ok: true, refund });
  } catch (err: any) {
    console.error("[World] demolish error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
