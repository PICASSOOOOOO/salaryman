// Single source of truth for the canonical in-game economy conversion legend —
// the "economy key" shown on the Game Economy page AND across onboarding, so a
// brand-new player always understands what ƒ (FIAT) is worth before committing
// to any money figure (salary, payroll, rent, starting balance).
//
// The authored baseline is $1 = ƒ100 = 0.01 GOLD. BTC is intentionally omitted
// here because it is a live multiplier shown by the shared economy disclosure.

export interface EconomyRail {
  /** Stable rail key — used to look up accent colors per surface. */
  code: 'USD' | 'FIAT' | 'GOLD';
  /** Short code label, e.g. "USD". */
  label: string;
  /** Display value on the rail, e.g. "$20". */
  value: string;
}

// $1 USD = ƒ100 FIAT = 0.01 GOLD at the BTC baseline.
export const ECONOMY_RAILS: EconomyRail[] = [
  { code: 'USD', label: 'USD', value: '$1' },
  { code: 'FIAT', label: 'FIAT', value: 'ƒ100' },
  { code: 'GOLD', label: 'GOLD', value: '0.01 GOLD' },
];

// One-line compact legend, e.g. "$20 = ƒ20,000 = 0.1 oz GOLD".
export const ECONOMY_KEY_LINE = ECONOMY_RAILS.map((r) => r.value).join(' = ');

// Short reassurance matching the Game Economy page wording — anything earned
// in-game is real money, the rate is fixed.
export const ECONOMY_KEY_NOTE = 'FIAT is the base currency. GOLD measures in-game wealth.';
