/**
 * Debt Collector Bounty API
 *
 * Any org admin OR any player in arrears can post a bounty on a target.
 * A player with Street Rep skill accepts the bounty and gets within 5 tiles
 * of the online target. On successful tag (proximity check server-side),
 * escrow pays the collector and the bounty is marked collected.
 *
 * Routes:
 *   GET  /bounties                — public board of active bounties
 *   POST /bounties                — post a bounty (escrow from poster's checking)
 *   POST /bounties/:id/accept     — accept (one collector at a time)
 *   POST /bounties/:id/collect    — proximity tag triggers payout
 *   POST /bounties/:id/cancel     — poster cancels; escrow returned
 */
import { Router, type Request, type Response } from "express";
import {
  db, debtBountiesTable, bankAccountsTable, bankTransactionsTable,
  playerLedgerTable, salarymanSavesTable,
} from "@workspace/db";
import { eq, and, desc, lt, lte, or, sql } from "drizzle-orm";

const router = Router();

const MIN_REWARD = 500;
const MAX_REWARD = 50_000_000;
const MAX_EXPIRY_HOURS = 7 * 24;  // 7 days
const MIN_EXPIRY_HOURS = 24;

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated?.() || !req.user) {
    res.status(401).json({ error: "Login required" });
    return null;
  }
  return String((req.user as { id: string }).id);
}

function userName(req: Request): string {
  const u = req.user as any;
  return String(u?.firstName || u?.email?.split("@")[0] || "Anonymous").slice(0, 64);
}

async function getCheckingAccount(userId: string) {
  const accounts = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.userId, userId));
  return accounts.find((a) => a.kind === "checking") ?? accounts[0] ?? null;
}

/** Check if a player has debt in arrears (player_ledger.debt > 0) */
async function hasDebtInArrears(userId: string): Promise<boolean> {
  const [ledger] = await db.select({ debt: playerLedgerTable.debt })
    .from(playerLedgerTable)
    .where(eq(playerLedgerTable.userId, userId))
    .limit(1);
  return (ledger?.debt ?? 0) > 0;
}

/** Server-side proximity check: is the collector within N tiles of the target? */
async function isWithinTiles(collectorId: string, targetId: string, maxTiles: number): Promise<boolean> {
  const [collectorSave] = await db
    .select({ data: salarymanSavesTable.data })
    .from(salarymanSavesTable)
    .where(and(eq(salarymanSavesTable.userId, collectorId), eq(salarymanSavesTable.slotIndex, 0)))
    .limit(1);
  const [targetSave] = await db
    .select({ data: salarymanSavesTable.data })
    .from(salarymanSavesTable)
    .where(and(eq(salarymanSavesTable.userId, targetId), eq(salarymanSavesTable.slotIndex, 0)))
    .limit(1);

  const cd = (collectorSave?.data ?? {}) as Record<string, unknown>;
  const td = (targetSave?.data ?? {}) as Record<string, unknown>;

  const cx = Number(cd.worldX ?? 0);
  const cy = Number(cd.worldY ?? 0);
  const tx = Number(td.worldX ?? 0);
  const ty = Number(td.worldY ?? 0);

  if (cx === 0 && cy === 0 && tx === 0 && ty === 0) return false; // unknown positions
  const dist = Math.sqrt((cx - tx) ** 2 + (cy - ty) ** 2);
  return dist <= maxTiles * 32; // 32px per tile
}

// Expire stale bounties automatically on any read
async function expireStale() {
  await db.update(debtBountiesTable)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(
      eq(debtBountiesTable.status, "active"),
      lte(debtBountiesTable.expiresAt, new Date()),
    ));
}

// GET /bounties — public board
router.get("/bounties", async (req: Request, res: Response) => {
  try {
    await expireStale();
    const { status } = req.query;
    const st = String(status || "active");
    const rows = await db
      .select()
      .from(debtBountiesTable)
      .where(eq(debtBountiesTable.status, st))
      .orderBy(desc(debtBountiesTable.rewardFiat))
      .limit(100);

    // Mask acceptedByUserId from public view (only expose name redacted)
    const safe = rows.map((r) => ({
      ...r,
      acceptedByUserId: r.acceptedByUserId ? "***" : null,
    }));
    res.json({ bounties: safe });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed" });
  }
});

// GET /bounties/on-me — bounties targeting the current user
router.get("/bounties/on-me", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    await expireStale();
    const rows = await db.select().from(debtBountiesTable)
      .where(and(eq(debtBountiesTable.targetUserId, userId), eq(debtBountiesTable.status, "active")))
      .orderBy(desc(debtBountiesTable.rewardFiat))
      .limit(20);
    // Show count + total reward; don't reveal who posted
    const result = rows.map((r) => ({
      id: r.id,
      rewardFiat: r.rewardFiat,
      description: r.description,
      expiresAt: r.expiresAt,
      isAccepted: !!r.acceptedByUserId,
    }));
    res.json({ bounties: result, count: result.length });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed" });
  }
});

