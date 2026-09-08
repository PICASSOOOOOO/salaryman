import { apiFetch } from './api-client';

export type BuildingConditionState = 'flourishing' | 'maintained' | 'weathered' | 'neglected' | 'rotting';

export interface BuildingCondition {
  score: number;
  state: BuildingConditionState;
  daysSinceMaintenance: number;
  visuals?: {
    materialStyle: 'solar' | 'patina' | 'crt';
    solarPlantHealth: number;
    surfaceWear: number;
    circuitExposure: number;
    lightFlicker: number;
    crtObjectDensity: number;
  };
  cues: {
    surface: string;
    structure: string;
    vegetation: string;
    occupancy: string;
    moisture: string;
    repairAction: string;
  };
}

export interface CityBuilding {
  id: number;
  ownerId: string | null;
  ownerName: string;
  name: string;
  buildingType: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  label: string | null;
  description: string | null;
  rentPrice: number;
  buildCost: number;
  tenantId: string | null;
  tenantName: string | null;
  isPublic: boolean;
  serverId: string;
  conditionScore?: number;
  conditionLastMaintainedAt?: string | null;
  conditionRepairCount?: number;
  condition?: BuildingCondition;
}

export interface BuildingTypeSpec {
  id: string;
  label: string;
  minW: number;
  minH: number;
  maxW: number;
  maxH: number;
  baseCost: number;
}

let _cache: CityBuilding[] = [];
let _lastFetch = 0;
const CACHE_MS = 15_000;

export async function fetchCityBuildings(serverId = 'minx_prime', force = false): Promise<CityBuilding[]> {
  if (!force && Date.now() - _lastFetch < CACHE_MS && _cache.length > 0) return _cache;
  try {
    const r = await apiFetch(`/api/world/buildings?serverId=${serverId}`, { credentials: 'include' });
    if (!r.ok) return _cache;
    const data = await r.json();
    _cache = data.buildings ?? [];
    _lastFetch = Date.now();
    return _cache;
  } catch {
    return _cache;
  }
}

export function getCachedBuildings(): CityBuilding[] {
  return _cache;
}

export async function fetchBuildingTypes(): Promise<{ types: BuildingTypeSpec[]; colors: string[] }> {
  try {
    const r = await apiFetch('/api/world/building-types');
    if (!r.ok) return { types: [], colors: [] };
    return await r.json();
  } catch {
    return { types: [], colors: [] };
  }
}

export async function buildBuilding(params: {
  name: string;
  buildingType: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  label?: string;
  description?: string;
  rentPrice?: number;
  isPublic?: boolean;
  serverId?: string;
}): Promise<{ building?: CityBuilding; cost?: number; error?: string }> {
  try {
    const r = await apiFetch('/api/world/buildings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      credentials: 'include',
    });
    const data = await r.json();
    if (!r.ok) return { error: data.error ?? 'Build failed' };
    _lastFetch = 0;
    return data;
  } catch {
    return { error: 'Network error' };
  }
}

