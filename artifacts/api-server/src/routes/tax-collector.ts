import { Router, type Request, type Response } from "express";
import { db, playerLedgerTable } from "@workspace/db";
import { eq } from "drizzle-orm";
function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated?.() || !req.user) { res.status(401).json({ error: "Login required" }); return false; }
  return true;
}
function uid(req: Request): string { return String((req.user as { id: string }).id); }

/**
 * Tax-collector dispatch.
 *
 * Client polls /api/tax-collector/check every minute or so while the player
 * roams the world. We respond with `dispatch: true` only occasionally, and
 * only when the player actually owes Pablo money. Frequency:
 *
 *   - Inside the city: ~1-in-10 minute chance once debt > ƒ5000.
 *   - In the wastes:    ~1-in-30 minute chance (harder to find you).
 *   - Inside CF:        never (you're already there).
 *
 * The actual NPC sprite + dialogue is rendered client-side; this endpoint
 * just decides WHEN they show up. Random rolls happen server-side so a
 * cheating client can't simply suppress the call.
 */
const router = Router();

router.get("/tax-collector/check", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);

  const zone = String(req.query.zone || "city"); // "city" | "wastes" | "cf"
  const rows = await db.select().from(playerLedgerTable).where(eq(playerLedgerTable.userId, userId)).limit(1);
  const led = rows[0];

  if (!led || led.debt < 5_000) { res.json({ dispatch: false, debt: led?.debt ?? 0 }); return; }
  if (led.jailUntil && new Date(led.jailUntil).getTime() > Date.now()) {
    res.json({ dispatch: false, reason: "in_cf", debt: led.debt });
    return;
  }

  // Probability per call. Tuned for ~1-2 visits per real hour at high debt.
  const baseChance = zone === "wastes" ? 1 / 30 : zone === "cf" ? 0 : 1 / 10;
  // Heavier debt = slightly more aggressive collection (caps at 2x).
  const debtMult = Math.min(2, 1 + led.debt / 100_000);
  const chance = Math.min(0.9, baseChance * debtMult);

  const dispatch = Math.random() < chance;
  res.json({
    dispatch,
    debt: led.debt,
    demandMin: Math.min(led.debt, 1_000),
    demandMax: Math.min(led.debt, 10_000),
    // If they refuse to pay, the client should call /api/cf/check-in via the
    // arrest flow. (We don't auto-arrest here so the player gets a dialogue.)
  });
});

export default router;
