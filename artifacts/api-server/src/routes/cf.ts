import { Router, type Request, type Response } from "express";
import { db, playerLedgerTable, bankAccountsTable, cfSubmissionsTable, worldBuildPlansTable, constructionProjectsTable, serviceListingsTable, constructionLaborLogTable } from "@workspace/db";
import { eq, sql, and, isNull, isNotNull, inArray, desc } from "drizzle-orm";
function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated?.() || !req.user) { res.status(401).json({ error: "Login required" }); return false; }
  return true;
}
function uid(req: Request): string { return String((req.user as { id: string }).id); }

/**
 * Collections Facility (CF) — formerly "jail".
 *
 * Loop:
 *   1. Player accrues debt (negative balance settled into player_ledger.debt).
 *   2. Tax-collector NPC catches them OR they self-check-in.
 *   3. They WORK at one of several stations to pay it down. Passive sitting
 *      pays nothing — every payoff is gated on actual labor (ad view, bug
 *      report, feature idea, data label, sponsor click). The legacy
 *      /api/cf/work tap-once-a-minute path remains for backward compat but
 *      pays the smallest amount; clients should prefer the labor endpoints.
 *   4. When debt hits 0, /api/cf/release frees them.
 *
 * Every labor submission lands in cf_submissions so we (Picasso.ai) can
 * actually use the work product — bug reports become tickets, feature ideas
 * become roadmap candidates, data labels feed our pipelines, ads/sponsor
 * clicks become revenue. CF is how the game pays its own development.
 *
 * Org-scoped forced labor (Task #776):
 *   The default labor pool is Pablo's community projects (existing stations
 *   + admin world-build blueprints + admin construction projects). But
 *   debtors can also redirect their labor to FOR-HIRE org requests: orgs or
 *   players that have posted labor requests on their construction projects
 *   or world-build plans. /api/cf/labor-sources surfaces both pools so the
 *   client can show "Pablo community" vs "For Hire" and let the debtor pick.
 *   Completing org-directed labor still reduces the debtor's own debt by the
 *   normal payoff, but the audit trail records which org benefited.
 */
const router = Router();

const PAYOFF_PER_TICK = 1000; // ƒ — legacy passive endpoint, kept for compat

// Per-activity payoffs and cooldowns. Tuned so a fully engaged inmate can
// pay down ƒ60-100k/hour while a passive sitter pays nothing.
const ACTIVITY: Record<string, { payoff: number; cooldownMs: number; minBodyChars?: number }> = {
  ad:      { payoff: 500,  cooldownMs: 30_000 },                        // 30s ad view
  sponsor: { payoff: 300,  cooldownMs: 45_000 },                        // sponsor click-through
  label:   { payoff: 250,  cooldownMs: 15_000 },                        // micro data labeling
  bug:     { payoff: 1500, cooldownMs: 60_000, minBodyChars: 30 },      // bug report
  feature: { payoff: 1500, cooldownMs: 60_000, minBodyChars: 30 },      // feature idea
};

/** Lazy-create the per-user ledger row so callers never have to think about it. */
async function getOrCreateLedger(userId: string) {
  const rows = await db.select().from(playerLedgerTable).where(eq(playerLedgerTable.userId, userId)).limit(1);
  if (rows[0]) return rows[0];
  const [created] = await db.insert(playerLedgerTable).values({ userId }).returning();
  return created;
}

/**
 * Generic worker for the labor endpoints. Runs as a single transaction
 * with `SELECT … FOR UPDATE` on the ledger row so concurrent requests
 * cannot both pass the cooldown check or both deduct payoff. Also
 * enforces the incarceration guard — work only counts if the user is
 * actually serving (jailUntil set + debt > 0). Without this guard a
 * debtor could hit the labor endpoints from anywhere and pay down debt
 * without ever being caught, defeating the entire CF loop.
 */
