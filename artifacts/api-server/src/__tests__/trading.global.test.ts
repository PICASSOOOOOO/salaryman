import { describe, it, expect } from "vitest";

import {
  convert, toUsd, formatCurrency, centsToMajor, majorToCents,
  currencySymbol, setFxRates, minorUnitsFor,
} from "../lib/currency";
import { analyzeTechnicals, analyzeFundamentals, analyzeSentiment, analyzeMacro, analyzeSymbol } from "../lib/market-analysis";
import { evaluateSymbol, rankHits, screen } from "../lib/screener";
import { getBrokerAdapter, hasBrokerAdapter, listBrokerAdapters } from "../lib/brokers/broker-registry";
import { listBrokerCatalog, getBrokerCatalogEntry } from "../lib/brokers/broker-catalog";
import type { SchwabCandle, SchwabQuote } from "../lib/schwab-api";

// ── fixtures ──────────────────────────────────────────────────────────
function risingCandles(n = 40, start = 100, step = 1, volume = 1000): SchwabCandle[] {
  return Array.from({ length: n }, (_, i) => {
    const close = start + i * step;
    return { datetime: i, open: close - 0.5, high: close + 1, low: close - 1, close, volume };
  });
}
function fallingCandles(n = 40, start = 140, step = 1, volume = 1000): SchwabCandle[] {
  return Array.from({ length: n }, (_, i) => {
    const close = start - i * step;
    return { datetime: i, open: close + 0.5, high: close + 1, low: close - 1, close, volume };
  });
}
function quoteFor(symbol: string, lastPrice: number): SchwabQuote {
  return { symbol, lastPrice, bidPrice: lastPrice - 0.1, askPrice: lastPrice + 0.1, volume: 1000, openPrice: lastPrice, highPrice: lastPrice + 1, lowPrice: lastPrice - 1, closePrice: lastPrice, change: 0, percentChange: 0 };
}

describe("currency", () => {
  it("converts via USD and is symmetric", () => {
    const eur = convert(100, "USD", "EUR");
    expect(eur).toBeCloseTo(92, 0);
    expect(convert(eur, "EUR", "USD")).toBeCloseTo(100, 4);
  });

  it("toUsd matches convert to USD", () => {
    expect(toUsd(157, "JPY")).toBeCloseTo(convert(157, "JPY", "USD"), 6);
    expect(toUsd(157, "JPY")).toBeCloseTo(1, 1);
  });

  it("passes through unknown currencies", () => {
    expect(convert(50, "USD", "XYZ")).toBe(50);
    expect(convert(50, "XYZ", "USD")).toBe(50);
  });

  it("formats with the right symbol and precision", () => {
    expect(formatCurrency(1234.5, "USD")).toBe("$1,234.50");
    // JPY/VND have minorUnits 1 → no decimals.
    expect(formatCurrency(1234, "JPY")).toBe("¥1,234");
    expect(currencySymbol("VND")).toBe("₫");
    expect(minorUnitsFor("JPY")).toBe(1);
    expect(minorUnitsFor("USD")).toBe(100);
  });

  it("cents convention is currency-agnostic (major × 100)", () => {
    expect(centsToMajor(123456)).toBe(1234.56);
    expect(majorToCents(1234.56)).toBe(123456);
  });

  it("setFxRates overrides a rate", () => {
    setFxRates({ EUR: 2 });
    expect(convert(100, "USD", "EUR")).toBeCloseTo(200, 4);
    setFxRates({ EUR: 0.92 }); // restore for other tests
    expect(convert(100, "USD", "EUR")).toBeCloseTo(92, 0);
  });
});

describe("market analysis — technicals", () => {
  it("scores a clean uptrend bullish", () => {
    const t = analyzeTechnicals(risingCandles());
    expect(t.score).toBeGreaterThan(0);
    expect(t.rationale.join(" ")).toMatch(/Uptrend/i);
  });
  it("scores a clean downtrend bearish", () => {
    const t = analyzeTechnicals(fallingCandles());
    expect(t.score).toBeLessThan(0);
    expect(t.rationale.join(" ")).toMatch(/Downtrend/i);
  });
  it("handles insufficient history without throwing", () => {
    const t = analyzeTechnicals(risingCandles(2));
    expect(t.score).toBe(0);
  });
});

describe("market analysis — fundamentals", () => {
  it("rewards a cheap, profitable, dividend payer", () => {
    const f = analyzeFundamentals({ symbol: "X", peRatio: 10, eps: 5, dividendYield: 0.03 });
    expect(f.score).toBeGreaterThan(0);
  });
  it("penalizes a rich, unprofitable name", () => {
    const f = analyzeFundamentals({ symbol: "Y", peRatio: 80, eps: -2 });
    expect(f.score).toBeLessThan(0);
  });
  it("returns neutral with no data", () => {
    expect(analyzeFundamentals(null).score).toBe(0);
  });
});

describe("market analysis — sentiment", () => {
  it("reads positive headlines bullish", () => {
    const s = analyzeSentiment([
      { title: "Company beats earnings, raises guidance, record profit surge" },
      { title: "Analysts upgrade on strong growth and bullish outlook" },
    ]);
    expect(s.score).toBeGreaterThan(0);
  });
  it("reads negative headlines bearish", () => {
    const s = analyzeSentiment([
      { title: "Company misses estimates, cuts guidance amid weak demand" },
      { title: "Downgrade on lawsuit, plunging sales and layoffs" },
    ]);
    expect(s.score).toBeLessThan(0);
  });
  it("is neutral with no news", () => {
    expect(analyzeSentiment([]).score).toBe(0);
  });
});

