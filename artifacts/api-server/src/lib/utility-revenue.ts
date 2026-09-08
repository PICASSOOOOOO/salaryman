import { db, utilityRevenueTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { UTILITY_COMPANY, type UtilityKind } from "./utility-catalog";

/**
 * Revenue routing for the PABLO POWER & GAS monopoly.
 *
 * Every FIAT utility purchase books a company-revenue row attributed to the
 * owning org (PICASSO). The player's bank account is debited elsewhere (the
 * buy path's spendEarnedFiat) — this is the credit side: the monopoly's income
 * ledger. Reporting can sum this table to show what the utility earned.
 *
 * This is intentionally fire-and-forget at the call site: a ledger insert
 * failure must never block a purchase the player already paid for.
 */

export interface RecordUtilityRevenueArgs {
  /** The paying player's user id. */
  userId: string;
  kind: UtilityKind;
  /** Inventory item id sold, when applicable (battery / fuel). */
  itemId?: string | null;
  /** Quantity of items/units moved. */
  units?: number;
  /** Revenue booked in FIAT (ƒ). Must be >= 0. */
  amountFiat: number;
  description?: string;
}

/**
 * Insert one utility-revenue row for the monopoly. Returns the new row id, or
 * null if nothing was recorded (non-positive amount or insert error).
 */
export async function recordUtilityRevenue(
  args: RecordUtilityRevenueArgs,
): Promise<number | null> {
  const amount = Math.round(args.amountFiat);
  if (!args.userId || !Number.isFinite(amount) || amount <= 0) return null;
  try {
    const [row] = await db
      .insert(utilityRevenueTable)
      .values({
        userId: args.userId,
        company: UTILITY_COMPANY.ownerOrg,
        kind: args.kind,
        itemId: args.itemId ?? null,
        units: Math.max(1, Math.round(args.units ?? 1)),
        amountFiat: amount,
        description: args.description ?? "",
      })
      .returning({ id: utilityRevenueTable.id });
    return row?.id ?? null;
  } catch (err) {
    console.error("[utility-revenue] failed to record revenue", err);
    return null;
  }
}

/** Total FIAT revenue booked by the utility, optionally filtered by kind. */
export async function totalUtilityRevenue(kind?: UtilityKind): Promise<number> {
  const base = db
    .select({ total: sql<number>`COALESCE(SUM(${utilityRevenueTable.amountFiat}), 0)` })
    .from(utilityRevenueTable);
  const rows = kind
    ? await base.where(eq(utilityRevenueTable.kind, kind))
    : await base;
  return Number(rows[0]?.total ?? 0);
}
