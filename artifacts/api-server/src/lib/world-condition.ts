export type ConditionState = "flourishing" | "maintained" | "weathered" | "neglected" | "rotting";
export type ConditionMaterialStyle = "solar" | "patina" | "crt";

export interface ConditionVisuals {
  materialStyle: ConditionMaterialStyle;
  solarPlantHealth: number;
  surfaceWear: number;
  circuitExposure: number;
  lightFlicker: number;
  crtObjectDensity: number;
}

export interface ConditionCues {
  surface: string;
  structure: string;
  vegetation: string;
  occupancy: string;
  moisture: string;
  repairAction: string;
}

export interface ConditionProfile {
  score: number;
  state: ConditionState;
  daysSinceMaintenance: number;
  cues: ConditionCues;
  visuals: ConditionVisuals;
}

export const CONDITION_STATES: readonly ConditionState[] = [
  "flourishing",
  "maintained",
  "weathered",
  "neglected",
  "rotting",
];

export const CONDITION_CUES: Record<ConditionState, ConditionCues> = {
  flourishing: {
    surface: "fresh paint and repaired seams",
    structure: "sound and carefully kept",
    vegetation: "healthy plants and tended edges",
    occupancy: "active, supplied, and visibly used",
    moisture: "dry and clean",
    repairAction: "routine care keeps this place flourishing",
  },
  maintained: {
    surface: "ordinary scuffs with intact finish",
    structure: "sound with routine wear",
    vegetation: "kept plants and clear paths",
    occupancy: "occupied and functional",
    moisture: "dry with no active damage",
    repairAction: "small maintenance jobs preserve this state",
  },
  weathered: {
    surface: "faded paint, rubbed edges, and patched material",
    structure: "worn but structurally sound",
    vegetation: "stressed plants and dusty planters",
    occupancy: "sparse use and uneven service",
    moisture: "isolated stains",
    repairAction: "repair seams, paint, lamps, and fixtures",
  },
  neglected: {
    surface: "dust, grime, peeling paint, and paper clutter",
    structure: "minor leaks and overdue repairs",
    vegetation: "wilted or dry plants",
    occupancy: "vacant pockets and skipped routine care",
    moisture: "damp marks and small leaks",
    repairAction: "clear clutter, fix leaks, restore lighting, and replant",
  },
  rotting: {
    surface: "localized water damage, warped wood, and corroded fasteners",
    structure: "unsafe details that need cordoning or repair",
    vegetation: "dead plants and overgrown untrimmed edges",
    occupancy: "abandoned pockets with readable access routes",
    moisture: "mildew-like staining without graphic biological detail",
    repairAction: "stabilize structure before reopening the affected area",
  },
};

const CONDITION_DRIFT_GRACE_DAYS = 14;
const CONDITION_DRIFT_PER_DAY = 0.25;
const CONDITION_REPAIR_POINTS_PER_UNIT = 8;
export const WORLD_DAYS_PER_MONTH = 28;
export const MONTHLY_CONDITION_LOSS = 4;

function toTimestamp(value: Date | string | number | null | undefined): number | null {
  if (value == null) return null;
  const timestamp = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function conditionStateFromScore(score: number): ConditionState {
  if (score >= 90) return "flourishing";
  if (score >= 75) return "maintained";
  if (score >= 50) return "weathered";
  if (score >= 25) return "neglected";
  return "rotting";
}

export function conditionVisualsFromScore(score: number): ConditionVisuals {
  const normalized = Math.max(0, Math.min(100, Number(score) || 0));
  const decay = 1 - normalized / 100;
  return {
    materialStyle: normalized >= 75 ? "solar" : normalized >= 40 ? "patina" : "crt",
    solarPlantHealth: Math.round((1 - decay) * 100) / 100,
    surfaceWear: Math.round(decay * 100) / 100,
    circuitExposure: Math.round(Math.max(0, (40 - normalized) / 40) * 100) / 100,
    lightFlicker: Math.round(Math.max(0, (55 - normalized) / 55) * 100) / 100,
    crtObjectDensity: Math.round(Math.max(0, (65 - normalized) / 65) * 100) / 100,
  };
}

export function advanceConditionByMonths(
  storedScore: number,
  lastMaintainedAt: Date | string | number | null | undefined,
  monthsElapsed: number,
  nowMs = Date.now(),
): ConditionProfile {
  const months = Math.max(0, Math.floor(Number(monthsElapsed) || 0));
  const score = Math.max(0, Number(storedScore) - months * MONTHLY_CONDITION_LOSS);
  const profile = deriveConditionProfile(score, lastMaintainedAt, nowMs);
  return {
    ...profile,
    score: Math.min(profile.score, Math.max(0, Math.floor(score))),
    state: conditionStateFromScore(Math.min(profile.score, Math.max(0, Math.floor(score)))),
    cues: CONDITION_CUES[conditionStateFromScore(Math.min(profile.score, Math.max(0, Math.floor(score))))],
    visuals: conditionVisualsFromScore(Math.min(profile.score, Math.max(0, Math.floor(score)))),
  };
}

export function deriveConditionProfile(
  storedScore = 100,
  lastMaintainedAt: Date | string | number | null | undefined = null,
  nowMs = Date.now(),
): ConditionProfile {
  const maintainedAt = toTimestamp(lastMaintainedAt);
  const daysSinceMaintenance = maintainedAt == null
    ? 0
    : Math.max(0, Math.floor((nowMs - maintainedAt) / 86_400_000));
  const driftDays = Math.max(0, daysSinceMaintenance - CONDITION_DRIFT_GRACE_DAYS);
  const score = Math.max(0, Math.min(100, Math.floor(Number(storedScore) - driftDays * CONDITION_DRIFT_PER_DAY)));
  const state = conditionStateFromScore(score);
  return {
    score,
    state,
    daysSinceMaintenance,
    cues: CONDITION_CUES[state],
    visuals: conditionVisualsFromScore(score),
  };
}

export function repairConditionScore(
  storedScore: number,
  lastMaintainedAt: Date | string | number | null | undefined,
  workUnits: number,
  nowMs = Date.now(),
): { profile: ConditionProfile; repairedScore: number } {
  const current = deriveConditionProfile(storedScore, lastMaintainedAt, nowMs);
  const units = Math.max(1, Math.min(8, Math.floor(Number(workUnits) || 1)));
  const repairedScore = Math.min(100, current.score + units * CONDITION_REPAIR_POINTS_PER_UNIT);
  return {
    repairedScore,
    profile: deriveConditionProfile(repairedScore, nowMs, nowMs),
  };
}