import type {
  BrokerAdapter, BrokerConnectionContext,
  BrokerQuote, BrokerCandle, BrokerOptionChain, BrokerAccountSnapshot, BrokerOrderResult, BrokerOrderStatus,
} from "./broker-types";
import {
  getAccounts, getQuotes, getPriceHistory, getOptionChain,
  placeOrder, getOrders, cancelOrder,
} from "../schwab-api";

function creds(ctx: BrokerConnectionContext): { appKey: string; appSecret: string; accountHash: string } {
  return {
    appKey: ctx.credentials.appKey || ctx.credentials.apiKey || "",
    appSecret: ctx.credentials.appSecret || ctx.credentials.apiSecret || "",
    accountHash: ctx.accountIdentifier || ctx.credentials.accountHash || "",
  };
}

// Adapts the existing Schwab/thinkorswim integration to the generic broker
// interface. The legacy single-Schwab path (botTradingAccountsTable) is
// untouched; this adapter lets quotes/analysis/screener treat Schwab uniformly.
export const schwabAdapter: BrokerAdapter = {
  broker: "schwab",
  supportsLiveTrading: true,
  supportsOptions: true,
  authType: "oauth",

  async getAccount(ctx): Promise<BrokerAccountSnapshot> {
    const { appKey, appSecret, accountHash } = creds(ctx);
    const accounts = await getAccounts(ctx.botId, appKey, appSecret);
    const acct = accounts.find(a => a.accountHash === accountHash) || accounts[0];
    if (!acct) throw new Error("No Schwab account found");
    return {
      accountIdentifier: acct.accountHash,
      currency: "USD",
      cashBalance: acct.cashBalance,
      equity: acct.equity,
      positions: acct.positions.map(p => ({
        symbol: p.symbol,
        quantity: p.quantity,
        marketValue: p.marketValue,
        averagePrice: p.averagePrice,
        unrealizedPnl: p.unrealizedPnl,
        assetType: p.assetType,
      })),
    };
  },

  async getQuotes(ctx, symbols): Promise<Record<string, BrokerQuote>> {
    const { appKey, appSecret } = creds(ctx);
    return getQuotes(ctx.botId, appKey, appSecret, symbols);
  },

  async getPriceHistory(ctx, symbol): Promise<BrokerCandle[]> {
    const { appKey, appSecret } = creds(ctx);
    return getPriceHistory(ctx.botId, appKey, appSecret, symbol);
  },

  async getOptionChain(ctx, symbol, strikeCount = 10): Promise<BrokerOptionChain> {
    const { appKey, appSecret } = creds(ctx);
    return getOptionChain(ctx.botId, appKey, appSecret, symbol, strikeCount);
  },

  async placeOrder(ctx, order): Promise<BrokerOrderResult> {
    const { appKey, appSecret, accountHash } = creds(ctx);
    const result = await placeOrder(ctx.botId, appKey, appSecret, accountHash, order);
    return { orderId: result.orderId, status: result.status };
  },

  async getOrderStatus(ctx, orderId): Promise<BrokerOrderStatus> {
    const { appKey, appSecret, accountHash } = creds(ctx);
    const orders = await getOrders(ctx.botId, appKey, appSecret, accountHash);
    const found = orders.find(o => o.orderId === orderId);
    return { orderId, status: found?.status || "UNKNOWN", filledQuantity: found?.quantity || 0 };
  },

  async cancelOrder(ctx, orderId): Promise<void> {
    const { appKey, appSecret, accountHash } = creds(ctx);
    await cancelOrder(ctx.botId, appKey, appSecret, accountHash, orderId);
  },
};
