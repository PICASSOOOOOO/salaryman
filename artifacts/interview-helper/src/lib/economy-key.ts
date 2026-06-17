// Single source of truth for the fixed in-game economy conversion legend —
// the "economy key" shown on the Game Economy page AND across onboarding, so a
// brand-new player always understands what ƒ (FIAT) is worth before committing
// to any money figure (salary, payroll, rent, starting balance).
//
// The rate is FIXED and display-only — it never settles a charge. Changing the
// legend here changes it everywhere the key renders (Economy page + every
// onboarding step). Keep it in lockstep with the conversion the bank/economy
// backend actually uses ($20 USD = ƒ20,000 FIAT = 0.1 oz GOLD).

export interface EconomyRail {
  /** Stable rail key — used to look up accent colors per surface. */
  code: 'USD' | 'FIAT' | 'GOLD';
  /** Short code label, e.g. "USD". */
  label: string;
  /** Display value on the rail, e.g. "$20". */
  value: string;
}

// $20 USD = ƒ20,000 FIAT = 0.1 oz GOLD.
export const ECONOMY_RAILS: EconomyRail[] = [
  { code: 'USD', label: 'USD', value: '$20' },
  { code: 'FIAT', label: 'FIAT', value: 'ƒ20,000' },
  { code: 'GOLD', label: 'GOLD', value: '0.1 oz' },
];

// One-line compact legend, e.g. "$20 = ƒ20,000 = 0.1 oz GOLD".
export const ECONOMY_KEY_LINE = ECONOMY_RAILS.map((r) => r.value).join(' = ');

// Short reassurance matching the Game Economy page wording — anything earned
// in-game is real money, the rate is fixed.
export const ECONOMY_KEY_NOTE = 'Fixed rate. Anything you earn in-game is real money.';
