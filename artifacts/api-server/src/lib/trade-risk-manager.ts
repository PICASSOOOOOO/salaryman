import { db, botTradeStrategiesTable, botTradeLogTable, botTradingAccountsTable } from "@workspace/db";
import { eq, and, gte, sum } from "drizzle-orm";
import { cancelOrder, getOrders } from "./schwab-api";
import type { TradeSignal } from "./trading-strategies";
import { toUsd } from "./currency";

export interface RiskCheckResult {
  allowed: boolean;
  reason?: string;
}

export async function checkRisk(
  botId: number,
  strategyId: number,
  signal: TradeSignal
): Promise<RiskCheckResult> {
  const [strategy] = await db
    .select()
    .from(botTradeStrategiesTable)
    .where(and(eq(botTradeStrategiesTable.id, strategyId), eq(botTradeStrategiesTable.botId, botId)));

  if (!strategy) {
    return { allowed: false, reason: "Strategy config not found" };
  }

  if (strategy.killSwitch) {
    return { allowed: false, reason: "Kill switch is active — all trading halted" };
  }

  if (!strategy.enabled) {
    return { allowed: false, reason: "Strategy is disabled" };
  }

  if (signal.action === "HOLD") {
    return { allowed: false, reason: "Signal is HOLD — no trade" };
  }

  const [account] = await db
    .select()
    .from(botTradingAccountsTable)
    .where(eq(botTradingAccountsTable.botId, botId));

  if (account) {
    const dailyPnl = account.dailyPnl || 0;
    const equity = account.cachedEquity || 10000_00;

    if (dailyPnl < 0) {
      const dailyLossCents = Math.abs(dailyPnl);
      if (dailyLossCents >= strategy.maxDailyLoss * 100) {
        return { allowed: false, reason: `Max daily loss hit: $${(dailyLossCents / 100).toFixed(2)} >= $${strategy.maxDailyLoss}` };
      }
      const dailyLossPct = (dailyLossCents / equity) * 100;
      if (dailyLossPct >= strategy.maxDailyLossPercent) {
        return { allowed: false, reason: `Max daily loss % hit: ${dailyLossPct.toFixed(2)}% >= ${strategy.maxDailyLossPercent}%` };
      }
    }
  }

  const optSig = signal as typeof signal & { optionPremium?: number; strategyType?: string };
  const isOptionsStrategy = ["covered_calls", "iron_condors", "vertical_spreads", "straddles"].includes(optSig.strategyType ?? "");
  const unitCost = isOptionsStrategy
    ? (optSig.optionPremium ?? signal.suggestedPrice * 0.05)
    : signal.suggestedPrice;
  const contractMultiplier = isOptionsStrategy ? 100 : 1;
  const tradeCostCents = Math.round(unitCost * contractMultiplier * signal.suggestedQuantity * 100);
  if (tradeCostCents > strategy.maxPositionSize * 100) {
    return { allowed: false, reason: `Position size $${(tradeCostCents / 100).toFixed(2)} exceeds max $${strategy.maxPositionSize}` };
  }

  const openTrades = await db
    .select()
    .from(botTradeLogTable)
    .where(
      and(
        eq(botTradeLogTable.botId, botId),
        eq(botTradeLogTable.status, "open")
      )
    );

  if (openTrades.length >= strategy.maxConcurrentTrades) {
    return { allowed: false, reason: `Max concurrent trades hit: ${openTrades.length} >= ${strategy.maxConcurrentTrades}` };
  }

  return { allowed: true };
}

export interface CurrencyRiskContext {
  // Native currency code of the broker account (USD, JPY, VND, ...).
  currency: string;
  // Account equity in native minor-unit × 100 (cents convention).
  equityNativeCents: number;
  // Daily realized PnL in native minor-unit × 100, negative for a loss.
  dailyPnlNativeCents?: number;
  // Number of open trades already on this broker connection.
  openTradeCount?: number;
}

// Currency-aware risk gate for the multi-broker path. Strategy thresholds
// (maxDailyLoss, maxPositionSize) are denominated in USD, so native amounts are
// converted to USD before comparison. This lets one bot enforce a single,
// consistent risk policy across regional accounts in different currencies.
export async function checkRiskCurrencyAware(
  botId: number,
  strategyId: number,
  signal: TradeSignal,
  ctx: CurrencyRiskContext
): Promise<RiskCheckResult> {
  const [strategy] = await db
    .select()
    .from(botTradeStrategiesTable)
    .where(and(eq(botTradeStrategiesTable.id, strategyId), eq(botTradeStrategiesTable.botId, botId)));

  if (!strategy) return { allowed: false, reason: "Strategy config not found" };
  if (strategy.killSwitch) return { allowed: false, reason: "Kill switch is active — all trading halted" };
  if (!strategy.enabled) return { allowed: false, reason: "Strategy is disabled" };
  if (signal.action === "HOLD") return { allowed: false, reason: "Signal is HOLD — no trade" };

  const equityUsd = toUsd(ctx.equityNativeCents / 100, ctx.currency);

  const dailyPnlNative = ctx.dailyPnlNativeCents ?? 0;
  if (dailyPnlNative < 0) {
    const dailyLossUsd = toUsd(Math.abs(dailyPnlNative) / 100, ctx.currency);
    if (dailyLossUsd >= strategy.maxDailyLoss) {
      return { allowed: false, reason: `Max daily loss hit: $${dailyLossUsd.toFixed(2)} >= $${strategy.maxDailyLoss}` };
    }
    const dailyLossPct = equityUsd > 0 ? (dailyLossUsd / equityUsd) * 100 : 0;
    if (dailyLossPct >= strategy.maxDailyLossPercent) {
      return { allowed: false, reason: `Max daily loss % hit: ${dailyLossPct.toFixed(2)}% >= ${strategy.maxDailyLossPercent}%` };
    }
  }

  const optSig = signal as typeof signal & { optionPremium?: number; strategyType?: string };
  const isOptionsStrategy = ["covered_calls", "iron_condors", "vertical_spreads", "straddles"].includes(optSig.strategyType ?? "");
  const unitCost = isOptionsStrategy
    ? (optSig.optionPremium ?? signal.suggestedPrice * 0.05)
    : signal.suggestedPrice;
  const contractMultiplier = isOptionsStrategy ? 100 : 1;
  // suggestedPrice is in the account's native currency — convert the trade cost to USD.
  const tradeCostNative = unitCost * contractMultiplier * signal.suggestedQuantity;
  const tradeCostUsd = toUsd(tradeCostNative, ctx.currency);
  if (tradeCostUsd > strategy.maxPositionSize) {
    return { allowed: false, reason: `Position size $${tradeCostUsd.toFixed(2)} exceeds max $${strategy.maxPositionSize}` };
  }

  const openCount = ctx.openTradeCount ?? 0;
  if (openCount >= strategy.maxConcurrentTrades) {
    return { allowed: false, reason: `Max concurrent trades hit: ${openCount} >= ${strategy.maxConcurrentTrades}` };
  }

  return { allowed: true };
}

