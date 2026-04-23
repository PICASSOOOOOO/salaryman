import { Router, type Request, type Response } from "express";
import { db, pabloTaxLineItemsTable, pabloTaxInvoicesTable, playerLedgerTable, bankAccountsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { getPabloTaxSnapshot, FIAT_PER_USD, GOLD_OZ_PER_USD } from "../lib/pablo-tax";

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
 * Currency display is rendered client-side from the canonical $1 = ƒ1000
 * = 0.005oz gold conversions so this endpoint can stay rate-free.
 */
router.get("/wallet/snapshot", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);

  const [accounts, ledger, taxSnap, recentLineItems, pendingInvoices] = await Promise.all([
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
  ]);

  const led = ledger[0];
  const fiatTotal = accounts.filter((a) => a.currency === "FIAT").reduce((s, a) => s + (a.balance || 0), 0);
  const quarantineFiat = led?.quarantineFiat ?? 0;
  const earnedFiat = Math.max(0, fiatTotal - quarantineFiat);

  res.json({
    bank: {
      accounts: accounts.map((a) => ({ id: a.id, kind: a.kind, label: a.label, balance: a.balance, currency: a.currency })),
      fiatTotal,
      quarantineFiat,
      earnedFiat,
    },
    debt: led?.debt ?? 0,
    creditScore: led?.creditScore ?? 680,
    employment: {
      // Stub — wired from the employment table once it lands. For now the
      // wallet shows the employment row from world-businesses if the user
      // has a desk assignment (already tracked elsewhere).
      status: "EMPLOYED",
      title: "SALARYMAN",
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

export default router;
