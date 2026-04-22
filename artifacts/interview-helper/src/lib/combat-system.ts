/**
 * Salaryman combat system add-ons:
 *  - Combo chain detection (sequential melee hits within a window)
 *  - Block / parry damage modifier
 *  - Hit-stop helper (microfreeze on heavy hits)
 *  - Stamina tracker (regenerates over time, drains on attack/block)
 *
 * This module is pure logic + DOM-free so it can be unit-tested. The
 * caller (WorldPlay.tsx) imports these helpers and applies them inside
 * its existing combat loop.
 */

const COMBO_WINDOW_MS = 650;
const MAX_COMBO = 5;
// Damage multipliers by combo step (1 = baseline)
const COMBO_MULTIPLIERS = [1, 1.15, 1.3, 1.5, 1.8, 2.2];

const BLOCK_DAMAGE_MULT = 0.25;          // 75% reduction while blocking
const PARRY_WINDOW_MS = 180;             // start of block = parry window
const PARRY_DAMAGE_MULT = 0;             // perfect parry = 0 damage (and counter)
const BLOCK_STAMINA_PER_HIT = 12;
const ATTACK_STAMINA_COST = 8;
const STAMINA_MAX = 100;
const STAMINA_REGEN_PER_SEC = 18;        // +18/sec while not attacking/blocking

const HIT_STOP_LIGHT_MS = 50;
const HIT_STOP_HEAVY_MS = 130;
const HEAVY_HIT_THRESHOLD = 35;          // damage >= 35 counts as heavy

export interface ComboState {
  count: number;
  lastHitAt: number;
}

export function makeCombo(): ComboState {
  return { count: 0, lastHitAt: 0 };
}

/** Register a successful melee hit. Returns the new combo step (1..MAX_COMBO). */
export function registerComboHit(state: ComboState, now = Date.now()): number {
  if (now - state.lastHitAt > COMBO_WINDOW_MS) {
    state.count = 1;
  } else {
    state.count = Math.min(state.count + 1, MAX_COMBO);
  }
  state.lastHitAt = now;
  return state.count;
}

/** Reset combo (call on miss, on block-broken, or after MAX). */
export function resetCombo(state: ComboState): void {
  state.count = 0;
  state.lastHitAt = 0;
}

/** Multiplier applied to base damage given the current combo step. */
export function comboDamageMultiplier(step: number): number {
  const i = Math.max(0, Math.min(step, COMBO_MULTIPLIERS.length - 1));
  return COMBO_MULTIPLIERS[i];
}

export type BlockOutcome = "parry" | "block" | "none";

/**
 * Resolve incoming damage against block state.
 *  - blockStartedAt = timestamp when player pressed block (0/undefined = not blocking)
 */
export function resolveBlock(
  rawDamage: number,
  blockStartedAt: number | undefined,
  now = Date.now(),
): { damage: number; outcome: BlockOutcome } {
  if (!blockStartedAt) return { damage: rawDamage, outcome: "none" };
  const elapsed = now - blockStartedAt;
  if (elapsed >= 0 && elapsed <= PARRY_WINDOW_MS) {
    return { damage: Math.round(rawDamage * PARRY_DAMAGE_MULT), outcome: "parry" };
  }
  return { damage: Math.round(rawDamage * BLOCK_DAMAGE_MULT), outcome: "block" };
}

/** Hit-stop duration (caller pauses input/anim for this many ms). */
export function hitStopMs(damageDealt: number): number {
  return damageDealt >= HEAVY_HIT_THRESHOLD ? HIT_STOP_HEAVY_MS : HIT_STOP_LIGHT_MS;
}

// ---- Stamina ------------------------------------------------------------

export interface StaminaState {
  current: number;
  lastTickAt: number;
}

export function makeStamina(): StaminaState {
  return { current: STAMINA_MAX, lastTickAt: Date.now() };
}

/** Call this each animation frame to regenerate (does nothing if blocking). */
export function tickStaminaRegen(s: StaminaState, isBlocking: boolean, now = Date.now()): void {
  const dt = (now - s.lastTickAt) / 1000;
  s.lastTickAt = now;
  if (isBlocking) return;
  s.current = Math.min(STAMINA_MAX, s.current + STAMINA_REGEN_PER_SEC * dt);
}

/** Try to spend stamina for an attack. Returns false if not enough. */
export function trySpendAttackStamina(s: StaminaState): boolean {
  if (s.current < ATTACK_STAMINA_COST) return false;
  s.current -= ATTACK_STAMINA_COST;
  return true;
}

/** Apply stamina cost from absorbing a blocked hit. Returns true if block held; false if broken (stamina < 0). */
export function applyBlockHit(s: StaminaState): boolean {
  s.current -= BLOCK_STAMINA_PER_HIT;
  if (s.current < 0) {
    s.current = 0;
    return false;
  }
  return true;
}

export const COMBAT_CONSTANTS = {
  COMBO_WINDOW_MS,
  MAX_COMBO,
  COMBO_MULTIPLIERS,
  BLOCK_DAMAGE_MULT,
  PARRY_WINDOW_MS,
  BLOCK_STAMINA_PER_HIT,
  ATTACK_STAMINA_COST,
  STAMINA_MAX,
  STAMINA_REGEN_PER_SEC,
  HIT_STOP_LIGHT_MS,
  HIT_STOP_HEAVY_MS,
  HEAVY_HIT_THRESHOLD,
} as const;
