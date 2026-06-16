export const CITY_NAME = 'MINX CITY';

export const DOWNTOWN_BOUNDS = {
  left: 5600,
  top: 5700,
  right: 7280,
  bottom: 6500,
} as const;

export const CITY_CENTER = {
  x: (DOWNTOWN_BOUNDS.left + DOWNTOWN_BOUNDS.right) / 2,
  y: (DOWNTOWN_BOUNDS.top + DOWNTOWN_BOUNDS.bottom) / 2,
} as const;

export interface CoreAnchor {
  id: string;
  label: string;
  short: string;
  x: number;
  y: number;
  type: 'tower' | 'civic' | 'commerce' | 'security' | 'terminal' | 'realestate';
  desc: string;
}

export const CORE_ANCHORS: readonly CoreAnchor[] = [
  { id: 'pablo_tower',       label: 'SHADOW TOWER',         short: 'TOWER',     x: 6350, y: 5826, type: 'tower',      desc: 'PABLO CORP HQ. Story spine. Where the boss watches.' },
  { id: 'police_hq',         label: 'POLICE HQ',            short: 'PRECINCT',  x: 7135, y: 5849, type: 'security',   desc: 'Wanted system, bounty board, Blade Runner desk.' },
  // PABLO STORE + PUBLIC OFFICE removed — commerce moves to vending machines,
  // and coworking moves into the Shadow Tower lobby. (Legacy IDs still resolved
  // by older save data; new world layouts no longer place these buildings.)
  // REAL ESTATE OFFICE removed — every vending machine sells real estate now.
  { id: 'terminal_shop',     label: 'PABLO TERMINAL',       short: 'TERMINAL',  x: 7065, y: 6418, type: 'terminal',   desc: 'Hand off to Pablo. "Be safe. Have fun. Don\'t die."' },
  { id: 'theater',           label: 'THE THEATER',          short: 'THEATER',   x: 6216, y: 6255, type: 'civic',      desc: 'Red velvet. The projector never stops. Nobody checks what\'s showing.' },
] as const;

export const CORE_BUILDING_IDS: ReadonlySet<string> = new Set(CORE_ANCHORS.map(a => a.id));

export function isCoreBuilding(id: string | null | undefined): boolean {
  return !!id && CORE_BUILDING_IDS.has(id);
}

export const CORE_DISTRICTS = [
  { id: 'tower_quarter', label: 'TOWER QUARTER',  x: 6230, y: 5740, w: 980,  h: 200, color: '#a855f7', desc: 'Shadow Tower & Police HQ. The corporate spine.' },
  { id: 'civic_row',     label: 'CIVIC ROW',      x: 6020, y: 6175, w: 800,  h: 90,  color: '#38bdf8', desc: 'Public Office, Real Estate. Where you start working.' },
  { id: 'market_strip',  label: 'MARKET STRIP',   x: 5620, y: 6000, w: 400,  h: 120, color: '#10b981', desc: 'Pablo Store. Outfits, gear, supplies.' },
  { id: 'terminal_pad',  label: 'TERMINAL PAD',   x: 6980, y: 6370, w: 200,  h: 110, color: '#f59e0b', desc: 'Pablo Terminal. Direct line to the boss.' },
] as const;

// ── CITY QUADRANTS ─────────────────────────────────────────────────────────
// Splits the downtown bounds into four labeled districts. Each quadrant has
// its own theme color and short flavor blurb shown on the "ENTERING X"
// subtitle as the player crosses between them. Bounds are inclusive at the
// low edge and exclusive at the high edge; the midline at x=6800 / y=6300
// belongs to the higher (E/S) quadrant.
export interface CityQuadrant {
  id: string;
  label: string;
  x: number; y: number; w: number; h: number;
  color: string;
  blurb: string;
}

const Q_MID_X = 6800;
const Q_MID_Y = 6300;
const Q_LEFT = 6200, Q_RIGHT = 7400, Q_TOP = 5800, Q_BOTTOM = 6800;

