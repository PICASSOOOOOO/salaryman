// ── Real-world currency display layer ────────────────────────────────────────
// Mirrors the language selector (i18n/index.ts): a persisted user preference
// (localStorage key + change event) that controls how real-world fiat money
// figures are SHOWN to the player. This is display/representation only — it
// never changes what Stripe actually charges or any in-game currency (ƒ / Gold
// / BTC keep their own symbols).
//
// Rates are anchored to USD, the native unit of the real-estate market index
// (`/api/real-estate/market-index` reports BTC in USD). That same endpoint now
// also returns live USD→currency FX rates (`fx`), which this module consumes via
// `setLiveRates` when available; the static table below is the fallback used
// until (or if) live rates arrive. If a code is missing entirely we fall back to
// USD (rate 1).

export interface CurrencyInfo {
  code: string;        // ISO 4217 code, e.g. "USD"
  symbol: string;      // display symbol, e.g. "$"
  name: string;        // English name
  flag: string;        // emoji flag for the picker
  ratePerUsd: number;  // how many units of this currency 1 USD buys (static fallback)
  decimals: number;    // fraction digits for small amounts
}

// Static USD→currency fallback rates. Anchored to USD = 1. These are coarse
// reference rates; the figures here are a readout, not a settlement price.
export const SUPPORTED_CURRENCIES: CurrencyInfo[] = [
  { code: 'USD', symbol: '$',   name: 'US Dollar',        flag: '🇺🇸', ratePerUsd: 1,      decimals: 2 },
  { code: 'EUR', symbol: '€',   name: 'Euro',             flag: '🇪🇺', ratePerUsd: 0.92,   decimals: 2 },
  { code: 'GBP', symbol: '£',   name: 'British Pound',    flag: '🇬🇧', ratePerUsd: 0.79,   decimals: 2 },
  { code: 'JPY', symbol: '¥',   name: 'Japanese Yen',     flag: '🇯🇵', ratePerUsd: 157,    decimals: 0 },
  { code: 'CNY', symbol: 'CN¥', name: 'Chinese Yuan',     flag: '🇨🇳', ratePerUsd: 7.2,    decimals: 2 },
  { code: 'KRW', symbol: '₩',   name: 'Korean Won',       flag: '🇰🇷', ratePerUsd: 1350,   decimals: 0 },
  { code: 'VND', symbol: '₫',   name: 'Vietnamese Dong',  flag: '🇻🇳', ratePerUsd: 25000,  decimals: 0 },
  { code: 'INR', symbol: '₹',   name: 'Indian Rupee',     flag: '🇮🇳', ratePerUsd: 83,     decimals: 2 },
  { code: 'BRL', symbol: 'R$',  name: 'Brazilian Real',   flag: '🇧🇷', ratePerUsd: 5.4,    decimals: 2 },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar',  flag: '🇨🇦', ratePerUsd: 1.36,   decimals: 2 },
  { code: 'AUD', symbol: 'A$',  name: 'Australian Dollar',flag: '🇦🇺', ratePerUsd: 1.50,   decimals: 2 },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso',     flag: '🇲🇽', ratePerUsd: 18,     decimals: 2 },
  { code: 'CHF', symbol: 'Fr',  name: 'Swiss Franc',      flag: '🇨🇭', ratePerUsd: 0.89,   decimals: 2 },
  { code: 'SGD', symbol: 'S$',  name: 'Singapore Dollar', flag: '🇸🇬', ratePerUsd: 1.35,   decimals: 2 },
];

export type CurrencyCode = typeof SUPPORTED_CURRENCIES[number]['code'];

const STORAGE_KEY = 'sm_currency';
export const CURRENCY_CHANGED_EVENT = 'salaryman:currency-changed';

// Region (ISO 3166-1 alpha-2) → currency code. Used only to seed a sensible
// default on first load; the stored preference always wins afterward.
const REGION_TO_CURRENCY: Record<string, CurrencyCode> = {
  US: 'USD', EC: 'USD', SV: 'USD', PR: 'USD',
  GB: 'GBP',
  JP: 'JPY',
  KR: 'KRW',
  CN: 'CNY', HK: 'CNY', TW: 'CNY',
  VN: 'VND',
  IN: 'INR',
  BR: 'BRL',
  CA: 'CAD',
  AU: 'AUD', NZ: 'AUD',
  MX: 'MXN',
  CH: 'CHF',
  SG: 'SGD',
  // Eurozone
  DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', PT: 'EUR',
  IE: 'EUR', AT: 'EUR', BE: 'EUR', FI: 'EUR', GR: 'EUR', LU: 'EUR',
  SK: 'EUR', SI: 'EUR', EE: 'EUR', LV: 'EUR', LT: 'EUR', CY: 'EUR',
  MT: 'EUR', HR: 'EUR',
};

