import type { PlatformConnector, IncomingMessage, OutgoingMessage } from "./bot-connectors";
import { decryptCredentials } from "./bot-crypto";
import {
  getQuotes, getPriceHistory, isMarketOpen, getAccounts,
  getOptionChain, selectNearestATMOption, selectOptionAtStrike, placeOrder, placeOptionsOrder,
  type SchwabCredentials, type SchwabOptionChain, type OptionsOrderLeg,
} from "./schwab-api";
import { STRATEGY_RUNNERS } from "./trading-strategies";
import type { OptionsSignal, OptionsGreeks } from "./trading-strategies";
import { checkRisk, updateDailyPnl, shouldStopLoss, enforceTrailingStop } from "./trade-risk-manager";
import { executeMultiBrokerSignals } from "./multi-broker-executor";
import {
  db, botTradingAccountsTable, botTradeStrategiesTable, botTradeLogTable, botScheduledTasksTable,
  type BotTradingAccount,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

const DEFAULT_WATCHLIST = ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "META"];

const OPTIONS_STRATEGIES = new Set(["covered_calls", "iron_condors", "vertical_spreads", "straddles"]);

interface ActiveTradingBot {
  stop: () => void;
  onMessage: (msg: IncomingMessage) => Promise<void>;
  creds: SchwabCredentials;
  account: BotTradingAccount | null;
}

const activeBots = new Map<number, ActiveTradingBot>();

function parseCreds(encrypted: string): SchwabCredentials {
  const plain = decryptCredentials(encrypted);
  const parsed = JSON.parse(plain) as { appKey: string; appSecret: string };
  return { appKey: parsed.appKey, appSecret: parsed.appSecret };
}

interface MultiLegOrderSpec {
  legs: OptionsOrderLeg[];
  label: string;
  entryPrice: number;
  orderType: "MARKET" | "NET_DEBIT" | "NET_CREDIT";
}

function buildMultiLegOrder(
  strategyType: string,
  chain: SchwabOptionChain,
  quantity: number,
  signalOptionSide?: string
): MultiLegOrderSpec | null {
  const underlying = chain.underlyingPrice;
  const atmCall = selectNearestATMOption(chain, "CALL", 7, 45);
  const atmPut = selectNearestATMOption(chain, "PUT", 7, 45);
  if (!atmCall || !atmPut) return null;

  const width = Math.round(underlying * 0.03);

  if (strategyType === "iron_condors") {
    const shortCallStrike = Math.round(underlying * 1.04);
    const longCallStrike = shortCallStrike + width;
    const shortPutStrike = Math.round(underlying * 0.96);
    const longPutStrike = shortPutStrike - width;

    const shortCall = selectOptionAtStrike(chain, "CALL", shortCallStrike, 7, 45);
    const longCall = selectOptionAtStrike(chain, "CALL", longCallStrike, 7, 45);
    const shortPut = selectOptionAtStrike(chain, "PUT", shortPutStrike, 7, 45);
    const longPut = selectOptionAtStrike(chain, "PUT", longPutStrike, 7, 45);

    if (!shortCall || !longCall || !shortPut || !longPut) return null;

    const netCredit = ((shortCall.bid + shortPut.bid) - (longCall.ask + longPut.ask));

    return {
      legs: [
        { instruction: "SELL_TO_OPEN", quantity, symbol: shortCall.symbol },
        { instruction: "BUY_TO_OPEN", quantity, symbol: longCall.symbol },
        { instruction: "SELL_TO_OPEN", quantity, symbol: shortPut.symbol },
        { instruction: "BUY_TO_OPEN", quantity, symbol: longPut.symbol },
      ],
      label: `IC ${shortPut.strikePrice}/${shortCall.strikePrice} ±${width}`,
      entryPrice: netCredit,
      orderType: "NET_CREDIT",
    };
  }

  if (strategyType === "vertical_spreads") {
    const isBullCall = signalOptionSide !== "PUT";
    if (isBullCall) {
      const longCallStrike = atmCall.strikePrice;
      const shortCallStrike = longCallStrike + width;
      const shortCall = selectOptionAtStrike(chain, "CALL", shortCallStrike, 7, 45);
      if (!shortCall) return null;
      const debit = atmCall.ask - shortCall.bid;
      return {
        legs: [
          { instruction: "BUY_TO_OPEN", quantity, symbol: atmCall.symbol },
          { instruction: "SELL_TO_OPEN", quantity, symbol: shortCall.symbol },
        ],
        label: `Bull Call ${longCallStrike}/${shortCallStrike}`,
        entryPrice: debit,
        orderType: "NET_DEBIT",
      };
    } else {
      const longPutStrike = atmPut.strikePrice;
      const shortPutStrike = longPutStrike - width;
      const shortPut = selectOptionAtStrike(chain, "PUT", shortPutStrike, 7, 45);
      if (!shortPut) return null;
      const debit = atmPut.ask - shortPut.bid;
      return {
        legs: [
          { instruction: "BUY_TO_OPEN", quantity, symbol: atmPut.symbol },
          { instruction: "SELL_TO_OPEN", quantity, symbol: shortPut.symbol },
        ],
        label: `Bear Put ${longPutStrike}/${shortPutStrike}`,
        entryPrice: debit,
        orderType: "NET_DEBIT",
      };
    }
  }

  if (strategyType === "straddles") {
    const debit = atmCall.ask + atmPut.ask;
    return {
      legs: [
        { instruction: "BUY_TO_OPEN", quantity, symbol: atmCall.symbol },
        { instruction: "BUY_TO_OPEN", quantity, symbol: atmPut.symbol },
      ],
      label: `Straddle ${atmCall.strikePrice}`,
      entryPrice: debit,
      orderType: "NET_DEBIT",
    };
  }

  return null;
}

