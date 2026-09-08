import type { InteriorDef } from '@/pages/worldInteriorData';

export type MapContext =
  | {
      kind: 'office';
      buildingId: string;
      buildingLabel: string;
      officeTier?: string;
    }
  | {
      kind: 'building';
      buildingId: string;
      buildingLabel: string;
      interiorKey: string;
      floor?: number;
      floorPlan?: InteriorDef;
    };

const STORAGE_KEY = 'sm_map_context';

export function setMapContext(context: MapContext): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(context));
  } catch {
    // Session storage is an enhancement; the map has a safe city fallback.
  }
}

export function setBuildingMapContext(
  buildingId: string,
  buildingLabel: string,
  interiorKey: string,
  floorPlan: InteriorDef,
  floor?: number,
): void {
  setMapContext({
    kind: 'building',
    buildingId,
    buildingLabel,
    interiorKey,
    floorPlan,
    ...(floor && floor > 0 ? { floor } : {}),
  });
}

export function clearMapContext(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Session storage is an enhancement; the city map remains available.
  }
}

export function getMapContext(): MapContext | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<MapContext>;
    if (value.kind !== 'office' && value.kind !== 'building') return null;
    if (typeof value.buildingId !== 'string' || typeof value.buildingLabel !== 'string') return null;
    if (value.kind === 'building' && typeof value.interiorKey !== 'string') return null;
    if (value.kind === 'building' && value.floorPlan != null) {
      const plan = value.floorPlan as Partial<InteriorDef>;
      if (
        typeof plan.id !== 'string'
        || typeof plan.label !== 'string'
        || typeof plan.width !== 'number'
        || typeof plan.height !== 'number'
        || !Array.isArray(plan.objects)
      ) return null;
    }
    return value as MapContext;
  } catch {
    return null;
  }
}