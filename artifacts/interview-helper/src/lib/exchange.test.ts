import { describe, it, expect } from 'vitest';
import {
  unitValueInFiat,
  exchangeQuote,
  roundToCurrency,
  formatCurrencyAmount,
  SWAP_CURRENCIES,
  type ExchangeRates,
} from './exchange';
import { FIAT_PER_GOLD, FIAT_PER_USD } from '../gameSystems';

const RATES: ExchangeRates = { btcUsd: 60_000, ethUsd: 3_000 };

describe('unitValueInFiat', () => {
  it('FIAT is the base unit (1 ƒ = 1 ƒ)', () => {
    expect(unitValueInFiat('FIAT', RATES)).toBe(1);
  });
  it('USD converts at FIAT_PER_USD', () => {
    expect(unitValueInFiat('USD', RATES)).toBe(FIAT_PER_USD);
  });
  it('GOLD converts at FIAT_PER_GOLD', () => {
    expect(unitValueInFiat('GOLD', RATES)).toBe(FIAT_PER_GOLD);
  });
  it('BTC/ETH price off the live USD index', () => {
    expect(unitValueInFiat('BTC', RATES)).toBe(60_000 * FIAT_PER_USD);
    expect(unitValueInFiat('ETH', RATES)).toBe(3_000 * FIAT_PER_USD);
  });
  it('returns 0 for a missing/non-positive crypto rate so callers can guard', () => {
    expect(unitValueInFiat('BTC', { btcUsd: 0, ethUsd: 0 })).toBe(0);
    expect(unitValueInFiat('ETH', { btcUsd: -5, ethUsd: -5 })).toBe(0);
  });
});

describe('exchangeQuote', () => {
  it('converts FIAT → GOLD net of fee', () => {
    // 1,000,000 ƒ = 10 oz gross; 2% fee → 9.8 oz net.
    const q = exchangeQuote('FIAT', 'GOLD', 1_000_000, RATES, 0.02);
    expect(q.valid).toBe(true);
    expect(q.grossToAmount).toBeCloseTo(10, 6);
    expect(q.feeToAmount).toBeCloseTo(0.2, 6);
    expect(q.netToAmount).toBeCloseTo(9.8, 6);
  });

  it('round-trips lose exactly the fee both ways (no free value)', () => {
    const fee = 0.02;
    const out = exchangeQuote('GOLD', 'BTC', 100, RATES, fee).netToAmount;
    const back = exchangeQuote('BTC', 'GOLD', out, RATES, fee).netToAmount;
    // Two 2% haircuts → ~0.9604 of the original.
    expect(back).toBeCloseTo(100 * (1 - fee) * (1 - fee), 4);
    expect(back).toBeLessThan(100);
  });

  it('a zero fee preserves ƒ value across the swap', () => {
    const q = exchangeQuote('BTC', 'ETH', 1, RATES, 0);
    expect(q.netValueFiat).toBeCloseTo(q.fromValueFiat, 3);
  });

  it('clamps the fee into [0,1]', () => {
    expect(exchangeQuote('FIAT', 'GOLD', 100, RATES, -1).feeRate).toBe(0);
    expect(exchangeQuote('FIAT', 'GOLD', 100, RATES, 5).feeRate).toBe(1);
  });

  it('is invalid for same-currency, non-positive amount, or missing rate', () => {
    expect(exchangeQuote('FIAT', 'FIAT', 100, RATES, 0.02).valid).toBe(false);
    expect(exchangeQuote('FIAT', 'GOLD', 0, RATES, 0.02).valid).toBe(false);
    expect(exchangeQuote('BTC', 'FIAT', 1, { btcUsd: 0, ethUsd: 0 }, 0.02).valid).toBe(false);
  });

  it('never yields a non-finite or negative output', () => {
    const q = exchangeQuote('ETH', 'BTC', -10, RATES, 0.02);
    expect(q.netToAmount).toBe(0);
    expect(Number.isFinite(q.netToAmount)).toBe(true);
  });
});

describe('roundToCurrency / formatCurrencyAmount', () => {
  it('rounds to each currency precision', () => {
    expect(roundToCurrency('FIAT', 123.9)).toBe(124);
    expect(roundToCurrency('GOLD', 1.239)).toBe(1.24);
    expect(roundToCurrency('BTC', 0.123456789)).toBe(0.123457);
  });
  it('formats with the right symbol', () => {
    expect(formatCurrencyAmount('FIAT', 1000)).toBe('ƒ1,000');
    expect(formatCurrencyAmount('GOLD', 2.5)).toBe('2.5oz');
    expect(formatCurrencyAmount('USD', 12.5)).toBe('$12.5');
    expect(formatCurrencyAmount('BTC', 0.01)).toContain('₿');
  });
});

describe('SWAP_CURRENCIES', () => {
  it('excludes USD (real money never instant-swaps)', () => {
    expect(SWAP_CURRENCIES).not.toContain('USD');
    expect(SWAP_CURRENCIES).toEqual(['FIAT', 'GOLD', 'BTC', 'ETH']);
  });
});
