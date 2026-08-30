export const PLAYABLE_PROPERTY_KEYS = [
  "property_apartment_office",
  "property_coworking_suite",
  "property_corner_office",
  "property_warehouse",
  "property_hq_floor",
  "property_tower",
  "property_campus",
] as const;

export type PlayablePropertyKey = (typeof PLAYABLE_PROPERTY_KEYS)[number];

const PLAYABLE_PROPERTY_KEY_SET = new Set<string>(PLAYABLE_PROPERTY_KEYS);

export function isPlayablePropertyKey(value: unknown): value is PlayablePropertyKey {
  return typeof value === "string" && PLAYABLE_PROPERTY_KEY_SET.has(value);
}