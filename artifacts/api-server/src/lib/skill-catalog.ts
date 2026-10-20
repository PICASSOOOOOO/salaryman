export const SKILL_TREES = [
  { id: "stamina", name: "Stamina" },
  { id: "agility", name: "Agility" },
  { id: "technical_skills", name: "Technical Skills" },
  { id: "office_politics", name: "Office Politics" },
  { id: "composure", name: "Composure" },
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
  cooldownSeconds?: number;
  unlocksFreeFeature?: string;
}

interface SkillTrack {
  id: string;
  name: string;
  effect: string;
  valuePerRank: number;
  unit?: string;
  cooldownSeconds?: number;
  freeFeature?: string;
  featureRank?: 1 | 2 | 3;
}

interface SkillTreeSpec {
  id: string;
  name: SkillBranch;
  tracks: SkillTrack[];
}

// Original SALARYMAN office-survival abilities. Each of the 17 tracks has
// three ranks, giving every tree 51 spendable skills.
const trees: SkillTreeSpec[] = [
  {
    id: "stamina",
    name: "Stamina",
    tracks: [
      { id: "long_shift", name: "Long-Shift Endurance", effect: "long-shift fatigue resistance", valuePerRank: 4 },
      { id: "energy_recovery", name: "Energy Recovery", effect: "energy recovery", valuePerRank: 4 },
      { id: "hydration", name: "Hydration", effect: "hydration item effectiveness", valuePerRank: 4 },
      { id: "meal_efficiency", name: "Meal Efficiency", effect: "meal effectiveness", valuePerRank: 4 },
      { id: "caffeine", name: "Caffeine Tolerance", effect: "caffeine duration", valuePerRank: 4 },
      { id: "posture", name: "Posture Support", effect: "posture-related fatigue reduction", valuePerRank: 4 },
      { id: "stress_recovery", name: "Stress Recovery", effect: "stress recovery", valuePerRank: 4 },
      { id: "health_recovery", name: "Health Recovery", effect: "health recovery", valuePerRank: 3 },
      { id: "carry", name: "Supply Carrying", effect: "supply carrying capacity", valuePerRank: 5 },
      { id: "minor_care", name: "Minor Injury Care", effect: "health item effectiveness", valuePerRank: 4 },
      { id: "air_quality", name: "Air Quality Tolerance", effect: "air quality protection", valuePerRank: 4 },
      { id: "temperature", name: "Temperature Tolerance", effect: "temperature protection", valuePerRank: 4 },
      { id: "replicant_reserve", name: "Replicant Energy Reserve", effect: "replicant energy capacity", valuePerRank: 3 },
      { id: "power_rest", name: "Power Rest Efficiency", effect: "replicant energy recovery", valuePerRank: 4 },
      { id: "physical_attack", name: "Physical Attack", effect: "physical attack strength", valuePerRank: 3 },
      { id: "defense", name: "Damage Defense", effect: "incoming damage reduction", valuePerRank: 2 },
      { id: "survival", name: "Survival", effect: "hazard survival", valuePerRank: 4, cooldownSeconds: 60 },
      { id: "disaster_survival", name: "Disaster Survival", effect: "fictional disaster survival", valuePerRank: 4 },
    ],
  },
  {
    id: "agility",
    name: "Agility",
    tracks: [
      { id: "typing", name: "Typing Speed", effect: "typing task speed", valuePerRank: 4 },
      { id: "window_switching", name: "Window Switching", effect: "task switching speed", valuePerRank: 4 },
      { id: "hallway_movement", name: "Hallway Movement", effect: "hallway movement speed", valuePerRank: 3 },
      { id: "quiet_steps", name: "Quiet Footsteps", effect: "movement noise reduction", valuePerRank: 4 },
      { id: "break_timing", name: "Break Timing", effect: "break action speed", valuePerRank: 4 },
      { id: "coffee_run", name: "Coffee Run", effect: "vending and supply interaction speed", valuePerRank: 4 },
      { id: "tool_handling", name: "Tool Handling", effect: "maintenance action speed", valuePerRank: 4 },
      { id: "inventory_access", name: "Inventory Access", effect: "inventory interaction speed", valuePerRank: 4 },
      { id: "desk_transition", name: "Desk Transition", effect: "desk interaction speed", valuePerRank: 4 },
      { id: "meeting_exit", name: "Meeting Exit", effect: "meeting exit speed", valuePerRank: 4 },
      { id: "evasion", name: "Defensive Evasion", effect: "incoming attack evasion", valuePerRank: 3, cooldownSeconds: 20 },
      { id: "reaction", name: "Attack Speed", effect: "attack action speed", valuePerRank: 3 },
      { id: "keyboard_precision", name: "Keyboard Precision", effect: "computer task accuracy", valuePerRank: 3 },
      { id: "task_queue", name: "Task Queue Control", effect: "task queue efficiency", valuePerRank: 3 },
      { id: "sprint_efficiency", name: "Sprint Efficiency", effect: "sprint energy cost reduction", valuePerRank: 4 },
      { id: "supply_sorting", name: "Supply Sorting", effect: "inventory sorting speed", valuePerRank: 4 },
      { id: "quick_response", name: "Survival Escape", effect: "escape action speed", valuePerRank: 4, cooldownSeconds: 30 },
    ],
  },
  {
    id: "technical_skills",
    name: "Technical Skills",
    tracks: [
      { id: "printer_repair", name: "Printer Repair", effect: "printer repair success", valuePerRank: 4, freeFeature: "basic_printer_repair", featureRank: 1 },
      { id: "spreadsheet", name: "Spreadsheet Work", effect: "spreadsheet task speed", valuePerRank: 4 },
      { id: "automation", name: "Office Programming", effect: "office automation efficiency", valuePerRank: 4, freeFeature: "basic_office_scripting", featureRank: 2 },
      { id: "device_setup", name: "Mechanics", effect: "device setup and repair speed", valuePerRank: 4, freeFeature: "basic_mechanics_bench", featureRank: 1 },
      { id: "computer_repair", name: "Computer Repair", effect: "computer repair success", valuePerRank: 4, freeFeature: "basic_computer_repair", featureRank: 1 },
      { id: "power_systems", name: "Power Systems", effect: "power system maintenance", valuePerRank: 4, freeFeature: "basic_power_diagnostics", featureRank: 2 },
      { id: "water_systems", name: "Water Systems", effect: "water system maintenance", valuePerRank: 4, freeFeature: "basic_water_diagnostics", featureRank: 2 },
      { id: "safety_systems", name: "Safety Systems", effect: "safety equipment effectiveness", valuePerRank: 4, freeFeature: "basic_safety_inspection", featureRank: 2 },
      { id: "health_equipment", name: "Health Equipment", effect: "health equipment effectiveness", valuePerRank: 4 },
      { id: "item_repair", name: "Item Repair", effect: "item repair effectiveness", valuePerRank: 4, freeFeature: "basic_item_repair", featureRank: 1 },
      { id: "durability", name: "Equipment Care", effect: "equipment durability", valuePerRank: 4 },
      { id: "battery_efficiency", name: "Battery Efficiency", effect: "battery capacity", valuePerRank: 3 },
      { id: "component_salvage", name: "Component Salvage", effect: "recovered repair components", valuePerRank: 4 },
      { id: "tool_life", name: "Tool Care", effect: "tool durability", valuePerRank: 4 },
      { id: "replicant_systems", name: "Replicant Systems", effect: "replicant system efficiency", valuePerRank: 4 },
      { id: "workstation", name: "Workstation Tuning", effect: "workstation performance", valuePerRank: 4 },
      { id: "emergency_repair", name: "Emergency Repair", effect: "emergency repair speed", valuePerRank: 4, cooldownSeconds: 45 },
      { id: "infrastructure_repair", name: "Infrastructure Repair", effect: "building infrastructure repair", valuePerRank: 4, freeFeature: "basic_infrastructure_repair", featureRank: 2 },
      { id: "security_systems", name: "Security Systems", effect: "security system repair and inspection", valuePerRank: 4, freeFeature: "basic_security_inspection", featureRank: 2 },
      { id: "disaster_response", name: "Disaster Response", effect: "infrastructure recovery after fictional disasters", valuePerRank: 4, cooldownSeconds: 60 },
    ],
  },
  {
    id: "office_politics",
    name: "Office Politics",
    tracks: [
      { id: "interview_preparation", name: "Interview Preparation", effect: "interview preparation effectiveness", valuePerRank: 4 },
      { id: "interview_responses", name: "Interview Responses", effect: "interview response quality", valuePerRank: 4 },
      { id: "networking", name: "Networking", effect: "network credit gain", valuePerRank: 3 },
      { id: "job_security", name: "Job Security", effect: "job-loss risk reduction", valuePerRank: 3 },
      { id: "salary_negotiation", name: "Salary Negotiation", effect: "salary negotiation success", valuePerRank: 3 },
      { id: "professional_communication", name: "Professional Communication", effect: "professional communication effectiveness", valuePerRank: 4 },
      { id: "performance_reviews", name: "Performance Reviews", effect: "performance review outcomes", valuePerRank: 3 },
      { id: "attendance", name: "Reliable Attendance", effect: "attendance-based reputation", valuePerRank: 4 },
      { id: "workplace_competition", name: "Workplace Competition", effect: "career competition effectiveness", valuePerRank: 3 },
      { id: "rivalries", name: "Workplace Rivalries", effect: "rivalry contest effectiveness", valuePerRank: 4 },
      { id: "client_relations", name: "Client Relations", effect: "client relationship gain", valuePerRank: 3 },
      { id: "career_planning", name: "Career Planning", effect: "experience gain", valuePerRank: 3 },
      { id: "business_operations", name: "Business Operations", effect: "business task efficiency", valuePerRank: 4 },
      { id: "income_planning", name: "Income Planning", effect: "work income", valuePerRank: 2 },
      { id: "credit_repair", name: "Credit Repair", effect: "network credit recovery", valuePerRank: 3 },
      { id: "workplace_awareness", name: "Workplace Awareness", effect: "workplace threat detection", valuePerRank: 4 },
      { id: "faction_relations", name: "Faction Relations", effect: "fictional faction reputation", valuePerRank: 3 },
      { id: "underworld_contracts", name: "Underworld Contracts", effect: "fictional illegal job access", valuePerRank: 3 },
      { id: "business_growth", name: "Business Growth", effect: "business growth effectiveness", valuePerRank: 3 },
      { id: "debt_collection", name: "Debt Collector Encounters", effect: "fictional debt encounter avoidance", valuePerRank: 3 },
      { id: "extortion_protection", name: "Extortion Protection", effect: "fictional extortion resistance", valuePerRank: 3 },
    ],
  },
  {
    id: "composure",
    name: "Composure",
    tracks: [
      { id: "quiet_breaks", name: "Quiet Breaks", effect: "break visibility reduction", valuePerRank: 4 },
      { id: "end_of_shift", name: "End-of-Shift Timing", effect: "end-of-shift detection avoidance", valuePerRank: 4 },
      { id: "stress_control", name: "Stress Control", effect: "stress buildup reduction", valuePerRank: 4 },
      { id: "presentation", name: "Presentation Composure", effect: "presentation composure", valuePerRank: 4 },
      { id: "focus", name: "Focus", effect: "focus duration", valuePerRank: 4 },
      { id: "patience", name: "Patience", effect: "long task interruption resistance", valuePerRank: 4 },
      { id: "observation", name: "Observation", effect: "pickpocket detection chance", valuePerRank: 3 },
      { id: "light_fingers", name: "Pickpocketing", effect: "pickpocket attempt success", valuePerRank: 1 },
      { id: "wallet_awareness", name: "Wallet Awareness", effect: "wallet protection", valuePerRank: 3 },
      { id: "crime_heat", name: "Crime Heat", effect: "fictional crime heat reduction", valuePerRank: 2 },
      { id: "mafia_activities", name: "Mafia Activities", effect: "fictional mafia mission effectiveness", valuePerRank: 3 },
      { id: "deescalation", name: "De-escalation", effect: "nonviolent theft response effectiveness", valuePerRank: 4 },
      { id: "retaliation_control", name: "Retaliation Control", effect: "retaliation cooldown reduction", valuePerRank: 3 },
      { id: "cooldown_recovery", name: "Cooldown Recovery", effect: "ability cooldown reduction", valuePerRank: 2 },
      { id: "burnout_resistance", name: "Burnout Resistance", effect: "burnout buildup reduction", valuePerRank: 3 },
      { id: "social_reading", name: "Social Reading", effect: "coworker intent detection", valuePerRank: 4 },
      { id: "under_pressure", name: "Under Pressure", effect: "task accuracy under pressure", valuePerRank: 3 },
      { id: "stealth", name: "Stealth", effect: "stealth detection avoidance", valuePerRank: 4 },
      { id: "security_awareness", name: "Security Awareness", effect: "security threat detection", valuePerRank: 4 },
      { id: "debt_evasion", name: "Debt Collector Evasion", effect: "fictional debt encounter escape", valuePerRank: 3, cooldownSeconds: 45 },
      { id: "extortion_resistance", name: "Extortion Resistance", effect: "fictional extortion encounter resistance", valuePerRank: 3 },
    ],
  },
];

