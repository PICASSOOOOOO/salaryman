import React, { useEffect, useState } from 'react';

/**
 * PixelOffice — a static pixel-art "Pablo's office" diorama.
 *
 * Sprites are sourced from Pixel Agents (https://github.com/pablodelucca/pixel-agents)
 * by Pablo De Lucca, MIT-licensed. See `public/pixel-agents/ATTRIBUTION.md`
 * and `public/pixel-agents/LICENSE`. The PNGs are served from the artifact's
 * public/ directory and referenced through the artifact base URL so
 * preview-pane proxying still resolves them correctly.
 *
 * The scene is laid out on a fixed 16×7 tile grid (each tile 16px native)
 * and scaled up via CSS transform so it looks crisp on retina without
 * blurring. We deliberately use `image-rendering: pixelated` so the
 * upscale stays blocky rather than smoothing the sprites.
 *
 * The character (char_0) is a 4×3 sprite sheet (4 walk frames × 3
 * directions: down/up/right at 28×32 each). We render only the first
 * "down-walk" frame here as a static cameo, with a CSS keyframe
 * cycling the other 3 frames so Pablo's operative looks alive.
 */

const TILE = 16; // px native, before scale

interface PixelOfficeProps {
  /** Pixel scale-up factor. 3 → ~768×336 visible at default 16-col layout. */
  scale?: number;
  /** Apply a phosphor-blue tint to match the CRT theme. Default: true. */
  crtTint?: boolean;
  /**
   * Character behaviour:
   *   - 'wander':  the operative slowly walks back and forth across the
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
}

// Furniture placement on the 16-wide × 7-tall grid. Coordinates are tile
// indices; pixel offsets get computed at render time. `wTile`/`hTile` reflect
// the native sprite size in tiles so multi-tile pieces (DESK_FRONT 3×2, etc)
// land flush.
type Furn = { src: string; col: number; row: number; wTile: number; hTile: number; z?: number };

function buildFurniture(BASE: string): Furn[] {
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

export function PixelOffice({ scale = 3, crtTint = true, mode = 'wander' }: PixelOfficeProps) {
  const BASE = import.meta.env.BASE_URL ?? '/';
  const cols = 16;
  const rows = 7;
  const wallRows = 2;

  const widthPx  = cols * TILE * scale;
  const heightPx = rows * TILE * scale;

  const furniture = buildFurniture(BASE);

  const FRAME_W = 28;
  const FRAME_H = 32;

  // Sprite sheet rows: 0=down, 1=up, 2=right. We use row 2 (right) for
  // horizontal travel and CSS-flip when walking left so we never need a
  // separate left sheet. Row 0 is held when paused or in 'still'.
  // 'at-desk' uses row 1 (up) so the character faces the monitor — the
  // PostOnboardingIntro's "press E to turn on terminal" beat reads as
  // "he's looking at the screen" instead of staring at the camera.
  const ROW_DOWN  = 0;
  const ROW_UP    = 1;
  const ROW_RIGHT = 2;

  // Path endpoints (in native px) — between the left and right desks.
  // Bottom-aligned to row 5 so the character's feet land on the floor.
  const charNativeY = 5 * TILE - (FRAME_H - TILE);
  const PATH_LEFT_X  = 3 * TILE + (TILE - FRAME_W) / 2 + TILE;        // ~ left desk
  const PATH_RIGHT_X = 10 * TILE + (TILE - FRAME_W) / 2 + TILE;       // ~ right desk
  const AT_DESK_X    = PATH_RIGHT_X;                                  // sit-pose target

  // Wander state: x position in native px, walk frame, and facing dir.
  // We drive position via rAF so motion is smooth across refresh rates;
  // the walk-frame counter only ticks while actually moving, which kills
  // the "march in place" look the previous build had.
  const [posX, setPosX] = useState<number>(
    mode === 'at-desk' ? AT_DESK_X : PATH_LEFT_X,
  );
  const [walkFrame, setWalkFrame] = useState<number>(0);
  const [facing, setFacing] = useState<'right' | 'left' | 'down' | 'up'>(
    mode === 'at-desk' ? 'up' : 'right',
  );

  useEffect(() => {
    if (mode !== 'wander') {
      // Snap to a static pose and stop animating entirely. 'at-desk'
      // looks UP at the monitor; 'still' faces the camera.
      setPosX(mode === 'at-desk' ? AT_DESK_X : PATH_LEFT_X);
      setFacing(mode === 'at-desk' ? 'up' : 'down');
      setWalkFrame(0);
      return;
    }

    let raf = 0;
    let last = performance.now();
    let dir: 1 | -1 = 1;
    let x = PATH_LEFT_X;
    let pauseUntil = 0;            // ms timestamp; movement gated until this
    let frameAccumMs = 0;
    const SPEED_PX_PER_SEC = 14;   // native px before scale; deliberately slow
    const FRAME_PERIOD_MS = 160;   // walk-cycle cadence WHILE moving

    const tick = (now: number) => {
      const dt = Math.max(0, now - last);
      last = now;

      if (now < pauseUntil) {
        // Idling at an endpoint — face the camera, freeze on frame 0.
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

  return (
    <div
      data-testid="pixel-office"
      style={{
        position: 'relative',
        width: widthPx,
        height: heightPx,
        margin: '0 auto',
        // Crisp pixel-art scaling. Without these the floor and sprites
        // get bilinear-blurred to mush at >1× zoom.
        imageRendering: 'pixelated',
        // Tint everything phosphor-blue so the warm pixel art doesn't
        // clash with the surrounding CRT/Pip-Boy aesthetic.
        filter: crtTint ? 'sepia(1) hue-rotate(165deg) saturate(2.1) brightness(0.95) contrast(1.05)' : undefined,
        overflow: 'hidden',
        boxShadow: '0 0 0 1px rgba(56,189,248,.35), inset 0 0 24px rgba(0,16,24,.7)',
        background: '#000',
      }}
    >
      {/* Wall band (top wallRows). We tile a single 16×16 slice from
          wall_0.png — cropped via background-position so we get a flat
          wall regardless of the sheet's other variants. */}
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

      {/* Floor band (rows below wall) — single 16×16 floor tile repeated. */}
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

      {/* Furniture layer. z-index defaults to row index so lower rows
          render on top of upper rows (basic painter's algorithm). */}
      {furniture.map((it, i) => (
        <img
          key={i}
          src={it.src}
          alt=""
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: it.col * TILE * scale,
            // Sprite is bottom-aligned to its declared row + height — that's
            // how the upstream renderer treats them, so multi-tile pieces
            // stand on the row they're "in" rather than dangling from it.
            top: (it.row + (it.z ?? 0)) * TILE * scale,
            width: it.wTile * TILE * scale,
            height: it.hTile * TILE * scale,
            imageRendering: 'pixelated',
            zIndex: 10 + (it.row * 10) + (it.z ?? 0),
            pointerEvents: 'none',
          }}
        />
      ))}

      {/* Character — wanders horizontally between the two desks (or holds
          a static pose in 'still' / 'at-desk' mode). The walk-frame
          counter only ticks while he's actually moving, so we never see
          the old jerky in-place march that "cut off" mid-stride. */}
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
          // Smooth motion comes from the rAF loop updating posX every
          // frame; no CSS transition (it would fight the loop and lag).
          zIndex: 100,
          willChange: 'left',
        }}
      />

      {/* Subtle scanline overlay to lock the diorama into the CRT theme. */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0px, rgba(0,0,0,0.18) 1px, transparent 1px, transparent 3px)',
        mixBlendMode: 'multiply',
        zIndex: 200,
      }} />
    </div>
  );
}
