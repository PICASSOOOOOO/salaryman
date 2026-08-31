/**
 * Shared vertical-world vocabulary.
 *
 * The surface city remains the canonical world coordinate space. Vertical
 * buildings and the first underground district are layers within that space,
 * not separate routes or duplicate maps.
 */
export type WorldLayer = 'surface' | 'underground';
export type VerticalLevelKind = 'basement' | 'lobby' | 'floor' | 'roof';

export interface VerticalLevel {
  id: string;
  floor: number;
  kind: VerticalLevelKind;
  name: string;
  description: string;
  access: 'stairs' | 'elevator' | 'both';
  social?: string;
}

export interface VerticalBuildingPlan {
  buildingId: string;
  levels: VerticalLevel[];
  socialSummary: string;
}

export const UNDERGROUND_LAYER = 'underground' as const;
export const UNDERGROUND_BOUNDS = { left: 5480, top: 7040, right: 8320, bottom: 8440 };
export const UNDERGROUND_TILE_PREFIX = 'u:';
export const UNDERGROUND_ENTRY = { x: 6900, y: 7380, label: 'THE UNDERCITY' };
export const UNDERGROUND_EXIT = { x: 6900, y: 7445, label: 'SURFACE METRO / CENTRAL' };

export interface UndergroundPoi {
  id: string;
  x: number;
  y: number;
  title: string;
  subtitle: string;
  description: string;
  color: string;
  radius: number;
  social?: string;
}

export const UNDERGROUND_POIS: UndergroundPoi[] = [
  {
    id: 'undercity-station',
    x: 6900, y: 7380,
    title: 'DEEP LINE PLATFORM',
    subtitle: 'SURFACE ACCESS',
    description: 'The last public platform below Minx City. A municipal elevator rises to Metro Central.',
    color: '#38bdf8', radius: 92,
  },
  {
    id: 'computer-cafe',
    x: 5920, y: 7800,
    title: 'NULL CAFE',
    subtitle: 'COMPUTERS · COFFEE · NO EMPLOYER BADGES',
    description: 'A warm room of public terminals where unemployed residents trade leads, tutorials, and spare bandwidth.',
    color: '#c084fc', radius: 110,
    social: 'An open table gives the city’s unassigned workers somewhere to meet.',
  },
  {
    id: 'warren-market',
    x: 6900, y: 7900,
    title: 'THE WARREN MARKET',
    subtitle: 'REPAIR · FOOD · SECOND-HAND SIGNALS',
    description: 'A ribbon of stalls under old service arches. Every door opens onto another conversation.',
    color: '#f59e0b', radius: 118,
    social: 'Stallkeepers and passers-by share the central aisle instead of private lobbies.',
  },
  {
    id: 'waterworks',
    x: 7900, y: 7790,
    title: 'BLUEWATER WORKS',
    subtitle: 'RECLAMATION PUMP',
    description: 'The old waterworks keeps the district alive. Its maintenance catwalk is the loudest place underground.',
    color: '#2dd4bf', radius: 105,
  },
  {
    id: 'commons',
    x: 6500, y: 8240,
    title: 'LOWLIGHT COMMONS',
    subtitle: 'SOCIAL FLOOR · ALL WELCOME',
    description: 'A sunken public room with music, folding tables, and noticeboards for rooms, work, and mutual aid.',
    color: '#fb7185', radius: 115,
    social: 'No registration desk. The Commons is the underground’s shared living room.',
  },
];

export const UNDERGROUND_SOLIDS = [
  { x: 5480, y: 7040, w: 2840, h: 34 },
  { x: 5480, y: 8406, w: 2840, h: 34 },
  { x: 5480, y: 7040, w: 34, h: 1400 },
  { x: 8286, y: 7040, w: 34, h: 1400 },
  { x: 5480, y: 7540, w: 470, h: 42 },
  { x: 6430, y: 7540, w: 740, h: 42 },
  { x: 7160, y: 7540, w: 1160, h: 42 },
  { x: 5480, y: 8060, w: 570, h: 42 },
  { x: 7000, y: 8060, w: 580, h: 42 },
  { x: 7550, y: 8060, w: 770, h: 42 },
];

