export const OFFICE_FLOOR_WIDTH_TILES = 22;

export const OFFICE_TIER_FLOOR: Record<string, { deskCols: number; deskRows: number; capsules: number }> = {
  capsule: { deskCols: 2, deskRows: 1, capsules: 4 },
  studio: { deskCols: 3, deskRows: 1, capsules: 6 },
  coworking: { deskCols: 4, deskRows: 2, capsules: 9 },
  suite: { deskCols: 5, deskRows: 2, capsules: 11 },
};

export const OFFICE_TIER_MIN_ROWS: Record<string, number> = {
  capsule: 18,
  studio: 20,
  coworking: 24,
  suite: 28,
};

export const OFFICE_STATION_LAYOUT = [
  { id: 'elevator', label: 'ELEVATOR', col: 15, row: 1, glyph: 'elevator', radius: 30 },
  { id: 'atm', label: 'ATM', col: 8, row: 1, glyph: 'atm', radius: 28 },
  { id: 'payphone', label: 'PAYPHONE', col: 1, row: 7, glyph: 'payphone', radius: 28 },
  { id: 'vending', label: 'VENDING', col: 1, row: 12, glyph: 'vending', radius: 28 },
  { id: 'radio', label: 'SHADOW RADIO', col: 19, row: 7, glyph: 'music', radius: 30 },
] as const;