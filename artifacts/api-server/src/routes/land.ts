import { Router, type Request, type Response } from "express";
import { eq, and, or, ilike, inArray, asc, desc, sql } from "drizzle-orm";
import {
  db,
  landPlotsTable,
  constructionProjectsTable,
  constructionLaborLogTable,
  cityBuildingsTable,
  playerLedgerTable,
  bankAccountsTable,
  bankTransactionsTable,
  usersTable,
  cfSubmissionsTable,
  orgMembersTable,
  organizationsTable,
  type LandPlot,
  type ConstructionProject,
} from "@workspace/db";
import { isOwnerEmail, isPicassoOrgMemberEmail } from "../lib/plan";

const router = Router();

// ── org-labor-summary in-memory cache ────────────────────────────────────────
// Keyed by orgId (string). Holds the computed summary + the epoch-ms it was
// populated. Entries expire after LABOR_SUMMARY_TTL_MS and are eagerly
// invalidated when a new labor-log row is inserted for the same org.
const LABOR_SUMMARY_TTL_MS = 5 * 60 * 1000; // 5 minutes

type LaborStatWindow = { shifts: number; debtForgiven: number; uniqueLaborers: number };
type OrgLaborSummaryPayload = {
  orgId: number;
  orgName: string;
  allTime: LaborStatWindow;
  week: LaborStatWindow;
  cachedAt: number; // epoch ms the cache entry was populated
};

const orgLaborSummaryCache = new Map<string, OrgLaborSummaryPayload>();

/** Remove a single org's cached summary so the next request recomputes it. */
function invalidateOrgLaborSummary(orgId: string): void {
  orgLaborSummaryCache.delete(orgId);
}

// ── auth helpers (mirrors cf.ts) ─────────────────────────────────────────────
function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated?.() || !req.user) {
    res.status(401).json({ error: "Login required" });
    return false;
  }
  return true;
}
function uid(req: Request): string {
  return String((req.user as { id: string }).id);
}

// Only the game OWNER or a PICASSO admin may OPEN a plot for construction.
async function canApprove(userId: string): Promise<boolean> {
  const [u] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return isOwnerEmail(u?.email) || isPicassoOrgMemberEmail(u?.email);
}

// Resolve the org admin context for a user. Returns org info if user has
// manager+ role in any org, null otherwise.
async function resolveOrgAdminCtx(userId: string): Promise<{ orgId: number; orgName: string } | null> {
  const rows = await db
    .select({ orgId: orgMembersTable.orgId, role: orgMembersTable.role })
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")))
    .limit(10);
  const adminRow = rows.find((r) => ["owner", "director", "manager"].includes(r.role));
  if (!adminRow) return null;
  const [org] = await db
    .select({ id: organizationsTable.id, name: organizationsTable.name })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, adminRow.orgId))
    .limit(1);
  if (!org) return null;
  return { orgId: org.id, orgName: org.name };
}

// ── tuning ───────────────────────────────────────────────────────────────────
const MAX_ACTIVE_PROJECTS = 6; // concurrent in-progress builds (crew capacity)
const WORK_UNITS_PER_SHIFT = 10; // labor delivered per worked shift
const REWARD_PER_SHIFT = 200; // ƒ default earned (non-debtor) or debt forgiven (debtor)
const MAX_REWARD_OVERRIDE = 5000; // ƒ hard cap on org-posted bounties
const WORK_COOLDOWN_MS = 12_000; // anti-spam per laborer per project

const LABOR_BY_TYPE: Record<string, number> = {
  studio: 70, home: 80, retail: 100, office: 120, warehouse: 160,
  tower: 240, penthouse: 220, hq: 300,
};
const COLOR_BY_TYPE: Record<string, string> = {
  studio: "#a78bfa", home: "#34d399", retail: "#fbbf24", office: "#38bdf8",
  warehouse: "#94a3b8", tower: "#f472b6", penthouse: "#f59e0b", hq: "#ef4444",
};
const VALID_TYPES = new Set(Object.keys(LABOR_BY_TYPE));

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
// Transaction-scoped advisory locks (auto-released at commit/rollback). We use a
// two-arg namespace so plot locks (class 1) and the scheduler lock (class 2)
// never collide. All paths that touch a plot + its project acquire the plot lock
// FIRST, so release/work can never deadlock by grabbing row locks in opposite
// order.
async function lockPlot(tx: Tx, plotId: number): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(1, ${plotId})`);
}
async function lockScheduler(tx: Tx): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(2, 0)`);
}

