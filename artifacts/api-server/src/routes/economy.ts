import { Router, type Request, type Response } from "express";
import { sql, inArray } from "drizzle-orm";
import { db, bankAccountsTable, usersTable } from "@workspace/db";

const router = Router();

// GET /api/economy/stats — public, lightweight world snapshot
//
// Drives the GAME → ECONOMY page (and any other "state of the world" UI we
// want to bolt on later). Cheap aggregate over bank_accounts so we can ship
// a live ledger without building a separate ETL. Names are sanitized to
// avoid leaking real emails — first name only, falling back to a masked
// handle. Bountied count is currently a stub field (always 0) so the front
// end can render the slot now and we can fill it in once the bounty system
// lands. Cached in-process for 30s so a chatty client can't hammer the DB.
type Stats = {
  totalCirculation: number;
  accountCount: number;
  userCount: number;
  richest: { name: string; total: number }[];
  poorest: { name: string; total: number }[];
  bountiedCount: number;
  asOf: number;
};

const CACHE_TTL_MS = 30_000;
let cache: Stats | null = null;

async function compute(): Promise<Stats> {
  // Per-user totals across every account they own.
  const totals = await db
    .select({
      userId: bankAccountsTable.userId,
      total: sql<number>`COALESCE(SUM(${bankAccountsTable.balance}),0)::int`,
    })
    .from(bankAccountsTable)
    .groupBy(bankAccountsTable.userId);

  const totalCirculation = totals.reduce((s, r) => s + Number(r.total || 0), 0);
  const accountCountRow = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(bankAccountsTable);
  const accountCount = Number(accountCountRow[0]?.n || 0);

  // Look up display names for the top 5 + bottom 5
  const sortedDesc = [...totals].sort((a, b) => Number(b.total) - Number(a.total));
  const topIds = sortedDesc.slice(0, 5).map(r => r.userId);
  const botIds = sortedDesc.slice(-5).reverse().map(r => r.userId);
  const wantedIds = Array.from(new Set([...topIds, ...botIds]));

  // Public endpoint — surface display names, never PII. We only use a real
  // first name if the user set one; emails are NEVER derived from (no
  // local-part fallback) so we don't leak addresses through the leaderboard.
  // Anonymous users get a stable, non-identifying salaryman handle.
  const nameMap = new Map<string, string>();
  if (wantedIds.length > 0) {
    const rows = await db
      .select({ id: usersTable.id, firstName: usersTable.firstName })
      .from(usersTable)
      .where(inArray(usersTable.id, wantedIds));
    for (const r of rows) {
      const fn = (r.firstName || "").trim();
      if (fn) nameMap.set(String(r.id), fn.slice(0, 24));
    }
  }
  const anonHandle = (userId: string) => `salaryman_${String(userId).slice(-4).padStart(4, "0")}`;
  const namedFor = (userId: string, total: number) => ({
    name: nameMap.get(userId) || anonHandle(userId),
    total: Number(total) || 0,
  });

  const richest = sortedDesc.slice(0, 5).map(r => namedFor(r.userId, r.total));
  const poorest = sortedDesc.slice(-5).reverse().map(r => namedFor(r.userId, r.total));

  return {
    totalCirculation,
    accountCount,
    userCount: totals.length,
    richest,
    poorest,
    bountiedCount: 0,
    asOf: Date.now(),
  };
}

router.get("/economy/stats", async (_req: Request, res: Response) => {
  try {
    if (cache && Date.now() - cache.asOf < CACHE_TTL_MS) {
      res.json(cache);
      return;
    }
    cache = await compute();
    res.json(cache);
  } catch (e: any) {
    console.error("[economy/stats]", e);
    res.status(500).json({ error: e?.message || "stats failed" });
  }
});

export default router;
