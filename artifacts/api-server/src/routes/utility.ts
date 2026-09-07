import { Router, type IRouter, type Request } from "express";
import { GAS_UNIT_PRICE_FIAT, utilityCatalogPayload } from "../lib/utility-catalog";
import { recordUtilityRevenue, totalUtilityRevenue } from "../lib/utility-revenue";
import { spendEarnedFiat } from "../lib/pablo-tax";
import { getMarketIndex } from "./real-estate";

function requireAuth(req: Request, res: any): string | null {
  if (!(req as any).isAuthenticated?.()) {
    res.status(401).json({ error: "Login required" });
    return null;
  }
  const id = (req as any).user?.id ?? null;
  if (!id) {
    res.status(401).json({ error: "Login required" });
    return null;
  }
  return id;
}

/**
 * PABLO POWER & GAS — the city's utility monopoly.
 *
 * Read-only catalog endpoint: the company entity, the battery line (with charge
 * capacities + FIAT prices), the per-unit gas price and the electricity charging
 * rate. Supply points (vending machines, charging stations, gas pumps) and
 * downstream energy loops all source their numbers from here.
 */
const router: IRouter = Router();

router.get("/utility/catalog", async (_req, res) => {
  const market = await getMarketIndex();
  const payload = utilityCatalogPayload();
  res.json({
    ...payload,
    market: { multiplier: market.multiplier, asOf: market.asOf, status: market.status },
    batteries: payload.batteries.map((item) => ({
      ...item,
      basePriceFiat: item.priceFiat,
      priceFiat: Math.max(1, Math.round(item.priceFiat * market.multiplier)),
    })),
    gasProducts: payload.gasProducts.map((item) => ({
      ...item,
      basePriceFiat: item.priceFiat,
      priceFiat: Math.max(1, Math.round(item.priceFiat * market.multiplier)),
    })),
    gasUnitPriceFiat: Math.max(1, Math.round(payload.gasUnitPriceFiat * market.multiplier)),
    baseGasUnitPriceFiat: payload.gasUnitPriceFiat,
    electricityRateFiatPerUnit: Math.max(1, Math.round(payload.electricityRateFiatPerUnit * market.multiplier)),
    baseElectricityRateFiatPerUnit: payload.electricityRateFiatPerUnit,
  });
});

// Owner-facing peek at what the monopoly has earned. Cheap aggregate; no auth
// gate beyond the global middleware — the figure is non-sensitive company lore.
router.get("/utility/revenue/total", async (_req, res) => {
  try {
    const total = await totalUtilityRevenue();
    res.json({ company: "PICASSO", totalFiat: total });
  } catch {
    res.status(500).json({ error: "failed_to_total_revenue" });
  }
});

/**
 * Refuel at a gas pump. The player pays FIAT at the utility's per-unit gas
 * price for raw gas units (vehicle tank or home supply); the sale is booked to
 * the monopoly's revenue ledger. The actual meter (client-side game state) is
 * credited by the caller with the `units` returned here.
 *
 * Body: { units: number, target?: "vehicle" | "home", label?: string }
 */
const MAX_REFUEL_UNITS = 200;
router.post("/utility/refuel", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const unitsRaw = Number(req.body?.units);
  if (!Number.isFinite(unitsRaw) || unitsRaw <= 0) {
    res.status(400).json({ error: "invalid_units" });
    return;
  }
  const units = Math.min(MAX_REFUEL_UNITS, Math.floor(unitsRaw));
  const target = req.body?.target === "home" ? "home" : "vehicle";
  const label = typeof req.body?.label === "string" ? req.body.label.slice(0, 48) : "";

  const market = await getMarketIndex();
  const gasUnitPriceFiat = Math.max(1, Math.round(GAS_UNIT_PRICE_FIAT * market.multiplier));
  const cost = units * gasUnitPriceFiat;
  const description =
    target === "home"
      ? `Gas pump: home gas supply ×${units}${label ? ` (${label})` : ""}`
      : `Gas pump: vehicle refuel ×${units}${label ? ` (${label})` : ""}`;

  const paid = await spendEarnedFiat({ userId, amountFiat: cost, description });
  if (!paid.ok) {
    res.status(402).json({ error: "insufficient_fiat", required: cost, spendable: paid.spendable });
    return;
  }

  // Book the sale to PABLO POWER & GAS (fire-and-forget; never blocks the buy
  // the player already paid for).
  void recordUtilityRevenue({
    userId,
    kind: "gas",
    units,
    amountFiat: cost,
    description,
  });

  res.json({ ok: true, units, target, spentFiat: cost, newBalance: paid.newBalance });
});

export default router;
