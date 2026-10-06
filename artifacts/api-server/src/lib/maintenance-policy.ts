import type { BuildingObjectAction } from "./desktop-building-objects";

const DAY_MS = 24 * 60 * 60 * 1_000;
export const BUILDING_DECAY_GRACE_DAYS = 3;
export const CLEANLINESS_DECAY_PER_DAY = 2;
export const CONDITION_DECAY_PER_DAY = 1.5;
export const PUBLIC_WORK_SCORE_THRESHOLD = 70;

export function decayBuildingScore(
  score: number,
  lastMaintainedAt: Date | string | null | undefined,
  pointsPerDay: number,
  nowMs = Date.now(),
): number {
  if (!lastMaintainedAt) return clampScore(score);
  const timestamp = lastMaintainedAt instanceof Date
    ? lastMaintainedAt.getTime()
    : Date.parse(lastMaintainedAt);
  if (!Number.isFinite(timestamp)) return clampScore(score);
  const elapsedDays = Math.max(0, Math.floor((nowMs - timestamp) / DAY_MS));
  const decayDays = Math.max(0, elapsedDays - BUILDING_DECAY_GRACE_DAYS);
  return clampScore(Math.floor(score - decayDays * pointsPerDay));
}

export function needsPublicMaintenance(score: number): boolean {
  return clampScore(score) <= PUBLIC_WORK_SCORE_THRESHOLD;
}

export function publicMaintenanceReward(score: number): number {
  const severity = 100 - clampScore(score);
  if (severity >= 80) return 100;
  if (severity >= 65) return 75;
  if (severity >= 50) return 50;
  return 25;
}

export function publicMaintenanceDurationMs(action: BuildingObjectAction, score: number): number {
  const severity = 100 - clampScore(score);
  const baseMs = action === "clean" ? 3_500 : 5_000;
  return Math.min(10_000, baseMs + severity * 45);
}

export function publicMaintenanceSlotLimit(input: {
  recentResidents: number;
  recentWorkerResidents: number;
  averageFiatWealth: number;
}): number {
  const residents = Math.max(0, Math.floor(input.recentResidents));
  const workers = Math.max(0, Math.floor(input.recentWorkerResidents));
  const participationTarget = Math.max(1, residents * 0.25);
  const participationNeed = 1 - Math.min(1, workers / participationTarget);
  const wealthNeed = 1 - Math.min(1, Math.max(0, input.averageFiatWealth) / 50_000);
  return Math.max(2, Math.min(10, 2 + Math.round(participationNeed * 4 + wealthNeed * 4)));
}

export function workProgress(startedAt: Date, durationMs: number, nowMs = Date.now()): number {
  if (durationMs <= 0) return 1;
  return Math.max(0, Math.min(1, (nowMs - startedAt.getTime()) / durationMs));
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.floor(Number(score) || 0)));
}
