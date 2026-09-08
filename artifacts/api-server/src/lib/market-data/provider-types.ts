import type { SchwabQuote, SchwabCandle } from "../schwab-api";
import type { MarketDataProviderId } from "@workspace/db";

export type { MarketDataProviderId };

// Reuse the canonical Schwab market-data shapes so provider output flows
// straight into the existing indicator/strategy/analysis pipeline.
export type DataQuote = SchwabQuote;
export type DataCandle = SchwabCandle;

export interface Fundamentals {
  symbol: string;
  name?: string;
  sector?: string;
  peRatio?: number;
  eps?: number;
  revenue?: number;
  marketCap?: number;
  dividendYield?: number;
  beta?: number;
  high52Week?: number;
  low52Week?: number;
}

export interface NewsItem {
  title: string;
  url?: string;
  source?: string;
  publishedAt?: number; // epoch ms
  summary?: string;
}

export interface MarketDataProvider {
  id: MarketDataProviderId;
  getQuotes(symbols: string[]): Promise<Record<string, DataQuote>>;
  getCandles(symbol: string, opts?: { lookback?: number }): Promise<DataCandle[]>;
  getFundamentals(symbol: string): Promise<Fundamentals | null>;
  getNews(symbol: string, limit?: number): Promise<NewsItem[]>;
}

// Shared fetch with a hard timeout — third-party data APIs must never hang the
// trading loop (see memory: always AbortSignal-timeout outbound fetches).
export async function fetchJson<T>(url: string, timeoutMs = 8000, headers?: Record<string, string>): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