// ── one-time idempotent seed of the zoning hierarchy ─────────────────────────
let seedPromise: Promise<void> | null = null;
function seedLandPlots(): Promise<void> {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    const existing = await db.select({ id: landPlotsTable.id }).from(landPlotsTable).limit(1);
    if (existing.length > 0) return;

    type Seed = { sector: string; zone: string; district: string; hamlet: string; commune: string; plots: number };
    const layout: Seed[] = [
      { sector: "Reclaimed Core", zone: "Foundry Zone", district: "Ash District", hamlet: "Cinder Hamlet", commune: "Ember Commune", plots: 3 },
      { sector: "Reclaimed Core", zone: "Garden Zone", district: "Green District", hamlet: "Sprout Hamlet", commune: "Root Commune", plots: 3 },
      { sector: "Outer Wall", zone: "Frontier Zone", district: "Rampart District", hamlet: "Gate Hamlet", commune: "Watch Commune", plots: 2 },
    ];

    let col = 0;
    const baseX = 5680;
    const baseY = 5760;
    const stepX = 90;
    const stepY = 80;
    const rows: typeof landPlotsTable.$inferInsert[] = [];
    for (const s of layout) {
      for (let i = 0; i < s.plots; i++) {
        const x = baseX + (col % 6) * stepX;
        const y = baseY + Math.floor(col / 6) * stepY;
        col++;
        rows.push({
          cityId: "minx",
          sector: s.sector,
          zone: s.zone,
          district: s.district,
          hamlet: s.hamlet,
          commune: s.commune,
          name: `${s.commune} Plot ${i + 1}`,
          x, y, w: 70, h: 55,
          status: "unclaimed",
        });
      }
    }
    if (rows.length) await db.insert(landPlotsTable).values(rows);
  })().catch((e) => {
    seedPromise = null;
    throw e;
  });
  return seedPromise;
}

async function getDebt(userId: string): Promise<number> {
  const [led] = await db
    .select({ debt: playerLedgerTable.debt })
    .from(playerLedgerTable)
    .where(eq(playerLedgerTable.userId, userId))
    .limit(1);
  return led?.debt ?? 0;
}

// Promote queued projects into the active crew, highest debt FIRST.
async function tickConstruction(): Promise<void> {
  await db.transaction(async (tx) => {
    await lockScheduler(tx);
    const active = await tx
      .select({ id: constructionProjectsTable.id })
      .from(constructionProjectsTable)
      .where(eq(constructionProjectsTable.status, "in_progress"));
    const slots = MAX_ACTIVE_PROJECTS - active.length;
    if (slots <= 0) return;

    const queued = await tx
      .select()
      .from(constructionProjectsTable)
      .where(eq(constructionProjectsTable.status, "queued"));
    if (queued.length === 0) return;

    const ownerIds = [...new Set(queued.map((q) => q.ownerId))];
    const ledgers = ownerIds.length
      ? await tx
          .select({ userId: playerLedgerTable.userId, debt: playerLedgerTable.debt })
          .from(playerLedgerTable)
          .where(inArray(playerLedgerTable.userId, ownerIds))
      : [];
    const debtBy = new Map(ledgers.map((l) => [l.userId, l.debt]));

    const ranked = queued
      .map((q) => ({ q, debt: debtBy.get(q.ownerId) ?? 0 }))
      .sort((a, b) => b.debt - a.debt || a.q.id - b.q.id);

    for (const { q, debt } of ranked.slice(0, slots)) {
      await tx
        .update(constructionProjectsTable)
        .set({ status: "in_progress", startedAt: new Date(), priorityScore: debt, updatedAt: new Date() })
        .where(and(eq(constructionProjectsTable.id, q.id), eq(constructionProjectsTable.status, "queued")));
    }
  });
}

// ── shaping helpers ──────────────────────────────────────────────────────────
type PlotWithProject = LandPlot & { project: ConstructionProject | null };

async function listPlots(): Promise<PlotWithProject[]> {
  const plots = await db.select().from(landPlotsTable).orderBy(asc(landPlotsTable.id));
  const plotIds = plots.map((p) => p.id);
  const projects = plotIds.length
    ? await db
        .select()
        .from(constructionProjectsTable)
        .where(
          and(
            inArray(constructionProjectsTable.plotId, plotIds),
            inArray(constructionProjectsTable.status, ["designing", "queued", "in_progress"]),
          ),
        )
    : [];
  const byPlot = new Map(projects.map((pr) => [pr.plotId, pr]));
  return plots.map((p) => ({ ...p, project: byPlot.get(p.id) ?? null }));
}

// ── routes ───────────────────────────────────────────────────────────────────

// Browse the whole land registry.
router.get("/land/plots", async (req: Request, res: Response) => {
  try {
    await seedLandPlots();
    await tickConstruction();
    const plots = await listPlots();
    let approver = false;
    if (req.isAuthenticated?.() && req.user) approver = await canApprove(uid(req));
    res.json({ plots, canApprove: approver });
  } catch (e) {
    console.error("[land] list failed", e);
    res.status(500).json({ error: "Failed to load land registry" });
  }
});

// Reserve an unclaimed plot.
router.post("/land/plots/:id/claim", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  const plotId = Number(req.params.id);
  if (!Number.isInteger(plotId)) { res.status(400).json({ error: "Bad plot id" }); return; }
  try {
    const out = await db.transaction(async (tx) => {
      const [plot] = await tx.select().from(landPlotsTable).where(eq(landPlotsTable.id, plotId)).for("update").limit(1);
      if (!plot) return { status: 404, error: "Plot not found" } as const;
      if (plot.status !== "unclaimed") return { status: 409, error: "Plot is not available to claim" } as const;
      const [updated] = await tx
        .update(landPlotsTable)
        .set({ status: "claimed", claimedBy: userId, claimedAt: new Date(), updatedAt: new Date() })
        .where(eq(landPlotsTable.id, plotId))
        .returning();
      return { status: 200, plot: updated } as const;
    });
    if (out.status !== 200) { res.status(out.status).json({ error: out.error }); return; }
    res.json({ ok: true, plot: out.plot });
  } catch (e) {
    console.error("[land] claim failed", e);
    res.status(500).json({ error: "Failed to claim plot" });
  }
});

