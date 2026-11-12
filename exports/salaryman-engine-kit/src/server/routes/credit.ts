import { Router, type Request, type Response } from "express";
import {
  db, playerLedgerTable, orgMembersTable, creditScoreHistoryTable,
  creditApplicationsTable, creditUsageEventsTable, organizationsTable,
  bankTransactionsTable, orgAccountTransactionsTable, orgAccountsTable,
  realEstateListingsTable,
  adminAuditLogTable,
  CREDIT_APPLICATION_PRODUCTS,
} from "@workspace/db";
import { eq, sql, and, desc, gte, count, inArray } from "drizzle-orm";
import { CREDIT_TIERS, getNextTier, getPtsNeeded, getRoadmapActions, type CreditInputs } from "@workspace/api-zod";
import { spendFiat } from "../lib/fiat-wallet";
import { creditFiat } from "../lib/fiat-wallet";
import { resolveCurrentOrgId, canDoInOrg } from "../lib/org-permissions";
import { isPicassoOrgMemberEmail, isPicassoOrgOwner } from "../lib/plan";

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

export function computeScore(
  led: {
    jailVisits: number;
    jailMinutesServed: number;
    debt: number;
    inGameDebt: number;
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
  // Bank/CF debt (payment-plan and collections facility)
  s -= Math.floor(led.debt / 5_000);
  // In-game obligations (taxDebt + bountyAmount + active loans) synced from saves
  s -= Math.floor(led.inGameDebt / 5_000);
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
  // Total debt = bank/CF debt + in-game obligations combined.
  const totalCurrentDebt = led.debt + led.inGameDebt;
  if (monthlyIncomeEstimate > 0) {
    const dti = totalCurrentDebt / monthlyIncomeEstimate;
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
      const historicalLeverage = led.totalDebtAccrued / annualIncome;  // totalDebtAccrued already accounts for in-game debt
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

const CREDIT_APR_FLOOR_BPS = 1500;
const CREDIT_MAX_FIAT = 5_000_000;

export function applicationAprBps(score: number, orgAgeDays = 0, consistencyScore = 0): number {
  const scoreDiscount = Math.max(0, score - 400) * 4;
  const ageDiscount = Math.min(500, Math.floor(Math.max(0, orgAgeDays) / 365) * 75);
  const consistencyDiscount = Math.min(300, Math.max(0, consistencyScore) * 3);
  return Math.max(CREDIT_APR_FLOOR_BPS, 3600 - scoreDiscount - ageDiscount - consistencyDiscount);
}

async function requireCreditReviewer(req: Request, res: Response): Promise<boolean> {
  if (!requireAuth(req, res)) return false;
  if (isPicassoOrgMemberEmail(req.user?.email ?? undefined) || await isPicassoOrgOwner(uid(req))) return true;
  res.status(403).json({ error: "Moderator or admin access required" });
  return false;
}

async function creditApplicationSnapshot(userId: string, requestedOrgId: number | null) {
  const ledger = await getOrCreateLedger(userId);
  const monthlyIncomeFiat = await queryMonthlyIncomeFiat(userId);
  const since = new Date(Date.now() - 90 * 86_400_000);
  const [personalUsage] = await db.select({ total: count() }).from(bankTransactionsTable)
    .where(and(eq(bankTransactionsTable.userId, userId), gte(bankTransactionsTable.createdAt, since), sql`${bankTransactionsTable.amount} <> 0`));
  const [realEstateUsage] = await db.select({ total: count() }).from(realEstateListingsTable)
    .where(and(eq(realEstateListingsTable.sellerId, userId), gte(realEstateListingsTable.createdAt, since)));
  let orgAgeDays = 0;
  let orgUsageCount = 0;
  let orgBalanceFiat = 0;
  let orgName: string | null = null;
  if (requestedOrgId) {
    const [org] = await db.select({ name: organizationsTable.name, createdAt: organizationsTable.createdAt })
      .from(organizationsTable).where(eq(organizationsTable.id, requestedOrgId)).limit(1);
    if (!org) throw new Error("Organization not found");
    orgName = org.name;
    orgAgeDays = Math.max(0, Math.floor((Date.now() - new Date(org.createdAt).getTime()) / 86_400_000));
    const [usage] = await db.select({ total: count() }).from(orgAccountTransactionsTable)
      .where(and(eq(orgAccountTransactionsTable.orgId, requestedOrgId), gte(orgAccountTransactionsTable.createdAt, since), sql`${orgAccountTransactionsTable.delta} <> 0`));
    orgUsageCount = Number(usage?.total ?? 0);
    const balances = await db.select({ balance: orgAccountsTable.balanceFiat }).from(orgAccountsTable)
      .where(eq(orgAccountsTable.orgId, requestedOrgId));
    orgBalanceFiat = balances.reduce((sum, row) => sum + Number(row.balance || 0), 0);
  }
  const personalUsageCount = Number(personalUsage?.total ?? 0);
  const realEstateActivityCount = Number(realEstateUsage?.total ?? 0);
  const consistencyScore = Math.min(100, personalUsageCount * 3 + orgUsageCount * 4 + realEstateActivityCount * 5 + Math.floor(orgAgeDays / 30));
  const orgScore = requestedOrgId
    ? Math.max(400, Math.min(800, Math.round((ledger.creditScore + Math.min(800, 500 + Math.floor(orgAgeDays / 30) * 3 + orgUsageCount * 2)) / 2)))
    : null;
  const underwritingScore = orgScore ?? ledger.creditScore;
  const aprBps = applicationAprBps(underwritingScore, orgAgeDays, consistencyScore);
  const recommendedMaxFiat = Math.max(10_000, Math.min(
    CREDIT_MAX_FIAT,
    monthlyIncomeFiat * 12 + Math.max(0, orgBalanceFiat) * 2 + consistencyScore * 2_500,
  ));
  return {
    applicantScore: ledger.creditScore, orgScore, orgAgeDays: requestedOrgId ? orgAgeDays : null,
    monthlyIncomeFiat, consistencyScore, aprBps, recommendedMaxFiat, orgName,
    eligible: ledger.creditScore >= 580 && (!requestedOrgId || orgAgeDays >= 90) && consistencyScore >= 10,
    usage: { personalEvents90d: personalUsageCount, orgEvents90d: orgUsageCount, realEstateActivity90d: realEstateActivityCount, orgBalanceFiat },
  };
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
  const FIAT_PER_USD = 100;
  const rows = await db
    .select({ salary: orgMembersTable.salary })
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")))
    .limit(1);
  return rows[0]?.salary ? Number(rows[0].salary) * FIAT_PER_USD : 0;
}

/** Current tier key for a score — derived from the shared CREDIT_TIERS constant. */
function scoreTier(score: number): string {
  return [...CREDIT_TIERS].reverse().find((t) => score >= t.min)?.key ?? "POOR";
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
  const score = led.creditScore;
  const hasIncome = (await queryMonthlyIncomeFiat(userId)) > 0;
  const creditInputs: CreditInputs = {
    jailVisits: led.jailVisits,
    jailMinutesServed: led.jailMinutesServed,
    debt: led.debt + led.inGameDebt,
    totalDebtAccrued: led.totalDebtAccrued,
    negativeBalanceDays: led.negativeBalanceDays,
  };
  res.json({
    score,
    priceMult: Number(priceMultFromScore(score).toFixed(3)),
    apr: Number((aprBps / 10_000).toFixed(4)),
    aprBps,
    tier: scoreTier(score),
    nextTier: getNextTier(score) ?? null,
    ptsNeeded: getPtsNeeded(score),
    actions: getRoadmapActions(creditInputs, score, hasIncome),
    inputs: {
      jailVisits: led.jailVisits,
      jailMinutesServed: led.jailMinutesServed,
      debt: led.debt,
      inGameDebt: led.inGameDebt,
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

router.get("/credit/applications/quote", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  const scope = String(req.query.scope ?? "individual");
  let orgId: number | null = null;
  if (scope === "organization") {
    orgId = await resolveCurrentOrgId(userId);
    if (!orgId || !(await canDoInOrg(userId, orgId, "finance.manage")).allowed) {
      res.status(403).json({ error: "Organization finance permission required" });
      return;
    }
  }
  try {
    res.json(await creditApplicationSnapshot(userId, orgId));
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : "Unable to quote credit" });
  }
});

router.get("/credit/applications", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const applications = await db.select().from(creditApplicationsTable)
    .where(eq(creditApplicationsTable.applicantUserId, uid(req)))
    .orderBy(desc(creditApplicationsTable.createdAt)).limit(50);
  res.json({ applications });
});

router.post("/credit/applications", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  const product = String(req.body?.product ?? "");
  const requestedFiat = Math.round(Number(req.body?.requestedFiat));
  const purpose = String(req.body?.purpose ?? "").trim();
  const scope = String(req.body?.scope ?? "individual");
  const termMonths = Math.max(3, Math.min(60, Math.round(Number(req.body?.termMonths) || 12)));
  if (!(CREDIT_APPLICATION_PRODUCTS as readonly string[]).includes(product)) {
    res.status(400).json({ error: "Product must be loan, credit_line, or grant" }); return;
  }
  if (!Number.isInteger(requestedFiat) || requestedFiat < 1_000 || requestedFiat > CREDIT_MAX_FIAT) {
    res.status(400).json({ error: `Requested Fiat must be between ƒ1,000 and ƒ${CREDIT_MAX_FIAT.toLocaleString()}` }); return;
  }
  if (purpose.length < 20 || purpose.length > 2_000) {
    res.status(400).json({ error: "Explain the use of funds in 20–2,000 characters" }); return;
  }
  let orgId: number | null = null;
  if (scope === "organization") {
    orgId = await resolveCurrentOrgId(userId);
    if (!orgId || !(await canDoInOrg(userId, orgId, "finance.manage")).allowed) {
      res.status(403).json({ error: "Organization finance permission required" }); return;
    }
  }
  const open = await db.select({ id: creditApplicationsTable.id }).from(creditApplicationsTable)
    .where(and(eq(creditApplicationsTable.applicantUserId, userId), eq(creditApplicationsTable.status, "pending"))).limit(1);
  if (open.length > 0) { res.status(409).json({ error: "An application is already awaiting manual review" }); return; }
  try {
    const snapshot = await creditApplicationSnapshot(userId, orgId);
    const [application] = await db.transaction(async (tx) => {
      const [created] = await tx.insert(creditApplicationsTable).values({
        applicantUserId: userId, orgId, scope, product, requestedFiat, aprBps: snapshot.aprBps,
        termMonths, purpose, applicantScore: snapshot.applicantScore, orgScore: snapshot.orgScore,
        orgAgeDays: snapshot.orgAgeDays, monthlyIncomeFiat: snapshot.monthlyIncomeFiat,
        consistencyScore: snapshot.consistencyScore, status: "pending",
      }).returning();
      await tx.insert(creditUsageEventsTable).values({
        applicationId: created.id, applicantUserId: userId, orgId, eventType: "application_submitted",
        metadata: { ...snapshot.usage, eligibleAtSubmission: snapshot.eligible, recommendedMaxFiat: snapshot.recommendedMaxFiat },
      });
      return [created];
    });
    res.status(201).json({ application, quote: snapshot, manualReviewRequired: true });
  } catch (error) {
    const pgCode = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (pgCode === "23505") {
      res.status(409).json({ error: "An application is already awaiting manual review" });
      return;
    }
    res.status(400).json({ error: error instanceof Error ? error.message : "Unable to submit application" });
  }
});

router.get("/credit/admin/applications", async (req: Request, res: Response) => {
  if (!(await requireCreditReviewer(req, res))) return;
  const status = typeof req.query.status === "string" ? req.query.status : null;
  const where = status && ["pending", "approved", "declined", "funded", "repaid", "defaulted"].includes(status)
    ? eq(creditApplicationsTable.status, status) : undefined;
  const applications = await db.select().from(creditApplicationsTable)
    .where(where).orderBy(desc(creditApplicationsTable.createdAt)).limit(250);
  const ids = applications.map((row) => row.id);
  const usage = ids.length === 0 ? [] : await db.select().from(creditUsageEventsTable)
    .where(inArray(creditUsageEventsTable.applicationId, ids)).orderBy(desc(creditUsageEventsTable.createdAt));
  res.json({
    applications: applications.map((application) => ({
      ...application,
      usage: usage.filter((event) => event.applicationId === application.id),
    })),
    policy: { manualReviewRequired: true, minimumAprBps: CREDIT_APR_FLOOR_BPS, disbursementCurrency: "FIAT" },
  });
});

router.post("/credit/admin/applications/:id/decision", async (req: Request, res: Response) => {
  if (!(await requireCreditReviewer(req, res))) return;
  const id = Number(req.params.id);
  const decision = String(req.body?.decision ?? "");
  if (!Number.isInteger(id) || !["approved", "declined"].includes(decision)) {
    res.status(400).json({ error: "Invalid application or decision" }); return;
  }
  const reviewerNotes = String(req.body?.reviewerNotes ?? "").trim().slice(0, 4_000);
  const result = await db.transaction(async (tx) => {
    const [application] = await tx.select().from(creditApplicationsTable)
      .where(eq(creditApplicationsTable.id, id)).for("update").limit(1);
    if (!application) return { error: "Application not found", status: 404 };
    if (application.status !== "pending") return { error: "Application was already reviewed", status: 409 };
    const approvedFiat = decision === "approved"
      ? Math.max(1_000, Math.min(application.requestedFiat, Math.round(Number(req.body?.approvedFiat) || application.requestedFiat)))
      : 0;
    const aprBps = decision === "approved"
      ? Math.max(CREDIT_APR_FLOOR_BPS, Math.round(Number(req.body?.aprBps) || application.aprBps))
      : application.aprBps;
    const termMonths = Math.max(3, Math.min(60, Math.round(Number(req.body?.termMonths) || application.termMonths)));
    const [updated] = await tx.update(creditApplicationsTable).set({
      status: decision, approvedFiat, aprBps, termMonths, reviewerUserId: uid(req),
      reviewerNotes, decisionAt: new Date(), updatedAt: new Date(),
    }).where(eq(creditApplicationsTable.id, id)).returning();
    await tx.insert(creditUsageEventsTable).values({
      applicationId: id, applicantUserId: application.applicantUserId, orgId: application.orgId,
      eventType: decision === "approved" ? "application_approved" : "application_declined",
      amountFiat: approvedFiat, metadata: { reviewerUserId: uid(req), aprBps, termMonths },
    });
    await tx.insert(adminAuditLogTable).values({
      adminId: uid(req), action: `credit_${decision}`, targetType: "credit_application",
      targetId: String(id), details: JSON.stringify({
        applicantUserId: application.applicantUserId, orgId: application.orgId, scope: application.scope,
        approvedFiat, aprBps, termMonths,
      }),
    });
    return { application: updated };
  });
  if ("error" in result) { res.status(result.status ?? 400).json({ error: result.error }); return; }
  res.json(result);
});

router.post("/credit/admin/applications/:id/fund", async (req: Request, res: Response) => {
  if (!(await requireCreditReviewer(req, res))) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid application" }); return; }
  const result = await db.transaction(async (tx) => {
    const [application] = await tx.select().from(creditApplicationsTable)
      .where(eq(creditApplicationsTable.id, id)).for("update").limit(1);
    if (!application) return { error: "Application not found", status: 404 };
    if (application.status === "funded") return { application, duplicate: true };
    if (application.status !== "approved" || application.approvedFiat <= 0) {
      return { error: "Application must be approved before funding", status: 409 };
    }
    if (application.scope === "organization" && !application.orgId) {
      return { error: "The organization no longer exists; funding is blocked", status: 409 };
    }
    if (application.scope === "organization") {
      const orgId = application.orgId!;
      let [checking] = await tx.select().from(orgAccountsTable)
        .where(and(eq(orgAccountsTable.orgId, orgId), eq(orgAccountsTable.type, "checking")))
        .for("update").limit(1);
      if (!checking) {
        [checking] = await tx.insert(orgAccountsTable).values({
          orgId, type: "checking", label: "Operating Checking", balanceFiat: 0,
        }).returning();
      }
      const balanceAfter = Number(checking.balanceFiat) + application.approvedFiat;
      await tx.update(orgAccountsTable).set({ balanceFiat: balanceAfter, updatedAt: new Date() })
        .where(eq(orgAccountsTable.id, checking.id));
      await tx.insert(orgAccountTransactionsTable).values({
        orgId, accountType: "checking", delta: application.approvedFiat,
        balanceAfter, description: `Banco Ombra ${application.product} funding #${application.id}`,
        category: "credit_funding", actorUserId: uid(req),
      });
    } else {
      await creditFiat(tx, {
        userId: application.applicantUserId, amountFiat: application.approvedFiat,
        kind: "credit_funding", description: `Banco Ombra ${application.product} funding #${application.id}`,
        idempotencyKey: `credit-application-${application.id}`,
      });
    }
    const [funded] = await tx.update(creditApplicationsTable).set({
      status: "funded", fundedAt: new Date(), updatedAt: new Date(),
    }).where(eq(creditApplicationsTable.id, id)).returning();
    await tx.insert(creditUsageEventsTable).values({
      applicationId: id, applicantUserId: application.applicantUserId, orgId: application.orgId,
      eventType: "fiat_disbursed", amountFiat: application.approvedFiat,
      metadata: { reviewerUserId: uid(req), currency: "FIAT", destination: application.scope === "organization" ? "org_checking" : "personal_checking" },
    });
    await tx.insert(adminAuditLogTable).values({
      adminId: uid(req), action: "credit_funded", targetType: "credit_application",
      targetId: String(id), details: JSON.stringify({
        applicantUserId: application.applicantUserId, orgId: application.orgId, scope: application.scope,
        amountFiat: application.approvedFiat, destination: application.scope === "organization" ? "org_checking" : "personal_checking",
      }),
    });
    return { application: funded, duplicate: false };
  });
  if ("error" in result) { res.status(result.status ?? 400).json({ error: result.error }); return; }
  res.json(result);
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

/** POST /api/credit/plan/pay — atomically debit the server wallet and pay one installment. */
router.post("/credit/plan/pay", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  await getOrCreateLedger(userId);
  await tickPlan(userId);
  const result = await db.transaction(async (tx) => {
    const [led] = await tx.select().from(playerLedgerTable)
      .where(eq(playerLedgerTable.userId, userId)).for("update").limit(1);
    if (!led || led.planBalance <= 0) return { ok: false as const, error: "No active payment plan", status: 400 as const };
    const amount = Math.min(led.planInstallment, led.planBalance);
    const paid = await spendFiat(tx, {
      userId, amountFiat: amount, kind: "credit_plan_payment",
      description: "Credit payment plan installment",
    });
    if (!paid.ok) return { ok: false as const, error: "Insufficient funds", status: 402 as const, required: amount, spendable: paid.spendable };
    const newBalance = led.planBalance - amount;
    const now = Date.now();
    const nextDue = Math.max(now, led.planNextDueAt ? new Date(led.planNextDueAt).getTime() : now);
    if (newBalance <= 0) {
      await tx.update(playerLedgerTable).set({
        planBalance: 0, planPrincipal: 0, planAprBps: 0, planInstallment: 0,
        planTerm: 0, planPaid: 0, planMissed: 0, planNextDueAt: null, planStartedAt: null,
      }).where(eq(playerLedgerTable.userId, userId));
      return { ok: true as const, paid: amount, balance: 0, done: true, newBalance: paid.newBalance, spendable: paid.spendable };
    }
    await tx.update(playerLedgerTable).set({
      planBalance: newBalance,
      planPaid: led.planPaid + 1,
      planMissed: 0, // caught up
      planNextDueAt: new Date(nextDue + INSTALLMENT_INTERVAL_MS),
    }).where(eq(playerLedgerTable.userId, userId));
    return { ok: true as const, paid: amount, balance: newBalance, done: false, newBalance: paid.newBalance, spendable: paid.spendable };
  });
  if (!result.ok) { res.status(result.status).json({ error: result.error, ...("required" in result ? { required: result.required } : {}), ...("spendable" in result ? { spendable: result.spendable } : {}) }); return; }
  const led = await getOrCreateLedger(userId);
  res.json({ ...result, plan: planView(led) });
});

/** POST /api/credit/plan/payoff — atomically debit the server wallet and clear the balance. */
router.post("/credit/plan/payoff", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  await getOrCreateLedger(userId);
  await tickPlan(userId);
  const result = await db.transaction(async (tx) => {
    const [led] = await tx.select().from(playerLedgerTable)
      .where(eq(playerLedgerTable.userId, userId)).for("update").limit(1);
    if (!led || led.planBalance <= 0) return { ok: false as const, error: "No active payment plan", status: 400 as const };
    const amount = led.planBalance;
    const paid = await spendFiat(tx, {
      userId, amountFiat: amount, kind: "credit_plan_payoff",
      description: "Credit payment plan payoff",
    });
    if (!paid.ok) return { ok: false as const, error: "Insufficient funds", status: 402 as const, required: amount, spendable: paid.spendable };
    await tx.update(playerLedgerTable).set({
      planBalance: 0, planPrincipal: 0, planAprBps: 0, planInstallment: 0,
      planTerm: 0, planPaid: 0, planMissed: 0, planNextDueAt: null, planStartedAt: null,
    }).where(eq(playerLedgerTable.userId, userId));
    return { ok: true as const, paid: amount, newBalance: paid.newBalance, spendable: paid.spendable };
  });
  if (!result.ok) { res.status(result.status).json({ error: result.error, ...("required" in result ? { required: result.required } : {}), ...("spendable" in result ? { spendable: result.spendable } : {}) }); return; }
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
