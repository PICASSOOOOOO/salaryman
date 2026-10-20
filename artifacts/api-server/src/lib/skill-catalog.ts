export const SKILL_TREES = [
  { id: "body", name: "Body" },
  { id: "reflexes", name: "Reflexes" },
  { id: "technical_ability", name: "Technical Ability" },
  { id: "intelligence", name: "Intelligence" },
  { id: "cool", name: "Cool" },
] as const;

export type SkillBranch = (typeof SKILL_TREES)[number]["name"];

export interface SkillDef {
  id: string;
  branch: SkillBranch;
  tier: 1 | 2 | 3;
  name: string;
  desc: string;
  cost: number;
  prereq?: string;
  effect: string;
}

interface SkillTrack {
  id: string;
  name: string;
  effect: string;
  valuePerRank: number;
  unit?: string;
}

interface SkillTreeSpec {
  id: string;
  name: SkillBranch;
  tracks: SkillTrack[];
}

const trees: SkillTreeSpec[] = [
  {
    id: "body",
    name: "Body",
    tracks: [
      { id: "shotgun", name: "Shotgun Damage", effect: "shotgun damage", valuePerRank: 5, unit: "%" },
      { id: "machine_gun", name: "Light Machine Gun Damage", effect: "light machine gun damage", valuePerRank: 5, unit: "%" },
      { id: "blunt", name: "Blunt Weapon Damage", effect: "blunt weapon damage", valuePerRank: 5, unit: "%" },
      { id: "gorilla_arms", name: "Gorilla Arms Damage", effect: "Gorilla Arms damage", valuePerRank: 5, unit: "%" },
      { id: "health_regen", name: "Health Regeneration", effect: "health regeneration", valuePerRank: 2, unit: "%" },
      { id: "adrenaline", name: "Adrenaline Duration", effect: "adrenaline duration", valuePerRank: 5, unit: "%" },
      { id: "max_health", name: "Maximum Health", effect: "maximum health", valuePerRank: 5, unit: "%" },
      { id: "stamina", name: "Stamina Recovery", effect: "stamina recovery", valuePerRank: 5, unit: "%" },
      { id: "melee", name: "Melee Damage", effect: "melee damage", valuePerRank: 4, unit: "%" },
      { id: "heavy_weapons", name: "Heavy Weapon Handling", effect: "heavy weapon handling", valuePerRank: 4, unit: "%" },
      { id: "pain_resistance", name: "Pain Resistance", effect: "damage resistance", valuePerRank: 2, unit: "%" },
      { id: "carry", name: "Carry Capacity", effect: "carry capacity", valuePerRank: 5, unit: "%" },
      { id: "grapple", name: "Grapple Strength", effect: "grapple strength", valuePerRank: 5, unit: "%" },
      { id: "healing_items", name: "Healing Item Effectiveness", effect: "healing item effectiveness", valuePerRank: 4, unit: "%" },
      { id: "combat_recovery", name: "Combat Recovery", effect: "health recovery after combat", valuePerRank: 3, unit: "%" },
      { id: "knockdown", name: "Knockdown Resistance", effect: "knockdown resistance", valuePerRank: 5, unit: "%" },
      { id: "unarmed", name: "Unarmed Damage", effect: "unarmed damage", valuePerRank: 5, unit: "%" },
    ],
  },
  {
    id: "reflexes",
    name: "Reflexes",
    tracks: [
      { id: "assault_rifles", name: "Assault Rifle Damage", effect: "assault rifle damage", valuePerRank: 5, unit: "%" },
      { id: "smg", name: "Submachine Gun Damage", effect: "submachine gun damage", valuePerRank: 5, unit: "%" },
      { id: "blades", name: "Blade Damage", effect: "blade damage", valuePerRank: 5, unit: "%" },
      { id: "dash", name: "Dash Distance", effect: "dash distance", valuePerRank: 5, unit: "%" },
      { id: "air_dash", name: "Air Dash Control", effect: "air dash control", valuePerRank: 5, unit: "%" },
      { id: "movement", name: "Movement Speed", effect: "movement speed", valuePerRank: 2, unit: "%" },
      { id: "evasion", name: "Evasion", effect: "evasion", valuePerRank: 2, unit: "%" },
      { id: "reload", name: "Reload Speed", effect: "reload speed", valuePerRank: 4, unit: "%" },
      { id: "weapon_swap", name: "Weapon Swap Speed", effect: "weapon swap speed", valuePerRank: 5, unit: "%" },
      { id: "slide", name: "Slide Distance", effect: "slide distance", valuePerRank: 5, unit: "%" },
      { id: "sprint", name: "Sprint Efficiency", effect: "sprint stamina cost reduction", valuePerRank: 4, unit: "%" },
      { id: "aim_move", name: "Moving Aim", effect: "accuracy while moving", valuePerRank: 3, unit: "%" },
      { id: "close_range", name: "Close-Range Accuracy", effect: "close-range accuracy", valuePerRank: 3, unit: "%" },
      { id: "blade_deflect", name: "Blade Deflection", effect: "blade deflection", valuePerRank: 3, unit: "%" },
      { id: "quick_recovery", name: "Quick Recovery", effect: "movement recovery time reduction", valuePerRank: 4, unit: "%" },
      { id: "positioning", name: "Combat Positioning", effect: "positioning bonus duration", valuePerRank: 5, unit: "%" },
      { id: "initiative", name: "Initiative", effect: "initiative", valuePerRank: 3, unit: "%" },
    ],
  },
  {
    id: "technical_ability",
    name: "Technical Ability",
    tracks: [
      { id: "cyberware_capacity", name: "Cyberware Capacity", effect: "cyberware capacity", valuePerRank: 2, unit: "%" },
      { id: "engineering", name: "Engineering", effect: "engineering effectiveness", valuePerRank: 4, unit: "%" },
      { id: "health_items", name: "Health Item Effectiveness", effect: "health item effectiveness", valuePerRank: 4, unit: "%" },
      { id: "tech_weapons", name: "Tech Weapon Damage", effect: "tech weapon damage", valuePerRank: 5, unit: "%" },
      { id: "repairs", name: "Equipment Repair", effect: "repair effectiveness", valuePerRank: 4, unit: "%" },
      { id: "durability", name: "Equipment Durability", effect: "equipment durability", valuePerRank: 5, unit: "%" },
      { id: "power_systems", name: "Power Systems", effect: "power system efficiency", valuePerRank: 4, unit: "%" },
      { id: "water_systems", name: "Water Systems", effect: "water system efficiency", valuePerRank: 4, unit: "%" },
      { id: "safety_systems", name: "Safety Systems", effect: "safety system effectiveness", valuePerRank: 4, unit: "%" },
      { id: "armor", name: "Armor Tuning", effect: "armor effectiveness", valuePerRank: 3, unit: "%" },
      { id: "device_upgrades", name: "Device Upgrades", effect: "device upgrade cost reduction", valuePerRank: 3, unit: "%" },
      { id: "salvage", name: "Component Salvage", effect: "salvaged components", valuePerRank: 5, unit: "%" },
      { id: "drones", name: "Drone Control", effect: "drone effectiveness", valuePerRank: 4, unit: "%" },
      { id: "electronics", name: "Electronics", effect: "electronics interaction speed", valuePerRank: 4, unit: "%" },
      { id: "fabrication", name: "Fabrication", effect: "fabrication material efficiency", valuePerRank: 3, unit: "%" },
      { id: "battery_efficiency", name: "Battery Efficiency", effect: "battery capacity", valuePerRank: 5, unit: "%" },
      { id: "tool_handling", name: "Tool Handling", effect: "tool durability", valuePerRank: 5, unit: "%" },
    ],
  },
  {
    id: "intelligence",
    name: "Intelligence",
    tracks: [
      { id: "ram_recovery", name: "RAM Recovery", effect: "RAM recovery", valuePerRank: 5, unit: "%" },
      { id: "quickhack_damage", name: "Quickhack Damage", effect: "quickhack damage", valuePerRank: 5, unit: "%" },
      { id: "quickhack_cost", name: "Quickhack Cost", effect: "quickhack RAM cost reduction", valuePerRank: 3, unit: "%" },
      { id: "overclock", name: "Overclock Duration", effect: "overclock duration", valuePerRank: 4, unit: "%" },
      { id: "smart_weapons", name: "Smart Weapon Accuracy", effect: "smart weapon accuracy", valuePerRank: 4, unit: "%" },
      { id: "control_programs", name: "Control Programs", effect: "control program duration", valuePerRank: 4, unit: "%" },
      { id: "combat_programs", name: "Combat Programs", effect: "combat program effectiveness", valuePerRank: 4, unit: "%" },
      { id: "network_scan", name: "Network Scanning", effect: "scan range", valuePerRank: 5, unit: "%" },
      { id: "stealth_hacks", name: "Stealth Programs", effect: "stealth program duration", valuePerRank: 4, unit: "%" },
      { id: "device_hacks", name: "Device Control", effect: "device control duration", valuePerRank: 4, unit: "%" },
      { id: "hack_queue", name: "Hack Queue", effect: "quickhack queue capacity", valuePerRank: 1, unit: "" },
      { id: "trace_resistance", name: "Trace Resistance", effect: "trace buildup reduction", valuePerRank: 4, unit: "%" },
      { id: "data_mining", name: "Data Mining", effect: "data recovered", valuePerRank: 5, unit: "%" },
      { id: "ram_capacity", name: "RAM Capacity", effect: "RAM capacity", valuePerRank: 2, unit: "%" },
      { id: "smart_lock", name: "Smart Weapon Lock-On", effect: "smart weapon lock-on speed", valuePerRank: 5, unit: "%" },
      { id: "program_recovery", name: "Program Recovery", effect: "program cooldown reduction", valuePerRank: 3, unit: "%" },
      { id: "remote_access", name: "Remote Access", effect: "remote interaction range", valuePerRank: 5, unit: "%" },
    ],
  },
  {
    id: "cool",
    name: "Cool",
    tracks: [
      { id: "precision_rifles", name: "Precision Rifle Damage", effect: "precision rifle damage", valuePerRank: 5, unit: "%" },
      { id: "handguns", name: "Handgun Damage", effect: "handgun damage", valuePerRank: 5, unit: "%" },
      { id: "throwing_weapons", name: "Throwing Weapon Damage", effect: "throwing weapon damage", valuePerRank: 5, unit: "%" },
      { id: "optical_camo", name: "Optical Camo Duration", effect: "optical camo duration", valuePerRank: 5, unit: "%" },
      { id: "stealth", name: "Stealth Movement", effect: "stealth movement noise reduction", valuePerRank: 4, unit: "%" },
      { id: "takedowns", name: "Stealth Takedowns", effect: "stealth takedown effectiveness", valuePerRank: 4, unit: "%" },
      { id: "critical_chance", name: "Critical Hit Chance", effect: "critical hit chance", valuePerRank: 1, unit: "%" },
      { id: "critical_damage", name: "Critical Hit Damage", effect: "critical hit damage", valuePerRank: 4, unit: "%" },
      { id: "headshots", name: "Headshot Damage", effect: "headshot damage", valuePerRank: 5, unit: "%" },
      { id: "detection", name: "Detection Time", effect: "enemy detection time", valuePerRank: 4, unit: "%" },
      { id: "cooldown", name: "Combat Cooldowns", effect: "combat cooldown reduction", valuePerRank: 3, unit: "%" },
      { id: "poison", name: "Poison Effects", effect: "poison effectiveness", valuePerRank: 4, unit: "%" },
      { id: "cover", name: "Cover Accuracy", effect: "accuracy from cover", valuePerRank: 4, unit: "%" },
      { id: "ambush", name: "Ambush Damage", effect: "first-strike damage", valuePerRank: 5, unit: "%" },
      { id: "marking", name: "Target Marking", effect: "marked target duration", valuePerRank: 5, unit: "%" },
      { id: "escape", name: "Escape Movement", effect: "escape movement speed", valuePerRank: 3, unit: "%" },
      { id: "composure", name: "Composure", effect: "composure under pressure", valuePerRank: 4, unit: "%" },
    ],
  },
];