async function executeStrategySignals(
  botId: number,
  creds: SchwabCredentials,
  account: BotTradingAccount,
  onMessage: (msg: IncomingMessage) => Promise<void>
): Promise<void> {
  const strategies = await db
    .select()
    .from(botTradeStrategiesTable)
    .where(and(eq(botTradeStrategiesTable.botId, botId), eq(botTradeStrategiesTable.enabled, true)));

  const allowExtendedHours = strategies.some(s =>
    (s.parameters as Record<string, unknown>)?.allowExtendedHours === true
  );
  if (!isMarketOpen() && !allowExtendedHours) return;

  if (strategies.length === 0) return;

  const watchlist = DEFAULT_WATCHLIST;

  const quotes = await getQuotes(botId, creds.appKey, creds.appSecret, watchlist);

  for (const strategy of strategies) {
    const runner = STRATEGY_RUNNERS[strategy.strategyType];
    if (!runner) continue;

    for (const symbol of watchlist.slice(0, 3)) {
      const quote = quotes[symbol];
      if (!quote) continue;

      try {
        const candles = await getPriceHistory(botId, creds.appKey, creds.appSecret, symbol, "day", 1, "minute", 5);

        const isOptionsStrategy = OPTIONS_STRATEGIES.has(strategy.strategyType);

        let atmGreeks: OptionsGreeks | undefined;
        if (isOptionsStrategy) {
          try {
            const chain = await getOptionChain(botId, creds.appKey, creds.appSecret, symbol, 5);
            const contractSide = strategy.strategyType === "covered_calls" ? "CALL" : "CALL";
            const atm = selectNearestATMOption(chain, contractSide, 7, 45);
            if (atm) {
              atmGreeks = {
                delta: atm.delta,
                gamma: atm.gamma,
                theta: atm.theta,
                vega: atm.vega,
                impliedVolatility: atm.impliedVolatility,
              };
            }
          } catch (err) {
            console.warn(`[ThinkorSwim Bot ${botId}] Option chain greeks fetch failed for ${symbol} (proceeding without greeks):`, err);
          }
        }

        const signal = runner(candles, quote, strategy.maxPositionSize * 100, atmGreeks);
        if (signal.action === "HOLD" || signal.confidence < 0.6) continue;

        const riskResult = await checkRisk(botId, strategy.id, signal);
        if (!riskResult.allowed) {
          console.log(`[ThinkorSwim Bot ${botId}] Risk blocked ${symbol}: ${riskResult.reason}`);
          continue;
        }

        let orderId: string | undefined;
        let executedSymbol = symbol;
        let executedPrice = signal.suggestedPrice;
        let openLegs: OptionsOrderLeg[] | undefined;

        const MULTILEG_STRATEGIES = new Set(["iron_condors", "vertical_spreads", "straddles"]);
        let tradeAssetType: "EQUITY" | "OPTION" = isOptionsStrategy ? "OPTION" : "EQUITY";

        if (isOptionsStrategy) {
          const optSignal = signal as OptionsSignal;
          const isMultiLeg = MULTILEG_STRATEGIES.has(strategy.strategyType);

          if (!account.isPaperMode && account.schwabAccountHash) {
            try {
              const chain = await getOptionChain(botId, creds.appKey, creds.appSecret, symbol, 5);

              if (isMultiLeg) {
                const optSide = (signal as OptionsSignal).optionSide;
                const spec = buildMultiLegOrder(strategy.strategyType, chain, signal.suggestedQuantity, optSide);
                if (!spec) {
                  await onMessage({ platform: "thinkorswim", externalUserId: "system",
                    text: `[TRADE_SKIPPED] ${strategy.strategyType} ${symbol}: Could not build multi-leg order — insufficient option chain data` });
                  continue;
                }
                const result = await placeOptionsOrder(botId, creds.appKey, creds.appSecret,
                  account.schwabAccountHash, spec.legs, spec.orderType, spec.entryPrice > 0 ? spec.entryPrice : undefined);
                orderId = result.orderId;
                executedSymbol = `${symbol} ${spec.label}`;
                executedPrice = Math.abs(spec.entryPrice);
                openLegs = spec.legs;
              } else {
                if (strategy.strategyType === "covered_calls") {
                  const accounts = await getAccounts(botId, creds.appKey, creds.appSecret);
                  const matched = accounts.find(a => a.accountHash === account.schwabAccountHash);
                  const sharesHeld = matched?.positions.find(p => p.symbol === symbol && p.assetType === "EQUITY")?.quantity ?? 0;
                  const requiredShares = signal.suggestedQuantity * 100;
                  if (sharesHeld < requiredShares) {
                    await onMessage({ platform: "thinkorswim", externalUserId: "system",
                      text: `[TRADE_SKIPPED] covered_calls ${symbol}: Need ${requiredShares} shares, account holds ${sharesHeld}. Covered call requires underlying share ownership.` });
                    console.log(`[ThinkorSwim Bot ${botId}] Covered call skipped for ${symbol}: ${sharesHeld}/${requiredShares} shares held`);
                    continue;
                  }
                }
                const contractSide = optSignal.optionSide === "PUT" ? "PUT" : "CALL";
                const contract = selectNearestATMOption(chain, contractSide, 7, 45);
                if (!contract) {
                  await onMessage({ platform: "thinkorswim", externalUserId: "system",
                    text: `[TRADE_SKIPPED] ${strategy.strategyType} ${symbol}: No suitable ATM contract found` });
                  continue;
                }
                const instruction = signal.action === "BUY" ? "BUY_TO_OPEN" : "SELL_TO_OPEN";
                const singleLeg: OptionsOrderLeg = { instruction, quantity: signal.suggestedQuantity, symbol: contract.symbol };
                const result = await placeOptionsOrder(botId, creds.appKey, creds.appSecret,
                  account.schwabAccountHash, [singleLeg], "MARKET");
                orderId = result.orderId;
                executedSymbol = contract.symbol;
                executedPrice = (contract.bid + contract.ask) / 2;
                openLegs = [singleLeg];
              }
            } catch (err) {
              console.error(`[ThinkorSwim Bot ${botId}] Options order failed for ${symbol}:`, err);
              await onMessage({ platform: "thinkorswim", externalUserId: "system",
                text: `[TRADE_ERROR] Failed to place ${strategy.strategyType} order for ${symbol}: ${err}` });
              continue;
            }
          } else {
            // Paper mode: still select real option contracts + quote for realistic simulation
            try {
              const chain = await getOptionChain(botId, creds.appKey, creds.appSecret, symbol, 5);

              if (isMultiLeg) {
                const optSide = optSignal.optionSide;
                const spec = buildMultiLegOrder(strategy.strategyType, chain, signal.suggestedQuantity, optSide);
                if (spec) {
                  executedSymbol = `${symbol} ${spec.label} [PAPER]`;
                  executedPrice = Math.abs(spec.entryPrice);
                  openLegs = spec.legs;
                } else {
                  executedSymbol = `${symbol} ${strategy.strategyType.replace("_", "-")} paper`;
                }
              } else {
                const contractSide = optSignal.optionSide === "PUT" ? "PUT" : "CALL";
                const contract = selectNearestATMOption(chain, contractSide, 7, 45);
                if (contract) {
                  const instruction = signal.action === "BUY" ? "BUY_TO_OPEN" : "SELL_TO_OPEN";
                  const singleLeg: OptionsOrderLeg = { instruction, quantity: signal.suggestedQuantity, symbol: contract.symbol };
                  executedSymbol = contract.symbol;
                  executedPrice = (contract.bid + contract.ask) / 2;
                  openLegs = [singleLeg];
                } else if (optSignal.optionSide && optSignal.strike) {
                  executedSymbol = `${symbol} ${optSignal.optionSide} ${optSignal.strike} [PAPER]`;
                }
              }
            } catch (chainErr) {
              console.warn(`[ThinkorSwim Bot ${botId}] Paper options chain fetch failed for ${symbol}; using estimate:`, chainErr);
              if (isMultiLeg) {
                executedSymbol = `${symbol} ${strategy.strategyType.replace("_", "-")} paper`;
              } else if (optSignal.optionSide && optSignal.strike) {
                executedSymbol = `${symbol} ${optSignal.optionSide} ${optSignal.strike} [PAPER]`;
              }
            }
            orderId = `paper-opts-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          }
        } else {
          if (!account.isPaperMode && account.schwabAccountHash) {
            try {
              const result = await placeOrder(botId, creds.appKey, creds.appSecret, account.schwabAccountHash, {
                symbol,
                side: signal.action as "BUY" | "SELL",
                quantity: signal.suggestedQuantity,
                orderType: "MARKET",
                assetType: "EQUITY",
              });
              orderId = result.orderId;
            } catch (err) {
              console.error(`[ThinkorSwim Bot ${botId}] Equity order placement failed:`, err);
              await onMessage({
                platform: "thinkorswim",
                externalUserId: "system",
                text: `[TRADE_ERROR] Failed to place ${signal.action} order for ${symbol}: ${err}`,
              });
              continue;
            }
          } else {
            orderId = `paper-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          }
        }

        const entryPriceCents = Math.round(executedPrice * 100);
        const signalData: Record<string, unknown> = { ...(signal as unknown as Record<string, unknown>) };
        if (openLegs) signalData._openLegs = openLegs;

        await db.insert(botTradeLogTable).values({
          botId,
          strategyType: strategy.strategyType,
          symbol: executedSymbol,
          side: signal.action,
          quantity: signal.suggestedQuantity,
          entryPrice: entryPriceCents,
          isPaper: account.isPaperMode,
          status: "open",
          orderId,
          assetType: tradeAssetType,
          signal: signalData,
        });

        const modeTag = account.isPaperMode ? "[PAPER]" : "[LIVE]";
        const assetTag = isOptionsStrategy ? `[OPTION]` : `[EQUITY]`;
        await onMessage({
          platform: "thinkorswim",
          externalUserId: "system",
          text: `[TRADE_EXECUTED] ${modeTag} ${assetTag} ${signal.action} ${signal.suggestedQuantity}x ${executedSymbol} @ $${executedPrice.toFixed(2)} | Strategy: ${strategy.strategyType} | Confidence: ${(signal.confidence * 100).toFixed(0)}% | ${signal.reason}`,
        });
      } catch (err) {
        console.error(`[ThinkorSwim Bot ${botId}] Strategy error for ${symbol}:`, err);
      }
    }
  }
}

