/**
 * SALARYMAN — battery charge & AI metering core.
 *
 * Batteries are the in-world wrapper for the cost of running anything that draws
 * power: a bot, the Pablo/Mila assistant, a non-human companion, an electric
 * home or vehicle. Each of those is an INSTALL TARGET (see installed-items.ts).
 * A battery installed into a target carries `currentCharge` (utility units). AI
 * usage burns charge sized to the real provider cost; buying / recharging the
 * battery is where the player actually pays ƒ. That pre-paid charge IS the AI
 * bill — so the legacy per-use Pablo Tax no longer applies to AI usage (it is
 * narrowed to a one-time tax on large physical purchases like property).
 *
 * This module owns:
 *   - the cost→charge conversion (tied to the same markup the meter used),
 *   - reading installed batteries + a read-only power preflight,
 *   - the atomic AI charge burn that records an audit line item and tops the
 *     Pablo/Mila assistant up with one free starter cell on first use.
 *
 * The charge/swap/sell ROUTES live in routes/items.ts (next to the consumable
 * stack helpers they need); this module is the loop they and the AI paths share.
 */
import {
  db,
  playerInstalledItemsTable,
  pabloTaxMeterTable,
  pabloTaxLineItemsTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { findBatterySpec, ELECTRICITY_RATE_FIAT_PER_UNIT } from "./utility-catalog";
import { PABLO_TAX_MARKUP, FIAT_PER_USD, type ApiKind } from "./pablo-tax";

/** Every player's assistant ships with this cell, granted free on first AI use. */
export const STARTER_BATTERY_ID = "batt_aa";
/** Fraction of a battery's purchase price refunded when sold back to the utility. */
export const SELL_REFUND_PCT = 0.5;
/** The canonical (single) assistant install target id. */
export const ASSISTANT_TARGET_ID = "assistant";
/** AI-metered server paths operate against the active save slot. */
export const ACTIVE_SLOT = 0;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Full charge capacity of a battery by item id (0 if it isn't a battery). */
export function batteryCapacity(itemId: string): number {
  return findBatterySpec(itemId)?.capacity ?? 0;
}

/** True if the item id is a battery (vs. fuel or a non-utility consumable). */
export function isBattery(itemId: string): boolean {
  return !!findBatterySpec(itemId);
}

/**
 * Convert a raw provider cost (USD cents) into the battery charge units the
 * usage burns. The burned charge is worth, in ƒ, EXACTLY the marked-up AI cost
 * (markedUp¢ → $ → ƒ → ÷ electricity rate). Because the player buys that charge
 * at the electricity rate, the burn settles the metered cost with no extra tax.
 */
export function chargeUnitsForCostCents(costBasisCents: number, markup = PABLO_TAX_MARKUP): number {
  const markedUpDollars = (Math.max(0, costBasisCents) * markup) / 100;
  const fiat = markedUpDollars * FIAT_PER_USD;
  return fiat / ELECTRICITY_RATE_FIAT_PER_UNIT;
}

/** ƒ cost to push `units` of charge into a battery at the utility's rate. */
export function fiatCostForChargeUnits(units: number): number {
  return Math.ceil(Math.max(0, units) * ELECTRICITY_RATE_FIAT_PER_UNIT);
}

export interface InstalledBattery {
  id: number;
  targetType: string;
  targetId: string;
  slotNo: number;
  itemId: string;
  capacity: number;
  currentCharge: number;
}

function toInstalledBattery(row: typeof playerInstalledItemsTable.$inferSelect): InstalledBattery | null {
  const capacity = batteryCapacity(row.itemId);
  if (capacity <= 0) return null; // not a battery (fuel, etc.)
  return {
    id: row.id,
    targetType: row.targetType,
    targetId: row.targetId,
    slotNo: row.slotNo,
    itemId: row.itemId,
    capacity,
    currentCharge: Math.max(0, Number(row.currentCharge ?? capacity)),
  };
}

/**
 * Every installed battery on a target (home can hold two). Non-battery installs
 * are filtered out. Ordered by slot so burns/recharges are deterministic.
 */
export async function getInstalledBatteries(
  userId: string,
  slot: number,
  targetType: string,
  targetId: string,
): Promise<InstalledBattery[]> {
  const rows = await db
    .select()
    .from(playerInstalledItemsTable)
    .where(and(
      eq(playerInstalledItemsTable.userId, userId),
      eq(playerInstalledItemsTable.slotIndex, slot),
      eq(playerInstalledItemsTable.targetType, targetType),
      eq(playerInstalledItemsTable.targetId, targetId),
    ));
  return rows
    .map(toInstalledBattery)
    .filter((b): b is InstalledBattery => b !== null)
    .sort((a, b) => a.slotNo - b.slotNo);
}

export interface PowerStatus {
  /** Sum of charge across installed batteries. */
  charge: number;
  capacity: number;
  /** Installed battery count (0 = nothing to draw from). */
  count: number;
  /** True if the target can run AI right now (has charge, or is seedable). */
  powered: boolean;
  /** True only for the assistant before its one free starter cell is granted. */
  seedable: boolean;
}

/**
 * Read-only preflight: can this target run a paid AI action right now? Used to
 * stop a call BEFORE the provider runs (the burn happens after). The assistant
 * is reported powered when it is seedable (first-use free cell) even with no
 * battery installed yet.
 */
export async function getPowerStatus(
  userId: string,
  slot: number,
  targetType: string,
  targetId: string,
): Promise<PowerStatus> {
  const batteries = await getInstalledBatteries(userId, slot, targetType, targetId);
  const charge = batteries.reduce((s, b) => s + b.currentCharge, 0);
  const capacity = batteries.reduce((s, b) => s + b.capacity, 0);
  let seedable = false;
  if (targetType === "assistant" && batteries.length === 0) {
    const [meter] = await db
      .select({ seeded: pabloTaxMeterTable.assistantBatterySeeded })
      .from(pabloTaxMeterTable)
      .where(eq(pabloTaxMeterTable.userId, userId))
      .limit(1);
    seedable = (meter?.seeded ?? 0) === 0;
  }
  return {
    charge,
    capacity,
    count: batteries.length,
    powered: charge > 0 || seedable,
    seedable,
  };
}

export type BurnResult =
  | { ok: true; burned: number; remaining: number; seeded: boolean; replay: boolean }
  | { ok: false; reason: "depleted" | "no_battery"; remaining: number };

/**
 * Burn AI charge from a target's installed battery, sized to the provider cost.
 * Atomic: locks the battery rows, drains them in slot order, records an audit
 * line item (kind/label/cost, `settledVia: "battery"`) and — for the assistant
 * with no battery and an unspent free-cell grant — installs one full starter
 * cell first. Idempotent when a `requestId` is supplied.
 *
 * Returns `ok: false` only when the target has no usable power (caller should
 * have preflighted with getPowerStatus; this is the race-safe backstop).
 */
export async function burnAiCharge(opts: {
  userId: string;
  slot?: number;
  targetType: string;
  targetId: string;
  costBasisCents: number;
  kind: ApiKind;
  label: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
  /** Assistant only: allow the one-time free starter cell. */
  allowSeed?: boolean;
}): Promise<BurnResult> {
  const slot = opts.slot ?? ACTIVE_SLOT;
  const units = chargeUnitsForCostCents(opts.costBasisCents);
  const charged = Math.max(0, Math.round(opts.costBasisCents * PABLO_TAX_MARKUP));
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;

  return await db.transaction(async (tx) => {
    // Idempotency: a repeated requestId short-circuits without a second burn.
    if (opts.requestId) {
      const dup = await tx
        .select({ id: pabloTaxLineItemsTable.id })
        .from(pabloTaxLineItemsTable)
        .where(and(
          eq(pabloTaxLineItemsTable.userId, opts.userId),
          eq(pabloTaxLineItemsTable.requestId, opts.requestId),
        ))
        .limit(1);
      if (dup[0]) {
        const cur = await tx
          .select()
          .from(playerInstalledItemsTable)
          .where(and(
            eq(playerInstalledItemsTable.userId, opts.userId),
            eq(playerInstalledItemsTable.slotIndex, slot),
            eq(playerInstalledItemsTable.targetType, opts.targetType),
            eq(playerInstalledItemsTable.targetId, opts.targetId),
          ));
        const remaining = cur
          .map(toInstalledBattery)
          .filter((b): b is InstalledBattery => b !== null)
          .reduce((s, b) => s + b.currentCharge, 0);
        return { ok: true as const, burned: 0, remaining, seeded: false, replay: true };
      }
    }

    // Lock installed rows for this target.
    const locked = await tx
      .select()
      .from(playerInstalledItemsTable)
      .where(and(
        eq(playerInstalledItemsTable.userId, opts.userId),
        eq(playerInstalledItemsTable.slotIndex, slot),
        eq(playerInstalledItemsTable.targetType, opts.targetType),
        eq(playerInstalledItemsTable.targetId, opts.targetId),
      ))
      .for("update");
    let batteries = locked
      .map(toInstalledBattery)
      .filter((b): b is InstalledBattery => b !== null)
      .sort((a, b) => a.slotNo - b.slotNo);

    let seeded = false;
    if (batteries.length === 0) {
      // No battery. The assistant may claim its one free starter cell.
      if (opts.allowSeed && opts.targetType === "assistant") {
        const meterRows = await tx
          .select()
          .from(pabloTaxMeterTable)
          .where(eq(pabloTaxMeterTable.userId, opts.userId))
          .for("update")
          .limit(1);
        let meter = meterRows[0];
        if (!meter) {
          const [created] = await tx
            .insert(pabloTaxMeterTable)
            .values({ userId: opts.userId, periodYearMonth: period })
            .onConflictDoNothing({ target: pabloTaxMeterTable.userId })
            .returning();
          meter = created ?? (await tx
            .select()
            .from(pabloTaxMeterTable)
            .where(eq(pabloTaxMeterTable.userId, opts.userId))
            .for("update")
            .limit(1))[0];
        }
        if (meter && meter.assistantBatterySeeded === 0) {
          const cap = batteryCapacity(STARTER_BATTERY_ID);
          const [ins] = await tx
            .insert(playerInstalledItemsTable)
            .values({
              userId: opts.userId,
              slotIndex: slot,
              targetType: opts.targetType,
              targetId: opts.targetId,
              slotNo: 0,
              itemId: STARTER_BATTERY_ID,
              currentCharge: cap,
            })
            .onConflictDoNothing()
            .returning();
          await tx
            .update(pabloTaxMeterTable)
            .set({ assistantBatterySeeded: 1 })
            .where(eq(pabloTaxMeterTable.userId, opts.userId));
          if (ins) {
            const b = toInstalledBattery(ins);
            if (b) { batteries = [b]; seeded = true; }
          }
        }
      }
      if (batteries.length === 0) {
        return { ok: false as const, reason: "no_battery", remaining: 0 };
      }
    }

    const available = batteries.reduce((s, b) => s + b.currentCharge, 0);
    if (available <= 0) {
      return { ok: false as const, reason: "depleted", remaining: 0 };
    }

    // Drain in slot order; floor each cell at 0. Preflight prevents starting on
    // a dead target, so an over-cost burn simply empties the pack.
    let need = units;
    let burned = 0;
    for (const b of batteries) {
      if (need <= 0) break;
      const take = Math.min(need, b.currentCharge);
      if (take <= 0) continue;
      const newCharge = b.currentCharge - take;
      await tx
        .update(playerInstalledItemsTable)
        .set({ currentCharge: newCharge })
        .where(eq(playerInstalledItemsTable.id, b.id));
      b.currentCharge = newCharge;
      need -= take;
      burned += take;
    }

    await tx.insert(pabloTaxLineItemsTable).values({
      userId: opts.userId,
      periodYearMonth: period,
      kind: opts.kind,
      label: opts.label.slice(0, 96),
      costBasisCents: opts.costBasisCents,
      chargedCents: charged,
      requestId: opts.requestId ?? null,
      metadata: { ...(opts.metadata ?? {}), settledVia: "battery", burnedUnits: burned } as object,
    });

    const remaining = batteries.reduce((s, b) => s + b.currentCharge, 0);
    return { ok: true as const, burned, remaining, seeded, replay: false };
  });
}