// Give up a claim — only before a build exists.
router.post("/land/plots/:id/release", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  const plotId = Number(req.params.id);
  if (!Number.isInteger(plotId)) { res.status(400).json({ error: "Bad plot id" }); return; }
  try {
    const approver = await canApprove(userId);
    const out = await db.transaction(async (tx) => {
      await lockPlot(tx, plotId);
      const [plot] = await tx.select().from(landPlotsTable).where(eq(landPlotsTable.id, plotId)).for("update").limit(1);
      if (!plot) return { status: 404, error: "Plot not found" } as const;
      if (plot.status === "built") return { status: 409, error: "Plot is already built" } as const;
      if (plot.claimedBy !== userId && !approver) return { status: 403, error: "Not your claim" } as const;
      await tx
        .update(constructionProjectsTable)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(and(eq(constructionProjectsTable.plotId, plotId), inArray(constructionProjectsTable.status, ["designing", "queued", "in_progress"])));
      const [updated] = await tx
        .update(landPlotsTable)
        .set({ status: "unclaimed", claimedBy: null, claimedAt: null, approvedBy: null, approvedAt: null, updatedAt: new Date() })
        .where(eq(landPlotsTable.id, plotId))
        .returning();
      return { status: 200, plot: updated } as const;
    });
    if (out.status !== 200) { res.status(out.status).json({ error: out.error }); return; }
    res.json({ ok: true, plot: out.plot });
  } catch (e) {
    console.error("[land] release failed", e);
    res.status(500).json({ error: "Failed to release plot" });
  }
});

// KEYSTONE: open a claimed plot for construction. OWNER / PICASSO admin ONLY.
router.post("/land/plots/:id/open", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  const plotId = Number(req.params.id);
  if (!Number.isInteger(plotId)) { res.status(400).json({ error: "Bad plot id" }); return; }
  try {
    if (!(await canApprove(userId))) {
      res.status(403).json({ error: "Only the owner or a Picasso admin can open a plot for construction" });
      return;
    }
    const out = await db.transaction(async (tx) => {
      const [plot] = await tx.select().from(landPlotsTable).where(eq(landPlotsTable.id, plotId)).for("update").limit(1);
      if (!plot) return { status: 404, error: "Plot not found" } as const;
      if (plot.status !== "claimed") return { status: 409, error: "Plot must be claimed before it can be opened" } as const;
      const [updated] = await tx
        .update(landPlotsTable)
        .set({ status: "open", approvedBy: userId, approvedAt: new Date(), updatedAt: new Date() })
        .where(eq(landPlotsTable.id, plotId))
        .returning();
      return { status: 200, plot: updated } as const;
    });
    if (out.status !== 200) { res.status(out.status).json({ error: out.error }); return; }
    res.json({ ok: true, plot: out.plot });
  } catch (e) {
    console.error("[land] open failed", e);
    res.status(500).json({ error: "Failed to open plot" });
  }
});

// Close an opened plot back to claimed (revoke approval). Approver only.
router.post("/land/plots/:id/close", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  const plotId = Number(req.params.id);
  if (!Number.isInteger(plotId)) { res.status(400).json({ error: "Bad plot id" }); return; }
  try {
    if (!(await canApprove(userId))) { res.status(403).json({ error: "Only the owner or a Picasso admin can revoke approval" }); return; }
    const out = await db.transaction(async (tx) => {
      const [plot] = await tx.select().from(landPlotsTable).where(eq(landPlotsTable.id, plotId)).for("update").limit(1);
      if (!plot) return { status: 404, error: "Plot not found" } as const;
      if (plot.status !== "open") return { status: 409, error: "Plot is not open" } as const;
      const [updated] = await tx
        .update(landPlotsTable)
        .set({ status: "claimed", approvedBy: null, approvedAt: null, updatedAt: new Date() })
        .where(eq(landPlotsTable.id, plotId))
        .returning();
      return { status: 200, plot: updated } as const;
    });
    if (out.status !== 200) { res.status(out.status).json({ error: out.error }); return; }
    res.json({ ok: true, plot: out.plot });
  } catch (e) {
    console.error("[land] close failed", e);
    res.status(500).json({ error: "Failed to close plot" });
  }
});

// Start a construction project on an OPEN plot. Claimer only.
router.post("/land/plots/:id/construct", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  const plotId = Number(req.params.id);
  if (!Number.isInteger(plotId)) { res.status(400).json({ error: "Bad plot id" }); return; }
  const buildingType = String(req.body?.buildingType || "home");
  const label = String(req.body?.label || "New Building").slice(0, 120);
  const design = (req.body?.design && typeof req.body.design === "object") ? req.body.design : {};
  if (!VALID_TYPES.has(buildingType)) { res.status(400).json({ error: "Unknown building type" }); return; }
  try {
    const debt = await getDebt(userId);
    const out = await db.transaction(async (tx) => {
      await lockPlot(tx, plotId);
      const [plot] = await tx.select().from(landPlotsTable).where(eq(landPlotsTable.id, plotId)).for("update").limit(1);
      if (!plot) return { status: 404, error: "Plot not found" } as const;
      if (plot.claimedBy !== userId) return { status: 403, error: "You have not claimed this plot" } as const;
      if (plot.status !== "open") {
        return { status: 409, error: "This plot has not been opened for construction by the owner or a Picasso admin" } as const;
      }
      const laborRequired = LABOR_BY_TYPE[buildingType] ?? 100;
      const [project] = await tx
        .insert(constructionProjectsTable)
        .values({
          plotId,
          ownerId: userId,
          buildingType,
          label,
          design,
          laborRequired,
          laborApplied: 0,
          progress: 0,
          priorityScore: debt,
          status: "queued",
        })
        .returning();
      await tx.update(landPlotsTable).set({ status: "building", updatedAt: new Date() }).where(eq(landPlotsTable.id, plotId));
      return { status: 200, project } as const;
    });
    if (out.status !== 200) { res.status(out.status).json({ error: out.error }); return; }
    await tickConstruction();
    res.json({ ok: true, project: out.project });
  } catch (e) {
    console.error("[land] construct failed", e);
    res.status(500).json({ error: "Failed to start construction" });
  }
});

