export type MovementSnapshot = {
  x: number;
  y: number;
  interiorBid?: string;
  paused: boolean;
};

export type StatsSnapshot = {
  hp: number;
  weaponId?: string;
};

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value instanceof Set) return [...value].map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, normalize(item)]),
    );
  }
  return value;
}

/** Deterministic JSON for plain save snapshots, independent of object key order. */
export function stableSnapshot(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function snapshotChanged(value: unknown, previous: string | null): {
  changed: boolean;
  serialized: string;
} {
  const serialized = stableSnapshot(value);
  return { changed: serialized !== previous, serialized };
}

export function movementDistance(
  a: Pick<MovementSnapshot, 'x' | 'y'>,
  b: Pick<MovementSnapshot, 'x' | 'y'>,
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function movementChanged(
  next: MovementSnapshot,
  previous: MovementSnapshot | null,
  materialDistance = 0.05,
): boolean {
  return !previous
    || next.paused !== previous.paused
    || next.interiorBid !== previous.interiorBid
    || movementDistance(next, previous) >= materialDistance;
}

export function statsChanged(next: StatsSnapshot, previous: StatsSnapshot | null): boolean {
  return !previous || next.hp !== previous.hp || next.weaponId !== previous.weaponId;
}

/** A changed value is due once the minimum send spacing has elapsed. */
export function changedMessageDue(
  changed: boolean,
  visible: boolean,
  now: number,
  lastSentAt: number,
  minIntervalMs: number,
): boolean {
  return visible && changed && now - lastSentAt >= minIntervalMs;
}

export function movementDemanded(
  current: Pick<MovementSnapshot, 'x' | 'y'>,
  lastProbe: Pick<MovementSnapshot, 'x' | 'y'> | null,
  threshold: number,
): boolean {
  return !lastProbe || movementDistance(current, lastProbe) >= threshold;
}

export function visibleDue(
  visible: boolean,
  now: number,
  lastRunAt: number | null,
  intervalMs: number,
  demand = true,
): boolean {
  return visible && demand && (lastRunAt === null || now - lastRunAt >= intervalMs);
}