import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  worldBuildPlansTable,
  worldBuildContributionsTable,
  playerLedgerTable,
  cfSubmissionsTable,
  type WorldBuildTask,
} from "@workspace/db";
import { eq, desc, sql, and } from "drizzle-orm";
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

/** GET /api/world-build/plans — list. Admins see all, others only 'active'. */
router.get("/world-build/plans", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const admin = isAdmin(req);
  const rows = admin
    ? await db.select().from(worldBuildPlansTable).orderBy(desc(worldBuildPlansTable.updatedAt))
    : await db.select().from(worldBuildPlansTable).where(eq(worldBuildPlansTable.status, "active")).orderBy(desc(worldBuildPlansTable.updatedAt));
  res.json({ plans: rows, isAdmin: admin });
});

/** GET /api/world-build/plans/:id — detail + recent contributors. */
router.get("/world-build/plans/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const [plan] = await db.select().from(worldBuildPlansTable).where(eq(worldBuildPlansTable.id, id)).limit(1);
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
  if (plan.status !== "active" && !isAdmin(req)) {
    res.status(403).json({ error: "Plan not available" }); return;
  }
  const contribs = await db.select().from(worldBuildContributionsTable)
    .where(eq(worldBuildContributionsTable.planId, id))
    .orderBy(desc(worldBuildContributionsTable.createdAt))
    .limit(40);
  res.json({ plan, contributions: contribs });
});

/** POST /api/world-build/plans — admin only. */
router.post("/world-build/plans", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  const b = req.body ?? {};
  const title = String(b.title ?? "").slice(0, 200).trim();
  if (!title) { res.status(400).json({ error: "Title required" }); return; }
  const slug = slugify(b.slug ? String(b.slug) : title);
  const region = ["city", "wastes", "outlands", "subterranean", "aerial"].includes(b.region) ? b.region : "city";
  const status = ["draft", "active", "completed", "archived"].includes(b.status) ? b.status : "draft";
  const tasks = sanitizeTasks(b.tasks);
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
    createdByUserId: uid(req),
    createdByName: (req.user as { email?: string; name?: string })?.name ?? (req.user as { email?: string })?.email ?? null,
  }).returning();
  res.json({ plan: created });
});

/** PATCH /api/world-build/plans/:id — admin only. */
router.patch("/world-build/plans/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
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
  const [updated] = await db.update(worldBuildPlansTable).set(patch).where(eq(worldBuildPlansTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Plan not found" }); return; }
  res.json({ plan: updated });
});

/** DELETE /api/world-build/plans/:id — admin only. */
router.delete("/world-build/plans/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
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
 * Mirrors the CF labor flow — atomic on the ledger row, writes a
 * cf_submissions audit row with kind='build' so the standard CF stats
 * pipeline picks it up, and enforces uniqueness on (planId, taskId) so
 * two inmates can't double-claim the same task.
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

    // Must be incarcerated with outstanding debt — world build is an
    // exclusive CF labor activity. Non-inmates can VIEW active plans
    // (via GET) but must not be able to claim tasks or close out plans.
    const [led] = await tx.select().from(playerLedgerTable).where(eq(playerLedgerTable.userId, userId)).for("update").limit(1);
    const incarcerated = !!led?.jailUntil && new Date(led.jailUntil).getTime() > Date.now() && (led?.debt ?? 0) > 0;
    if (!incarcerated) {
      return { ok: false as const, status: 403, error: "World build tasks can only be claimed from the Collections Facility." };
    }

    const payoff = Math.min(plan.rewardPerTask, led!.debt);

    // Mark completed, write contribution, optionally pay off debt.
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
      });
    } catch {
      // Unique constraint — race, treat as conflict.
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
    });
    return { ok: true as const, payoff, debt: newDebt, freed: newDebt === 0, allDone };
  });

  if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }
  res.json({ ok: true, payoff: result.payoff, debt: result.debt, freed: result.freed, allDone: result.allDone });
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
    planTitle: worldBuildPlansTable.title,
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
