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
      grossIncomeFiat: 10_000,
      grossIncomeGold: 100,
      grossIncomeCredits: 50_000,
    })).toEqual({
      rateBps: 500,
      taxableGrossIncomeFiat: 10_000,
      taxableGrossIncomeGold: 100,
      fiatTax: 500,
      goldTax: 5,
      excludedGrossIncomeCredits: 50_000,
      excludedStolenFiat: 0,
      excludedStolenGold: 0,
    });
  });

  it("lowers fictional-business tax from twenty to ten percent as wealth rises", () => {
    expect(getDailyBusinessTaxRateBps("fictional", 0)).toBe(2_000);
    expect(getDailyBusinessTaxRateBps("fictional", FICTIONAL_TAX_DISCOUNT_NET_WORTH_CAP / 2)).toBe(1_500);
    expect(getDailyBusinessTaxRateBps("fictional", FICTIONAL_TAX_DISCOUNT_NET_WORTH_CAP)).toBe(1_000);
  });

  it("charges an illegal business organization forty percent on earned income", () => {
    expect(calculateDailyBusinessTax({
      businessKind: "illegal",
      netWorthFiat: 1_000_000,
      grossIncomeFiat: 100_000,
      grossIncomeGold: 50,
      grossIncomeCredits: 900,
    })).toMatchObject({
      rateBps: 4_000,
      taxableGrossIncomeFiat: 100_000,
      fiatTax: 40_000,
      goldTax: 20,
      excludedGrossIncomeCredits: 900,
    });
  });

  it("does not tax stolen FIAT, including when received by an illegal business organization", () => {
    expect(calculateDailyBusinessTax({
      businessKind: "illegal",
      netWorthFiat: 0,
      grossIncomeFiat: 100_000,
      grossIncomeGold: 0,
      stolenIncomeFiat: 100_000,
    })).toMatchObject({
      taxableGrossIncomeFiat: 0,
      fiatTax: 0,
      excludedStolenFiat: 100_000,
    });
  });

  it("taxes gross income without reducing it by expenses, and ignores invalid or negative income", () => {
    expect(calculateDailyBusinessTax({
      businessKind: "fictional",
      netWorthFiat: 0,
      grossIncomeFiat: 10_000,
      grossIncomeGold: 0,
    })).toMatchObject({ taxableGrossIncomeFiat: 10_000, fiatTax: 2_000 });
    expect(calculateDailyBusinessTax({
      businessKind: "fictional",
      netWorthFiat: 0,
      grossIncomeFiat: -2,
      grossIncomeGold: Number.NaN,
    })).toMatchObject({
      taxableGrossIncomeFiat: 0,
      taxableGrossIncomeGold: 0,
      fiatTax: 0,
      goldTax: 0,
      excludedStolenFiat: 0,
      excludedStolenGold: 0,
    });
  });
});
