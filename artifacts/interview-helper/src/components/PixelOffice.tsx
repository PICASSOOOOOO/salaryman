import React, { useEffect, useRef, useState } from 'react';
import { sfxStep } from '@/soundEngine';

// Re-export the shared office contract types from their canonical home so any
// existing `import { OfficeStation } from '@/components/PixelOffice'` keeps
// working. New code should import from '@/components/office/office-types'.
export type {
  OfficeStation,
  OfficeRoom,
  OfficeBot,
  PixelOfficeBot,
} from '@/components/office/office-types';

/**
 * PixelOffice — flat top-down pixel-art office diorama.
 *
 * This is the LEGACY flat renderer, kept ON PURPOSE for the onboarding
 * cutscenes (PabloOnboarding's intake fallback, PostOnboardingIntro's "learn
 * the controls" beat). The live, walkable `/office` page uses the isometric
 * renderer (`IsoOffice`) instead — its richer feature set (bot bullpen, cryo
 * capsules, executive rooms, interaction stations, scrolling camera, premium
 * lighting, shared paper-doll appearance) lives there and is intentionally NOT
 * duplicated here. PixelOffice stays a small, fixed-size flat diorama by design.
 *
 * Sprites are sourced from Pixel Agents (https://github.com/pablodelucca/pixel-agents)
 * by Pablo De Lucca, MIT-licensed. See `public/pixel-agents/ATTRIBUTION.md`
 * and `public/pixel-agents/LICENSE`. The PNGs are served from the artifact's
 * public/ directory and referenced through the artifact base URL so
 * preview-pane proxying still resolves them correctly.
 *
 * The scene is laid out on a fixed 16-tile-wide × 7-tile-tall room (each tile
 * 16px native) and scaled up via CSS transform so it looks crisp on retina
 * without blurring. We deliberately use `image-rendering: pixelated` so the
 * upscale stays blocky rather than smoothing the sprites.
 *
 * The character (char_0) is a 4×3 sprite sheet (4 walk frames × 3 directions:
 * down/up/right at 28×32 each). When not `playable`, he slowly auto-wanders the
 * floor; when `playable`, WASD / arrows / tap-to-move walk him around and
 * walking up to the desk computer + pressing E fires `onEnterTerminal`.
 *
 * 2.5D treatment: real 3D / isometric would need a sprite set we don't have, so
 * we layer perspective cues onto the same flat sprites — soft drop shadows under
 * furniture, a floor gradient that darkens toward the front edge, a ceiling
 * highlight band, and a corner vignette. Reads as depth without lying about
 * what the art actually is.
 */

const TILE = 16; // px native, before scale

interface PixelOfficeProps {
  /** Pixel scale-up factor. 3 → ~768×336 visible at the 16-col layout. */
  scale?: number;
  /**
   * If true, the character becomes PLAYER-CONTROLLED instead of auto-wandering:
   * WASD / arrow keys (and tap-to-move on touch) walk them around the office
   * floor in 2D. Walk up to the desk computer and press E (or tap the on-screen
   * prompt) to fire `onEnterTerminal`.
   */
  playable?: boolean;
  /** Fired when the player "uses" the desk computer (walks up + presses E). */
  onEnterTerminal?: () => void;
}

// Furniture placement on the 16-wide × 7-tall grid. Coordinates are tile
// indices; pixel offsets get computed at render time. `wTile`/`hTile` reflect
// the native sprite size in tiles so multi-tile pieces (DESK_FRONT 3×2, etc)
// land flush.
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

// Sprite sheet rows: 0=down, 1=up, 2=right.
const ROW_DOWN  = 0;
const ROW_UP    = 1;
const ROW_RIGHT = 2;
const FRAME_W = 28;
const FRAME_H = 32;

