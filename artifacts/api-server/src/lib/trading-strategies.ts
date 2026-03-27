import type { SchwabCandle, SchwabQuote } from "./schwab-api";

export interface TradeSignal {
  action: "BUY" | "SELL" | "HOLD";
  symbol: string;
  confidence: number;
  suggestedQuantity: number;
  suggestedPrice: number;
  reason: string;
  strategyType: string;
  indicators: Record<string, number>;
}

function sma(candles: SchwabCandle[], period: number, field: "close" | "volume" = "close"): number {
  if (candles.length < period) return 0;
  const slice = candles.slice(-period);
  return slice.reduce((s, c) => s + c[field], 0) / period;
}

function ema(candles: SchwabCandle[], period: number): number {
  if (candles.length === 0) return 0;
  const k = 2 / (period + 1);
  let emaVal = candles[0].close;
  for (let i = 1; i < candles.length; i++) {
    emaVal = candles[i].close * k + emaVal * (1 - k);
  }
  return emaVal;
}

function rsi(candles: SchwabCandle[], period = 14): number {
  if (candles.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const rs = losses === 0 ? 100 : gains / losses;
  return 100 - 100 / (1 + rs);
}

interface MacdResult {
  macd: number;
  signal: number;
  histogram: number;
}

function macd(candles: SchwabCandle[], fast = 12, slow = 26, signal = 9): MacdResult {
  if (candles.length < slow + signal) return { macd: 0, signal: 0, histogram: 0 };
  const fastEma = ema(candles, fast);
  const slowEma = ema(candles, slow);
  const macdLine = fastEma - slowEma;

  const fakeMacdCandles: SchwabCandle[] = candles.slice(-slow).map((c, i) => ({
    ...c,
    close: ema(candles.slice(0, candles.length - slow + i + 1), fast) -
           ema(candles.slice(0, candles.length - slow + i + 1), slow),
  }));
  const signalLine = ema(fakeMacdCandles, signal);

  return {
    macd: macdLine,
    signal: signalLine,
    histogram: macdLine - signalLine,
  };
}

interface BollingerBands {
  upper: number;
  middle: number;
  lower: number;
}

function bollingerBands(candles: SchwabCandle[], period = 20, stdDevMult = 2): BollingerBands {
  if (candles.length < period) return { upper: 0, middle: 0, lower: 0 };
  const slice = candles.slice(-period);
  const middle = slice.reduce((s, c) => s + c.close, 0) / period;
  const variance = slice.reduce((s, c) => s + Math.pow(c.close - middle, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  return {
    upper: middle + stdDevMult * stdDev,
    middle,
    lower: middle - stdDevMult * stdDev,
  };
}

function vwap(candles: SchwabCandle[]): number {
  let totalVolume = 0;
  let totalPV = 0;
  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3;
    totalPV += typical * c.volume;
    totalVolume += c.volume;
  }
  return totalVolume === 0 ? 0 : totalPV / totalVolume;
}

function adx(candles: SchwabCandle[], period = 14): number {
  if (candles.length < period + 1) return 25;
  let posSum = 0;
  let negSum = 0;
  let trSum = 0;
  for (let i = Math.max(1, candles.length - period); i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevHigh = candles[i - 1].high;
    const prevLow = candles[i - 1].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    const pdm = high - prevHigh > prevLow - low ? Math.max(high - prevHigh, 0) : 0;
    const ndm = prevLow - low > high - prevHigh ? Math.max(prevLow - low, 0) : 0;
    trSum += tr;
    posSum += pdm;
    negSum += ndm;
  }
  if (trSum === 0) return 25;
  const di_pos = (posSum / trSum) * 100;
  const di_neg = (negSum / trSum) * 100;
  const dx = (Math.abs(di_pos - di_neg) / (di_pos + di_neg)) * 100;
  return dx;
}

function suggestSize(price: number, maxPositionSizeCents: number): number {
  if (price <= 0) return 1;
  const maxDollars = maxPositionSizeCents / 100;
  return Math.max(1, Math.floor(maxDollars / price));
}

export function swingTradingSignal(
  candles: SchwabCandle[],
  quote: SchwabQuote,
  maxPositionSizeCents: number
): TradeSignal {
  const sma20 = sma(candles, 20);
  const sma50 = sma(candles, 50);
  const rsi14 = rsi(candles, 14);
  const bb = bollingerBands(candles, 20);
  const price = quote.lastPrice;

  let action: "BUY" | "SELL" | "HOLD" = "HOLD";
  let confidence = 0.5;
  let reason = "No clear signal";

  if (sma20 > sma50 && rsi14 < 65 && rsi14 > 40 && price > sma20) {
    action = "BUY";
    confidence = 0.65 + (rsi14 < 55 ? 0.1 : 0);
    reason = `Bullish: SMA20 (${sma20.toFixed(2)}) > SMA50 (${sma50.toFixed(2)}), RSI ${rsi14.toFixed(1)} healthy`;
  } else if (sma20 < sma50 && rsi14 > 55 || price > bb.upper) {
    action = "SELL";
    confidence = 0.6;
    reason = price > bb.upper
      ? `Overbought: price above upper Bollinger Band (${bb.upper.toFixed(2)})`
      : `Bearish crossover: SMA20 < SMA50, RSI ${rsi14.toFixed(1)}`;
  } else if (rsi14 < 30 && price < bb.lower) {
    action = "BUY";
    confidence = 0.7;
    reason = `Oversold: RSI ${rsi14.toFixed(1)}, price near lower Bollinger Band (${bb.lower.toFixed(2)})`;
  }

  return {
    action,
    symbol: quote.symbol,
    confidence,
    suggestedQuantity: action !== "HOLD" ? suggestSize(price, maxPositionSizeCents) : 0,
    suggestedPrice: price,
    reason,
    strategyType: "swing_trading",
    indicators: { sma20, sma50, rsi14, bbUpper: bb.upper, bbLower: bb.lower },
  };
}

export function dayTradingSignal(
  candles: SchwabCandle[],
  quote: SchwabQuote,
  maxPositionSizeCents: number
): TradeSignal {
  const ema9 = ema(candles, 9);
  const ema20 = ema(candles, 20);
  const vwapPrice = vwap(candles);
  const volumeSma = sma(candles, 20, "volume");
  const currentVolume = candles.length > 0 ? candles[candles.length - 1].volume : 0;
  const price = quote.lastPrice;

  const volumeSpike = volumeSma > 0 && currentVolume > volumeSma * 1.5;

  let action: "BUY" | "SELL" | "HOLD" = "HOLD";
  let confidence = 0.5;
  let reason = "Waiting for setup";

  if (ema9 > ema20 && price > vwapPrice && volumeSpike) {
    action = "BUY";
    confidence = 0.72;
    reason = `Bullish: EMA9 > EMA20, price above VWAP (${vwapPrice.toFixed(2)}), volume spike (${(currentVolume / volumeSma).toFixed(1)}x)`;
  } else if (ema9 < ema20 && price < vwapPrice) {
    action = "SELL";
    confidence = 0.65;
    reason = `Bearish: EMA9 < EMA20, price below VWAP (${vwapPrice.toFixed(2)})`;
  }

  return {
    action,
    symbol: quote.symbol,
    confidence,
    suggestedQuantity: action !== "HOLD" ? suggestSize(price, maxPositionSizeCents) : 0,
    suggestedPrice: price,
    reason,
    strategyType: "day_trading",
    indicators: { ema9, ema20, vwap: vwapPrice, volumeRatio: volumeSma > 0 ? currentVolume / volumeSma : 1 },
  };
}

export function scalpingSignal(
  candles: SchwabCandle[],
  quote: SchwabQuote,
  maxPositionSizeCents: number
): TradeSignal {
  const price = quote.lastPrice;
  const spread = quote.askPrice - quote.bidPrice;
  const spreadPct = price > 0 ? spread / price : 1;
  const ema5 = ema(candles, 5);
  const ema10 = ema(candles, 10);
  const rsi5 = rsi(candles, 5);

  let action: "BUY" | "SELL" | "HOLD" = "HOLD";
  let confidence = 0.5;
  let reason = "Spread too wide or no signal";

  if (spreadPct > 0.003) {
    reason = `Spread too wide: ${(spreadPct * 100).toFixed(3)}% — skipping`;
  } else if (ema5 > ema10 && rsi5 > 50 && rsi5 < 70) {
    action = "BUY";
    confidence = 0.68;
    reason = `Micro-momentum BUY: EMA5 > EMA10, RSI5 ${rsi5.toFixed(1)}`;
  } else if (ema5 < ema10 || rsi5 > 75) {
    action = "SELL";
    confidence = 0.65;
    reason = `Scalp exit: EMA5 < EMA10 or RSI5 overbought (${rsi5.toFixed(1)})`;
  }

  return {
    action,
    symbol: quote.symbol,
    confidence,
    suggestedQuantity: action !== "HOLD" ? suggestSize(price, maxPositionSizeCents) * 2 : 0,
    suggestedPrice: action === "BUY" ? quote.askPrice : quote.bidPrice,
    reason,
    strategyType: "scalping",
    indicators: { ema5, ema10, rsi5, spreadPct: spreadPct * 100 },
  };
}

export function volumeTradingSignal(
  candles: SchwabCandle[],
  quote: SchwabQuote,
  maxPositionSizeCents: number
): TradeSignal {
  const price = quote.lastPrice;
  const vol20 = sma(candles, 20, "volume");
  const currentVol = candles.length > 0 ? candles[candles.length - 1].volume : quote.volume;
  const prev5High = Math.max(...candles.slice(-6, -1).map(c => c.high));
  const prev5Low = Math.min(...candles.slice(-6, -1).map(c => c.low));

  const volRatio = vol20 > 0 ? currentVol / vol20 : 1;
  const breakoutUp = price > prev5High && volRatio >= 2.0;
  const breakoutDown = price < prev5Low && volRatio >= 2.0;

  let action: "BUY" | "SELL" | "HOLD" = "HOLD";
  let confidence = 0.5;
  let reason = "No volume breakout detected";

  if (breakoutUp) {
    action = "BUY";
    confidence = 0.5 + Math.min(0.4, (volRatio - 2.0) * 0.1);
    reason = `Volume breakout UP: ${volRatio.toFixed(1)}x average, price broke ${prev5High.toFixed(2)}`;
  } else if (breakoutDown) {
    action = "SELL";
    confidence = 0.5 + Math.min(0.4, (volRatio - 2.0) * 0.1);
    reason = `Volume breakout DOWN: ${volRatio.toFixed(1)}x average, price broke ${prev5Low.toFixed(2)}`;
  }

  return {
    action,
    symbol: quote.symbol,
    confidence,
    suggestedQuantity: action !== "HOLD" ? suggestSize(price, maxPositionSizeCents) : 0,
    suggestedPrice: price,
    reason,
    strategyType: "volume_trading",
    indicators: { volRatio, prev5High, prev5Low },
  };
}

export function momentumTradingSignal(
  candles: SchwabCandle[],
  quote: SchwabQuote,
  maxPositionSizeCents: number
): TradeSignal {
  const price = quote.lastPrice;
  const m = macd(candles);
  const adxVal = adx(candles, 14);
  const roc = candles.length >= 12
    ? ((candles[candles.length - 1].close - candles[candles.length - 12].close) / candles[candles.length - 12].close) * 100
    : 0;

  let action: "BUY" | "SELL" | "HOLD" = "HOLD";
  let confidence = 0.5;
  let reason = "Insufficient momentum";

  if (m.histogram > 0 && m.macd > m.signal && adxVal > 25 && roc > 0) {
    action = "BUY";
    confidence = 0.6 + Math.min(0.25, adxVal / 100);
    reason = `Strong upward momentum: MACD bullish crossover, ADX ${adxVal.toFixed(1)}, ROC ${roc.toFixed(2)}%`;
  } else if (m.histogram < 0 && m.macd < m.signal && adxVal > 25 && roc < 0) {
    action = "SELL";
    confidence = 0.6 + Math.min(0.25, adxVal / 100);
    reason = `Strong downward momentum: MACD bearish, ADX ${adxVal.toFixed(1)}, ROC ${roc.toFixed(2)}%`;
  }

  return {
    action,
    symbol: quote.symbol,
    confidence,
    suggestedQuantity: action !== "HOLD" ? suggestSize(price, maxPositionSizeCents) : 0,
    suggestedPrice: price,
    reason,
    strategyType: "momentum_trading",
    indicators: { macd: m.macd, macdSignal: m.signal, macdHist: m.histogram, adx: adxVal, roc },
  };
}

export interface OptionsGreeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  impliedVolatility: number;
}

export interface OptionsSignal extends TradeSignal {
  optionSymbol?: string;
  strike?: number;
  expiry?: string;
  optionSide?: string;
  greeks?: { delta: number; gamma: number; theta: number; vega: number };
  optionPremium?: number;
}

export function coveredCallSignal(
  candles: SchwabCandle[],
  quote: SchwabQuote,
  maxPositionSizeCents: number,
  greeks?: OptionsGreeks
): OptionsSignal {
  const rsi14 = rsi(candles, 14);
  const price = quote.lastPrice;
  const bb = bollingerBands(candles, 20);

  const nearUpper = price > bb.middle && price < bb.upper * 0.97;
  const goodRsi = rsi14 > 50 && rsi14 < 70;

  let shouldWrite = nearUpper && goodRsi;
  let greeksNote = "";
  let greeksBoost = 0;

  if (greeks) {
    const absDelta = Math.abs(greeks.delta);
    const deltaOk = absDelta >= 0.15 && absDelta <= 0.35;
    const thetaOk = greeks.theta < -0.02;
    const ivOk = greeks.impliedVolatility >= 0.2;
    if (!deltaOk || !ivOk) {
      shouldWrite = false;
      greeksNote = ` Greeks rejected: delta=${absDelta.toFixed(2)} (need 0.15–0.35), IV=${(greeks.impliedVolatility * 100).toFixed(1)}% (need ≥20%)`;
    } else {
      greeksBoost = deltaOk && thetaOk ? 0.05 : 0;
      greeksNote = ` delta=${absDelta.toFixed(2)}, θ=${greeks.theta.toFixed(3)}, IV=${(greeks.impliedVolatility * 100).toFixed(1)}%`;
    }
  }

  return {
    action: shouldWrite ? "SELL" : "HOLD",
    symbol: quote.symbol,
    confidence: shouldWrite ? Math.min(0.95, 0.70 + greeksBoost) : 0.5,
    suggestedQuantity: shouldWrite ? Math.max(1, Math.floor(maxPositionSizeCents / 100 / price / 100)) : 0,
    suggestedPrice: price,
    reason: shouldWrite
      ? `Covered call opportunity: RSI ${rsi14.toFixed(1)}, price in upper Bollinger range${greeksNote}`
      : `Not ideal for covered calls right now${greeksNote}`,
    strategyType: "covered_calls",
    optionSide: "CALL",
    strike: Math.round(price * 1.03),
    optionPremium: greeks ? Math.max(0.05, Math.abs(greeks.delta) * price * 0.05) : price * 0.02,
    greeks: greeks ? { delta: greeks.delta, gamma: greeks.gamma, theta: greeks.theta, vega: greeks.vega } : undefined,
    indicators: { rsi14, bbUpper: bb.upper, bbMiddle: bb.middle, ...(greeks ? { delta: greeks.delta, iv: greeks.impliedVolatility } : {}) },
  };
}

export function ironCondorSignal(
  candles: SchwabCandle[],
  quote: SchwabQuote,
  greeks?: OptionsGreeks
): OptionsSignal {
  const bb = bollingerBands(candles, 20);
  const price = quote.lastPrice;
  const rsi14 = rsi(candles, 14);

  const lowVol = (bb.upper - bb.lower) / bb.middle < 0.08;
  const neutralRsi = rsi14 > 40 && rsi14 < 60;
  let goodCondor = lowVol && neutralRsi;
  let greeksNote = "";
  let greeksBoost = 0;

  if (greeks) {
    const absDelta = Math.abs(greeks.delta);
    const wingDeltaOk = absDelta <= 0.25;
    const lowIv = greeks.impliedVolatility >= 0.15 && greeks.impliedVolatility <= 0.35;
    if (!wingDeltaOk || !lowIv) {
      goodCondor = false;
      greeksNote = ` Greeks rejected: wing delta=${absDelta.toFixed(2)} (need ≤0.25), IV=${(greeks.impliedVolatility * 100).toFixed(1)}%`;
    } else {
      greeksBoost = 0.05;
      greeksNote = ` wing delta=${absDelta.toFixed(2)}, IV=${(greeks.impliedVolatility * 100).toFixed(1)}%`;
    }
  }

  return {
    action: goodCondor ? "BUY" : "HOLD",
    symbol: quote.symbol,
    confidence: goodCondor ? Math.min(0.95, 0.65 + greeksBoost) : 0.5,
    suggestedQuantity: 1,
    suggestedPrice: price,
    reason: goodCondor
      ? `Iron condor: BB width ${((bb.upper - bb.lower) / bb.middle * 100).toFixed(1)}%, RSI ${rsi14.toFixed(1)}${greeksNote}`
      : `Market conditions not suitable for iron condor${greeksNote}`,
    strategyType: "iron_condors",
    optionSide: "IRON_CONDOR",
    greeks: greeks ? { delta: greeks.delta, gamma: greeks.gamma, theta: greeks.theta, vega: greeks.vega } : undefined,
    indicators: { bbWidth: (bb.upper - bb.lower) / bb.middle * 100, rsi14, ...(greeks ? { delta: greeks.delta, iv: greeks.impliedVolatility } : {}) },
  };
}

export function verticalSpreadSignal(
  candles: SchwabCandle[],
  quote: SchwabQuote,
  greeks?: OptionsGreeks
): OptionsSignal {
  const m = macd(candles);
  const rsi14 = rsi(candles, 14);
  const price = quote.lastPrice;

  let action: "BUY" | "SELL" | "HOLD" = "HOLD";
  let side = "CALL";
  let reason = "No directional bias";
  let confidence = 0.5;

  if (m.histogram > 0 && rsi14 < 65) {
    action = "BUY";
    side = "CALL";
    reason = `Bull call spread: MACD bullish, RSI ${rsi14.toFixed(1)}`;
    confidence = 0.67;
  } else if (m.histogram < 0 && rsi14 > 45) {
    action = "BUY";
    side = "PUT";
    reason = `Bear put spread: MACD bearish, RSI ${rsi14.toFixed(1)}`;
    confidence = 0.67;
  }

  if (greeks && action !== "HOLD") {
    const absDelta = Math.abs(greeks.delta);
    const directionalDelta = absDelta >= 0.35 && absDelta <= 0.65;
    const vegarich = greeks.vega >= 0.05;
    if (!directionalDelta) {
      action = "HOLD";
      reason += ` — Greeks rejected: delta=${absDelta.toFixed(2)} (need 0.35–0.65 for directional spread)`;
      confidence = 0.5;
    } else {
      confidence = Math.min(0.95, confidence + (vegarich ? 0.05 : 0));
      reason += ` delta=${absDelta.toFixed(2)}, vega=${greeks.vega.toFixed(3)}`;
    }
  }

  return {
    action,
    symbol: quote.symbol,
    confidence,
    suggestedQuantity: 1,
    suggestedPrice: price,
    reason,
    strategyType: "vertical_spreads",
    optionSide: side,
    greeks: greeks ? { delta: greeks.delta, gamma: greeks.gamma, theta: greeks.theta, vega: greeks.vega } : undefined,
    indicators: { macdHist: m.histogram, rsi14, ...(greeks ? { delta: greeks.delta, vega: greeks.vega } : {}) },
  };
}

export function straddleSignal(
  candles: SchwabCandle[],
  quote: SchwabQuote,
  greeks?: OptionsGreeks
): OptionsSignal {
  const bb = bollingerBands(candles, 20);
  const price = quote.lastPrice;
  const adxVal = adx(candles, 14);

  const highVolatility = (bb.upper - bb.lower) / bb.middle > 0.12;
  const breakoutExpected = adxVal < 20;
  let goodStraddle = breakoutExpected || highVolatility;
  let greeksNote = "";
  let greeksBoost = 0;

  if (greeks) {
    const absDelta = Math.abs(greeks.delta);
    const balanced = absDelta <= 0.1;
    const highVega = greeks.vega >= 0.1;
    if (!balanced || !highVega) {
      goodStraddle = false;
      greeksNote = ` Greeks rejected: delta=${absDelta.toFixed(2)} (need ≤0.10 for balanced straddle), vega=${greeks.vega.toFixed(3)} (need ≥0.10)`;
    } else {
      greeksBoost = 0.05;
      greeksNote = ` delta=${absDelta.toFixed(2)}, vega=${greeks.vega.toFixed(3)}, IV=${(greeks.impliedVolatility * 100).toFixed(1)}%`;
    }
  }

  return {
    action: goodStraddle ? "BUY" : "HOLD",
    symbol: quote.symbol,
    confidence: goodStraddle ? Math.min(0.95, 0.65 + greeksBoost) : 0.5,
    suggestedQuantity: 1,
    suggestedPrice: price,
    reason: goodStraddle
      ? `Straddle: ADX ${adxVal.toFixed(1)}, BB width ${((bb.upper - bb.lower) / bb.middle * 100).toFixed(1)}%${greeksNote}`
      : `Straddle conditions not met${greeksNote}`,
    strategyType: "straddles",
    optionSide: "STRADDLE",
    greeks: greeks ? { delta: greeks.delta, gamma: greeks.gamma, theta: greeks.theta, vega: greeks.vega } : undefined,
    indicators: { adx: adxVal, bbWidth: (bb.upper - bb.lower) / bb.middle * 100, ...(greeks ? { vega: greeks.vega, iv: greeks.impliedVolatility } : {}) },
  };
}

export type StrategyRunner = (
  candles: SchwabCandle[],
  quote: SchwabQuote,
  maxPositionSizeCents: number,
  greeks?: OptionsGreeks
) => TradeSignal | OptionsSignal;

export const STRATEGY_RUNNERS: Record<string, StrategyRunner> = {
  swing_trading: swingTradingSignal,
  day_trading: dayTradingSignal,
  scalping: scalpingSignal,
  volume_trading: volumeTradingSignal,
  momentum_trading: momentumTradingSignal,
  covered_calls: coveredCallSignal,
  iron_condors: (c, q, _max, g) => ironCondorSignal(c, q, g),
  vertical_spreads: (c, q, _max, g) => verticalSpreadSignal(c, q, g),
  straddles: (c, q, _max, g) => straddleSignal(c, q, g),
};
