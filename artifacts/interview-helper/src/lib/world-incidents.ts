// ── WORLD INCIDENTS ────────────────────────────────────────────────────────
// Periodic ambient events that surface as narrator banners while the player
// is in the world view. Each incident is anchored to a region; the system
// picks one whose anchor is roughly near the player so the line lands as
// "something just happened nearby" instead of background noise.
//
// Cadence: WorldPlay polls every ~90s (with jitter) and pushes one matching
// incident through setNarr. No state mutation — purely flavor + atmosphere.
// Designed to be additive: nothing in this file is required for the game to
// work; deleting the import simply removes the ambient ticker.

export type IncidentRegion =
  | 'downtown'
  | 'border'
  | 'north_waste'
  | 'south_waste'
  | 'east_waste'
  | 'forest'
  | 'any';

export interface WorldIncident {
  id: string;
  region: IncidentRegion;
  /** Narrator banner (will be prefixed with "> " by WorldPlay if not present). */
  text: string;
  /** Optional follow-up shown 8-12s later as a second banner. */
  followUp?: string;
  /** 1 = common, 5 = rare. Higher = picked less often. */
  rarity?: number;
}

export const WORLD_INCIDENTS: readonly WorldIncident[] = [
  // ── Downtown / city core ────────────────────────────────────────────────
  { id: 'inc_pablo_raid', region: 'downtown', rarity: 2,
    text: '> SIREN — PABLO CORP RAID three blocks east. Unlicensed terminals seized. Six cuffed. Two ran. One vanished.',
    followUp: '> The patrol convoy turns toward the tower. The siren cuts mid-block. Like it never happened.' },
  { id: 'inc_pipe_burst', region: 'downtown', rarity: 1,
    text: '> Steam vents in an alley off Civic Row. A pipe under the street has gone. The city does not send anyone.',
    followUp: '> Pedestrians step around the steam. The puddle widens. Standard Tuesday.' },
  { id: 'inc_android_glitch', region: 'downtown', rarity: 2,
    text: '> A patrol android on the corner repeats one phrase. Then another. Then the first again. Loop length: 4.2 seconds.',
    followUp: '> A repair unit arrives within the minute. The android is not seen again.' },
  { id: 'inc_minx_print', region: 'downtown', rarity: 2,
    text: '> Fresh copies of THE MINX appear taped to lamp posts down a four-block stretch. Ink still wet.',
    followUp: '> Within the hour PABLO CORP scrubbers will remove every copy. Three will survive. They always do.' },
  { id: 'inc_blackout', region: 'downtown', rarity: 3,
    text: '> Power flickers across the precinct grid. Three buildings go dark for eleven seconds. The tower never blinks.' },
  { id: 'inc_courier_chase', region: 'downtown', rarity: 2,
    text: '> A courier tears through Civic Row on a stripped-frame bike, satchel bouncing. Two patrol units one corner behind. He cuts an alley. They miss it.' },
  { id: 'inc_busker', region: 'downtown', rarity: 1,
    text: '> A busker on the south steps plays a song no one has heard since the \'89 broadcast ban. People stop walking.' },
  { id: 'inc_evict', region: 'downtown', rarity: 2,
    text: '> A flat above the noodle bar is being cleared. Furniture stacked on the curb. The eviction notice has a PABLO CORP letterhead.' },

  // ── South border / checkpoints ──────────────────────────────────────────
  { id: 'inc_border_smoke', region: 'border', rarity: 1,
    text: '> Smoke rises from the south checkpoint. A vehicle is being searched. The driver is being held. The cargo is being catalogued.' },
  { id: 'inc_border_ban', region: 'border', rarity: 2,
    text: '> Two PROWLERs scrap over a salvage drum at the wire. One walks away. One does not.' },
  { id: 'inc_border_crossing', region: 'border', rarity: 3,
    text: '> A family of three is turned back at Checkpoint C. No transit pass. No appeal. They walk back into the dust.' },

  // ── North wasteland ─────────────────────────────────────────────────────
  { id: 'inc_rust_cookoff', region: 'north_waste', rarity: 1,
    text: '> RUST SYNDICATE camp cookoff — a smoke plume on the north ridge, three klicks out. Whoever lit it knows you can see it.' },
  { id: 'inc_void_static', region: 'north_waste', rarity: 2,
    text: '> VOID RUNNERS are broadcasting static on three frequencies. The pattern repeats. The pattern is older than the faction.' },
  { id: 'inc_minx_patrol_north', region: 'north_waste', rarity: 2,
    text: '> A MINX CITY patrol moves through the high grass to the north. They are not looking for you. They are not looking for anyone you know.' },
  { id: 'inc_caravan_north', region: 'north_waste', rarity: 3,
    text: '> A salvage caravan rolls north toward Old Growth. Six carts. Two armed. They do not stop for travelers.',
    followUp: '> The lead cart has a banner you do not recognize. New colors. New problem.' },

  // ── South wasteland ─────────────────────────────────────────────────────
  { id: 'inc_monk_chant', region: 'south_waste', rarity: 1,
    text: '> A low chant carries on the wind from STATIC MONK ground. They are tuning the jamming arrays again.' },
  { id: 'inc_mutant_swarm', region: 'south_waste', rarity: 3,
    text: '> A mutant swarm moves through the South Wilds. Stay low. Do not run. They track motion before they track scent.',
    followUp: '> The swarm passes within a hundred meters of the road. Nothing on the road moves. Nothing is taken.' },
  { id: 'inc_raider_smoke', region: 'south_waste', rarity: 2,
    text: '> A column of black smoke south of the city. A raider camp is burning. Either rivals or a mistake. There will be no investigation.' },

  // ── East wasteland / Eastern Bloc ────────────────────────────────────────
  { id: 'inc_bloc_drill', region: 'east_waste', rarity: 1,
    text: '> EASTERN BLOC drill formation visible on the eastern flats. They march in silence. They have marched in silence for a decade.' },
  { id: 'inc_bloc_exec', region: 'east_waste', rarity: 4,
    text: '> A single shot east of Deep Thicket. Then nothing. Then a flock of crows. The Bloc handles its own discipline.' },

  // ── Forest zones ────────────────────────────────────────────────────────
  { id: 'inc_forest_lights', region: 'forest', rarity: 2,
    text: '> Lanterns flicker between the pines at the edge of the West Hollow. Two are blue. One is red. The pattern is a warning, but not for you.' },
  { id: 'inc_forest_song', region: 'forest', rarity: 2,
    text: '> Someone is singing in the Old Growth. The song has no words. The acoustics are wrong for the trees.' },
  { id: 'inc_forest_animal', region: 'forest', rarity: 1,
    text: '> A buck the size of a small car steps onto the trail in the East Evergreens. It looks at you for nine seconds. It moves on.' },

  // ── Universal / wherever ────────────────────────────────────────────────
  { id: 'inc_drone_overhead', region: 'any', rarity: 2,
    text: '> A surveillance drone passes overhead. Lower than usual. The lens stays on you for two full revolutions before it moves on.' },
  { id: 'inc_radio_chatter', region: 'any', rarity: 1,
    text: '> Your earpiece picks up four seconds of unencrypted PABLO CORP chatter. A channel that should not exist on a frequency that should not work.' },
  { id: 'inc_weather_shift', region: 'any', rarity: 1,
    text: '> The wind changes direction. Smells like rain and burnt wiring. The sky agrees with one of those.' },
];

