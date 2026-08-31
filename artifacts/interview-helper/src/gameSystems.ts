export const CITY_NAME = 'MINX CITY';

// ── World Clock & Calendar ────────────────────────────────────────────────────
// 1 real hour = 1 in-game day. 13 months × 28 days = 364 days/year.
// Each season = 91 game days (3 months × 28 days + 7 bonus days). 4 seasons × 91 = 364 days/year.
export const MONTHS = [
  'NEONVEIL','ASHMARK','DRIFTMOON','IRONBLOOM','RUSTFALL',
  'SMOKETIDE','GLASSREACH','COILWAKE','DEEPFORGE','HOLLOWEND',
  'STORMVEIL','FROSTLOCK','SHADOWTURN',
] as const;
export const SEASONS = ['SPRING','SUMMER','AUTUMN','WINTER'] as const;
export type Season = typeof SEASONS[number];
export type WeatherType = 'CLEAR'|'RAIN'|'SNOW'|'OVERCAST'|'STORM'|'HEATWAVE'|'FOG'|'DUST'|'ACID_RAIN';
export type TemperatureLevel = 'COLD' | 'MILD' | 'HOT';

export const DAYS_PER_SEASON = 91;
export const DAYS_PER_YEAR = DAYS_PER_SEASON * 4;

export function getSeasonFromDayOfYear(dayOfYear: number): Season {
  const d = ((dayOfYear - 1) % DAYS_PER_YEAR + DAYS_PER_YEAR) % DAYS_PER_YEAR;
  if (d < DAYS_PER_SEASON) return 'SPRING';
  if (d < DAYS_PER_SEASON * 2) return 'SUMMER';
  if (d < DAYS_PER_SEASON * 3) return 'AUTUMN';
  return 'WINTER';
}

// ── Quarters (real-life calendar year) ───────────────────────────────────────
// The story is structured like a business: it runs in four QUARTERS across one
// real-life calendar year (the same year the poison-gas arc dissipates over).
// Each quarter IS a season with its own weather, so the in-world season/weather
// is pinned to the current real quarter rather than the fast in-game clock.
export type Quarter = 1 | 2 | 3 | 4;
export const QUARTER_SEASON: Record<Quarter, Season> = {
  1: 'WINTER', // Q1 Jan-Mar — the year opens cold; the old order falls.
  2: 'SPRING', // Q2 Apr-Jun
  3: 'SUMMER', // Q3 Jul-Sep
  4: 'AUTUMN', // Q4 Oct-Dec — the fog has mostly lifted by year's end.
};
export function getRealQuarter(date: Date = new Date()): Quarter {
  return (Math.floor(date.getMonth() / 3) + 1) as Quarter;
}
export function quarterToSeason(q: number): Season {
  return QUARTER_SEASON[q as Quarter] ?? 'WINTER';
}
export function quarterLabel(q: number): string {
  return `Q${q}`;
}

export function getDayOfYear(month: number, day: number): number {
  return month * 28 + day;
}

export interface WorldCalendar {
  year: number;
  month: number;
  day: number;
  hour: number;
  season: Season;
  weather: WeatherType;
  weatherTimer: number;
  disasterActive: null | 'FIRE' | 'EARTHQUAKE';
  disasterTimer: number;
  disasterX: number;
  disasterY: number;
}

export function initCalendar(): WorldCalendar {
  return {
    year: 1, month: 0, day: 1, hour: 8,
    season: 'SPRING', weather: 'CLEAR', weatherTimer: 0,
    disasterActive: null, disasterTimer: 0, disasterX: 0, disasterY: 0,
  };
}

// ── Visual day length ─────────────────────────────────────────────────────────
// One in-game day spans ONE real hour. This is a *purely visual* constant that
// drives the world clock, the sun/moon arc and the day/night lighting only.
//
// IMPORTANT — keep this decoupled from the economy: the stipend/salary accrual
// rate is governed by REAL_MS_PER_GAME_DAY in api-server/src/lib/salary.ts (a
// separate constant on the server). Changing the *visual* day length here must
// never alter how fast the stipend or any economy payout accrues. The two clocks
// are intentionally independent — the visual day is fast (1 real hour) so players
// see day turn to night within a session, while the server keeps paying 500ƒ per
// game-hour at its own (unchanged) cadence.
export const VISUAL_MS_PER_GAME_DAY = 3_600_000; // 1 real hour = 1 game day
const REAL_MS_PER_GAME_HOUR = VISUAL_MS_PER_GAME_DAY / 24;

export function tickCalendar(cal: WorldCalendar, dtMs: number, forcedSeason?: Season): WorldCalendar {
  const hoursElapsed = dtMs / REAL_MS_PER_GAME_HOUR;
  let h = cal.hour + hoursElapsed;
  let d = cal.day;
  let m = cal.month;
  let y = cal.year;

  while (h >= 24) { h -= 24; d++; }
  while (d > 28) { d -= 28; m++; }
  while (m >= 13) { m -= 13; y++; }

  const dayOfYear = getDayOfYear(m, d);
  // When a season is forced (driven by the real-life quarter), the in-world
  // season is pinned to it and weather is re-picked from that season — so the
  // weather visibly shifts whenever the quarter (and thus season) changes.
  const season = forcedSeason ?? getSeasonFromDayOfYear(dayOfYear);
  const seasonChanged = season !== cal.season;

  let weather = cal.weather;
  let wt = cal.weatherTimer - 1;
  if (wt <= 0 || seasonChanged) {
    weather = pickWeather(season);
    wt = 300 + Math.floor(Math.random() * 600);
  }

  let disaster = cal.disasterActive;
  let disasterTimer = cal.disasterTimer;
  let dx = cal.disasterX, dy = cal.disasterY;
  if (disasterTimer > 0) {
    disasterTimer--;
    if (disasterTimer <= 0) disaster = null;
  } else if (Math.random() < 0.00008) {
    disaster = Math.random() < 0.6 ? 'FIRE' : 'EARTHQUAKE';
    disasterTimer = 180 + Math.floor(Math.random() * 120);
    dx = 5500 + Math.random() * 3500;
    dy = 5100 + Math.random() * 2400;
  }

  return { year: y, month: m, day: d, hour: h, season, weather, weatherTimer: wt,
    disasterActive: disaster, disasterTimer, disasterX: dx, disasterY: dy };
}

export function getTemperatureLevel(season: Season, weather: WeatherType, hour: number): TemperatureLevel {
  const isNight = hour < 6 || hour >= 20;
  if (season === 'WINTER') {
    if (weather === 'HEATWAVE') return 'MILD';
    return 'COLD';
  }
  if (season === 'SUMMER') {
    if (weather === 'HEATWAVE' || weather === 'DUST') return 'HOT';
    if (weather === 'SNOW' || weather === 'STORM') return 'MILD';
    if (isNight) return 'MILD';
    return 'HOT';
  }
  if (season === 'AUTUMN') {
    if (weather === 'SNOW' || weather === 'STORM') return 'COLD';
    if (weather === 'HEATWAVE') return 'HOT';
    if (isNight && (weather === 'RAIN' || weather === 'FOG')) return 'COLD';
    return 'MILD';
  }
  if (weather === 'SNOW' || (weather === 'STORM' && isNight)) return 'COLD';
  if (weather === 'HEATWAVE') return 'HOT';
  return 'MILD';
}

function pickWeather(season: Season): WeatherType {
  const r = Math.random();
  switch (season) {
    case 'SPRING': return r < 0.35 ? 'CLEAR' : r < 0.6 ? 'RAIN' : r < 0.75 ? 'OVERCAST' : r < 0.9 ? 'FOG' : 'STORM';
    case 'SUMMER': return r < 0.5 ? 'CLEAR' : r < 0.65 ? 'HEATWAVE' : r < 0.8 ? 'OVERCAST' : r < 0.92 ? 'DUST' : 'STORM';
    case 'AUTUMN': return r < 0.3 ? 'CLEAR' : r < 0.55 ? 'RAIN' : r < 0.75 ? 'OVERCAST' : r < 0.85 ? 'FOG' : r < 0.95 ? 'STORM' : 'ACID_RAIN';
    case 'WINTER': return r < 0.2 ? 'CLEAR' : r < 0.5 ? 'SNOW' : r < 0.7 ? 'OVERCAST' : r < 0.85 ? 'FOG' : 'STORM';
  }
}