describe("market analysis — macro + blend", () => {
  it("macro is currency/region aware", () => {
    const m = analyzeMacro("VND", "HOSE");
    expect(m.rationale.join(" ")).toMatch(/HOSE/);
    expect(m.rationale.join(" ")).toMatch(/VND/);
  });
  it("analyzeSymbol blends factors into a bias", () => {
    const a = analyzeSymbol({
      symbol: "AAPL", currency: "USD",
      quote: quoteFor("AAPL", 139),
      candles: risingCandles(),
      fundamentals: { symbol: "AAPL", peRatio: 12, eps: 6, dividendYield: 0.01 },
      news: [{ title: "record profit surge and bullish upgrade" }],
      marketName: "NASDAQ",
    });
    expect(a.bias).toBe("bullish");
    expect(a.overallScore).toBeGreaterThan(15);
    expect(a.confidence).toBeGreaterThan(0);
    expect(a.lastPrice).toBe(139);
    expect(a.currency).toBe("USD");
  });
});

describe("screener", () => {
  it("flags a volume surge", () => {
    const candles = risingCandles(40, 100, 1, 1000);
    candles[candles.length - 1].volume = 5000; // last bar spikes
    const hits = evaluateSymbol("AAPL", quoteFor("AAPL", 139), candles, { market: "NASDAQ", currency: "USD" });
    expect(hits.some(h => h.signalType === "volume_surge")).toBe(true);
  });
  it("flags an uptrend breakout", () => {
    const hits = evaluateSymbol("MSFT", quoteFor("MSFT", 139), risingCandles(), {});
    expect(hits.some(h => h.signalType === "breakout" || h.signalType === "momentum_up")).toBe(true);
  });
  it("returns nothing on too-short history", () => {
    expect(evaluateSymbol("X", undefined, risingCandles(3), {})).toHaveLength(0);
  });
  it("rankHits sorts by score desc and respects limit", () => {
    const ranked = rankHits([
      { symbol: "A", lastPrice: 1, signalType: "breakout", score: 30, detail: "", indicators: {} },
      { symbol: "B", lastPrice: 1, signalType: "breakout", score: 90, detail: "", indicators: {} },
      { symbol: "C", lastPrice: 1, signalType: "breakout", score: 60, detail: "", indicators: {} },
    ], 2);
    expect(ranked.map(h => h.symbol)).toEqual(["B", "C"]);
  });
  it("screen() aggregates and ranks across symbols", () => {
    const hits = screen([
      { symbol: "UP", candles: risingCandles(), quote: quoteFor("UP", 139) },
      { symbol: "DOWN", candles: fallingCandles(), quote: quoteFor("DOWN", 101) },
    ]);
    expect(hits.length).toBeGreaterThan(0);
    for (let i = 1; i < hits.length; i++) expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score);
  });
});

describe("broker registry + catalog", () => {
  it("knows the required brokers", () => {
    for (const id of ["schwab", "alpaca", "ibkr", "ssi", "japan", "europe"]) {
      expect(hasBrokerAdapter(id)).toBe(true);
      expect(getBrokerAdapter(id as any).broker).toBe(id);
    }
  });
  it("rejects unknown brokers", () => {
    expect(hasBrokerAdapter("robinhood")).toBe(false);
  });
  it("lists adapters and a catalog", () => {
    expect(listBrokerAdapters().length).toBeGreaterThanOrEqual(6);
    const catalog = listBrokerCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(6);
    // Vietnam coverage present somewhere.
    expect(catalog.some(c => c.markets.some(m => /HOSE|HNX/.test(m)) || c.defaultCurrency === "VND")).toBe(true);
  });
  it("paper-only brokers cannot trade live", () => {
    const ssi = getBrokerCatalogEntry("ssi");
    expect(ssi.paperOnly).toBe(true);
    expect(getBrokerAdapter("ssi").supportsLiveTrading).toBe(false);
  });
  it("alpaca exposes setup fields and live capability", () => {
    const alpaca = getBrokerCatalogEntry("alpaca");
    expect(alpaca.setupFields.length).toBeGreaterThan(0);
    expect(alpaca.setupFields.some(f => f.type === "password")).toBe(true);
    expect(alpaca.supportsLiveTrading).toBe(true);
  });
});

describe("paper broker fills (DB-free via empty userId)", () => {
  const ctx = { userId: "", credentials: {} as Record<string, string>, accountIdentifier: "", currency: "USD", isPaperMode: true } as any;

  it("fills a limit order at the limit price", async () => {
    const adapter = getBrokerAdapter("ssi");
    const result = await adapter.placeOrder(ctx, { symbol: "FPT", side: "BUY", quantity: 10, orderType: "LIMIT", limitPrice: 90 } as any);
    expect(result.status).toBe("filled");
    expect(result.fillPrice).toBe(90);
    expect(result.orderId).toContain("paper");
  });

  it("returns a paper account snapshot in the account currency", async () => {
    const adapter = getBrokerAdapter("japan");
    const snap = await adapter.getAccount({ ...ctx, currency: "JPY" });
    expect(snap.currency).toBe("JPY");
    expect(snap.cashBalance).toBeGreaterThan(0);
    expect(snap.equity).toBe(snap.cashBalance);
  });
});
