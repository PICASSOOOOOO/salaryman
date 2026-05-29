import React, { useEffect, useState } from 'react';

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
  { col: 17 + 2.6 },
  { col: 17 + 5.2 },
  { col: 17 + 7.8 },
  { col: 17 + 10.4 },
  { col: 17 + 13 },
];

// Sprite sheet rows: 0=down, 1=up, 2=right.
const ROW_DOWN  = 0;
const ROW_UP    = 1;
const ROW_RIGHT = 2;
const FRAME_W = 28;
const FRAME_H = 32;

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
}: PixelOfficeProps) {
  const BASE = import.meta.env.BASE_URL ?? '/';
  const leftCols = 16;
  const dividerCols = bullpen ? 1 : 0;
  const rightCols = bullpen ? 16 : 0;
  const cols = leftCols + dividerCols + rightCols;
  const rows = 7;
  const wallRows = 2;

  const widthPx  = cols * TILE * scale;
  const heightPx = rows * TILE * scale;

  const privateFurniture = buildPrivateFurniture(BASE);
  const bullpenFurniture = bullpen ? buildBullpenFurniture(BASE) : [];

  // Path endpoints (in native px) — between the left and right desks of
  // the PRIVATE office. Bullpen has its own bots, the wandering character
  // doesn't cross the divider wall (the doorway is fictional cover, not
  // a navigable opening — keeps the pathing trivially correct).
  const charNativeY = 5 * TILE - (FRAME_H - TILE);
  const PATH_LEFT_X  = 3 * TILE + (TILE - FRAME_W) / 2 + TILE;
  const PATH_RIGHT_X = 10 * TILE + (TILE - FRAME_W) / 2 + TILE;
  const AT_DESK_X    = PATH_RIGHT_X;

  const [posX, setPosX] = useState<number>(
    mode === 'at-desk' ? AT_DESK_X : PATH_LEFT_X,
  );
  const [walkFrame, setWalkFrame] = useState<number>(0);
  const [facing, setFacing] = useState<'right' | 'left' | 'down' | 'up'>(
    mode === 'at-desk' ? 'up' : 'right',
  );

  useEffect(() => {
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
  }, [mode, PATH_LEFT_X, PATH_RIGHT_X, AT_DESK_X]);

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
    .slice(0, BULLPEN_DESK_SPOTS.length);

  // Idle bots (no orders) sleep in the wall capsules. De-dupe against any
  // that are also somehow seated, then cap to the available capsule count.
  const seatedIds = new Set(seatedBots.map(b => b.id));
  const sleepingBots = idleBots
    .filter(b => !seatedIds.has(b.id))
    .slice(0, CAPSULE_WALL_SPOTS.length);

  // Doorway gap in the divider wall — rows 4-5 (knee-to-head height).
  const dividerX = leftCols * TILE * scale;
  const dividerW = dividerCols * TILE * scale;

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

  return (
    <div
      data-testid="pixel-office"
      style={{
        position: 'relative',
        width: widthPx,
        height: heightPx,
        margin: '0 auto',
        imageRendering: 'pixelated',
        filter: crtTint ? 'sepia(1) hue-rotate(165deg) saturate(2.1) brightness(0.95) contrast(1.05)' : undefined,
        overflow: 'hidden',
        boxShadow: '0 0 0 1px rgba(56,189,248,.35), inset 0 0 24px rgba(0,16,24,.7)',
        background: '#000',
      }}
    >
      {/* Idle "alive" sway for seated bullpen bots — gentle bob + slight
          rotation pivoting at the feet so they read as breathing/shifting
          in their seats instead of frozen sprites. Each bot is desynced via
          its own duration/delay below. */}
      <style>{`@keyframes smBotIdle{0%{transform:translateY(0) rotate(0deg)}25%{transform:translateY(-1.5px) rotate(-1.2deg)}50%{transform:translateY(0) rotate(0deg)}75%{transform:translateY(-1px) rotate(1.2deg)}100%{transform:translateY(0) rotate(0deg)}}
@keyframes smCapsulePulse{0%{opacity:.35;box-shadow:0 0 6px rgba(120,200,255,.25),inset 0 0 10px rgba(80,160,255,.25)}50%{opacity:.7;box-shadow:0 0 14px rgba(120,200,255,.45),inset 0 0 16px rgba(80,160,255,.4)}100%{opacity:.35;box-shadow:0 0 6px rgba(120,200,255,.25),inset 0 0 10px rgba(80,160,255,.25)}}
@keyframes smCapsuleBreath{0%{transform:translateY(0)}50%{transform:translateY(1.5px)}100%{transform:translateY(0)}}`}</style>

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

      {/* Divider wall column (only when bullpen is on) — thick wall slice
          with a doorway opening at rows 4-5 so the layout reads as two
          rooms separated by an interior wall, not one wide hall. */}
      {bullpen && (
        <>
          {/* Top of wall: solid from row 0 to row 4 */}
          <div style={{
            position: 'absolute',
            left: dividerX,
            top: 0,
            width: dividerW,
            height: 4 * TILE * scale,
            backgroundImage: `url(${BASE}pixel-agents/walls/wall_0.png)`,
            backgroundRepeat: 'repeat',
            backgroundSize: `${TILE * scale}px ${TILE * scale}px`,
            imageRendering: 'pixelated',
            boxShadow: 'inset -2px 0 4px rgba(0,0,0,0.6), inset 2px 0 4px rgba(0,0,0,0.6)',
            zIndex: 7,
          }} />
          {/* Bottom of wall: solid from row 6 to row 7 (lintel below doorway) */}
          <div style={{
            position: 'absolute',
            left: dividerX,
            top: 6 * TILE * scale,
            width: dividerW,
            height: 1 * TILE * scale,
            backgroundImage: `url(${BASE}pixel-agents/walls/wall_0.png)`,
            backgroundRepeat: 'repeat',
            backgroundSize: `${TILE * scale}px ${TILE * scale}px`,
            imageRendering: 'pixelated',
            boxShadow: 'inset -2px 0 4px rgba(0,0,0,0.6), inset 2px 0 4px rgba(0,0,0,0.6)',
            zIndex: 7,
          }} />
          {/* Doorway frame — dark cavity from rows 4-6 so it reads as a
              passage, not just a missing chunk of wall. */}
          <div style={{
            position: 'absolute',
            left: dividerX - 2,
            top: 4 * TILE * scale,
            width: dividerW + 4,
            height: 2 * TILE * scale,
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

      {/* Bullpen bots — one PixelAgents character per active bot, planted
          at a desk spot. Hue-rotated per bot id so the team reads as
          distinct characters, not 6 clones. */}
      {bullpen && seatedBots.map((bot, i) => {
        const spot = BULLPEN_DESK_SPOTS[i];
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
                  filter: botSpriteFilter(bot.id, crtTint),
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
                color: 'rgba(180,255,220,0.8)',
                textShadow: '0 0 2px rgba(0,0,0,0.8), 0 1px 0 rgba(0,0,0,0.6)',
                letterSpacing: '0.1em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'clip',
                pointerEvents: 'none',
                zIndex: 95 + spot.row,
              }}
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
        const spot = CAPSULE_WALL_SPOTS[i];
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
                border: '1px solid rgba(140,210,255,0.5)',
                background: 'linear-gradient(180deg, rgba(40,70,110,0.55) 0%, rgba(15,30,55,0.7) 100%)',
                animation: `smCapsulePulse ${pulseDur}s ease-in-out ${pulseDelay}s infinite`,
                zIndex: 80,
                overflow: 'hidden',
              }}
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
                  filter: `${botSpriteFilter(bot.id, crtTint)} brightness(0.55) saturate(0.6)`,
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
                color: 'rgba(140,200,255,0.7)',
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

      {/* Owner character — wanders the LEFT room only. */}
      <div
        aria-hidden="true"
        data-testid="pixel-office-character"
        style={{
          position: 'absolute',
          left: posX * scale,
          top: charNativeY * scale,
          width: FRAME_W * scale,
          height: FRAME_H * scale,
          backgroundImage: `url(${BASE}pixel-agents/characters/char_0.png)`,
          backgroundSize: `${4 * FRAME_W * scale}px ${3 * FRAME_H * scale}px`,
          backgroundPosition: `-${walkFrame * FRAME_W * scale}px -${charSpriteRow * FRAME_H * scale}px`,
          backgroundRepeat: 'no-repeat',
          imageRendering: 'pixelated',
          transform: charFlip,
          transformOrigin: 'center center',
          zIndex: 100,
          willChange: 'left',
        }}
      />

      {/* Corner vignette (2.5D cue #4) — pulls focus to the centre and
          implies depth at the edges. */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)',
        zIndex: 199,
      }} />

      {/* Subtle scanline overlay to lock the diorama into the CRT theme. */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0px, rgba(0,0,0,0.18) 1px, transparent 1px, transparent 3px)',
        mixBlendMode: 'multiply',
        zIndex: 200,
      }} />

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
    </div>
  );
}
