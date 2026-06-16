import { Router, type Request, type Response } from "express";
import { db, playerLedgerTable, orgMembersTable, creditScoreHistoryTable } from "@workspace/db";
import { eq, sql, and, desc } from "drizzle-orm";

const HISTORY_KEEP = 20;

/** Insert a score snapshot and prune the oldest rows beyond HISTORY_KEEP. */
async function recordScoreSnapshot(userId: string, score: number): Promise<void> {
  await db.insert(creditScoreHistoryTable).values({ userId, score });
  const rows = await db
    .select({ id: creditScoreHistoryTable.id })
    .from(creditScoreHistoryTable)
    .where(eq(creditScoreHistoryTable.userId, userId))
    .orderBy(desc(creditScoreHistoryTable.recordedAt));
  if (rows.length > HISTORY_KEEP) {
    const toDelete = rows.slice(HISTORY_KEEP).map((r) => r.id);
    for (const id of toDelete) {
      await db.delete(creditScoreHistoryTable).where(eq(creditScoreHistoryTable.id, id));
    }
  }
}

/** Fetch the last HISTORY_KEEP snapshots for a user, oldest-first for charting. */
async function fetchScoreHistory(userId: string): Promise<{ score: number; recordedAt: string }[]> {
  const rows = await db
    .select({ score: creditScoreHistoryTable.score, recordedAt: creditScoreHistoryTable.recordedAt })
    .from(creditScoreHistoryTable)
    .where(eq(creditScoreHistoryTable.userId, userId))
    .orderBy(desc(creditScoreHistoryTable.recordedAt))
    .limit(HISTORY_KEEP);
  return rows.reverse().map((r) => ({ score: r.score, recordedAt: new Date(r.recordedAt).toISOString() }));
}
function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated?.() || !req.user) { res.status(401).json({ error: "Login required" }); return false; }
  return true;
}
function uid(req: Request): string { return String((req.user as { id: string }).id); }

/**
 * Credit-score engine — FICO-style 400 to 800.
 *
 * Score is recomputed at most once per real-world hour (= one in-game day).
 * Inputs:
 *   - jailVisits        : -25 each (heavy)
 *   - jailMinutesServed : -1 per 10 minutes (slow grind)
 *   - debt              : -1 per ƒ5,000 currently owed
 *   - totalDebtAccrued  : -1 per ƒ50,000 lifetime (chronic-deadbeat penalty)
 *   - negativeBalanceDays: -1 per day spent under water
 *   - clean weeks       : +5 every 7 in-game days (28 hours real time) since
 *                          the last negative event. Encourages staying solvent.
 *
 * The score in turn drives a price-multiplier exposed via GET /api/credit/price-mult
 * which the client can apply to housing, vending, ATM fees, etc. Lower score =
 * higher prices, just like real life.
 */
const router = Router();

const SCORE_FLOOR = 400;
const SCORE_CEIL = 800;
const SCORE_BASELINE = 680;