// Sum a set of native-currency account equities into a single USD portfolio
// total. Each entry is { equityNativeCents, currency }.
export function convertPortfolioTotalUsd(
  accounts: Array<{ equityNativeCents: number; currency: string }>
): number {
  return accounts.reduce((sum, a) => sum + toUsd(a.equityNativeCents / 100, a.currency), 0);
}

export async function activateKillSwitch(
  botId: number,
  appKey: string,
  appSecret: string
): Promise<{ cancelled: number; errors: string[] }> {
  const strategies = await db
    .select()
    .from(botTradeStrategiesTable)
    .where(eq(botTradeStrategiesTable.botId, botId));

  await db
    .update(botTradeStrategiesTable)
    .set({ killSwitch: true })
    .where(eq(botTradeStrategiesTable.botId, botId));

  const [account] = await db
    .select()
    .from(botTradingAccountsTable)
    .where(eq(botTradingAccountsTable.botId, botId));

  if (!account?.schwabAccountHash || account.isPaperMode) {
    return { cancelled: 0, errors: [] };
  }

  let cancelled = 0;
  const errors: string[] = [];

  try {
    const orders = await getOrders(botId, appKey, appSecret, account.schwabAccountHash);
    const openOrders = orders.filter(o => ["WORKING", "PENDING_ACTIVATION", "QUEUED"].includes(o.status));

    for (const order of openOrders) {
      try {
        await cancelOrder(botId, appKey, appSecret, account.schwabAccountHash, order.orderId);
        cancelled++;
      } catch (err) {
        errors.push(`Failed to cancel order ${order.orderId}: ${err}`);
      }
    }
  } catch (err) {
    errors.push(`Failed to fetch orders: ${err}`);
  }

  await db
    .update(botTradeLogTable)
    .set({ status: "killed" })
    .where(and(eq(botTradeLogTable.botId, botId), eq(botTradeLogTable.status, "open")));

  return { cancelled, errors };
}

export async function deactivateKillSwitch(botId: number): Promise<void> {
  await db
    .update(botTradeStrategiesTable)
    .set({ killSwitch: false })
    .where(eq(botTradeStrategiesTable.botId, botId));
}

export async function updateDailyPnl(botId: number): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result = await db
    .select({ total: sum(botTradeLogTable.pnl) })
    .from(botTradeLogTable)
    .where(
      and(
        eq(botTradeLogTable.botId, botId),
        gte(botTradeLogTable.createdAt, today)
      )
    );

  const total = Number(result[0]?.total ?? 0);

  await db
    .update(botTradingAccountsTable)
    .set({ dailyPnl: total })
    .where(eq(botTradingAccountsTable.botId, botId));

  return total;
}

export function computeStopLoss(entryPrice: number, stopLossPercent: number, side: "BUY" | "SELL"): number {
  if (side === "BUY") {
    return entryPrice * (1 - stopLossPercent / 100);
  }
  return entryPrice * (1 + stopLossPercent / 100);
}

export function shouldStopLoss(
  entryPrice: number,
  currentPrice: number,
  stopLossPercent: number,
  side: "BUY" | "SELL"
): boolean {
  const stopPrice = computeStopLoss(entryPrice, stopLossPercent, side);
  if (side === "BUY") return currentPrice <= stopPrice;
  return currentPrice >= stopPrice;
}

interface TradeWithPeak {
  id: number;
  side: string;
  entryPrice: number;
  quantity: number;
  peakPrice?: number | null;
}

export function enforceTrailingStop(
  trade: TradeWithPeak,
  currentPrice: number,
  trailingStopPercent: number
): boolean {
  if (trailingStopPercent <= 0) return false;

  const entryPrice = trade.entryPrice / 100;
  const side = trade.side as "BUY" | "SELL";

  const peakPrice = trade.peakPrice != null
    ? trade.peakPrice / 100
    : entryPrice;

  if (side === "BUY") {
    const trailingStop = peakPrice * (1 - trailingStopPercent / 100);
    return currentPrice <= trailingStop;
  } else {
    const trailingStop = peakPrice * (1 + trailingStopPercent / 100);
    return currentPrice >= trailingStop;
  }
}