function buildTree(tree: SkillTreeSpec): SkillDef[] {
  return tree.tracks.flatMap((track) =>
    ([1, 2, 3] as const).map((rank) => {
      const id = `${tree.id}.${track.id}_${rank}`;
      const previousId = rank > 1 ? `${tree.id}.${track.id}_${rank - 1}` : undefined;
      const value = track.valuePerRank * rank;
      const unit = track.unit ?? "%";
      return {
        id,
        branch: tree.name,
        tier: rank,
        name: `${track.name} ${["I", "II", "III"][rank - 1]}`,
        desc: `Improve ${track.effect} by ${value}${unit}.`,
        cost: rank,
        prereq: previousId,
        effect: `+${value}${unit} ${track.effect}`,
      };
    }),
  );
}

export const SKILL_CATALOG: SkillDef[] = trees.flatMap(buildTree);

const LEGACY_SKILL_IDS: Record<string, string> = {
  "work.analyst_1": "technical_ability.electronics_1",
  "work.analyst_2": "technical_ability.electronics_2",
  "work.field_expert": "technical_ability.engineering_2",
  "business.negotiator_1": "cool.composure_1",
  "business.negotiator_2": "cool.composure_2",
  "business.tax_strategist": "cool.composure_3",
  "power.enforcer_1": "body.melee_1",
  "power.enforcer_2": "body.melee_2",
  "power.iron_will": "body.pain_resistance_1",
};

