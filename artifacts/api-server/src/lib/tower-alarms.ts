export const TOWER_ALARM_MODES = [
  "silent",
  "lights_only",
  "quiet",
  "medium",
  "loud",
] as const;

export type TowerAlarmMode = (typeof TOWER_ALARM_MODES)[number];
export type TowerAlarmType =
  | "power_failure"
  | "water_failure"
  | "fire"
  | "smoke"
  | "flood"
  | "poison"
  | "crime_scene"
  | "sprinkler_failure";

export type TowerAlarmSpec = {
  eventKey: string;
  alarmType: TowerAlarmType;
  floorKey: string;
  zoneKey: string;
  x: number;
  y: number;
  summary: string;
  mode: TowerAlarmMode;
  requiresManualShutdown: boolean;
  soundSeconds: number;
};

const RARE_INCIDENTS: TowerAlarmSpec["alarmType"][] = [
  "fire",
  "smoke",
  "flood",
  "poison",
  "crime_scene",
];

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function getDailyTowerIncident(now: Date): TowerAlarmSpec | null {
  const day = now.toISOString().slice(0, 10);
  const seed = stableHash(`shadow_tower:${day}`);
  if (seed % 25 !== 0) return null;

  const alarmType = RARE_INCIDENTS[Math.floor(seed / 25) % RARE_INCIDENTS.length]!;
  const byType: Record<TowerAlarmSpec["alarmType"], Omit<TowerAlarmSpec, "eventKey" | "alarmType">> = {
    power_failure: { floorKey: "B5", zoneKey: "b5-generator-room", x: 7_500, y: 2_000, summary: "Critical generator failure", mode: "medium", requiresManualShutdown: false, soundSeconds: 18 },
    water_failure: { floorKey: "B6", zoneKey: "b6-pump-room", x: 2_500, y: 7_500, summary: "Critical water-system failure", mode: "medium", requiresManualShutdown: false, soundSeconds: 18 },
    fire: { floorKey: "B3", zoneKey: "b3-fire-bay", x: 2_000, y: 4_000, summary: "Fire response required", mode: "loud", requiresManualShutdown: true, soundSeconds: 24 },
    smoke: { floorKey: "B3", zoneKey: "b3-fire-bay", x: 2_000, y: 4_000, summary: "Smoke detector activated", mode: "loud", requiresManualShutdown: true, soundSeconds: 20 },
    flood: { floorKey: "B6", zoneKey: "b6-pump-room", x: 2_500, y: 7_500, summary: "Water detected in the pump access area", mode: "loud", requiresManualShutdown: true, soundSeconds: 20 },
    poison: { floorKey: "B4", zoneKey: "b4-supply-room", x: 5_000, y: 6_500, summary: "Supply contamination sensor activated", mode: "quiet", requiresManualShutdown: true, soundSeconds: 12 },
    crime_scene: { floorKey: "B2", zoneKey: "b2-collections", x: 7_200, y: 7_100, summary: "Camera review flagged a possible crime scene", mode: "lights_only", requiresManualShutdown: true, soundSeconds: 0 },
    sprinkler_failure: { floorKey: "B6", zoneKey: "b6-pump-room", x: 2_500, y: 7_500, summary: "Fire suppression water unavailable", mode: "medium", requiresManualShutdown: true, soundSeconds: 12 },
  };

  return {
    eventKey: `tower-rare-incident:${day}`,
    alarmType,
    ...byType[alarmType],
  };
}

export function towerAlarmSoundActive(
  mode: TowerAlarmMode,
  soundUntilAt: Date | null,
  now: Date,
): boolean {
  return mode !== "silent" && mode !== "lights_only"
    && soundUntilAt != null && soundUntilAt.getTime() > now.getTime();
}

export function isAlarmLocalToArea(
  alarm: { floorKey: string; x: number; y: number; radius: number },
  floorNumber: number,
  x: number,
  y: number,
): boolean {
  return alarm.floorKey === `B${floorNumber}`
    && Math.hypot(alarm.x - x, alarm.y - y) <= alarm.radius;
}
