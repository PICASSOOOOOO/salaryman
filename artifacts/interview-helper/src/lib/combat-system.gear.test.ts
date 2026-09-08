import { describe, it, expect } from "vitest";
import {
  emptyGearStats,
  gearAttackFlat,
  gearTechRangedFlat,
  gearMagicMultiplier,
  gearDefenseMultiplier,
  COMBAT_CONSTANTS,
  type GearStats,
} from "./combat-system";

// These pure helpers turn the server's resolved gear bundle into the exact
// multipliers/flat bonuses the in-world fight math uses. If they drift from the
// catalog math the stat card and real damage silently diverge — so pin them.
const {
  GEAR_ATTACK_PER_POINT,
  GEAR_TECH_PER_POINT,
  GEAR_MAGIC_PER_POINT,
  GEAR_DEFENSE_PER_POINT,
  GEAR_DEFENSE_MIN_MULT,
} = COMBAT_CONSTANTS;

function stats(partial: Partial<GearStats>): GearStats {
  return { ...emptyGearStats(), ...partial };
}

describe("gear combat helpers", () => {
  it("empty gear is fully neutral (no flat bonus, multipliers = 1)", () => {
    const g = emptyGearStats();
    expect(gearAttackFlat(g)).toBe(0);
    expect(gearTechRangedFlat(g)).toBe(0);
    expect(gearMagicMultiplier(g)).toBe(1);
    expect(gearDefenseMultiplier(g)).toBe(1);
  });

  it("attack/tech are flat 1:1 bonuses", () => {
    expect(gearAttackFlat(stats({ attack: 16 }))).toBe(16 * GEAR_ATTACK_PER_POINT);
    expect(gearTechRangedFlat(stats({ tech: 38 }))).toBe(38 * GEAR_TECH_PER_POINT);
  });

  it("magic is +1% outgoing damage per point (uncapped)", () => {
    expect(gearMagicMultiplier(stats({ magic: 0 }))).toBe(1);
    expect(gearMagicMultiplier(stats({ magic: 50 }))).toBeCloseTo(1 + 50 * GEAR_MAGIC_PER_POINT, 10);
    expect(gearMagicMultiplier(stats({ magic: 50 }))).toBeCloseTo(1.5, 10);
    // No upper cap — a huge magic stat keeps scaling.
    expect(gearMagicMultiplier(stats({ magic: 300 }))).toBeCloseTo(4, 10);
  });

  it("defense is -0.6% incoming damage per point", () => {
    expect(gearDefenseMultiplier(stats({ defense: 0 }))).toBe(1);
    expect(gearDefenseMultiplier(stats({ defense: 50 }))).toBeCloseTo(1 - 50 * GEAR_DEFENSE_PER_POINT, 10);
    expect(gearDefenseMultiplier(stats({ defense: 50 }))).toBeCloseTo(0.7, 10);
  });

  it("defense reduction is floored at 25% multiplier (max 75% reduction)", () => {
    // 125 defense would naively give 1 - 0.75 = 0.25 exactly.
    expect(gearDefenseMultiplier(stats({ defense: 125 }))).toBeCloseTo(GEAR_DEFENSE_MIN_MULT, 10);
    // Beyond that the floor holds — a legendary stack can't make you invulnerable.
    expect(gearDefenseMultiplier(stats({ defense: 1000 }))).toBe(GEAR_DEFENSE_MIN_MULT);
    expect(gearDefenseMultiplier(stats({ defense: 1000 }))).toBe(0.25);
  });

  it("tolerates null/undefined gear without throwing", () => {
    expect(gearAttackFlat(undefined as unknown as GearStats)).toBe(0);
    expect(gearMagicMultiplier(null as unknown as GearStats)).toBe(1);
    expect(gearDefenseMultiplier(undefined as unknown as GearStats)).toBe(1);
  });
});
