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

export function PixelOffice({ scale = 3, crtTint = true }: PixelOfficeProps) {
  const BASE = import.meta.env.BASE_URL ?? '/';
  const cols = 16;
  const rows = 7;
  const wallRows = 2;

  const widthPx  = cols * TILE * scale;
  const heightPx = rows * TILE * scale;

  const furniture = buildFurniture(BASE);

  // Animate the character sprite by cycling through the 4 down-walk frames
  // every 280ms. The sprite sheet is 4 cols × 3 rows of 28×32 px frames;
  // first row is "down". Background-position uses native px, then the whole
  // container is CSS-scaled.
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setFrame(f => (f + 1) % 4), 280);
    return () => window.clearInterval(id);
  }, []);

  const FRAME_W = 28;
  const FRAME_H = 32;
  // Place the character in front of the left desk, facing the camera.
  // Tile coords get a half-tile horizontal nudge so the 28-px-wide frame
  // sits centered between the 16-px tiles.
  const charNativeX = 4 * TILE + (TILE - FRAME_W) / 2 + TILE; // ~ desk col
  const charNativeY = 5 * TILE - (FRAME_H - TILE);            // bottom-aligned to row 5

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

      {/* Character cameo — single down-walk frame, cycled. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: charNativeX * scale,
          top: charNativeY * scale,
          width: FRAME_W * scale,
          height: FRAME_H * scale,
          backgroundImage: `url(${BASE}pixel-agents/characters/char_0.png)`,
          backgroundSize: `${4 * FRAME_W * scale}px ${3 * FRAME_H * scale}px`,
          backgroundPosition: `-${frame * FRAME_W * scale}px 0px`,
          backgroundRepeat: 'no-repeat',
          imageRendering: 'pixelated',
          zIndex: 100,
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
