import type { InteriorDef, InteriorObject } from '@/pages/worldInteriorData';
import {
  OFFICE_FLOOR_WIDTH_TILES,
  OFFICE_STATION_LAYOUT,
  OFFICE_TIER_FLOOR,
  OFFICE_TIER_MIN_ROWS,
} from '@/lib/office-layout';

/** Convert the authoritative playable-office grid into an InteriorDef schematic. */
export function getOfficeFloorPlan(tier = 'capsule'): InteriorDef {
  const config = OFFICE_TIER_FLOOR[tier] ?? OFFICE_TIER_FLOOR.capsule;
  const rows = OFFICE_TIER_MIN_ROWS[tier] ?? OFFICE_TIER_MIN_ROWS.capsule;
  const width = OFFICE_FLOOR_WIDTH_TILES * 16;
  const height = rows * 16;
  const objects: InteriorObject[] = [
    { x: 8, y: 8, w: width - 16, h: 22, type: 'server', label: 'BACK WALL · CRYO CAPSULES', color: 'rgba(56,189,248,.16)' },
    { x: 8, y: height - 38, w: width - 16, h: 22, type: 'conference_table', label: 'FRONT WALKWAY · OFFICE FLOOR', color: 'rgba(168,85,247,.12)' },
  ];

  for (const station of OFFICE_STATION_LAYOUT) {
    const type = station.id === 'elevator'
      ? 'elevator'
      : station.id === 'vending'
        ? 'vending_machine'
        : 'terminal';
    objects.push({
      x: station.col * 16 - 16,
      y: station.row * 16 - 16,
      w: 32,
      h: 32,
      type,
      label: station.label,
      color: station.id === 'elevator' ? 'rgba(180,255,100,.28)' : 'rgba(56,189,248,.3)',
    });
  }

  const deskCount = config.deskCols * config.deskRows;
  for (let i = 0; i < deskCount; i++) {
    const col = 4 + (i % config.deskCols) * 3;
    const row = 5 + Math.floor(i / config.deskCols) * 3;
    objects.push({
      x: col * 16,
      y: row * 16,
      w: 32,
      h: 28,
      type: 'desk',
      label: `DESK ${String.fromCharCode(65 + i)}`,
      color: 'rgba(34,197,94,.24)',
    });
  }

  for (let i = 0; i < config.capsules; i++) {
    const col = 4 + (i % 6) * 3;
    const row = 1 + Math.floor(i / 6);
    objects.push({
      x: col * 16,
      y: row * 16,
      w: 32,
      h: 18,
      type: 'storage_locker',
      label: `CAPSULE ${String(i + 1).padStart(2, '0')}`,
      color: 'rgba(129,140,248,.25)',
    });
  }

  return {
    id: 'salaryman_office',
    label: 'PABLO CORP — OPERATIONS FLOOR',
    width,
    height,
    wallColor: 'rgba(15,23,42,.98)',
    floorColor: 'rgba(5,10,22,.96)',
    accentColor: 'rgba(56,189,248,.32)',
    exitX: width / 2 - 24,
    exitY: height - 18,
    exitW: 48,
    exitH: 12,
    objects,
    ambientText: `${tier.toUpperCase()} FLOOR · ${deskCount} desks · ${config.capsules} capsules`,
  };
}