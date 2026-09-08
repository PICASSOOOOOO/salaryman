import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  worldBuildPlansTable,
  worldBuildContributionsTable,
  playerLedgerTable,
  cfSubmissionsTable,
  orgMembersTable,
  organizationsTable,
  usersTable,
  type WorldBuildTask,
} from "@workspace/db";
import { eq, desc, asc, sql, and, or, ilike, isNull, isNotNull, inArray } from "drizzle-orm";
import { isOwnerEmail } from "../lib/plan";

const router: IRouter = Router();

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
function isAdmin(req: Request): boolean {
  return !!req.user && isOwnerEmail(req.user.email);
}

// Resolve the org an org admin manages. Returns null if user has no manager+ role.
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

function sanitizeTasks(raw: unknown): WorldBuildTask[] {
  if (!Array.isArray(raw)) return [];
  const out: WorldBuildTask[] = [];
  const seen = new Set<string>();
  for (const r of raw.slice(0, 500)) {
    if (!r || typeof r !== "object") continue;
    const t = r as Record<string, unknown>;
    const id = String(t.id ?? "").slice(0, 64) || `t_${Math.random().toString(36).slice(2, 10)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const kind = String(t.kind ?? "building") as WorldBuildTask["kind"];
    const allowedKinds = ["building", "road", "prop", "sign", "light", "tree", "custom"];
    out.push({
      id,
      kind: allowedKinds.includes(kind) ? kind : "custom",
      x: Number.isFinite(t.x) ? Number(t.x) : 0,
      y: Number.isFinite(t.y) ? Number(t.y) : 0,
      w: Number.isFinite(t.w) ? Number(t.w) : undefined,
      h: Number.isFinite(t.h) ? Number(t.h) : undefined,
      label: String(t.label ?? "").slice(0, 120),
      notes: t.notes ? String(t.notes).slice(0, 500) : undefined,
      completed: !!t.completed,
      completedByName: t.completedByName ? String(t.completedByName).slice(0, 80) : null,
      completedAt: t.completedAt ? String(t.completedAt) : null,
    });
  }
  return out;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `plan-${Date.now().toString(36)}`;
}

/**
 * GET /api/world-build/plans — list.
 * Admins see all. Non-admin inmates see: active Pablo plans + active org plans
 * that are openToDebtorLabor. Org admins also see their own org's plans
 * regardless of status so they can manage them.
 */
router.get("/world-build/plans", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const admin = isAdmin(req);
  const userId = uid(req);

  if (admin) {
    const rows = await db.select().from(worldBuildPlansTable).orderBy(desc(worldBuildPlansTable.updatedAt));
    const planIds = rows.map((r) => r.id);
    const contribRows =
      planIds.length > 0
        ? await db
            .select({
              planId: worldBuildContributionsTable.planId,
              contributorCount: sql<number>`COUNT(DISTINCT ${worldBuildContributionsTable.userId})::int`,
            })
            .from(worldBuildContributionsTable)
            .where(inArray(worldBuildContributionsTable.planId, planIds))
            .groupBy(worldBuildContributionsTable.planId)
        : [];
    const contribMap: Record<number, number> = {};
    for (const c of contribRows) contribMap[c.planId] = c.contributorCount;
    res.json({ plans: rows.map((r) => ({ ...r, contributorCount: contribMap[r.id] ?? 0 })), isAdmin: true });
    return;
  }

  // For non-admins: surface active Pablo plans + org plans open to debtor labor.
  // Also include plans this user's org owns (any status) so org admins can see
  // their plans in the list when managing.
  const orgCtx = await resolveOrgAdminCtx(userId);

  let rows;
  if (orgCtx) {
    rows = await db.select().from(worldBuildPlansTable).where(
      or(
        // Active Pablo plans (no owning org)
        and(eq(worldBuildPlansTable.status, "active"), isNull(worldBuildPlansTable.owningOrgId)),
        // Active org plans open to all debtors
        and(eq(worldBuildPlansTable.status, "active"), eq(worldBuildPlansTable.openToDebtorLabor, true)),
        // This org's own plans (any status) for management
        eq(worldBuildPlansTable.owningOrgId, String(orgCtx.orgId)),
      )
    ).orderBy(desc(worldBuildPlansTable.updatedAt));
  } else {
    rows = await db.select().from(worldBuildPlansTable).where(
      or(
        // Active Pablo plans
        and(eq(worldBuildPlansTable.status, "active"), isNull(worldBuildPlansTable.owningOrgId)),
        // Active org-directed plans open to debtor labor
        and(
          eq(worldBuildPlansTable.status, "active"),
          eq(worldBuildPlansTable.openToDebtorLabor, true),
          isNotNull(worldBuildPlansTable.owningOrgId),
        ),
      )
    ).orderBy(desc(worldBuildPlansTable.updatedAt));
  }
  const planIds = rows.map((r) => r.id);
  const contribRows =
    planIds.length > 0
      ? await db
          .select({
            planId: worldBuildContributionsTable.planId,
            contributorCount: sql<number>`COUNT(DISTINCT ${worldBuildContributionsTable.userId})::int`,
          })
          .from(worldBuildContributionsTable)
          .where(inArray(worldBuildContributionsTable.planId, planIds))
          .groupBy(worldBuildContributionsTable.planId)
      : [];
  const contribMap: Record<number, number> = {};
  for (const c of contribRows) contribMap[c.planId] = c.contributorCount;
  res.json({ plans: rows.map((r) => ({ ...r, contributorCount: contribMap[r.id] ?? 0 })), isAdmin: false, isOrgAdmin: !!orgCtx, orgCtx });
});

/**
 * GET /api/world-build/plans/:id — detail + recent contributors.
 * Active plans visible to all; draft/archived visible to admin or owning org admin.
 */
router.get("/world-build/plans/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const [plan] = await db.select().from(worldBuildPlansTable).where(eq(worldBuildPlansTable.id, id)).limit(1);
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }

  const admin = isAdmin(req);
  if (plan.status !== "active" && !admin) {
    // Org admins can see their own plans
    const orgCtx = await resolveOrgAdminCtx(uid(req));
    if (!orgCtx || String(orgCtx.orgId) !== plan.owningOrgId) {
      res.status(403).json({ error: "Plan not available" }); return;
    }
  }
  const contribs = await db.select().from(worldBuildContributionsTable)
    .where(eq(worldBuildContributionsTable.planId, id))
    .orderBy(desc(worldBuildContributionsTable.createdAt))
    .limit(40);
  res.json({ plan, contributions: contribs });
});

/** POST /api/world-build/plans — admin OR org admin. */
router.post("/world-build/plans", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const admin = isAdmin(req);
  const userId = uid(req);

  let owningOrgId: string | null = null;
  let owningOrgName: string | null = null;

  if (!admin) {
    // Non-admins can only create org-owned plans if they're an org admin.
    const orgCtx = await resolveOrgAdminCtx(userId);
    if (!orgCtx) { res.status(403).json({ error: "Admin or org admin required" }); return; }
    owningOrgId = String(orgCtx.orgId);
    owningOrgName = orgCtx.orgName;
  }

  const b = req.body ?? {};
  const title = String(b.title ?? "").slice(0, 200).trim();
  if (!title) { res.status(400).json({ error: "Title required" }); return; }
  const slug = slugify(b.slug ? String(b.slug) : title);
  const region = ["city", "wastes", "outlands", "subterranean", "aerial"].includes(b.region) ? b.region : "city";
  // Admins default to draft; org admins default to active since they're creating
  // their own org project and want it immediately visible in CF for labor.
  const status = ["draft", "active", "completed", "archived"].includes(b.status) ? b.status : (admin ? "draft" : "active");
  const tasks = sanitizeTasks(b.tasks);
  const openToDebtorLabor = !!b.openToDebtorLabor;

  const [created] = await db.insert(worldBuildPlansTable).values({
    slug,
    title,
    description: b.description ? String(b.description).slice(0, 4000) : null,
    region,
    status,
    areaX: Number.isFinite(b.areaX) ? Number(b.areaX) : 6700,
    areaY: Number.isFinite(b.areaY) ? Number(b.areaY) : 6300,
    areaW: Number.isFinite(b.areaW) ? Number(b.areaW) : 400,
    areaH: Number.isFinite(b.areaH) ? Number(b.areaH) : 400,
    tasks: tasks,
    rewardPerTask: Number.isFinite(b.rewardPerTask) ? Math.max(100, Math.min(10_000, Number(b.rewardPerTask))) : 2500,
    createdByUserId: userId,
    createdByName: (req.user as { email?: string; name?: string })?.name ?? (req.user as { email?: string })?.email ?? null,
    owningOrgId,
    owningOrgName,
    openToDebtorLabor: owningOrgId ? openToDebtorLabor : false,
  }).returning();
  res.json({ plan: created });
});

/** PATCH /api/world-build/plans/:id — admin or owning org admin. */
router.patch("/world-build/plans/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const userId = uid(req);
  const admin = isAdmin(req);

  const [existing] = await db.select().from(worldBuildPlansTable).where(eq(worldBuildPlansTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Plan not found" }); return; }

  let canEdit = admin;
  if (!canEdit && existing.owningOrgId) {
    const orgCtx = await resolveOrgAdminCtx(userId);
    canEdit = !!orgCtx && String(orgCtx.orgId) === existing.owningOrgId;
  }
  if (!canEdit) { res.status(403).json({ error: "Admin or owning org admin required" }); return; }

  const b = req.body ?? {};
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof b.title === "string") patch.title = b.title.slice(0, 200);
  if (typeof b.description === "string") patch.description = b.description.slice(0, 4000);
  if (["city", "wastes", "outlands", "subterranean", "aerial"].includes(b.region)) patch.region = b.region;
  if (["draft", "active", "completed", "archived"].includes(b.status)) patch.status = b.status;
  if (Number.isFinite(b.areaX)) patch.areaX = Number(b.areaX);
  if (Number.isFinite(b.areaY)) patch.areaY = Number(b.areaY);
  if (Number.isFinite(b.areaW)) patch.areaW = Number(b.areaW);
  if (Number.isFinite(b.areaH)) patch.areaH = Number(b.areaH);
  if (Array.isArray(b.tasks)) patch.tasks = sanitizeTasks(b.tasks);
  if (Number.isFinite(b.rewardPerTask)) patch.rewardPerTask = Math.max(100, Math.min(10_000, Number(b.rewardPerTask)));
  // Org admins can toggle openToDebtorLabor on their own plans.
  // Admins can set it on any plan (though Pablo plans don't need it — they're
  // always in the default pool — but this allows flagging org plans too).
  if (typeof b.openToDebtorLabor === "boolean") {
    // Only org-owned plans can be flagged for debtor labor. Pablo plans are
    // always available as the default fallback so no flag needed.
    if (existing.owningOrgId || admin) patch.openToDebtorLabor = b.openToDebtorLabor;
  }

  const [updated] = await db.update(worldBuildPlansTable).set(patch).where(eq(worldBuildPlansTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Plan not found" }); return; }
  res.json({ plan: updated });
});

/** DELETE /api/world-build/plans/:id — admin or owning org admin only. */
router.delete("/world-build/plans/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const userId = uid(req);
  const admin = isAdmin(req);

  const [existing] = await db.select().from(worldBuildPlansTable).where(eq(worldBuildPlansTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Plan not found" }); return; }

  let canDelete = admin;
  if (!canDelete && existing.owningOrgId) {
    const orgCtx = await resolveOrgAdminCtx(userId);
    canDelete = !!orgCtx && String(orgCtx.orgId) === existing.owningOrgId;
  }
  if (!canDelete) { res.status(403).json({ error: "Admin or owning org admin required" }); return; }

  await db.delete(worldBuildContributionsTable).where(eq(worldBuildContributionsTable.planId, id));
  await db.delete(worldBuildPlansTable).where(eq(worldBuildPlansTable.id, id));
  res.json({ ok: true });
});

/**
 * POST /api/world-build/plans/:id/complete-task
 * Inmate completes a build task. Must be incarcerated (jailUntil set,
 * debt > 0). Pays ƒ rewardPerTask off their debt, records a contribution,
 * and marks the task completed in the plan's tasks jsonb.
 *
 * For org-owned plans: the contribution row records benefitingOrgId so
 * the audit trail shows who the inmate's labor actually advanced.
 */
router.post("/world-build/plans/:id/complete-task", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  const planId = Number(req.params.id);
  const taskId = String(req.body?.taskId ?? "").slice(0, 64);
  const userName = (req.user as { name?: string; email?: string })?.name ?? (req.user as { email?: string })?.email ?? null;
  if (!Number.isFinite(planId) || !taskId) { res.status(400).json({ error: "planId and taskId required" }); return; }

  const result = await db.transaction(async (tx) => {
    const [plan] = await tx.select().from(worldBuildPlansTable).where(eq(worldBuildPlansTable.id, planId)).for("update").limit(1);
    if (!plan) return { ok: false as const, status: 404, error: "Plan not found" };
    if (plan.status !== "active") return { ok: false as const, status: 400, error: "Plan not active" };
    const tasks = (plan.tasks as WorldBuildTask[] | null) ?? [];
    const idx = tasks.findIndex(t => t.id === taskId);
    if (idx < 0) return { ok: false as const, status: 404, error: "Task not found" };
    if (tasks[idx].completed) return { ok: false as const, status: 409, error: "Task already completed" };

    // Must be incarcerated with outstanding debt.
    const [led] = await tx.select().from(playerLedgerTable).where(eq(playerLedgerTable.userId, userId)).for("update").limit(1);
    const incarcerated = !!led?.jailUntil && new Date(led.jailUntil).getTime() > Date.now() && (led?.debt ?? 0) > 0;
    if (!incarcerated) {
      return { ok: false as const, status: 403, error: "World build tasks can only be claimed from the Collections Facility." };
    }

    const payoff = Math.min(plan.rewardPerTask, led!.debt);

    const nextTasks = tasks.slice();
    nextTasks[idx] = {
      ...nextTasks[idx],
      completed: true,
      completedByName: userName ? String(userName).slice(0, 80) : null,
      completedAt: new Date().toISOString(),
    };
    const allDone = nextTasks.every(t => t.completed);

    await tx.update(worldBuildPlansTable).set({
      tasks: nextTasks,
      status: allDone ? "completed" : plan.status,
      updatedAt: new Date(),
    }).where(eq(worldBuildPlansTable.id, planId));

    try {
      await tx.insert(worldBuildContributionsTable).values({
        planId,
        taskId,
        userId,
        userName: userName ? String(userName).slice(0, 80) : null,
        payoff,
        benefitingOrgId: plan.owningOrgId ?? null,
        benefitingOrgName: plan.owningOrgName ?? null,
      });
    } catch {
      return { ok: false as const, status: 409, error: "Task already claimed" };
    }

    const newDebt = led!.debt - payoff;
    await tx.update(playerLedgerTable).set({
      debt: newDebt,
      jailMinutesServed: led!.jailMinutesServed + 1,
      lastCfWorkAt: new Date(),
      jailUntil: newDebt === 0 ? null : led!.jailUntil,
    }).where(eq(playerLedgerTable.userId, userId));

    await tx.insert(cfSubmissionsTable).values({
      userId,
      kind: "build",
      body: `${plan.title} — ${nextTasks[idx].label}`,
      payload: { planId, taskId, planTitle: plan.title, taskLabel: nextTasks[idx].label, region: plan.region },
      payoff,
      benefitingOrgId: plan.owningOrgId ?? null,
      benefitingOrgName: plan.owningOrgName ?? null,
    });

    return { ok: true as const, payoff, debt: newDebt, freed: newDebt === 0, allDone, benefitingOrgName: plan.owningOrgName ?? null };
  });

  if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }
  res.json({ ok: true, payoff: result.payoff, debt: result.debt, freed: result.freed, allDone: result.allDone, benefitingOrgName: result.benefitingOrgName });
});

/**
 * GET /api/world-build/plans/:id/labor-summary
 * Returns aggregate debtor-labor stats for a single World-Build Plan, plus a
 * paginated per-laborer breakdown of debtor shifts (mirrors the construction
 * project labor-summary endpoint in land.ts).
 *
 * Every contribution is debtor labor (only incarcerated players can complete
 * tasks), so:
 *   - debtorShifts        = number of completed task contributions
 *   - totalDebtForgiven   = sum of payoffs applied to debt
 *   - totalDebtorLaborers = distinct inmates who contributed
 *
 * Query params:
 *   page  — 1-based page number (default 1)
 *   limit — rows per page (default 20, max 50)
 *   q     — optional case-insensitive search over @username / first name
 *   sort  — "recent" (default), "shifts", or "debt"
 *   dir   — "asc" or "desc" (default "desc")
 *
 * Allowed callers: global admin, or active manager/director/owner of the
 * plan's owning org. All others receive 403.
 */
router.get("/world-build/plans/:id/labor-summary", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const planId = Number(req.params.id);
  if (!Number.isFinite(planId)) { res.status(400).json({ error: "Bad id" }); return; }
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;
  const q = String(req.query.q ?? "").trim().slice(0, 60);
  const sort = ["recent", "shifts", "debt"].includes(String(req.query.sort))
    ? String(req.query.sort)
    : "recent";
  const dir = String(req.query.dir) === "asc" ? "asc" : "desc";

  const [plan] = await db
    .select({ owningOrgId: worldBuildPlansTable.owningOrgId })
    .from(worldBuildPlansTable)
    .where(eq(worldBuildPlansTable.id, planId))
    .limit(1);
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }

  // Authorization: global admin, or org admin of the plan's owning org.
  let allowed = isAdmin(req);
  if (!allowed && plan.owningOrgId) {
    const orgCtx = await resolveOrgAdminCtx(uid(req));
    allowed = !!orgCtx && String(orgCtx.orgId) === plan.owningOrgId;
  }
  if (!allowed) { res.status(403).json({ error: "Not authorized to view labor summary for this plan" }); return; }

  try {
    const [totals] = await db
      .select({
        debtorShifts: sql<number>`COUNT(*)::int`,
        totalDebtForgiven: sql<number>`COALESCE(SUM(${worldBuildContributionsTable.payoff}),0)::int`,
        totalDebtorLaborers: sql<number>`COUNT(DISTINCT ${worldBuildContributionsTable.userId})::int`,
      })
      .from(worldBuildContributionsTable)
      .where(eq(worldBuildContributionsTable.planId, planId));

    const totalDebtorLaborers = totals?.totalDebtorLaborers ?? 0;

    // Optional name search over @username / first name. The breakdown rows are
    // grouped per laborer, so the filter is applied in WHERE (pre-aggregation).
    const searchCond = q
      ? or(
          ilike(usersTable.username, `%${q}%`),
          ilike(usersTable.firstName, `%${q}%`),
        )
      : undefined;
    const rowWhere = searchCond
      ? and(eq(worldBuildContributionsTable.planId, planId), searchCond)
      : eq(worldBuildContributionsTable.planId, planId);

    // Count of laborers matching the search filter — drives pagination + header.
    let matchedLaborers = totalDebtorLaborers;
    if (q) {
      const [matched] = await db
        .select({ count: sql<number>`COUNT(DISTINCT ${worldBuildContributionsTable.userId})::int` })
        .from(worldBuildContributionsTable)
        .leftJoin(usersTable, eq(usersTable.id, worldBuildContributionsTable.userId))
        .where(rowWhere);
      matchedLaborers = matched?.count ?? 0;
    }
    const totalPages = Math.max(1, Math.ceil(matchedLaborers / limit));

    // Sort expression: by most recent shift (default), shift count, or debt forgiven.
    const order = (() => {
      if (sort === "shifts") return sql`COUNT(*)`;
      if (sort === "debt") return sql`COALESCE(SUM(${worldBuildContributionsTable.payoff}),0)`;
      return sql`MAX(${worldBuildContributionsTable.createdAt})`;
    })();
    const orderBy = dir === "asc" ? asc(order) : desc(order);

    // Per-laborer breakdown, aggregated, with user display info.
    const laborerRows = await db
      .select({
        laborerId: worldBuildContributionsTable.userId,
        shifts: sql<number>`COUNT(*)::int`,
        totalReward: sql<number>`COALESCE(SUM(${worldBuildContributionsTable.payoff}),0)::int`,
        lastShiftAt: sql<string>`MAX(${worldBuildContributionsTable.createdAt})::text`,
        username: usersTable.username,
        firstName: usersTable.firstName,
      })
      .from(worldBuildContributionsTable)
      .leftJoin(usersTable, eq(usersTable.id, worldBuildContributionsTable.userId))
      .where(rowWhere)
      .groupBy(
        worldBuildContributionsTable.userId,
        usersTable.username,
        usersTable.firstName,
      )
      .orderBy(orderBy, asc(worldBuildContributionsTable.userId))
      .limit(limit)
      .offset(offset);

    // Build display names: prefer @username, then first name, then anonymized ID.
    const laborers = laborerRows.map((r) => ({
      laborerId: r.laborerId,
      displayName: r.username
        ? `@${r.username}`
        : r.firstName
          ? r.firstName
          : `INMATE-${r.laborerId.slice(-6).toUpperCase()}`,
      shifts: r.shifts,
      totalReward: r.totalReward,
      lastShiftAt: r.lastShiftAt,
    }));

    res.json({
      planId,
      debtorShifts: totals?.debtorShifts ?? 0,
      totalDebtForgiven: totals?.totalDebtForgiven ?? 0,
      totalDebtorLaborers,
      matchedLaborers,
      laborers,
      page,
      totalPages,
      q,
      sort,
      dir,
    });
  } catch (e) {
    console.error("[world-build] labor-summary failed", e);
    res.status(500).json({ error: "Failed to load labor summary" });
  }
});

/** GET /api/world-build/my-contributions — inmate stats. */
router.get("/world-build/my-contributions", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  const rows = await db.select({
    id: worldBuildContributionsTable.id,
    planId: worldBuildContributionsTable.planId,
    taskId: worldBuildContributionsTable.taskId,
    payoff: worldBuildContributionsTable.payoff,
    createdAt: worldBuildContributionsTable.createdAt,
    benefitingOrgId: worldBuildContributionsTable.benefitingOrgId,
    benefitingOrgName: worldBuildContributionsTable.benefitingOrgName,
    planTitle: worldBuildPlansTable.title,
    planOwningOrgName: worldBuildPlansTable.owningOrgName,
  })
    .from(worldBuildContributionsTable)
    .leftJoin(worldBuildPlansTable, eq(worldBuildContributionsTable.planId, worldBuildPlansTable.id))
    .where(eq(worldBuildContributionsTable.userId, userId))
    .orderBy(desc(worldBuildContributionsTable.createdAt))
    .limit(100);
  const totalPayoff = rows.reduce((s, r) => s + (r.payoff ?? 0), 0);
  res.json({ contributions: rows, totalPayoff, count: rows.length });
});

export default router;
