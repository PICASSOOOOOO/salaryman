import { describe, expect, it } from "vitest";
import {
  calculateDailyBusinessTax,
  getDailyBusinessTaxRateBps,
  FICTIONAL_TAX_DISCOUNT_NET_WORTH_CAP,
} from "../lib/business-tax-policy";

describe("daily game-business tax policy", () => {
  it("charges real businesses five percent and excludes service Credits", () => {
    expect(calculateDailyBusinessTax({
      businessKind: "real",
      netWorthFiat: 0,
      fiatDealings: 10_000,
      goldDealings: 100,
      creditDealings: 50_000,
    })).toEqual({
      rateBps: 500,
      taxableFiat: 10_000,
      taxableGold: 100,
      fiatTax: 500,
      goldTax: 5,
      excludedCredits: 50_000,
    });
  });

  it("lowers fictional-business tax from twenty to ten percent as wealth rises", () => {
    expect(getDailyBusinessTaxRateBps("fictional", 0)).toBe(2_000);
    expect(getDailyBusinessTaxRateBps("fictional", FICTIONAL_TAX_DISCOUNT_NET_WORTH_CAP / 2)).toBe(1_500);
    expect(getDailyBusinessTaxRateBps("fictional", FICTIONAL_TAX_DISCOUNT_NET_WORTH_CAP)).toBe(1_000);
  });

  it("charges illegal businesses forty percent of daily FIAT and GOLD dealings", () => {
    expect(calculateDailyBusinessTax({
      businessKind: "illegal",
      netWorthFiat: 1_000_000,
      fiatDealings: 1_000,
      goldDealings: 50,
      creditDealings: 900,
    })).toMatchObject({ rateBps: 4_000, fiatTax: 400, goldTax: 20, excludedCredits: 900 });
  });

  it("ignores invalid and negative dealing amounts", () => {
    expect(calculateDailyBusinessTax({
      businessKind: "fictional",
      netWorthFiat: 0,
      fiatDealings: -2,
      goldDealings: Number.NaN,
    })).toMatchObject({ taxableFiat: 0, taxableGold: 0, fiatTax: 0, goldTax: 0 });
  });
});