async function processLabor(opts: {
  userId: string;
  kind: keyof typeof ACTIVITY;
  body?: string | null;
  payload?: unknown;
}): Promise<{ ok: true; payoff: number; debt: number; freed: boolean } | { ok: false; status: number; error: string; retryAfterMs?: number }> {
  const cfg = ACTIVITY[opts.kind];
  if (!cfg) return { ok: false, status: 400, error: "Unknown activity" };
  if (cfg.minBodyChars && (!opts.body || opts.body.trim().length < cfg.minBodyChars)) {
    return { ok: false, status: 400, error: `Submission must be at least ${cfg.minBodyChars} characters` };
  }

  await getOrCreateLedger(opts.userId);

  return await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(playerLedgerTable)
      .where(eq(playerLedgerTable.userId, opts.userId))
      .for("update")
      .limit(1);
    if (!locked) return { ok: false, status: 500, error: "Ledger missing" } as const;
    if (locked.debt <= 0) return { ok: false, status: 400, error: "No debt remaining" } as const;
    if (!locked.jailUntil) {
      return { ok: false, status: 403, error: "Not incarcerated. Tax collectors must catch you first." } as const;
    }

    const now = Date.now();
    const lastMs = locked.lastCfWorkAt ? new Date(locked.lastCfWorkAt).getTime() : 0;
    if (lastMs && now - lastMs < cfg.cooldownMs) {
      return { ok: false, status: 429, error: "Cooldown", retryAfterMs: cfg.cooldownMs - (now - lastMs) } as const;
    }

    const payoff = Math.min(cfg.payoff, locked.debt);
    const newDebt = locked.debt - payoff;

    await tx.update(playerLedgerTable).set({
      debt: newDebt,
      jailMinutesServed: locked.jailMinutesServed + 1,
      lastCfWorkAt: new Date(now),
      jailUntil: newDebt === 0 ? null : locked.jailUntil,
    }).where(eq(playerLedgerTable.userId, opts.userId));
    await tx.insert(cfSubmissionsTable).values({
      userId: opts.userId,
      kind: opts.kind,
      body: opts.body ?? null,
      payload: (opts.payload as object) ?? null,
      payoff,
    });

    return { ok: true, payoff, debt: newDebt, freed: newDebt === 0 } as const;
  });
}

router.get("/cf/state", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  const led = await getOrCreateLedger(userId);
  const now = Date.now();
  const jailUntilMs = led.jailUntil ? new Date(led.jailUntil).getTime() : 0;
  const inCf = jailUntilMs > now || (led.debt > 0 && !!led.jailUntil);
  res.json({
    debt: led.debt,
    totalDebtAccrued: led.totalDebtAccrued,
    jailUntil: led.jailUntil,
    inCf,
    jailMinutesServed: led.jailMinutesServed,
    jailVisits: led.jailVisits,
    creditScore: led.creditScore,
    payoffPerMinute: PAYOFF_PER_TICK,
    nextWorkAvailableAt: led.lastCfWorkAt
      ? new Date(new Date(led.lastCfWorkAt).getTime() + 15_000).toISOString()
      : new Date().toISOString(),
    activities: Object.fromEntries(
      Object.entries(ACTIVITY).map(([k, v]) => [k, { payoff: v.payoff, cooldownMs: v.cooldownMs, minBodyChars: v.minBodyChars ?? 0 }]),
    ),
  });
});

/**
 * GET /api/cf/labor-sources
 * Returns two labor pools for the CF UI to present to the debtor:
 *
 *   pabloCommunity — active world-build plans with no owning org = Pablo's
 *                    default work.
 *   forHire        — org/player-directed requests: org world-build plans
 *                    (openToDebtorLabor=true) + org construction projects
 *                    (openToDebtorLabor=true, in_progress) + open service
 *                    listings from the marketplace (any player or org).
 *
 * Both pools reduce the debtor's own debt; the difference is who gets credit
 * for the output. The client falls back gracefully when forHire is empty.
 *
 * Service listing integration (Task #737 / #776):
 *   Open service listings from the internal services board appear in the FOR
 *   HIRE pool. The debtor claims one via the normal /services/:id/claim path.
 *   When the poster calls /services/:id/complete, the services route checks
 *   whether the claimer is an incarcerated debtor; if so, escrow routes to
 *   debt reduction (cf_submissions kind='service_listing') rather than bank
 *   credit, so the labor benefits both the poster and the debtor's sentence.
 */