async function checkOpenPositions(
  botId: number,
  creds: SchwabCredentials,
  account: BotTradingAccount,
  onMessage: (msg: IncomingMessage) => Promise<void>
): Promise<void> {
  const openTrades = await db
    .select()
    .from(botTradeLogTable)
    .where(and(eq(botTradeLogTable.botId, botId), eq(botTradeLogTable.status, "open")));

  if (openTrades.length === 0) return;

  const equityTrades = openTrades.filter(t => t.assetType !== "OPTION");
  const optionTrades = openTrades.filter(t => t.assetType === "OPTION");

  const underlyingSymbols = [
    ...new Set([
      ...equityTrades.map(t => t.symbol),
      ...optionTrades.map(t => t.symbol.split(" ")[0]),
    ]),
  ];
  const equityQuotes: Record<string, import("./schwab-api").SchwabQuote> = underlyingSymbols.length > 0
    ? await getQuotes(botId, creds.appKey, creds.appSecret, underlyingSymbols).catch(() => ({}))
    : {};

  const singleLegOptionSymbols = optionTrades
    .filter(t => {
      const legs = (t.signal as Record<string, unknown>)?._openLegs as OptionsOrderLeg[] | undefined;
      return legs?.length === 1;
    })
    .map(t => {
      const legs = (t.signal as Record<string, unknown>)?._openLegs as OptionsOrderLeg[];
      return legs[0].symbol;
    });
  const optionQuotes: Record<string, import("./schwab-api").SchwabQuote> = singleLegOptionSymbols.length > 0
    ? await getQuotes(botId, creds.appKey, creds.appSecret, singleLegOptionSymbols).catch(() => ({}))
    : {};

  const strategies = await db
    .select()
    .from(botTradeStrategiesTable)
    .where(eq(botTradeStrategiesTable.botId, botId));

  const strategyMap = new Map(strategies.map(s => [s.strategyType, s]));

  for (const trade of openTrades) {
    const underlyingSymbol = trade.symbol.split(" ")[0];
    const strategy = strategyMap.get(trade.strategyType);
    const stopLossPct = strategy?.stopLossPercent ?? 2;
    const trailingStopPct = strategy?.trailingStopPercent ?? 0;

    const entryPrice = trade.entryPrice / 100;
    let currentPrice: number;

    if (trade.assetType === "OPTION") {
      const persistedLegs = (trade.signal as Record<string, unknown>)?._openLegs as OptionsOrderLeg[] | undefined;
      if (persistedLegs && persistedLegs.length === 1) {
        const optQuote = optionQuotes[persistedLegs[0].symbol];
        currentPrice = optQuote ? (optQuote.bidPrice + optQuote.askPrice) / 2 : entryPrice;
      } else if (persistedLegs && persistedLegs.length > 1) {
        const bidAskMids = await Promise.all(
          persistedLegs.map(async leg => {
            const legQuotes: Record<string, import("./schwab-api").SchwabQuote> = await getQuotes(botId, creds.appKey, creds.appSecret, [leg.symbol]).catch(() => ({}));
            const q = legQuotes[leg.symbol];
            if (!q) return 0;
            const isSell = leg.instruction === "SELL_TO_OPEN";
            return isSell ? q.bidPrice : -q.askPrice;
          })
        );
        currentPrice = Math.abs(bidAskMids.reduce((sum: number, v: number) => sum + v, 0));
        if (currentPrice === 0) currentPrice = entryPrice;
      } else {
        const underlyingQuote = equityQuotes[underlyingSymbol];
        currentPrice = underlyingQuote ? underlyingQuote.lastPrice : entryPrice;
      }
    } else {
      const quote = equityQuotes[trade.symbol];
      if (!quote) continue;
      currentPrice = quote.lastPrice;
    }

    const currentPriceCents = Math.round(currentPrice * 100);

    if (trailingStopPct > 0) {
      const isBuy = trade.side === "BUY";
      const existingPeak = trade.peakPrice ?? trade.entryPrice;
      const newPeak = isBuy
        ? Math.max(existingPeak, currentPriceCents)
        : Math.min(existingPeak, currentPriceCents);
      if (newPeak !== existingPeak) {
        await db.update(botTradeLogTable)
          .set({ peakPrice: newPeak })
          .where(eq(botTradeLogTable.id, trade.id));
        trade.peakPrice = newPeak;
      }
    }

    const hitStop = shouldStopLoss(entryPrice, currentPrice, stopLossPct, trade.side as "BUY" | "SELL");

    const hitTrailing = trailingStopPct > 0
      ? enforceTrailingStop(trade, currentPrice, trailingStopPct)
      : false;

    const contractMultiplier = trade.assetType === "OPTION" ? 100 : 1;
    const pnlCents = trade.side === "BUY"
      ? Math.round((currentPrice - entryPrice) * trade.quantity * contractMultiplier * 100)
      : Math.round((entryPrice - currentPrice) * trade.quantity * contractMultiplier * 100);

    const takeProfitHit = pnlCents > 0 && pnlCents >= (trade.entryPrice * trade.quantity * contractMultiplier * 0.02);

    if (hitStop || hitTrailing || takeProfitHit) {
      const closeReason = hitStop ? "STOP-LOSS" : hitTrailing ? "TRAILING-STOP" : "TAKE-PROFIT";
      let closedSuccessfully = account.isPaperMode;

      if (!account.isPaperMode && account.schwabAccountHash) {
        try {
          const isOption = trade.assetType === "OPTION";
          if (isOption) {
            const persistedLegs = (trade.signal as Record<string, unknown>)?._openLegs as OptionsOrderLeg[] | undefined;
            if (persistedLegs && persistedLegs.length > 0) {
              const closeLegs: OptionsOrderLeg[] = persistedLegs.map(leg => ({
                ...leg,
                instruction: leg.instruction === "BUY_TO_OPEN" ? "SELL_TO_CLOSE" : "BUY_TO_CLOSE",
              }));
              await placeOptionsOrder(botId, creds.appKey, creds.appSecret, account.schwabAccountHash,
                closeLegs, "MARKET");
            } else {
              const instruction = trade.side === "BUY" ? "SELL_TO_CLOSE" : "BUY_TO_CLOSE";
              await placeOptionsOrder(
                botId,
                creds.appKey,
                creds.appSecret,
                account.schwabAccountHash,
                [{ instruction, quantity: trade.quantity, symbol: trade.symbol }],
                "MARKET"
              );
            }
          } else {
            const closeSide = trade.side === "BUY" ? "SELL" : "BUY";
            await placeOrder(botId, creds.appKey, creds.appSecret, account.schwabAccountHash, {
              symbol: trade.symbol,
              side: closeSide as "BUY" | "SELL",
              quantity: trade.quantity,
              orderType: "MARKET",
              assetType: "EQUITY",
            });
          }
          closedSuccessfully = true;
        } catch (err) {
          console.error(`[ThinkorSwim Bot ${botId}] Close order failed for trade ${trade.id}:`, err);
          await onMessage({
            platform: "thinkorswim",
            externalUserId: "system",
            text: `[TRADE_ERROR] ${closeReason} triggered for ${trade.symbol} but close order failed: ${err}. Manual intervention required.`,
          });
        }
      }

      if (closedSuccessfully) {
        await db.update(botTradeLogTable).set({
          status: "closed",
          exitPrice: Math.round(currentPrice * 100),
          pnl: pnlCents,
          closedAt: new Date(),
        }).where(eq(botTradeLogTable.id, trade.id));

        await updateDailyPnl(botId);

        const modeTag = account.isPaperMode ? "[PAPER]" : "[LIVE]";
        await onMessage({
          platform: "thinkorswim",
          externalUserId: "system",
          text: `[TRADE_CLOSED] ${modeTag} ${closeReason}: ${trade.side} ${trade.quantity}x ${trade.symbol} | Entry: $${entryPrice.toFixed(2)} | Exit: $${currentPrice.toFixed(2)} | P&L: ${pnlCents >= 0 ? '+' : ''}$${(pnlCents / 100).toFixed(2)}`,
        });
      }
    }
  }
}

