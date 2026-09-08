import { Router, type Request, type Response } from "express";
import {
  db,
  pabloTaxLineItemsTable,
  pabloTaxInvoicesTable,
  playerLedgerTable,
  bankAccountsTable,
  usersTable,
  playerProfilesTable,
  orgMembersTable,
  organizationsTable,
  balanceSheetTxTable,
  agentProjectsTable,
  pabloMemoriesTable,
  salarymanSavesTable,
  worldBusinessesTable,
  playerNetWorthSnapshotsTable,
  playerGoldAccountsTable,
} from "@workspace/db";
import { eq, desc, and, inArray, sql, gte } from "drizzle-orm";
import { getPabloTaxSnapshot, FIAT_PER_USD, GOLD_OZ_PER_USD } from "../lib/pablo-tax";
import { ensureFiatAccounts } from "../lib/fiat-wallet";

type SaveBlob = Record<string, unknown>;
const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);

function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated?.() || !req.user) { res.status(401).json({ error: "Login required" }); return false; }
  return true;
}
function uid(req: Request): string { return String((req.user as { id: string }).id); }

const router = Router();

/**
 * GET /api/wallet/snapshot — everything the nav/wallet page needs in one
 * round-trip: bank balance breakdown (earned vs quarantined), gold,
 * Pablo Tax meter, Prime status, recent line items, pending invoices.
 *
 * Currency display is rendered client-side from the canonical $1 = ƒ100
 * = 0.005oz gold conversions so this endpoint can stay rate-free.
 */