function computeScore(
  led: {
    jailVisits: number;
    jailMinutesServed: number;
    debt: number;
    totalDebtAccrued: number;
    negativeBalanceDays: number;
    lastNegativeAt: Date | null;
    createdAt: Date;
  },
  monthlyIncomeEstimate = 0,
): number {
  let s = SCORE_BASELINE;
  s -= led.jailVisits * 25;
  s -= Math.floor(led.jailMinutesServed / 10);
  s -= Math.floor(led.debt / 5_000);
  s -= Math.floor(led.totalDebtAccrued / 50_000);
  s -= led.negativeBalanceDays;
  // Reward solvent streaks: every 7 in-game days (= 7 real hours) since the
  // last negative event = +5. Capped at +60. New players who have never been
  // negative count from account creation, otherwise responsible newbies would
  // be scored worse than recovering deadbeats.
  const cleanFromMs = led.lastNegativeAt
    ? new Date(led.lastNegativeAt).getTime()
    : new Date((led as unknown as { createdAt: Date }).createdAt).getTime();
  const hoursClean = (Date.now() - cleanFromMs) / 3_600_000;
  s += Math.min(60, Math.floor(hoursClean / 7) * 5);

  // ── Debt-to-income ratio ─────────────────────────────────────────────────
  // High current debt relative to monthly income is a major negative signal.
  // Low DTI (debt < one month income) is a meaningful positive signal.
  if (monthlyIncomeEstimate > 0) {
    const dti = led.debt / monthlyIncomeEstimate;
    if (dti < 1) {
      s += 15; // low DTI = responsible borrower
    } else if (dti > 5) {
      s -= Math.min(80, Math.floor((dti - 5) * 8)); // >5× monthly income in debt
    }
    // Purchase-behavior proxy: lifetime debt-accrual relative to annual income.
    // Chronic borrowers who have historically accrued many times their income
    // in debt are penalised even when current balance is cleared.
    const annualIncome = monthlyIncomeEstimate * 12;
    if (led.totalDebtAccrued > 0 && annualIncome > 0) {
      const historicalLeverage = led.totalDebtAccrued / annualIncome;
      if (historicalLeverage > 2) {
        s -= Math.min(40, Math.floor((historicalLeverage - 2) * 6));
      }
    }
    // Income presence itself is a mild positive signal (proves earning capacity).
    s += 10;
  }

  return Math.max(SCORE_FLOOR, Math.min(SCORE_CEIL, s));
}

/**
 * Annual interest rate (in basis points) a player qualifies for, derived
 * from their credit score. This is what makes the payment-plan path fair:
 * good credit = cheap money, bad credit = punishing rates — exactly the
 * lever the existing price-multiplier already pulls, now applied to debt.
 *
 * Anchors:  800 -> 800bps (8%)  ·  680 -> 1800bps (18%)  ·  400 -> 3600bps (36%)
 */
function aprBpsFromScore(score: number): number {
  if (score >= 800) return 800;
  if (score <= 400) return 3600;
  if (score >= 680) {
    // 800..680 -> 800..1800 bps
    return Math.round(800 + (800 - score) * (1000 / 120));
  }
  // 680..400 -> 1800..3600 bps
  return Math.round(1800 + (680 - score) * (1800 / 280));
}

// ── Payment-plan tuning ─────────────────────────────────────────────────────
// Terms are denominated in INSTALLMENTS. 12 installments ≈ "one year" of full
// APR, so a shorter plan costs proportionally less interest (and rewards good
// credit). One in-game day (= 1 real hour, matching the credit-refresh cadence)
// passes between installments; players may always pay ahead.
const PLAN_TERMS = [4, 8, 12] as const;
const INSTALLMENT_INTERVAL_MS = 3_600_000;            // 1 in-game day
const INSTALLMENT_GRACE_MS = 3_600_000;               // one extra day before a miss counts
const PLAN_DEFAULT_AFTER_MISSED = 3;                  // misses that dissolve the plan
const PLAN_LATE_FEE_RATE = 0.05;                      // 5% of an installment per miss

/** Quote what a plan of `term` installments would cost for `principal` at `aprBps`. */
function quoteFor(principal: number, aprBps: number, term: number) {
  const totalInterest = Math.round(principal * (aprBps / 10_000) * (term / 12));
  const total = principal + totalInterest;
  const installment = Math.ceil(total / term);
  return { term, aprBps, totalInterest, total, installment };
}

/** Cheap multiplier the client can apply to FIAT prices. */
function priceMultFromScore(score: number): number {
  // 800 → 1.00x, 680 → 1.10x (baseline), 400 → 1.50x. Linear between anchors.
  if (score >= 800) return 1.0;
  if (score <= 400) return 1.5;
  if (score >= 680) {
    // 800..680 → 1.00..1.10
    return 1.0 + (800 - score) * (0.10 / 120);
  }
  // 680..400 → 1.10..1.50
  return 1.10 + (680 - score) * (0.40 / 280);
}