// City (realm) → local currency. A city is a regional/timezone server tied to a
// real-world country, so the "local currency" shown in the office economy bar is
// auto-derived from whichever city the player is standing in (Huda → Vietnam →
// VND, Minx → USA → USD). This is independent of the player's chosen DISPLAY
// currency preference (sm_currency); it's the ambient local money of the realm.
const CITY_TO_CURRENCY: Record<string, CurrencyCode> = {
  minx_city: 'USD',       // Americas — North (USA)
  huda_city: 'VND',       // Asia — East (Vietnam)
  solaris_drift: 'MXN',   // Americas — Central (Mexico)
  verde_nexus: 'BRL',     // Americas — South (Brazil)
  obsidian_reach: 'USD',  // Africa (no listed local rate → USD)
  cobalt_harbor: 'GBP',   // Europe — West (UK)
  vostok_gate: 'EUR',     // Europe — East
  crescent_spire: 'USD',  // Asia — Crescent (Dubai → USD-pegged)
  amber_circuit: 'INR',   // Asia — South (India)
  dragon_forge: 'JPY',    // Asia — East (Japan)
  coral_vault: 'AUD',     // Oceania (Australia)
};

/**
 * The local currency CODE for a city/realm, defaulting to USD for any city
 * without an explicit mapping. Used by the office economy bar to label BTC and
 * the exchange-rate readout in the money the player would actually spend on the
 * street there.
 */
export function getCityCurrencyCode(cityId: string | null | undefined): CurrencyCode {
  return (cityId && CITY_TO_CURRENCY[cityId]) || 'USD';
}

/** Full CurrencyInfo (live-rate aware) for a city's local currency. */
export function getCityCurrency(cityId: string | null | undefined): CurrencyInfo {
  return getCurrencyInfo(getCityCurrencyCode(cityId));
}

// Cost-of-living baselines are intentionally separate from FX rates: these
// change what a city feels like in-game, while local currency only changes the
// label/readout. Minx carries a Western premium; Huda is the reference market.
const CITY_COST_OF_LIVING: Record<string, number> = {
  minx_city: 1.42,
  huda_city: 1.00,
  solaris_drift: 1.16,
  verde_nexus: 1.10,
  obsidian_reach: 0.94,
  cobalt_harbor: 1.28,
  vostok_gate: 1.08,
  crescent_spire: 1.22,
  amber_circuit: 1.04,
  dragon_forge: 1.18,
  coral_vault: 1.24,
};

export interface CityCostMultipliers {
  labor: number;
  property: number;
}

/**
 * Return a city's live cost-of-living multiplier.
 *
 * The BTC index is a market-pressure input, not a second price source: as BTC
 * rallies, the Western premium compresses; when BTC falls, the premium widens.
 * Huda remains the low-cost reference at 1.00x.
 */
export function getCityMultiplier(cityId: string | null | undefined, btcMultiplier = 1): number {
  const baseline = CITY_COST_OF_LIVING[cityId ?? ''] ?? 1.08;
  const btc = Math.max(0.4, Math.min(4, Number.isFinite(btcMultiplier) && btcMultiplier > 0 ? btcMultiplier : 1));
  const marketPressure = 1 / Math.sqrt(btc);
  return 1 + (baseline - 1) * marketPressure;
}

/** Labor is slightly more elastic than property in the same city. */
export function getCityCostMultipliers(cityId: string | null | undefined, btcMultiplier = 1): CityCostMultipliers {
  const property = getCityMultiplier(cityId, btcMultiplier);
  return { property, labor: 1 + (property - 1) * 0.94 };
}

// Live USD→currency FX rates ingested from the market-index endpoint. When a
// code is present here it overrides that currency's static `ratePerUsd`; codes
// missing from the live payload keep their static fallback.
let liveRates: Record<string, number> | null = null;