export function undergroundTileId(x: number, y: number): string {
  return `${UNDERGROUND_TILE_PREFIX}${Math.floor(x / 256)},${Math.floor(y / 256)}`;
}

export function surfaceTileId(x: number, y: number): string {
  // Preserve the legacy surface format so existing exploration data and the
  // surface atlas remain compatible. New non-surface layers are namespaced.
  return `${Math.floor(x / 256)},${Math.floor(y / 256)}`;
}

export function isUndergroundTile(tile: string): boolean {
  return tile.startsWith(UNDERGROUND_TILE_PREFIX);
}

export function parseLayerTile(tile: string): { layer: WorldLayer; x: number; y: number } | null {
  const underground = isUndergroundTile(tile);
  const raw = underground ? tile.slice(UNDERGROUND_TILE_PREFIX.length) : tile;
  const match = raw.match(/^(-?\d+),(-?\d+)$/);
  if (!match) return null;
  return {
    layer: underground ? 'underground' : 'surface',
    x: Number(match[1]),
    y: Number(match[2]),
  };
}

export function isUndergroundPoint(x: number, y: number): boolean {
  return x >= UNDERGROUND_BOUNDS.left && x <= UNDERGROUND_BOUNDS.right
    && y >= UNDERGROUND_BOUNDS.top && y <= UNDERGROUND_BOUNDS.bottom;
}

export function buildVerticalPlan(buildingId: string, floorCount: number): VerticalBuildingPlan {
  const levels: VerticalLevel[] = [
    {
      id: `${buildingId}:b1`, floor: -1, kind: 'basement', name: 'BASEMENT / SERVICE',
      description: 'Utility corridors, storage, and the building’s oldest infrastructure.',
      access: 'stairs',
    },
    {
      id: `${buildingId}:lobby`, floor: 0, kind: 'lobby', name: 'LOBBY / COMMONS',
      description: 'A shared landing where residents, workers, and visitors cross paths.',
      access: 'both', social: 'The social spine connects every level.',
    },
  ];
  for (let floor = 1; floor <= Math.max(1, floorCount); floor++) {
    levels.push({
      id: `${buildingId}:f${floor}`, floor, kind: 'floor',
      name: `LEVEL ${String(floor).padStart(2, '0')}`,
      description: 'A stackable floor for a business, studio, home, or public room.',
      access: 'elevator',
      social: floor % 2 === 0 ? 'Shared landing: people stop here between destinations.' : undefined,
    });
  }
  levels.push({
    id: `${buildingId}:roof`, floor: floorCount + 1, kind: 'roof', name: 'ROOF / SKY DECK',
    description: 'A maintenance deck above the city lights. Stairs only.',
    access: 'stairs',
    social: 'A public overlook when the weather clears.',
  });
  return {
    buildingId,
    levels,
    socialSummary: 'Elevators move between registered floors; stairs connect the lobby, basement, and roof.',
  };
}

export const UNDERGROUND_VERTICAL_PLAN: VerticalBuildingPlan = {
  buildingId: 'undercity',
  levels: [
    {
      id: 'undercity:b1', floor: -1, kind: 'basement', name: 'PUMP LEVEL',
      description: 'A lower maintenance ring beneath the public district.',
      access: 'stairs',
    },
    {
      id: 'undercity:lobby', floor: 0, kind: 'lobby', name: 'UNDERCITY COMMONS',
      description: 'The shared concourse: café, market, noticeboards, and the return elevator.',
      access: 'both',
      social: 'Every district route meets here.',
    },
  ],
  socialSummary: 'The underground is a horizontal district with a vertical station core.',
};