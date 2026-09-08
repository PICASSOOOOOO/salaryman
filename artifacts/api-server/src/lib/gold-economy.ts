export const FIAT_PER_USD = 100;
export const GOLD_TENTHS_PER_USD = 1;
export const FIAT_PER_GOLD = FIAT_PER_USD * 10;
export const GOLD_CONVERSION_FEE_BPS = 200;
export const GOLD_QUOTE_TTL_MS = 30_000;

export type GoldSide = "buy" | "sell";

export function buildGoldQuote(side: GoldSide, goldTenths: number) {
  if (!Number.isSafeInteger(goldTenths) || goldTenths <= 0) {
    throw new Error("goldTenths must be a positive integer");
  }
  const grossFiat = goldTenths * (FIAT_PER_GOLD / 10);
  const feeFiat = Math.max(1, Math.ceil(grossFiat * GOLD_CONVERSION_FEE_BPS / 10_000));
  return {
    side,
    goldTenths,
    grossFiat,
    feeFiat,
    settledFiat: side === "buy" ? grossFiat + feeFiat : grossFiat - feeFiat,
    fiatPerGold: FIAT_PER_GOLD,
  };
}

export function btcForOneUsd(btcUsd: number): number | null {
  return Number.isFinite(btcUsd) && btcUsd > 0 ? 1 / btcUsd : null;
}

export function isFreshExecutableMarket(
  market: { status: string; asOf: number; btcUsd: number },
  now = Date.now(),
): boolean {
  return market.status === "live"
    && market.btcUsd > 0
    && Number.isFinite(market.asOf)
    && now - market.asOf <= GOLD_QUOTE_TTL_MS * 2;
}