export const CITY_QUADRANTS: readonly CityQuadrant[] = [
  { id: 'q_tower',    label: 'TOWER QUARTER',    x: Q_LEFT,  y: Q_TOP,    w: Q_MID_X - Q_LEFT, h: Q_MID_Y - Q_TOP,    color: '#a855f7', blurb: 'Corp spine. Eyes on every floor.' },
  { id: 'q_precinct', label: 'PRECINCT WARD',    x: Q_MID_X, y: Q_TOP,    w: Q_RIGHT - Q_MID_X, h: Q_MID_Y - Q_TOP,    color: '#38bdf8', blurb: 'Blade Runner desk. Bounty board active.' },
  { id: 'q_civic',    label: 'CIVIC ROW',        x: Q_LEFT,  y: Q_MID_Y,  w: Q_MID_X - Q_LEFT,  h: Q_BOTTOM - Q_MID_Y, color: '#10b981', blurb: 'Coworking floors. Real estate desk. Day-one wages.' },
  { id: 'q_terminal', label: 'TERMINAL DISTRICT',x: Q_MID_X, y: Q_MID_Y,  w: Q_RIGHT - Q_MID_X, h: Q_BOTTOM - Q_MID_Y, color: '#f59e0b', blurb: 'Pablo Terminal. Direct line to the boss.' },
] as const;

/** Returns the quadrant containing (x,y), or null if outside downtown. */
export function getQuadrantAt(x: number, y: number): CityQuadrant | null {
  for (const q of CITY_QUADRANTS) {
    if (x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h) return q;
  }
  return null;
}

// ── WASTELAND FOREST ZONES ─────────────────────────────────────────────────
// Designated dense-forest clusters scattered around the wasteland. The
// terrain renderer thickens tree/bush density inside these radii so the
// world reads as varied biome instead of uniform scrubland.
export interface ForestZone {
  id: string;
  cx: number; cy: number;
  r: number;
  /** Tree density multiplier inside the radius (1.0 = normal, 4.0 = dense). */
  density: number;
  label: string;
}

export const FOREST_ZONES: readonly ForestZone[] = [
  { id: 'forest_n',    cx: 6800,  cy: 4200,  r: 900,  density: 4.0, label: 'NORTH PINES'    },
  { id: 'forest_w',    cx: 4200,  cy: 6300,  r: 800,  density: 3.5, label: 'WEST HOLLOW'    },
  { id: 'forest_s',    cx: 6800,  cy: 8400,  r: 1000, density: 4.5, label: 'SOUTH WILDS'    },
  { id: 'forest_e',    cx: 9200,  cy: 6300,  r: 850,  density: 3.8, label: 'EAST EVERGREENS'},
  { id: 'forest_far',  cx: 10500, cy: 9200,  r: 700,  density: 3.0, label: 'DEEP THICKET'   },
  { id: 'forest_nw',   cx: 4500,  cy: 4500,  r: 750,  density: 3.2, label: 'OLD GROWTH'     },
  // ── Newly populated biomes — gives the far map corners visual variety ──
  { id: 'forest_ne',   cx: 11000, cy: 4200,  r: 800,  density: 3.4, label: 'IRON WOODS'     },
  { id: 'forest_sw',   cx: 3200,  cy: 8800,  r: 750,  density: 3.6, label: 'WHISPER GLADE'  },
  { id: 'forest_seam', cx: 5800,  cy: 7000,  r: 500,  density: 2.5, label: 'BORDER COPSE'   },
] as const;

/** Returns the forest density multiplier at (x,y). 1.0 means normal scrubland. */
export function getForestDensity(x: number, y: number): number {
  let max = 1;
  for (const f of FOREST_ZONES) {
    const d = Math.hypot(x - f.cx, y - f.cy);
    if (d < f.r) {
      // Smooth falloff from center to edge.
      const t = 1 - d / f.r;
      const mult = 1 + (f.density - 1) * t;
      if (mult > max) max = mult;
    }
  }
  return max;
}

