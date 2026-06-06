import React, { useEffect, useMemo, useRef, useState } from 'react';
import { type Appearance, drawPlayerSprite } from '@/lib/character-identity';
import {
  OfficeStationSprite,
  STATION_GLYPH_TILES,
  type StationGlyph,
} from '@/components/office/OfficeStationSprite';
import { sfxStep } from '@/soundEngine';

/**
 * A walk-up interaction point on the office floor. The player walks within
 * `radius` native px of the station's tile centre and a prompt appears; pressing
 * E / Enter (or tapping the prompt) fires `onInteract`. Stations are PORTALS to
 * EXISTING app features (classroom, comms, vending, sound lab, arcade) — the
 * office page owns the handler and any overlay; PixelOffice only renders the
 * sprite + drives proximity. Each station is drawn either from a reused
 * furniture PNG (`art`) or an inline-SVG pixel sprite (`glyph`).
 */
export interface OfficeStation {
  id: string;
  /** Tile coords of the sprite's top-left on the floor grid. */
  col: number;
  row: number;
  /** Prompt + floating label, e.g. "CONFERENCE". */
  label: string;
  onInteract: () => void;
  /** Interaction radius from the sprite centre, native px. Default 24. */
  radius?: number;
  /** Reuse an existing furniture PNG (size in TILEs). */
  art?: { src: string; wTiles: number; hTiles: number };
  /** OR draw an inline-SVG pixel sprite. */
  glyph?: StationGlyph;
}

/**
 * An enclosed interior room (executive office) overlaid on the floor. Rendered
 * with a back wall + side walls + a low glass front partition that has a
 * walkable door gap, a nameplate, and (when occupied) a desk + a standing
 * occupant sprite. All four walls block movement via tile collision; only the
 * door gap is walkable. Coordinates are tile indices on the floor grid. Omit
 * `rooms` entirely (legacy callers) and collision/render fall back to the
 * simple bullpen divider only.
 */
export interface OfficeRoom {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Side the walkable door gap sits on. Default 'bottom' (camera-facing front). */
  doorSide?: 'top' | 'bottom' | 'left' | 'right';
  /** Tile index along the door side where the gap starts. Default centred. */
  doorAt?: number;
  /** Door gap width in tiles. Default 2. */
  doorSpan?: number;
  /** Nameplate text (e.g. a role / job title). */
  label?: string;
  /** Smaller sub-label under the nameplate (e.g. a department). */
  sub?: string;
  /** Accent colour for the nameplate + glass tint. */
  accent?: string;
  /** Hue seed for the occupant sprite. Omit for an empty (vacant) office. */
  occupantSeed?: number;
}

/**
 * PixelOffice — pixel-art "Pablo's office" diorama.
 *
 * Sprites are sourced from Pixel Agents (https://github.com/pablodelucca/pixel-agents)
 * by Pablo De Lucca, MIT-licensed. See `public/pixel-agents/ATTRIBUTION.md`
 * and `public/pixel-agents/LICENSE`. The PNGs are served from the artifact's
 * public/ directory and referenced through the artifact base URL so
 * preview-pane proxying still resolves them correctly.
 *
 * The scene is laid out on a 16-tile-tall room (each tile 16px native) and
 * scaled up via CSS transform so it looks crisp on retina without blurring.
 * We deliberately use `image-rendering: pixelated` so the upscale stays
 * blocky rather than smoothing the sprites.
 *
 * The room can optionally extend rightward into a "bullpen" — a second
 * 16-tile-wide room separated by a divider wall with a doorway. Used for
 * paid users so the diorama matches the office they're paying for: their
 * private office on the left, their team's bullpen on the right. Only bots
 * with status === 'active' get rendered at desks; inactive bots leave their
 * desks empty (per user direction: "their bots need to be active for them
 * to be shown in the offices").
 *
 * The character (char_0) is a 4×3 sprite sheet (4 walk frames × 3
 * directions: down/up/right at 28×32 each). The owner-character wanders
 * the LEFT room only — the divider wall is an in-fiction barrier.
 *
 * 2.5D treatment: real 3D / isometric would need a sprite set we don't
 * have, so we layer perspective cues onto the same flat sprites — soft
 * drop shadows under furniture, a floor gradient that darkens toward the
 * front edge, a ceiling highlight band, and a corner vignette. Reads as
 * depth without lying about what the art actually is.
 */

const TILE = 16; // px native, before scale

export interface PixelOfficeBot {
  /** Bot id, used as the sprite tint seed. */
  id: number;
  /** Display name — placed under the desk as a small floor label. */
  name: string;
  /** Only 'active' bots are drawn at desks; others leave the desk empty. */
  status: string;
  /**
   * Hex accent of the bot's TEAM. When set, the desk/capsule name-plate and
   * the capsule trim are tinted with it so same-team bots (placed next to each
   * other by the caller) read as a visual group on the floor.
   */
  teamColor?: string;
  /** Human team label (e.g. "Trading Desk") — used for the pod tooltip. */
  teamLabel?: string;
}

interface PixelOfficeProps {
  /** Pixel scale-up factor. 3 → ~768×336 visible at default 16-col layout. */
  scale?: number;
  /** Apply a phosphor-blue tint to match the CRT theme. Default: true. */
  crtTint?: boolean;
  /**
   * Character behaviour:
   *   - 'wander':  the salaryman slowly walks back and forth across the
   *                office floor, pausing briefly at each end. Walk frames
   *                only cycle while he's actually moving — no more
   *                jerky in-place march that snaps back to frame 0.
   *   - 'still':   he stops, faces the camera (down-walk frame 0), and
   *                holds. Use this for the post-onboarding desk scene
   *                where the player is meant to BE the character at rest.
   *   - 'at-desk': he stands at the right-hand desk facing the monitor,
   *                static. Used by the PostOnboardingIntro cutscene.
   */
  mode?: 'wander' | 'still' | 'at-desk';
  /**
   * If true, render a second 16-wide room to the right (the bot bullpen)
   * with a divider wall + doorway between. Used to reflect a paid plan
   * where the user has dedicated bot workspace.
   */
  bullpen?: boolean;
  /**
   * The user's bots. Only entries with `status === 'active'` are drawn at
   * desks in the bullpen. Up to 6 active bots fit; the rest are silently
   * truncated (the desk grid maxes out — extra bots aren't shown).
   */
  activeBots?: PixelOfficeBot[];
  /**
   * Bots that have no orders right now (idle / paused). Rendered ASLEEP in
   * android storage capsules along the bullpen back wall, dimmed and
   * powered-down, instead of standing at a desk. Only shown when `bullpen`
   * is on. Up to `CAPSULE_WALL_SPOTS.length` fit; extras are truncated.
   */
  idleBots?: PixelOfficeBot[];
  /**
   * If true, the character becomes PLAYER-CONTROLLED instead of auto-wandering:
   * WASD / arrow keys (and an on-screen D-pad on touch devices) walk them
   * around the office floor in 2D. Walk up to the desk computer and press E
   * (or tap the on-screen prompt) to fire `onEnterTerminal`. Overrides `mode`.
   */
  playable?: boolean;
  /** Fired when the player "uses" the desk computer (walks up + presses E). */
  onEnterTerminal?: () => void;
  /**
   * Premium cinematic grade. Drops the harsh monochrome CRT teal wash for a
   * full-colour, *lit* diorama — warm key light from the ceiling, cool fill
   * pooling at the back wall, diagonal window light shafts, soft bloom off
   * every powered monitor, drifting dust motes, a polished-floor sheen and a
   * gently tinted vignette. Used by the main `/office` so the room reads as
   * high-end art rather than a retro terminal readout.
   */
  premium?: boolean;
  /**
   * The player's shared character Appearance (skin/hair/face/outfit). When
   * provided, the owner character is drawn with the SAME procedural paper-doll
   * renderer used in WorldPlay (drawPlayerSprite) so the character looks
   * identical in the city and the office. When omitted, falls back to the
   * legacy char_0 sprite sheet (used by static cutscene callers that don't
   * have an Appearance to hand).
   */
  appearance?: Appearance;
  /** Optional equipped-costume tint override; passed through to drawPlayerSprite. */
  costumeColor?: string | null;
  /**
   * Tiles wide per room. Default 16 (the compact cutscene diorama). The live
   * /office passes a larger value (22) for a roomier floor. Drives furniture
   * generation, bot/capsule capacity, and the walkable bounds.
   */
  roomCols?: number;
  /** Tiles tall per room. Default 7; the live /office passes 11. */
  roomRows?: number;
  /**
   * When set, the office renders into a fixed-size scrolling VIEWPORT of this
   * many CSS px and a camera pans the (larger) floor — following the player in
   * playable mode, or centred on the bullpen otherwise. Omit for the small
   * dioramas, which render the whole room at once with no camera.
   */
  viewportWidth?: number;
  viewportHeight?: number;
  /**
   * Extra walk-up interaction points beyond the built-in desk computer. Each
   * opens an EXISTING feature when used. Omit (cutscene callers) for the
   * original computer-only behaviour.
   */
  stations?: OfficeStation[];
  /**
   * Pause player movement + key handling (e.g. while a station overlay like the
   * arcade game is open on top of the office). Sprite keeps rendering.
   */
  frozen?: boolean;
  /**
   * When true (and `playable`), the camera follows the player. When false
   * (the default), the camera is FIXED — it frames the floor centred and never
   * tracks the player, so there's no scroll/jitter. The page drives this from
   * the office mode (LIVE follows the player; SURVEILLANCE stays on the fixed
   * full-floor overview).
   */
  followCam?: boolean;
  /**
   * Enclosed executive offices overlaid on the floor — walled rooms with a
   * walkable door, a nameplate, and an occupant. Their walls block movement;
   * the doors are walkable. Omit (legacy callers) for no interior rooms.
   */
  rooms?: OfficeRoom[];
  /**
   * Override the bullpen divider's walkable doorway band (in floor rows). The
   * live HQ opens the whole lower half so the executive wing spans both work
   * rooms. Defaults to the bottom 3 rows.
   */
  doorTopRow?: number;
  doorBotRow?: number;
}

