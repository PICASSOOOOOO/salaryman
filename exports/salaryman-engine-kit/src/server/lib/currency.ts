// Currency helpers for multi-currency, multi-exchange trading. We are explicitly
// NOT building a live FX feed (out of scope). These are static, approximate
// reference rates expressed as "units of currency per 1 USD", overridable at
// runtime so a richer source can be plugged in later without touching callers.

export interface CurrencyMeta {
  code: string;
  symbol: string;
  // How many minor units make a major unit (USD=100 cents, JPY=1, VND=1).
  minorUnits: number;
  name: string;
}

export const CURRENCIES: Record<string, CurrencyMeta> = {
  USD: { code: "USD", symbol: "$", minorUnits: 100, name: "US Dollar" },
  EUR: { code: "EUR", symbol: "€", minorUnits: 100, name: "Euro" },
  GBP: { code: "GBP", symbol: "£", minorUnits: 100, name: "British Pound" },
  JPY: { code: "JPY", symbol: "¥", minorUnits: 1, name: "Japanese Yen" },
  VND: { code: "VND", symbol: "₫", minorUnits: 1, name: "Vietnamese Dong" },
  HKD: { code: "HKD", symbol: "HK$", minorUnits: 100, name: "Hong Kong Dollar" },
  CNY: { code: "CNY", symbol: "¥", minorUnits: 100, name: "Chinese Yuan" },
  AUD: { code: "AUD", symbol: "A$", minorUnits: 100, name: "Australian Dollar" },
  CAD: { code: "CAD", symbol: "C$", minorUnits: 100, name: "Canadian Dollar" },
  KRW: { code: "KRW", symbol: "₩", minorUnits: 1, name: "South Korean Won" },
  SGD: { code: "SGD", symbol: "S$", minorUnits: 100, name: "Singapore Dollar" },
  INR: { code: "INR", symbol: "₹", minorUnits: 100, name: "Indian Rupee" },
};

// Approximate units-per-USD. Override via TRADING_FX_RATES env (JSON) if desired.
const DEFAULT_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 157,
  VND: 25400,
  HKD: 7.8,
  CNY: 7.25,
  AUD: 1.52,
  CAD: 1.36,
  KRW: 1370,
  SGD: 1.35,
  INR: 83.3,
};

let cachedRates: Record<string, number> | null = null;

function rates(): Record<string, number> {
  if (cachedRates) return cachedRates;
  let merged = { ...DEFAULT_RATES };
  const override = process.env.TRADING_FX_RATES;
  if (override) {
    try {
      const parsed = JSON.parse(override) as Record<string, number>;
      merged = { ...merged, ...parsed };
    } catch {
      console.warn("[currency] TRADING_FX_RATES is not valid JSON — using defaults");
    }
  }
  cachedRates = merged;
  return merged;
}

export function setFxRates(custom: Record<string, number>): void {
  cachedRates = { ...rates(), ...custom };
}

export function minorUnitsFor(currency: string): number {
  return CURRENCIES[currency.toUpperCase()]?.minorUnits ?? 100;
}

export function currencySymbol(currency: string): string {
  return CURRENCIES[currency.toUpperCase()]?.symbol ?? currency.toUpperCase() + " ";
}

// Convert a major-unit amount between currencies via USD.
export function convert(amount: number, from: string, to: string): number {
  const r = rates();
  const fromRate = r[from.toUpperCase()];
  const toRate = r[to.toUpperCase()];
  if (!fromRate || !toRate) return amount; // unknown currency — pass through
  const usd = amount / fromRate;
  return usd * toRate;
}

export function toUsd(amount: number, from: string): number {
  return convert(amount, from, "USD");
}

// Format a major-unit amount with its currency symbol and sensible precision.
export function formatCurrency(amount: number, currency: string): string {
  const meta = CURRENCIES[currency.toUpperCase()];
  const decimals = meta && meta.minorUnits === 1 ? 0 : 2;
  const sym = currencySymbol(currency);
  return `${sym}${amount.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

// The "cents" convention used by trade tables stores major × 100 regardless of
// currency; convert that integer back to a major-unit float for display/FX.
export function centsToMajor(cents: number): number {
  return cents / 100;
}

export function majorToCents(major: number): number {
  return Math.round(major * 100);
}
