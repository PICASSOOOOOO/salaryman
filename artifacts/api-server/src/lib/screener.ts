import type { DataCandle, DataQuote } from "./market-data";

// Multi-exchange opportunity screener. Scans symbols for actionable setups —
// volume surges, momentum, breakouts, and oversold/overbought extremes — and
// returns them ranked by strength. Pure evaluation so it is unit-testable; the
// route layer supplies quotes/candles from whichever exchanges are connected.

export type ScreenerSignalType =
  | "volume_surge" | "momentum_up" | "momentum_down" | "breakout" | "breakdown" | "oversold" | "overbought";

export interface ScreenerHit {
  symbol: string;
  market?: string;
  currency?: string;
  lastPrice: number;
  signalType: ScreenerSignalType;
  score: number; // 0..100 strength
  detail: string;
  indicators: Record<string, number>;
}

function sma(values: number[], period: number): number {
  if (values.length < period) return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  return values.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses += Math.abs(diff);
  }
  const rs = losses === 0 ? 100 : gains / losses;
  return 100 - 100 / (1 + rs);
}

export interface EvaluateOptions {
  market?: string;
  currency?: string;
}

export function evaluateSymbol(
  symbol: string,
  quote: DataQuote | undefined,
  candles: DataCandle[],
  opts: EvaluateOptions = {}
): ScreenerHit[] {
  const hits: ScreenerHit[] = [];
  if (candles.length < 6) return hits;
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const last = quote?.lastPrice ?? closes[closes.length - 1];
  const recentVol = sma(volumes, 5);
  const baseVol = sma(volumes, 20);
  const volSurge = baseVol ? recentVol / baseVol : 1;
  const rsiVal = rsi(closes);
  const lookback = Math.min(20, closes.length - 1);
  const recentHigh = Math.max(...candles.slice(-lookback).map(c => c.high));
  const recentLow = Math.min(...candles.slice(-lookback).map(c => c.low));
  const momentum = ((last - closes[closes.length - 6]) / closes[closes.length - 6]) * 100;

  const base = {
    symbol, market: opts.market, currency: opts.currency, lastPrice: last,
    indicators: {
      rsi: Math.round(rsiVal),
      momentumPct: Math.round(momentum * 100) / 100,
      volumeSurge: Math.round(volSurge * 100) / 100,
    },
  };

  if (volSurge >= 1.5) {
    hits.push({ ...base, signalType: "volume_surge", score: Math.min(100, Math.round(volSurge * 33)), detail: `Volume ${volSurge.toFixed(1)}× the 20-period average` });
  }
  if (momentum >= 2) {
    hits.push({ ...base, signalType: "momentum_up", score: Math.min(100, Math.round(momentum * 8)), detail: `Up ${momentum.toFixed(2)}% over the last 6 bars` });
  } else if (momentum <= -2) {
    hits.push({ ...base, signalType: "momentum_down", score: Math.min(100, Math.round(Math.abs(momentum) * 8)), detail: `Down ${momentum.toFixed(2)}% over the last 6 bars` });
  }
  if (last >= recentHigh * 0.999) {
    hits.push({ ...base, signalType: "breakout", score: 70, detail: `Breaking ${lookback}-bar high (${recentHigh.toFixed(2)})` });
  } else if (last <= recentLow * 1.001) {
    hits.push({ ...base, signalType: "breakdown", score: 65, detail: `Breaking ${lookback}-bar low (${recentLow.toFixed(2)})` });
  }
  if (rsiVal <= 30) {
    hits.push({ ...base, signalType: "oversold", score: Math.min(100, Math.round((30 - rsiVal) * 3 + 40)), detail: `Oversold: RSI ${rsiVal.toFixed(0)}` });
  } else if (rsiVal >= 70) {
    hits.push({ ...base, signalType: "overbought", score: Math.min(100, Math.round((rsiVal - 70) * 3 + 40)), detail: `Overbought: RSI ${rsiVal.toFixed(0)}` });
  }

  return hits;
}

export function rankHits(hits: ScreenerHit[], limit = 25): ScreenerHit[] {
  return [...hits].sort((a, b) => b.score - a.score).slice(0, limit);
}

export interface ScreenInput {
  symbol: string;
  market?: string;
  currency?: string;
  quote?: DataQuote;
  candles: DataCandle[];
}

export function screen(inputs: ScreenInput[], limit = 25): ScreenerHit[] {
  const all: ScreenerHit[] = [];
  for (const input of inputs) {
    all.push(...evaluateSymbol(input.symbol, input.quote, input.candles, { market: input.market, currency: input.currency }));
  }
  return rankHits(all, limit);
}