// ── SECRETS LAYER ──────────────────────────────────────────────────────────
// Hidden interactables placed across the world: trap doors, cache tunnels,
// back-alley stashes. Each renders as a faint glyph the player can only see
// up close, and triggers its payload when they press E within range.
export type SecretKind = 'cache' | 'trapdoor' | 'note' | 'tunnel';

export interface WorldSecret {
  id: string;
  x: number; y: number;
  kind: SecretKind;
  /** Player must be within this many pixels to see/trigger. */
  radius: number;
  label: string;
  payload: { fiat?: number; xp?: number; note?: string };
}

export const WORLD_SECRETS: readonly WorldSecret[] = [
  { id: 'sec_alley_cache', x: 6420, y: 6090, kind: 'cache',    radius: 30, label: 'LOOSE BRICK',         payload: { fiat: 500,  note: 'A loose brick. Behind it: an envelope. ƒ500 inside.' } },
  { id: 'sec_tower_back',  x: 6280, y: 5900, kind: 'note',     radius: 28, label: 'TAPED NOTE',          payload: { xp: 25,    note: 'Taped under a window ledge: "Floor 41 has a back stair. Look for the cleaner." +25 XP' } },
  { id: 'sec_trap_civic',  x: 6700, y: 6320, kind: 'trapdoor', radius: 32, label: 'CELLAR HATCH',        payload: { xp: 40,    note: 'A hatch under a floor mat. Dust on the hinges says no one has opened it in years.' } },
  { id: 'sec_term_stash',  x: 7090, y: 6500, kind: 'cache',    radius: 30, label: 'COIN-SLOT JAM',       payload: { fiat: 1200, note: 'A jammed coin slot. You wedge it open. ƒ1,200 in old coins tumble out.' } },
  { id: 'sec_tunnel_n',    x: 6500, y: 5780, kind: 'tunnel',   radius: 36, label: 'SERVICE TUNNEL',      payload: { xp: 60,    note: 'A tunnel mouth behind ivy. Leads under the city. Marked on your map. +60 XP' } },
  { id: 'sec_waste_cache', x: 5400, y: 7100, kind: 'cache',    radius: 36, label: 'BURIED LOCKER',       payload: { fiat: 2500, note: 'A locker buried in the dust. Combination still works. ƒ2,500.' } },
  { id: 'sec_forest_note', x: 6800, y: 4400, kind: 'note',     radius: 36, label: 'PINNED PHOTO',        payload: { xp: 30,    note: 'A photo pinned to a pine: a face you almost recognize. +30 XP' } },
  { id: 'sec_deep_trap',   x: 10520, y: 9100, kind: 'trapdoor',radius: 36, label: 'GRATING',             payload: { fiat: 800, xp: 40, note: 'A grating in the dirt. You pry it loose. Old supply cache below. ƒ800 +40 XP' } },
  // ── New scattered secrets — rewards exploring the new biomes + corners ──
  { id: 'sec_iron_wood_box',  x: 11020, y: 4180, kind: 'cache',    radius: 36, label: 'STEEL BOX',         payload: { fiat: 1500, note: 'A welded steel box at the foot of an iron pine. Cuts itself open with the right angle. ƒ1,500.' } },
  { id: 'sec_whisper_note',   x: 3220,  y: 8780, kind: 'note',     radius: 36, label: 'BARK CARVING',      payload: { xp: 50, note: 'Names carved into the bark. Forty of them. The forty-first space is empty. +50 XP' } },
  { id: 'sec_border_copse',   x: 5810,  y: 7010, kind: 'cache',    radius: 30, label: 'STUMP HOLLOW',      payload: { fiat: 600, xp: 20, note: 'A hollow under a charred stump. Coins and a folded map fragment. ƒ600 +20 XP' } },
  { id: 'sec_north_tunnel',   x: 6500,  y: 4500, kind: 'tunnel',   radius: 36, label: 'PINE TUNNEL',       payload: { xp: 75, note: 'A tunnel mouth between two roots. Drops below the forest floor. Marks an underground route on your map. +75 XP' } },
  { id: 'sec_far_east_trap',  x: 12500, y: 5500, kind: 'trapdoor', radius: 36, label: 'CONCRETE PLATE',    payload: { fiat: 2000, note: 'A concrete plate flush with the dust. Pry it up. Dropped pallet of FIAT below. ƒ2,000.' } },
  { id: 'sec_river_note',     x: 4800,  y: 7800, kind: 'note',     radius: 32, label: 'RIVERSIDE LETTER',  payload: { xp: 35, note: 'A waterlogged letter in a tin: "If you read this, the third bridge is gone. Take the fourth." +35 XP' } },
  { id: 'sec_termpad_brick',  x: 7110,  y: 6420, kind: 'cache',    radius: 28, label: 'TERMINAL DRAWER',   payload: { fiat: 900, note: 'A drawer behind a Pablo Terminal panel. Forgotten by maintenance. ƒ900 in mixed denominations.' } },
  { id: 'sec_old_growth',     x: 4520,  y: 4520, kind: 'tunnel',   radius: 36, label: 'ROOT HOLLOW',       payload: { xp: 90, note: 'A hollow under the oldest pine. The walls are smooth. Someone shaped this. +90 XP' } },
];

