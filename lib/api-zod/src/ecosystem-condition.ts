export const PET_SPECIES = [
  "fish",
  "cat",
  "dog",
  "parrot",
  "dove",
  "other_bird",
  "snake",
  "iguana",
  "horse",
  "cow",
  "water_buffalo",
  "shark",
  "dolphin",
  "whale",
  "elephant",
] as const;

export const ECOSYSTEM_CONDITION_PROFILES = {
  human: {
    primaryMetrics: ["netWorth", "stamina"],
    secondaryMetrics: ["stress", "overwork", "physicalDamage", "bleeding", "sickness"],
    metricDirections: {
      netWorth: "higher_is_better",
      stamina: "higher_is_better",
      stress: "higher_is_worse",
      overwork: "higher_is_worse",
      physicalDamage: "higher_is_worse",
      bleeding: "higher_is_worse",
      sickness: "higher_is_worse",
    },
    careCadence: "self_directed",
  },
  replicant: {
    primaryMetrics: ["netWorth", "battery"],
    secondaryMetrics: ["mechanicalFailure", "malware", "computerVirus"],
    metricDirections: {
      netWorth: "higher_is_better",
      battery: "higher_is_better",
      mechanicalFailure: "higher_is_worse",
      malware: "higher_is_worse",
      computerVirus: "higher_is_worse",
    },
    careCadence: "maintenance_scheduled",
  },
  pet: {
    primaryMetrics: ["health", "nutrition", "hydration"],
    secondaryMetrics: ["fatigue", "stress", "sickness", "poison", "injury"],
    metricDirections: {
      health: "higher_is_better",
      nutrition: "higher_is_better",
      hydration: "higher_is_better",
      fatigue: "higher_is_worse",
      stress: "higher_is_worse",
      sickness: "higher_is_worse",
      poison: "higher_is_worse",
      injury: "higher_is_worse",
    },
    careCadence: "forgiving",
    species: PET_SPECIES,
  },
  vehicle: {
    primaryMetrics: ["quality", "fuel"],
    secondaryMetrics: ["rust", "engineWear", "tireCondition"],
    metricDirections: {
      quality: "higher_is_better",
      fuel: "higher_is_better",
      rust: "higher_is_worse",
      engineWear: "higher_is_worse",
      tireCondition: "higher_is_better",
    },
    careCadence: "maintenance_scheduled",
    useContext: "outside_world",
    vehicleTypes: ["bicycle", "vespa", "car", "tank", "utility_vehicle", "jeep"],
  },
  building: {
    primaryMetrics: ["quality"],
    secondaryMetrics: ["structuralWear", "cleanliness", "lighting"],
    metricDirections: {
      quality: "higher_is_better",
      structuralWear: "higher_is_worse",
      cleanliness: "higher_is_better",
      lighting: "higher_is_better",
    },
    careCadence: "maintenance_scheduled",
  },
  utility: {
    primaryMetrics: ["quality"],
    secondaryMetrics: ["electrical", "gas", "water"],
    metricDirections: {
      quality: "higher_is_better",
      electrical: "higher_is_better",
      gas: "higher_is_better",
      water: "higher_is_better",
    },
    careCadence: "maintenance_scheduled",
  },
  fixture: {
    primaryMetrics: ["quality"],
    secondaryMetrics: ["cleanliness", "functionalWear", "graffiti"],
    metricDirections: {
      quality: "higher_is_better",
      cleanliness: "higher_is_better",
      functionalWear: "higher_is_worse",
      graffiti: "higher_is_worse",
    },
    careCadence: "maintenance_scheduled",
  },
} as const;

export type ConditionSubjectKind = keyof typeof ECOSYSTEM_CONDITION_PROFILES;
export type ConditionProfileDefinition =
  (typeof ECOSYSTEM_CONDITION_PROFILES)[ConditionSubjectKind];
export type ConditionMetric = ConditionProfileDefinition["primaryMetrics"][number]
  | ConditionProfileDefinition["secondaryMetrics"][number];
export type PetSpecies = (typeof PET_SPECIES)[number];
export type ConditionMetricDirection = "higher_is_better" | "higher_is_worse";

const UNBOUNDED_NONNEGATIVE_METRICS = new Set<string>(["netWorth"]);

export function isConditionMetricAllowed(
  subject: ConditionSubjectKind,
  metric: string,
): boolean {
  const profile = ECOSYSTEM_CONDITION_PROFILES[subject] as {
    primaryMetrics: readonly string[];
    secondaryMetrics: readonly string[];
  };
  return profile.primaryMetrics.includes(metric) || profile.secondaryMetrics.includes(metric);
}

export function getConditionMetricDirection(
  subject: ConditionSubjectKind,
  metric: string,
): ConditionMetricDirection | null {
  if (!isConditionMetricAllowed(subject, metric)) return null;
  const profile = ECOSYSTEM_CONDITION_PROFILES[subject] as {
    metricDirections: Record<string, ConditionMetricDirection>;
  };
  return profile.metricDirections[metric] ?? null;
}

/**
 * Validates and normalizes one metric without collapsing the entity's profile
 * into a universal score. Net worth is an unbounded integer; condition meters
 * use 0–100.
 */
export function normalizeConditionMetric(
  subject: ConditionSubjectKind,
  metric: string,
  value: unknown,
): number | null {
  if (!isConditionMetricAllowed(subject, metric)
    || typeof value !== "number"
    || !Number.isFinite(value)) {
    return null;
  }

  if (UNBOUNDED_NONNEGATIVE_METRICS.has(metric)) {
    return Math.max(0, Math.floor(value));
  }
  return Math.max(0, Math.min(100, Math.floor(value)));
}
