import { describe, expect, it } from "vitest";
import { BROKER_COMMISSION_RATE, publicAssetAddress, quoteMarketAdjustedFiat, quotePropertyMarket } from "./property-market";

describe("property market contract", () => {
  it("composes deterministic broker arithmetic", () => {
    const result = quotePropertyMarket({ baseFiat: 10_001, economyMultiplier: 1.25, selectedUpsellIds: ["featured_placement"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote).toMatchObject({ baseFiat: 10_001, marketFiat: 12_501, commissionFiat: Math.round(12_501 * BROKER_COMMISSION_RATE), upsellFiat: 7_500, points: 20 });
    expect(result.quote.totalFiat).toBe(result.quote.marketFiat + result.quote.commissionFiat + result.quote.upsellFiat);
  });

  it("rejects unknown paid services rather than billing silently", () => {
    expect(quotePropertyMarket({ baseFiat: 100, economyMultiplier: 1, selectedUpsellIds: ["not-a-service"] })).toEqual({
      ok: false, error: "unknown_upsell", unknownUpsellIds: ["not-a-service"],
    });
  });

  it("creates stable public asset addresses", () => {
    expect(publicAssetAddress({ kind: "tower_unit", city: "Minx City", floorNumber: 12, unitNumber: 3 })).toBe("shadow-tower/minx-city/floor-12/unit-3");
    expect(publicAssetAddress({ kind: "property", serverId: "Minx Prime", assetKind: "building", assetId: 9 })).toBe("property/minx-prime/building-9");
  });

  it("composes Shadow Tower base and live market values without changing base", () => {
    expect(quoteMarketAdjustedFiat(240_000, 1.125)).toEqual({ baseFiat: 240_000, economyMultiplier: 1.125, totalFiat: 270_000 });
  });
});