router.get("/cf/labor-sources", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  try {
    // Pablo community world-build plans (active, no owning org).
    const pabloPlans = await db
      .select({
        id: worldBuildPlansTable.id,
        title: worldBuildPlansTable.title,
        description: worldBuildPlansTable.description,
        region: worldBuildPlansTable.region,
        rewardPerTask: worldBuildPlansTable.rewardPerTask,
        tasks: worldBuildPlansTable.tasks,
        owningOrgId: worldBuildPlansTable.owningOrgId,
        owningOrgName: worldBuildPlansTable.owningOrgName,
        openToDebtorLabor: worldBuildPlansTable.openToDebtorLabor,
      })
      .from(worldBuildPlansTable)
      .where(
        and(
          eq(worldBuildPlansTable.status, "active"),
          isNull(worldBuildPlansTable.owningOrgId),
        ),
      )
      .limit(20);

    // For-hire world-build plans (active, org-owned, openToDebtorLabor=true).
    const orgPlans = await db
      .select({
        id: worldBuildPlansTable.id,
        title: worldBuildPlansTable.title,
        description: worldBuildPlansTable.description,
        region: worldBuildPlansTable.region,
        rewardPerTask: worldBuildPlansTable.rewardPerTask,
        tasks: worldBuildPlansTable.tasks,
        owningOrgId: worldBuildPlansTable.owningOrgId,
        owningOrgName: worldBuildPlansTable.owningOrgName,
        openToDebtorLabor: worldBuildPlansTable.openToDebtorLabor,
      })
      .from(worldBuildPlansTable)
      .where(
        and(
          eq(worldBuildPlansTable.status, "active"),
          isNotNull(worldBuildPlansTable.owningOrgId),
          eq(worldBuildPlansTable.openToDebtorLabor, true),
        ),
      )
      .limit(20);

    // For-hire construction projects (in_progress, org-owned, openToDebtorLabor=true).
    // Sorted by effective reward descending so highest-paying bounties surface first.
    const orgConstructionProjects = await db
      .select({
        id: constructionProjectsTable.id,
        label: constructionProjectsTable.label,
        buildingType: constructionProjectsTable.buildingType,
        laborRequired: constructionProjectsTable.laborRequired,
        laborApplied: constructionProjectsTable.laborApplied,
        progress: constructionProjectsTable.progress,
        owningOrgId: constructionProjectsTable.owningOrgId,
        owningOrgName: constructionProjectsTable.owningOrgName,
        rewardOverride: constructionProjectsTable.rewardOverride,
        // Effective reward: bounty if set (capped at 5000), else default 200.
        rewardPerShift: sql<number>`coalesce(least(${constructionProjectsTable.rewardOverride}, 5000), 200)`.as("reward_per_shift"),
      })
      .from(constructionProjectsTable)
      .where(
        and(
          eq(constructionProjectsTable.status, "in_progress"),
          isNotNull(constructionProjectsTable.owningOrgId),
          eq(constructionProjectsTable.openToDebtorLabor, true),
        ),
      )
      .orderBy(desc(sql`coalesce(least(${constructionProjectsTable.rewardOverride}, 5000), 200)`))
      .limit(20);

    // Marketplace service listings open to any claimer — player-to-player and
    // org-to-player gigs from the services board. Debtors who claim and complete
    // these have their escrow routed to debt reduction instead of bank credit
    // (handled by /services/:id/complete when claimer is incarcerated).
    const serviceListings = await db
      .select({
        id: serviceListingsTable.id,
        title: serviceListingsTable.title,
        description: serviceListingsTable.description,
        category: serviceListingsTable.category,
        payFiat: serviceListingsTable.payFiat,
        payType: serviceListingsTable.payType,
        posterName: serviceListingsTable.posterName,
        posterOrgId: serviceListingsTable.posterOrgId,
        posterOrgName: serviceListingsTable.posterOrgName,
        location: serviceListingsTable.location,
        deadline: serviceListingsTable.deadline,
        createdAt: serviceListingsTable.createdAt,
      })
      .from(serviceListingsTable)
      .where(and(
        eq(serviceListingsTable.status, "open"),
        eq(serviceListingsTable.category, "Construction"),
      ))
      .orderBy(serviceListingsTable.payFiat)
      .limit(30);

    const hasForHire =
      orgPlans.length > 0 ||
      orgConstructionProjects.length > 0 ||
      serviceListings.length > 0;

    res.json({
      pabloPlans,
      forHire: {
        worldBuildPlans: orgPlans,
        constructionProjects: orgConstructionProjects,
        serviceListings,
      },
      hasForHire,
    });
  } catch (e) {
    console.error("[cf] labor-sources failed", e);
    res.status(500).json({ error: "Failed to load labor sources" });
  }
});

