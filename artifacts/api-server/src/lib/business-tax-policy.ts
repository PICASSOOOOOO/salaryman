export type GameBusinessKind = "real" | "fictional" | "illegal";
export type TaxCurrency = "fiat" | "gold";

export interface DailyBusinessTaxInput {
  businessKind: GameBusinessKind;
  netWorthFiat: number;
  fiatDealings: number;
  goldDealings: number;
  creditDealings?: number;
}

export interface DailyBusinessTaxResult {
  rateBps: number;
  taxableFiat: number;
  taxableGold: number;
  fiatTax: number;
  goldTax: number;
  excludedCredits: number;
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
 * Tax FIAT and GOLD independently so neither currency is silently converted.
 * Service Credits are excluded from every business tax calculation.
 */
export function calculateDailyBusinessTax(input: DailyBusinessTaxInput): DailyBusinessTaxResult {
  const rateBps = getDailyBusinessTaxRateBps(input.businessKind, input.netWorthFiat);
  const taxableFiat = positiveWholeAmount(input.fiatDealings);
  const taxableGold = positiveWholeAmount(input.goldDealings);
  return {
    rateBps,
    taxableFiat,
    taxableGold,
    fiatTax: Math.floor((taxableFiat * rateBps) / 10_000),
    goldTax: Math.floor((taxableGold * rateBps) / 10_000),
    excludedCredits: positiveWholeAmount(input.creditDealings ?? 0),
  };
}