// POST /bounties — post a bounty (requires debt-in-arrears OR Cartel Boss skill)
router.post("/bounties", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const {
      targetUserId, targetName, rewardFiat, description, expiryHours,
    } = req.body ?? {};

    if (!targetUserId || !targetName) {
      res.status(400).json({ error: "targetUserId and targetName required" }); return;
    }
    if (String(targetUserId) === userId) {
      res.status(400).json({ error: "cannot post a bounty on yourself" }); return;
    }

    const reward = Math.max(MIN_REWARD, Math.min(MAX_REWARD, parseInt(String(rewardFiat || 0), 10) || 0));
    if (reward < MIN_REWARD) {
      res.status(400).json({ error: `minimum bounty is ƒ${MIN_REWARD}` }); return;
    }

    const hours = Math.min(MAX_EXPIRY_HOURS, Math.max(MIN_EXPIRY_HOURS, parseInt(String(expiryHours || 24), 10) || 24));
    const expiresAt = new Date(Date.now() + hours * 3_600_000);

    // Gate: poster must have debt OR have Cartel Boss skill
    const [posterSave] = await db.select({ data: salarymanSavesTable.data })
      .from(salarymanSavesTable)
      .where(and(eq(salarymanSavesTable.userId, userId), eq(salarymanSavesTable.slotIndex, 0)))
      .limit(1);
    const saveData = (posterSave?.data ?? {}) as Record<string, unknown>;
    const skills: string[] = Array.isArray(saveData.skills) ? saveData.skills as string[] : [];
    const hasCartelBoss = skills.includes("cartel_boss");
    const inArrears = await hasDebtInArrears(userId);

    if (!hasCartelBoss && !inArrears) {
      res.status(403).json({ error: "Requires Cartel Boss skill (T3 Power) or an active debt balance" });
      return;
    }

    // Escrow reward from poster's checking
    const acct = await getCheckingAccount(userId);
    if (!acct) { res.status(404).json({ error: "No bank account" }); return; }
    if (acct.balance < reward) {
      res.status(402).json({ error: "Insufficient funds for escrow", required: reward, balance: acct.balance });
      return;
    }

    const posterName = userName(req);
    const [created] = await db.transaction(async (tx) => {
      const newBal = acct.balance - reward;
      await tx.update(bankAccountsTable)
        .set({ balance: newBal, updatedAt: new Date() })
        .where(eq(bankAccountsTable.id, acct.id));
      await tx.insert(bankTransactionsTable).values({
        userId,
        accountId: acct.id,
        kind: "bounty_escrow",
        description: `BOUNTY ESCROW: ${String(targetName).slice(0, 40)} — ${reward}ƒ reward`,
        amount: -reward,
        balanceAfter: newBal,
      });
      return tx.insert(debtBountiesTable).values({
        posterUserId: userId,
        posterName,
        targetUserId: String(targetUserId),
        targetName: String(targetName).slice(0, 64),
        rewardFiat: reward,
        escrowFiat: reward,
        description: String(description || "").slice(0, 500),
        expiresAt,
        status: "active",
      }).returning();
    });

    res.status(201).json({ bounty: created });
  } catch (e: any) {
    console.error("[bounties] POST error", e);
    res.status(500).json({ error: e?.message || "Failed to post bounty" });
  }
});

// POST /bounties/:id/accept — one collector claims the hunt
router.post("/bounties/:id/accept", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = parseInt(String(req.params.id || ""), 10);

    // Check Street Rep skill
    const [save] = await db.select({ data: salarymanSavesTable.data })
      .from(salarymanSavesTable)
      .where(and(eq(salarymanSavesTable.userId, userId), eq(salarymanSavesTable.slotIndex, 0)))
      .limit(1);
    const saveData = (save?.data ?? {}) as Record<string, unknown>;
    const skills: string[] = Array.isArray(saveData.skills) ? saveData.skills as string[] : [];
    if (!skills.includes("street_rep")) {
      res.status(403).json({ error: "Requires Street Rep skill (T1 Power) to accept bounties" });
      return;
    }

    const result = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(debtBountiesTable)
        .where(eq(debtBountiesTable.id, id)).limit(1);
      if (!row) return { status: 404, body: { error: "bounty not found" } };
      if (row.status !== "active") return { status: 409, body: { error: `bounty is ${row.status}` } };
      if (row.targetUserId === userId) return { status: 400, body: { error: "cannot hunt yourself" } };
      if (row.posterUserId === userId) return { status: 400, body: { error: "cannot hunt your own bounty" } };
      if (new Date(row.expiresAt) <= new Date()) return { status: 409, body: { error: "bounty expired" } };
      if (row.acceptedByUserId) return { status: 409, body: { error: "bounty already accepted by another hunter" } };

      const collectorName = userName(req);
      const [updated] = await tx.update(debtBountiesTable)
        .set({ acceptedByUserId: userId, acceptedByName: collectorName, acceptedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(debtBountiesTable.id, id), sql`${debtBountiesTable.acceptedByUserId} IS NULL`))
        .returning();
      if (!updated) return { status: 409, body: { error: "race: bounty just accepted by another hunter" } };
      return { status: 200, body: { ok: true } };
    });

    res.status(result.status).json(result.body);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to accept" });
  }
});