/** POST /api/cf/check-in — voluntarily enter CF (self-arrest). */
router.post("/cf/check-in", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  const led = await getOrCreateLedger(userId);
  if (led.debt <= 0) { res.status(400).json({ error: "No debt to work off" }); return; }
  const farFuture = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.update(playerLedgerTable)
    .set({ jailUntil: farFuture, jailVisits: led.jailVisits + 1 })
    .where(eq(playerLedgerTable.userId, userId));
  res.json({ ok: true, jailUntil: farFuture.toISOString() });
});

/**
 * POST /api/cf/work — REMOVED. The original passive "tap once a minute"
 * payoff is gone; sitting still in CF pays nothing. Old clients calling
 * this endpoint receive HTTP 410 Gone with instructions to use one of
 * the labor-specific endpoints below.
 */
router.post("/cf/work", (_req: Request, res: Response) => {
  res.status(410).json({
    error: "Passive sitting no longer reduces debt. Use a labor endpoint: /api/cf/work-{ad,sponsor,label,bug,feature}.",
  });
});

/**
 * Labor endpoints. One per activity type. All return the same shape so
 * the client can render uniform feedback ("ƒX off your debt — Y to go").
 */
router.post("/cf/work-ad", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const adUnitId = req.body?.adUnitId ? String(req.body.adUnitId).slice(0, 64) : null;
  const r = await processLabor({ userId: uid(req), kind: "ad", payload: { adUnitId } });
  if (!r.ok) { res.status(r.status).json({ error: r.error, retryAfterMs: r.retryAfterMs }); return; }
  res.json({ ok: true, payoff: r.payoff, debt: r.debt, freed: r.freed });
});

router.post("/cf/work-sponsor", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const sponsorId = req.body?.sponsorId ? String(req.body.sponsorId).slice(0, 64) : null;
  const r = await processLabor({ userId: uid(req), kind: "sponsor", payload: { sponsorId } });
  if (!r.ok) { res.status(r.status).json({ error: r.error, retryAfterMs: r.retryAfterMs }); return; }
  res.json({ ok: true, payoff: r.payoff, debt: r.debt, freed: r.freed });
});

router.post("/cf/work-label", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const taskId = req.body?.taskId ? String(req.body.taskId).slice(0, 128) : null;
  const choice = req.body?.choice ? String(req.body.choice).slice(0, 64) : null;
  if (!taskId || !choice) { res.status(400).json({ error: "taskId and choice required" }); return; }
  const r = await processLabor({ userId: uid(req), kind: "label", payload: { taskId, choice } });
  if (!r.ok) { res.status(r.status).json({ error: r.error, retryAfterMs: r.retryAfterMs }); return; }
  res.json({ ok: true, payoff: r.payoff, debt: r.debt, freed: r.freed });
});

router.post("/cf/work-bug", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const body = req.body?.body ? String(req.body.body).slice(0, 4000) : "";
  const area = req.body?.area ? String(req.body.area).slice(0, 64) : null;
  const r = await processLabor({ userId: uid(req), kind: "bug", body, payload: { area } });
  if (!r.ok) { res.status(r.status).json({ error: r.error, retryAfterMs: r.retryAfterMs }); return; }
  res.json({ ok: true, payoff: r.payoff, debt: r.debt, freed: r.freed });
});

router.post("/cf/work-feature", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const body = req.body?.body ? String(req.body.body).slice(0, 4000) : "";
  const area = req.body?.area ? String(req.body.area).slice(0, 64) : null;
  const r = await processLabor({ userId: uid(req), kind: "feature", body, payload: { area } });
  if (!r.ok) { res.status(r.status).json({ error: r.error, retryAfterMs: r.retryAfterMs }); return; }
  res.json({ ok: true, payoff: r.payoff, debt: r.debt, freed: r.freed });
});

/**
 * GET /api/cf/labor-history
 * Returns the current player's org-directed labor history, merging two sources:
 *
 *   1. cf_submissions with benefitingOrgId set — captures ad/sponsor/label/bug/
 *      feature/build work that was explicitly redirected to an org's world-build
 *      plan or community project.
 *
 *   2. construction_labor_log rows where wasDebtor=true and benefitingOrgId set —
 *      construction shifts worked from inside CF on org-owned projects.
 *
 * Each entry carries: source, date, orgName, payoff/reward, and a human-readable
 * kind label so the UI can show "worked 1 shift on Apex Corp's warehouse — ƒ200 off".
 */
