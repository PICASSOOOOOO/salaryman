import type {
  BrokerAdapter, BrokerConnectionContext, BrokerId,
  BrokerQuote, BrokerCandle, BrokerAccountSnapshot, BrokerOrderResult, BrokerOrderStatus,
} from "./broker-types";
import { getQuotesWithFallback, getCandlesWithFallback } from "../market-data";
import { majorToCents } from "../currency";

export interface PaperAdapterConfig {
  broker: BrokerId;
  supportsOptions?: boolean;
  // Default paper cash in the account's major currency units.
  startingBalanceMajor?: number;
}

// A broker adapter that runs entirely in paper mode against the market-data
// layer (user provider → synthetic). Used for brokers that have no public
// trading API or require special institutional access (IBKR gateway, SSI/VPS,
// Rakuten/SBI, European venues). Live trading is unsupported by design.
export function createPaperAdapter(config: PaperAdapterConfig): BrokerAdapter {
  const startingMajor = config.startingBalanceMajor ?? 100_000;

  return {
    broker: config.broker,
    supportsLiveTrading: false,
    supportsOptions: config.supportsOptions ?? false,
    authType: "api_key",

    async getAccount(ctx: BrokerConnectionContext): Promise<BrokerAccountSnapshot> {
      const cash = ctx.accountIdentifier && ctx.credentials.cachedBalance
        ? parseInt(ctx.credentials.cachedBalance, 10)
        : majorToCents(startingMajor);
      return {
        accountIdentifier: ctx.accountIdentifier || `PAPER-${config.broker.toUpperCase()}`,
        currency: ctx.currency,
        cashBalance: cash,
        equity: cash,
        positions: [],
      };
    },

    async getQuotes(ctx, symbols): Promise<Record<string, BrokerQuote>> {
      const { quotes } = await getQuotesWithFallback(ctx.userId, symbols);
      return quotes;
    },

    async getPriceHistory(ctx, symbol): Promise<BrokerCandle[]> {
      const { candles } = await getCandlesWithFallback(ctx.userId, symbol);
      return candles;
    },

    async placeOrder(ctx, order): Promise<BrokerOrderResult> {
      const { quotes } = await getQuotesWithFallback(ctx.userId, [order.symbol]);
      const quote = quotes[order.symbol];
      const fillPrice = order.limitPrice ?? quote?.lastPrice ?? 0;
      return {
        orderId: `paper-${config.broker}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        status: "filled",
        fillPrice,
      };
    },

    async getOrderStatus(_ctx, orderId): Promise<BrokerOrderStatus> {
      return { orderId, status: "filled", filledQuantity: 0 };
    },

    async cancelOrder(): Promise<void> {
      // Paper orders fill immediately; nothing to cancel.
    },
  };
}
