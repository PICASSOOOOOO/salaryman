import { Router, type IRouter } from "express";
import { utilityCatalogPayload } from "../lib/utility-catalog";
import { totalUtilityRevenue } from "../lib/utility-revenue";

/**
 * PABLO POWER & GAS — the city's utility monopoly.
 *
 * Read-only catalog endpoint: the company entity, the battery line (with charge
 * capacities + FIAT prices), the per-unit gas price and the electricity charging
 * rate. Supply points (vending machines, charging stations, gas pumps) and
 * downstream energy loops all source their numbers from here.
 */
const router: IRouter = Router();

router.get("/utility/catalog", (_req, res) => {
  res.json(utilityCatalogPayload());
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

export default router;
