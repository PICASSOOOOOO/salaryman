import { fetchJson, type MarketDataProvider, type DataQuote, type DataCandle, type Fundamentals, type NewsItem } from "./provider-types";

const BASE = "https://api.twelvedata.com";

export function createTwelveDataProvider(apiKey: string): MarketDataProvider {
  const key = encodeURIComponent(apiKey);

  return {
    id: "twelvedata",

    async getQuotes(symbols) {
      const out: Record<string, DataQuote> = {};
      await Promise.all(symbols.map(async (symbol) => {
        const q = await fetchJson<{
          symbol?: string; close?: string; open?: string; high?: string; low?: string;
          previous_close?: string; volume?: string; change?: string; percent_change?: string;
        }>(`${BASE}/quote?symbol=${encodeURIComponent(symbol)}&apikey=${key}`);
        if (!q?.close) return;
        const last = parseFloat(q.close);
        out[symbol] = {
          symbol,
          lastPrice: last,
          bidPrice: last,
          askPrice: last,
          volume: q.volume ? parseInt(q.volume, 10) : 0,
          openPrice: q.open ? parseFloat(q.open) : 0,
          highPrice: q.high ? parseFloat(q.high) : 0,
          lowPrice: q.low ? parseFloat(q.low) : 0,
          closePrice: q.previous_close ? parseFloat(q.previous_close) : 0,
          change: q.change ? parseFloat(q.change) : 0,
          percentChange: q.percent_change ? parseFloat(q.percent_change) : 0,
        };
      }));
      return out;
    },

    async getCandles(symbol, opts) {
      const outputsize = (opts?.lookback ?? 1) * 78;
      const data = await fetchJson<{ values?: Array<{ datetime: string; open: string; high: string; low: string; close: string; volume: string }> }>(
        `${BASE}/time_series?symbol=${encodeURIComponent(symbol)}&interval=5min&outputsize=${Math.min(outputsize, 5000)}&apikey=${key}`
      );
      return (data?.values ?? []).map<DataCandle>(v => ({
        datetime: Date.parse(v.datetime),
        open: parseFloat(v.open),
        high: parseFloat(v.high),
        low: parseFloat(v.low),
        close: parseFloat(v.close),
        volume: v.volume ? parseInt(v.volume, 10) : 0,
      })).reverse();
    },

    async getFundamentals(symbol) {
      const data = await fetchJson<{
        statistics?: {
          valuations_metrics?: { trailing_pe?: number; market_capitalization?: number };
          financials?: { income_statement?: { revenue_ttm?: number; diluted_eps_ttm?: number } };
          stock_price_summary?: { beta?: number; fifty_two_week_high?: number; fifty_two_week_low?: number };
          dividends_and_splits?: { forward_annual_dividend_yield?: number };
        };
      }>(`${BASE}/statistics?symbol=${encodeURIComponent(symbol)}&apikey=${key}`);
      const s = data?.statistics;
      if (!s) return null;
      const f: Fundamentals = {
        symbol,
        peRatio: s.valuations_metrics?.trailing_pe,
        marketCap: s.valuations_metrics?.market_capitalization,
        revenue: s.financials?.income_statement?.revenue_ttm,
        eps: s.financials?.income_statement?.diluted_eps_ttm,
        beta: s.stock_price_summary?.beta,
        high52Week: s.stock_price_summary?.fifty_two_week_high,
        low52Week: s.stock_price_summary?.fifty_two_week_low,
        dividendYield: s.dividends_and_splits?.forward_annual_dividend_yield,
      };
      return f;
    },

    async getNews(): Promise<NewsItem[]> {
      // Twelve Data has no general news endpoint on standard plans.
      return [];
    },
  };
}
