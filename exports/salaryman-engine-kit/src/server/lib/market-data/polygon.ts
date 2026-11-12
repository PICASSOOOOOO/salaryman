import { fetchJson, type MarketDataProvider, type DataQuote, type DataCandle, type Fundamentals, type NewsItem } from "./provider-types";

const BASE = "https://api.polygon.io";

export function createPolygonProvider(apiKey: string): MarketDataProvider {
  const auth = `apiKey=${encodeURIComponent(apiKey)}`;

  return {
    id: "polygon",

    async getQuotes(symbols) {
      const out: Record<string, DataQuote> = {};
      await Promise.all(symbols.map(async (symbol) => {
        const data = await fetchJson<{
          ticker?: {
            day?: { o: number; h: number; l: number; c: number; v: number };
            prevDay?: { c: number };
            lastTrade?: { p: number };
            min?: { c: number };
            todaysChange?: number;
            todaysChangePerc?: number;
          };
        }>(`${BASE}/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(symbol)}?${auth}`);
        const t = data?.ticker;
        if (!t) return;
        const last = t.lastTrade?.p ?? t.min?.c ?? t.day?.c ?? 0;
        out[symbol] = {
          symbol,
          lastPrice: last,
          bidPrice: last,
          askPrice: last,
          volume: t.day?.v ?? 0,
          openPrice: t.day?.o ?? 0,
          highPrice: t.day?.h ?? 0,
          lowPrice: t.day?.l ?? 0,
          closePrice: t.prevDay?.c ?? 0,
          change: t.todaysChange ?? 0,
          percentChange: t.todaysChangePerc ?? 0,
        };
      }));
      return out;
    },

    async getCandles(symbol, opts) {
      const lookback = opts?.lookback ?? 1;
      const to = new Date();
      const from = new Date(to.getTime() - lookback * 24 * 60 * 60 * 1000);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      const data = await fetchJson<{ results?: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }> }>(
        `${BASE}/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/5/minute/${fmt(from)}/${fmt(to)}?adjusted=true&sort=asc&limit=5000&${auth}`
      );
      return (data?.results ?? []).map<DataCandle>(r => ({
        datetime: r.t, open: r.o, high: r.h, low: r.l, close: r.c, volume: r.v,
      }));
    },

    async getFundamentals(symbol) {
      const ref = await fetchJson<{ results?: { name?: string; market_cap?: number; sic_description?: string } }>(
        `${BASE}/v3/reference/tickers/${encodeURIComponent(symbol)}?${auth}`
      );
      if (!ref?.results) return null;
      const f: Fundamentals = {
        symbol,
        name: ref.results.name,
        sector: ref.results.sic_description,
        marketCap: ref.results.market_cap,
      };
      return f;
    },

    async getNews(symbol, limit = 8) {
      const data = await fetchJson<{ results?: Array<{ title: string; article_url?: string; publisher?: { name?: string }; published_utc?: string; description?: string }> }>(
        `${BASE}/v2/reference/news?ticker=${encodeURIComponent(symbol)}&limit=${limit}&${auth}`
      );
      return (data?.results ?? []).map<NewsItem>(n => ({
        title: n.title,
        url: n.article_url,
        source: n.publisher?.name,
        publishedAt: n.published_utc ? Date.parse(n.published_utc) : undefined,
        summary: n.description,
      }));
    },
  };
}