// ── PASSWORD-PROTECTED DOORS ───────────────────────────────────────────────
// Buildings whose front door is locked behind a passcode. The player can
// still see the building from outside, but pressing E pops a keypad and
// rejects entry until the right password is entered. Successful unlocks
// are persisted in the player's save (unlockedBuildings) so they only need
// to do it once per door.
//
// Password matching is case-insensitive and trimmed. `hint` is shown above
// the keypad to give the player a fair shot at guessing without making the
// answer obvious. Use `accessLevel` for soft-gates we may layer later.
export interface BuildingLock {
  buildingId: string;
  password: string;
  hint: string;
  accessLevel?: number;
  /** Optional flavor shown when the player walks up to the locked door. */
  flavor?: string;
}

export const BUILDING_LOCKS: readonly BuildingLock[] = [
  { buildingId: 'east_bunker',  password: 'AURORA',  hint: 'A dawn callsign. Six letters.', flavor: 'Reinforced steel hatch. Keypad blinks red.' },
  { buildingId: 'north_bunker', password: 'GLACIER', hint: 'What the north used to be. Seven letters.', flavor: 'Frost-rimed door. The keypad still works.' },
  { buildingId: 'deep_bunker',  password: 'OBELISK', hint: 'A monolith. Seven letters.', flavor: 'A vault door, not a building door. Wheel-locked.' },
  { buildingId: 'supply_cache', password: 'COURIER', hint: 'Who used to deliver here. Seven letters.', flavor: 'Plywood over the original door. New keypad bolted on.' },
];

const BUILDING_LOCK_MAP: Record<string, BuildingLock> = Object.fromEntries(
  BUILDING_LOCKS.map(l => [l.buildingId, l])
);

/** Returns the lock for a building, or null if unlocked by default. */
export function getBuildingLock(buildingId: string | null | undefined): BuildingLock | null {
  if (!buildingId) return null;
  return BUILDING_LOCK_MAP[buildingId] ?? null;
}

/** Case-insensitive, whitespace-trimmed password check. */
export function checkBuildingPassword(buildingId: string, attempt: string): boolean {
  const lock = getBuildingLock(buildingId);
  if (!lock) return true;
  return lock.password.trim().toUpperCase() === attempt.trim().toUpperCase();
}

export const TUTORIAL_PATH: readonly string[] = [
  'pablo_tower',       // wake up nearby
  'public_office',     // first job
  'realestate_office', // claim a plot
  'pablo_store',       // gear up
  'terminal_shop',     // meet Pablo
] as const;
