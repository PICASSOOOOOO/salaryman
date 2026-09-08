import type { DataQuote, DataCandle } from "./provider-types";

// Deterministic synthetic market data for paper trading when no broker-native
// or third-party feed is available (e.g. a Vietnam/Japan paper broker with no
// public quote API and no user data key). Seeded by symbol + the current 5-min
// bucket so the series evolves over time yet stays stable within a single scan.

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function basePrice(symbol: string): number {
  const h = hashString(symbol);
  // Spread base prices across a plausible 8 – 480 range.
  return 8 + (h % 47200) / 100;
}

export function syntheticCandles(symbol: string, count = 78): DataCandle[] {
  const bucket = Math.floor(Date.now() / (5 * 60 * 1000));
  const rng = mulberry32(hashString(symbol) ^ bucket);
  let price = basePrice(symbol);
  const candles: DataCandle[] = [];
  const now = Date.now();
  for (let i = count - 1; i >= 0; i--) {
    const drift = (rng() - 0.48) * price * 0.01;
    const open = price;
    const close = Math.max(0.5, open + drift);
    const high = Math.max(open, close) * (1 + rng() * 0.004);
    const low = Math.min(open, close) * (1 - rng() * 0.004);
    const volume = Math.round(50_000 + rng() * 950_000);
    candles.push({
      datetime: now - i * 5 * 60 * 1000,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume,
    });
    price = close;
  }
  return candles;
}

export function syntheticQuote(symbol: string): DataQuote {
  const candles = syntheticCandles(symbol, 78);
  const last = candles[candles.length - 1];
  const prev = candles.length > 1 ? candles[candles.length - 2] : last;
  const change = last.close - prev.close;
  return {
    symbol,
    lastPrice: last.close,
    bidPrice: Math.round(last.close * 99.95) / 100,
    askPrice: Math.round(last.close * 100.05) / 100,
    volume: last.volume,
    openPrice: candles[0].open,
    highPrice: Math.max(...candles.map(c => c.high)),
    lowPrice: Math.min(...candles.map(c => c.low)),
    closePrice: prev.close,
    change: Math.round(change * 100) / 100,
    percentChange: prev.close ? Math.round((change / prev.close) * 10000) / 100 : 0,
  };
}

export function syntheticQuotes(symbols: string[]): Record<string, DataQuote> {
  const out: Record<string, DataQuote> = {};
  for (const s of symbols) out[s] = syntheticQuote(s);
  return out;
}