export function PixelOffice({
  scale = 3,
  playable = false,
  onEnterTerminal,
}: PixelOfficeProps) {
  const BASE = import.meta.env.BASE_URL ?? '/';
  const isTouch =
    typeof window !== 'undefined' &&
    (('ontouchstart' in window) || (navigator.maxTouchPoints ?? 0) > 0);

  const cols = 16;
  const rows = 7;
  const wallRows = 2;

  const widthPx  = cols * TILE * scale;
  const heightPx = rows * TILE * scale;

  const privateFurniture = buildPrivateFurniture(BASE);

  // Path endpoints (in native px) for the auto-wander — between the left and
  // right desks of the office.
  const charNativeY = 5 * TILE - (FRAME_H - TILE);
  const PATH_LEFT_X  = 3 * TILE + (TILE - FRAME_W) / 2 + TILE;
  const PATH_RIGHT_X = 10 * TILE + (TILE - FRAME_W) / 2 + TILE;

  // The interactable desk computer (playable mode). Native px; proximity is
  // measured from the player's feet/centre.
  const COMPUTER_X = 4.5 * TILE;
  const COMPUTER_Y = 5 * TILE;

  const [posX, setPosX] = useState<number>(PATH_LEFT_X);
  const [posY, setPosY] = useState<number>(charNativeY);
  const [walkFrame, setWalkFrame] = useState<number>(0);
  const [facing, setFacing] = useState<'right' | 'left' | 'down' | 'up'>('right');
  const [nearComputer, setNearComputer] = useState(false);

  // Player-controlled input refs (only used when `playable`): keyboard held set,
  // on-screen/touch direction flags, and the last-tapped floor target.
  const heldRef = useRef<Set<string>>(new Set());
  const touchDirRef = useRef({ up: false, down: false, left: false, right: false });
  const tapTargetRef = useRef<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scaleRef = useRef(scale);
  const nearComputerRef = useRef(false);
  const onEnterRef = useRef(onEnterTerminal);
  useEffect(() => {
    onEnterRef.current = onEnterTerminal;
  }, [onEnterTerminal]);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  // ── Auto-wander (non-playable) ──────────────────────────────────────────
  // The salaryman slowly walks back and forth across the office floor, pausing
  // briefly at each end. Walk frames only cycle while he's actually moving.
  useEffect(() => {
    if (playable) return;

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
  }, [playable, PATH_LEFT_X, PATH_RIGHT_X]);

  // ── Player-controlled movement loop ─────────────────────────────────────
  // Reads keyboard (WASD / arrows) + tap-to-move, walks the character in 2D
  // around the floor (bounded to the room), and tracks proximity to the desk
  // computer.
  useEffect(() => {
    if (!playable) return;

    const minX = 0;
    const maxX = cols * TILE - FRAME_W;
    const minY = (wallRows + 1) * TILE - FRAME_H; // feet just below the back wall
    const maxY = rows * TILE - FRAME_H;           // feet at the front edge
    const SPEED = 46;            // native px / sec
    const FRAME_PERIOD_MS = 130;

    let raf = 0;
    let last = performance.now();
    let frameAccum = 0;
    // Stealth/footstep cue: a quiet footfall every OTHER walk-frame advance, so
    // the sound is driven by actual movement cadence (subtle, never while idle).
    let footfall = false;
    // Spawn in the centre of the floor.
    let x = Math.round((cols / 2) * TILE - FRAME_W / 2);
    let y = charNativeY;
    setPosX(x);
    setPosY(y);

    const tick = (now: number) => {
      const dt = Math.min(50, Math.max(0, now - last));
      last = now;
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
        const nx = Math.max(minX, Math.min(maxX, x + vx * step));
        const ny = Math.max(minY, Math.min(maxY, y + vy * step));
        // A tap path that stalls against a wall is dropped so the character
        // doesn't march in place forever.
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

      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) e.preventDefault();
      if (key === 'e' || key === 'enter') {
        if (nearComputerRef.current) {
          onEnterRef.current?.();
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
  }, [playable, cols, rows, wallRows, charNativeY, COMPUTER_X, COMPUTER_Y]);

  const charSpriteRow =
    facing === 'down' ? ROW_DOWN
    : facing === 'up' ? ROW_UP
    : ROW_RIGHT;
  const charFlip = facing === 'left' ? 'scaleX(-1)' : 'none';

  // Native-pixel furniture renderer. Adds drop-shadow under each piece so the
  // flat sprites read as standing on a floor (2.5D cue #1).
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

  // Tap-to-move (mobile + pointer): translate a tap on the floor into a world
  // target the movement loop walks toward. Taps on buttons (the walk-up prompt)
  // are ignored so they still fire their own action.
  const handleFloorPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!playable) return;
    if ((e.target as HTMLElement).closest('button')) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const sc = scaleRef.current || 1;
    const worldX = (e.clientX - rect.left) / sc;
    const worldY = (e.clientY - rect.top) / sc;
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
        width: widthPx,
        height: heightPx,
        margin: '0 auto',
        imageRendering: 'pixelated',
        overflow: 'hidden',
        boxShadow: '0 0 0 1px rgba(56,189,248,.35), inset 0 0 24px rgba(0,16,24,.7)',
        background: '#000',
      }}
    >
      <style>{`@keyframes smCapsuleBreath{0%{transform:translateY(0)}50%{transform:translateY(1.5px)}100%{transform:translateY(0)}}`}</style>

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

      {/* Furniture layer. */}
      {privateFurniture.map((it, i) => renderFurniture(it, i, 'p'))}

      {/* Owner character — auto-wanders, or PLAYER-CONTROLLED (free 2D
          movement) when `playable`. */}
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
      </div>

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

      {/* Corner vignette (2.5D cue #4) — pulls focus to the centre and
          implies depth at the edges. */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)',
        zIndex: 199,
      }} />

      {/* Walk-up prompt — shown when standing on the desk computer. */}
      {playable && onEnterTerminal && nearComputer && (
        <button
          type="button"
          data-testid="office-computer-enter"
          onClick={() => onEnterTerminal?.()}
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
            font: 'bold .7rem "var(--font-sans)", monospace',
            letterSpacing: '.16em',
            cursor: 'pointer',
            zIndex: 220,
            boxShadow: '0 0 16px rgba(56,189,248,.6)',
            whiteSpace: 'nowrap',
          }}
        >
          ▸ ENTER TERMINAL{isTouch ? '' : ' · PRESS E'}
        </button>
      )}
    </div>
  );
}