/**
 * PATCH /api/construction/:id/set-org
 * Org admin sets their org as the owning organization of this project and
 * optionally flags it as open to debtor labor from the Collections Facility.
 *
 * Rules:
 * - Only the PROJECT OWNER (who is also an org admin) may associate their
 *   own project with their org. This prevents one org from hijacking another
 *   player's build.
 * - Once associated, the project appears in the CF labor-sources feed so
 *   debtors can work shifts on it (reducing their own debt while advancing
 *   the org's build).
 * - Passing { owningOrgId: null } clears the association.
 */
router.patch("/construction/:id/set-org", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  const projectId = Number(req.params.id);
  if (!Number.isInteger(projectId)) { res.status(400).json({ error: "Bad project id" }); return; }

  try {
    const [project] = await db.select().from(constructionProjectsTable).where(eq(constructionProjectsTable.id, projectId)).limit(1);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    if (project.ownerId !== userId) { res.status(403).json({ error: "Only the project owner can associate an org" }); return; }

    const b = req.body ?? {};
    const clearing = b.owningOrgId === null || b.owningOrgId === "";

    if (clearing) {
      await db.update(constructionProjectsTable)
        .set({ owningOrgId: null, owningOrgName: null, openToDebtorLabor: false, updatedAt: new Date() })
        .where(eq(constructionProjectsTable.id, projectId));
      res.json({ ok: true, owningOrgId: null, owningOrgName: null, openToDebtorLabor: false });
      return;
    }

    // Verify caller is an org admin of their org.
    const orgCtx = await resolveOrgAdminCtx(userId);
    if (!orgCtx) { res.status(403).json({ error: "You must be an org admin to associate a project with an org" }); return; }

    const openToDebtorLabor = !!b.openToDebtorLabor;
    let rewardOverride: number | null = null;
    if (b.rewardOverride !== undefined && b.rewardOverride !== null) {
      const parsed = Number(b.rewardOverride);
      if (Number.isInteger(parsed) && parsed > 0) {
        rewardOverride = Math.min(parsed, MAX_REWARD_OVERRIDE);
      }
    }
    await db.update(constructionProjectsTable)
      .set({
        owningOrgId: String(orgCtx.orgId),
        owningOrgName: orgCtx.orgName,
        openToDebtorLabor,
        rewardOverride,
        updatedAt: new Date(),
      })
      .where(eq(constructionProjectsTable.id, projectId));

    res.json({ ok: true, owningOrgId: String(orgCtx.orgId), owningOrgName: orgCtx.orgName, openToDebtorLabor, rewardOverride });
  } catch (e) {
    console.error("[land] set-org failed", e);
    res.status(500).json({ error: "Failed to update org association" });
  }
});

// The active/queued build board, ranked by priority (debt-holders first).
router.get("/construction/projects", async (req: Request, res: Response) => {
  try {
    await tickConstruction();
    const projects = await db.select().from(constructionProjectsTable).orderBy(asc(constructionProjectsTable.id));
    res.json({ projects });
  } catch (e) {
    console.error("[land] projects failed", e);
    res.status(500).json({ error: "Failed to load projects" });
  }
});

/**
 * Organization-scoped ownership and build pipeline.
 * Any active member may view their own organization's associated projects.
 * The requested organization id is always verified against active membership
 * before any construction rows are returned.
 */
router.get("/construction/org-overview", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  const orgId = Number(req.query.orgId);
  if (!Number.isInteger(orgId) || orgId <= 0) {
    res.status(400).json({ error: "Valid orgId required" });
    return;
  }

  try {
    const [membership] = await db
      .select({ orgId: orgMembersTable.orgId })
      .from(orgMembersTable)
      .where(
        and(
          eq(orgMembersTable.userId, userId),
          eq(orgMembersTable.orgId, orgId),
          eq(orgMembersTable.status, "active"),
        ),
      )
      .limit(1);
    if (!membership) {
      res.status(403).json({ error: "Active organization membership required" });
      return;
    }

    await tickConstruction();
    const projects = await db
      .select()
      .from(constructionProjectsTable)
      .where(eq(constructionProjectsTable.owningOrgId, String(orgId)))
      .orderBy(desc(constructionProjectsTable.createdAt));
    const plotIds = [...new Set(projects.map((project) => project.plotId))];
    const plots = plotIds.length
      ? await db
          .select()
          .from(landPlotsTable)
          .where(inArray(landPlotsTable.id, plotIds))
          .orderBy(asc(landPlotsTable.id))
      : [];

    res.json({ orgId, projects, plots });
  } catch (e) {
    console.error("[land] org overview failed", e);
    res.status(500).json({ error: "Failed to load organization construction overview" });
  }
});

