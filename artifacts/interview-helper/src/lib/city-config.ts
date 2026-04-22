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
  { id: 'pablo_store',       label: 'PABLO STORE',          short: 'STORE',     x: 5705, y: 6060, type: 'commerce',   desc: 'First-party gear & cosmetics. The official outlet.' },
  { id: 'public_office',     label: 'PUBLIC OFFICE',        short: 'CO-WORK',   x: 6140, y: 6214, type: 'civic',      desc: 'Free coworking floor. Data-entry job, day-one wages.' },
  { id: 'realestate_office', label: 'REAL ESTATE OFFICE',   short: 'REALTY',    x: 6685, y: 6214, type: 'realestate', desc: 'List property, buy plots, build the city yourself.' },
  { id: 'terminal_shop',     label: 'PABLO TERMINAL',       short: 'TERMINAL',  x: 7065, y: 6418, type: 'terminal',   desc: 'Hand off to Pablo. "Be safe. Have fun. Don\'t die."' },
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

export const TUTORIAL_PATH: readonly string[] = [
  'pablo_tower',       // wake up nearby
  'public_office',     // first job
  'realestate_office', // claim a plot
  'pablo_store',       // gear up
  'terminal_shop',     // meet Pablo
] as const;
