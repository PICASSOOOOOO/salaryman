import type { DataCandle, DataQuote, Fundamentals, NewsItem } from "./market-data";

// Deep, multi-factor market analysis: technicals (price action) + fundamentals
// (valuation) + news sentiment (lexicon, no external dep) + a light macro read,
// combined into one per-symbol object with a human-readable summary and the
// rationale behind each factor so Pablo/Mila can explain the call.

export interface FactorScore {
  // -100 (very bearish) .. +100 (very bullish)
  score: number;
  rationale: string[];
}

export interface SymbolAnalysis {
  symbol: string;
  currency: string;
  lastPrice: number;
  technical: FactorScore;
  fundamental: FactorScore;
  sentiment: FactorScore;
  macro: FactorScore;
  overallScore: number; // weighted blend, -100..+100
  bias: "bullish" | "bearish" | "neutral";
  confidence: number;   // 0..100
  summary: string;
  indicators: Record<string, number>;
}

function smaOf(values: number[], period: number): number {
  if (values.length < period) return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function rsiOf(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses += Math.abs(diff);
  }
  const rs = losses === 0 ? 100 : gains / losses;
  return 100 - 100 / (1 + rs);
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function analyzeTechnicals(candles: DataCandle[]): FactorScore & { indicators: Record<string, number> } {
  const rationale: string[] = [];
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  if (closes.length < 5) {
    return { score: 0, rationale: ["Insufficient price history for technical analysis"], indicators: {} };
  }
  const last = closes[closes.length - 1];
  const smaFast = smaOf(closes, 10);
  const smaSlow = smaOf(closes, 30);
  const rsi = rsiOf(closes);
  const volStd = stdDev(closes.slice(-20));
  const volatilityPct = last ? (volStd / last) * 100 : 0;
  const recentVol = smaOf(volumes, 5);
  const baseVol = smaOf(volumes, 20);
  const volSurge = baseVol ? recentVol / baseVol : 1;

  let score = 0;

  if (smaFast > smaSlow) {
    score += 30;
    rationale.push(`Uptrend: 10-period SMA (${smaFast.toFixed(2)}) above 30-period SMA (${smaSlow.toFixed(2)})`);
  } else if (smaFast < smaSlow) {
    score -= 30;
    rationale.push(`Downtrend: 10-period SMA (${smaFast.toFixed(2)}) below 30-period SMA (${smaSlow.toFixed(2)})`);
  }

  if (rsi < 30) {
    score += 25;
    rationale.push(`Oversold: RSI ${rsi.toFixed(0)} (< 30) — potential bounce`);
  } else if (rsi > 70) {
    score -= 25;
    rationale.push(`Overbought: RSI ${rsi.toFixed(0)} (> 70) — pullback risk`);
  } else {
    rationale.push(`Neutral momentum: RSI ${rsi.toFixed(0)}`);
  }

  const momentum = closes.length >= 6 ? ((last - closes[closes.length - 6]) / closes[closes.length - 6]) * 100 : 0;
  if (momentum > 1) { score += 15; rationale.push(`Positive short-term momentum (+${momentum.toFixed(2)}%)`); }
  else if (momentum < -1) { score -= 15; rationale.push(`Negative short-term momentum (${momentum.toFixed(2)}%)`); }

  if (volSurge > 1.5) {
    rationale.push(`Volume surge: recent volume ${volSurge.toFixed(1)}× the 20-period average`);
    score += score >= 0 ? 10 : -10; // volume confirms the prevailing direction
  }

  score = Math.max(-100, Math.min(100, score));
  return {
    score,
    rationale,
    indicators: {
      smaFast: Math.round(smaFast * 100) / 100,
      smaSlow: Math.round(smaSlow * 100) / 100,
      rsi: Math.round(rsi),
      momentumPct: Math.round(momentum * 100) / 100,
      volatilityPct: Math.round(volatilityPct * 100) / 100,
      volumeSurge: Math.round(volSurge * 100) / 100,
    },
  };
}

export function analyzeFundamentals(f: Fundamentals | null): FactorScore {
  if (!f) return { score: 0, rationale: ["No fundamental data available"] };
  const rationale: string[] = [];
  let score = 0;
  let factors = 0;

  if (typeof f.peRatio === "number" && f.peRatio > 0) {
    factors++;
    if (f.peRatio < 15) { score += 25; rationale.push(`Attractive valuation: P/E ${f.peRatio.toFixed(1)} (< 15)`); }
    else if (f.peRatio > 40) { score -= 25; rationale.push(`Rich valuation: P/E ${f.peRatio.toFixed(1)} (> 40)`); }
    else rationale.push(`Fair valuation: P/E ${f.peRatio.toFixed(1)}`);
  }
  if (typeof f.eps === "number") {
    factors++;
    if (f.eps > 0) { score += 15; rationale.push(`Profitable: positive EPS (${f.eps.toFixed(2)})`); }
    else { score -= 20; rationale.push(`Unprofitable: negative EPS (${f.eps.toFixed(2)})`); }
  }
  if (typeof f.dividendYield === "number" && f.dividendYield > 0) {
    factors++;
    score += 10;
    rationale.push(`Pays a dividend (yield ${(f.dividendYield * (f.dividendYield < 1 ? 100 : 1)).toFixed(2)}%)`);
  }
  if (typeof f.beta === "number") {
    factors++;
    if (f.beta > 1.5) rationale.push(`High beta ${f.beta.toFixed(2)} — amplified market moves`);
    else if (f.beta < 0.8) rationale.push(`Low beta ${f.beta.toFixed(2)} — defensive`);
  }

  if (factors === 0) return { score: 0, rationale: ["No usable fundamental metrics"] };
  return { score: Math.max(-100, Math.min(100, score)), rationale };
}

const POSITIVE_WORDS = [
  "beat", "beats", "surge", "surges", "soar", "soars", "rally", "rallies", "gain", "gains", "jump", "jumps",
  "record", "growth", "profit", "profits", "upgrade", "upgraded", "outperform", "bullish", "strong", "boost",
  "rise", "rises", "win", "wins", "approval", "approved", "expand", "expansion", "optimistic", "breakthrough",
];
const NEGATIVE_WORDS = [
  "miss", "misses", "plunge", "plunges", "drop", "drops", "fall", "falls", "slump", "loss", "losses", "decline",
  "declines", "downgrade", "downgraded", "underperform", "bearish", "weak", "cut", "cuts", "lawsuit", "probe",
  "investigation", "recall", "warn", "warning", "warns", "bankruptcy", "fraud", "layoff", "layoffs", "crash",
];

export function analyzeSentiment(news: NewsItem[]): FactorScore {
  if (!news || news.length === 0) return { score: 0, rationale: ["No recent news"] };
  let pos = 0, neg = 0;
  for (const item of news) {
    const text = `${item.title} ${item.summary ?? ""}`.toLowerCase();
    for (const w of POSITIVE_WORDS) if (text.includes(w)) pos++;
    for (const w of NEGATIVE_WORDS) if (text.includes(w)) neg++;
  }
  const total = pos + neg;
  const rationale: string[] = [`Scanned ${news.length} recent headline(s): ${pos} positive / ${neg} negative signal word(s)`];
  if (total === 0) return { score: 0, rationale: [...rationale, "Headlines read as neutral"] };
  const score = Math.max(-100, Math.min(100, Math.round(((pos - neg) / total) * 100)));
  if (score > 20) rationale.push("Net positive news sentiment");
  else if (score < -20) rationale.push("Net negative news sentiment");
  else rationale.push("Mixed news sentiment");
  return { score, rationale };
}

export function analyzeMacro(currency: string, marketName?: string): FactorScore {
  // We deliberately keep macro light (no live macro feed in scope): contextual,
  // currency/region-aware framing rather than a numeric forecast.
  const rationale: string[] = [];
  if (marketName) rationale.push(`Listed on ${marketName}`);
  rationale.push(`Returns realized in ${currency}; FX moves affect USD-equivalent performance`);
  return { score: 0, rationale };
}

export interface AnalyzeSymbolInput {
  symbol: string;
  currency: string;
  quote?: DataQuote;
  candles: DataCandle[];
  fundamentals?: Fundamentals | null;
  news?: NewsItem[];
  marketName?: string;
}

export function analyzeSymbol(input: AnalyzeSymbolInput): SymbolAnalysis {
  const tech = analyzeTechnicals(input.candles);
  const fundamental = analyzeFundamentals(input.fundamentals ?? null);
  const sentiment = analyzeSentiment(input.news ?? []);
  const macro = analyzeMacro(input.currency, input.marketName);

  // Technicals lead for an automated trader; fundamentals and sentiment refine.
  const overallScore = Math.round(
    tech.score * 0.5 + fundamental.score * 0.25 + sentiment.score * 0.25
  );
  const bias: SymbolAnalysis["bias"] = overallScore > 15 ? "bullish" : overallScore < -15 ? "bearish" : "neutral";
  const confidence = Math.min(100, Math.abs(overallScore) + (tech.rationale.length + sentiment.rationale.length) * 2);

  const lastPrice = input.quote?.lastPrice ?? input.candles[input.candles.length - 1]?.close ?? 0;
  const summary = `${input.symbol}: ${bias.toUpperCase()} (score ${overallScore}, confidence ${confidence}). `
    + `Technicals ${tech.score >= 0 ? "+" : ""}${tech.score}, fundamentals ${fundamental.score >= 0 ? "+" : ""}${fundamental.score}, sentiment ${sentiment.score >= 0 ? "+" : ""}${sentiment.score}.`;

  return {
    symbol: input.symbol,
    currency: input.currency,
    lastPrice,
    technical: { score: tech.score, rationale: tech.rationale },
    fundamental,
    sentiment,
    macro,
    overallScore,
    bias,
    confidence,
    summary,
    indicators: tech.indicators,
  };
}