function buildTree(tree: SkillTreeSpec): SkillDef[] {
  return tree.tracks.flatMap((track) =>
    ([1, 2, 3] as const).map((rank) => {
      const id = `${tree.id}.${track.id}_${rank}`;
      const prereq = rank > 1 ? `${tree.id}.${track.id}_${rank - 1}` : undefined;
      const value = track.valuePerRank * rank;
      const unit = track.unit ?? "%";
      return {
        id,
        branch: tree.name,
        tier: rank,
        name: `${track.name} ${["I", "II", "III"][rank - 1]}`,
        desc: `Improve ${track.effect} by ${value}${unit}.`,
        cost: rank,
        prereq,
        effect: `+${value}${unit} ${track.effect}`,
        ...(track.cooldownSeconds ? { cooldownSeconds: track.cooldownSeconds } : {}),
        ...(track.freeFeature && track.featureRank === rank ? { unlocksFreeFeature: track.freeFeature } : {}),
      };
    }),
  );
}

export const SKILL_CATALOG: SkillDef[] = trees.flatMap(buildTree);

const LEGACY_SKILL_IDS: Record<string, string> = {
  "work.analyst_1": "technical_skills.spreadsheet_1",
  "work.analyst_2": "technical_skills.spreadsheet_2",
  "work.field_expert": "technical_skills.printer_repair_2",
  "business.negotiator_1": "office_politics.salary_negotiation_1",
  "business.negotiator_2": "office_politics.salary_negotiation_2",
  "business.tax_strategist": "office_politics.income_planning_3",
  "power.enforcer_1": "stamina.long_shift_1",
  "power.enforcer_2": "stamina.long_shift_2",
  "power.iron_will": "composure.stress_control_1",
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
  corporate: "office_politics.networking_1",
  freelancer: "technical_skills.workstation_1",
  operator: "agility.hallway_movement_1",
  technician: "technical_skills.printer_repair_1",
  medic: "stamina.minor_care_1",
  soldier: "stamina.long_shift_1",
  trader: "office_politics.salary_negotiation_1",
  hacker: "technical_skills.computer_repair_1",
  journalist: "office_politics.workplace_awareness_1",
  lawyer: "office_politics.professional_communication_1",
};

export function defaultT1ForClass(charClass?: string): string {
  return CLASS_TO_T1_SKILL[charClass?.toLowerCase() ?? ""] ?? "stamina.long_shift_1";
}
