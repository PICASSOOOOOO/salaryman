import { Router } from "express";
import { eq, sql, desc, and } from "drizzle-orm";
import { db, worldBusinessesTable, businessTransactionsTable, businessSnapshotsTable } from "@workspace/db";
import { getServerStatus, getLiberationProgress, recordHeartbeat } from "../worldServer";

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
    const { playerName, businessType, companyName, industry, companySize, contactEmail, isPaid } = req.body;
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
        isPaid: Boolean(isPaid),
        sessionId,
      })
      .returning();
    res.json({ ok: true, id: row.id });
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
    const govBase = charClass === "corporate" ? 100 : charClass === "replicant" ? 50 : 25;
    await db.insert(businessSnapshotsTable).values({
      playerName: String(playerName).slice(0, 32).toUpperCase(),
      userId: String(req.user.id),
      slotIndex: Number(slotIndex ?? 0),
      balance: 0,
      salary: 0,
      businessProfit: 0,
      governmentBaseSalary: govBase,
      realSalaryAmount: Math.round(realSalaryAmount),
      incomeType: "real",
      data: { proofObjectPath: proofObjectPath ?? null, companyName: companyName ?? null, declaredAt: new Date().toISOString() },
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
    // Derive gov base from most recent declaration instead of trusting client value
    const govBase = [25, 50, 100].includes(Number(governmentBaseSalary)) ? Number(governmentBaseSalary) : 25;
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

export default router;
