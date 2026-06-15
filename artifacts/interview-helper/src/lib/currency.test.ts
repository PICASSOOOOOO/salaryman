// @vitest-environment jsdom
//
// Currency display layer: persistence, region-based default detection, and
// USD→currency conversion/formatting. This is the real-world money DISPLAY
// preference (mirrors the language setting) — it must never be confused with
// in-game ƒ/Gold or Stripe charges, but those are out of this module's scope.
import { describe, it, expect, beforeEach, vi } from "vitest";

const KEY = "sm_currency";

async function fresh() {
  vi.resetModules();
  return await import("./currency");
}

beforeEach(() => {
  localStorage.clear();
});

describe("getCurrency / setCurrency persistence", () => {
  it("persists the chosen currency to localStorage and reads it back", async () => {
    const c = await fresh();
    c.setCurrency("EUR");
    expect(localStorage.getItem(KEY)).toBe("EUR");

    const c2 = await fresh(); // simulate a reload
    expect(c2.getCurrency()).toBe("EUR");
  });

  it("ignores unknown currency codes", async () => {
    const c = await fresh();
    c.setCurrency("EUR");
    c.setCurrency("ZZZ" as any);
    expect(c.getCurrency()).toBe("EUR");
  });

  it("dispatches a change event so displays can react live", async () => {
    const c = await fresh();
    const spy = vi.fn();
    window.addEventListener(c.CURRENCY_CHANGED_EVENT, spy);
    c.setCurrency("JPY");
    expect(spy).toHaveBeenCalledTimes(1);
    window.removeEventListener(c.CURRENCY_CHANGED_EVENT, spy);
  });
});

describe("detectDefaultCurrency", () => {
  function withLanguage(lang: string, fn: () => void | Promise<void>) {
    const orig = Object.getOwnPropertyDescriptor(navigator, "language");
    const origs = Object.getOwnPropertyDescriptor(navigator, "languages");
    Object.defineProperty(navigator, "language", { value: lang, configurable: true });
    Object.defineProperty(navigator, "languages", { value: [lang], configurable: true });
    const restore = () => {
      if (orig) Object.defineProperty(navigator, "language", orig);
      if (origs) Object.defineProperty(navigator, "languages", origs);
    };
    return Promise.resolve(fn()).finally(restore);
  }

  it("maps common locales to the right currency", async () => {
    const c = await fresh();
    await withLanguage("en-GB", () => expect(c.detectDefaultCurrency()).toBe("GBP"));
    await withLanguage("ja-JP", () => expect(c.detectDefaultCurrency()).toBe("JPY"));
    await withLanguage("de-DE", () => expect(c.detectDefaultCurrency()).toBe("EUR"));
    await withLanguage("vi-VN", () => expect(c.detectDefaultCurrency()).toBe("VND"));
    await withLanguage("ko-KR", () => expect(c.detectDefaultCurrency()).toBe("KRW"));
  });

  it("falls back to USD for unknown/unsupported regions", async () => {
    const c = await fresh();
    await withLanguage("en-US", () => expect(c.detectDefaultCurrency()).toBe("USD"));
    await withLanguage("xx-ZZ", () => expect(c.detectDefaultCurrency()).toBe("USD"));
  });

  it("uses the detected default when nothing is stored", async () => {
    await withLanguage("en-GB", async () => {
      const c = await fresh();
      expect(c.getCurrency()).toBe("GBP");
    });
  });
});

describe("conversion & formatting", () => {
  it("USD is identity", async () => {
    const c = await fresh();
    expect(c.convertFromUsd(100, "USD")).toBe(100);
    expect(c.formatFromUsd(100, { code: "USD" })).toBe("$100");
  });

  it("converts USD into the target currency via the static rate", async () => {
    const c = await fresh();
    const eur = c.getCurrencyInfo("EUR").ratePerUsd;
    expect(c.convertFromUsd(100, "EUR")).toBeCloseTo(100 * eur, 6);
  });

  it("formats large amounts with no decimals and the right symbol", async () => {
    const c = await fresh();
    const jpy = c.getCurrencyInfo("JPY").ratePerUsd;
    const expected = `¥${(50000 * jpy).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    expect(c.formatFromUsd(50000, { code: "JPY" })).toBe(expected);
  });

  it("uses the active currency when no code is passed", async () => {
    const c = await fresh();
    c.setCurrency("GBP");
    const gbp = c.getCurrencyInfo("GBP").ratePerUsd;
    expect(c.convertFromUsd(10)).toBeCloseTo(10 * gbp, 6);
  });

  it("returns a dash for non-finite input", async () => {
    const c = await fresh();
    expect(c.formatFromUsd(Infinity, { code: "USD" })).toBe("—");
  });
});