async function getOrCreateLedger(userId: string) {
  const rows = await db.select().from(playerLedgerTable).where(eq(playerLedgerTable.userId, userId)).limit(1);
  if (rows[0]) return rows[0];
  const [created] = await db.insert(playerLedgerTable).values({ userId }).returning();
  return created;
}

/** Fiat-equivalent monthly income from org membership salary (USD → ƒ). */
async function queryMonthlyIncomeFiat(userId: string): Promise<number> {
  const FIAT_PER_USD = 1000;
  const rows = await db
    .select({ salary: orgMembersTable.salary })
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")))
    .limit(1);
  return rows[0]?.salary ? Number(rows[0].salary) * FIAT_PER_USD : 0;
}

function scoreTier(score: number) {
  return score >= 740 ? "EXCELLENT" : score >= 670 ? "GOOD" : score >= 580 ? "FAIR" : "POOR";
}

router.get("/credit/score", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  let led = await getOrCreateLedger(userId);

  // Hourly refresh — anything fresher comes from the cache to keep this hot
  // path cheap. (Hourly = once per in-game day, matching the spec.)
  const lastUpdate = led.lastScoreUpdate ? new Date(led.lastScoreUpdate).getTime() : 0;
  if (Date.now() - lastUpdate >= 3_600_000) {
    const monthlyIncome = await queryMonthlyIncomeFiat(userId);
    const newScore = computeScore(led, monthlyIncome);
    await db.update(playerLedgerTable)
      .set({ creditScore: newScore, lastScoreUpdate: new Date() })
      .where(eq(playerLedgerTable.userId, userId));
    led = { ...led, creditScore: newScore, lastScoreUpdate: new Date() };
    recordScoreSnapshot(userId, newScore).catch(() => { /* non-blocking */ });
  }

  const [aprBps, history] = await Promise.all([
    Promise.resolve(aprBpsFromScore(led.creditScore)),
    fetchScoreHistory(userId),
  ]);
  res.json({
    score: led.creditScore,
    priceMult: Number(priceMultFromScore(led.creditScore).toFixed(3)),
    apr: Number((aprBps / 10_000).toFixed(4)),
    aprBps,
    tier: scoreTier(led.creditScore),
    inputs: {
      jailVisits: led.jailVisits,
      jailMinutesServed: led.jailMinutesServed,
      debt: led.debt,
      totalDebtAccrued: led.totalDebtAccrued,
      negativeBalanceDays: led.negativeBalanceDays,
    },
    nextRefresh: new Date(lastUpdate + 3_600_000).toISOString(),
    history,
  });
});

/**
 * POST /api/credit/score/refresh — force an immediate credit recompute,
 * bypassing the hourly rate-limit. Intended for post-purchase or
 * post-repayment flows where the player's situation has changed materially.
 */
router.post("/credit/score/refresh", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  const led = await getOrCreateLedger(userId);
  const monthlyIncome = await queryMonthlyIncomeFiat(userId);
  const newScore = computeScore(led, monthlyIncome);
  await db.update(playerLedgerTable)
    .set({ creditScore: newScore, lastScoreUpdate: new Date() })
    .where(eq(playerLedgerTable.userId, userId));
  recordScoreSnapshot(userId, newScore).catch(() => { /* non-blocking */ });
  const aprBps = aprBpsFromScore(newScore);
  res.json({
    score: newScore,
    tier: scoreTier(newScore),
    apr: Number((aprBps / 10_000).toFixed(4)),
    aprBps,
    priceMult: Number(priceMultFromScore(newScore).toFixed(3)),
  });
});

/**
 * GET /api/credit/loan/eligibility — lightweight check for loan eligibility.
 * Returns max loan amount, income status, and whether the player qualifies for
 * large loans that require proof of income (>= ƒ25,000).
 */
