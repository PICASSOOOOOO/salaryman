import { Router, type Request, type Response } from "express";
import { db, playerLedgerTable, testerCompGrantsTable, TESTER_COMP_LIMIT } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { isOwnerEmail, isActiveDeveloperOrgMember, isPicassoOrgMemberEmail, PICASSO_START_FIAT } from "../lib/plan";
import { STARTER_CHECKING_BALANCE } from "./bank";

/**
 * Onboarding housing — first month's rent on the desk terminal + capsule.
 *
 * Every Salaryman gets a desk and a capsule the moment they sign in. Both
 * have rent, due immediately. The starting fiat the player walks in with is
 * what funds it. If they're short, the difference is rolled into their debt
 * ledger and the tax-collector dispatcher (`/tax-collector/check`) takes
 * care of sending Pablo's people after them.
 *
 * Idempotency + race safety:
 *   We use `player_ledger.housing_charged_at` as the sole onboarding marker.
 *   The charge runs as a single SQL upsert: INSERT ON CONFLICT DO UPDATE
 *   ... WHERE housing_charged_at IS NULL. The conditional WHERE makes the
 *   update a no-op for already-charged rows — concurrent requests collapse
 *   to exactly one charge regardless of timing, and a fully-paid (no debt)
 *   onboarding still records the marker so refresh/re-trigger never bills
 *   the player twice. We then re-read the row to report the canonical state.
 */
const router = Router();

// Office tiers — every arrival picks one. Each bundles a desk-equivalent
// workstation rent + a sleeping accommodation rent. Picks bigger, owe more.
// Tier ids are short stable strings the client posts back on /charge.
interface OfficeTier {
  id: string;
  label: string;
  deskLabel: string;
  capsuleLabel: string;
  deskRent: number;
  capsuleRent: number;
  desc: string;
}
const OFFICE_TIERS: OfficeTier[] = [
  {
    id: "capsule",
    label: "DESK + CAPSULE",
    deskLabel: "DESK TERMINAL",
    capsuleLabel: "SLEEPING CAPSULE",
    deskRent: 3_000,
    capsuleRent: 2_500,
    desc: "Floor-39 desk + capsule hotel pod. Cheapest legal address in MINX.",
  },
  {
    id: "studio",
    label: "STUDIO LOFT",
    deskLabel: "PRIVATE DESK",
    capsuleLabel: "STUDIO LOFT",
    deskRent: 4_500,
    capsuleRent: 7_500,
    desc: "Live-work studio. One room, one window, one bed. Rent eats.",
  },
  {
    id: "coworking",
    label: "COWORKING + APARTMENT",
    deskLabel: "COWORKING DESK",
    capsuleLabel: "1-BR APARTMENT",
    deskRent: 6_000,
    capsuleRent: 12_000,
    desc: "Hot desk in a shared floor + a real bedroom across town.",
  },
  {
    id: "suite",
    label: "EXECUTIVE SUITE + PENTHOUSE",
    deskLabel: "PRIVATE OFFICE",
    capsuleLabel: "PENTHOUSE",
    deskRent: 14_000,
    capsuleRent: 21_000,
    desc: "Glass-wall office, secretary, view of the wastes from up high.",
  },
];
function tierFor(id?: string | null): OfficeTier {
  return OFFICE_TIERS.find(t => t.id === id) ?? OFFICE_TIERS[0];
}

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

router.get("/onboard-housing/quote", (_req, res) => {
  res.json({
    tiers: OFFICE_TIERS.map(t => ({
      id: t.id,
      label: t.label,
      deskLabel: t.deskLabel,
      capsuleLabel: t.capsuleLabel,
      deskRent: t.deskRent,
      capsuleRent: t.capsuleRent,
      total: t.deskRent + t.capsuleRent,
      desc: t.desc,
    })),
    defaultTierId: OFFICE_TIERS[0].id,
    // The checking-account balance a new (non-staff) player starts with.
    // The client uses this to decide whether a tier puts them in debt on
    // arrival. Sourced from STARTER_CHECKING_BALANCE in bank.ts so both
    // the bank seed and the debt callout stay in sync from one constant.
    startingBalance: STARTER_CHECKING_BALANCE,
  });
});