/**
 * Ingest live USD→currency FX rates (the `fx` field of
 * `/api/real-estate/market-index`). Each entry is validated (finite, positive)
 * so a partial or garbled payload can't corrupt the table; USD stays anchored
 * to 1. Fires CURRENCY_CHANGED_EVENT when the rates actually change so reactive
 * readouts (useCurrency) refresh live, the same way switching currency does.
 */
export function setLiveRates(rates: Record<string, number> | null | undefined): void {
  if (!rates || typeof rates !== 'object') return;
  const next: Record<string, number> = {};
  for (const c of SUPPORTED_CURRENCIES) {
    const v = Number(rates[c.code]);
    if (Number.isFinite(v) && v > 0) next[c.code] = v;
  }
  next.USD = 1; // anchor — USD is the native unit of the conversion
  if (Object.keys(next).length < 2) return; // nothing usable beyond USD
  const prev = liveRates;
  const changed = !prev || SUPPORTED_CURRENCIES.some(c => prev[c.code] !== next[c.code]);
  liveRates = next;
  if (changed && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CURRENCY_CHANGED_EVENT, { detail: getCurrency() }));
  }
}

export function getCurrencyInfo(code: string): CurrencyInfo {
  const base = SUPPORTED_CURRENCIES.find(c => c.code === code) ?? SUPPORTED_CURRENCIES[0];
  const live = liveRates?.[base.code];
  // Prefer the live rate when present and valid; otherwise keep the static one.
  // The returned shape is identical so consumers need no changes.
  if (live != null && live > 0 && live !== base.ratePerUsd) {
    return { ...base, ratePerUsd: live };
  }
  return base;
}

/**
 * Infer a default currency from the browser's locale/region, falling back to
 * USD. Reads region from `navigator.language` (and `navigator.languages`),
 * e.g. "en-GB" → GBP, "ja-JP" → JPY, "de-DE" → EUR.
 */
export function detectDefaultCurrency(): CurrencyCode {
  try {
    const locales: string[] = [];
    if (typeof navigator !== 'undefined') {
      if (Array.isArray(navigator.languages)) locales.push(...navigator.languages);
      if (navigator.language) locales.push(navigator.language);
    }
    for (const loc of locales) {
      // Prefer Intl's region resolution when available; fall back to the tag.
      let region: string | undefined;
      try {
        region = new Intl.Locale(loc).maximize().region ?? undefined;
      } catch {
        const parts = loc.split(/[-_]/);
        region = parts[1];
      }
      if (region) {
        const cur = REGION_TO_CURRENCY[region.toUpperCase()];
        if (cur) return cur;
      }
    }
  } catch { /* ignore — fall through to USD */ }
  return 'USD';
}

let memo: CurrencyCode | null = null;

export function getCurrency(): CurrencyCode {
  if (memo) return memo;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED_CURRENCIES.some(c => c.code === stored)) {
      memo = stored as CurrencyCode;
      return memo;
    }
  } catch { /* ignore */ }
  memo = detectDefaultCurrency();
  return memo;
}

export function setCurrency(code: CurrencyCode) {
  if (!SUPPORTED_CURRENCIES.some(c => c.code === code)) return;
  memo = code;
  try { localStorage.setItem(STORAGE_KEY, code); } catch { /* ignore */ }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CURRENCY_CHANGED_EVENT, { detail: code }));
  }
}

/** Convert a USD amount into the given (or active) currency. */
export function convertFromUsd(usd: number, code: string = getCurrency()): number {
  return usd * getCurrencyInfo(code).ratePerUsd;
}

/**
 * Format a USD amount in the selected currency with the right symbol.
 * `maximumFractionDigits` overrides the currency's default decimals (the ticker
 * passes 0 for large readouts like the BTC price).
 */
export function formatFromUsd(
  usd: number,
  opts: { code?: string; maximumFractionDigits?: number } = {},
): string {
  const info = getCurrencyInfo(opts.code ?? getCurrency());
  const value = usd * info.ratePerUsd;
  if (!isFinite(value)) return '—';
  const maxFrac = opts.maximumFractionDigits ?? (value >= 1000 ? 0 : info.decimals);
  return `${info.symbol}${value.toLocaleString(undefined, { maximumFractionDigits: maxFrac })}`;
}
