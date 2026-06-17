// ── BANCO OMBRA exchange engine (pure) ───────────────────────────────────────
// Converts between any pair among the in-game currencies plus USD, both ways,
// using ƒ (FIAT) as the common base unit. BTC/ETH/GOLD are in-game-only stores
// of value priced off the live USD market index (NO real crypto); only USD is
// real money. A flat configurable fee is taken on every swap.
//
// This engine is display/quote math only — it NEVER moves real money. Real-money
// USD legs are mediated by the server (Stripe top-up in, gold cash-out out) and
// must never trust client-sent amounts.
import { FIAT_PER_GOLD, FIAT_PER_USD } from '../gameSystems';

export type ExchangeCurrency = 'FIAT' | 'GOLD' | 'BTC' | 'ETH' | 'USD';

export const EXCHANGE_CURRENCIES: ExchangeCurrency[] = ['FIAT', 'GOLD', 'BTC', 'ETH', 'USD'];

// In-game swap currencies (USD excluded — it only enters/exits via real-money
// rails, never an instant swap).
export const SWAP_CURRENCIES: ExchangeCurrency[] = ['FIAT', 'GOLD', 'BTC', 'ETH'];

export interface ExchangeRates {
  /** Live USD per 1 BTC (from the market index). */
  btcUsd: number;
  /** Live USD per 1 ETH (from the market index). */
  ethUsd: number;
}

export const CURRENCY_META: Record<ExchangeCurrency, { label: string; symbol: string; decimals: number; real: boolean }> = {
  FIAT: { label: 'FIAT', symbol: 'ƒ',   decimals: 0, real: false },
  GOLD: { label: 'GOLD', symbol: 'oz',  decimals: 2, real: false },
  BTC:  { label: 'BTC',  symbol: '₿',   decimals: 6, real: false },
  ETH:  { label: 'ETH',  symbol: 'Ξ',   decimals: 5, real: false },
  USD:  { label: 'USD',  symbol: '$',   decimals: 2, real: true  },
};

/**
 * Value of 1 unit of `cur` expressed in ƒ (the in-game base unit). Returns 0 for
 * a currency whose live rate is missing/non-positive so callers can guard.
 */
export function unitValueInFiat(cur: ExchangeCurrency, rates: ExchangeRates): number {
  switch (cur) {
    case 'FIAT': return 1;
    case 'USD':  return FIAT_PER_USD;
    case 'GOLD': return FIAT_PER_GOLD;
    case 'BTC':  return rates.btcUsd > 0 ? rates.btcUsd * FIAT_PER_USD : 0;
    case 'ETH':  return rates.ethUsd > 0 ? rates.ethUsd * FIAT_PER_USD : 0;
    default:     return 0;
  }
}

export interface ExchangeQuote {
  from: ExchangeCurrency;
  to: ExchangeCurrency;
  fromAmount: number;
  /** to-units before fee. */
  grossToAmount: number;
  feeRate: number;
  /** fee expressed in `to` units. */
  feeToAmount: number;
  /** to-units after fee — what the player actually receives. */
  netToAmount: number;
  /** ƒ value of the input. */
  fromValueFiat: number;
  /** ƒ value of the net output. */
  netValueFiat: number;
  /** gross to-units per 1 from-unit (mid-market, pre-fee). */
  rate: number;
  /** false when a live rate is missing or the same currency is both legs. */
  valid: boolean;
}

const clampFee = (f: number): number => (Number.isFinite(f) ? Math.max(0, Math.min(1, f)) : 0);

/**
 * Quote a swap of `fromAmount` of `from` into `to`. Fee is taken on the output
 * side. Pure: callers round to the destination currency's precision and enforce
 * balance limits separately.
 */
export function exchangeQuote(
  from: ExchangeCurrency,
  to: ExchangeCurrency,
  fromAmount: number,
  rates: ExchangeRates,
  feeRate: number,
): ExchangeQuote {
  const amt = Number.isFinite(fromAmount) && fromAmount > 0 ? fromAmount : 0;
  const fromFiat = unitValueInFiat(from, rates);
  const toFiat = unitValueInFiat(to, rates);
  const fee = clampFee(feeRate);
  const valid = from !== to && fromFiat > 0 && toFiat > 0 && amt > 0;

  const fromValueFiat = amt * fromFiat;
  const grossToAmount = toFiat > 0 ? fromValueFiat / toFiat : 0;
  const feeToAmount = grossToAmount * fee;
  const netToAmount = grossToAmount - feeToAmount;
  const rate = fromFiat > 0 && toFiat > 0 ? fromFiat / toFiat : 0;

  return {
    from, to, fromAmount: amt,
    grossToAmount, feeRate: fee, feeToAmount, netToAmount,
    fromValueFiat, netValueFiat: netToAmount * toFiat, rate,
    valid,
  };
}

/** Round an amount to a currency's display/storage precision. */
export function roundToCurrency(cur: ExchangeCurrency, amount: number): number {
  const d = CURRENCY_META[cur].decimals;
  const f = 10 ** d;
  return Math.round(amount * f) / f;
}

/** Format an amount with the currency symbol for UI readouts. */
export function formatCurrencyAmount(cur: ExchangeCurrency, amount: number): string {
  const meta = CURRENCY_META[cur];
  const body = roundToCurrency(cur, amount).toLocaleString(undefined, { maximumFractionDigits: meta.decimals });
  switch (cur) {
    case 'FIAT': return `ƒ${body}`;
    case 'GOLD': return `${body}oz`;
    case 'USD':  return `$${body}`;
    default:     return `${body} ${meta.symbol}`; // BTC ₿ / ETH Ξ
  }
}