router.get("/cf/labor-history", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);

  try {
    const [cfRows, constructionRows] = await Promise.all([
      db.select({
        id: cfSubmissionsTable.id,
        kind: cfSubmissionsTable.kind,
        payoff: cfSubmissionsTable.payoff,
        benefitingOrgId: cfSubmissionsTable.benefitingOrgId,
        benefitingOrgName: cfSubmissionsTable.benefitingOrgName,
        createdAt: cfSubmissionsTable.createdAt,
      })
        .from(cfSubmissionsTable)
        .where(and(
          eq(cfSubmissionsTable.userId, userId),
          isNotNull(cfSubmissionsTable.benefitingOrgId),
        ))
        .orderBy(desc(cfSubmissionsTable.createdAt))
        .limit(100),

      db.select({
        id: constructionLaborLogTable.id,
        projectId: constructionLaborLogTable.projectId,
        reward: constructionLaborLogTable.reward,
        units: constructionLaborLogTable.units,
        benefitingOrgId: constructionLaborLogTable.benefitingOrgId,
        benefitingOrgName: constructionLaborLogTable.benefitingOrgName,
        createdAt: constructionLaborLogTable.createdAt,
      })
        .from(constructionLaborLogTable)
        .where(and(
          eq(constructionLaborLogTable.laborerId, userId),
          eq(constructionLaborLogTable.wasDebtor, true),
          isNotNull(constructionLaborLogTable.benefitingOrgId),
        ))
        .orderBy(desc(constructionLaborLogTable.createdAt))
        .limit(100),
    ]);

    type HistoryEntry = {
      id: string;
      source: 'task' | 'construction';
      kind: string;
      orgId: string;
      orgName: string;
      payoff: number;
      createdAt: Date;
    };

    const entries: HistoryEntry[] = [
      ...cfRows.map((r) => ({
        id: `task-${r.id}`,
        source: 'task' as const,
        kind: r.kind,
        orgId: r.benefitingOrgId!,
        orgName: r.benefitingOrgName ?? r.benefitingOrgId!,
        payoff: r.payoff,
        createdAt: r.createdAt,
      })),
      ...constructionRows.map((r) => ({
        id: `construction-${r.id}`,
        source: 'construction' as const,
        kind: 'construction',
        orgId: r.benefitingOrgId!,
        orgName: r.benefitingOrgName ?? r.benefitingOrgId!,
        payoff: r.reward,
        createdAt: r.createdAt,
      })),
    ];

    entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const totalPayoff = entries.reduce((s, e) => s + e.payoff, 0);

    res.json({ history: entries.slice(0, 100), totalPayoff, count: entries.length });
  } catch (e) {
    console.error("[cf] labor-history failed", e);
    res.status(500).json({ error: "Failed to load labor history" });
  }
});

/** POST /api/cf/release — clears jailUntil if debt is gone. */
router.post("/cf/release", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  const led = await getOrCreateLedger(userId);
  if (led.debt > 0) { res.status(400).json({ error: "Outstanding debt", debt: led.debt }); return; }
  await db.update(playerLedgerTable).set({ jailUntil: null }).where(eq(playerLedgerTable.userId, userId));
  res.json({ ok: true });
});

/**
 * POST /api/cf/settle-negative — internal helper exposed for the client's
 * end-of-day tick. Sums all bank balances; if the total is negative, that
 * deficit is moved into player_ledger.debt and balances clamp to 0.
 */
router.post("/cf/settle-negative", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);

  const result = await db.transaction(async (tx) => {
    const accounts = await tx.select().from(bankAccountsTable).where(eq(bankAccountsTable.userId, userId)).for("update");
    const total = accounts.reduce((s, a) => s + (a.balance || 0), 0);
    if (total >= 0) return { deficit: 0 };
    const deficit = -total;
    for (const a of accounts) {
      if (a.balance < 0) {
        await tx.update(bankAccountsTable).set({ balance: 0, updatedAt: new Date() }).where(eq(bankAccountsTable.id, a.id));
      }
    }
    await tx.insert(playerLedgerTable)
      .values({ userId, debt: deficit, totalDebtAccrued: deficit, lastNegativeAt: new Date() })
      .onConflictDoUpdate({
        target: playerLedgerTable.userId,
        set: {
          debt: sql`${playerLedgerTable.debt} + ${deficit}`,
          totalDebtAccrued: sql`${playerLedgerTable.totalDebtAccrued} + ${deficit}`,
          lastNegativeAt: new Date(),
        },
      });
    return { deficit };
  });

  res.json({ ok: true, deficit: result.deficit });
});

export default router;
