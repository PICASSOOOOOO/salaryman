import { Router, type Request, type Response } from "express";
import { db, playerLedgerTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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

function computeScore(led: {
  jailVisits: number;
  jailMinutesServed: number;
  debt: number;
  totalDebtAccrued: number;
  negativeBalanceDays: number;
  lastNegativeAt: Date | null;
  createdAt: Date;
}): number {
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
  return Math.max(SCORE_FLOOR, Math.min(SCORE_CEIL, s));
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

router.get("/credit/score", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  let led = await getOrCreateLedger(userId);

  // Hourly refresh — anything fresher comes from the cache to keep this hot
  // path cheap. (Hourly = once per in-game day, matching the spec.)
  const lastUpdate = led.lastScoreUpdate ? new Date(led.lastScoreUpdate).getTime() : 0;
  if (Date.now() - lastUpdate >= 3_600_000) {
    const newScore = computeScore(led);
    await db.update(playerLedgerTable)
      .set({ creditScore: newScore, lastScoreUpdate: new Date() })
      .where(eq(playerLedgerTable.userId, userId));
    led = { ...led, creditScore: newScore, lastScoreUpdate: new Date() };
  }

  res.json({
    score: led.creditScore,
    priceMult: Number(priceMultFromScore(led.creditScore).toFixed(3)),
    tier: led.creditScore >= 740 ? "EXCELLENT"
        : led.creditScore >= 670 ? "GOOD"
        : led.creditScore >= 580 ? "FAIR"
        : "POOR",
    inputs: {
      jailVisits: led.jailVisits,
      jailMinutesServed: led.jailMinutesServed,
      debt: led.debt,
      totalDebtAccrued: led.totalDebtAccrued,
      negativeBalanceDays: led.negativeBalanceDays,
    },
    nextRefresh: new Date(lastUpdate + 3_600_000).toISOString(),
  });
});

export default router;