// Owner character drawn with the SHARED procedural renderer (same as WorldPlay
// city + the customizer preview). Static front-facing paper-doll — the office
// sprite-sheet's walk frames/directions are intentionally dropped here so the
// character art is byte-for-byte the same routine everywhere. Horizontal flip
// for left-facing is applied by the caller via CSS transform.
function OfficePlayerSprite({
  appearance,
  scale,
  costumeColor,
}: {
  appearance: Appearance;
  scale: number;
  costumeColor?: string | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.save();
    // Feet sit near the bottom of the FRAME_H-tall cell; the paper-doll spans
    // ~py-21 (hair) to ~py+11 (boots), so an offset of FRAME_H-11 lands the
    // feet on the cell's baseline matching where the sprite sheet's feet were.
    ctx.translate(FRAME_W / 2, FRAME_H - 11);
    drawPlayerSprite(ctx, appearance, { costumeColor: costumeColor ?? null });
    ctx.restore();
  }, [appearance, costumeColor]);
  return (
    <canvas
      ref={ref}
      width={FRAME_W}
      height={FRAME_H}
      style={{
        width: FRAME_W * scale,
        height: FRAME_H * scale,
        imageRendering: 'pixelated',
        pointerEvents: 'none',
      }}
    />
  );
}

// Furniture placement on a 16-wide × 7-tall grid. Coordinates are tile
// indices; pixel offsets get computed at render time. `wTile`/`hTile` reflect
// the native sprite size in tiles so multi-tile pieces (DESK_FRONT 3×2, etc)
// land flush. `colOffset` shifts the entire piece horizontally — used to
// place the bullpen furniture at cols 17-32 without copy-pasting.
type Furn = { src: string; col: number; row: number; wTile: number; hTile: number; z?: number };

function buildPrivateFurniture(BASE: string): Furn[] {
  const f = (path: string) => `${BASE}pixel-agents/${path}`;
  return [
    // Wall decorations along the back wall (rows 0-1)
    { src: f('furniture/SMALL_PAINTING/SMALL_PAINTING.png'), col: 1,  row: 0, wTile: 1, hTile: 2 },
    { src: f('furniture/CLOCK/CLOCK.png'),                   col: 4,  row: 0, wTile: 1, hTile: 2 },
    { src: f('furniture/HANGING_PLANT/HANGING_PLANT.png'),   col: 7,  row: 0, wTile: 1, hTile: 2 },
    { src: f('furniture/SMALL_PAINTING/SMALL_PAINTING.png'), col: 10, row: 0, wTile: 1, hTile: 2 },
    { src: f('furniture/HANGING_PLANT/HANGING_PLANT.png'),   col: 13, row: 0, wTile: 1, hTile: 2 },

    // Mid-row: bookshelves flanking two desks with PCs
    { src: f('furniture/BOOKSHELF/BOOKSHELF.png'),       col: 0,  row: 3, wTile: 2, hTile: 1 },
    { src: f('furniture/DESK/DESK_FRONT.png'),           col: 3,  row: 3, wTile: 3, hTile: 2 },
    { src: f('furniture/PC/PC_FRONT_ON_2.png'),          col: 4,  row: 2, wTile: 1, hTile: 2, z: 2 },
    { src: f('furniture/DESK/DESK_FRONT.png'),           col: 9,  row: 3, wTile: 3, hTile: 2 },
    { src: f('furniture/PC/PC_FRONT_ON_3.png'),          col: 10, row: 2, wTile: 1, hTile: 2, z: 2 },
    { src: f('furniture/BOOKSHELF/BOOKSHELF.png'),       col: 13, row: 3, wTile: 2, hTile: 1 },

    // Foreground: plants, chair-back peeking up, coffee, cactus
    { src: f('furniture/PLANT/PLANT.png'),               col: 0,  row: 5, wTile: 1, hTile: 2 },
    { src: f('furniture/CUSHIONED_CHAIR/CUSHIONED_CHAIR_BACK.png'), col: 4, row: 5, wTile: 1, hTile: 1 },
    { src: f('furniture/COFFEE/COFFEE.png'),             col: 7,  row: 5, wTile: 1, hTile: 1 },
    { src: f('furniture/CUSHIONED_CHAIR/CUSHIONED_CHAIR_BACK.png'), col: 10, row: 5, wTile: 1, hTile: 1 },
    { src: f('furniture/CACTUS/CACTUS.png'),             col: 14, row: 5, wTile: 1, hTile: 2 },
    { src: f('furniture/POT/POT.png'),                   col: 15, row: 5, wTile: 1, hTile: 1 },
  ];
}

// Bullpen furniture lives at cols 17-32 (16-wide right room, 1-tile wall
// divider sits at col 16). Layout: 6 worker desks in a 3-wide × 2-row
// grid, plus back-wall decoration and a coffee station. The desk pixel
// columns (where bot sprites land) are exposed as `BULLPEN_DESK_SPOTS`.
function buildBullpenFurniture(BASE: string): Furn[] {
  const f = (path: string) => `${BASE}pixel-agents/${path}`;
  const SHIFT = 17;
  return [
    // Back-wall: paintings + plants spread across cols 17-32
    { src: f('furniture/HANGING_PLANT/HANGING_PLANT.png'), col: SHIFT + 1,  row: 0, wTile: 1, hTile: 2 },
    { src: f('furniture/SMALL_PAINTING/SMALL_PAINTING.png'), col: SHIFT + 4, row: 0, wTile: 1, hTile: 2 },
    { src: f('furniture/CLOCK/CLOCK.png'),                 col: SHIFT + 7,  row: 0, wTile: 1, hTile: 2 },
    { src: f('furniture/SMALL_PAINTING/SMALL_PAINTING.png'), col: SHIFT + 10, row: 0, wTile: 1, hTile: 2 },
    { src: f('furniture/HANGING_PLANT/HANGING_PLANT.png'), col: SHIFT + 13, row: 0, wTile: 1, hTile: 2 },

    // Back row of 3 desks with PCs
    { src: f('furniture/DESK/DESK_FRONT.png'),  col: SHIFT + 0,  row: 3, wTile: 3, hTile: 2 },
    { src: f('furniture/PC/PC_FRONT_ON_2.png'), col: SHIFT + 1,  row: 2, wTile: 1, hTile: 2, z: 2 },
    { src: f('furniture/DESK/DESK_FRONT.png'),  col: SHIFT + 5,  row: 3, wTile: 3, hTile: 2 },
    { src: f('furniture/PC/PC_FRONT_ON_3.png'), col: SHIFT + 6,  row: 2, wTile: 1, hTile: 2, z: 2 },
    { src: f('furniture/DESK/DESK_FRONT.png'),  col: SHIFT + 10, row: 3, wTile: 3, hTile: 2 },
    { src: f('furniture/PC/PC_FRONT_ON_2.png'), col: SHIFT + 11, row: 2, wTile: 1, hTile: 2, z: 2 },

    // Foreground: bookshelf + coffee station + cactus across the front
    { src: f('furniture/BOOKSHELF/BOOKSHELF.png'),    col: SHIFT + 0,  row: 6, wTile: 2, hTile: 1 },
    { src: f('furniture/COFFEE/COFFEE.png'),          col: SHIFT + 4,  row: 5, wTile: 1, hTile: 1 },
    { src: f('furniture/POT/POT.png'),                col: SHIFT + 8,  row: 5, wTile: 1, hTile: 1 },
    { src: f('furniture/CACTUS/CACTUS.png'),          col: SHIFT + 12, row: 5, wTile: 1, hTile: 2 },
    { src: f('furniture/BOOKSHELF/BOOKSHELF.png'),    col: SHIFT + 13, row: 6, wTile: 2, hTile: 1 },
  ];
}

// Desk anchor points in the bullpen (in tiles, native scale). Each entry is
// where a bot sprite stands — in front of one of the 6 desks. Order is the
// reading order the user expects: back row left→right, then foregroundless
// "second row" we layer in front of the back desks so two bots per desk
// share the same workstation visually.
const BULLPEN_DESK_SPOTS: { col: number; row: number; flip?: boolean }[] = [
  // Back row, in front of each desk's chair (row 4)
  { col: 17 + 1, row: 4 },
  { col: 17 + 6, row: 4, flip: true },
  { col: 17 + 11, row: 4 },
  // Front row — slightly down and offset so they don't visually collide
  { col: 17 + 3, row: 5, flip: true },
  { col: 17 + 8, row: 5 },
  { col: 17 + 13, row: 5, flip: true },
];

// Storage capsules mounted along the bullpen back wall (rows 0-1). Idle
// bots — the ones with no orders — sleep here, powered-down, instead of
// standing at a desk. Each capsule is ~2 tiles wide; they line the wall
// left→right across the bullpen so the back wall reads as a cryo/android
// storage rack. Columns are tile indices in the right room (cols 17-32).
const CAPSULE_WALL_SPOTS: { col: number }[] = [
  { col: 17 + 0 },
  { col: 17 + 2 },
  { col: 17 + 4 },
  { col: 17 + 6 },
  { col: 17 + 8 },
  { col: 17 + 10 },
  { col: 17 + 12 },
  { col: 17 + 14 },
];

