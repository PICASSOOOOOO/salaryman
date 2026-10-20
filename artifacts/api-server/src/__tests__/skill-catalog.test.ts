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
  it("provides five named trees with more than 50 skills each", () => {
    expect(SKILL_TREES.map((tree) => tree.name)).toEqual([
      "Stamina",
      "Agility",
      "Technical Skills",
      "Office Politics",
      "Composure",
    ]);

    for (const tree of SKILL_TREES) {
      expect(SKILL_CATALOG.filter((skill) => skill.branch === tree.name).length).toBeGreaterThan(50);
    }
    expect(new Set(SKILL_CATALOG.map((skill) => skill.id)).size).toBe(SKILL_CATALOG.length);
  });

  it("uses three ranks per skill track and enforces rank prerequisites", () => {
    const first = getSkillById("stamina.survival_1")!;
    const second = getSkillById("stamina.survival_2")!;
    const third = getSkillById("stamina.survival_3")!;

    expect([first.tier, second.tier, third.tier]).toEqual([1, 2, 3]);
    expect(canUnlock(first.id, [])).toBe(true);
    expect(canUnlock(second.id, [])).toBe(false);
    expect(canUnlock(second.id, [first.id])).toBe(true);
    expect(canUnlock(third.id, [first.id, second.id])).toBe(true);
  });

  it("maps legacy unlocks and character classes into the new trees", () => {
    expect(canonicalSkillIds(["work.analyst_1", "technical_skills.spreadsheet_1"])).toEqual([
      "technical_skills.spreadsheet_1",
    ]);
    expect(getSkillById("power.enforcer_1")?.branch).toBe("Stamina");
    expect(defaultT1ForClass("hacker")).toBe("technical_skills.computer_repair_1");
    expect(defaultT1ForClass("unknown")).toBe("stamina.long_shift_1");
  });

  it("marks free in-game feature unlocks without granting paid entitlements", () => {
    expect(getSkillById("technical_skills.automation_1")?.unlocksFreeFeature).toBeUndefined();
    expect(getSkillById("technical_skills.automation_2")?.unlocksFreeFeature).toBe("basic_office_scripting");
    expect(getSkillById("technical_skills.item_repair_1")?.unlocksFreeFeature).toBe("basic_item_repair");
    expect(getSkillById("technical_skills.infrastructure_repair_2")?.unlocksFreeFeature).toBe("basic_infrastructure_repair");
  });
});
