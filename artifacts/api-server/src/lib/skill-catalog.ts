export type SkillBranch = "WORK" | "BUSINESS" | "POWER";
export type SkillTier = 1 | 2 | 3;

export interface SkillDef {
  id: string;
  branch: SkillBranch;
  tier: SkillTier;
  name: string;
  desc: string;
  effect: string;
  cost: number;
  prereq: string | null;
}

export const SKILL_CATALOG: SkillDef[] = [
  {
    id: "work.analyst_1",
    branch: "WORK",
    tier: 1,
    name: "ANALYST I",
    desc: "Field experience sharpens the mind.",
    effect: "+10% EXP from all sources",
    cost: 1,
    prereq: null,
  },
  {
    id: "work.analyst_2",
    branch: "WORK",
    tier: 2,
    name: "ANALYST II",
    desc: "Pattern recognition reaches corporate grade.",
    effect: "+20% EXP from all sources",
    cost: 2,
    prereq: "work.analyst_1",
  },
  {
    id: "work.field_expert",
    branch: "WORK",
    tier: 3,
    name: "FIELD EXPERT",
    desc: "You have survived enough to teach survival.",
    effect: "+50% EXP · +1 Perception",
    cost: 3,
    prereq: "work.analyst_2",
  },
  {
    id: "business.negotiator_1",
    branch: "BUSINESS",
    tier: 1,
    name: "NEGOTIATOR I",
    desc: "You know how to walk away from a bad deal.",
    effect: "5% discount in the Armory",
    cost: 1,
    prereq: null,
  },
  {
    id: "business.negotiator_2",
    branch: "BUSINESS",
    tier: 2,
    name: "NEGOTIATOR II",
    desc: "Vendors respect the walk-away.",
    effect: "10% discount in the Armory",
    cost: 2,
    prereq: "business.negotiator_1",
  },
  {
    id: "business.tax_strategist",
    branch: "BUSINESS",
    tier: 3,
    name: "TAX STRATEGIST",
    desc: "Pablo's people take a smaller cut.",
    effect: "10% reduction on Pablo Tax API charges",
    cost: 3,
    prereq: "business.negotiator_2",
  },
  {
    id: "power.enforcer_1",
    branch: "POWER",
    tier: 1,
    name: "ENFORCER I",
    desc: "Muscle memory from too many fights.",
    effect: "+5% melee damage",
    cost: 1,
    prereq: null,
  },
  {
    id: "power.enforcer_2",
    branch: "POWER",
    tier: 2,
    name: "ENFORCER II",
    desc: "You hit harder than your paycheck suggests.",
    effect: "+10% melee damage",
    cost: 2,
    prereq: "power.enforcer_1",
  },
  {
    id: "power.iron_will",
    branch: "POWER",
    tier: 3,
    name: "IRON WILL",
    desc: "The city tries to kill you. It keeps failing.",
    effect: "+25 max HP",
    cost: 3,
    prereq: "power.enforcer_2",
  },
];

export function getSkillById(id: string): SkillDef | undefined {
  return SKILL_CATALOG.find(s => s.id === id);
}

export function canUnlock(skillId: string, unlockedIds: string[]): boolean {
  const skill = getSkillById(skillId);
  if (!skill) return false;
  if (unlockedIds.includes(skillId)) return false;
  if (skill.prereq && !unlockedIds.includes(skill.prereq)) return false;
  return true;
}

export function playerHasSkill(skill: string, saveData: Record<string, unknown> | null | undefined): boolean {
  const skills = saveData?.skills;
  if (!Array.isArray(skills)) return false;
  return skills.includes(skill);
}

export const CLASS_TO_T1_SKILL: Record<string, string> = {
  corporate:   "business.negotiator_1",
  freelancer:  "work.analyst_1",
  operator:    "power.enforcer_1",
  technician:  "work.analyst_1",
  medic:       "work.analyst_1",
  soldier:     "power.enforcer_1",
  trader:      "business.negotiator_1",
  hacker:      "work.analyst_1",
  journalist:  "work.analyst_1",
  lawyer:      "business.negotiator_1",
};

export function defaultT1ForClass(charClass: string): string {
  return CLASS_TO_T1_SKILL[charClass?.toLowerCase()] ?? "work.analyst_1";
}
