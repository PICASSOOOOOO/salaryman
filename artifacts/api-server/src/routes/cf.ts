import { Router, type Request, type Response } from "express";
import { db, playerLedgerTable, bankAccountsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
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
 *   3. They sit in CF and tap "WORK" once per minute → ƒ1000 off debt.
 *   4. When debt hits 0, /api/cf/release frees them.
 *
 * The ƒ1000/min payoff is server-validated by lastCfWorkAt timestamp so the
 * client cannot spam the endpoint. Sentence length is uncapped — you stay
 * until the debt is gone (or you pay real money via the upgrade flow).
 */
const router = Router();

const PAYOFF_PER_TICK = 1000; // ƒ
const MIN_TICK_MS = 55_000; // accept slightly under 60s to tolerate jitter

/** Lazy-create the per-user ledger row so callers never have to think about it. */
async function getOrCreateLedger(userId: string) {
  const rows = await db.select().from(playerLedgerTable).where(eq(playerLedgerTable.userId, userId)).limit(1);
  if (rows[0]) return rows[0];
  const [created] = await db.insert(playerLedgerTable).values({ userId }).returning();
  return created;
}

router.get("/cf/state", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  const led = await getOrCreateLedger(userId);
  const now = Date.now();
  const jailUntilMs = led.jailUntil ? new Date(led.jailUntil).getTime() : 0;
  const inCf = jailUntilMs > now || led.debt > 0; // debt > 0 means CF is mandatory if caught
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
      ? new Date(new Date(led.lastCfWorkAt).getTime() + MIN_TICK_MS).toISOString()
      : new Date().toISOString(),
  });
});

/** POST /api/cf/check-in — voluntarily enter CF (self-arrest). */
router.post("/cf/check-in", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  const led = await getOrCreateLedger(userId);
  if (led.debt <= 0) { res.status(400).json({ error: "No debt to work off" }); return; }
  // Sentence is open-ended — set a far-future jailUntil that the release
  // endpoint clears once debt hits zero.
  const farFuture = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 real days
  await db.update(playerLedgerTable)
    .set({ jailUntil: farFuture, jailVisits: led.jailVisits + 1 })
    .where(eq(playerLedgerTable.userId, userId));
  res.json({ ok: true, jailUntil: farFuture.toISOString() });
});

/**
 * POST /api/cf/work — the workhorse. Called by the client roughly every
 * minute. Server enforces the cooldown; debt drops by ƒ1000.
 *
 * Returns updated debt + cooldown so the UI can show a countdown.
 */
router.post("/cf/work", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  const led = await getOrCreateLedger(userId);
  if (led.debt <= 0) { res.status(400).json({ error: "No debt remaining" }); return; }

  const now = Date.now();
  const lastMs = led.lastCfWorkAt ? new Date(led.lastCfWorkAt).getTime() : 0;
  if (lastMs && now - lastMs < MIN_TICK_MS) {
    res.status(429).json({ error: "Cooldown", retryAfterMs: MIN_TICK_MS - (now - lastMs) });
    return;
  }

  const payoff = Math.min(PAYOFF_PER_TICK, led.debt);
  const newDebt = led.debt - payoff;
  await db.update(playerLedgerTable).set({
    debt: newDebt,
    jailMinutesServed: led.jailMinutesServed + 1,
    lastCfWorkAt: new Date(now),
    // Auto-release on the same tick if this paid them off — saves a roundtrip.
    jailUntil: newDebt === 0 ? null : led.jailUntil,
  }).where(eq(playerLedgerTable.userId, userId));

  res.json({ ok: true, payoff, debt: newDebt, freed: newDebt === 0 });
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
 *
 * This is the bridge between the bank system (which allows negatives during
 * a session) and the persistent debt ledger (which is always positive).
 */
router.post("/cf/settle-negative", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);

  // Read + mutate inside a single transaction so a concurrent transfer
  // can't slip in between the balance scan and the clamp.
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
