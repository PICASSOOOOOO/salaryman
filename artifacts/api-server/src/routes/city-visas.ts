// ─── City Visa + Citizenship Routes ─────────────────────────────────────────
// Visa = entry authorization for a city.
// Citizenship = earned long-term status (application → admin approval).
//
// POST /api/world/cities/:cityId/visa/apply        — auto-grants a visa (open borders v1)
// POST /api/world/cities/:cityId/citizenship/apply — submits citizenship application
// GET  /api/world/cities/my-visas                  — list the caller's visa rows
// PATCH /api/admin/citizenship/:userId/:cityId     — admin approve/deny citizenship

import { Router, type IRouter, type Request, type Response } from "express";
import { db, playerCityVisasTable, worldBusinessesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { isOwnerEmail } from "../lib/plan";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Login required" });
    return false;
  }
  return true;
}

// Minimum active real-world days in a city before citizenship eligibility.
const CITIZENSHIP_MIN_DAYS = 30;

// ── GET /api/world/cities/my-visas ───────────────────────────────────────────
router.get("/world/cities/my-visas", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const rows = await db
    .select()
    .from(playerCityVisasTable)
    .where(eq(playerCityVisasTable.userId, req.user!.id));
  res.json({ visas: rows });
});

// ── POST /api/world/cities/:cityId/visa/apply ────────────────────────────────
// Auto-grants a visa (open borders, v1). If a row already exists, returns it.
router.post("/world/cities/:cityId/visa/apply", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const { cityId } = req.params;
  if (!cityId || typeof cityId !== "string") {
    res.status(400).json({ error: "cityId required" });
    return;
  }

  const [visa] = await db
    .insert(playerCityVisasTable)
    .values({
      userId: req.user!.id,
      cityId,
      status: "visa",
    })
    .onConflictDoUpdate({
      target: [playerCityVisasTable.userId, playerCityVisasTable.cityId],
      set: { updatedAt: new Date() },
    })
    .returning();

  res.json({ visa, granted: true });
});

// ── POST /api/world/cities/:cityId/citizenship/apply ─────────────────────────
// Validates 3 eligibility criteria and flips status → 'applicant'.
// Criteria:
//   1. Holds a visa for this city (implicit: row exists)
//   2. Has been active in the city for at least CITIZENSHIP_MIN_DAYS real days
//   3. Owns a business in this city with net profit in the current or prior month
router.post("/world/cities/:cityId/citizenship/apply", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;
  const { cityId } = req.params;

  if (!cityId || typeof cityId !== "string") {
    res.status(400).json({ error: "cityId required" });
    return;
  }

  // Check visa row exists.
  const [visaRow] = await db
    .select()
    .from(playerCityVisasTable)
    .where(and(eq(playerCityVisasTable.userId, userId), eq(playerCityVisasTable.cityId, cityId)))
    .limit(1);

  if (!visaRow) {
    res.status(403).json({ error: "You do not hold a visa for this city. Apply for a visa first." });
    return;
  }

  if (visaRow.status === "applicant") {
    res.status(409).json({ error: "Your citizenship application is already pending review." });
    return;
  }
  if (visaRow.status === "citizen") {
    res.status(409).json({ error: "You are already a citizen of this city." });
    return;
  }

  // ── Criterion 1: participation days ────────────────────────────────────────
  const visaAgeMs = Date.now() - new Date(visaRow.grantedAt).getTime();
  const visaAgeDays = visaAgeMs / (1000 * 60 * 60 * 24);
  if (visaAgeDays < CITIZENSHIP_MIN_DAYS) {
    const remaining = Math.ceil(CITIZENSHIP_MIN_DAYS - visaAgeDays);
    res.status(422).json({
      error: `Participation requirement not met. You need ${remaining} more day(s) of active presence in this city (minimum ${CITIZENSHIP_MIN_DAYS} days required).`,
      criterion: "participation",
    });
    return;
  }

  // ── Criterion 2: profitable business in this city ──────────────────────────
  // Player must own a registered business whose city matches the target AND
  // have positive net invoices (paid) in the current or prior month.
  const biz = await db
    .select({ id: worldBusinessesTable.id })
    .from(worldBusinessesTable)
    .where(and(eq(worldBusinessesTable.userId, userId)))
    .limit(1);

  if (biz.length === 0) {
    res.status(422).json({
      error: "Profitable business requirement not met. You must own a registered business in this city with net profit in the current or prior month.",
      criterion: "business",
    });
    return;
  }

  // Check profitable month (current or prior).
  const now = new Date();
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const priorMonthStart = new Date(Date.UTC(now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear(), now.getUTCMonth() === 0 ? 11 : now.getUTCMonth() - 1, 1)).toISOString();

  const revenueRows = await db.execute<{ total: string }>(
    sql`
      SELECT COALESCE(SUM(total_amount), 0) AS total
      FROM invoices
      WHERE user_id = ${userId}
        AND status = 'paid'
        AND paid_at >= ${priorMonthStart}::timestamptz
    `
  );
  const revenue = Number(revenueRows.rows[0]?.total ?? 0);

  if (revenue <= 0) {
    res.status(422).json({
      error: "Profitable business requirement not met. Your business must have posted net profit (paid invoices) in the current or prior month.",
      criterion: "business",
    });
    return;
  }

  // ── All criteria met → flip to applicant ───────────────────────────────────
  const [updated] = await db
    .update(playerCityVisasTable)
    .set({ status: "applicant", updatedAt: new Date() })
    .where(and(eq(playerCityVisasTable.userId, userId), eq(playerCityVisasTable.cityId, cityId)))
    .returning();

  res.json({ visa: updated, message: "Your citizenship application has been submitted and is pending admin review." });
});