router.post("/onboard-housing/charge", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);

  const email = (req.user as { email?: string | null } | undefined)?.email ?? null;

  // Server-side plausibility cap on the starting balance the client claims.
  // Clamp cheating but don't reject — short clients still owe rent. Picasso-org
  // members (server-side email allow-list only) bypass the cap entirely and
  // walk in with the near-bottomless starting grant that their bank seed
  // mirrors, so the onboarding ledger reports "paid in full" with no debt.
  const claimed = Math.max(0, Math.floor(Number(req.body?.startingBalance ?? 0)));
  const startingBalance = isPicassoOrgMemberEmail(email)
    ? PICASSO_START_FIAT
    : Math.min(claimed, 100_000);

  // Resolve office tier from client (default = capsule). Server holds the
  // canonical price list; client can't inflate or undercut by sending a
  // different number.
  const tier = tierFor(typeof req.body?.officeTier === "string" ? req.body.officeTier : null);

  // Comp policy:
  //   - Picasso developer-org members → ALWAYS free (staff, no cap).
  //   - Tester pool (OWNER_EMAILS env + hardcoded list) → free, but capped
  //     at TESTER_COMP_LIMIT (100). Each tester claims one slot in
  //     tester_comp_grants on first charge; subsequent charges re-use the
  //     existing row (idempotent). Once the pool is full, new tester
  //     emails fall through to the normal paid flow.
  //
  // Cap enforcement is best-effort under extreme concurrency: the count is
  // snapshotted before the conditional insert, so two racers at slot #99
  // could both succeed and overshoot by 1. Acceptable for a 100-slot pool.
  let comped = false;
  let compReason: "picasso" | "tester" | null = null;

  if (await isActiveDeveloperOrgMember(userId)) {
    comped = true;
    compReason = "picasso";
  } else if (isOwnerEmail(email)) {
    // Already-granted tester re-uses their slot. Otherwise try to claim
    // one only if the pool isn't full.
    const existing = await db
      .select({ userId: testerCompGrantsTable.userId })
      .from(testerCompGrantsTable)
      .where(eq(testerCompGrantsTable.userId, userId))
      .limit(1);
    if (existing.length > 0) {
      comped = true;
      compReason = "tester";
    } else {
      // Race-safe-ish insert: only adds a row if the pool isn't already
      // full. ON CONFLICT DO NOTHING handles the re-grant race. We compare
      // the WHERE-guarded INSERT...SELECT pattern via a CTE to keep the
      // count check + insert in one statement.
      const claim = await db.execute(sql`
        WITH cur AS (SELECT COUNT(*)::int AS n FROM tester_comp_grants)
        INSERT INTO tester_comp_grants (user_id, email)
        SELECT ${userId}, ${email}
        FROM cur
        WHERE cur.n < ${TESTER_COMP_LIMIT}
        ON CONFLICT (user_id) DO NOTHING
        RETURNING user_id
      `);
      const claimed = (claim as unknown as { rows: Array<{ user_id: string }> }).rows.length > 0;
      if (claimed) {
        comped = true;
        compReason = "tester";
      }
    }
  }

  const DESK_RENT = comped ? 0 : tier.deskRent;
  const CAPSULE_RENT = comped ? 0 : tier.capsuleRent;
  const TOTAL_RENT = DESK_RENT + CAPSULE_RENT;

  const paid = Math.min(startingBalance, TOTAL_RENT);
  const shortfall = Math.max(0, TOTAL_RENT - startingBalance);
  const remainingBalance = Math.max(0, startingBalance - TOTAL_RENT);

  // Single atomic upsert. Three cases:
  //   1. No row exists → INSERT with debt = shortfall, mark housing_charged_at.
  //   2. Row exists, never charged → UPDATE only if housing_charged_at IS NULL,
  //      adding shortfall to debt + totalDebtAccrued and stamping the marker.
  //   3. Row exists, already charged → DO UPDATE clause skipped by WHERE,
  //      so the row stays exactly as-is. No double-billing possible even
  //      under concurrent first-call requests.
  // This relies on Postgres' row-level locking behavior in ON CONFLICT — the
  // conflicting row is locked while the WHERE clause is evaluated, so two
  // racing inserts cannot both pass the `housing_charged_at IS NULL` check.
  await db
    .insert(playerLedgerTable)
    .values({
      userId,
      debt: shortfall,
      totalDebtAccrued: shortfall,
      housingChargedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: playerLedgerTable.userId,
      set: {
        debt: sql`${playerLedgerTable.debt} + ${shortfall}`,
        totalDebtAccrued: sql`${playerLedgerTable.totalDebtAccrued} + ${shortfall}`,
        housingChargedAt: sql`now()`,
      },
      setWhere: sql`${playerLedgerTable.housingChargedAt} IS NULL`,
    });

  // Re-read for the canonical truth (handles all three cases uniformly).
  const [led] = await db
    .select()
    .from(playerLedgerTable)
    .where(eq(playerLedgerTable.userId, userId))
    .limit(1);

  // If the marker was already set BEFORE this call, no money moved. We detect
  // that by checking whether the stamp is recent (within a small window).
  // It's safer to derive `alreadyCharged` from the marker's age than from any
  // heuristic on debt/credit.
  const stampAgeMs = led?.housingChargedAt
    ? Date.now() - new Date(led.housingChargedAt).getTime()
    : Number.POSITIVE_INFINITY;
  const alreadyCharged = stampAgeMs > 5_000;

  res.json({
    alreadyCharged,
    tierId: tier.id,
    tierLabel: tier.label,
    deskLabel: tier.deskLabel,
    capsuleLabel: tier.capsuleLabel,
    deskRent: DESK_RENT,
    capsuleRent: CAPSULE_RENT,
    totalRent: TOTAL_RENT,
    paid: alreadyCharged ? 0 : paid,
    remainingBalance: alreadyCharged ? startingBalance : remainingBalance,
    addedToDebt: alreadyCharged ? 0 : shortfall,
    currentDebt: led?.debt ?? 0,
    taxCollectorIncoming: (led?.debt ?? 0) > 0,
    comped,
    compReason,
  });
});

// Public capacity probe — UI can show "Free tester slots: X / 100 left"
// or hide the offer entirely once the pool is full.
router.get("/onboard-housing/tester-capacity", async (_req, res) => {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(testerCompGrantsTable);
  const used = Number(row?.count ?? 0);
  res.json({
    limit: TESTER_COMP_LIMIT,
    used,
    remaining: Math.max(0, TESTER_COMP_LIMIT - used),
    full: used >= TESTER_COMP_LIMIT,
  });
});

export default router;
