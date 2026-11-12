export type GameBusinessKind = "real" | "fictional" | "illegal";
export type TaxCurrency = "fiat" | "gold";

export interface DailyBusinessTaxInput {
  businessKind: GameBusinessKind;
  netWorthFiat: number;
  grossIncomeFiat: number;
  grossIncomeGold: number;
  grossIncomeCredits?: number;
  stolenIncomeFiat?: number;
  stolenIncomeGold?: number;
}

export interface DailyBusinessTaxResult {
  rateBps: number;
  taxableGrossIncomeFiat: number;
  taxableGrossIncomeGold: number;
  fiatTax: number;
  goldTax: number;
  excludedGrossIncomeCredits: number;
  excludedStolenFiat: number;
  excludedStolenGold: number;
}

export const REAL_BUSINESS_TAX_BPS = 500;
export const FICTIONAL_BUSINESS_TAX_MIN_BPS = 1_000;
export const FICTIONAL_BUSINESS_TAX_MAX_BPS = 2_000;
export const ILLEGAL_BUSINESS_TAX_BPS = 4_000;
export const FICTIONAL_TAX_DISCOUNT_NET_WORTH_CAP = 1_000_000_000;

function positiveWholeAmount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function getDailyBusinessTaxRateBps(
  businessKind: GameBusinessKind,
  netWorthFiat: number,
): number {
  if (businessKind === "real") return REAL_BUSINESS_TAX_BPS;
  if (businessKind === "illegal") return ILLEGAL_BUSINESS_TAX_BPS;

  const wealth = positiveWholeAmount(netWorthFiat);
  const progress = Math.min(1, wealth / FICTIONAL_TAX_DISCOUNT_NET_WORTH_CAP);
  return Math.round(
    FICTIONAL_BUSINESS_TAX_MAX_BPS
      - progress * (FICTIONAL_BUSINESS_TAX_MAX_BPS - FICTIONAL_BUSINESS_TAX_MIN_BPS),
  );
}

/**
 * Tax daily gross earned income in FIAT and GOLD independently so neither
 * currency is silently converted. No expense or cost deductions are applied.
 * Stolen proceeds and service Credits are excluded from every business tax.
 */
export function calculateDailyBusinessTax(input: DailyBusinessTaxInput): DailyBusinessTaxResult {
  const rateBps = getDailyBusinessTaxRateBps(input.businessKind, input.netWorthFiat);
  const grossIncomeFiat = positiveWholeAmount(input.grossIncomeFiat);
  const grossIncomeGold = positiveWholeAmount(input.grossIncomeGold);
  const excludedStolenFiat = Math.min(grossIncomeFiat, positiveWholeAmount(input.stolenIncomeFiat ?? 0));
  const excludedStolenGold = Math.min(grossIncomeGold, positiveWholeAmount(input.stolenIncomeGold ?? 0));
  const taxableGrossIncomeFiat = grossIncomeFiat - excludedStolenFiat;
  const taxableGrossIncomeGold = grossIncomeGold - excludedStolenGold;
  return {
    rateBps,
    taxableGrossIncomeFiat,
    taxableGrossIncomeGold,
    fiatTax: Math.floor((taxableGrossIncomeFiat * rateBps) / 10_000),
    goldTax: Math.floor((taxableGrossIncomeGold * rateBps) / 10_000),
    excludedGrossIncomeCredits: positiveWholeAmount(input.grossIncomeCredits ?? 0),
    excludedStolenFiat,
    excludedStolenGold,
  };
}
