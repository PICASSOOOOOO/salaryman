import { describe, expect, it } from "vitest";
import {
  DEFAULT_TOWER_SHOP_PRICING_POLICY,
  quoteTowerShopOrder,
  TOWER_SHOP_RESTOCK_COOLDOWN_MS_BY_RARITY,
} from "../lib/tower-shop-pricing";

describe("Tower shop supplier pricing", () => {
  it("applies longer supplier restock intervals to higher-rarity goods only", () => {
    expect(TOWER_SHOP_RESTOCK_COOLDOWN_MS_BY_RARITY).toEqual({
      rare: 7 * 24 * 60 * 60 * 1_000,
      very_rare: 14 * 24 * 60 * 60 * 1_000,
      legendary: 30 * 24 * 60 * 60 * 1_000,
    });
    expect(TOWER_SHOP_RESTOCK_COOLDOWN_MS_BY_RARITY.common).toBeUndefined();
    expect(TOWER_SHOP_RESTOCK_COOLDOWN_MS_BY_RARITY.expensive).toBeUndefined();
  });

  it("uses the live BTC multiplier for both goods and delivery", () => {
    const base = quoteTowerShopOrder({
      retailUnitPriceFiat: 10_000,
      quantity: 2,
      btcMultiplierBps: 10_000,
      demandIndex: 100,
      supplyIndex: 100,
    });
    const doubled = quoteTowerShopOrder({
      retailUnitPriceFiat: 10_000,
      quantity: 2,
      btcMultiplierBps: 20_000,
      demandIndex: 100,
      supplyIndex: 100,
    });

    expect(doubled.marketRetailUnitFiat).toBe(base.marketRetailUnitFiat * 2);
    expect(doubled.goodsCostFiat).toBe(base.goodsCostFiat * 2);
    expect(doubled.deliveryFeeFiat).toBe(base.deliveryFeeFiat * 2);
  });

  it("raises wholesale rates when demand exceeds supply and caps the adjustment", () => {
    const balanced = quoteTowerShopOrder({
      retailUnitPriceFiat: 10_000,
      quantity: 1,
      btcMultiplierBps: 10_000,
      demandIndex: 100,
      supplyIndex: 100,
    });
    const scarce = quoteTowerShopOrder({
      retailUnitPriceFiat: 10_000,
      quantity: 1,
      btcMultiplierBps: 10_000,
      demandIndex: 10_000,
      supplyIndex: 1,
    });

    expect(scarce.wholesaleRateBps).toBe(DEFAULT_TOWER_SHOP_PRICING_POLICY.maxWholesaleBps);
    expect(scarce.goodsCostFiat).toBeGreaterThan(balanced.goodsCostFiat);
  });

  it("separates the shop's payment, outside supplier cost, and shipper margin", () => {
    const quote = quoteTowerShopOrder({
      retailUnitPriceFiat: 12_000,
      quantity: 3,
      btcMultiplierBps: 10_000,
      demandIndex: 100,
      supplyIndex: 100,
    });

    expect(quote.shopTotalFiat).toBe(quote.goodsCostFiat + quote.deliveryFeeFiat);
    expect(quote.supplierCostFiat).toBeLessThan(quote.goodsCostFiat);
    expect(quote.shippingCompanyMarginFiat).toBe(quote.shopTotalFiat - quote.supplierCostFiat);
  });

  it("rejects invalid market and order inputs rather than producing a silent quote", () => {
    expect(() => quoteTowerShopOrder({
      retailUnitPriceFiat: 0,
      quantity: 1,
      btcMultiplierBps: 10_000,
      demandIndex: 100,
      supplyIndex: 100,
    })).toThrow(/retailUnitPriceFiat/);
    expect(() => quoteTowerShopOrder({
      retailUnitPriceFiat: 100,
      quantity: 1,
      btcMultiplierBps: 50_000,
      demandIndex: 100,
      supplyIndex: 100,
    })).toThrow(/btcMultiplierBps/);
  });
});
