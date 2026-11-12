/**
 * Credit-score tier roadmap — pure action-derivation helpers.
 *
 * These functions mirror the "RAISE YOUR SCORE" UI logic in WorldPlay.tsx
 * exactly. Keeping them here (no DB or Express imports) means they can be
 * unit-tested without any server infrastructure and the same math is shared
 * between the API layer and the front-end build.
 */

export interface CreditInputs {
  jailVisits: number;
  jailMinutesServed: number;
  debt: number;
  totalDebtAccrued: number;
  negativeBalanceDays: number;
}

export interface CreditAction {
  text: string;
  pts: string;
  negative: boolean;
}

export interface CreditTier {
  key: string;
  label: string;
  min: number;
  max: number;
}

/**
 * Ordered lowest → highest (matches the UI's left-to-right visual order).
 * `CREDIT_TIERS.find(t => t.min > cscore)` returns the NEXT tier to reach.
 */
export const CREDIT_TIERS: CreditTier[] = [
  { key: 'POOR',      label: 'POOR',      min: 400, max: 579 },
  { key: 'FAIR',      label: 'FAIR',      min: 580, max: 669 },
  { key: 'GOOD',      label: 'GOOD',      min: 670, max: 739 },
  { key: 'EXCELLENT', label: 'EXCELLENT', min: 740, max: 800 },
];

/**
 * The tier ABOVE the player's current score, or undefined when the player
 * is already EXCELLENT (score ≥ 740).
 */
export function getNextTier(cscore: number): CreditTier | undefined {
  return CREDIT_TIERS.find((t) => t.min > cscore);
}

/**
 * How many points are needed to reach the next tier, or 0 when already at
 * the top tier.
 */
export function getPtsNeeded(cscore: number): number {
  const next = getNextTier(cscore);
  return next ? next.min - cscore : 0;
}

/**
 * Derive the personalised action items shown in the RAISE YOUR SCORE panel.
 *
 * @param inputs  Raw ledger inputs from the server (may be undefined when the
 *                credit endpoint doesn't include them yet).
 * @param cscore  Current credit score (400–800).
 * @param hasIncome  Whether the player has any active income source (job,
 *                   business, or org membership).
 */
export function getRoadmapActions(
  inputs: CreditInputs | undefined,
  cscore: number,
  hasIncome: boolean,
): CreditAction[] {
  const actions: CreditAction[] = [];

  if (inputs) {
    // Jail penalty ─────────────────────────────────────────────────────────
    if (inputs.jailVisits > 0) {
      actions.push({
        text: `Stay out of jail — ${inputs.jailVisits} visit${inputs.jailVisits !== 1 ? 's' : ''} on record`,
        pts: `-${inputs.jailVisits * 25} pts`,
        negative: true,
      });
    }

    // Current debt recovery ────────────────────────────────────────────────
    if (inputs.debt > 5_000) {
      const recov = Math.floor(inputs.debt / 5_000);
      actions.push({
        text: `Pay down current debt (ƒ${inputs.debt.toLocaleString()} outstanding)`,
        pts: `recover up to +${recov} pts`,
        negative: false,
      });
    }

    // Negative-balance-days penalty ────────────────────────────────────────
    if (inputs.negativeBalanceDays > 0) {
      actions.push({
        text: `Keep FIAT positive — ${inputs.negativeBalanceDays} day${inputs.negativeBalanceDays !== 1 ? 's' : ''} in the red`,
        pts: `-${inputs.negativeBalanceDays} pts`,
        negative: true,
      });
    }

    // Income-absent nudge ──────────────────────────────────────────────────
    if (!hasIncome) {
      actions.push({
        text: 'Get employed or register a business (proves income capacity)',
        pts: 'unlock +10 pts',
        negative: false,
      });
    }

    // Lifetime debt history penalty ────────────────────────────────────────
    if (inputs.totalDebtAccrued > 100_000) {
      const hist = Math.min(40, Math.floor((inputs.totalDebtAccrued / 50_000) - 1));
      if (hist > 0) {
        actions.push({
          text: `Lifetime debt history (ƒ${Math.round(inputs.totalDebtAccrued / 1_000)}K accrued total)`,
          pts: `-${hist} pts`,
          negative: true,
        });
      }
    }
  }

  // Clean-streak nudge (shown whenever score isn't maxed) ─────────────────
  if (cscore < 800) {
    actions.push({
      text: 'Stay clean — no debt, no jail, no negatives (earns +5 pts per week)',
      pts: 'up to +60 pts',
      negative: false,
    });
  }

  return actions;
}