const REGION_BOUNDS: Record<Exclude<IncidentRegion, 'any'>, (x: number, y: number) => boolean> = {
  downtown:    (x, y) => x >= 5600 && x <= 7400 && y >= 5700 && y <= 6800,
  border:      (x, y) => y >= 7200 && y <= 7600,
  north_waste: (x, y) => y < 4500,
  south_waste: (x, y) => y > 8200 && x < 8500,
  east_waste:  (x, y) => x > 8500 && y >= 6500 && y <= 11000,
  forest:      () => false, // forest matches handled via FOREST_ZONES centers below
};

const FOREST_CENTERS: ReadonlyArray<{ cx: number; cy: number; r: number }> = [
  { cx: 6800, cy: 4200, r: 1200 },
  { cx: 4200, cy: 6300, r: 1100 },
  { cx: 6800, cy: 8400, r: 1300 },
  { cx: 9200, cy: 6300, r: 1150 },
  { cx: 10500, cy: 9200, r: 1000 },
  { cx: 4500, cy: 4500, r: 1050 },
  { cx: 11000, cy: 4200, r: 1000 },
  { cx: 3200, cy: 8800, r: 950 },
];

function isForestRegion(x: number, y: number): boolean {
  for (const f of FOREST_CENTERS) {
    if (Math.hypot(x - f.cx, y - f.cy) < f.r) return true;
  }
  return false;
}

/** Picks a single incident appropriate for the player's current location. */
export function pickIncident(playerX: number, playerY: number): WorldIncident | null {
  const candidates: WorldIncident[] = [];
  for (const inc of WORLD_INCIDENTS) {
    let matches = false;
    if (inc.region === 'any') matches = true;
    else if (inc.region === 'forest') matches = isForestRegion(playerX, playerY);
    else matches = REGION_BOUNDS[inc.region](playerX, playerY);
    if (!matches) continue;
    const weight = Math.max(1, 6 - (inc.rarity ?? 1));
    for (let i = 0; i < weight; i++) candidates.push(inc);
  }
  if (candidates.length === 0) {
    // Fallback to "any" region so something always lands.
    const anyOnly = WORLD_INCIDENTS.filter(i => i.region === 'any');
    if (anyOnly.length === 0) return null;
    return anyOnly[Math.floor(Math.random() * anyOnly.length)];
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}