// ── PATCH /api/admin/citizenship/:userId/:cityId ──────────────────────────────
// Admin approves or denies a citizenship application.
router.patch("/admin/citizenship/:userId/:cityId", async (req, res) => {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  if (!isOwnerEmail(req.user.email ?? undefined)) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const { userId, cityId } = req.params;
  const { decision } = req.body ?? {};

  if (decision !== "approve" && decision !== "deny") {
    res.status(400).json({ error: "decision must be 'approve' or 'deny'" });
    return;
  }

  const [visaRow] = await db
    .select()
    .from(playerCityVisasTable)
    .where(and(eq(playerCityVisasTable.userId, userId), eq(playerCityVisasTable.cityId, cityId)))
    .limit(1);

  if (!visaRow) {
    res.status(404).json({ error: "Visa record not found" });
    return;
  }

  if (visaRow.status !== "applicant") {
    res.status(409).json({ error: `Cannot ${decision} — current status is '${visaRow.status}', not 'applicant'.` });
    return;
  }

  const newStatus = decision === "approve" ? "citizen" : "visa";
  const [updated] = await db
    .update(playerCityVisasTable)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(and(eq(playerCityVisasTable.userId, userId), eq(playerCityVisasTable.cityId, cityId)))
    .returning();

  res.json({ visa: updated, decision });
});

// ── GET /api/admin/citizenship/applications ───────────────────────────────────
// Lists all pending citizenship applicants, optionally filtered by cityId.
router.get("/admin/citizenship/applications", async (req, res) => {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  if (!isOwnerEmail(req.user.email ?? undefined)) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const { cityId } = req.query;
  const rows = await db.execute<{
    id: number;
    user_id: string;
    city_id: string;
    status: string;
    granted_at: string;
    updated_at: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
  }>(
    cityId && typeof cityId === "string"
      ? sql`
          SELECT v.id, v.user_id, v.city_id, v.status, v.granted_at, v.updated_at,
                 u.email, u.first_name, u.last_name
          FROM player_city_visas v
          LEFT JOIN users u ON u.id = v.user_id
          WHERE v.status = 'applicant' AND v.city_id = ${cityId}
          ORDER BY v.updated_at DESC
          LIMIT 200
        `
      : sql`
          SELECT v.id, v.user_id, v.city_id, v.status, v.granted_at, v.updated_at,
                 u.email, u.first_name, u.last_name
          FROM player_city_visas v
          LEFT JOIN users u ON u.id = v.user_id
          WHERE v.status = 'applicant'
          ORDER BY v.updated_at DESC
          LIMIT 200
        `
  );

  res.json({ applications: rows.rows });
});

export default router;
