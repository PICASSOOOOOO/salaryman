import { describe, expect, it } from "vitest";
import {
  SKILL_CATALOG,
  SKILL_TREES,
  canUnlock,
  canonicalSkillIds,
  defaultT1ForClass,
  getSkillById,
} from "../lib/skill-catalog";

describe("native game skill catalog", () => {
  it("provides five named trees with 51 skills each", () => {
    expect(SKILL_TREES.map((tree) => tree.name)).toEqual([
      "Body",
      "Reflexes",
      "Technical Ability",
      "Intelligence",
      "Cool",
    ]);

    for (const tree of SKILL_TREES) {
      expect(SKILL_CATALOG.filter((skill) => skill.branch === tree.name)).toHaveLength(51);
    }
    expect(SKILL_CATALOG).toHaveLength(255);
  });

  it("uses three ranks per skill track and enforces rank prerequisites", () => {
    const first = getSkillById("body.shotgun_1")!;
    const second = getSkillById("body.shotgun_2")!;
    const third = getSkillById("body.shotgun_3")!;

    expect([first.tier, second.tier, third.tier]).toEqual([1, 2, 3]);
    expect(canUnlock(first.id, [])).toBe(true);
    expect(canUnlock(second.id, [])).toBe(false);
    expect(canUnlock(second.id, [first.id])).toBe(true);
    expect(canUnlock(third.id, [first.id, second.id])).toBe(true);
  });

  it("maps legacy unlocks and character classes into the new trees", () => {
    expect(canonicalSkillIds(["work.analyst_1", "technical_ability.electronics_1"])).toEqual([
      "technical_ability.electronics_1",
    ]);
    expect(getSkillById("power.enforcer_1")?.branch).toBe("Body");
    expect(defaultT1ForClass("hacker")).toBe("intelligence.ram_recovery_1");
    expect(defaultT1ForClass("unknown")).toBe("body.max_health_1");
  });
});