// POST /bounties/:id/collect — proximity tag; collector must be within 5 tiles
router.post("/bounties/:id/collect", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = parseInt(String(req.params.id || ""), 10);

    const [row] = await db.select().from(debtBountiesTable)
      .where(eq(debtBountiesTable.id, id)).limit(1);
    if (!row) { res.status(404).json({ error: "bounty not found" }); return; }
    if (row.status !== "active") { res.status(409).json({ error: `bounty is ${row.status}` }); return; }
    if (row.acceptedByUserId !== userId) {
      res.status(403).json({ error: "you did not accept this bounty" }); return;
    }
    if (new Date(row.expiresAt) <= new Date()) {
      res.status(409).json({ error: "bounty expired" }); return;
    }

    // Proximity check (5 tiles = 5*32px = 160px)
    const close = await isWithinTiles(userId, row.targetUserId, 5);
    if (!close) {
      res.status(400).json({ error: "Must be within 5 tiles of the target to collect" }); return;
    }

    // Pay collector and mark collected
    const result = await db.transaction(async (tx) => {
      const [updated] = await tx.update(debtBountiesTable)
        .set({ status: "collected", collectedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(debtBountiesTable.id, id), eq(debtBountiesTable.status, "active")))
        .returning();
      if (!updated) return { status: 409, body: { error: "race: bounty already settled" } };

      const collectorAcct = await getCheckingAccount(userId);
      if (collectorAcct) {
        const newBal = collectorAcct.balance + row.escrowFiat;
        await tx.update(bankAccountsTable)
          .set({ balance: newBal, updatedAt: new Date() })
          .where(eq(bankAccountsTable.id, collectorAcct.id));
        await tx.insert(bankTransactionsTable).values({
          userId,
          accountId: collectorAcct.id,
          kind: "bounty_payout",
          description: `BOUNTY COLLECTED: target ${row.targetName} — reward ƒ${row.rewardFiat}`,
          amount: row.escrowFiat,
          balanceAfter: newBal,
        });
      }
      return { status: 200, body: { ok: true, rewardFiat: row.rewardFiat } };
    });

    res.status(result.status).json(result.body);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to collect" });
  }
});

// POST /bounties/:id/cancel — poster cancels; escrow returned
router.post("/bounties/:id/cancel", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = parseInt(String(req.params.id || ""), 10);

    const result = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(debtBountiesTable)
        .where(eq(debtBountiesTable.id, id)).limit(1);
      if (!row) return { status: 404, body: { error: "not found" } };
      if (row.posterUserId !== userId) return { status: 403, body: { error: "only poster can cancel" } };
      if (row.status !== "active") return { status: 409, body: { error: `bounty is ${row.status}` } };

      const acct = await getCheckingAccount(userId);
      if (acct && row.escrowFiat > 0) {
        const newBal = acct.balance + row.escrowFiat;
        await tx.update(bankAccountsTable)
          .set({ balance: newBal, updatedAt: new Date() })
          .where(eq(bankAccountsTable.id, acct.id));
        await tx.insert(bankTransactionsTable).values({
          userId,
          accountId: acct.id,
          kind: "bounty_return",
          description: `BOUNTY CANCELLED: refund ƒ${row.escrowFiat}`,
          amount: row.escrowFiat,
          balanceAfter: newBal,
        });
      }

      const [updated] = await tx.update(debtBountiesTable)
        .set({ status: "cancelled", escrowFiat: 0, updatedAt: new Date() })
        .where(eq(debtBountiesTable.id, id))
        .returning();
      return { status: 200, body: { ok: true, bounty: updated } };
    });

    res.status(result.status).json(result.body);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to cancel" });
  }
});

export default router;