// ── Larger floor plan (the /office "build-out") ──────────────────────────
// The compact 16×7 layout above is the cutscene diorama. The live /office
// uses a roomier 22-wide × 11-tall plan per room so there's open floor to
// walk and a deeper bot bullpen. Furniture + bot/capsule anchor points are
// GENERATED from the room shift, so the same routine lays out both the
// private room and the bullpen — and the floor can grow again later just by
// bumping these constants.
const BIG_ROOM_COLS = 22;
const BIG_ROOM_ROWS = 11;
const BIG_DESK_COLS = [1, 5, 9, 13, 17]; // desk left-edge within a 22-wide room
const BIG_DESK_ROWS = [4, 7];            // desk top rows (each desk is 2 tall)

function buildBigRoomFurniture(BASE: string, shift: number): Furn[] {
  const f = (path: string) => `${BASE}pixel-agents/${path}`;
  const out: Furn[] = [];
  // Back-wall decor spread across the room (rows 0-1).
  const decor = [
    'furniture/SMALL_PAINTING/SMALL_PAINTING.png',
    'furniture/HANGING_PLANT/HANGING_PLANT.png',
    'furniture/CLOCK/CLOCK.png',
  ];
  [2, 5, 8, 11, 14, 17, 20].forEach((c, i) =>
    out.push({ src: f(decor[i % decor.length]), col: shift + c, row: 0, wTile: 1, hTile: 2 }),
  );
  // Desk grid, each with a powered PC behind it.
  BIG_DESK_ROWS.forEach((r, ri) =>
    BIG_DESK_COLS.forEach((c, ci) => {
      const pc = (ri + ci) % 2 === 0 ? 'PC_FRONT_ON_2' : 'PC_FRONT_ON_3';
      out.push({ src: f('furniture/DESK/DESK_FRONT.png'), col: shift + c, row: r, wTile: 3, hTile: 2 });
      out.push({ src: f(`furniture/PC/${pc}.png`), col: shift + c + 1, row: r - 1, wTile: 1, hTile: 2, z: 2 });
    }),
  );
  // Foreground dressing — kept sparse so the floor stays walkable.
  out.push({ src: f('furniture/PLANT/PLANT.png'),        col: shift + 0,  row: 9,  wTile: 1, hTile: 2 });
  out.push({ src: f('furniture/COFFEE/COFFEE.png'),      col: shift + 10, row: 9,  wTile: 1, hTile: 1 });
  out.push({ src: f('furniture/CACTUS/CACTUS.png'),      col: shift + 20, row: 9,  wTile: 1, hTile: 2 });
  out.push({ src: f('furniture/BOOKSHELF/BOOKSHELF.png'), col: shift + 5,  row: 10, wTile: 2, hTile: 1 });
  out.push({ src: f('furniture/POT/POT.png'),            col: shift + 15, row: 10, wTile: 1, hTile: 1 });
  return out;
}

// Bot standing positions — one in front of each desk in the grid above.
function makeBigDeskSpots(shift: number): { col: number; row: number; flip?: boolean }[] {
  const spots: { col: number; row: number; flip?: boolean }[] = [];
  BIG_DESK_ROWS.forEach((r) =>
    BIG_DESK_COLS.forEach((c, ci) => {
      spots.push({ col: shift + c + 1, row: r + 1, flip: ci % 2 === 1 });
    }),
  );
  return spots;
}

// Cryo-capsule positions lining the back wall (rows 0-1), every 2 tiles.
function makeBigCapsuleSpots(shift: number): { col: number }[] {
  const cols: { col: number }[] = [];
  for (let c = 0; c <= BIG_ROOM_COLS - 2; c += 2) cols.push({ col: shift + c });
  return cols;
}

// Sprite sheet rows: 0=down, 1=up, 2=right.
const ROW_DOWN  = 0;
const ROW_UP    = 1;
const ROW_RIGHT = 2;
const FRAME_W = 28;
const FRAME_H = 32;

// Drifting dust motes for the premium grade — fixed positions/timings so the
// motion is deterministic (no per-render jitter). Percentages of the diorama.
const DUST = [
  { x: 12, y: 30, dur: 9,   delay: 0 },
  { x: 28, y: 55, dur: 11,  delay: 1.5 },
  { x: 44, y: 22, dur: 8,   delay: 0.7 },
  { x: 58, y: 60, dur: 12,  delay: 2.2 },
  { x: 72, y: 34, dur: 10,  delay: 1.1 },
  { x: 86, y: 50, dur: 9.5, delay: 3 },
];

// Status-driven hue rotation — same scale used by PixelBotAvatar so the
// bullpen sprites and the surveillance-page avatars read as the same cast.
function botSpriteFilter(idSeed: number, crtTint: boolean): string {
  // Spread bots across the colour wheel by id so a roster of 6 doesn't
  // come out monochrome. Then layer the CRT tint on top if enabled.
  const hue = (idSeed * 47) % 360;
  const base = `sepia(1) hue-rotate(${hue}deg) saturate(1.5) brightness(1.05)`;
  return crtTint
    // Pre-warp away from the CRT cyan so the bot tint survives the
    // outer hue-rotate the parent applies; net effect: bots stay
    // colourful instead of all turning teal.
    ? `${base} hue-rotate(-165deg)`
    : base;
}