router.get("/wallet/snapshot", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  // Snapshot is also a first-touch wallet read. This is important for the
  // lobby: a new player must see the same seeded/admin balance before opening
  // Banco Ombra or entering the city.
  await db.transaction((tx) => ensureFiatAccounts(tx, userId));

  const [
    accounts,
    ledger,
    taxSnap,
    recentLineItems,
    pendingInvoices,
    userRows,
    memberships,
    projectRows,
    memoryRows,
    latestSaves,
    goldAccounts,
    netWorthRows,
  ] = await Promise.all([
    db.select().from(bankAccountsTable).where(eq(bankAccountsTable.userId, userId)),
    db.select().from(playerLedgerTable).where(eq(playerLedgerTable.userId, userId)).limit(1),
    getPabloTaxSnapshot(userId),
    db.select().from(pabloTaxLineItemsTable)
      .where(eq(pabloTaxLineItemsTable.userId, userId))
      .orderBy(desc(pabloTaxLineItemsTable.createdAt))
      .limit(20),
    db.select().from(pabloTaxInvoicesTable)
      .where(and(eq(pabloTaxInvoicesTable.userId, userId), eq(pabloTaxInvoicesTable.status, "pending")))
      .orderBy(desc(pabloTaxInvoicesTable.createdAt))
      .limit(10),
    db.select({
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
      profileImageUrl: usersTable.profileImageUrl,
      activeProfileId: usersTable.activeProfileId,
      createdAt: usersTable.createdAt,
    }).from(usersTable).where(eq(usersTable.id, userId)).limit(1),
    db.select({
      orgId: orgMembersTable.orgId,
      role: orgMembersTable.role,
      title: orgMembersTable.title,
      salary: orgMembersTable.salary,
    }).from(orgMembersTable)
      .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active"))),
    db.select().from(agentProjectsTable)
      .where(eq(agentProjectsTable.userId, userId))
      .orderBy(desc(agentProjectsTable.updatedAt))
      .limit(12),
    db.select().from(pabloMemoriesTable)
      .where(eq(pabloMemoriesTable.userId, userId))
      .orderBy(sql`${pabloMemoriesTable.weight} DESC`, desc(pabloMemoriesTable.createdAt))
      .limit(8),
    db.select({ data: salarymanSavesTable.data, updatedAt: salarymanSavesTable.lastSavedAt, slotIndex: salarymanSavesTable.slotIndex })
      .from(salarymanSavesTable)
      .where(eq(salarymanSavesTable.userId, userId))
      .orderBy(desc(salarymanSavesTable.lastSavedAt))
      .limit(1),
    db.select().from(playerGoldAccountsTable).where(eq(playerGoldAccountsTable.userId, userId)),
    db.select({
      // Net worth = income − outgoing (payroll/bill/expense). Mirrors the
      // canonical ledger semantics in enterprise.ts (income types are credits,
      // everything else is a debit). balance_sheet_transactions.type is one of
      // 'income' | 'payroll' | 'bill' | 'expense'.
      total: sql<string>`COALESCE(SUM(CASE WHEN ${balanceSheetTxTable.type} = 'income' THEN ${balanceSheetTxTable.amount} ELSE -${balanceSheetTxTable.amount} END), 0)`,
    }).from(balanceSheetTxTable).where(eq(balanceSheetTxTable.userId, userId)),
  ]);

  const led = ledger[0];
  const fiatTotal = accounts.filter((a) => a.currency === "FIAT").reduce((s, a) => s + (a.balance || 0), 0);
  const activeUsd = accounts.filter((a) => a.currency === "USD").reduce((s, a) => s + (a.balance || 0), 0);
  const quarantineFiat = led?.quarantineFiat ?? 0;
  const earnedFiat = Math.max(0, fiatTotal - quarantineFiat);

  // ---- Identity (active profile + auth account) ------------------------
  const user = userRows[0];
  let activeProfile: { playerName: string; avatarColor: string; createdAt: Date } | null = null;
  if (user?.activeProfileId) {
    const [p] = await db.select({
      playerName: playerProfilesTable.playerName,
      avatarColor: playerProfilesTable.avatarColor,
      createdAt: playerProfilesTable.createdAt,
    }).from(playerProfilesTable).where(eq(playerProfilesTable.id, user.activeProfileId)).limit(1);
    activeProfile = p ?? null;
  }
  if (!activeProfile) {
    const [p] = await db.select({
      playerName: playerProfilesTable.playerName,
      avatarColor: playerProfilesTable.avatarColor,
      createdAt: playerProfilesTable.createdAt,
    }).from(playerProfilesTable).where(eq(playerProfilesTable.userId, userId)).orderBy(playerProfilesTable.createdAt).limit(1);
    activeProfile = p ?? null;
  }
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  const playerName = activeProfile?.playerName || fullName || "AGENT";

  // ---- Faction (orgs / employment) ------------------------------------
  const orgIds = memberships.map((m) => m.orgId);
  const orgs = orgIds.length
    ? await db.select({ id: organizationsTable.id, name: organizationsTable.name, industry: organizationsTable.industry })
        .from(organizationsTable).where(inArray(organizationsTable.id, orgIds))
    : [];
  const orgMap = new Map(orgs.map((o) => [o.id, o]));
  let totalSalary = 0;
  const companies = memberships.map((m) => {
    const sal = m.salary ? Number(m.salary) : 0;
    totalSalary += sal;
    const o = orgMap.get(m.orgId);
    return { orgId: m.orgId, name: o?.name ?? "Unknown", industry: o?.industry ?? null, role: m.role, title: m.title, salary: sal };
  });
  const primary = companies[0] ?? null;

  // ---- Property (owned world businesses keyed by playerName) ----------
  const businesses = activeProfile?.playerName
    ? await db.select({
        businessType: worldBusinessesTable.businessType,
        companyName: worldBusinessesTable.companyName,
        industry: worldBusinessesTable.industry,
        companySize: worldBusinessesTable.companySize,
      }).from(worldBusinessesTable)
        .where(eq(worldBusinessesTable.playerName, activeProfile.playerName))
    : [];
  const cashflowNetWorth = netWorthRows[0]?.total ? Number(netWorthRows[0].total) : 0;

  // ---- Health (latest save blob — game state isn't otherwise persisted) -
  const save = (latestSaves[0]?.data ?? {}) as SaveBlob;
  const hasSave = latestSaves.length > 0;
  const health = {
    hasSave,
    hp: num(save.hp, 100),
    maxHp: num(save.maxHp, 100),
    energy: num(save.energy, 100),
    hunger: num(save.hunger, 100),
    thirst: num(save.thirst, 100),
    level: num(save.level, 1),
    exp: num(save.exp, 0),
    poisoned: save.poisoned === true,
    lastPlayedAt: latestSaves[0]?.updatedAt ?? null,
  };

  // ---- Combined net worth from save blob --------------------------------
  // True combined net worth: liquid fiat + gold-equivalent + property values
  // minus outstanding tax debt. More authoritative than the cashflow-only
  // netWorthRows sum (which only covers balance_sheet_transactions).
  const FIAT_PER_GOLD_RATE = 1_000; // matches client gameSystems.ts FIAT_PER_GOLD
  const saveSalary = num(save.salary, 0);
  const activeGold = goldAccounts.find((account) => account.slotIndex === (latestSaves[0]?.slotIndex ?? 0));
  const saveGold = (activeGold?.balanceTenths ?? 0) / 10;
  const savePropertyValue = Array.isArray(save.propertyDeeds)
    ? (save.propertyDeeds as Array<{ currentValue?: number; purchasePrice?: number }>)
        .reduce((s, d) => s + (d.currentValue ?? d.purchasePrice ?? 0), 0)
    : 0;
  const saveTaxDebt = num(save.taxDebt, 0);
  const combinedNetWorth = saveSalary + num(save.savings, 0) + saveGold * FIAT_PER_GOLD_RATE + savePropertyValue - saveTaxDebt;
  const netWorth = hasSave ? combinedNetWorth : cashflowNetWorth;

  // ---- Projects -------------------------------------------------------
  const projects = projectRows.map((p) => ({
    id: p.id,
    name: p.name,
    goal: p.goal,
    status: p.status,
    progressPct: p.progressPct,
    officeLabel: p.officeLabel,
    updatedAt: p.updatedAt,
  }));

  // ---- Bio ------------------------------------------------------------
  const liveProjects = projects.filter((p) => p.status === "live").length;
  const bioParts: string[] = [];
  bioParts.push(`${playerName} is a ${primary?.title || primary?.role || "freelance"} ${primary?.name ? `at ${primary.name}` : "operative"} in PICASSO.AI's salaryman economy.`);
  if (companies.length) bioParts.push(`Drawing a combined salary of ƒ${(totalSalary * FIAT_PER_USD).toLocaleString()} across ${companies.length} ${companies.length === 1 ? "company" : "companies"}.`);
  // combinedNetWorth (from save blob) is already in FIAT; cashflowNetWorth is in USD → needs * FIAT_PER_USD.
  const netWorthFiat = hasSave ? combinedNetWorth : cashflowNetWorth * FIAT_PER_USD;
  bioParts.push(`Net worth sits at ƒ${netWorthFiat.toLocaleString()}${businesses.length ? `, backed by ${businesses.length} registered ${businesses.length === 1 ? "venture" : "ventures"}` : ""}.`);
  if (projects.length) bioParts.push(`Running ${projects.length} ${projects.length === 1 ? "project" : "projects"}${liveProjects ? ` (${liveProjects} live)` : ""}.`);
  if (hasSave) bioParts.push(`Currently Level ${health.level}${health.poisoned ? ", and poisoned — get to a clinic" : ""}.`);

  res.json({
    identity: {
      playerName,
      fullName: fullName || null,
      email: user?.email ?? null,
      avatarColor: activeProfile?.avatarColor ?? "#a78bfa",
      profileImageUrl: user?.profileImageUrl ?? null,
      memberSince: user?.createdAt ?? activeProfile?.createdAt ?? null,
    },
    faction: {
      primary: primary
        ? { name: primary.name, industry: primary.industry, role: primary.role, title: primary.title, salary: primary.salary }
        : null,
      companies,
      totalSalary,
    },
    health,
    property: {
      netWorth,
      businesses,
    },
    projects,
    bio: {
      summary: bioParts.join(" "),
      memories: memoryRows.map((m) => ({ content: m.content, kind: m.kind, weight: m.weight })),
    },
    bank: {
      accounts: accounts.map((a) => ({ id: a.id, kind: a.kind, label: a.label, balance: a.balance, currency: a.currency })),
      activeUsd,
      fiatTotal,
      quarantineFiat,
      earnedFiat,
    },
    gold: saveGold,
    debt: led?.debt ?? 0,
    creditScore: led?.creditScore ?? 680,
    employment: {
      status: primary ? "EMPLOYED" : "FREELANCE",
      title: primary?.title || primary?.role || "SALARYMAN",
    },
    pabloTax: taxSnap,
    recentLineItems: recentLineItems.map((li) => ({
      id: li.id,
      kind: li.kind,
      label: li.label,
      chargedCents: li.chargedCents,
      costBasisCents: li.costBasisCents,
      createdAt: li.createdAt,
    })),
    pendingInvoices: pendingInvoices.map((inv) => ({
      id: inv.id,
      source: inv.source,
      amountCents: inv.amountCents,
      createdAt: inv.createdAt,
    })),
    rates: {
      fiatPerUsd: FIAT_PER_USD,
      goldOzPerUsd: GOLD_OZ_PER_USD,
    },
  });
});