export const thinkorswimConnector: PlatformConnector = {
  platform: "thinkorswim",

  async start(botId, encryptedCredentials, onMessage) {
    if (activeBots.has(botId)) return;

    let creds: SchwabCredentials;
    try {
      creds = parseCreds(encryptedCredentials);
    } catch (err) {
      throw new Error(`Invalid thinkorswim credentials: ${err}`);
    }

    const [account] = await db
      .select()
      .from(botTradingAccountsTable)
      .where(eq(botTradingAccountsTable.botId, botId));

    await db
      .insert(botScheduledTasksTable)
      .values({
        botId,
        cronExpression: "*/5 * * * *",
        taskDescription: "[TRADING_SCAN] Execute strategy signals and check open positions",
        enabled: true,
      })
      .onConflictDoUpdate({
        target: [botScheduledTasksTable.botId, botScheduledTasksTable.taskDescription],
        set: { enabled: true, cronExpression: "*/5 * * * *" },
      });

    activeBots.set(botId, { stop: () => {}, onMessage, creds, account: account ?? null });
  },

  async stop(botId) {
    const entry = activeBots.get(botId);
    if (entry) {
      entry.stop();
      activeBots.delete(botId);
    }
  },

  async send(botId, _externalUserId, message: OutgoingMessage) {
    // [TRADING_SCAN] is dispatched by the scheduler framework (bot-engine.ts) to trigger
    // strategy execution on schedule. All other messages are intentionally discarded:
    // thinkorswim has no external chat channel and calling onMessage() from here would
    // re-enter the bot engine, creating a feedback loop.
    if (message.text === "[TRADING_SCAN]") {
      const entry = activeBots.get(botId);
      if (!entry) return;

      // Multi-broker path: trade every NON-Schwab connection (Alpaca, IBKR, SSI,
      // Japan, Europe). Runs independently of the legacy Schwab account so a bot
      // can operate globally even without Schwab connected.
      try {
        await executeMultiBrokerSignals(botId, entry.onMessage);
      } catch (err) {
        console.error(`[MultiBroker Bot ${botId}] scan error:`, err);
      }

      // Legacy Schwab path (unchanged).
      const [freshAccount] = await db
        .select()
        .from(botTradingAccountsTable)
        .where(eq(botTradingAccountsTable.botId, botId));

      if (!freshAccount) {
        console.log(`[ThinkorSwim Bot ${botId}] Schwab scan skipped: no Schwab account configured.`);
        return;
      }

      if (!freshAccount.encryptedAccessToken) {
        console.log(`[ThinkorSwim Bot ${botId}] Schwab scan skipped: Schwab OAuth not yet completed. Authorize at Settings → Trading → Connect Schwab.`);
        return;
      }

      await executeStrategySignals(botId, entry.creds, freshAccount, entry.onMessage);
      await checkOpenPositions(botId, entry.creds, freshAccount, entry.onMessage);
    }
  },

  isActive(botId) {
    return activeBots.has(botId);
  },
};