export function canonicalSkillId(id: string): string {
  return LEGACY_SKILL_IDS[id] ?? id;
}

export function canonicalSkillIds(ids: string[]): string[] {
  return [...new Set(ids.map(canonicalSkillId))];
}

export function getSkillById(id: string): SkillDef | undefined {
  const canonicalId = canonicalSkillId(id);
  return SKILL_CATALOG.find((skill) => skill.id === canonicalId);
}

export function canUnlock(skillId: string, unlocked: string[]): boolean {
  const skill = getSkillById(skillId);
  if (!skill) return false;
  if (!skill.prereq) return true;
  return canonicalSkillIds(unlocked).includes(skill.prereq);
}

export function playerHasSkill(unlocked: string[], skillId: string): boolean {
  return canonicalSkillIds(unlocked).includes(canonicalSkillId(skillId));
}

export const CLASS_TO_T1_SKILL: Record<string, string> = {
  corporate: "cool.composure_1",
  freelancer: "technical_ability.electronics_1",
  operator: "body.melee_1",
  technician: "technical_ability.engineering_1",
  medic: "body.health_regen_1",
  soldier: "body.shotgun_1",
  trader: "cool.composure_1",
  hacker: "intelligence.ram_recovery_1",
  journalist: "intelligence.data_mining_1",
  lawyer: "cool.composure_1",
};

export function defaultT1ForClass(charClass?: string): string {
  return CLASS_TO_T1_SKILL[charClass?.toLowerCase() ?? ""] ?? "body.max_health_1";
}
