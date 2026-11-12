import { fetchJson, type MarketDataProvider, type DataQuote, type DataCandle, type Fundamentals, type NewsItem } from "./provider-types";

const BASE = "https://finnhub.io/api/v1";

export function createFinnhubProvider(apiKey: string): MarketDataProvider {
  const token = encodeURIComponent(apiKey);

  return {
    id: "finnhub",

    async getQuotes(symbols) {
      const out: Record<string, DataQuote> = {};
      await Promise.all(symbols.map(async (symbol) => {
        const q = await fetchJson<{ c: number; h: number; l: number; o: number; pc: number; d: number; dp: number }>(
          `${BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`
        );
        if (!q || !q.c) return;
        out[symbol] = {
          symbol,
          lastPrice: q.c,
          bidPrice: q.c,
          askPrice: q.c,
          volume: 0,
          openPrice: q.o ?? 0,
          highPrice: q.h ?? 0,
          lowPrice: q.l ?? 0,
          closePrice: q.pc ?? 0,
          change: q.d ?? 0,
          percentChange: q.dp ?? 0,
        };
      }));
      return out;
    },

    async getCandles(symbol, opts) {
      const lookback = opts?.lookback ?? 1;
      const to = Math.floor(Date.now() / 1000);
      const from = to - lookback * 24 * 60 * 60;
      const data = await fetchJson<{ s: string; t?: number[]; o?: number[]; h?: number[]; l?: number[]; c?: number[]; v?: number[] }>(
        `${BASE}/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=5&from=${from}&to=${to}&token=${token}`
      );
      if (!data || data.s !== "ok" || !data.t) return [];
      return data.t.map<DataCandle>((t, i) => ({
        datetime: t * 1000,
        open: data.o?.[i] ?? 0,
        high: data.h?.[i] ?? 0,
        low: data.l?.[i] ?? 0,
        close: data.c?.[i] ?? 0,
        volume: data.v?.[i] ?? 0,
      }));
    },

    async getFundamentals(symbol) {
      const [metric, profile] = await Promise.all([
        fetchJson<{ metric?: Record<string, number> }>(`${BASE}/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${token}`),
        fetchJson<{ name?: string; finnhubIndustry?: string; marketCapitalization?: number }>(`${BASE}/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${token}`),
      ]);
      const m = metric?.metric;
      if (!m && !profile) return null;
      const f: Fundamentals = {
        symbol,
        name: profile?.name,
        sector: profile?.finnhubIndustry,
        marketCap: profile?.marketCapitalization ? profile.marketCapitalization * 1_000_000 : m?.["marketCapitalization"],
        peRatio: m?.["peTTM"],
        eps: m?.["epsTTM"],
        revenue: m?.["revenueTTM"],
        beta: m?.["beta"],
        dividendYield: m?.["dividendYieldIndicatedAnnual"],
        high52Week: m?.["52WeekHigh"],
        low52Week: m?.["52WeekLow"],
      };
      return f;
    },

    async getNews(symbol, limit = 8): Promise<NewsItem[]> {
      const to = new Date();
      const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      const data = await fetchJson<Array<{ headline: string; url?: string; source?: string; datetime?: number; summary?: string }>>(
        `${BASE}/company-news?symbol=${encodeURIComponent(symbol)}&from=${fmt(from)}&to=${fmt(to)}&token=${token}`
      );
      return (data ?? []).slice(0, limit).map<NewsItem>(n => ({
        title: n.headline,
        url: n.url,
        source: n.source,
        publishedAt: n.datetime ? n.datetime * 1000 : undefined,
        summary: n.summary,
      }));
    },
  };
}
