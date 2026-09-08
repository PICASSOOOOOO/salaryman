import type {
  BrokerAdapter, BrokerConnectionContext,
  BrokerQuote, BrokerCandle, BrokerAccountSnapshot, BrokerOrderResult, BrokerOrderStatus,
} from "./broker-types";
import { majorToCents } from "../currency";

// Alpaca has a real public REST API (API key + secret, separate paper and live
// base URLs). This adapter trades for real against it.
const LIVE_BASE = "https://api.alpaca.markets";
const PAPER_BASE = "https://paper-api.alpaca.markets";
const DATA_BASE = "https://data.alpaca.markets";

function headers(ctx: BrokerConnectionContext): Record<string, string> {
  return {
    "APCA-API-KEY-ID": ctx.credentials.apiKey || "",
    "APCA-API-SECRET-KEY": ctx.credentials.apiSecret || "",
    "Content-Type": "application/json",
  };
}

async function alpacaFetch<T>(url: string, ctx: BrokerConnectionContext, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...headers(ctx), ...(init?.headers || {}) },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Alpaca ${res.status}: ${body}`);
  }
  return (await res.json()) as T;
}

export const alpacaAdapter: BrokerAdapter = {
  broker: "alpaca",
  supportsLiveTrading: true,
  supportsOptions: false,
  authType: "api_key",

  async getAccount(ctx): Promise<BrokerAccountSnapshot> {
    const base = ctx.isPaperMode ? PAPER_BASE : LIVE_BASE;
    const [acct, positions] = await Promise.all([
      alpacaFetch<{ account_number: string; cash: string; equity: string }>(`${base}/v2/account`, ctx),
      alpacaFetch<Array<{ symbol: string; qty: string; market_value: string; avg_entry_price: string; unrealized_pl: string; asset_class: string }>>(`${base}/v2/positions`, ctx).catch(() => []),
    ]);
    return {
      accountIdentifier: acct.account_number,
      currency: "USD",
      cashBalance: majorToCents(parseFloat(acct.cash)),
      equity: majorToCents(parseFloat(acct.equity)),
      positions: positions.map(p => ({
        symbol: p.symbol,
        quantity: parseFloat(p.qty),
        marketValue: majorToCents(parseFloat(p.market_value)),
        averagePrice: majorToCents(parseFloat(p.avg_entry_price)),
        unrealizedPnl: majorToCents(parseFloat(p.unrealized_pl)),
        assetType: p.asset_class === "us_equity" ? "EQUITY" : p.asset_class,
      })),
    };
  },

  async getQuotes(ctx, symbols): Promise<Record<string, BrokerQuote>> {
    type AlpacaSnapshot = {
      latestTrade?: { p: number };
      dailyBar?: { o: number; h: number; l: number; c: number; v: number };
      prevDailyBar?: { c: number };
    };
    const data = await alpacaFetch<{ snapshots?: Record<string, AlpacaSnapshot> }>(
      `${DATA_BASE}/v2/stocks/snapshots?symbols=${encodeURIComponent(symbols.join(","))}`, ctx
    ).catch(() => ({ snapshots: {} as Record<string, AlpacaSnapshot> }));
    const out: Record<string, BrokerQuote> = {};
    for (const [symbol, s] of Object.entries(data.snapshots ?? {} as Record<string, AlpacaSnapshot>)) {
      const last = s.latestTrade?.p ?? s.dailyBar?.c ?? 0;
      const prevClose = s.prevDailyBar?.c ?? 0;
      out[symbol] = {
        symbol,
        lastPrice: last,
        bidPrice: last,
        askPrice: last,
        volume: s.dailyBar?.v ?? 0,
        openPrice: s.dailyBar?.o ?? 0,
        highPrice: s.dailyBar?.h ?? 0,
        lowPrice: s.dailyBar?.l ?? 0,
        closePrice: prevClose,
        change: prevClose ? last - prevClose : 0,
        percentChange: prevClose ? ((last - prevClose) / prevClose) * 100 : 0,
      };
    }
    return out;
  },

  async getPriceHistory(ctx, symbol): Promise<BrokerCandle[]> {
    const data = await alpacaFetch<{ bars?: Array<{ t: string; o: number; h: number; l: number; c: number; v: number }> }>(
      `${DATA_BASE}/v2/stocks/${encodeURIComponent(symbol)}/bars?timeframe=5Min&limit=200`, ctx
    ).catch(() => ({ bars: [] }));
    return (data.bars ?? []).map<BrokerCandle>(b => ({
      datetime: Date.parse(b.t), open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v,
    }));
  },

  async placeOrder(ctx, order): Promise<BrokerOrderResult> {
    const base = ctx.isPaperMode ? PAPER_BASE : LIVE_BASE;
    const body = {
      symbol: order.symbol,
      qty: order.quantity,
      side: order.side.startsWith("BUY") ? "buy" : "sell",
      type: order.orderType === "LIMIT" ? "limit" : "market",
      time_in_force: order.duration === "GOOD_TILL_CANCEL" ? "gtc" : "day",
      ...(order.orderType === "LIMIT" && order.limitPrice ? { limit_price: order.limitPrice } : {}),
    };
    const res = await alpacaFetch<{ id: string; status: string; filled_avg_price?: string }>(
      `${base}/v2/orders`, ctx, { method: "POST", body: JSON.stringify(body) }
    );
    return {
      orderId: res.id,
      status: res.status,
      fillPrice: res.filled_avg_price ? parseFloat(res.filled_avg_price) : undefined,
    };
  },

  async getOrderStatus(ctx, orderId): Promise<BrokerOrderStatus> {
    const base = ctx.isPaperMode ? PAPER_BASE : LIVE_BASE;
    const res = await alpacaFetch<{ id: string; status: string; filled_qty?: string }>(`${base}/v2/orders/${orderId}`, ctx);
    return { orderId: res.id, status: res.status, filledQuantity: res.filled_qty ? parseFloat(res.filled_qty) : 0 };
  },

  async cancelOrder(ctx, orderId): Promise<void> {
    const base = ctx.isPaperMode ? PAPER_BASE : LIVE_BASE;
    await alpacaFetch(`${base}/v2/orders/${orderId}`, ctx, { method: "DELETE" }).catch(() => {});
  },
};