// ── POST /api/wallet/net-worth-snapshot ──────────────────────────────────────
// Client pushes a net worth snapshot when the bank opens. Rate-limited to
// one snapshot per 8 hours per user to avoid bloat.
router.post("/wallet/net-worth-snapshot", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  try {
    const MAX_FIAT = 1_000_000_000; // 1B ƒ sanity ceiling
    const rawNW      = typeof req.body.netWorth  === "number" ? req.body.netWorth  : 0;
    const rawFiat    = typeof req.body.fiat       === "number" ? req.body.fiat       : 0;
    const rawGold    = typeof req.body.gold       === "number" ? req.body.gold       : 0;
    const rawProp    = typeof req.body.property   === "number" ? req.body.property   : 0;
    const netWorth   = Math.min(Math.max(Math.round(rawNW),   -MAX_FIAT), MAX_FIAT);
    const fiat       = Math.min(Math.max(Math.round(rawFiat), -MAX_FIAT), MAX_FIAT);
    const gold       = Math.min(Math.max(Math.round(rawGold), 0), 1_000_000);
    const property   = Math.min(Math.max(Math.round(rawProp), 0), MAX_FIAT);

    // Rate-limit: skip if a snapshot already exists in the last 8 hours.
    const cutoff = new Date(Date.now() - 8 * 60 * 60 * 1000);
    const recent = await db
      .select({ id: playerNetWorthSnapshotsTable.id })
      .from(playerNetWorthSnapshotsTable)
      .where(and(
        eq(playerNetWorthSnapshotsTable.userId, userId),
        gte(playerNetWorthSnapshotsTable.createdAt, cutoff),
      ))
      .limit(1);

    if (recent.length > 0) {
      res.json({ ok: true, skipped: true });
      return;
    }

    await db.insert(playerNetWorthSnapshotsTable).values({ userId, netWorth, fiat, gold, property });
    res.json({ ok: true, skipped: false });
  } catch (err: any) {
    console.error("[Wallet] net-worth-snapshot error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/wallet/net-worth-history ────────────────────────────────────────
// Returns the last 30 net worth snapshots for the current user, oldest first,
// for charting the player's financial trajectory.
router.get("/wallet/net-worth-history", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  try {
    const rows = await db
      .select({
        netWorth: playerNetWorthSnapshotsTable.netWorth,
        fiat:     playerNetWorthSnapshotsTable.fiat,
        gold:     playerNetWorthSnapshotsTable.gold,
        property: playerNetWorthSnapshotsTable.property,
        createdAt: playerNetWorthSnapshotsTable.createdAt,
      })
      .from(playerNetWorthSnapshotsTable)
      .where(eq(playerNetWorthSnapshotsTable.userId, userId))
      .orderBy(desc(playerNetWorthSnapshotsTable.createdAt))
      .limit(30);

    // Reverse so the array is oldest-first (natural chart order).
    rows.reverse();
    res.json({ history: rows });
  } catch (err: any) {
    console.error("[Wallet] net-worth-history error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
