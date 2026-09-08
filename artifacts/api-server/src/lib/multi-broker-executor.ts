// Multi-broker strategy executor. Runs the same strategy runners as the legacy
// Schwab path (thinkorswim-connector.ts) but across every NON-Schwab broker
// connection a bot holds (Alpaca, IBKR, SSI, Japan, Europe). Schwab is handled
// by its dedicated path, so it is excluded here to avoid double-trading.
//
// Each connection trades in its own native currency and exchange. Live brokers
// (Alpaca) place real orders; paper-only brokers simulate fills. Per-trade
// broker/exchange attribution is stored in botTradeLogTable.signal (jsonb) so
// no schema change is needed.
import {
  db,
  botBrokerConnectionsTable,
  botTradeStrategiesTable,
  botTradeLogTable,
  type BrokerId,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { decryptCredentials } from "./bot-crypto";
import { getBrokerAdapter } from "./brokers/broker-registry";
import { getBrokerCatalogEntry } from "./brokers/broker-catalog";
import type { BrokerConnectionContext } from "./brokers/broker-types";
import { STRATEGY_RUNNERS } from "./trading-strategies";
import { checkRiskCurrencyAware } from "./trade-risk-manager";
import type { IncomingMessage } from "./bot-connectors";

// Options require option-chain data the paper/non-Schwab adapters don't model,
// so the multi-broker path runs equity strategies only.
const OPTIONS_STRATEGIES = new Set(["covered_calls", "iron_condors", "vertical_spreads", "straddles"]);

// Small per-exchange watchlists so non-US connections scan locally-relevant
// tickers. Market-data falls back to synthetic when no provider/native quote is
// available, so these work in paper mode for any region.
const MARKET_WATCHLISTS: Record<string, string[]> = {
  NYSE: ["SPY", "AAPL", "MSFT", "JPM", "KO"],
  NASDAQ: ["QQQ", "NVDA", "TSLA", "AMZN", "META"],
  LSE: ["HSBA", "BP", "SHEL", "VOD", "AZN"],
  EURONEXT: ["MC", "AIR", "OR", "SAN", "BNP"],
  XETRA: ["SAP", "SIE", "ALV", "BMW", "BAS"],
  TSE: ["7203", "6758", "9984", "8306", "6861"],
  HOSE: ["VIC", "VHM", "VCB", "HPG", "FPT"],
  HNX: ["SHS", "PVS", "CEO", "IDC", "MBS"],
  HKEX: ["0700", "9988", "0005", "1299", "3690"],
  SGX: ["D05", "O39", "U11", "Z74", "C6L"],
};

function watchlistForBroker(broker: BrokerId): string[] {
  const entry = getBrokerCatalogEntry(broker);
  const syms = new Set<string>();
  for (const market of entry.markets) {
    for (const s of MARKET_WATCHLISTS[market] ?? []) syms.add(s);
  }
  const list = [...syms];
  return list.length > 0 ? list : MARKET_WATCHLISTS.NASDAQ;
}

function buildContext(
  conn: typeof botBrokerConnectionsTable.$inferSelect,
): BrokerConnectionContext {
  let credentials: Record<string, string> = {};
  if (conn.encryptedCredentials) {
    try {
      credentials = JSON.parse(decryptCredentials(conn.encryptedCredentials)) as Record<string, string>;
    } catch {
      credentials = {};
    }
  }
  return {
    botId: conn.botId,
    connectionId: conn.id,
    userId: "",
    isPaperMode: conn.isPaperMode,
    currency: conn.currency,
    accountIdentifier: conn.accountIdentifier,
    credentials,
  };
}

export async function executeMultiBrokerSignals(
  botId: number,
  onMessage: (msg: IncomingMessage) => Promise<void>,
): Promise<void> {
  const connections = await db
    .select()
    .from(botBrokerConnectionsTable)
    .where(eq(botBrokerConnectionsTable.botId, botId));

  const tradable = connections.filter(c => c.broker !== "schwab" && c.status === "connected");
  if (tradable.length === 0) return;

  const strategies = await db
    .select()
    .from(botTradeStrategiesTable)
    .where(and(eq(botTradeStrategiesTable.botId, botId), eq(botTradeStrategiesTable.enabled, true)));
  const equityStrategies = strategies.filter(s => !OPTIONS_STRATEGIES.has(s.strategyType));
  if (equityStrategies.length === 0) return;

  // Count currently open trades once (shared concurrency budget across brokers).
  const openTrades = await db
    .select()
    .from(botTradeLogTable)
    .where(and(eq(botTradeLogTable.botId, botId), eq(botTradeLogTable.status, "open")));
  let openCount = openTrades.length;

  for (const conn of tradable) {
    const adapter = getBrokerAdapter(conn.broker as BrokerId);
    const ctx = buildContext(conn);
    const catalog = getBrokerCatalogEntry(conn.broker as BrokerId);
    const watchlist = watchlistForBroker(conn.broker as BrokerId);

    let quotes: Record<string, import("./brokers/broker-types").BrokerQuote> = {};
    try {
      quotes = await adapter.getQuotes(ctx, watchlist);
    } catch (err) {
      console.warn(`[MultiBroker Bot ${botId}] ${conn.broker} quote fetch failed:`, err);
      continue;
    }

    // Native equity for currency-aware risk (cached or live).
    let equityNativeCents = conn.cachedEquityNative ?? 0;
    try {
      const snap = await adapter.getAccount(ctx);
      equityNativeCents = snap.equity;
    } catch {
      // keep cached value
    }

    for (const strategy of equityStrategies) {
      const runner = STRATEGY_RUNNERS[strategy.strategyType];
      if (!runner) continue;

      for (const symbol of watchlist.slice(0, 3)) {
        const quote = quotes[symbol];
        if (!quote) continue;

        try {
          const candles = await adapter.getPriceHistory(ctx, symbol);
          const signal = runner(candles, quote, strategy.maxPositionSize * 100);
          if (signal.action === "HOLD" || signal.confidence < 0.6) continue;

          const riskResult = await checkRiskCurrencyAware(botId, strategy.id, signal, {
            currency: conn.currency,
            equityNativeCents,
            dailyPnlNativeCents: conn.dailyPnlNative,
            openTradeCount: openCount,
          });
          if (!riskResult.allowed) {
            console.log(`[MultiBroker Bot ${botId}] ${conn.broker} risk blocked ${symbol}: ${riskResult.reason}`);
            continue;
          }

          // Paper connections simulate; live brokers (Alpaca) place real orders.
          // The adapter itself enforces paper vs. live via ctx.isPaperMode.
          let fillPrice = signal.suggestedPrice;
          const result = await adapter.placeOrder(ctx, {
            symbol,
            side: signal.action as "BUY" | "SELL",
            quantity: signal.suggestedQuantity,
            orderType: "MARKET",
            assetType: "EQUITY",
          });
          const orderId = result.orderId;
          if (result.fillPrice) fillPrice = result.fillPrice;

          const signalData: Record<string, unknown> = {
            ...(signal as unknown as Record<string, unknown>),
            _broker: conn.broker,
            _exchange: catalog.markets[0] ?? null,
            _currency: conn.currency,
            _connectionId: conn.id,
          };

          await db.insert(botTradeLogTable).values({
            botId,
            strategyType: strategy.strategyType,
            symbol,
            side: signal.action,
            quantity: signal.suggestedQuantity,
            entryPrice: Math.round(fillPrice * 100),
            isPaper: conn.isPaperMode,
            status: "open",
            orderId,
            assetType: "EQUITY",
            signal: signalData,
          });
          openCount += 1;

          const modeTag = conn.isPaperMode ? "[PAPER]" : "[LIVE]";
          await onMessage({
            platform: "thinkorswim",
            externalUserId: "system",
            text: `[TRADE_EXECUTED] ${modeTag} [${conn.broker.toUpperCase()}/${catalog.markets[0] ?? "?"}] ${signal.action} ${signal.suggestedQuantity}x ${symbol} @ ${fillPrice.toFixed(2)} ${conn.currency} | Strategy: ${strategy.strategyType} | Confidence: ${(signal.confidence * 100).toFixed(0)}% | ${signal.reason}`,
          });
        } catch (err) {
          console.error(`[MultiBroker Bot ${botId}] ${conn.broker} strategy error for ${symbol}:`, err);
        }
      }
    }
  }
}
