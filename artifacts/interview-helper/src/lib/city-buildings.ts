import { apiFetch } from './api-client';

export type BuildingConditionState = 'flourishing' | 'maintained' | 'weathered' | 'neglected' | 'rotting';

export interface BuildingCondition {
  score: number;
  state: BuildingConditionState;
  daysSinceMaintenance: number;
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

  ctx.fillStyle = `rgb(${Math.floor(cr * 0.7 * br)},${Math.floor(cg * 0.7 * br)},${Math.floor(cb * 0.7 * br)})`;
  ctx.beginPath();
  ctx.moveTo(bx, by - 3);
  ctx.lineTo(bx + b.w, by - 3);
  ctx.lineTo(bx + b.w + depthX, by - 3 + depthY);
  ctx.lineTo(bx + depthX, by - 3 + depthY);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = `rgb(${Math.floor(cr * br)},${Math.floor(cg * br)},${Math.floor(cb * br)})`;
  ctx.globalAlpha = 0.12;
  ctx.fillRect(bx, by, b.w, b.h);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = isNear ? `${c}dd` : `${c}55`;
  ctx.lineWidth = isNear ? 2 : 1;
  ctx.strokeRect(bx, by, b.w, b.h);

  ctx.fillStyle = `rgb(${Math.floor(cr * 0.5 * br)},${Math.floor(cg * 0.5 * br)},${Math.floor(cb * 0.5 * br)})`;
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
      ctx.fillStyle = lit ? `rgba(${cr},${cg},${cb},0.25)` : `rgba(${cr},${cg},${cb},0.06)`;
      ctx.fillRect(wx, wy, winW, winH);
    }
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

  if (b.rentPrice > 0 && !b.tenantId) {
    ctx.fillStyle = '#f59e0b99';
    ctx.font = '6px "Fira Code"';
    ctx.fillText(`ƒ${b.rentPrice} RENT`, bx + b.w / 2, by - 5);
  }
  if (b.tenantName) {
    ctx.fillStyle = '#10b98188';
    ctx.font = '5px "Fira Code"';
    ctx.fillText(`TENANT: ${b.tenantName}`, bx + b.w / 2, by - 5);
  }

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