export function PixelOffice({
  scale = 3,
  crtTint = true,
  mode = 'wander',
  bullpen = false,
  activeBots = [],
  idleBots = [],
  playable = false,
  onEnterTerminal,
  premium = false,
  appearance,
  costumeColor,
  roomCols = 16,
  roomRows = 7,
  viewportWidth,
  viewportHeight,
  stations = [],
  frozen = false,
  followCam = false,
  rooms = [],
  doorTopRow: doorTopRowProp,
  doorBotRow: doorBotRowProp,
}: PixelOfficeProps) {
  const BASE = import.meta.env.BASE_URL ?? '/';
  // In premium mode the legacy monochrome CRT pipeline is fully retired, so
  // sprites render in their natural colour (the per-bot hue still spreads the
  // team across the wheel — it just isn't pre-warped against the teal wash).
  const effectiveCrt = crtTint && !premium;
  const isTouch =
    typeof window !== 'undefined' &&
    (('ontouchstart' in window) || (navigator.maxTouchPoints ?? 0) > 0);
  const leftCols = roomCols;
  const dividerCols = bullpen ? 1 : 0;
  const rightCols = bullpen ? roomCols : 0;
  const cols = leftCols + dividerCols + rightCols;
  const rows = roomRows;
  const wallRows = 2;

  // Divider doorway band (in rows). Kept near the front of the floor; for the
  // default 7-row room this resolves to rows 4-6 (unchanged). The live HQ
  // overrides this (doorTopRow/doorBotRow props) to open the whole lower half
  // so the executive wing spans both work rooms.
  const doorTopRow = doorTopRowProp ?? (rows - 3);
  const doorBotRow = doorBotRowProp ?? (rows - 1);

  // Interior executive-office walls → a blocked-tile Set ("col,row") for
  // movement collision. Empty for legacy callers (no `rooms`), so movement
  // falls back to the bullpen divider only.
  const blockedTiles = useMemo(() => {
    const s = new Set<string>();
    for (const r of rooms) {
      const side = r.doorSide ?? 'bottom';
      const span = r.doorSpan ?? 2;
      const horiz = side === 'top' || side === 'bottom';
      const at = r.doorAt ?? (horiz
        ? r.x + Math.floor((r.w - span) / 2)
        : r.y + Math.floor((r.h - span) / 2));
      for (let c = r.x; c < r.x + r.w; c++) {
        if (!(side === 'top' && c >= at && c < at + span)) s.add(`${c},${r.y}`);
        if (!(side === 'bottom' && c >= at && c < at + span)) s.add(`${c},${r.y + r.h - 1}`);
      }
      for (let rr = r.y; rr < r.y + r.h; rr++) {
        if (!(side === 'left' && rr >= at && rr < at + span)) s.add(`${r.x},${rr}`);
        if (!(side === 'right' && rr >= at && rr < at + span)) s.add(`${r.x + r.w - 1},${rr}`);
      }
    }
    return s;
  }, [rooms]);
  const blockedRef = useRef(blockedTiles);
  useEffect(() => { blockedRef.current = blockedTiles; }, [blockedTiles]);

  const widthPx  = cols * TILE * scale;
  const heightPx = rows * TILE * scale;

  // The compact 16×7 layout uses the hand-authored diorama furniture; any
  // larger floor uses the generated build-out plan.
  const bigFloor = roomCols !== 16 || roomRows !== 7;
  const bullpenShift = leftCols + dividerCols;
  const privateFurniture = bigFloor ? buildBigRoomFurniture(BASE, 0) : buildPrivateFurniture(BASE);
  const bullpenFurniture = bullpen
    ? (bigFloor ? buildBigRoomFurniture(BASE, bullpenShift) : buildBullpenFurniture(BASE))
    : [];
  const deskSpots = bigFloor ? makeBigDeskSpots(bullpenShift) : BULLPEN_DESK_SPOTS;
  const capsuleSpots = bigFloor ? makeBigCapsuleSpots(bullpenShift) : CAPSULE_WALL_SPOTS;

  // Path endpoints (in native px) — between the left and right desks of
  // the PRIVATE office. Bullpen has its own bots, the wandering character
  // doesn't cross the divider wall (the doorway is fictional cover, not
  // a navigable opening — keeps the pathing trivially correct).
  const charNativeY = 5 * TILE - (FRAME_H - TILE);
  const PATH_LEFT_X  = 3 * TILE + (TILE - FRAME_W) / 2 + TILE;
  const PATH_RIGHT_X = 10 * TILE + (TILE - FRAME_W) / 2 + TILE;
  const AT_DESK_X    = PATH_RIGHT_X;

  // The interactable desk computer (playable mode). Anchored at the LEFT
  // PC desk so it's reachable even when the bullpen room is open. Native px;
  // proximity is measured from the player's feet/centre.
  const COMPUTER_X = 4.5 * TILE;
  const COMPUTER_Y = 5 * TILE;

  const [posX, setPosX] = useState<number>(
    mode === 'at-desk' ? AT_DESK_X : PATH_LEFT_X,
  );
  const [walkFrame, setWalkFrame] = useState<number>(0);
  const [facing, setFacing] = useState<'right' | 'left' | 'down' | 'up'>(
    mode === 'at-desk' ? 'up' : 'right',
  );
  // Player-controlled extras (only used when `playable`): vertical position,
  // whether the player is standing on the desk computer, and input refs read
  // by the movement loop (keyboard held set + on-screen D-pad direction flags).
  const [posY, setPosY] = useState<number>(charNativeY);
  const [nearComputer, setNearComputer] = useState(false);
  // The id of the nearest station within range (null = none), and a label for
  // the prompt. Stations are PORTALS to existing features; the page owns the
  // handler. Kept in a ref for the rAF loop + state for the prompt UI.
  const [activeStationId, setActiveStationId] = useState<string | null>(null);
  const heldRef = useRef<Set<string>>(new Set());
  const touchDirRef = useRef({ up: false, down: false, left: false, right: false });
  // Tap-to-move target (native px, top-left of the sprite frame) + camera/scale
  // mirrors so the pointer handler can map a viewport tap into world space.
  const tapTargetRef = useRef<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const camXRef = useRef(0);
  const camYRef = useRef(0);
  const scaleRef = useRef(scale);
  const nearComputerRef = useRef(false);
  const activeStationRef = useRef<string | null>(null);
  const onEnterRef = useRef(onEnterTerminal);
  const stationsRef = useRef<OfficeStation[]>(stations);
  const frozenRef = useRef(frozen);
  useEffect(() => {
    onEnterRef.current = onEnterTerminal;
  }, [onEnterTerminal]);
  useEffect(() => {
    stationsRef.current = stations;
  }, [stations]);
  useEffect(() => {
    frozenRef.current = frozen;
    if (frozen) {
      heldRef.current.clear();
      // Drop any held on-screen D-pad direction too, so touch input can't stay
      // "stuck" and auto-walk the player the instant an overlay closes.
      touchDirRef.current = { up: false, down: false, left: false, right: false };
      tapTargetRef.current = null;
    }
  }, [frozen]);

  useEffect(() => {
    if (playable) return;
    if (mode !== 'wander') {
      setPosX(mode === 'at-desk' ? AT_DESK_X : PATH_LEFT_X);
      setFacing(mode === 'at-desk' ? 'up' : 'down');
      setWalkFrame(0);
      return;
    }

    let raf = 0;
    let last = performance.now();
    let dir: 1 | -1 = 1;
    let x = PATH_LEFT_X;
    let pauseUntil = 0;
    let frameAccumMs = 0;
    const SPEED_PX_PER_SEC = 14;
    const FRAME_PERIOD_MS = 160;

    const tick = (now: number) => {
      const dt = Math.max(0, now - last);
      last = now;

      if (now < pauseUntil) {
        setFacing('down');
        setWalkFrame(0);
      } else {
        x += dir * SPEED_PX_PER_SEC * (dt / 1000);
        if (x >= PATH_RIGHT_X) { x = PATH_RIGHT_X; dir = -1; pauseUntil = now + 1400; }
        else if (x <= PATH_LEFT_X) { x = PATH_LEFT_X; dir = 1; pauseUntil = now + 1400; }
        setPosX(x);
        setFacing(dir === 1 ? 'right' : 'left');
        frameAccumMs += dt;
        if (frameAccumMs >= FRAME_PERIOD_MS) {
          frameAccumMs = 0;
          setWalkFrame(f => (f + 1) % 4);
        }
      }

      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [mode, playable, PATH_LEFT_X, PATH_RIGHT_X, AT_DESK_X]);

  // ── Player-controlled movement loop ────────────────────────────────────
  // Reads keyboard (WASD / arrows) + the on-screen D-pad, walks the character
  // in 2D around the floor (bounded to the room, blocked by the bullpen
  // divider except at the doorway), and tracks proximity to the desk computer.
  useEffect(() => {
    if (!playable) return;

    const minX = 0;
    const maxX = cols * TILE - FRAME_W;
    const minY = (wallRows + 1) * TILE - FRAME_H; // feet just below the back wall
    const maxY = rows * TILE - FRAME_H;           // feet at the front edge
    const dividerCenter = (leftCols + 0.5) * TILE;
    const DOOR_TOP = doorTopRow * TILE;
    const DOOR_BOTTOM = doorBotRow * TILE;
    const SPEED = 46;            // native px / sec
    const FRAME_PERIOD_MS = 130;

    let raf = 0;
    let last = performance.now();
    let frameAccum = 0;
    // Stealth/footstep cue: a quiet footfall every OTHER walk-frame advance, so
    // the sound is driven by actual movement cadence (subtle, never while idle).
    let footfall = false;
    // Spawn in a clearly-walkable spot. When the divider is present we drop the
    // player in the BULLPEN centre — spawning exactly on the divider centre line
    // would lock horizontal movement (the crossing test treats that line as the
    // wall), which read as "can't move / dead end". Row 5 sits above the exec
    // wing, so it's always open.
    let x = Math.round(
      (bullpen ? leftCols + dividerCols + rightCols / 2 : cols / 2) * TILE - FRAME_W / 2,
    );
    let y = charNativeY;
    setPosX(x);
    setPosY(y);

    const tick = (now: number) => {
      const dt = Math.min(50, Math.max(0, now - last));
      last = now;
      if (frozenRef.current) {
        // Overlay open on top of the office — hold position, drop input.
        raf = window.requestAnimationFrame(tick);
        return;
      }
      const k = heldRef.current;
      const td = touchDirRef.current;
      let dx = 0;
      let dy = 0;
      if (k.has('a') || k.has('arrowleft') || td.left) dx -= 1;
      if (k.has('d') || k.has('arrowright') || td.right) dx += 1;
      if (k.has('w') || k.has('arrowup') || td.up) dy -= 1;
      if (k.has('s') || k.has('arrowdown') || td.down) dy += 1;

      // Manual input always cancels an in-progress tap-to-move.
      if (dx !== 0 || dy !== 0) tapTargetRef.current = null;

      // Tap-to-move (mobile + pointer): with no manual input, walk toward the
      // last-tapped floor point as a unit vector; arrive + clear within a tile.
      let tapVX = 0;
      let tapVY = 0;
      let tapping = false;
      if (dx === 0 && dy === 0 && tapTargetRef.current) {
        const ddx = tapTargetRef.current.x - x;
        const ddy = tapTargetRef.current.y - y;
        const dist = Math.hypot(ddx, ddy);
        if (dist <= 2) {
          tapTargetRef.current = null;
        } else {
          tapVX = ddx / dist;
          tapVY = ddy / dist;
          tapping = true;
        }
      }

      if (dx !== 0 || dy !== 0 || tapping) {
        // Held keys normalise the diagonal; a tap already carries a unit vector.
        const vx = tapping ? tapVX : dx;
        const vy = tapping ? tapVY : dy;
        const inv = !tapping && dx !== 0 && dy !== 0 ? Math.SQRT1_2 : 1;
        const step = SPEED * (dt / 1000) * inv;
        let nx = Math.max(minX, Math.min(maxX, x + vx * step));
        let ny = Math.max(minY, Math.min(maxY, y + vy * step));
        // Bullpen divider: only crossable through the doorway band.
        if (bullpen) {
          const feet = ny + FRAME_H;
          const inDoor = feet >= DOOR_TOP && feet <= DOOR_BOTTOM;
          if (!inDoor) {
            const cOld = x + FRAME_W / 2;
            const cNew = nx + FRAME_W / 2;
            if ((cOld - dividerCenter) * (cNew - dividerCenter) <= 0) nx = x;
          }
        }
        // Interior executive-office walls — per-axis tile collision so the
        // player slides along walls and only passes through the door gaps.
        // Resolve X first, then Y against the resolved X (classic AABB slide).
        const bset = blockedRef.current;
        if (bset.size) {
          const col = (px: number) => Math.floor((px + FRAME_W / 2) / TILE);
          const feetRow = (py: number) => Math.floor((py + FRAME_H - 1) / TILE);
          if (bset.has(`${col(nx)},${feetRow(y)}`)) nx = x;
          if (bset.has(`${col(nx)},${feetRow(ny)}`)) ny = y;
        }
        // A tap path that stalls against a wall/divider is dropped so the
        // character doesn't march in place forever.
        if (tapping && Math.abs(nx - x) < 0.05 && Math.abs(ny - y) < 0.05) {
          tapTargetRef.current = null;
        }
        x = nx;
        y = ny;
        if (Math.abs(vx) >= Math.abs(vy)) setFacing(vx > 0 ? 'right' : 'left');
        else setFacing(vy > 0 ? 'down' : 'up');
        setPosX(x);
        setPosY(y);
        frameAccum += dt;
        if (frameAccum >= FRAME_PERIOD_MS) {
          frameAccum = 0;
          setWalkFrame((f) => (f + 1) % 4);
          footfall = !footfall;
          // Subtle, slightly randomised footstep — quiet enough to suit a hushed
          // office, audible enough to register your own movement.
          if (footfall) sfxStep(0.45, 165 + Math.random() * 50);
        }
      } else if (frameAccum !== 0) {
        frameAccum = 0;
        setWalkFrame(0);
      }

      const cx = x + FRAME_W / 2;
      const cy = y + FRAME_H;
      if (onEnterRef.current) {
        const near = Math.hypot(cx - COMPUTER_X, cy - COMPUTER_Y) <= 22;
        if (near !== nearComputerRef.current) {
          nearComputerRef.current = near;
          setNearComputer(near);
        }
      }
      // Nearest extra station within its radius (computer wins if also in range).
      let bestId: string | null = null;
      let bestDist = Infinity;
      for (const st of stationsRef.current) {
        const sc = STATION_GLYPH_TILES[st.glyph ?? 'comms'];
        const wTiles = st.art ? st.art.wTiles : sc.w;
        const hTiles = st.art ? st.art.hTiles : sc.h;
        const sx = (st.col + wTiles / 2) * TILE;
        const sy = (st.row + hTiles) * TILE; // base of the sprite
        const d = Math.hypot(cx - sx, cy - sy);
        if (d <= (st.radius ?? 24) && d < bestDist) {
          bestDist = d;
          bestId = st.id;
        }
      }
      if (bestId !== activeStationRef.current) {
        activeStationRef.current = bestId;
        setActiveStationId(bestId);
      }

      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);

    const onKeyDown = (e: KeyboardEvent) => {
      if (frozenRef.current) return;
      const key = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) e.preventDefault();
      if (key === 'e' || key === 'enter') {
        // Computer takes precedence; otherwise fire the nearest station.
        if (nearComputerRef.current) {
          onEnterRef.current?.();
          return;
        }
        const sid = activeStationRef.current;
        if (sid) {
          stationsRef.current.find((s) => s.id === sid)?.onInteract();
          return;
        }
      }
      heldRef.current.add(key);
    };
    const onKeyUp = (e: KeyboardEvent) => heldRef.current.delete(e.key.toLowerCase());
    const clearKeys = () => heldRef.current.clear();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearKeys);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearKeys);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playable, bullpen, cols, leftCols, rows, wallRows, doorTopRow, doorBotRow, charNativeY, COMPUTER_X, COMPUTER_Y]);

  const charSpriteRow =
    facing === 'down' ? ROW_DOWN
    : facing === 'up' ? ROW_UP
    : ROW_RIGHT;
  const charFlip = facing === 'left' ? 'scaleX(-1)' : 'none';

  // Only ACTIVE bots get drawn — and we cap at the number of desk spots
  // so we never run out of seats. Normalize case so an upstream 'Active'
  // doesn't silently empty the bullpen.
  const seatedBots = activeBots
    .filter(b => (b.status ?? '').toLowerCase() === 'active')
    .slice(0, deskSpots.length);

  // Idle bots (no orders) sleep in the wall capsules. De-dupe against any
  // that are also somehow seated, then cap to the available capsule count.
  const seatedIds = new Set(seatedBots.map(b => b.id));
  const sleepingBots = idleBots
    .filter(b => !seatedIds.has(b.id))
    .slice(0, capsuleSpots.length);

  // Doorway gap in the divider wall — rows 4-5 (knee-to-head height).
  const dividerX = leftCols * TILE * scale;
  const dividerW = dividerCols * TILE * scale;

  // ── Camera / scrolling viewport ─────────────────────────────────────────
  // When a viewport size is supplied and the floor is bigger than it, we clip
  // to that window and pan a camera across the room — following the player in
  // playable mode, or parking on the bullpen for surveillance/monitoring. The
  // small dioramas pass no viewport, so viewW/viewH collapse to the full floor
  // and camX/camY stay 0 (identical to the pre-camera render).
  const viewW = viewportWidth != null ? Math.min(widthPx, Math.max(160, viewportWidth)) : widthPx;
  const viewH = viewportHeight != null ? Math.min(heightPx, Math.max(160, viewportHeight)) : heightPx;
  const hasCam = viewW < widthPx - 0.5 || viewH < heightPx - 0.5;
  let camTargetX: number;
  let camTargetY: number;
  if (playable && followCam) {
    camTargetX = posX * scale + (FRAME_W * scale) / 2 - viewW / 2;
    camTargetY = posY * scale + (FRAME_H * scale) / 2 - viewH / 2;
  } else {
    const focusCol = bullpen ? leftCols + dividerCols + rightCols / 2 : cols / 2;
    camTargetX = focusCol * TILE * scale - viewW / 2;
    camTargetY = heightPx / 2 - viewH / 2;
  }
  const camX = Math.max(0, Math.min(Math.max(0, widthPx - viewW), camTargetX));
  const camY = Math.max(0, Math.min(Math.max(0, heightPx - viewH), camTargetY));
  // Mirror camera + scale so the tap-to-move pointer handler can convert a
  // viewport tap into world space without re-reading render state.
  camXRef.current = camX;
  camYRef.current = camY;
  scaleRef.current = scale;

  // Native-pixel furniture renderer. Adds drop-shadow under each piece so
  // the flat sprites read as standing on a floor (2.5D cue #1).
  const renderFurniture = (it: Furn, i: number, key: string) => (
    <img
      key={`${key}-${i}`}
      src={it.src}
      alt=""
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: it.col * TILE * scale,
        top: (it.row + (it.z ?? 0)) * TILE * scale,
        width: it.wTile * TILE * scale,
        height: it.hTile * TILE * scale,
        imageRendering: 'pixelated',
        zIndex: 10 + (it.row * 10) + (it.z ?? 0),
        pointerEvents: 'none',
        filter: 'drop-shadow(0 2px 0 rgba(0,0,0,0.55)) drop-shadow(0 4px 6px rgba(0,0,0,0.35))',
      }}
    />
  );

  // Enclosed executive office — back + side walls (wall_0.png), a low glass
  // front partition split around the door gap, a nameplate, and (when occupied)
  // a desk + a standing exec sprite. zIndex layers keep the player (z 100) in
  // front of every wall; the nameplate floats above the station labels.
  const renderRoom = (room: OfficeRoom) => {
    const span = room.doorSpan ?? 2;
    const at = room.doorAt ?? (room.x + Math.floor((room.w - span) / 2));
    const px = (t: number) => t * TILE * scale;
    const accent = room.accent ?? '#c4b5fd';
    const wallBg = {
      backgroundImage: `url(${BASE}pixel-agents/walls/wall_0.png)`,
      backgroundRepeat: 'repeat' as const,
      backgroundSize: `${TILE * scale}px ${TILE * scale}px`,
      imageRendering: 'pixelated' as const,
    };
    const left = px(room.x);
    const top = px(room.y);
    const wpx = px(room.w);
    const backH = Math.round(1.4 * TILE * scale);
    const frontTop = px(room.y + room.h - 1);
    const doorLeft = px(at);
    const doorW = px(span);
    const occCx = left + wpx / 2;
    const frontSegs = [
      { l: left, w: doorLeft - left },
      { l: doorLeft + doorW, w: (left + wpx) - (doorLeft + doorW) },
    ];
    return (
      <React.Fragment key={`room-${room.id}`}>
        {/* Executive rug / floor accent */}
        <div style={{
          position: 'absolute', left, top: top + backH * 0.5, width: wpx, height: px(room.h) - backH * 0.5,
          background: `linear-gradient(180deg, ${accent}18, ${accent}06)`, zIndex: 6, pointerEvents: 'none',
        }} />
        {/* Back wall */}
        <div style={{
          position: 'absolute', left, top, width: wpx, height: backH, ...wallBg,
          boxShadow: 'inset 0 -4px 8px rgba(0,0,0,0.6)', zIndex: 7,
        }} />
        {/* Side walls */}
        <div style={{
          position: 'absolute', left, top, width: TILE * scale, height: px(room.h), ...wallBg,
          boxShadow: 'inset -3px 0 5px rgba(0,0,0,0.55)', zIndex: 8,
        }} />
        <div style={{
          position: 'absolute', left: px(room.x + room.w - 1), top, width: TILE * scale, height: px(room.h), ...wallBg,
          boxShadow: 'inset 3px 0 5px rgba(0,0,0,0.55)', zIndex: 8,
        }} />
        {/* Desk against the back wall */}
        <img
          src={`${BASE}pixel-agents/furniture/DESK/DESK_FRONT.png`}
          alt="" aria-hidden="true"
          style={{
            position: 'absolute', left: occCx - 1.5 * TILE * scale, top: px(room.y + 1.4),
            width: 3 * TILE * scale, height: 2 * TILE * scale, imageRendering: 'pixelated',
            zIndex: 20, pointerEvents: 'none', filter: 'drop-shadow(0 2px 0 rgba(0,0,0,0.5))',
          }}
        />
        {/* Occupant exec (omitted for vacant offices) */}
        {room.occupantSeed != null && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute', left: occCx - (FRAME_W * scale) / 2, top: px(room.y + room.h - 3.4),
              width: FRAME_W * scale, height: FRAME_H * scale, zIndex: 40,
              backgroundImage: `url(${BASE}pixel-agents/characters/char_0.png)`,
              backgroundSize: `${4 * FRAME_W * scale}px ${3 * FRAME_H * scale}px`,
              backgroundPosition: `0px -${ROW_DOWN * FRAME_H * scale}px`,
              backgroundRepeat: 'no-repeat', imageRendering: 'pixelated',
              filter: botSpriteFilter(room.occupantSeed, effectiveCrt),
            }}
          />
        )}
        {/* Low glass front partition (two segments around the door gap) */}
        {frontSegs.map((seg, i) => seg.w > 0 ? (
          <div key={`fs-${i}`} style={{
            position: 'absolute', left: seg.l, top: frontTop, width: seg.w, height: TILE * scale,
            background: `linear-gradient(180deg, ${accent}33, rgba(20,24,48,0.55))`,
            borderTop: `2px solid ${accent}aa`, boxShadow: `0 0 8px ${accent}44`,
            zIndex: 50, pointerEvents: 'none',
          }} />
        ) : null)}
        {/* Door threshold cavity */}
        <div style={{
          position: 'absolute', left: doorLeft, top: frontTop, width: doorW, height: TILE * scale,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.5), rgba(0,0,0,0.05))', zIndex: 49, pointerEvents: 'none',
        }} />
        {/* Nameplate */}
        <div style={{
          position: 'absolute', left, top: top - Math.max(7, scale * 3.4), width: wpx, textAlign: 'center',
          zIndex: 70, pointerEvents: 'none', fontFamily: '"Share Tech Mono","VT323",monospace',
          fontSize: Math.max(8, scale * 4), letterSpacing: '0.12em', color: accent,
          textShadow: '0 0 6px rgba(0,0,0,0.95)', whiteSpace: 'nowrap', overflow: 'hidden',
        }}>
          {(room.label ?? 'OFFICE').toUpperCase()}
          {room.sub && (
            <div style={{ fontSize: Math.max(6, scale * 2.6), color: 'rgba(200,210,255,0.7)', letterSpacing: '0.1em' }}>
              {room.sub.toUpperCase()}
            </div>
          )}
        </div>
      </React.Fragment>
    );
  };

  // Tap-to-move (mobile + pointer): translate a tap on the floor into a world
  // target the movement loop walks toward. Taps on buttons (the walk-up prompt)
  // are ignored so they still fire their own action.
  const handleFloorPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!playable || frozenRef.current) return;
    if ((e.target as HTMLElement).closest('button')) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const sc = scaleRef.current || 1;
    const worldX = (e.clientX - rect.left + camXRef.current) / sc;
    const worldY = (e.clientY - rect.top + camYRef.current) / sc;
    const tx = Math.max(0, Math.min(cols * TILE - FRAME_W, worldX - FRAME_W / 2));
    const ty = Math.max(
      (wallRows + 1) * TILE - FRAME_H,
      Math.min(rows * TILE - FRAME_H, worldY - FRAME_H),
    );
    tapTargetRef.current = { x: tx, y: ty };
  };

  return (
    <div
      data-testid="pixel-office"
      ref={containerRef}
      onPointerDown={handleFloorPointer}
      style={{
        position: 'relative',
        width: viewW,
        height: viewH,
        margin: '0 auto',
        imageRendering: 'pixelated',
        filter: premium
          ? 'saturate(1.07) contrast(1.16) brightness(1.0)'
          : crtTint
            ? 'sepia(1) hue-rotate(165deg) saturate(2.1) brightness(0.95) contrast(1.05)'
            : undefined,
        overflow: 'hidden',
        boxShadow: premium
          ? '0 0 0 1px rgba(150,120,255,.30), inset 0 0 70px rgba(8,4,26,.85)'
          : '0 0 0 1px rgba(56,189,248,.35), inset 0 0 24px rgba(0,16,24,.7)',
        background: premium ? '#0a0712' : '#000',
      }}
    >
      {/* Idle "alive" sway for seated bullpen bots — gentle bob + slight
          rotation pivoting at the feet so they read as breathing/shifting
          in their seats instead of frozen sprites. Each bot is desynced via
          its own duration/delay below. */}
      <style>{`@keyframes smBotIdle{0%{transform:translateY(0) rotate(0deg)}25%{transform:translateY(-1.5px) rotate(-1.2deg)}50%{transform:translateY(0) rotate(0deg)}75%{transform:translateY(-1px) rotate(1.2deg)}100%{transform:translateY(0) rotate(0deg)}}
@keyframes smCapsulePulse{0%{opacity:.35;box-shadow:0 0 6px rgba(120,200,255,.25),inset 0 0 10px rgba(80,160,255,.25)}50%{opacity:.7;box-shadow:0 0 14px rgba(120,200,255,.45),inset 0 0 16px rgba(80,160,255,.4)}100%{opacity:.35;box-shadow:0 0 6px rgba(120,200,255,.25),inset 0 0 10px rgba(80,160,255,.25)}}
@keyframes smCapsuleBreath{0%{transform:translateY(0)}50%{transform:translateY(1.5px)}100%{transform:translateY(0)}}
@keyframes smDust{0%{transform:translate(0,0);opacity:0}12%{opacity:.65}50%{transform:translate(10px,-16px);opacity:.45}88%{opacity:.45}100%{transform:translate(0,0);opacity:0}}`}</style>

      {/* ── Camera layer ────────────────────────────────────────────────────
          Holds the whole (full-size) floor. Translated by the camera so a
          larger room can pan inside the clipped viewport above. Collapses to a
          static full-size layer (translate 0,0) for the small dioramas. */}
      <div
        data-testid="pixel-office-camera"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: widthPx,
          height: heightPx,
          transform: `translate(${-camX}px, ${-camY}px)`,
          transition: hasCam ? 'transform 90ms linear' : undefined,
          willChange: hasCam ? 'transform' : undefined,
        }}
      >
      {/* Wall band (top wallRows) — single 16×16 slice tiled across. */}
      <div style={{
        position: 'absolute',
        left: 0, top: 0,
        width: widthPx,
        height: wallRows * TILE * scale,
        backgroundImage: `url(${BASE}pixel-agents/walls/wall_0.png)`,
        backgroundRepeat: 'repeat',
        backgroundSize: `${TILE * scale}px ${TILE * scale}px`,
        backgroundPosition: '0 0',
        imageRendering: 'pixelated',
      }} />

      {/* Ceiling highlight band (2.5D cue #2) — implies a lit ceiling above the wall. */}
      <div style={{
        position: 'absolute',
        left: 0, top: 0,
        width: widthPx,
        height: Math.max(2, scale * 2),
        background: 'linear-gradient(180deg, rgba(255,255,255,0.35), rgba(255,255,255,0))',
        pointerEvents: 'none',
        zIndex: 5,
      }} />

      {/* Floor band (rows below wall). */}
      <div style={{
        position: 'absolute',
        left: 0, top: wallRows * TILE * scale,
        width: widthPx,
        height: (rows - wallRows) * TILE * scale,
        backgroundImage: `url(${BASE}pixel-agents/floors/floor_0.png)`,
        backgroundRepeat: 'repeat',
        backgroundSize: `${TILE * scale}px ${TILE * scale}px`,
        imageRendering: 'pixelated',
      }} />

      {/* Floor perspective gradient (2.5D cue #3) — darker near the back
          (just under the wall) and brighter / warmer toward the camera,
          which fakes a tilted-floor read without warping the tiles. */}
      <div style={{
        position: 'absolute',
        left: 0, top: wallRows * TILE * scale,
        width: widthPx,
        height: (rows - wallRows) * TILE * scale,
        background: 'linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0) 75%, rgba(0,0,0,0.35) 100%)',
        pointerEvents: 'none',
        zIndex: 6,
      }} />

      {/* ── Premium environment lighting (sits behind furniture) ───────── */}
      {premium && (
        <>
          {/* Warm key-light ambience spilling down from the ceiling/back wall. */}
          <div style={{
            position: 'absolute', left: 0, top: 0,
            width: widthPx, height: (wallRows + 4) * TILE * scale,
            background: 'linear-gradient(180deg, rgba(255,226,184,0.16) 0%, rgba(255,205,160,0.05) 42%, rgba(255,205,160,0) 100%)',
            pointerEvents: 'none', mixBlendMode: 'screen', zIndex: 5,
          }} />
          {/* Cool depth haze pooling along the base of the back wall. */}
          <div style={{
            position: 'absolute', left: 0, top: Math.max(0, (wallRows - 1) * TILE * scale),
            width: widthPx, height: 3 * TILE * scale,
            background: 'linear-gradient(180deg, rgba(60,80,160,0) 0%, rgba(40,60,130,0.22) 100%)',
            pointerEvents: 'none', zIndex: 6,
          }} />
          {/* Polished-floor sheen brightening toward the camera. */}
          <div style={{
            position: 'absolute', left: 0, top: wallRows * TILE * scale,
            width: widthPx, height: (rows - wallRows) * TILE * scale,
            background: 'linear-gradient(180deg, rgba(150,180,255,0) 40%, rgba(150,180,255,0.05) 78%, rgba(190,210,255,0.09) 100%)',
            pointerEvents: 'none', mixBlendMode: 'screen', zIndex: 6,
          }} />
        </>
      )}

      {/* Divider wall column (only when bullpen is on) — thick wall slice
          with a doorway opening at rows 4-5 so the layout reads as two
          rooms separated by an interior wall, not one wide hall. */}
      {bullpen && (
        <>
          {/* Top of wall: solid from row 0 down to the doorway top */}
          <div style={{
            position: 'absolute',
            left: dividerX,
            top: 0,
            width: dividerW,
            height: doorTopRow * TILE * scale,
            backgroundImage: `url(${BASE}pixel-agents/walls/wall_0.png)`,
            backgroundRepeat: 'repeat',
            backgroundSize: `${TILE * scale}px ${TILE * scale}px`,
            imageRendering: 'pixelated',
            boxShadow: 'inset -2px 0 4px rgba(0,0,0,0.6), inset 2px 0 4px rgba(0,0,0,0.6)',
            zIndex: 7,
          }} />
          {/* Bottom of wall: solid lintel below the doorway down to the floor */}
          <div style={{
            position: 'absolute',
            left: dividerX,
            top: doorBotRow * TILE * scale,
            width: dividerW,
            height: (rows - doorBotRow) * TILE * scale,
            backgroundImage: `url(${BASE}pixel-agents/walls/wall_0.png)`,
            backgroundRepeat: 'repeat',
            backgroundSize: `${TILE * scale}px ${TILE * scale}px`,
            imageRendering: 'pixelated',
            boxShadow: 'inset -2px 0 4px rgba(0,0,0,0.6), inset 2px 0 4px rgba(0,0,0,0.6)',
            zIndex: 7,
          }} />
          {/* Doorway frame — dark cavity at the doorway band so it reads as a
              passage, not just a missing chunk of wall. */}
          <div style={{
            position: 'absolute',
            left: dividerX - 2,
            top: doorTopRow * TILE * scale,
            width: dividerW + 4,
            height: (doorBotRow - doorTopRow) * TILE * scale,
            background: 'linear-gradient(180deg, rgba(0,0,0,0.85), rgba(0,0,0,0.4))',
            borderLeft: '2px solid rgba(0,0,0,0.7)',
            borderRight: '2px solid rgba(0,0,0,0.7)',
            zIndex: 7,
          }} />
        </>
      )}

      {/* Furniture layers — private office first, then bullpen if enabled. */}
      {privateFurniture.map((it, i) => renderFurniture(it, i, 'p'))}
      {bullpenFurniture.map((it, i) => renderFurniture(it, i, 'b'))}

      {/* Enclosed executive offices (one per org member) — walled rooms with a
          door you walk into, a nameplate, and an occupant inside. */}
      {rooms.map(renderRoom)}

      {/* Interaction stations — portals to existing features. Drawn world-
          anchored inside the camera layer (PNG art or inline-SVG glyph), with a
          floating label that brightens when the player is in range. */}
      {stations.map((st) => {
        const sc = STATION_GLYPH_TILES[st.glyph ?? 'comms'];
        const wTiles = st.art ? st.art.wTiles : sc.w;
        const hTiles = st.art ? st.art.hTiles : sc.h;
        const active = playable && activeStationId === st.id;
        return (
          <div
            key={`st-${st.id}`}
            style={{
              position: 'absolute',
              left: st.col * TILE * scale,
              top: st.row * TILE * scale,
              width: wTiles * TILE * scale,
              height: hTiles * TILE * scale,
              zIndex: 60,
              pointerEvents: 'none',
            }}
          >
            {st.art ? (
              <img
                src={st.art.src}
                alt=""
                aria-hidden="true"
                style={{
                  width: '100%',
                  height: '100%',
                  imageRendering: 'pixelated',
                  filter: active ? 'drop-shadow(0 0 6px rgba(56,189,248,0.95))' : 'drop-shadow(2px 4px 3px rgba(0,0,0,0.45))',
                }}
              />
            ) : (
              <div style={{ filter: active ? 'drop-shadow(0 0 6px rgba(56,189,248,0.95))' : undefined }}>
                <OfficeStationSprite glyph={st.glyph ?? 'comms'} tile={TILE * scale} />
              </div>
            )}
            {playable && (
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: -1.6 * TILE * scale,
                  transform: 'translateX(-50%)',
                  whiteSpace: 'nowrap',
                  fontFamily: '"Share Tech Mono", "VT323", monospace',
                  fontSize: Math.max(8, scale * 4),
                  letterSpacing: '0.14em',
                  color: active ? '#aef3ff' : 'rgba(150,200,225,0.7)',
                  textShadow: '0 0 5px rgba(0,0,0,0.95)',
                  opacity: active ? 1 : 0.8,
                  animation: active ? 'smCapsuleBreath 1.6s ease-in-out infinite' : undefined,
                }}
              >
                {active ? '▸ ' : ''}{st.label}
              </div>
            )}
          </div>
        );
      })}

      {/* Bullpen bots — one PixelAgents character per active bot, planted
          at a desk spot. Hue-rotated per bot id so the team reads as
          distinct characters, not 6 clones. */}
      {bullpen && seatedBots.map((bot, i) => {
        const spot = deskSpots[i];
        const x = spot.col * TILE * scale;
        const y = spot.row * TILE * scale - (FRAME_H - TILE) * scale;
        const idleDur = 2.4 + (i % 3) * 0.7;
        const idleDelay = (i * 0.43) % 2;
        return (
          <React.Fragment key={`bot-${bot.id}`}>
            <div
              aria-hidden="true"
              data-testid={`pixel-office-bot-${bot.id}`}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: FRAME_W * scale,
                height: FRAME_H * scale,
                transformOrigin: 'center bottom',
                animation: `smBotIdle ${idleDur}s ease-in-out ${idleDelay}s infinite`,
                zIndex: 90 + spot.row,
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  backgroundImage: `url(${BASE}pixel-agents/characters/char_0.png)`,
                  backgroundSize: `${4 * FRAME_W * scale}px ${3 * FRAME_H * scale}px`,
                  // Facing-up pose so they look like they're working at the
                  // monitor in front of them; the wrapper adds the idle sway.
                  backgroundPosition: `0px -${ROW_UP * FRAME_H * scale}px`,
                  backgroundRepeat: 'no-repeat',
                  imageRendering: 'pixelated',
                  transform: spot.flip ? 'scaleX(-1)' : 'none',
                  transformOrigin: 'center center',
                  filter: botSpriteFilter(bot.id, effectiveCrt),
                }}
              />
            </div>
            {/* Floor name-plate under each bot */}
            <div
              style={{
                position: 'absolute',
                left: x - FRAME_W * scale * 0.3,
                top: y + FRAME_H * scale + 1,
                width: FRAME_W * scale * 1.6,
                textAlign: 'center',
                fontFamily: '"Share Tech Mono", "VT323", monospace',
                fontSize: Math.max(8, scale * 4),
                color: bot.teamColor ?? 'rgba(180,255,220,0.8)',
                textShadow: '0 0 2px rgba(0,0,0,0.8), 0 1px 0 rgba(0,0,0,0.6)',
                letterSpacing: '0.1em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'clip',
                pointerEvents: 'none',
                zIndex: 95 + spot.row,
              }}
              title={bot.teamLabel}
            >
              {bot.name.slice(0, 8).toUpperCase()}
            </div>
          </React.Fragment>
        );
      })}

      {/* Storage capsules along the bullpen back wall — idle bots (no
          orders) sleep here, powered-down: dimmed sprite, slow breathing
          bob, and a pulsing cryo-glow frame. They wake (move to a desk)
          only when given an order. */}
      {bullpen && sleepingBots.map((bot, i) => {
        const spot = capsuleSpots[i];
        const capW = 1.7 * TILE * scale;
        const capH = 2.5 * TILE * scale;
        const x = spot.col * TILE * scale;
        const y = 0.35 * TILE * scale;
        const pulseDur = 3.2 + (i % 3) * 0.6;
        const pulseDelay = (i * 0.5) % 2.5;
        return (
          <React.Fragment key={`cap-${bot.id}`}>
            {/* Capsule shell */}
            <div
              data-testid={`pixel-office-capsule-${bot.id}`}
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: capW,
                height: capH,
                borderRadius: `${capW / 2}px ${capW / 2}px ${capW * 0.28}px ${capW * 0.28}px`,
                border: `1px solid ${bot.teamColor ?? 'rgba(140,210,255,0.5)'}`,
                boxShadow: bot.teamColor ? `0 0 6px ${bot.teamColor}55` : undefined,
                background: 'linear-gradient(180deg, rgba(40,70,110,0.55) 0%, rgba(15,30,55,0.7) 100%)',
                animation: `smCapsulePulse ${pulseDur}s ease-in-out ${pulseDelay}s infinite`,
                zIndex: 80,
                overflow: 'hidden',
              }}
              title={bot.teamLabel}
            >
              {/* Sleeping sprite inside the pod — dimmed + desaturated,
                  gentle breathing bob. */}
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  bottom: capH * 0.12,
                  width: FRAME_W * scale,
                  height: FRAME_H * scale,
                  marginLeft: -(FRAME_W * scale) / 2,
                  backgroundImage: `url(${BASE}pixel-agents/characters/char_0.png)`,
                  backgroundSize: `${4 * FRAME_W * scale}px ${3 * FRAME_H * scale}px`,
                  backgroundPosition: `0px -${ROW_DOWN * FRAME_H * scale}px`,
                  backgroundRepeat: 'no-repeat',
                  imageRendering: 'pixelated',
                  filter: `${botSpriteFilter(bot.id, effectiveCrt)} brightness(0.55) saturate(0.6)`,
                  animation: `smCapsuleBreath ${pulseDur}s ease-in-out ${pulseDelay}s infinite`,
                }}
              />
              {/* Glass sheen */}
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(115deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 40%)',
                pointerEvents: 'none',
              }} />
            </div>
            {/* Capsule name-plate + ZZZ */}
            <div
              style={{
                position: 'absolute',
                left: x - 2,
                top: y + capH + 1,
                width: capW + 4,
                textAlign: 'center',
                fontFamily: '"Share Tech Mono", "VT323", monospace',
                fontSize: Math.max(7, scale * 3.2),
                color: bot.teamColor ?? 'rgba(140,200,255,0.7)',
                textShadow: '0 0 2px rgba(0,0,0,0.8)',
                letterSpacing: '0.08em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'clip',
                pointerEvents: 'none',
                zIndex: 85,
              }}
            >
              {bot.name.slice(0, 7).toUpperCase()} · 💤
            </div>
          </React.Fragment>
        );
      })}

      {/* Owner character — auto-wanders the LEFT room, or PLAYER-CONTROLLED
          (free 2D movement) when `playable`. */}
      {playable && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: posX * scale + (FRAME_W * scale) / 2 - FRAME_W * scale * 0.42,
            top: posY * scale + FRAME_H * scale - 6,
            width: FRAME_W * scale * 0.84,
            height: 8,
            borderRadius: '50%',
            background:
              'radial-gradient(ellipse at center, rgba(0,0,0,0.55), rgba(0,0,0,0) 72%)',
            zIndex: 99,
            pointerEvents: 'none',
          }}
        />
      )}
      <div
        aria-hidden="true"
        data-testid="pixel-office-character"
        style={{
          position: 'absolute',
          left: posX * scale,
          top: (playable ? posY : charNativeY) * scale,
          width: FRAME_W * scale,
          height: FRAME_H * scale,
          transform: charFlip,
          transformOrigin: 'center center',
          zIndex: 100,
          filter: playable
            ? 'drop-shadow(0 0 3px rgba(255,215,90,0.95)) drop-shadow(0 3px 4px rgba(0,0,0,0.5))'
            : undefined,
          willChange: 'left, top',
        }}
      >
        {appearance ? (
          // Shared procedural paper-doll — identical to WorldPlay city.
          <OfficePlayerSprite appearance={appearance} scale={scale} costumeColor={costumeColor} />
        ) : (
          // Legacy char_0 sprite sheet fallback (static cutscene callers).
          <div
            style={{
              width: FRAME_W * scale,
              height: FRAME_H * scale,
              backgroundImage: `url(${BASE}pixel-agents/characters/char_0.png)`,
              backgroundSize: `${4 * FRAME_W * scale}px ${3 * FRAME_H * scale}px`,
              backgroundPosition: `-${walkFrame * FRAME_W * scale}px -${charSpriteRow * FRAME_H * scale}px`,
              backgroundRepeat: 'no-repeat',
              imageRendering: 'pixelated',
            }}
          />
        )}
      </div>

      {/* ── Premium cinematic light (sits over the whole scene) ────────── */}
      {premium && (
        <>
          {/* Soft warm key-light pool pulling focus to the centre. */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            mixBlendMode: 'screen', zIndex: 160,
            background: 'radial-gradient(ellipse 62% 54% at 50% 40%, rgba(255,238,205,0.15), rgba(255,238,205,0) 70%)',
          }} />
          {/* Two diagonal window light shafts raking across the room. */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            mixBlendMode: 'screen', zIndex: 161,
            background: 'linear-gradient(115deg, transparent 30%, rgba(190,225,255,0.07) 38%, transparent 46%, transparent 60%, rgba(190,225,255,0.05) 67%, transparent 74%)',
          }} />
          {/* Bloom off every powered monitor. */}
          {[...privateFurniture, ...bullpenFurniture]
            .filter((it) => it.src.includes('PC/PC_FRONT_ON'))
            .map((it, i) => (
              <div key={`bloom-${i}`} style={{
                position: 'absolute',
                left: (it.col + it.wTile / 2) * TILE * scale - 3 * TILE * scale,
                top: (it.row + (it.z ?? 0) + it.hTile / 2) * TILE * scale - 3 * TILE * scale,
                width: 6 * TILE * scale, height: 6 * TILE * scale, borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(120,210,255,0.30), rgba(120,210,255,0) 68%)',
                pointerEvents: 'none', mixBlendMode: 'screen', zIndex: 120,
              }} />
            ))}
          {/* Drifting dust motes catching the light. */}
          {DUST.map((d, i) => (
            <div key={`dust-${i}`} style={{
              position: 'absolute', left: `${d.x}%`, top: `${d.y}%`,
              width: Math.max(1, scale), height: Math.max(1, scale), borderRadius: '50%',
              background: 'rgba(255,245,220,0.55)', boxShadow: '0 0 4px rgba(255,245,220,0.6)',
              pointerEvents: 'none', mixBlendMode: 'screen', zIndex: 165,
              animation: `smDust ${d.dur}s ease-in-out ${d.delay}s infinite`,
            }} />
          ))}
        </>
      )}

      {/* ── Player affordances (only in playable mode) ──────────────────── */}
      {/* Glowing marker over the desk computer so the player knows where to go. */}
      {playable && onEnterTerminal && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: COMPUTER_X * scale - 7 * scale,
            top: (COMPUTER_Y - 3.4 * TILE) * scale,
            width: 14 * scale,
            textAlign: 'center',
            fontSize: Math.max(11, scale * 5),
            zIndex: 150,
            pointerEvents: 'none',
            animation: 'smCapsuleBreath 1.8s ease-in-out infinite',
            filter: 'drop-shadow(0 0 4px rgba(56,189,248,0.9))',
          }}
        >
          💻
        </div>
      )}
      </div>{/* ── end camera layer ─────────────────────────────────────── */}

      {/* Screen-space overlays — OUTSIDE the camera layer so they stay locked
          to the viewport (don't pan with the world when the camera follows the
          player). Corner vignette, CRT scanlines, and side-room labels. */}
      {/* Corner vignette (2.5D cue #4) — pulls focus to the centre and
          implies depth at the edges. Premium uses a softer, indigo-tinted
          falloff instead of the harsh pure-black CRT ring. */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: premium
          ? 'radial-gradient(ellipse at center, transparent 58%, rgba(8,4,22,0.60) 100%)'
          : 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)',
        zIndex: 199,
      }} />

      {/* Subtle scanline overlay to lock the diorama into the CRT theme.
          Skipped entirely in premium mode — scanlines read as retro, not art. */}
      {!premium && (
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0px, rgba(0,0,0,0.18) 1px, transparent 1px, transparent 3px)',
        mixBlendMode: 'multiply',
        zIndex: 200,
      }} />
      )}

      {/* Room labels — only when the bullpen is open, so the user sees
          which side is which. */}
      {bullpen && (
        <>
          <div style={{
            position: 'absolute',
            left: 4,
            bottom: 4,
            fontFamily: '"Share Tech Mono", "VT323", monospace',
            fontSize: Math.max(9, scale * 5),
            color: 'rgba(120,220,255,0.85)',
            textShadow: '0 0 4px rgba(0,0,0,0.9)',
            letterSpacing: '0.25em',
            zIndex: 210,
            pointerEvents: 'none',
          }}>
            ▸ PRIVATE
          </div>
          <div style={{
            position: 'absolute',
            right: 4,
            bottom: 4,
            fontFamily: '"Share Tech Mono", "VT323", monospace',
            fontSize: Math.max(9, scale * 5),
            color: 'rgba(180,255,220,0.85)',
            textShadow: '0 0 4px rgba(0,0,0,0.9)',
            letterSpacing: '0.25em',
            zIndex: 210,
            pointerEvents: 'none',
          }}>
            BOT BULLPEN ◂
          </div>
        </>
      )}

      {/* Walk-up prompt — shown when standing on the computer OR a station.
          The computer takes precedence; otherwise the nearest station's label
          is shown and tapping fires its handler (open an existing feature). */}
      {playable && !frozen && (() => {
        const showComputer = !!onEnterTerminal && nearComputer;
        const activeStation = !showComputer && activeStationId
          ? stations.find((s) => s.id === activeStationId)
          : undefined;
        if (!showComputer && !activeStation) return null;
        const label = showComputer ? 'ENTER TERMINAL' : (activeStation?.label ?? '');
        const fire = showComputer ? () => onEnterTerminal?.() : () => activeStation?.onInteract();
        return (
          <button
            type="button"
            data-testid={showComputer ? 'office-computer-enter' : `office-station-${activeStation?.id}`}
            onClick={fire}
            style={{
              position: 'absolute',
              left: '50%',
              bottom: 10,
              transform: 'translateX(-50%)',
              padding: '.5rem .9rem',
              background: 'linear-gradient(135deg, rgba(6,182,212,.9), rgba(34,197,94,.75))',
              border: '1px solid rgba(56,189,248,.95)',
              borderRadius: 6,
              color: '#001016',
              font: 'bold .7rem "Share Tech Mono", monospace',
              letterSpacing: '.16em',
              cursor: 'pointer',
              zIndex: 220,
              boxShadow: '0 0 16px rgba(56,189,248,.6)',
              whiteSpace: 'nowrap',
            }}
          >
            ▸ {label}{isTouch ? '' : ' · PRESS E'}
          </button>
        );
      })()}

      {/* Mobile uses tap-to-move (handleFloorPointer) rather than an on-screen
          D-pad, so nothing occludes the floor and every interaction is a tap. */}
    </div>
  );
}