router.get("/credit/loan/eligibility", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  const led = await getOrCreateLedger(userId);
  const monthlyIncome = await queryMonthlyIncomeFiat(userId);
  const score = led.creditScore;
  const INCOME_REQUIRED_ABOVE = 25_000;
  const maxLoanAmount = score >= 740 ? null : score >= 670 ? 250_000 : score >= 580 ? 50_000 : 10_000;
  const hasIncome = monthlyIncome > 0;
  const eligible = hasIncome || (maxLoanAmount !== null && maxLoanAmount <= INCOME_REQUIRED_ABOVE);
  res.json({
    score,
    tier: scoreTier(score),
    hasIncome,
    monthlyIncomeEstimate: monthlyIncome,
    maxLoanAmount,
    incomeRequiredAbove: INCOME_REQUIRED_ABOVE,
    eligible,
    reason: !hasIncome && (maxLoanAmount === null || maxLoanAmount > INCOME_REQUIRED_ABOVE)
      ? `Loans above ƒ${INCOME_REQUIRED_ABOVE.toLocaleString()} require proof of income. Get employed or register a business.`
      : null,
  });
});

/**
 * Lazy overdue/default catch-up. Walks the schedule forward for every fully
 * elapsed (interval + grace) window the player skipped, charging a late fee
 * and counting a miss each time. After PLAN_DEFAULT_AFTER_MISSED misses the
 * plan DEFAULTS: the remaining balance flows back into `debt` (the collector
 * resumes) and the plan is cleared. Runs in a locking transaction so it is
 * safe to call from every plan endpoint.
 */
async function tickPlan(userId: string) {
  return await db.transaction(async (tx) => {
    const [led] = await tx.select().from(playerLedgerTable)
      .where(eq(playerLedgerTable.userId, userId)).for("update").limit(1);
    if (!led || led.planBalance <= 0 || !led.planNextDueAt) return led ?? null;

    let balance = led.planBalance;
    let missed = led.planMissed;
    let nextDue = new Date(led.planNextDueAt).getTime();
    const now = Date.now();
    let changed = false;

    while (balance > 0 && missed < PLAN_DEFAULT_AFTER_MISSED && now > nextDue + INSTALLMENT_GRACE_MS) {
      missed += 1;
      balance += Math.round(led.planInstallment * PLAN_LATE_FEE_RATE);
      nextDue += INSTALLMENT_INTERVAL_MS;
      changed = true;
    }

    if (missed >= PLAN_DEFAULT_AFTER_MISSED && balance > 0) {
      await tx.update(playerLedgerTable).set({
        debt: sql`${playerLedgerTable.debt} + ${balance}`,
        totalDebtAccrued: sql`${playerLedgerTable.totalDebtAccrued} + ${balance}`,
        lastNegativeAt: new Date(),
        planBalance: 0, planPrincipal: 0, planAprBps: 0, planInstallment: 0,
        planTerm: 0, planPaid: 0, planMissed: 0, planNextDueAt: null, planStartedAt: null,
      }).where(eq(playerLedgerTable.userId, userId));
      return { ...led, planBalance: 0, defaulted: true, defaultedAmount: balance } as typeof led & { defaulted: boolean; defaultedAmount: number };
    }

    if (changed) {
      await tx.update(playerLedgerTable).set({
        planBalance: balance, planMissed: missed, planNextDueAt: new Date(nextDue),
      }).where(eq(playerLedgerTable.userId, userId));
      return { ...led, planBalance: balance, planMissed: missed, planNextDueAt: new Date(nextDue) };
    }
    return led;
  });
}

type LedgerRow = Awaited<ReturnType<typeof getOrCreateLedger>>;

/** Serialize the active-plan view the client renders. */
function planView(led: LedgerRow) {
  if (!led || led.planBalance <= 0) return null;
  const now = Date.now();
  const nextDueMs = led.planNextDueAt ? new Date(led.planNextDueAt).getTime() : now;
  return {
    active: true,
    balance: led.planBalance,
    principal: led.planPrincipal,
    aprBps: led.planAprBps,
    apr: Number((led.planAprBps / 10_000).toFixed(4)),
    installment: led.planInstallment,
    term: led.planTerm,
    paid: led.planPaid,
    missed: led.planMissed,
    nextDueAt: led.planNextDueAt,
    overdue: now > nextDueMs,
    defaultsAfter: PLAN_DEFAULT_AFTER_MISSED,
    lateFeeRate: PLAN_LATE_FEE_RATE,
  };
}