/**
 * GET /api/construction/org-labor-summary
 * Returns aggregate debtor-labor stats for the calling user's org across all
 * their construction projects and world-build plans. Two windows: last 7 days
 * and all time. Requires manager+ role in an org.
 *
 * Response:
 *   { orgId, orgName, allTime: { shifts, debtForgiven, uniqueLaborers },
 *     week: { shifts, debtForgiven, uniqueLaborers } }
 */
router.get("/construction/org-labor-summary", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  const orgCtx = await resolveOrgAdminCtx(userId);
  if (!orgCtx) {
    res.status(403).json({ error: "Org admin access required" });
    return;
  }
  try {
    const orgIdStr = String(orgCtx.orgId);

    // Serve from cache if still fresh.
    const cached = orgLaborSummaryCache.get(orgIdStr);
    if (cached && Date.now() - cached.cachedAt < LABOR_SUMMARY_TTL_MS) {
      res.json(cached);
      return;
    }

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [allTimeRows, weekRows] = await Promise.all([
      db
        .select({
          shifts: sql<number>`COUNT(*)::int`,
          debtForgiven: sql<number>`COALESCE(SUM(${constructionLaborLogTable.reward}), 0)::int`,
          uniqueLaborers: sql<number>`COUNT(DISTINCT ${constructionLaborLogTable.laborerId})::int`,
        })
        .from(constructionLaborLogTable)
        .where(
          and(
            eq(constructionLaborLogTable.benefitingOrgId, orgIdStr),
            eq(constructionLaborLogTable.wasDebtor, true),
          ),
        ),
      db
        .select({
          shifts: sql<number>`COUNT(*)::int`,
          debtForgiven: sql<number>`COALESCE(SUM(${constructionLaborLogTable.reward}), 0)::int`,
          uniqueLaborers: sql<number>`COUNT(DISTINCT ${constructionLaborLogTable.laborerId})::int`,
        })
        .from(constructionLaborLogTable)
        .where(
          and(
            eq(constructionLaborLogTable.benefitingOrgId, orgIdStr),
            eq(constructionLaborLogTable.wasDebtor, true),
            sql`${constructionLaborLogTable.createdAt} >= ${weekAgo}`,
          ),
        ),
    ]);

    const allTime = allTimeRows[0] ?? { shifts: 0, debtForgiven: 0, uniqueLaborers: 0 };
    const week = weekRows[0] ?? { shifts: 0, debtForgiven: 0, uniqueLaborers: 0 };

    const payload: OrgLaborSummaryPayload = {
      orgId: orgCtx.orgId,
      orgName: orgCtx.orgName,
      allTime,
      week,
      cachedAt: Date.now(),
    };
    orgLaborSummaryCache.set(orgIdStr, payload);

    res.json(payload);
  } catch (e) {
    console.error("[land] org-labor-summary failed", e);
    res.status(500).json({ error: "Failed to load labor summary" });
  }
});

/**
 * GET /api/construction/org-labor — return in_progress construction projects
 * that are org-owned and open to debtor labor, for CF labor-sources display.
 */
router.get("/construction/org-labor", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  try {
    await tickConstruction();
    const projects = await db
      .select()
      .from(constructionProjectsTable)
      .where(
        and(
          eq(constructionProjectsTable.status, "in_progress"),
          eq(constructionProjectsTable.openToDebtorLabor, true),
        ),
      )
      .orderBy(desc(constructionProjectsTable.priorityScore), asc(constructionProjectsTable.id))
      .limit(20);
    res.json({ projects });
  } catch (e) {
    console.error("[land] org-labor failed", e);
    res.status(500).json({ error: "Failed to load org labor sources" });
  }
});

/**
 * GET /api/construction/my-projects
 * Returns all construction projects owned by the current user, across all
 * statuses. Includes debtorShifts — the number of debtor-worked shifts logged
 * on each project. Used by the org-admin "Labor Requests" management panel.
 */
router.get("/construction/my-projects", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  try {
    const projects = await db
      .select()
      .from(constructionProjectsTable)
      .where(eq(constructionProjectsTable.ownerId, userId))
      .orderBy(desc(constructionProjectsTable.createdAt));

    const projectIds = projects.map((p) => p.id);
    // Count only debtor shifts that benefited the project's owning org —
    // i.e. benefitingOrgId must match owningOrgId for each project row.
    const shiftCounts =
      projectIds.length > 0
        ? await db
            .select({
              projectId: constructionLaborLogTable.projectId,
              debtorShifts: sql<number>`COUNT(*)::int`,
            })
            .from(constructionLaborLogTable)
            .innerJoin(
              constructionProjectsTable,
              and(
                eq(constructionProjectsTable.id, constructionLaborLogTable.projectId),
                eq(constructionLaborLogTable.benefitingOrgId, constructionProjectsTable.owningOrgId),
              ),
            )
            .where(
              and(
                inArray(constructionLaborLogTable.projectId, projectIds),
                eq(constructionLaborLogTable.wasDebtor, true),
              ),
            )
            .groupBy(constructionLaborLogTable.projectId)
        : [];

    const shiftMap: Record<number, number> = {};
    for (const s of shiftCounts) shiftMap[s.projectId] = s.debtorShifts;

    res.json({ projects: projects.map((p) => ({ ...p, debtorShifts: shiftMap[p.id] ?? 0 })) });
  } catch (e) {
    console.error("[land] my-projects failed", e);
    res.status(500).json({ error: "Failed to load your projects" });
  }
});