export function getCalendarString(cal: WorldCalendar): string {
  const h = Math.floor(cal.hour);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${MONTHS[cal.month]} ${cal.day}, Y${cal.year} · ${h12}:00 ${ampm} · ${cal.season}`;
}

export function getDayNightAlpha(hour: number): number {
  if (hour >= 6 && hour < 17) return 0;
  if (hour >= 17 && hour < 19) return ((hour - 17) / 2) * 0.6;
  if (hour >= 19 || hour < 4) return 0.6;
  if (hour >= 4 && hour < 6) return (1 - (hour - 4) / 2) * 0.6;
  return 0;
}

// ── Sky bodies (sun & moon) ───────────────────────────────────────────────────
// Pure, testable model of where the sun and moon sit as a function of the 0–24
// time-of-day, plus the shadow the sun casts. Rendering reads this so the sky
// bodies, the shadow direction/length and the ambient brightness all stay in
// lockstep with the single world clock.
export const SUNRISE_HOUR = 5;  // sun clears the horizon
export const SUNSET_HOUR = 19;  // sun dips below the horizon

export interface SkyBody {
  /** Whether this body is currently above the horizon. */
  visible: boolean;
  /** Horizontal arc position: 0 = east (screen-left) horizon, 1 = west (screen-right) horizon. */
  x: number;
  /** Height in the sky: 0 = at the horizon, 1 = at the zenith. */
  altitude: number;
}

export interface SkyState {
  sun: SkyBody;
  moon: SkyBody;
  /**
   * Sun-driven ground shadow. `dx`/`dy` is a (roughly unit) screen-space vector
   * pointing the way shadows fall — away from the sun — and `len` is a length
   * multiplier (≈1 at midday, longer near dawn/dusk, tiny at night). The scene's
   * established look throws shadows down-and-to-the-side, so `dy` stays positive
   * (toward the viewer) while `dx` swings right→left as the sun crosses the sky.
   */
  shadow: { dx: number; dy: number; len: number };
  /** Ambient brightness from the sun only: 0 at deep night → 1 at noon. */
  sunBrightness: number;
}

export function getSkyState(hour: number): SkyState {
  const h = ((hour % 24) + 24) % 24;
  const dayLen = SUNSET_HOUR - SUNRISE_HOUR;   // hours of daylight
  const nightLen = 24 - dayLen;                // hours of darkness

  const sunUp = h >= SUNRISE_HOUR && h < SUNSET_HOUR;
  const sunP = sunUp ? (h - SUNRISE_HOUR) / dayLen : 0;          // 0→1 across the day
  const sunAlt = sunUp ? Math.sin(sunP * Math.PI) : 0;          // arcs up then down

  const moonUp = !sunUp;
  // Hours since sunset, wrapping past midnight, normalised across the night.
  const sinceSunset = h >= SUNSET_HOUR ? h - SUNSET_HOUR : h + (24 - SUNSET_HOUR);
  const moonP = moonUp ? sinceSunset / nightLen : 0;
  const moonAlt = moonUp ? Math.sin(moonP * Math.PI) : 0;

  const sun: SkyBody = { visible: sunUp, x: sunP, altitude: sunAlt };
  const moon: SkyBody = { visible: moonUp, x: moonP, altitude: moonAlt };

  // Shadow direction follows the sun's azimuth: a morning sun in the east
  // (sunP→0) throws shadows to the right (+dx); an evening sun in the west
  // (sunP→1) throws them to the left (−dx); at noon they fall straight down.
  // Shadows lengthen as the sun sinks (low altitude). At night the sun is gone,
  // so shadows collapse to a faint, near-straight-down moonlight contact shadow.
  const dirX = sunUp ? (0.5 - sunP) * 2 : 0;     // +1 morning → 0 noon → −1 dusk
  const dx = dirX * 0.7;
  const dy = 0.7;
  const len = sunUp ? 1 + (1 - sunAlt) * 1.6 : 0.45;

  // Ambient lift from the sun, smoothly ramped through dawn/dusk via altitude.
  const sunBrightness = sunUp ? 0.15 + sunAlt * 0.85 : 0;

  return { sun, moon, shadow: { dx, dy, len }, sunBrightness };
}

// ── Radiation Zones ──────────────────────────────────────────────────────────
export interface RadiationZone {
  x: number; y: number; w: number; h: number; intensity: number; label: string;
}

export const RADIATION_ZONES: RadiationZone[] = [
  { x: 1000, y: 9000, w: 1500, h: 1200, intensity: 0.8, label: 'TOXIC FLATS' },
  { x: 11000, y: 1000, w: 1800, h: 1400, intensity: 0.6, label: 'DEAD ZONE NORTH' },
  { x: 9000, y: 10000, w: 2000, h: 1500, intensity: 0.7, label: 'IRRADIATED WASTES' },
  { x: 3500, y: 3000, w: 1200, h: 1000, intensity: 0.5, label: 'MELTDOWN SITE' },
  { x: 12000, y: 7000, w: 1600, h: 1200, intensity: 0.9, label: 'REACTOR CRATER' },
];

export function getRadiationLevel(px: number, py: number): { inZone: boolean; intensity: number; label: string } {
  for (const z of RADIATION_ZONES) {
    if (px >= z.x && px <= z.x + z.w && py >= z.y && py <= z.y + z.h) {
      return { inZone: true, intensity: z.intensity, label: z.label };
    }
  }
  return { inZone: false, intensity: 0, label: '' };
}

// ── Gold Exchange ────────────────────────────────────────────────────────────
// Canonical wealth rail: ƒ100 = 0.1 GOLD = $1 USD.
export const FIAT_PER_GOLD = 1000;
export const GEMSTONE_PER_GOLD = 1;
export const BASE_TAX_RATE = 0.10;
export const TAX_INCREASE_PER_YEAR = 0.001;

export function getTransactionTax(year: number): number {
  return BASE_TAX_RATE + TAX_INCREASE_PER_YEAR * (year - 1);
}

export function fiatToGold(fiat: number, year: number): { gold: number; tax: number; totalCost: number } {
  const taxRate = getTransactionTax(year);
  const gold = Math.floor(fiat / FIAT_PER_GOLD);
  const baseCost = gold * FIAT_PER_GOLD;
  const tax = Math.floor(baseCost * taxRate);
  return { gold, tax, totalCost: baseCost + tax };
}

// ── ATM Fee System ──────────────────────────────────────────────────────────
export const ATM_FEE_RATE = 0.04;
export const ATM_WITHDRAW_FEE_RATE = 0.03;
export function calcAtmFee(amount: number, feeRate: number): { fee: number; net: number } {
  const fee = Math.ceil(amount * feeRate);
  return { fee, net: amount - fee };
}

// ── Gold Exchange Spread ─────────────────────────────────────────────────────
export const GOLD_EXCHANGE_BUY_SPREAD = 0.05;
export const GOLD_EXCHANGE_SELL_SPREAD = 0.05;

// ── Gold → Real-Money Cash-Out ───────────────────────────────────────────────
// Gold can be withdrawn as real money minus a flat fee. Only EARNED gold
// applies: starter & unemployment grants are FIAT-only and never become gold,
// so they are excluded from real-money withdrawal by construction.
export const GOLD_CASHOUT_FEE_RATE = 0.20;
export const FIAT_PER_USD = 100;

// ── BANCO OMBRA Exchange Counter ─────────────────────────────────────────────
// Flat configurable spread taken on every in-game currency swap (FIAT/GOLD/BTC/
// ETH). BTC/ETH are in-game-only synthetic markets priced off the live USD index
// (no real crypto); only USD is real money and never instant-swaps (it enters via
// Stripe top-up and exits via the gold cash-out rail). Tune this single constant
// to change the exchange-desk fee everywhere.
export const EXCHANGE_FEE_RATE = 0.02;

// Fixed real-money FIAT top-up packs (USD → server bank ƒ at 1000ƒ = $1). Stripe
// enforces a ~$0.50 minimum charge, so the smallest sellable pack is 500ƒ ($0.50)
// rather than the spec's 50ƒ ($0.05, unchargeable). Amounts are authoritative on
// the server (stripe.ts FIAT_TOPUP_PACKS) — these mirror them for the client UI.
export const FIAT_TOPUP_PACKS = [
  { id: 'topup_500',   fiat: 500,    usdCents: 50 },
  { id: 'topup_5000',  fiat: 5000,   usdCents: 500 },
  { id: 'topup_10000', fiat: 10000,  usdCents: 1000 },
] as const;

// ── Expanded Loan System ────────────────────────────────────────────────────
export interface LoanTier {
  amount: number; label: string;
  baseInterestRate: number;
  originationFeeRate: number;
  durationFrames: number;
  compounding: boolean;
}

export const LOAN_TIERS: LoanTier[] = [
  { amount: 5000,   label: 'ƒ5K',   baseInterestRate: 0.15, originationFeeRate: 0,    durationFrames: 60 * 360, compounding: false },
  { amount: 10000,  label: 'ƒ10K',  baseInterestRate: 0.15, originationFeeRate: 0,    durationFrames: 60 * 360, compounding: false },
  { amount: 25000,  label: 'ƒ25K',  baseInterestRate: 0.18, originationFeeRate: 0.02, durationFrames: 60 * 480, compounding: false },
  { amount: 50000,  label: 'ƒ50K',  baseInterestRate: 0.20, originationFeeRate: 0.03, durationFrames: 60 * 600, compounding: true },
  { amount: 100000, label: 'ƒ100K', baseInterestRate: 0.22, originationFeeRate: 0.04, durationFrames: 60 * 720, compounding: true },
  { amount: 250000, label: 'ƒ250K', baseInterestRate: 0.25, originationFeeRate: 0.05, durationFrames: 60 * 900, compounding: true },
  { amount: 500000, label: 'ƒ500K', baseInterestRate: 0.28, originationFeeRate: 0.06, durationFrames: 60 * 1200, compounding: true },
];

export function calcLoanInterest(tier: LoanTier): number {
  if (tier.compounding) {
    const periods = 4;
    const ratePerPeriod = tier.baseInterestRate / periods;
    return Math.floor(tier.amount * (Math.pow(1 + ratePerPeriod, periods) - 1));
  }
  return Math.floor(tier.amount * tier.baseInterestRate);
}

export function calcOriginationFee(tier: LoanTier): number {
  return Math.floor(tier.amount * tier.originationFeeRate);
}

// ── Real Estate Property System ─────────────────────────────────────────────
export const PROPERTY_TAX_RATE = 0.02;
export const PROPERTY_RESALE_FEE_RATE = 0.06;
export const PROPERTY_TAX_CYCLE_FRAMES = 20;

export interface PropertyDeed {
  id: string;
  name: string;
  zone: string;
  purchasePrice: number;
  purchasedAt: number;
  currentValue: number;
  taxesPaid: number;
  income: number;
}

export function getPropertyValue(deed: PropertyDeed): number {
  const zoneDemand: Record<string, number> = {
    downtown: 1.3, commercial: 1.15, residential: 1.0, industrial: 0.85, transit: 0.9,
    'SHADOW TOWER': 1.4, 'WASTELAND': 0.7, 'INDUSTRIAL': 0.8,
  };
  const demand = zoneDemand[deed.zone] ?? 1.0;
  const ageMs = Date.now() - deed.purchasedAt;
  const ageDays = ageMs / 86400000;
  const cyclicShift = Math.sin(ageDays * 0.5) * 0.15;
  const trendShift = Math.min(0.3, ageDays * 0.005);
  const multiplier = demand + cyclicShift + trendShift;
  return Math.floor(deed.purchasePrice * Math.max(0.5, multiplier));
}

export function calcPropertyTax(propertyValue: number): number {
  return Math.floor(propertyValue * PROPERTY_TAX_RATE);
}

export function calcResaleFee(salePrice: number): number {
  return Math.floor(salePrice * PROPERTY_RESALE_FEE_RATE);
}

// ── Utility Networks (Power / Water / Comms) ───────────────────────────────
// Owned properties consume utilities every cycle. Bills auto-deduct from FIAT
// balance. Unpaid properties go OFFLINE — visually dimmed, no rental income,
// banner signage hidden. Cycle is independent from property tax cycle so the
// player feels them as separate "monthly" expenses.
export const UTILITY_TICK_FRAMES = 35;
export const UTILITY_GRACE_TICKS = 2;

export interface UtilityBill {
  power: number;
  water: number;
  comms: number;
  total: number;
  perProperty: Record<string, { power: number; water: number; comms: number; total: number }>;
}

export interface PropertyCustomization {
  themeColor?: string;     // accent color override — e.g. '#38bdf8'
  signage?: string;        // 1–18 char label that overrides default floor name in banner
  lighting?: 'normal' | 'dim' | 'bright';
}

// Power / water / comms cost per property type per billing cycle.
// Tower floors and owned business floors are most expensive (corporate utilities);
// vans + trailers are cheapest (off-grid generators / cisterns).
const UTILITY_RATES: Record<string, { power: number; water: number; comms: number }> = {
  apartment: { power: 18, water: 12, comms: 10 },
  office_floor: { power: 65, water: 25, comms: 45 },
  tower_floor: { power: 120, water: 40, comms: 80 },
  van: { power: 6, water: 4, comms: 8 },
  trailer: { power: 9, water: 7, comms: 6 },
  warehouse: { power: 45, water: 18, comms: 15 },
  shop: { power: 30, water: 14, comms: 20 },
  generic: { power: 22, water: 14, comms: 12 },
};

export function classifyPropertyForUtilities(propertyId: string): keyof typeof UTILITY_RATES {
  const id = propertyId.toLowerCase();
  if (id.startsWith('van_') || id === 'van') return 'van';
  if (id.includes('trailer')) return 'trailer';
  if (id.includes('tower') || id.includes('shadow_tower') || id.includes('picasso')) return 'tower_floor';
  if (id.includes('warehouse') || id.includes('industrial')) return 'warehouse';
  if (id.includes('shop') || id.includes('store') || id.includes('market')) return 'shop';
  if (id.includes('apartment') || id.includes('flat') || id.includes('arms') || id.includes('hotel') || id.includes('overlook') || id.includes('house') || id.includes('villa')) return 'apartment';
  if (id.includes('office') || id.includes('hq') || id.includes('bureau') || id.includes('nexus')) return 'office_floor';
  return 'generic';
}

export function calcUtilityBill(propertyIds: string[], customization: Record<string, PropertyCustomization> = {}): UtilityBill {
  const perProperty: UtilityBill['perProperty'] = {};
  let pTot = 0, wTot = 0, cTot = 0;
  for (const pid of propertyIds) {
    const cls = classifyPropertyForUtilities(pid);
    const base = UTILITY_RATES[cls];
    const custom = customization[pid];
    // Bright lighting => +25% power; dim => -20% power
    const powerMult = custom?.lighting === 'bright' ? 1.25 : custom?.lighting === 'dim' ? 0.80 : 1.0;
    const power = Math.round(base.power * powerMult);
    const water = base.water;
    const comms = base.comms;
    const total = power + water + comms;
    perProperty[pid] = { power, water, comms, total };
    pTot += power; wTot += water; cTot += comms;
  }
  return { power: pTot, water: wTot, comms: cTot, total: pTot + wTot + cTot, perProperty };
}

// Curated palette for the customization picker — every swatch is high-contrast
// against the carpet floor so banners read clearly.
export const THEME_COLOR_PRESETS: { name: string; rgb: [number, number, number] }[] = [
  { name: 'CYAN',   rgb: [56, 189, 248] },
  { name: 'AMBER',  rgb: [251, 191, 36] },
  { name: 'EMERALD',rgb: [16, 185, 129] },
  { name: 'MAGENTA',rgb: [217, 70, 239] },
  { name: 'CRIMSON',rgb: [239, 68, 68] },
  { name: 'GOLD',   rgb: [255, 204, 0] },
  { name: 'VIOLET', rgb: [139, 92, 246] },
  { name: 'WHITE',  rgb: [230, 230, 230] },
];

// ── Transaction Log Types ───────────────────────────────────────────────────
export type TransactionCategory = 'atm_fee' | 'loan_interest' | 'loan_origination' | 'property_tax' | 'resale_fee' | 'exchange_spread' | 'deposit_tax' | 'wire_tax' | 'income' | 'gov_salary' | 'business_profit' | 'real_salary' | 'expense' | 'general';

export interface TransactionLogEntry {
  id: number;
  desc: string;
  amount: number;
  bal: number;
  category: TransactionCategory;
  timestamp: number;
}

// ── Salary Economy ───────────────────────────────────────────────────────────
export type IncomeType = 'unemployed' | 'minx' | 'real';

export interface SalaryBreakdown {
  governmentBase: number;
  businessProfit: number;
  realSalaryAmount: number;
  incomeType: IncomeType;
}

export const CLASS_GOV_SALARY: Record<string, number> = {
  corporate: 0,
  replicant: 0,
  outlaw: 0,
};

export const MINX_BUSINESS_PROFIT_BASE = 0;

export const CLASS_GOV_SALARY_LABEL: Record<string, string> = {
  corporate: 'ƒ0',
  replicant: 'ƒ0',
  outlaw: 'ƒ0',
};

export function calcEffectiveSalary(breakdown: SalaryBreakdown): number {
  return breakdown.governmentBase + breakdown.businessProfit + breakdown.realSalaryAmount;
}

// ── Business Financial Snapshot ──────────────────────────────────────────────
export interface BusinessFinancialSnapshot {
  playerName: string;
  balance: number;
  salary: number;
  businessProfit: number;
  governmentBaseSalary: number;
  realSalaryAmount: number;
  incomeType: IncomeType;
  snapshotAt: number;
}

// ── Treasure System ──────────────────────────────────────────────────────────
export interface TreasureChest {
  id: string; x: number; y: number; opened: boolean;
  loot: { fiat: number; items: { name: string; desc: string }[] };
  requiresMap: boolean;
}

export const TREASURE_CHESTS: TreasureChest[] = [
  { id: 'tc_nw_1', x: 1500, y: 2000, opened: false, loot: { fiat: 400, items: [{ name: 'ANCIENT BLADE', desc: 'Pre-collapse weapon. Still sharp.' }] }, requiresMap: false },
  { id: 'tc_ne_1', x: 11500, y: 1800, opened: false, loot: { fiat: 500, items: [{ name: 'DATA CORE', desc: 'PABLO CORP classified data.' }] }, requiresMap: false },
  { id: 'tc_sw_1', x: 2500, y: 10000, opened: false, loot: { fiat: 650, items: [{ name: 'GOLD INGOT', desc: 'Pure gold. Worth 1 gold unit.' }] }, requiresMap: true },
  { id: 'tc_se_1', x: 10000, y: 10500, opened: false, loot: { fiat: 750, items: [{ name: 'REACTOR SHARD', desc: 'Glowing with residual energy.' }] }, requiresMap: true },
  { id: 'tc_mid_1', x: 6000, y: 8500, opened: false, loot: { fiat: 300, items: [{ name: 'SUPPLY CRATE', desc: 'Food and medical supplies.' }] }, requiresMap: false },
  { id: 'tc_deep_1', x: 4000, y: 11000, opened: false, loot: { fiat: 900, items: [{ name: 'PABLO\'S DIARY', desc: 'A page from Senior Pablo\'s journal.' }] }, requiresMap: true },
  { id: 'tc_east_1', x: 12500, y: 5000, opened: false, loot: { fiat: 350, items: [{ name: 'ENERGY CELL', desc: 'Military-grade power source.' }] }, requiresMap: false },
  { id: 'tc_north_1', x: 8000, y: 1200, opened: false, loot: { fiat: 450, items: [{ name: 'VOID DOG FANG', desc: 'Trophy from a Void Dog alpha.' }] }, requiresMap: false },
];

export const TREASURE_MAPS = [
  { id: 'tmap_1', name: 'TATTERED MAP', desc: 'Points to the irradiated southwest...', targetChest: 'tc_sw_1' },
  { id: 'tmap_2', name: 'ENCODED MAP', desc: 'Coordinates encrypted. Southeast sector.', targetChest: 'tc_se_1' },
  { id: 'tmap_3', name: 'PABLO\'S NOTE', desc: '"X marks where I buried the truth." Deep south.', targetChest: 'tc_deep_1' },
];

// ── Boomer Mode Terminology ──────────────────────────────────────────────────
export const BOOMER_MAP: Record<string, string> = {
  'FIAT': 'CREDITS',
  'HP': 'HEALTH',
  'ATK': 'POWER',
  'XP': 'EXPERIENCE',
  'EXP': 'EXPERIENCE',
  'LVL': 'RANK',
  'PSN': 'TOXIN',
  'HUNGER': 'FOOD LEVEL',
  'THIRST': 'HYDRATION',
  'ENERGY': 'STAMINA',
  'LEVEL UP': 'PROMOTION',
  'WASTELAND': 'FIELD TERRITORY',
  [CITY_NAME]: 'HEADQUARTERS',
  'MELEE': 'CLOSE COMBAT',
  'RANGED': 'LONG RANGE',
  'LOOT': 'ACQUISITION',
  'BOUNTY': 'COMMISSION',
  'NPC': 'CONTACT',
  'PVP': 'COMPETITIVE',
  'WEAPON': 'TOOL',
  'POISON': 'CONTAMINATION',
  'SAVE POINT': 'CHECKPOINT',
  'GAME OVER': 'SESSION ENDED',
  'RESPAWN': 'RESTART',
  'KILL': 'NEUTRALIZE',
  'QUEST': 'OBJECTIVE',
  'INVENTORY': 'PORTFOLIO',
  'MERCHANT': 'VENDOR',
  'GANG': 'COMPETITOR',
  'BOSS': 'EXECUTIVE',
  'DUNGEON': 'FACILITY',
  'ARMOR': 'PROTECTION',
  'MANA': 'RESOURCES',
  'GRIND': 'WORK',
  'BUFF': 'ENHANCEMENT',
  'DEBUFF': 'PENALTY',
  'SPAWN': 'DEPLOY',
  'AGGRO': 'ATTENTION',
  'RAID': 'OPERATION',
  'GUILD': 'DEPARTMENT',
  'DPS': 'OUTPUT',
};

export function boomerize(text: string, active: boolean): string {
  if (!active) return text;
  let result = text;
  for (const [game, biz] of Object.entries(BOOMER_MAP)) {
    result = result.replace(new RegExp(`\\b${game}\\b`, 'gi'), biz);
  }
  return result;
}

// ── Dialogue System ──────────────────────────────────────────────────────────
export interface DialogueChoice {
  text: string;
  nextId: string | null;
  flag?: string;
  flagValue?: string;
}

export interface DialogueNode {
  id: string;
  speaker: string;
  portrait: 'player' | 'npc';
  text: string;
  choices: DialogueChoice[];
  effect?: 'open_shop' | 'give_gold' | 'give_fiat' | 'heal' | 'pay_fine' | 'resist_arrest' | 'flee_collector' | 'cantpay_collector' | 'bo_pay_settle' | 'bo_restructure' | 'bo_flee' | 'bo_cantpay';
}

export interface DialogueTree {
  npcName: string;
  startId: string;
  nodes: Record<string, DialogueNode>;
}

export const STORY_DIALOGUES: Record<string, DialogueTree> = {
  MARCUS_VELL: {
    npcName: 'MARCUS VELL',
    startId: 'start',
    nodes: {
      start: { id: 'start', speaker: 'MARCUS VELL', portrait: 'npc', text: 'Another visitor. The megabank doesn\'t close, but my patience does. What do you want?', choices: [
        { text: 'Tell me about the bank.', nextId: 'bank_info' },
        { text: 'What do you know about Senior Pablo?', nextId: 'pablo_info' },
        { text: 'Nothing. Goodbye.', nextId: null },
      ]},
      bank_info: { id: 'bank_info', speaker: 'MARCUS VELL', portrait: 'npc', text: 'Iron Trust Bank. EST. 1989. Every fiat in this city passes through these doors. PABLO CORP takes 12% of everything above 5,000. That\'s not banking. That\'s tribute.', choices: [
        { text: 'That seems unfair.', nextId: 'unfair' },
        { text: 'Thanks for the info.', nextId: null },
      ]},
      pablo_info: { id: 'pablo_info', speaker: 'MARCUS VELL', portrait: 'npc', text: 'I\'ve worked here eleven years. Never met him. Never seen him. But every document I process has his signature. Same ink. Same hand. For eleven years.', choices: [
        { text: 'That\'s suspicious.', nextId: 'suspicious', flag: 'marcus_suspicious', flagValue: 'true' },
        { text: 'Interesting. Goodbye.', nextId: null },
      ]},
      unfair: { id: 'unfair', speaker: 'MARCUS VELL', portrait: 'npc', text: 'Fairness left Minx City around the same time the flowers did. You want fair? Try the wasteland. Out there, everyone loses equally.', choices: [
        { text: 'Goodbye.', nextId: null },
      ]},
      suspicious: { id: 'suspicious', speaker: 'MARCUS VELL', portrait: 'npc', text: 'Keep your voice down. Walls have ears in this city. And cameras. And microphones. All of them pointed at this desk.', choices: [
        { text: 'I\'ll be careful.', nextId: null },
      ]},
    },
  },
  OFFICER_DECLAN_VOSS: {
    npcName: 'OFFICER DECLAN VOSS',
    startId: 'start',
    nodes: {
      start: { id: 'start', speaker: 'OFFICER VOSS', portrait: 'npc', text: 'Citizen. State your business. I don\'t have time for idle conversation.', choices: [
        { text: 'What happens on Floor 40?', nextId: 'floor40' },
        { text: 'Any threats I should know about?', nextId: 'threats' },
        { text: 'Just passing through.', nextId: null },
      ]},
      floor40: { id: 'floor40', speaker: 'OFFICER VOSS', portrait: 'npc', text: 'Floor 40 and above. Permanent restriction. I\'ve been a captain for fourteen years and I\'ve never been above floor 39. Don\'t ask who gave the order.', choices: [
        { text: 'You\'re not curious?', nextId: 'curious' },
        { text: 'Understood.', nextId: null },
      ]},
      threats: { id: 'threats', speaker: 'OFFICER VOSS', portrait: 'npc', text: 'Border gangs south of the checkpoints. Iron Rats and Void Dogs in the wastes. Spies in the city — they look like everyone else. Watch your back.', choices: [
        { text: 'Thanks, Officer.', nextId: null },
      ]},
      curious: { id: 'curious', speaker: 'OFFICER VOSS', portrait: 'npc', text: 'Curiosity is a luxury. I have a pension. Those two things don\'t coexist in Minx City.', choices: [
        { text: 'Fair enough.', nextId: null },
      ]},
    },
  },
};

// ── Generic NPC Dialogue Templates ───────────────────────────────────────────
// Deep branching dialogues for all NPCs without a dedicated story tree.
// Role/faction-aware, multi-depth conversations, contextual hooks, effects.

type GenericNpcRole = 'police' | 'corpo_military' | 'corpo_worker' | 'homeless' | 'pedestrian' | 'dealer_papers' | 'dealer_weapons' | 'blade_runner' | 'gang_patrol' | 'guard' | 'default';

interface DialogueBranch {
  playerText: string;
  npcReply: string;
  mood: 'friendly' | 'dismissive' | 'cryptic' | 'threatening' | 'desperate' | 'conspiratorial';
  followUp?: { playerText: string; npcReply: string; mood: string; followUp?: { playerText: string; npcReply: string; mood: string } }[];
  effect?: 'give_gold' | 'give_fiat' | 'heal';
}

interface GenericTemplate {
  opening: string[];
  branches: DialogueBranch[];
  farewells: string[];
}

const GENERIC_TEMPLATES: Record<GenericNpcRole, GenericTemplate> = {
  police: {
    opening: [
      'Move along, citizen. Nothing to see here.',
      'Keep it moving. This area is under surveillance.',
      'I\'m watching you. We\'re all watching.',
      'Papers. Now. And don\'t make me ask twice.',
      'You look like trouble. Prove me wrong.',
      'Another face in the grid. State your sector.',
      'Tax compliance check. Stand still.',
    ],
    branches: [
      { playerText: 'What\'s the situation out there?', npcReply: 'Above my clearance. And yours. Keep your head down.', mood: 'dismissive',
        followUp: [
          { playerText: 'Come on. Off the record.', npcReply: 'Off the record doesn\'t exist. Every word in this city is logged, filed, and taxed. Literally — they charge us a COMMUNICATIONS TAX per shift report.', mood: 'cryptic',
            followUp: { playerText: 'They tax you too?', npcReply: 'Everyone gets taxed. Badge doesn\'t make you exempt. Just means you get to collect it from people like you before they collect it from you.' , mood: 'cryptic' } },
          { playerText: 'Understood. Forget I asked.', npcReply: 'Already forgotten. That\'s the safest way to live here.', mood: 'dismissive' },
        ]},
      { playerText: 'Seems quiet tonight.', npcReply: 'Quiet is when you should be most worried in this city. The gangs go silent before a push. The corps go silent before a buyout. Silence is just violence loading.', mood: 'cryptic',
        followUp: [
          { playerText: 'You think something\'s coming?', npcReply: 'Something\'s always coming. Last week the Void Runners hit a convoy on the eastern highway. Week before that, Eastern Bloc took out a power substation. It never stops.', mood: 'cryptic',
            followUp: { playerText: 'How do you keep going?', npcReply: 'Paycheck. Pension. And the knowledge that without us, this whole city burns in forty-eight hours. That\'s enough.' , mood: 'dismissive' } },
        ]},
      { playerText: 'How much do they pay you for this?', npcReply: 'Not enough. But more than most. PABLO CORP police salary is 4,200 a month after PROTECTION TAX, GRID TAX, and the mandatory LOYALTY CONTRIBUTION. Take-home is about 2,800.', mood: 'cryptic',
        followUp: [
          { playerText: 'Loyalty contribution?', npcReply: 'Ten percent of gross goes to "civic improvement." Nobody\'s seen any improvement. But the cameras get newer every quarter.', mood: 'conspiratorial' },
          { playerText: 'That\'s rough.', npcReply: 'It\'s the deal. You wear the badge, you get the rations, you don\'t ask questions. Better than what\'s outside the walls.', mood: 'dismissive' },
        ]},
      { playerText: 'I paid my taxes. Leave me alone.', npcReply: 'That\'s what they all say. And half of them are lying. The other half just haven\'t been audited yet.', mood: 'threatening',
        followUp: [
          { playerText: 'I\'m serious. I\'m clean.', npcReply: 'Clean is a spectrum in Minx City. Nobody\'s spotless. But you\'re not on my list today. So walk.', mood: 'dismissive' },
        ]},
      { playerText: 'Ever think about quitting?', npcReply: 'Quit what? And do what? Work the scrap yards? Run with the gangs? At least this way I eat regular and sleep indoors. That\'s luxury.', mood: 'cryptic',
        followUp: [
          { playerText: 'There\'s gotta be more than this.', npcReply: '"More than this." That\'s what the idealists say before the city chews them up. I\'ve buried three partners. Each one thought there was more than this.', mood: 'cryptic' },
          { playerText: 'Fair point.', npcReply: 'Fairness has nothing to do with it. Survival. That\'s the only metric that matters out here.', mood: 'dismissive' },
        ]},
      { playerText: 'Know anything about Senior Pablo?', npcReply: 'I know not to answer that question. And if you\'re smart, you know not to ask it. Especially not to someone in uniform.', mood: 'threatening',
        followUp: [
          { playerText: 'I\'ll take that as a yes.', npcReply: 'Take it however you want. Just take it somewhere else. This conversation is over.', mood: 'threatening' },
        ]},
    ],
    farewells: ['Move on.', 'Noted. Continue.', 'Dismissed.', 'Don\'t let me catch you again.', 'Stay compliant.', 'Taxes are due. Remember that.'],
  },
  corpo_military: {
    opening: [
      'Halt. State your clearance level.',
      'Unauthorized proximity detected. Step back.',
      'Sector is restricted. Authorized personnel only.',
      'You\'re in a tactical zone. One wrong move.',
      'PABLO CORP Security Division. This is a warning.',
      'Scanning... You\'re not in the system. Explain.',
    ],
    branches: [
      { playerText: 'I\'m just passing through.', npcReply: 'Everyone\'s just passing through. Not everyone makes it. Last week a "passerby" turned out to be Eastern Bloc recon. He didn\'t pass through.', mood: 'dismissive',
        followUp: [
          { playerText: 'What happened to him?', npcReply: 'Processed. That\'s the official word. Unofficially? He\'s in a containment cell on sublevel 3. Or what\'s left of him.', mood: 'cryptic',
            followUp: { playerText: 'That\'s dark.', npcReply: 'This is Minx City. Light is a luxury they tax you for. GRID TAX, to be specific.' , mood: 'dismissive' } },
        ]},
      { playerText: 'Who do you actually answer to?', npcReply: 'Chain of command goes: squad lead, sector captain, division commander, then... it gets blurry. The orders come from somewhere above floor 40. Nobody I\'ve met.', mood: 'cryptic',
        followUp: [
          { playerText: 'You take orders from someone you\'ve never met?', npcReply: 'Welcome to corporate military. The voice on the comm is the voice of God as far as we\'re concerned. Questioning it is a court-martial offense.', mood: 'dismissive' },
          { playerText: 'That doesn\'t bother you?', npcReply: 'Bothered stopped being relevant when I signed the contract. Eight-year term. Three to go. I\'ll think about what bothers me when I\'m out.', mood: 'cryptic' },
        ]},
      { playerText: 'What are you guarding?', npcReply: 'Asset protection detail. What the asset is? Classified. Where it\'s going? Classified. Why it matters? Above your pay grade and mine.', mood: 'dismissive',
        followUp: [
          { playerText: 'Must be important.', npcReply: 'Important enough to put eight armed personnel on a rotating twelve-hour watch. Make your own conclusions. Then forget you made them.', mood: 'threatening' },
        ]},
      { playerText: 'You ever fight the gangs?', npcReply: 'Void Runners last month. Border Gang the month before. Raiders every other Tuesday. It\'s a rotation at this point. They hit, we respond, bodies stack up, nothing changes.', mood: 'dismissive',
        followUp: [
          { playerText: 'Sounds like a losing war.', npcReply: 'It\'s not a war. Wars end. This is pest control. And the pests breed faster than we can spray.', mood: 'cryptic' },
          { playerText: 'Any of them ever get inside the city?', npcReply: 'Officially? No. The perimeter is impenetrable. Unofficially? Check the eastern district after midnight. You\'ll find your answer.', mood: 'conspiratorial' },
        ]},
      { playerText: 'Tough job.', npcReply: 'All assignments are tough when people are trying to kill you. The easy ones are the ones where they already have.', mood: 'cryptic' },
    ],
    farewells: ['Move out.', 'Proceed.', 'Area cleared.', 'Dismissed, civilian.', 'Return to your sector.'],
  },
  corpo_worker: {
    opening: [
      'Busy day. Always a busy day.',
      'Running diagnostics on my lunch break. Standard stuff.',
      'The reports won\'t file themselves. Believe me, I\'ve tried.',
      'Third coffee. Still not working. The coffee, I mean. I\'m always working.',
      'Don\'t talk to me before I\'ve cleared my inbox. Which is never.',
      'Another quarterly review. Another round of "restructuring." Same story.',
    ],
    branches: [
      { playerText: 'What do you do here?', npcReply: 'Compliance, mostly. I make sure the numbers align with the story they want told. If the numbers don\'t fit, I make them fit. That\'s the job.', mood: 'cryptic',
        followUp: [
          { playerText: 'You cook the books?', npcReply: 'I "align metrics with strategic narrative outcomes." That\'s what it says on the performance review. Same thing, better vocabulary.', mood: 'conspiratorial',
            followUp: { playerText: 'Doesn\'t that bother you?', npcReply: 'I have a mortgage, two kids in city school, and a CITIZEN REGISTRATION TAX that goes up every quarter. "Bother" is a feeling I can\'t afford.' , mood: 'cryptic' } },
          { playerText: 'Sounds stressful.', npcReply: 'Stress is baseline here. If you\'re not stressed, you\'re not paying attention. Or you\'re too high up to worry.', mood: 'dismissive' },
        ]},
      { playerText: 'How long have you worked here?', npcReply: 'Fourteen years. Started in data entry, worked my way up to "Senior Compliance Associate." Same desk. Same view. Slightly bigger monitor.', mood: 'cryptic',
        followUp: [
          { playerText: 'Fourteen years and just a bigger monitor?', npcReply: 'And a parking space. Level 3, slot 47. That slot is worth more than everything I own. Location-based TRANSIT TAX exemption.', mood: 'cryptic' },
          { playerText: 'You could leave.', npcReply: 'Leave and go where? The wasteland? I\'ve seen what\'s out there. I\'ll take the cubicle and the tax burden over a scrap tent and a raider problem.', mood: 'dismissive' },
        ]},
      { playerText: 'What\'s it like working for PABLO CORP?', npcReply: 'Imagine being a cog in a machine that\'s also somehow on fire. You can\'t stop turning, you can\'t put out the fire, and if you complain, they replace you with a cheaper cog.', mood: 'cryptic',
        followUp: [
          { playerText: 'Why does everyone stay?', npcReply: 'Benefits. PABLO CORP employees get reduced GRID TAX, subsidized water, and access to the medical floor. Outside? You\'re paying triple and getting nothing.', mood: 'cryptic' },
          { playerText: 'That sounds miserable.', npcReply: 'Miserable with healthcare versus miserable without. Easy math.', mood: 'dismissive' },
        ]},
      { playerText: 'Know anything useful?', npcReply: 'Useful to who? I know the quarterly report is fiction. I know the expense accounts on floor 30 don\'t add up. I know the elevator to floor 40 requires a key nobody has. Pick one.', mood: 'conspiratorial',
        followUp: [
          { playerText: 'Tell me about floor 40.', npcReply: 'Nobody goes above 39. The elevator exists, the button exists, but the key... I\'ve worked here fourteen years and I\'ve never seen anyone use it. Not once.', mood: 'cryptic',
            followUp: { playerText: 'What do you think is up there?', npcReply: 'I think that\'s a question that gets people transferred to "special projects." And nobody comes back from special projects.' , mood: 'conspiratorial' } },
          { playerText: 'The expense accounts. Tell me more.', npcReply: 'Millions flowing to something called "Project Meridian." No documentation. No approvals. Just money disappearing upward. I\'ve learned to look the other way.', mood: 'conspiratorial' },
        ]},
      { playerText: 'Any gossip?', npcReply: 'Gossip is a taxable social interaction here. I\'m not even joking. COMMUNICATIONS TAX covers "informal information exchange." But... between us? The CEO\'s office has been empty for two years.', mood: 'conspiratorial',
        followUp: [
          { playerText: 'Empty? Who\'s running things?', npcReply: 'That\'s the question, isn\'t it? Memos come down. Decisions get made. But nobody sits in that chair. Nobody. I walk past it every day.', mood: 'cryptic' },
        ]},
    ],
    farewells: ['Right. Back to it.', 'I have a meeting.', 'Stay out of trouble.', 'Meeting in five. Can\'t be late again.', 'Don\'t repeat any of that.', 'You never talked to me.'],
  },
  homeless: {
    opening: [
      'Hey. You got any fiat to spare?',
      'I used to work the towers. Long time ago.',
      'They took everything in the consolidation. Everything.',
      'Careful where you step. The ground remembers.',
      'You\'ve got that look. The one that says you still have something to lose.',
      'Sit down if you want. Nobody sits with me anymore.',
      'I remember when this street had trees. Real ones.',
    ],
    branches: [
      { playerText: 'What happened to you?', npcReply: 'PABLO CORP buyout, \'91. Lost the job. Then the flat. Then the family. Then the name. City doesn\'t have a reset button. Trust me, I looked.', mood: 'cryptic',
        followUp: [
          { playerText: 'How do you survive out here?', npcReply: 'Scraps from the noodle bar. Rainwater when the acid levels are low enough. And the occasional kindness of strangers. Like you, maybe.', mood: 'desperate',
            followUp: { playerText: 'Here. Take something.', npcReply: 'Bless you. Real kindness... I forgot what it tasted like. Not the fiat — the gesture. That\'s worth more than anything in this city.' , mood: 'friendly' } },
          { playerText: 'I\'m sorry.', npcReply: 'Don\'t be sorry. Be careful. What happened to me can happen to anyone. One bad quarter. One "restructuring." One tax audit. And you\'re out here with me.', mood: 'cryptic' },
        ]},
      { playerText: 'Can I help?', npcReply: 'Already past helping. But it\'s kind of you to ask. That quality is rare enough to be a currency around here.', mood: 'friendly', effect: 'give_fiat',
        followUp: [
          { playerText: 'Tell me something useful. I\'ll make it worth your time.', npcReply: 'The sewer grate behind the PABLO CORP tower? It\'s not welded shut. Everyone thinks it is. But I\'ve seen people go in. Corporate types. After midnight. They never come out the same way.', mood: 'conspiratorial' },
          { playerText: 'What do you need most?', npcReply: 'Honestly? Someone to remember I exist. The city erases you when you can\'t pay. CITIZEN REGISTRATION TAX lapsed, so officially, I\'m nobody. A ghost.', mood: 'desperate' },
        ]},
      { playerText: 'Know any good spots?', npcReply: 'Under the east bridge if it\'s dry. The old metro station on line 3 — the one they "decommissioned." Still has power. Don\'t know why. Watch for the Rust boys after midnight.', mood: 'friendly',
        followUp: [
          { playerText: 'What\'s with the metro station?', npcReply: 'Power runs, lights flicker on at exactly 2:47 AM. Same time every night. I\'ve counted. Something down there is alive. Or running. Or waiting.', mood: 'cryptic' },
        ]},
      { playerText: 'Tell me about the old days.', npcReply: 'Before the consolidation? This was a real city. Markets with actual food. Parks. Kids playing. You could walk three blocks without seeing a gun or a camera. You could breathe without being taxed for the air.', mood: 'cryptic',
        followUp: [
          { playerText: 'What changed?', npcReply: 'PABLO CORP happened. Started buying everything. Slowly at first. Then all at once. One morning you woke up and the world had a new owner. Same sun. Different sky.', mood: 'cryptic',
            followUp: { playerText: 'And nobody fought back?', npcReply: 'Oh, people fought. The March of \'94. Three thousand in the streets. PABLO CORP called it a "tax compliance adjustment event." Officially, nobody died. Unofficially... well. Here I am. The only survivor who talks about it.' , mood: 'conspiratorial' } },
        ]},
      { playerText: 'Stay warm out here.', npcReply: 'Warmth is a luxury. But thank you. The words warm me as much as the fire would. Maybe more. Human decency — last free resource in Minx City.', mood: 'friendly' },
    ],
    farewells: ['Take care of yourself.', 'Watch your back out there.', 'May your luck hold.', 'Remember me when you make it.', 'The city takes. But sometimes it gives too. Stay open to it.', 'Be good out there. Someone has to be.'],
  },
  pedestrian: {
    opening: [
      'Just trying to get to work on time.',
      'Minx City never sleeps. Neither do I, apparently.',
      'You ever feel like you\'re being watched? I feel it constantly.',
      'Don\'t look at the cameras. They charge you for direct eye contact. I\'m not kidding.',
      'Late again. TRANSIT TAX went up. Can\'t afford the express lane anymore.',
      'Walk fast, look busy, don\'t make eye contact with police. That\'s the survival guide.',
      'My neighbor disappeared last week. Nobody\'s asking questions. That tells you everything.',
    ],
    branches: [
      { playerText: 'What\'s the mood out there?', npcReply: 'Tense. The gangs are quiet, which is somehow worse than loud. When the Void Runners go silent, something\'s being planned. When the Eastern Bloc goes dark, something\'s about to explode.', mood: 'cryptic',
        followUp: [
          { playerText: 'Should I be worried?', npcReply: 'Worried is baseline. If you\'re not worried, you\'re not paying attention. The real question is: are you prepared? Got weapons? Got a route out?', mood: 'cryptic',
            followUp: { playerText: 'A route out?', npcReply: 'North gate\'s still open if you know the guard rotation. Tuesdays and Thursdays, 3 AM shift change. Thirty-second window. Not that I\'ve counted or anything.' , mood: 'conspiratorial' } },
          { playerText: 'I can handle myself.', npcReply: 'That\'s what everyone says until they can\'t. But sure. You look tough enough. Just don\'t go near the eastern district after dark.', mood: 'dismissive' },
        ]},
      { playerText: 'Where are you headed?', npcReply: 'Market district. Same route every morning. I\'ve timed it: fourteen minutes if I cut through the alley behind the bank. Seventeen if the police checkpoint is up.', mood: 'friendly',
        followUp: [
          { playerText: 'That checkpoint comes and goes?', npcReply: 'Random. Or "random." My theory is they set it up when they need to hit their weekly tax collection quota. Stop ten people, fine eight of them, quota met.', mood: 'conspiratorial' },
        ]},
      { playerText: 'Anything interesting happening?', npcReply: 'Interesting? The neon sign on 4th Street exploded yesterday. Killed a pigeon. That was the highlight of my week. Also, the bakery started selling synthetic bread that actually tastes like bread.', mood: 'friendly',
        followUp: [
          { playerText: 'Synthetic bread that tastes real?', npcReply: 'Best thing in the district. ƒ200 a loaf, which is robbery, but it\'s the closest thing to pre-consolidation food I\'ve had in years. Third stall on the left, if you\'re looking.', mood: 'friendly' },
          { playerText: 'A pigeon? I thought they were extinct.', npcReply: 'Officially extinct since \'98. But I\'ve seen three this month. Either they\'re coming back or PABLO CORP is manufacturing fake pigeons. Neither option comforts me.', mood: 'cryptic' },
        ]},
      { playerText: 'How do you afford to live here?', npcReply: 'Barely. After GRID TAX, WATER TAX, INFRASTRUCTURE TAX, COMMUNICATIONS TAX, and CITIZEN REGISTRATION TAX... I keep about thirty percent of my paycheck. I share a flat with four other people.', mood: 'desperate',
        followUp: [
          { playerText: 'That\'s insane.', npcReply: 'That\'s Minx City. The alternative is the wasteland. And out there, the taxes are replaced by bullets. At least taxes don\'t physically kill you. Usually.', mood: 'cryptic' },
          { playerText: 'Why not leave?', npcReply: 'Leave? With what? PABLO CORP charges an EXIT TAX. Twenty thousand fiat. Nobody has that. It\'s a cage with nice lighting and bad food.', mood: 'desperate' },
        ]},
      { playerText: 'My neighbor disappeared last week.', npcReply: 'Don\'t look into it. Seriously. The last person who filed a missing persons report got a visit from two men in gray suits. They never filed anything again.', mood: 'conspiratorial',
        followUp: [
          { playerText: 'Men in gray suits?', npcReply: 'PABLO CORP Internal Affairs. Or that\'s what people call them. They don\'t have badges. They don\'t have names. They just... appear. And then things get quiet again.', mood: 'conspiratorial' },
        ]},
      { playerText: 'How long have you lived here?', npcReply: 'Grew up in the east sector. Before it was renamed. Before everything changed. My parents came during the migration wave. Back when the city still accepted refugees.', mood: 'cryptic',
        followUp: [
          { playerText: 'They don\'t accept refugees anymore?', npcReply: 'PABLO CORP sealed the borders in \'99. "Resource management." Now it\'s get in through the smuggler routes or don\'t get in at all. The gangs control that market now.', mood: 'cryptic' },
        ]},
    ],
    farewells: ['Good luck.', 'Keep moving.', 'Eyes open out there.', 'Stay low.', 'Don\'t trust the vending machines. I\'m serious.', 'Taxes are due. They\'re always due.'],
  },
  dealer_papers: {
    opening: [
      'Fresh papers. Current issue. Don\'t let PABLO CORP see you reading it.',
      'News from the underground. Actual news. Not the sanctioned kind.',
      'You want the truth? I\'ve got it right here. For a price.',
      'Psst. The Minx Herald. Hot off the press. Literally — they tried to burn the printing house again.',
      'You look like someone who reads. A dying breed.',
      'Today\'s headline: "PABLO CORP denies everything." Broad enough to be evergreen.',
    ],
    branches: [
      { playerText: 'What\'s in the paper today?', npcReply: 'Three stories they don\'t want you to read. One about the missing workers from floor 37. One about the water contamination in sector 5. And one about where Senior Pablo actually is. Or isn\'t.', mood: 'conspiratorial',
        followUp: [
          { playerText: 'Where is Senior Pablo?', npcReply: 'That\'s the million-fiat question. Official story: "overseeing strategic operations abroad." Our sources say nobody\'s seen him in person since 2019. Not his staff. Not his security. Nobody.', mood: 'conspiratorial',
            followUp: { playerText: 'Then who\'s running PABLO CORP?', npcReply: 'Algorithms. AI. A board of directors who take orders from an empty chair. Or someone behind the chair. We\'re investigating. Emphasis on "trying to stay alive while investigating."' , mood: 'conspiratorial' } },
          { playerText: 'Water contamination?', npcReply: 'Sector 5 residents reported blue water for three days. PABLO CORP said it was a "mineral enhancement." Our chemist says it was industrial runoff from the weapons plant. Sixteen people hospitalized.', mood: 'cryptic' },
        ]},
      { playerText: 'Is it safe to be selling this?', npcReply: 'Safe? No. Three sellers were "relocated" last month. One turned up in the waste district with no memory of who he was. The other two haven\'t turned up at all.', mood: 'cryptic',
        followUp: [
          { playerText: 'Then why do you do it?', npcReply: 'Because somebody has to. And because the alternative — everyone believing the official story — is scarier than anything they can do to me individually.', mood: 'cryptic' },
        ]},
      { playerText: 'Who writes this stuff?', npcReply: 'Twelve people. No names. No faces. They communicate through dead drops and encrypted channels. Even I don\'t know who they all are. Safer that way.', mood: 'conspiratorial',
        followUp: [
          { playerText: 'How do I contact them?', npcReply: 'You don\'t. They contact you. If your story is big enough and your risk tolerance is high enough, they\'ll find you. They always do.', mood: 'cryptic' },
        ]},
      { playerText: 'I want to support the cause.', npcReply: 'Best way? Read. Share. Remember. The paper costs ƒ500 but the information is priceless. And if you see something — anything — leave a note at the old phone booth on 7th. Blue tape.', mood: 'friendly' },
      { playerText: 'Any tips for surviving this city?', npcReply: 'Never carry more fiat than you can afford to lose. The taxes hit random. Police shakedowns, surveillance assessments, "compliance audits." Keep a stash somewhere off-grid.', mood: 'friendly',
        followUp: [
          { playerText: 'Off-grid? Where?', npcReply: 'I know a guy. Runs a physical lockbox service in the waste district. No digital records. No PABLO CORP tracking. No tax. It\'s the last free economy in this hemisphere.', mood: 'conspiratorial' },
        ]},
    ],
    farewells: ['Stay informed.', 'Knowledge is armor.', 'Come back tomorrow.', 'Read it and burn it.', 'The truth is out there. And so is the danger.', 'Eyes open, mouth shut.'],
  },
  dealer_weapons: {
    opening: [
      'What\'re you shopping for? Defense or offense?',
      'Quality hardware. No questions asked. That\'s the deal.',
      'You look like someone who knows what they need.',
      'The wasteland\'s getting worse. Business has never been better.',
      'PABLO CORP decree says no civilian weapons. I say PABLO CORP can take a walk.',
      'Fresh shipment. Eastern Bloc surplus. The good stuff.',
    ],
    branches: [
      { playerText: 'What do you recommend?', npcReply: 'Depends on your problem. Gangs? Go heavy — they outnumber you. Corpo patrols? Go quiet — they\'re armored but slow. Police? Don\'t shoot police. That\'s a one-way trip.', mood: 'friendly',
        followUp: [
          { playerText: 'What about for the wasteland?', npcReply: 'Range. You want range out there. The Raiders and Border Gang don\'t do close quarters if they can help it. They snipe. So you snipe better. Or you don\'t come home.', mood: 'friendly' },
          { playerText: 'What\'s your best seller?', npcReply: 'Modified pulse pistol. Pre-collapse military tech. Clean, reliable, and it cycles fast. Not cheap, but dying is more expensive.', mood: 'friendly' },
        ]},
      { playerText: 'Is this stuff legal?', npcReply: 'PABLO CORP Decree 12 says civilian weapons are "temporarily restricted." That was nine years ago. Temporarily. My price list has a different perspective on the law.', mood: 'dismissive',
        followUp: [
          { playerText: 'Aren\'t you worried about the police?', npcReply: 'The police are my third-best customers. After the corpo security teams and the gangs. Everybody needs hardware. The decree is theater.', mood: 'conspiratorial' },
        ]},
      { playerText: 'Where do you get this?', npcReply: 'Eastern Bloc surplus, mostly. Decommissioned military stock. Some stuff comes from the southern foundries — the Border Gang has a production line that would make PABLO CORP jealous.', mood: 'dismissive',
        followUp: [
          { playerText: 'The Border Gang makes weapons?', npcReply: 'Makes, sells, trades. They\'re not just thugs. They\'re an economy. Underground. Untaxed. That\'s why PABLO CORP hates them most. Not the violence — the tax evasion.', mood: 'conspiratorial' },
        ]},
      { playerText: 'Business good lately?', npcReply: 'Best quarter I\'ve ever had. Which tells you everything about the state of the city. When weapons sales peak, peace has left the building. With its bags packed.', mood: 'cryptic',
        followUp: [
          { playerText: 'Something coming?', npcReply: 'I don\'t predict. I observe. And what I\'m observing is bulk orders. Group buys. Somebody is arming up for something big. Multiple factions, simultaneously.', mood: 'conspiratorial' },
        ]},
      { playerText: 'Just browsing.', npcReply: 'Browsing\'s free. The only free thing left in Minx City, actually. Everything else has a PABLO CORP tax attached. Even breathing, I think. Come back when you\'re ready to invest in your survival.', mood: 'friendly' },
    ],
    farewells: ['Stay armed.', 'Come back when loaded.', 'Good hunting.', 'Don\'t die out there. Dead men don\'t repeat-buy.', 'The wasteland respects firepower. Remember that.'],
  },
  blade_runner: {
    opening: [
      'Replicant activity logged in this sector. You look... organic enough.',
      'Neural scan shows clear. For now.',
      'My job is to find what doesn\'t belong. You wouldn\'t know anything about that.',
      'Third scan this hour. All false positives. Or all perfect camouflage. Can\'t tell anymore.',
      'The Voight-Kampff came back inconclusive. That\'s a first.',
      'Don\'t move. I need to read your eyes. ... Okay. You\'re clean. Probably.',
    ],
    branches: [
      { playerText: 'Are you looking for someone?', npcReply: 'Something. The distinction matters in this line of work. Replicants aren\'t "someones" anymore. New directive from PABLO CORP. They\'re inventory.', mood: 'cryptic',
        followUp: [
          { playerText: 'You don\'t agree with that?', npcReply: 'I\'ve retired fourteen replicants. Three of them cried. One of them said my name. My real name. The one I don\'t use anymore. Tell me those aren\'t "someones."', mood: 'cryptic',
            followUp: { playerText: 'That\'s heavy.', npcReply: 'Heavy is the job description. They don\'t put that in the recruitment poster. "Blade Runner: Must be comfortable with existential dread and moral compromise."' , mood: 'cryptic' } },
          { playerText: 'What happens to the ones you find?', npcReply: 'Officially: decommissioned. Returned to PABLO CORP for recycling. What actually happens... I stopped asking after year two. The answers weren\'t making my sleep better.', mood: 'cryptic' },
        ]},
      { playerText: 'What does a replicant look like?', npcReply: 'Like everyone else. That\'s the problem and the job. Perfect skin, perfect responses, perfect everything. Too perfect. That\'s usually the tell. Real humans are messy. Replicants are... optimized.', mood: 'cryptic',
        followUp: [
          { playerText: 'How do you tell the difference?', npcReply: 'Micro-expressions. Pupil dilation under emotional stress. The way they process unexpected cruelty. Or beauty. A real person flinches. A replicant... calculates. Even when they\'re trying not to.', mood: 'cryptic' },
        ]},
      { playerText: 'How many are there?', npcReply: 'PABLO CORP says twelve confirmed at large. My count is closer to forty. Some are so deep-cover they don\'t know they\'re replicants. Implanted memories. Entire false lives.', mood: 'conspiratorial',
        followUp: [
          { playerText: 'They don\'t know what they are?', npcReply: 'Some don\'t. Imagine finding out your childhood is a subroutine. Your mother is a data set. Your first kiss was a calibration test. I\'ve broken that news. It doesn\'t go well.', mood: 'cryptic' },
          { playerText: 'Could I be one?', npcReply: '...That\'s a question real humans ask. Replicants never do. Or maybe they\'re programmed not to. I\'ve stopped knowing where the line is. And that terrifies me.', mood: 'cryptic' },
        ]},
      { playerText: 'Must be a tough gig.', npcReply: 'Every gig in Minx City is tough. Mine just comes with a mandate and a gun and the knowledge that anything I shoot might feel pain in a way I can\'t distinguish from my own.', mood: 'dismissive' },
    ],
    farewells: ['Under observation.', 'Stay human.', 'Log complete.', 'Scan clear. Move along.', 'If you see something off... no. Forget I said that. Keep walking.'],
  },
  gang_patrol: {
    opening: [
      'This is our block. What\'s your business here?',
      'You got a reason to be in the territory?',
      'Eyes on you, stranger. Don\'t make it into something.',
      'New face. I don\'t like new faces.',
      'You\'re either lost or stupid. Which one?',
      'PABLO CORP doesn\'t patrol out here. We do. And our taxes are... different.',
    ],
    branches: [
      { playerText: 'Just passing through.', npcReply: 'Pass through fast. And keep your hands visible. My people get nervous around strangers. And nervous people make bad decisions.', mood: 'threatening',
        followUp: [
          { playerText: 'How do I get through safely?', npcReply: 'Stick to the main road. Don\'t look at anyone. Don\'t touch anything. And if someone asks for a toll... pay it. The alternative is medical bills. Or a burial.', mood: 'threatening' },
        ]},
      { playerText: 'I\'m not looking for trouble.', npcReply: 'Smart. Trouble finds you anyway out here, but being smart about it buys you time. Most people who die in the waste died because they ran their mouth first.', mood: 'cryptic',
        followUp: [
          { playerText: 'What do people die over out here?', npcReply: 'Territory. Resources. Pride. Mostly pride. Someone looks at someone wrong, next thing you know there\'s a body. Then two. Then it\'s a war. Wars are expensive. And nobody wins.', mood: 'cryptic' },
          { playerText: 'How do you stay alive?', npcReply: 'Numbers. Community. And knowing when to fight and when to fold. The gangs that survive aren\'t the toughest — they\'re the smartest. Tough gets you killed. Smart gets you territory.', mood: 'cryptic' },
        ]},
      { playerText: 'Who runs this area?', npcReply: 'I do. Or my boss does. Depends who\'s asking and why. And if you\'re asking because you think you can take it from us... line forms to the left. It\'s a short line. Nobody survives it.', mood: 'threatening',
        followUp: [
          { playerText: 'I respect the hierarchy.', npcReply: 'Good. Respect is the only currency worth more than fiat out here. You can\'t tax respect. PABLO CORP tries, but respect doesn\'t show up on their scanners.', mood: 'friendly' },
        ]},
      { playerText: 'Why not just move into the city?', npcReply: 'The city? Where they tax you for breathing, watching, walking, and existing? Where cameras track every step and police shake you down for crossing a line painted on the ground? No thanks. Out here we\'re free.', mood: 'dismissive',
        followUp: [
          { playerText: 'Free with Raiders and gangs?', npcReply: 'Free with consequences. The city is a cage where someone else decides the consequences. Out here, at least I get to decide my own. That\'s worth more than a warm bed.', mood: 'cryptic' },
        ]},
      { playerText: 'I want to join.', npcReply: 'Join? Cute. We don\'t recruit strangers. Earn trust first. Run some jobs. Prove you can handle yourself in the waste. Then maybe — maybe — someone talks to you about it.', mood: 'dismissive',
        followUp: [
          { playerText: 'What kind of jobs?', npcReply: 'Supply runs. Scrap recovery. Occasionally dealing with rival factions who cross the line. Literally. The border is painted in red for a reason.', mood: 'friendly' },
        ]},
    ],
    farewells: ['Move on.', 'Don\'t come back.', 'Keep walking.', 'Remember: this is our turf. Act accordingly.', 'You got a pass today. Don\'t count on a second one.', 'Stay out of trouble. Or at least stay out of our trouble.'],
  },
  guard: {
    opening: [
      'Authorized access only beyond this point.',
      'Credentials required. Do you have credentials?',
      'No loitering in restricted zones. Keep moving.',
      'PABLO CORP property. State your purpose.',
      'Another day, another door. My whole life is this door.',
      'Twelve hours. Same door. Same corridor. Same question: "Can I go in?" Answer: no.',
    ],
    branches: [
      { playerText: 'I have business inside.', npcReply: 'Business requires authorization. Authorization requires clearance. Clearance requires a sponsor. Do you have a sponsor? Because right now, all I see is someone who\'s about to be disappointed.', mood: 'dismissive',
        followUp: [
          { playerText: 'How do I get a sponsor?', npcReply: 'Apply through PABLO CORP Civilian Affairs. Floor 3, window 7. Open Tuesday and Thursday, 10 to 2. Bring identification, tax compliance certificates, and ƒ2,000 processing fee. Non-refundable.', mood: 'dismissive' },
          { playerText: 'What if I know someone inside?', npcReply: 'Then have them come out and vouch for you. In person. With their badge visible. I don\'t do "I know a guy" at this post. Too many infiltrators using that line.', mood: 'dismissive' },
        ]},
      { playerText: 'What\'s this building actually for?', npcReply: 'Officially: "PABLO CORP Administrative Annex B." What that means? Data processing. Records. Filing. The most boring thing in the city. That\'s the official version.', mood: 'cryptic',
        followUp: [
          { playerText: 'And the unofficial version?', npcReply: 'I guard a door. I don\'t look through it. The one time I did, I saw something I can\'t explain and my supervisor explained that I never saw it. Very clearly.', mood: 'conspiratorial' },
        ]},
      { playerText: 'Long shift?', npcReply: 'Twelve hours. Four to go. The building doesn\'t know what time it is. The corridor doesn\'t change. The door doesn\'t move. But something behind it hums. Constantly. I pretend not to hear it.', mood: 'cryptic',
        followUp: [
          { playerText: 'A humming sound?', npcReply: 'Low. Constant. Gets louder at night. My partner says it\'s the ventilation system. But I\'ve worked next to ventilation systems. They don\'t hum like that. That\'s... something else.', mood: 'cryptic',
            followUp: { playerText: 'You\'re not curious?', npcReply: 'Curiosity is a luxury I can\'t afford. I\'ve got two more years on this contract. Then a pension. Then I never think about doors or humming again. That\'s the plan.' , mood: 'dismissive' } },
        ]},
      { playerText: 'What do they pay you for this?', npcReply: 'ƒ3,800 a month. After taxes it\'s about ƒ2,400. PROTECTION TAX, GRID TAX, LOYALTY CONTRIBUTION, SECTOR MAINTENANCE LEVY. I\'m basically paying them to let me stand here.', mood: 'cryptic',
        followUp: [
          { playerText: 'The taxes are brutal.', npcReply: 'PABLO CORP takes from every direction. Even guards get taxed for "utilizing company property" — meaning the ground I stand on. They charge me rent for my post.', mood: 'desperate' },
        ]},
    ],
    farewells: ['Proceed to the exit.', 'Area secured.', 'Have a good evening.', 'The door stays closed. So do I.', 'You didn\'t see me. I didn\'t see you.', 'Stay on the other side of this line.'],
  },
  default: {
    opening: [
      'Another day in Minx City.',
      'You\'re not from around here, are you?',
      'I\'ve been here long enough to know when to keep quiet.',
      'The city keeps going. Don\'t ask me why.',
      'You look like you still have questions. Most of us gave up on those.',
      'Every morning I wake up and the city is still here. I don\'t know if that\'s good or bad.',
      'I remember when the sky was blue. Not blue-ish. Actually blue.',
    ],
    branches: [
      { playerText: 'What\'s going on around here?', npcReply: 'More than I\'d like to admit and less than you probably think. The city runs on fear, fiat, and the collective agreement not to look too closely at anything.', mood: 'cryptic',
        followUp: [
          { playerText: 'Not to look closely at what?', npcReply: 'At the empty offices above floor 40. At where the tax money actually goes. At why people disappear and nobody files reports. At the fact that the city\'s founder hasn\'t been seen in years.', mood: 'conspiratorial',
            followUp: { playerText: 'You think something\'s wrong at the top?', npcReply: 'I think "wrong" implies there was ever a "right." PABLO CORP was born wrong. It just took the rest of us a while to notice. By then, it was too late to leave.' , mood: 'cryptic' } },
        ]},
      { playerText: 'Any advice for a stranger?', npcReply: 'Pay your taxes. Don\'t ask about floor 40. Don\'t make eye contact with police longer than 1.5 seconds. Keep emergency fiat in your sock. Never eat from the north-district vendors. That covers eighty percent of survival.', mood: 'friendly',
        followUp: [
          { playerText: 'What about the other twenty percent?', npcReply: 'Luck. Pure, stupid luck. You can do everything right in this city and still get hit by a stray bullet, a random tax audit, or a gang war. The twenty percent is prayer.', mood: 'cryptic' },
        ]},
      { playerText: 'Seen anything strange lately?', npcReply: 'Define "strange" in a city where police shake you down for BREATHING TAX and cameras fine you for JAYWALKING TAX. Strange is baseline. Normal is the thing that\'s strange here.', mood: 'cryptic',
        followUp: [
          { playerText: 'You know what I mean.', npcReply: 'Okay, fine. The lights on floor 62 of Shadow Tower. They go on at exactly midnight and off at exactly 3 AM. Every night. That floor is supposed to be abandoned. It\'s not.', mood: 'conspiratorial' },
        ]},
      { playerText: 'How do people actually live here?', npcReply: 'Paycheck to paycheck. After PABLO CORP takes their cut — and they take from every angle — most people have just enough to eat, sleep indoors, and commute to a job that barely covers it. It\'s a designed poverty.', mood: 'cryptic',
        followUp: [
          { playerText: 'Designed?', npcReply: 'You think it\'s an accident that taxes take exactly enough to keep you dependent? Not enough to kill you. Just enough to make sure you can never leave. That\'s engineering, not governance.', mood: 'conspiratorial' },
        ]},
      { playerText: 'Tell me about the wasteland.', npcReply: 'Beyond the walls? Gangs, scrap, and freedom. Real freedom. The kind that kills you if you\'re not careful but at least it\'s yours. A lot of people dream about it. Not many actually go.', mood: 'cryptic',
        followUp: [
          { playerText: 'Why not?', npcReply: 'Exit tax. Twenty thousand fiat. And even if you pay it, the gangs outside take their own toll. You leave the city poor and arrive in the waste broke. Most people come crawling back within a week.', mood: 'dismissive' },
        ]},
      { playerText: 'Thanks. Take care.', npcReply: 'You too. And I mean that — it\'s harder than it sounds around here. Kindness is a muscle most people let atrophy. Don\'t let that happen to you.', mood: 'friendly' },
    ],
    farewells: ['Take care.', 'Safe travels.', 'Good luck out there.', 'Stay low. Stay smart.', 'Remember: you didn\'t hear any of this from me.', 'The city takes. Try to take something back.'],
  },
};

export function getGenericDialogueTree(npcName: string, role: string | undefined, job: string, npcSeed: number): DialogueTree {
  const roleKey: GenericNpcRole = (role as GenericNpcRole) ?? 'default';
  const template = GENERIC_TEMPLATES[roleKey] ?? GENERIC_TEMPLATES.default;

  const openingIdx = npcSeed % template.opening.length;
  const openingText = template.opening[openingIdx];

  const branchCount = 3 + (npcSeed % 2);
  const shuffled = [...template.branches].sort((a, b) => {
    const ha = ((npcSeed * 31 + template.branches.indexOf(a) * 7) % 17);
    const hb = ((npcSeed * 31 + template.branches.indexOf(b) * 7) % 17);
    return ha - hb;
  });
  const selectedBranches = shuffled.slice(0, Math.min(branchCount, shuffled.length));

  const farewellIdx = (npcSeed + 1) % template.farewells.length;
  const farewellText = template.farewells[farewellIdx];

  const nodes: Record<string, DialogueNode> = {
    start: {
      id: 'start',
      speaker: npcName,
      portrait: 'npc',
      text: openingText,
      choices: [
        ...selectedBranches.map((b, i) => ({ text: b.playerText, nextId: `branch_${i}` })),
        { text: 'Never mind. Goodbye.', nextId: null },
      ],
    },
  };

  for (let i = 0; i < selectedBranches.length; i++) {
    const branch = selectedBranches[i];
    const hasFollowUp = branch.followUp && branch.followUp.length > 0;

    if (hasFollowUp) {
      const followUps = branch.followUp!;
      nodes[`branch_${i}`] = {
        id: `branch_${i}`,
        speaker: npcName,
        portrait: 'npc',
        text: branch.npcReply,
        choices: [
          ...followUps.map((fu, fi) => ({ text: fu.playerText, nextId: `branch_${i}_fu_${fi}` })),
          { text: farewellText, nextId: null },
        ],
        effect: branch.effect,
      };

      for (let fi = 0; fi < followUps.length; fi++) {
        const fu = followUps[fi];
        const hasDeepFollowUp = fu.followUp;

        if (hasDeepFollowUp) {
          nodes[`branch_${i}_fu_${fi}`] = {
            id: `branch_${i}_fu_${fi}`,
            speaker: npcName,
            portrait: 'npc',
            text: fu.npcReply,
            choices: [
              { text: hasDeepFollowUp.playerText, nextId: `branch_${i}_fu_${fi}_deep` },
              { text: farewellText, nextId: null },
            ],
          };
          nodes[`branch_${i}_fu_${fi}_deep`] = {
            id: `branch_${i}_fu_${fi}_deep`,
            speaker: npcName,
            portrait: 'npc',
            text: hasDeepFollowUp.npcReply,
            choices: [{ text: farewellText, nextId: null }],
          };
        } else {
          nodes[`branch_${i}_fu_${fi}`] = {
            id: `branch_${i}_fu_${fi}`,
            speaker: npcName,
            portrait: 'npc',
            text: fu.npcReply,
            choices: [{ text: farewellText, nextId: null }],
          };
        }
      }
    } else {
      nodes[`branch_${i}`] = {
        id: `branch_${i}`,
        speaker: npcName,
        portrait: 'npc',
        text: branch.npcReply,
        choices: [{ text: farewellText, nextId: null }],
        effect: branch.effect,
      };
    }
  }

  return { npcName, startId: 'start', nodes };
}

// ── Rumor System ─────────────────────────────────────────────────────────────
export const RUMORS: string[] = [
  'Someone saw lights on Floor 62 last night...',
  'The Iron Rats are planning a push into Void Dogs territory.',
  'PABLO CORP raised water prices again. Third time this month.',
  'A courier disappeared near the eastern ruins. Nobody\'s talking.',
  'The clinic is running low on med kits. Stock up.',
  'Someone found a pre-collapse bunker under the scrap yard.',
  'The Void Dogs alpha was spotted near the northern gate.',
  'Static Monks are recruiting. Something big is coming.',
  'A trader at the black market is selling fake passports.',
  'The subway tunnels connect to something deeper...',
  'PABLO CORP is hiring contractors. Nobody knows for what.',
  'An android in the east district developed emotions. They\'re hiding.',
  'The Noodle Bar has the best ramen in Minx City. Fight me.',
  'Eastern Bloc found old military tech. Weapon parts everywhere.',
  'The power grid flickers every night at exactly 2:47 AM.',
  'A fire broke out near the scrap yard. Nobody came to help.',
  'Someone grafitti\'d "PABLO LIES" on Shadow Tower. It lasted 3 minutes.',
  'The Rust Porch has a secret room. Ask for the \'special.\'',
  'Civic Row is parceling out land again. Get a unit before PABLO CORP buys the block.',
  'Co-working floor rents terminals by the minute. Cheapest desk in the city if you need to work.',
  'Smart money is leasing office space up the tower before the rent index climbs again.',
  'You want contacts? Sit at the Minx Bar after dark. Every crew chief drinks there.',
  'The nightclub back room is where half the city\'s deals actually close.',
  'Empty floors are vacancies. Ride the elevator, claim one with a passcode, make it yours.',
];

// ── Character Customization ──────────────────────────────────────────────────
// Every in-game outfit is one of the nine subculture STYLES below. Each is an
// optional costume bought with in-game FIAT (never real money). A player's
// faction grants its matching style FREE at start (see WorldPlay/WorldMenu
// start-outfit grants); all the others must be purchased from the wardrobe.
export type CostumeStyle =
  | 'default' | 'suit' | 'pant_suit' | 'business_casual'
  | 'punk' | 'rocker' | 'goth' | 'wasteland' | 'cyberpunk' | 'solarpunk';
export interface Clothing {
  id: string; name: string; desc: string; price: number; color: string;
  // Render hints consumed by the procedural avatar draw routine.
  style: CostumeStyle; accent: string;
}
export type Costume = Clothing;

export const CLOTHES: Clothing[] = [
  { id: 'default', name: 'STANDARD ISSUE', desc: 'Basic civilian clothing.', price: 0, color: '#38bdf8', style: 'default', accent: '#1e3055' },
  { id: 'suit', name: 'SUIT', desc: 'Sharp single-breasted suit and tie. Boardroom armor.', price: 15000, color: '#1e3055', style: 'suit', accent: '#cc1111' },
  { id: 'pant_suit', name: 'PANT SUIT', desc: 'Tailored pant suit. Power without the tie.', price: 15000, color: '#3a2e44', style: 'pant_suit', accent: '#d8c8e8' },
  { id: 'business_casual', name: 'BUSINESS CASUAL', desc: 'Open collar, chinos, rolled sleeves. Off-the-clock pro.', price: 9000, color: '#3a6b58', style: 'business_casual', accent: '#f0ead8' },
  { id: 'punk', name: 'PUNK', desc: 'Studded leather, torn everything, loud as hell.', price: 11000, color: '#c2228a', style: 'punk', accent: '#ffe000' },
  { id: 'rocker', name: 'ROCKER', desc: 'Black leather jacket, band patches, attitude.', price: 12000, color: '#1a1a22', style: 'rocker', accent: '#aa2222' },
  { id: 'goth', name: 'GOTH', desc: 'All black, high collar, silver chains, pale.', price: 12000, color: '#221a2e', style: 'goth', accent: '#7a4a9a' },
  { id: 'wasteland', name: 'WASTELAND WEAR', desc: 'Reinforced rags, straps, dust-proof.', price: 12000, color: '#7a6238', style: 'wasteland', accent: '#4a3a20' },
  { id: 'cyberpunk', name: 'CYBER PUNK', desc: 'Neon trim, chrome plating, glowing circuitry.', price: 18000, color: '#241640', style: 'cyberpunk', accent: '#00f0ff' },
  { id: 'solarpunk', name: 'SOLAR PUNK', desc: 'Living fabric, gold solar trim, woven leaves.', price: 16000, color: '#2a9d5a', style: 'solarpunk', accent: '#e8d070' },
];
export const COSTUMES = CLOTHES;

// ── Time Zone Cities ─────────────────────────────────────────────────────────
export const TIMEZONE_CITIES = [
  { id: 'pst', label: `${CITY_NAME} (PST)`, offset: -8 },
  { id: 'est', label: 'NEW EDEN (EST)', offset: -5 },
  { id: 'cst', label: 'IRON FALLS (CST)', offset: -6 },
  { id: 'mst', label: 'DUST VALLEY (MST)', offset: -7 },
  { id: 'gmt', label: 'NEXUS PRIME (GMT)', offset: 0 },
  { id: 'cet', label: 'STEEL BERLIN (CET)', offset: 1 },
  { id: 'jst', label: 'NEO TOKYO (JST)', offset: 9 },
  { id: 'aest', label: 'CHROME SYDNEY (AEST)', offset: 10 },
  { id: 'ist', label: 'CYBER MUMBAI (IST)', offset: 5.5 },
] as const;

// ── Subscription Pricing ─────────────────────────────────────────────────────
export const SUBSCRIPTION_PRICING = {
  ECHO_7: { name: 'ECHO-7 NERVE TAP', monthlyFiat: 5, trialDays: 7 },
  OPTIC_9: { name: 'OPTIC-9 RETINAL SCANNER', monthlyFiat: 6, trialDays: 7 },
  VOX_4: { name: 'VOX-4 LARYNX MODULE', monthlyFiat: 4, trialDays: 7 },
  CIPHER_X: { name: 'CIPHER-X COMMAND TERMINAL', monthlyFiat: 5, trialDays: 7 },
  PRESENTATION: { name: 'HOLO-PROJ MK.II', monthlyFiat: 4, trialDays: 7 },
} as const;

// ── Weather Rendering Params ─────────────────────────────────────────────────
export interface WeatherParticle { x: number; y: number; vx: number; vy: number; size: number; }

export function createWeatherParticles(weather: WeatherType, count: number, canvasW: number, canvasH: number): WeatherParticle[] {
  const particles: WeatherParticle[] = [];
  if (weather !== 'RAIN' && weather !== 'SNOW' && weather !== 'STORM' && weather !== 'ACID_RAIN') return particles;
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * canvasW,
      y: Math.random() * canvasH,
      vx: weather === 'SNOW' ? (Math.random() - 0.5) * 0.5 : (Math.random() - 0.5) * 2,
      vy: weather === 'SNOW' ? 0.5 + Math.random() * 1 : 4 + Math.random() * 6,
      size: weather === 'SNOW' ? 2 + Math.random() * 3 : 1,
    });
  }
  return particles;
}

export function updateWeatherParticles(particles: WeatherParticle[], canvasW: number, canvasH: number): void {
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    if (p.y > canvasH) { p.y = -5; p.x = Math.random() * canvasW; }
    if (p.x < 0) p.x = canvasW;
    if (p.x > canvasW) p.x = 0;
  }
}

// ── Starter Weapon Lore Names ────────────────────────────────────────────────
export const LORE_WEAPON_NAMES: Record<string, { label: string; lore: string }> = {
  FISTS: { label: 'BARE FISTS', lore: 'No weapon needed. Street-hardened knuckles.' },
  KNIFE: { label: 'SWITCHBLADE', lore: 'Standard-issue blade. Every salaryman carries one.' },
  REVOLVER: { label: 'VOSS-6', lore: 'Six-shot revolver. Reliable. Loud.' },
  PISTOL: { label: 'VOSS-9 AUTO', lore: 'Corporate sidearm. Semi-automatic. Clean kills.' },
  SWORD: { label: 'ASHFANG', lore: 'Salvaged from the ruins of Old Minx. The blade remembers.' },
  RIFLE: { label: 'LONGREACH MK.4', lore: 'Outlaw standard. Reaches further than trust.' },
  GUN: { label: 'VOSS-9', lore: 'Standard-issue sidearm. Serial number filed off.' },
  LASER: { label: 'PRISM LANCE', lore: 'Pre-collapse military tech. Still hums.' },
  BOMB: { label: 'SHATTER CHARGE', lore: 'Improvised explosive. Loud. Effective.' },
  SHOTGUN: { label: 'THUNDERCLAP', lore: 'Close-range devastation. Three slugs per pull.' },
  SMG: { label: 'HORNET MK.II', lore: 'Rapid-fire submachine gun. Spray and pray.' },
  SNIPER: { label: 'GHOST NEEDLE', lore: 'One shot. One kill. From very far away.' },
  GRENADE_LAUNCHER: { label: 'HAVOC-40', lore: 'Grenade launcher. Area denial specialist.' },
  CROSSBOW: { label: 'WHISPER BOLT', lore: 'Silent killer. No alerts. No witnesses.' },
  BASEBALL_BAT: { label: 'SLUGGER', lore: 'Aluminum bat. Good for home runs and home defense.' },
  MACHETE: { label: 'JUNGLE FANG', lore: 'Fast slash. Cuts through anything organic.' },
  KATANA: { label: 'MOONBLADE', lore: 'Folded steel from the old world. Reach and precision.' },
  BRASS_KNUCKLES: { label: 'IRON KISS', lore: 'Weighted knuckles. Fast strikes. Chance to stun.' },
  CHAINSAW: { label: 'RIPPER', lore: 'Continuous damage. Very loud. Police magnet.' },
};

// ── Ambient Audio Identifiers ────────────────────────────────────────────────
export const AMBIENT_SOUNDS = {
  CITY_HUM: 'city_hum',
  WASTELAND_WIND: 'wasteland_wind',
  RAIN_LOOP: 'rain_loop',
  BREATHING: 'breathing',
  COMBAT_MUSIC: 'combat_music',
} as const;