/**
 * GET /api/credit/plan — current plan, or (if none) the debt + quotes the
 * player could enroll in at their current credit score.
 */
router.get("/credit/plan", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  await getOrCreateLedger(userId);
  await tickPlan(userId);
  const led = await getOrCreateLedger(userId);
  const view = planView(led);
  if (view) { res.json(view); return; }
  const aprBps = aprBpsFromScore(led.creditScore);
  res.json({
    active: false,
    debt: led.debt,
    score: led.creditScore,
    aprBps,
    apr: Number((aprBps / 10_000).toFixed(4)),
    quotes: led.debt > 0 ? PLAN_TERMS.map((t) => quoteFor(led.debt, aprBps, t)) : [],
  });
});

/** POST /api/credit/plan/enroll { term } — restructure current debt into installments. */
router.post("/credit/plan/enroll", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  const term = Number(req.body?.term);
  if (!PLAN_TERMS.includes(term as (typeof PLAN_TERMS)[number])) {
    res.status(400).json({ error: `term must be one of ${PLAN_TERMS.join(", ")}` }); return;
  }
  await getOrCreateLedger(userId);
  const result = await db.transaction(async (tx) => {
    const [led] = await tx.select().from(playerLedgerTable)
      .where(eq(playerLedgerTable.userId, userId)).for("update").limit(1);
    if (!led) return { ok: false as const, error: "Ledger missing", status: 500 as const };
    if (led.planBalance > 0) return { ok: false as const, error: "A payment plan is already active", status: 400 as const };
    if (led.debt <= 0) return { ok: false as const, error: "No debt to restructure", status: 400 as const };
    const aprBps = aprBpsFromScore(led.creditScore);
    const q = quoteFor(led.debt, aprBps, term);
    const now = Date.now();
    await tx.update(playerLedgerTable).set({
      debt: 0,
      jailUntil: null, // bank path chosen — collector stands down
      planBalance: q.total,
      planPrincipal: led.debt,
      planAprBps: aprBps,
      planInstallment: q.installment,
      planTerm: term,
      planPaid: 0,
      planMissed: 0,
      planNextDueAt: new Date(now + INSTALLMENT_INTERVAL_MS),
      planStartedAt: new Date(now),
    }).where(eq(playerLedgerTable.userId, userId));
    return { ok: true as const };
  });
  if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }
  const led = await getOrCreateLedger(userId);
  res.json({ ok: true, plan: planView(led) });
});

/** POST /api/credit/plan/pay — pay ONE installment. Client deducts the returned amount from its wallet. */
router.post("/credit/plan/pay", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  // Wallet is client-authoritative; the client reports its available FIAT so we
  // can reject when a late-fee bump (applied by tickPlan below) makes the live
  // amount exceed what the client checked against. Omitted wallet = no check.
  const wallet = Number(req.body?.wallet);
  await getOrCreateLedger(userId);
  await tickPlan(userId);
  const result = await db.transaction(async (tx) => {
    const [led] = await tx.select().from(playerLedgerTable)
      .where(eq(playerLedgerTable.userId, userId)).for("update").limit(1);
    if (!led || led.planBalance <= 0) return { ok: false as const, error: "No active payment plan", status: 400 as const };
    const amount = Math.min(led.planInstallment, led.planBalance);
    if (Number.isFinite(wallet) && wallet < amount) return { ok: false as const, error: "Insufficient funds", status: 402 as const, required: amount };
    const newBalance = led.planBalance - amount;
    const now = Date.now();
    const nextDue = Math.max(now, led.planNextDueAt ? new Date(led.planNextDueAt).getTime() : now);
    if (newBalance <= 0) {
      await tx.update(playerLedgerTable).set({
        planBalance: 0, planPrincipal: 0, planAprBps: 0, planInstallment: 0,
        planTerm: 0, planPaid: 0, planMissed: 0, planNextDueAt: null, planStartedAt: null,
      }).where(eq(playerLedgerTable.userId, userId));
      return { ok: true as const, paid: amount, balance: 0, done: true };
    }
    await tx.update(playerLedgerTable).set({
      planBalance: newBalance,
      planPaid: led.planPaid + 1,
      planMissed: 0, // caught up
      planNextDueAt: new Date(nextDue + INSTALLMENT_INTERVAL_MS),
    }).where(eq(playerLedgerTable.userId, userId));
    return { ok: true as const, paid: amount, balance: newBalance, done: false };
  });
  if (!result.ok) { res.status(result.status).json({ error: result.error, ...("required" in result ? { required: result.required } : {}) }); return; }
  const led = await getOrCreateLedger(userId);
  res.json({ ...result, plan: planView(led) });
});