/**
 * GET /api/construction/:id/labor-summary
 * Returns aggregate debtor-labor stats for a single construction project,
 * plus a paginated per-laborer breakdown of debtor shifts.
 *
 * Query params:
 *   page  — 1-based page number (default 1)
 *   limit — rows per page (default 20, max 50)
 *   q     — optional case-insensitive search over @username / first name
 *   sort  — "recent" (default), "shifts", or "debt"
 *   dir   — "asc" or "desc" (default "desc")
 *
 * Allowed callers: project owner, global admin, or active manager/director/owner
 * of the project's owning org. All others receive 403.
 */
router.get("/construction/:id/labor-summary", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const projectId = Number(req.params.id);
  if (!Number.isFinite(projectId)) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;
  const q = String(req.query.q ?? "").trim().slice(0, 60);
  const sort = ["recent", "shifts", "debt"].includes(String(req.query.sort))
    ? String(req.query.sort)
    : "recent";
  const dir = String(req.query.dir) === "asc" ? "asc" : "desc";

  const userId = uid(req);
  try {
    const [project] = await db
      .select({ ownerId: constructionProjectsTable.ownerId, owningOrgId: constructionProjectsTable.owningOrgId })
      .from(constructionProjectsTable)
      .where(eq(constructionProjectsTable.id, projectId))
      .limit(1);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    // Authorization: project owner always allowed; otherwise check global admin
    // or org-admin role for the project's owning org.
    if (project.ownerId !== userId) {
      const [u] = await db
        .select({ email: usersTable.email })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      const globalAdmin = isOwnerEmail(u?.email) || isPicassoOrgMemberEmail(u?.email);
      if (!globalAdmin) {
        let isOrgAdmin = false;
        if (project.owningOrgId) {
          const orgRows = await db
            .select({ role: orgMembersTable.role })
            .from(orgMembersTable)
            .where(
              and(
                eq(orgMembersTable.userId, userId),
                eq(orgMembersTable.orgId, Number(project.owningOrgId)),
                eq(orgMembersTable.status, "active"),
              ),
            )
            .limit(5);
          isOrgAdmin = orgRows.some((r) => ["owner", "director", "manager"].includes(r.role));
        }
        if (!isOrgAdmin) {
          res.status(403).json({ error: "Not authorized to view labor summary for this project" });
          return;
        }
      }
    }

    // Aggregate totals (all shifts)
    const [totals] = await db
      .select({
        totalShifts: sql<number>`COUNT(*)::int`,
        debtorShifts: sql<number>`SUM(CASE WHEN ${constructionLaborLogTable.wasDebtor} THEN 1 ELSE 0 END)::int`,
        totalUnits: sql<number>`COALESCE(SUM(${constructionLaborLogTable.units}),0)::int`,
        totalDebtForgiven: sql<number>`COALESCE(SUM(CASE WHEN ${constructionLaborLogTable.wasDebtor} THEN ${constructionLaborLogTable.reward} ELSE 0 END),0)::int`,
      })
      .from(constructionLaborLogTable)
      .where(eq(constructionLaborLogTable.projectId, projectId));

    // Optional name search over @username / first name. The breakdown rows are
    // grouped per laborer, so the filter is applied in WHERE (pre-aggregation).
    const baseCond = and(
      eq(constructionLaborLogTable.projectId, projectId),
      eq(constructionLaborLogTable.wasDebtor, true),
    );
    const rowWhere = q
      ? and(
          baseCond,
          or(
            ilike(usersTable.username, `%${q}%`),
            ilike(usersTable.firstName, `%${q}%`),
          ),
        )
      : baseCond;

    // Count of debtor laborers matching the filter — drives pagination + header.
    const [debtorLaborerCount] = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${constructionLaborLogTable.laborerId})::int` })
      .from(constructionLaborLogTable)
      .leftJoin(usersTable, eq(usersTable.id, constructionLaborLogTable.laborerId))
      .where(rowWhere);
    const matchedLaborers = debtorLaborerCount?.count ?? 0;

    // Unfiltered distinct-debtor count for the stat tiles / breakdown header.
    let totalDebtorLaborers = matchedLaborers;
    if (q) {
      const [allCount] = await db
        .select({ count: sql<number>`COUNT(DISTINCT ${constructionLaborLogTable.laborerId})::int` })
        .from(constructionLaborLogTable)
        .where(baseCond);
      totalDebtorLaborers = allCount?.count ?? 0;
    }
    const totalPages = Math.max(1, Math.ceil(matchedLaborers / limit));

    // Sort expression: by most recent shift (default), shift count, or debt forgiven.
    const order = (() => {
      if (sort === "shifts") return sql`COUNT(*)`;
      if (sort === "debt") return sql`COALESCE(SUM(${constructionLaborLogTable.reward}),0)`;
      return sql`MAX(${constructionLaborLogTable.createdAt})`;
    })();
    const orderBy = dir === "asc" ? asc(order) : desc(order);

    // Per-laborer breakdown for debtor shifts, aggregated, with user display info
    const laborerRows = await db
      .select({
        laborerId: constructionLaborLogTable.laborerId,
        shifts: sql<number>`COUNT(*)::int`,
        totalUnits: sql<number>`COALESCE(SUM(${constructionLaborLogTable.units}),0)::int`,
        totalReward: sql<number>`COALESCE(SUM(${constructionLaborLogTable.reward}),0)::int`,
        lastShiftAt: sql<string>`MAX(${constructionLaborLogTable.createdAt})::text`,
        username: usersTable.username,
        firstName: usersTable.firstName,
      })
      .from(constructionLaborLogTable)
      .leftJoin(usersTable, eq(usersTable.id, constructionLaborLogTable.laborerId))
      .where(rowWhere)
      .groupBy(
        constructionLaborLogTable.laborerId,
        usersTable.username,
        usersTable.firstName,
      )
      .orderBy(orderBy, asc(constructionLaborLogTable.laborerId))
      .limit(limit)
      .offset(offset);

    // Build display names: prefer @username, then first name, then anonymized ID
    const laborers = laborerRows.map((r) => ({
      laborerId: r.laborerId,
      displayName: r.username
        ? `@${r.username}`
        : r.firstName
          ? r.firstName
          : `INMATE-${r.laborerId.slice(-6).toUpperCase()}`,
      shifts: r.shifts,
      totalUnits: r.totalUnits,
      totalReward: r.totalReward,
      lastShiftAt: r.lastShiftAt,
    }));

    res.json({
      projectId,
      totalShifts: totals?.totalShifts ?? 0,
      debtorShifts: totals?.debtorShifts ?? 0,
      totalUnits: totals?.totalUnits ?? 0,
      totalDebtForgiven: totals?.totalDebtForgiven ?? 0,
      laborers,
      page,
      totalPages,
      totalDebtorLaborers,
      matchedLaborers,
      q,
      sort,
      dir,
    });
  } catch (e) {
    console.error("[land] labor-summary failed", e);
    res.status(500).json({ error: "Failed to load labor summary" });
  }
});

async function creditFiat(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  amount: number,
  description: string,
): Promise<number> {
  const accts = await tx
    .select()
    .from(bankAccountsTable)
    .where(and(eq(bankAccountsTable.userId, userId), eq(bankAccountsTable.currency, "FIAT")))
    .for("update");
  let acct = [...accts].sort((a, b) => (b.balance || 0) - (a.balance || 0))[0];
  if (!acct) {
    const [created] = await tx
      .insert(bankAccountsTable)
      .values({ userId, kind: "checking", label: "Checking", balance: 0, currency: "FIAT" })
      .returning();
    acct = created;
  }
  const newBal = (acct.balance || 0) + amount;
  await tx.update(bankAccountsTable).set({ balance: newBal, updatedAt: new Date() }).where(eq(bankAccountsTable.id, acct.id));
  await tx
    .insert(bankTransactionsTable)
    .values({ userId, accountId: acct.id, kind: "wage", description, amount, balanceAfter: newBal });
  return newBal;
}

/**
 * POST /api/construction/:id/work
 * Work a shift on an in-progress build.
 *
 * Debtors work off debt (they ARE the labor pool); everyone else earns ƒ wage.
 *
 * For org-owned projects with openToDebtorLabor=true: ANY incarcerated debtor
 * (not just the project owner) can work this shift. The labor log records
 * which org benefited so the audit trail is clear. The CF audit row
 * (cf_submissions kind='construction') records the benefiting org.
 */
router.post("/construction/:id/work", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  const projectId = Number(req.params.id);
  if (!Number.isInteger(projectId)) { res.status(400).json({ error: "Bad project id" }); return; }
  try {
    const out = await db.transaction(async (tx) => {
      const [pre] = await tx
        .select({ plotId: constructionProjectsTable.plotId })
        .from(constructionProjectsTable)
        .where(eq(constructionProjectsTable.id, projectId))
        .limit(1);
      if (!pre) return { status: 404, error: "Project not found" } as const;
      await lockPlot(tx, pre.plotId);
      const [project] = await tx
        .select()
        .from(constructionProjectsTable)
        .where(eq(constructionProjectsTable.id, projectId))
        .for("update")
        .limit(1);
      if (!project) return { status: 404, error: "Project not found" } as const;
      if (project.status !== "in_progress") {
        return { status: 409, error: project.status === "queued" ? "This build is queued — waiting for a crew slot" : "This build is not accepting labor" } as const;
      }

      // Cooldown per laborer per project (anti-spam).
      const [latest] = await tx
        .select({ createdAt: constructionLaborLogTable.createdAt })
        .from(constructionLaborLogTable)
        .where(and(eq(constructionLaborLogTable.projectId, projectId), eq(constructionLaborLogTable.laborerId, userId)))
        .orderBy(desc(constructionLaborLogTable.createdAt))
        .limit(1);
      if (latest?.createdAt) {
        const since = Date.now() - new Date(latest.createdAt).getTime();
        if (since < WORK_COOLDOWN_MS) {
          return { status: 429, error: "Catch your breath", retryAfterMs: WORK_COOLDOWN_MS - since } as const;
        }
      }

      const units = Math.min(WORK_UNITS_PER_SHIFT, project.laborRequired - project.laborApplied);
      const newApplied = project.laborApplied + units;
      const progress = Math.min(100, Math.round((newApplied / project.laborRequired) * 100));

      // Pay the laborer. Two clear paths:
      //   A) DEBTOR + INCARCERATED: user has debt > 0 AND jailUntil is set and
      //      in the future. The incarceration guard is mandatory — without it a
      //      debtor could work construction from anywhere and bypass CF entirely.
      //      For org-owned projects with openToDebtorLabor=true, ANY incarcerated
      //      debtor may work (not just the owner). For other projects only the
      //      project owner can trigger debt reduction; non-owner debtors earn wages.
      //   B) WAGE PATH: no debt, OR debt but not incarcerated (free citizen helping),
      //      OR non-owner debtor on a non-open project. Earns REWARD_PER_SHIFT fiat.
      const [led] = await tx
        .select()
        .from(playerLedgerTable)
        .where(eq(playerLedgerTable.userId, userId))
        .for("update")
        .limit(1);
      const debt = led?.debt ?? 0;
      const isIncarcerated =
        debt > 0 &&
        !!led?.jailUntil &&
        new Date(led.jailUntil).getTime() > Date.now();

      // Eligible for debt-reduction path?
      const canReduceDebt =
        isIncarcerated &&
        (project.ownerId === userId ||
          (!!project.owningOrgId && project.openToDebtorLabor));

      // Use the org-posted bounty if set (capped at MAX_REWARD_OVERRIDE server-side),
      // else fall back to the default REWARD_PER_SHIFT.
      const effectiveReward = project.rewardOverride
        ? Math.min(project.rewardOverride, MAX_REWARD_OVERRIDE)
        : REWARD_PER_SHIFT;

      const wasDebtor = canReduceDebt;
      let reward = 0;
      if (wasDebtor) {
        reward = Math.min(debt, effectiveReward);
        await tx.update(playerLedgerTable).set({
          debt: debt - reward,
          lastCfWorkAt: new Date(),
          jailUntil: debt - reward === 0 ? null : led!.jailUntil,
          updatedAt: new Date(),
        }).where(eq(playerLedgerTable.userId, userId));
      } else {
        reward = effectiveReward;
        await creditFiat(tx, userId, reward, `Construction wage: ${project.label}`);
      }

      await tx.insert(constructionLaborLogTable).values({
        projectId,
        laborerId: userId,
        units,
        reward,
        wasDebtor,
        benefitingOrgId: project.owningOrgId ?? null,
        benefitingOrgName: project.owningOrgName ?? null,
      });

      // Bust the org-labor-summary cache for this org so the next panel
      // open reflects the newly inserted shift immediately.
      if (project.owningOrgId) {
        invalidateOrgLaborSummary(project.owningOrgId);
      }

      // CF audit row for debtor labor on org projects (so the CF stats
      // pipeline can attribute org-benefiting labor separately).
      if (wasDebtor && project.owningOrgId) {
        await tx.insert(cfSubmissionsTable).values({
          userId,
          kind: "construction",
          body: `${project.label} — shift worked`,
          payload: { projectId, projectLabel: project.label, orgId: project.owningOrgId, orgName: project.owningOrgName },
          payoff: reward,
          benefitingOrgId: project.owningOrgId,
          benefitingOrgName: project.owningOrgName ?? null,
        });
      }

      const completed = newApplied >= project.laborRequired;
      let buildingId: number | null = null;
      if (completed) {
        const [plot] = await tx.select().from(landPlotsTable).where(eq(landPlotsTable.id, project.plotId)).for("update").limit(1);
        if (!plot || !plot.approvedBy || (plot.status !== "building" && plot.status !== "open")) {
          throw new Error("plot integrity: refusing to create building on unapproved plot");
        }
        const [u] = await tx.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, project.ownerId)).limit(1);
        const ownerName = ((u?.email?.split("@")[0]) || "Settler").slice(0, 64);
        const [b] = await tx
          .insert(cityBuildingsTable)
          .values({
            ownerId: project.ownerId,
            ownerName,
            name: project.label.slice(0, 80),
            buildingType: project.buildingType.slice(0, 32),
            x: plot.x,
            y: plot.y,
            w: plot.w,
            h: plot.h,
            color: COLOR_BY_TYPE[project.buildingType] || "#38bdf8",
            label: project.label.slice(0, 40),
            serverId: "minx_prime",
          })
          .returning();
        buildingId = b.id;
        await tx
          .update(constructionProjectsTable)
          .set({ status: "complete", laborApplied: newApplied, progress: 100, completedAt: new Date(), updatedAt: new Date() })
          .where(eq(constructionProjectsTable.id, projectId));
        await tx
          .update(landPlotsTable)
          .set({ status: "built", buildingId: String(b.id), updatedAt: new Date() })
          .where(eq(landPlotsTable.id, project.plotId));
      } else {
        await tx
          .update(constructionProjectsTable)
          .set({ laborApplied: newApplied, progress, updatedAt: new Date() })
          .where(eq(constructionProjectsTable.id, projectId));
      }

      return {
        status: 200,
        units,
        reward,
        wasDebtor,
        progress,
        completed,
        buildingId,
        benefitingOrgId: project.owningOrgId ?? null,
        benefitingOrgName: project.owningOrgName ?? null,
      } as const;
    });
    if (out.status !== 200) {
      res.status(out.status).json({ error: out.error, retryAfterMs: (out as { retryAfterMs?: number }).retryAfterMs });
      return;
    }
    res.json({ ok: true, ...out });
  } catch (e) {
    console.error("[land] work failed", e);
    res.status(500).json({ error: "Failed to log labor" });
  }
});

export default router;
