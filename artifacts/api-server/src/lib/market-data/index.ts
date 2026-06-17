import { db, tradingDataProvidersTable, type MarketDataProviderId } from "@workspace/db";
import { eq } from "drizzle-orm";
import { decryptCredentials } from "../bot-crypto";
import type { MarketDataProvider, DataQuote, DataCandle, Fundamentals, NewsItem } from "./provider-types";
import { createPolygonProvider } from "./polygon";
import { createTwelveDataProvider } from "./twelvedata";
import { createFinnhubProvider } from "./finnhub";
import { syntheticQuotes, syntheticCandles } from "./synthetic";

export type { MarketDataProvider, DataQuote, DataCandle, Fundamentals, NewsItem } from "./provider-types";

function buildProvider(provider: MarketDataProviderId, apiKey: string): MarketDataProvider | null {
  switch (provider) {
    case "polygon": return createPolygonProvider(apiKey);
    case "twelvedata": return createTwelveDataProvider(apiKey);
    case "finnhub": return createFinnhubProvider(apiKey);
    default: return null;
  }
}

// Resolve the user's optional, self-supplied market-data provider. Returns null
// when the user hasn't connected one — callers then degrade to broker-native
// data or synthetic paper data.
export async function resolveMarketDataProvider(userId: string): Promise<MarketDataProvider | null> {
  if (!userId) return null;
  const [row] = await db
    .select()
    .from(tradingDataProvidersTable)
    .where(eq(tradingDataProvidersTable.userId, userId));
  if (!row || row.status !== "active") return null;
  const apiKey = decryptCredentials(row.encryptedApiKey);
  if (!apiKey) return null;
  return buildProvider(row.provider as MarketDataProviderId, apiKey);
}

export interface MarketDataInfo {
  connected: boolean;
  provider: MarketDataProviderId | null;
}

export async function getMarketDataInfo(userId: string): Promise<MarketDataInfo> {
  if (!userId) return { connected: false, provider: null };
  const [row] = await db
    .select()
    .from(tradingDataProvidersTable)
    .where(eq(tradingDataProvidersTable.userId, userId));
  if (!row || row.status !== "active") return { connected: false, provider: null };
  return { connected: true, provider: row.provider as MarketDataProviderId };
}

// Quotes with graceful degradation: user provider → broker-native (if supplied)
// → deterministic synthetic data so paper trading always has something to chew.
export async function getQuotesWithFallback(
  userId: string,
  symbols: string[],
  brokerNative?: (syms: string[]) => Promise<Record<string, DataQuote>>,
): Promise<{ quotes: Record<string, DataQuote>; source: "provider" | "broker" | "synthetic" }> {
  const provider = await resolveMarketDataProvider(userId);
  if (provider) {
    const quotes = await provider.getQuotes(symbols);
    if (Object.keys(quotes).length > 0) return { quotes, source: "provider" };
  }
  if (brokerNative) {
    try {
      const quotes = await brokerNative(symbols);
      if (Object.keys(quotes).length > 0) return { quotes, source: "broker" };
    } catch { /* fall through to synthetic */ }
  }
  return { quotes: syntheticQuotes(symbols), source: "synthetic" };
}

export async function getCandlesWithFallback(
  userId: string,
  symbol: string,
  brokerNative?: (sym: string) => Promise<DataCandle[]>,
): Promise<{ candles: DataCandle[]; source: "provider" | "broker" | "synthetic" }> {
  const provider = await resolveMarketDataProvider(userId);
  if (provider) {
    const candles = await provider.getCandles(symbol);
    if (candles.length > 0) return { candles, source: "provider" };
  }
  if (brokerNative) {
    try {
      const candles = await brokerNative(symbol);
      if (candles.length > 0) return { candles, source: "broker" };
    } catch { /* fall through to synthetic */ }
  }
  return { candles: syntheticCandles(symbol), source: "synthetic" };
}