/** POST /api/credit/plan/payoff — clear the whole remaining balance at once. */
router.post("/credit/plan/payoff", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  const wallet = Number(req.body?.wallet);
  await getOrCreateLedger(userId);
  await tickPlan(userId);
  const result = await db.transaction(async (tx) => {
    const [led] = await tx.select().from(playerLedgerTable)
      .where(eq(playerLedgerTable.userId, userId)).for("update").limit(1);
    if (!led || led.planBalance <= 0) return { ok: false as const, error: "No active payment plan", status: 400 as const };
    const amount = led.planBalance;
    if (Number.isFinite(wallet) && wallet < amount) return { ok: false as const, error: "Insufficient funds", status: 402 as const, required: amount };
    await tx.update(playerLedgerTable).set({
      planBalance: 0, planPrincipal: 0, planAprBps: 0, planInstallment: 0,
      planTerm: 0, planPaid: 0, planMissed: 0, planNextDueAt: null, planStartedAt: null,
    }).where(eq(playerLedgerTable.userId, userId));
    return { ok: true as const, paid: amount };
  });
  if (!result.ok) { res.status(result.status).json({ error: result.error, ...("required" in result ? { required: result.required } : {}) }); return; }
  res.json({ ...result, plan: null });
});

/** POST /api/credit/plan/tick — apply overdue/default catch-up (client end-of-day / bank-open hook). */
router.post("/credit/plan/tick", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  await getOrCreateLedger(userId);
  const ticked = await tickPlan(userId) as (LedgerRow & { defaulted?: boolean; defaultedAmount?: number });
  const led = await getOrCreateLedger(userId);
  res.json({
    plan: planView(led),
    defaulted: Boolean(ticked && (ticked as { defaulted?: boolean }).defaulted),
    defaultedAmount: (ticked as { defaultedAmount?: number })?.defaultedAmount ?? 0,
    debt: led.debt,
  });
});

/** POST /api/credit/plan/cancel — abandon the plan; remaining balance reverts to debt (collector resumes). */
router.post("/credit/plan/cancel", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  await getOrCreateLedger(userId);
  const result = await db.transaction(async (tx) => {
    const [led] = await tx.select().from(playerLedgerTable)
      .where(eq(playerLedgerTable.userId, userId)).for("update").limit(1);
    if (!led || led.planBalance <= 0) return { ok: false as const, error: "No active payment plan", status: 400 as const };
    const reverted = led.planBalance;
    await tx.update(playerLedgerTable).set({
      debt: sql`${playerLedgerTable.debt} + ${reverted}`,
      totalDebtAccrued: sql`${playerLedgerTable.totalDebtAccrued} + ${reverted}`,
      lastNegativeAt: new Date(),
      planBalance: 0, planPrincipal: 0, planAprBps: 0, planInstallment: 0,
      planTerm: 0, planPaid: 0, planMissed: 0, planNextDueAt: null, planStartedAt: null,
    }).where(eq(playerLedgerTable.userId, userId));
    return { ok: true as const, revertedToDebt: reverted };
  });
  if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }
  res.json(result);
});

export default router;