export async function customizeBuilding(id: number, updates: {
  name?: string;
  color?: string;
  label?: string;
  description?: string;
  rentPrice?: number;
  isPublic?: boolean;
}): Promise<{ building?: CityBuilding; error?: string }> {
  try {
    const r = await apiFetch(`/api/world/buildings/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
      credentials: 'include',
    });
    const data = await r.json();
    if (!r.ok) return { error: data.error ?? 'Update failed' };
    _lastFetch = 0;
    return data;
  } catch {
    return { error: 'Network error' };
  }
}

export async function rentBuilding(id: number): Promise<{ building?: CityBuilding; action?: string; rentPrice?: number; error?: string }> {
  try {
    const r = await apiFetch(`/api/world/buildings/${id}/rent`, {
      method: 'POST',
      credentials: 'include',
    });
    const data = await r.json();
    if (!r.ok) return { error: data.error ?? 'Rent failed' };
    _lastFetch = 0;
    return data;
  } catch {
    return { error: 'Network error' };
  }
}

export async function demolishBuilding(id: number): Promise<{ ok?: boolean; refund?: number; error?: string }> {
  try {
    const r = await apiFetch(`/api/world/buildings/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const data = await r.json();
    if (!r.ok) return { error: data.error ?? 'Demolish failed' };
    _lastFetch = 0;
    return data;
  } catch {
    return { error: 'Network error' };
  }
}

export async function repairBuilding(
  id: number,
  workUnits = 1,
): Promise<{ building?: CityBuilding; repair?: { workUnits: number; condition: BuildingCondition }; error?: string }> {
  try {
    const r = await apiFetch(`/api/world/buildings/${id}/repair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workUnits: Math.max(1, Math.min(8, Math.floor(workUnits))) }),
      credentials: 'include',
    });
    const data = await r.json();
    if (!r.ok) return { error: data.error ?? 'Repair failed' };
    _lastFetch = 0;
    return data;
  } catch {
    return { error: 'Network error' };
  }
}

export function drawPlayerBuilding(
  ctx: CanvasRenderingContext2D,
  b: CityBuilding,
  ox: number,
  oy: number,
  isNear: boolean,
  blink: boolean,
  frame: number,
  dayBright: number = 1,
) {
  const bx = b.x + ox, by = b.y + oy;
  const c = b.color || '#38bdf8';

  const hexToRgb = (hex: string): [number, number, number] => {
    const r = parseInt(hex.slice(1, 3), 16) || 128;
    const g = parseInt(hex.slice(3, 5), 16) || 128;
    const bl = parseInt(hex.slice(5, 7), 16) || 128;
    return [r, g, bl];
  };
  const [cr, cg, cb] = hexToRgb(c);
  const br = 0.85;
  const condition = b.condition;
  const materialStyle = condition?.visuals?.materialStyle ?? 'solar';
  const wear = condition?.visuals?.surfaceWear ?? 0;
  const circuitExposure = condition?.visuals?.circuitExposure ?? 0;
  const flicker = condition?.visuals?.lightFlicker ?? 0;
  const crtObjectDensity = condition?.visuals?.crtObjectDensity ?? 0;
  const material = materialStyle === 'solar'
    ? [cr, cg, cb]
    : materialStyle === 'patina'
      ? [Math.round(cr * 0.72 + 94 * 0.28), Math.round(cg * 0.72 + 106 * 0.28), Math.round(cb * 0.72 + 74 * 0.28)]
      : [Math.round(cr * 0.38 + 68 * 0.62), Math.round(cg * 0.38 + 47 * 0.62), Math.round(cb * 0.38 + 74 * 0.62)];
  const [mr, mg, mb] = material;

  const depthX = 4;
  const depthY = 2.5;

  // ── Soft cast shadow on the ground ─────────────────────────────────
  // Matches the generic city-building convention: grounds the structure so it
  // doesn't float. Drawn BEFORE the building art so it sits on top of its own
  // shadow. Key light reads from the upper-left, so the shadow projects
  // DOWN-RIGHT off the ground-footprint quad; softness is faked with a few
  // stacked, outward-expanded layers. Opacity scales with time of day.
  {
    const shA = 0.20 * dayBright; // subtle, day-scaled
    const sdx = 6, sdy = 5;       // down-right throw (upper-left key light)
    const gy = by + b.h;          // front ground line
    const fcx = bx + b.w / 2 + depthX / 2 + sdx; // footprint centroid (x)
    const fcy = gy + depthY / 2 + sdy;            // footprint centroid (y)
    const corners: [number, number][] = [
      [bx + sdx,                gy + sdy],
      [bx + b.w + sdx,          gy + sdy],
      [bx + b.w + depthX + sdx, gy + depthY + sdy],
      [bx + depthX + sdx,       gy + depthY + sdy],
    ];
    ctx.save();
    for (const layer of [{ e: 6, a: 0.30 }, { e: 3, a: 0.32 }, { e: 0, a: 0.38 }]) {
      ctx.fillStyle = `rgba(0,0,0,${shA * layer.a})`;
      ctx.beginPath();
      for (let ci = 0; ci < corners.length; ci++) {
        const [cxr, cyr] = corners[ci];
        const ex = cxr + (cxr - fcx > 0 ? layer.e : -layer.e);
        const ey = cyr + (cyr - fcy > 0 ? layer.e : -layer.e);
        if (ci === 0) ctx.moveTo(ex, ey); else ctx.lineTo(ex, ey);
      }
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  ctx.fillStyle = `rgb(${Math.floor(mr * 0.7 * br)},${Math.floor(mg * 0.7 * br)},${Math.floor(mb * 0.7 * br)})`;
  ctx.beginPath();
  ctx.moveTo(bx, by - 3);
  ctx.lineTo(bx + b.w, by - 3);
  ctx.lineTo(bx + b.w + depthX, by - 3 + depthY);
  ctx.lineTo(bx + depthX, by - 3 + depthY);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = `rgb(${Math.floor(mr * br)},${Math.floor(mg * br)},${Math.floor(mb * br)})`;
  ctx.globalAlpha = 0.12;
  ctx.fillRect(bx, by, b.w, b.h);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = materialStyle === 'crt'
    ? `rgba(171,102,211,${isNear ? 0.9 : 0.42})`
    : isNear ? `${c}dd` : `${c}55`;
  ctx.lineWidth = isNear ? 2 : 1;
  ctx.strokeRect(bx, by, b.w, b.h);

  ctx.fillStyle = `rgb(${Math.floor(mr * 0.5 * br)},${Math.floor(mg * 0.5 * br)},${Math.floor(mb * 0.5 * br)})`;
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.moveTo(bx + b.w, by);
  ctx.lineTo(bx + b.w + depthX, by + depthY);
  ctx.lineTo(bx + b.w + depthX, by + b.h + depthY);
  ctx.lineTo(bx + b.w, by + b.h);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  const cs = 6;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = isNear ? `${c}bb` : `${c}44`;
  [[bx, by, 1, 1], [bx + b.w, by, -1, 1], [bx, by + b.h, 1, -1], [bx + b.w, by + b.h, -1, -1]].forEach(([cx2, cy2, sx, sy]) => {
    ctx.beginPath();
    ctx.moveTo(cx2 as number, (cy2 as number) + (sy as number) * cs);
    ctx.lineTo(cx2 as number, cy2 as number);
    ctx.lineTo((cx2 as number) + (sx as number) * cs, cy2 as number);
    ctx.stroke();
  });

  const winW = 5, winH = 5, winGapX = 3, winGapY = 4;
  const winCols = Math.max(1, Math.floor((b.w - 10) / (winW + winGapX)));
  const winRows = Math.max(1, Math.floor((b.h - 16) / (winH + winGapY)));
  for (let wr = 0; wr < winRows; wr++) {
    for (let wc = 0; wc < winCols; wc++) {
      const wx = bx + 5 + wc * (winW + winGapX);
      const wy = by + 5 + wr * (winH + winGapY);
      const lit = ((wr * 7 + wc * 3 + Math.floor(frame * 0.01)) % 5) > 2;
      const unstable = flicker > 0 && ((frame + wr * 7 + wc * 3) % 18) < flicker * 18;
      const windowAlpha = lit ? 0.25 - wear * 0.1 : 0.06;
      ctx.fillStyle = unstable
        ? `rgba(197,105,221,${0.28 + flicker * 0.35})`
        : `rgba(${mr},${mg},${mb},${Math.max(0.02, windowAlpha)})`;
      ctx.fillRect(wx, wy, winW, winH);
    }
  }

  // A neglected building acquires physical CRT-era salvage: antennae,
  // monitor blocks, cable runs, and small magenta/amber service lights.
  // These cues stay local to the structure; the world never becomes a
  // full-screen cyberpunk filter.
  if (crtObjectDensity > 0) {
    ctx.save();
    ctx.globalAlpha = 0.35 + crtObjectDensity * 0.55;
    ctx.fillStyle = '#2a1e32';
    ctx.strokeStyle = '#b46fc7';
    ctx.lineWidth = 1;
    const monitorCount = Math.max(1, Math.floor(crtObjectDensity * 4));
    for (let i = 0; i < monitorCount; i++) {
      const mx = bx + 7 + ((i * 31) % Math.max(14, b.w - 20));
      const my = by + b.h - 13 - ((i * 11) % Math.max(8, b.h - 18));
      ctx.fillRect(mx, my, 8, 5);
      ctx.strokeRect(mx, my, 8, 5);
      ctx.fillStyle = i % 2 ? '#d59a5c' : '#b46fc7';
      ctx.fillRect(mx + 2, my + 2, 2, 1);
      ctx.fillStyle = '#2a1e32';
    }
    ctx.beginPath();
    ctx.moveTo(bx + b.w * 0.78, by + 3);
    ctx.lineTo(bx + b.w * 0.8, by - 8 - crtObjectDensity * 5);
    ctx.stroke();
    ctx.fillStyle = '#d59a5c';
    ctx.fillRect(bx + b.w * 0.79, by - 10 - crtObjectDensity * 5, 2, 2);
    if (circuitExposure > 0.25) {
      ctx.strokeStyle = '#b46fc7';
      ctx.globalAlpha *= 0.7;
      ctx.beginPath();
      ctx.moveTo(bx + b.w * 0.35, by + 5);
      ctx.lineTo(bx + b.w * 0.36, by + b.h * 0.4);
      ctx.lineTo(bx + b.w * 0.43, by + b.h * 0.55);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Condition is communicated through ordinary material evidence, not a global
  // color wash. The building footprint, interaction target, and collision stay
  // unchanged across every state.
  const conditionState = b.condition?.state;
  if (conditionState === 'weathered' || conditionState === 'neglected' || conditionState === 'rotting') {
    ctx.save();
    ctx.globalAlpha = conditionState === 'weathered' ? 0.24 : conditionState === 'neglected' ? 0.34 : 0.44;
    ctx.strokeStyle = '#8b6f54';
    ctx.lineWidth = 1;
    const streaks = Math.max(2, Math.floor(b.w / 28));
    for (let i = 0; i < streaks; i++) {
      const sx = bx + 9 + ((i * 19) % Math.max(12, b.w - 14));
      const sy = by + 8 + ((i * 13) % Math.max(12, b.h - 18));
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + (i % 2 ? 2 : -1), sy + 7 + (i % 3) * 3);
      ctx.stroke();
    }
    ctx.fillStyle = '#5e4939';
    const dust = conditionState === 'rotting' ? 5 : 3;
    for (let i = 0; i < dust; i++) {
      const dx = bx + 6 + ((i * 23) % Math.max(12, b.w - 12));
      const dy = by + b.h - 8 - ((i * 11) % Math.max(8, b.h - 12));
      ctx.fillRect(dx, dy, 2 + (i % 2), 1 + (i % 2));
    }
    if (conditionState === 'rotting') {
      ctx.strokeStyle = '#765747';
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(bx + b.w * 0.22, by + 3);
      ctx.lineTo(bx + b.w * 0.26, by + b.h * 0.35);
      ctx.lineTo(bx + b.w * 0.2, by + b.h * 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Building name + owner name are intentionally omitted — player properties are
  // recognised by their art, not floating text labels. Rent/tenant status below
  // is kept because it is functional information, not an identity label.
  ctx.textAlign = 'center';

  if (isNear) {
    ctx.strokeStyle = c;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx - 1, by - 1, b.w + 2, b.h + 2);
    ctx.fillStyle = blink ? `${c}dd` : `${c}35`;
    ctx.font = '8px "Fira Code"';
    ctx.fillText('[E]', bx + b.w / 2, by - 12);
  }
}

export const PLAYER_BUILDING_RANGE = 45;

export function findNearPlayerBuilding(px: number, py: number, buildings: CityBuilding[]): CityBuilding | null {
  for (const b of buildings) {
    if (Math.hypot(px - (b.x + b.w / 2), py - (b.y + b.h / 2)) < PLAYER_BUILDING_RANGE) return b;
  }
  return null;
}

export function isInsidePlayerBuilding(px: number, py: number, buildings: CityBuilding[]): boolean {
  for (const b of buildings) {
    if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return true;
  }
  return false;
}
