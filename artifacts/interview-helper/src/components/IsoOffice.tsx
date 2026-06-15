import React, { useEffect, useMemo, useRef, useState } from 'react';
import { type Appearance, drawPlayerSprite } from '@/lib/character-identity';
import type { OfficeStation, OfficeRoom, PixelOfficeBot } from '@/components/PixelOffice';
import { sfxStep } from '@/soundEngine';

/**
 * IsoOffice — an ISOMETRIC ("almost 3D") render of THE OFFICE, matching the
 * neon-noir concept art (a corner office above the city: angled floor, desks,
 * chairs and glowing monitors seen in 2:1 isometric, with a glass back-wall
 * looking out over a pixel skyline).
 *
 * It is a drop-in alternative to the flat top-down <PixelOffice> for the live
 * `/office` page. The LOGICAL world is unchanged: a `cols × rows` tile grid in
 * top-down "world px" (TILE = 16), and all gameplay math — movement, collision,
 * station proximity, the bullpen divider, executive rooms — runs in that same
 * top-down space exactly like PixelOffice. ONLY the rendering (and the tap
 * input, which inverts the iso projection) is isometric. That keeps the
 * established office behaviour intact while changing the look.
 *
 * Everything is drawn procedurally on a single <canvas> as shaded isometric
 * boxes (no isometric sprite set is needed), so the palette/lighting is fully
 * controllable and consistent. Characters are billboarded: the player uses the
 * SAME procedural paper-doll renderer (drawPlayerSprite) as the WorldPlay city
 * so the character looks identical everywhere; bots are simple hue-tinted
 * figures seated at their desks.
 */

const TILE = 16; // logical px per tile (top-down world units), same as PixelOffice
const FRAME_W = 28;
const FRAME_H = 32;
const WALL_ROWS = 2;

// Larger-floor layout, mirrored from PixelOffice's build-out so desk/bot/capsule
// placement lines up with what the page expects.
const BIG_DESK_COLS = [1, 5, 9, 13, 17];
const BIG_DESK_ROWS = [4, 7];

type DeskRect = { c: number; r: number; w: number; d: number; ci: number; ri: number };
function deskRects(shift: number): DeskRect[] {
  const out: DeskRect[] = [];
  BIG_DESK_ROWS.forEach((r, ri) =>
    BIG_DESK_COLS.forEach((c, ci) => out.push({ c: shift + c, r, w: 3, d: 2, ci, ri })),
  );
  return out;
}
function capsuleSpots(shift: number): { col: number }[] {
  const cols: { col: number }[] = [];
  for (let c = 0; c <= 22 - 2; c += 2) cols.push({ col: shift + c });
  return cols;
}

export interface IsoOfficeProps {
  scale?: number;
  bullpen?: boolean;
  activeBots?: PixelOfficeBot[];
  idleBots?: PixelOfficeBot[];
  playable?: boolean;
  onEnterTerminal?: () => void;
  appearance?: Appearance;
  costumeColor?: string | null;
  roomCols?: number;
  roomRows?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  stations?: OfficeStation[];
  frozen?: boolean;
  /** LIVE follows the player; SURVEILLANCE (false) fits the whole floor. */
  followCam?: boolean;
  rooms?: OfficeRoom[];
  doorTopRow?: number;
  doorBotRow?: number;
  /** Reserved for API parity with PixelOffice; iso is always the lit grade. */
  premium?: boolean;
  crtTint?: boolean;
  mode?: 'wander' | 'still' | 'at-desk';
}

interface Vec2 { x: number; y: number }

// hsl helper for bot tints
function botColor(id: number, l = 55): string {
  const hue = (id * 47) % 360;
  return `hsl(${hue} 62% ${l}%)`;
}

export function IsoOffice({
  scale = 3,
  bullpen = false,
  activeBots = [],
  idleBots = [],
  playable = false,
  onEnterTerminal,
  appearance,
  costumeColor,
  roomCols = 22,
  roomRows = 11,
  viewportWidth,
  viewportHeight,
  stations = [],
  frozen = false,
  followCam = false,
  rooms = [],
  doorTopRow: doorTopRowProp,
  doorBotRow: doorBotRowProp,
}: IsoOfficeProps) {
  const isTouch =
    typeof window !== 'undefined' &&
    (('ontouchstart' in window) || (navigator.maxTouchPoints ?? 0) > 0);

  const leftCols = roomCols;
  const dividerCols = bullpen ? 1 : 0;
  const rightCols = bullpen ? roomCols : 0;
  const cols = leftCols + dividerCols + rightCols;
  const rows = roomRows;
  const bullpenShift = leftCols + dividerCols;

  const doorTopRow = doorTopRowProp ?? (rows - 3);
  const doorBotRow = doorBotRowProp ?? (rows - 1);

  const worldW = cols * TILE;
  const worldH = rows * TILE;

  // Interior executive-office walls → blocked tile set (col,row), same algo as
  // PixelOffice so collision is identical.
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

  const deskRowDesks = useMemo(() => deskRects(0), []);
  const bullpenDesks = useMemo(() => (bullpen ? deskRects(bullpenShift) : []), [bullpen, bullpenShift]);
  const capSpots = useMemo(() => (bullpen ? capsuleSpots(bullpenShift) : []), [bullpen, bullpenShift]);

  // Seated bots fill bullpen desks (front-centre); idle bots fill capsules.
  const seatedBots = useMemo(
    () => activeBots.filter((b) => (b.status ?? '').toLowerCase() === 'active').slice(0, bullpenDesks.length),
    [activeBots, bullpenDesks.length],
  );
  const seatedIds = useMemo(() => new Set(seatedBots.map((b) => b.id)), [seatedBots]);
  const sleepingBots = useMemo(
    () => idleBots.filter((b) => !seatedIds.has(b.id)).slice(0, capSpots.length),
    [idleBots, seatedIds, capSpots.length],
  );

  // Desk computer (LEFT private office) + spawn point.
  const COMPUTER_X = 4.5 * TILE;
  const COMPUTER_Y = 5 * TILE;

  // ── Refs the rAF loop reads (so the loop never restarts on prop churn) ──
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fxRef = useRef<number>(
    Math.round((bullpen ? bullpenShift + rightCols / 2 : cols / 2) * TILE),
  );
  const fyRef = useRef<number>(Math.round((rows - 3) * TILE));
  const facingRef = useRef<'left' | 'right'>('right');
  const walkRef = useRef(0); // 0..1 walk phase for a tiny bob
  const heldRef = useRef<Set<string>>(new Set());
  const tapTargetRef = useRef<Vec2 | null>(null);
  const frozenRef = useRef(frozen);
  const scaleRef = useRef(scale);
  const followRef = useRef(followCam);
  const viewWRef = useRef(viewportWidth ?? 800);
  const viewHRef = useRef(viewportHeight ?? 480);
  const offRef = useRef<Vec2>({ x: 0, y: 0 });
  const nearComputerRef = useRef(false);
  const activeStationRef = useRef<string | null>(null);
  const onEnterRef = useRef(onEnterTerminal);
  const stationsRef = useRef<OfficeStation[]>(stations);
  const blockedRef = useRef(blockedTiles);
  const seatedRef = useRef(seatedBots);
  const sleepingRef = useRef(sleepingBots);
  const roomsRef = useRef(rooms);
  const appearanceRef = useRef(appearance);
  const costumeRef = useRef(costumeColor);
  const bullpenDesksRef = useRef(bullpenDesks);
  const leftDesksRef = useRef(deskRowDesks);
  const capSpotsRef = useRef(capSpots);

  const [nearComputer, setNearComputer] = useState(false);
  const [activeStationId, setActiveStationId] = useState<string | null>(null);

  useEffect(() => { frozenRef.current = frozen; if (frozen) { heldRef.current.clear(); tapTargetRef.current = null; } }, [frozen]);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { followRef.current = followCam; }, [followCam]);
  useEffect(() => { onEnterRef.current = onEnterTerminal; }, [onEnterTerminal]);
  useEffect(() => { stationsRef.current = stations; }, [stations]);
  useEffect(() => { blockedRef.current = blockedTiles; }, [blockedTiles]);
  useEffect(() => { seatedRef.current = seatedBots; }, [seatedBots]);
  useEffect(() => { sleepingRef.current = sleepingBots; }, [sleepingBots]);
  useEffect(() => { roomsRef.current = rooms; }, [rooms]);
  useEffect(() => { appearanceRef.current = appearance; }, [appearance]);
  useEffect(() => { costumeRef.current = costumeColor; }, [costumeColor]);
  useEffect(() => { bullpenDesksRef.current = bullpenDesks; }, [bullpenDesks]);
  useEffect(() => { leftDesksRef.current = deskRowDesks; }, [deskRowDesks]);
  useEffect(() => { capSpotsRef.current = capSpots; }, [capSpots]);
  useEffect(() => { if (viewportWidth) viewWRef.current = viewportWidth; }, [viewportWidth]);
  useEffect(() => { if (viewportHeight) viewHRef.current = viewportHeight; }, [viewportHeight]);

  // ── Main render + movement loop ─────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();
    let frameAccum = 0;
    let footfall = false;
    const SPEED = 46; // world px / sec
    const FRAME_PERIOD_MS = 130;

    // Projection: 2:1 isometric. T = on-screen px per logical tile-axis.
    const proj = (tx: number, ty: number, T: number, off: Vec2): Vec2 => ({
      x: off.x + (tx - ty) * (T * 0.5),
      y: off.y + (tx + ty) * (T * 0.25),
    });
    const heightPx = (h: number, T: number) => h * (T / TILE) * 0.62; // logical height → screen px

    const tick = (now: number) => {
      const dt = Math.min(50, Math.max(0, now - last));
      last = now;

      const S = scaleRef.current || 1;
      const T = TILE * S; // px per tile-axis
      const HW = T * 0.5;
      const HH = T * 0.25;
      const viewW = viewWRef.current;
      const viewH = viewHRef.current;
      const dpr = Math.min(2, window.devicePixelRatio || 1);

      // Resize backing store if needed.
      if (canvas.width !== Math.round(viewW * dpr) || canvas.height !== Math.round(viewH * dpr)) {
        canvas.width = Math.round(viewW * dpr);
        canvas.height = Math.round(viewH * dpr);
        canvas.style.width = `${viewW}px`;
        canvas.style.height = `${viewH}px`;
      }

      // ── Movement (skipped when frozen / not playable) ──
      if (playable && !frozenRef.current) {
        const k = heldRef.current;
        let dx = 0, dy = 0;
        if (k.has('a') || k.has('arrowleft')) dx -= 1;
        if (k.has('d') || k.has('arrowright')) dx += 1;
        if (k.has('w') || k.has('arrowup')) dy -= 1;
        if (k.has('s') || k.has('arrowdown')) dy += 1;
        if (dx !== 0 || dy !== 0) tapTargetRef.current = null;

        let vx = dx, vy = dy, moving = dx !== 0 || dy !== 0;
        if (!moving && tapTargetRef.current) {
          const ddx = tapTargetRef.current.x - fxRef.current;
          const ddy = tapTargetRef.current.y - fyRef.current;
          const dist = Math.hypot(ddx, ddy);
          if (dist <= 2) tapTargetRef.current = null;
          else { vx = ddx / dist; vy = ddy / dist; moving = true; }
        }

        if (moving) {
          const norm = (dx !== 0 && dy !== 0 && !tapTargetRef.current) ? Math.SQRT1_2 : 1;
          // tap vectors are already unit; key diagonals get SQRT1_2
          const isTap = !!tapTargetRef.current;
          const stepInv = (!isTap && dx !== 0 && dy !== 0) ? Math.SQRT1_2 : 1;
          const step = SPEED * (dt / 1000) * (isTap ? 1 : stepInv) * (norm === norm ? 1 : 1);
          let nx = fxRef.current + vx * step;
          let ny = fyRef.current + vy * step;
          nx = Math.max(TILE * 0.5, Math.min(worldW - TILE * 0.5, nx));
          ny = Math.max(WALL_ROWS * TILE + TILE * 0.3, Math.min(worldH - TILE * 0.4, ny));

          // Bullpen divider — only crossable through the door band.
          if (bullpen) {
            const dividerCenter = (leftCols + 0.5) * TILE;
            const inDoor = ny >= doorTopRow * TILE && ny <= doorBotRow * TILE;
            if (!inDoor) {
              if ((fxRef.current - dividerCenter) * (nx - dividerCenter) <= 0) nx = fxRef.current;
            }
          }
          // Interior exec walls — per-axis tile collision (slide).
          const bset = blockedRef.current;
          if (bset.size) {
            const col = (px: number) => Math.floor(px / TILE);
            const row = (py: number) => Math.floor(py / TILE);
            if (bset.has(`${col(nx)},${row(fyRef.current)}`)) nx = fxRef.current;
            if (bset.has(`${col(nx)},${row(ny)}`)) ny = fyRef.current;
          }
          if (Math.abs(nx - fxRef.current) < 0.05 && Math.abs(ny - fyRef.current) < 0.05) {
            tapTargetRef.current = null;
          }
          if (Math.abs(vx) > 0.01) facingRef.current = vx > 0 ? 'right' : 'left';
          fxRef.current = nx;
          fyRef.current = ny;
          frameAccum += dt;
          if (frameAccum >= FRAME_PERIOD_MS) {
            frameAccum = 0;
            walkRef.current = walkRef.current > 0 ? 0 : 1;
            footfall = !footfall;
            if (footfall) sfxStep(0.4, 165 + Math.random() * 50);
          }
        } else {
          walkRef.current = 0;
        }

        // Proximity — computer + nearest station (world-space, same as PixelOffice).
        const cx = fxRef.current;
        const cy = fyRef.current;
        if (onEnterRef.current) {
          const near = Math.hypot(cx - COMPUTER_X, cy - COMPUTER_Y) <= 26;
          if (near !== nearComputerRef.current) { nearComputerRef.current = near; setNearComputer(near); }
        }
        let bestId: string | null = null;
        let bestDist = Infinity;
        for (const st of stationsRef.current) {
          const wTiles = st.art ? st.art.wTiles : 1.4;
          const hTiles = st.art ? st.art.hTiles : 1.6;
          const sx = (st.col + wTiles / 2) * TILE;
          const sy = (st.row + hTiles) * TILE;
          const d = Math.hypot(cx - sx, cy - sy);
          if (d <= (st.radius ?? 26) && d < bestDist) { bestDist = d; bestId = st.id; }
        }
        if (bestId !== activeStationRef.current) { activeStationRef.current = bestId; setActiveStationId(bestId); }
      }

      // ── Camera offset ──
      let off: Vec2;
      if (playable && followRef.current) {
        const ptx = fxRef.current / TILE;
        const pty = fyRef.current / TILE;
        const p = proj(ptx, pty, T, { x: 0, y: 0 });
        off = { x: viewW / 2 - p.x, y: viewH / 2 - p.y - T * 0.4 };
      } else {
        // Fit whole floor: centre the iso bounding box.
        const corners = [proj(0, 0, T, { x: 0, y: 0 }), proj(cols, 0, T, { x: 0, y: 0 }), proj(0, rows, T, { x: 0, y: 0 }), proj(cols, rows, T, { x: 0, y: 0 })];
        const minX = Math.min(...corners.map((c) => c.x));
        const maxX = Math.max(...corners.map((c) => c.x));
        const minY = Math.min(...corners.map((c) => c.y)) - T * 1.2; // headroom for walls
        const maxY = Math.max(...corners.map((c) => c.y));
        off = { x: viewW / 2 - (minX + maxX) / 2, y: viewH / 2 - (minY + maxY) / 2 };
      }
      offRef.current = off;

      // ── Draw ──
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, viewW, viewH);
      ctx.imageSmoothingEnabled = false;

      const P = (tx: number, ty: number) => proj(tx, ty, T, off);

      drawScene(ctx, {
        P, HW, HH, T, heightPx: (h: number) => heightPx(h, T),
        cols, rows, leftCols, bullpen, bullpenShift, rightCols,
        doorTopRow, doorBotRow,
        leftDesks: leftDesksRef.current,
        bullpenDesks: bullpenDesksRef.current,
        capSpots: capSpotsRef.current,
        seated: seatedRef.current,
        sleeping: sleepingRef.current,
        rooms: roomsRef.current,
        stations: stationsRef.current,
        activeStationId: activeStationRef.current,
        playable,
        fx: fxRef.current, fy: fyRef.current,
        facing: facingRef.current,
        walk: walkRef.current,
        appearance: appearanceRef.current,
        costume: costumeRef.current ?? null,
        S, now,
        showComputer: !!onEnterRef.current,
        nearComputer: nearComputerRef.current,
        computerX: COMPUTER_X, computerY: COMPUTER_Y,
      });

      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);

    const onKeyDown = (e: KeyboardEvent) => {
      if (frozenRef.current || !playable) return;
      const key = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) e.preventDefault();
      if (key === 'e' || key === 'enter') {
        if (nearComputerRef.current) { onEnterRef.current?.(); return; }
        const sid = activeStationRef.current;
        if (sid) { stationsRef.current.find((s) => s.id === sid)?.onInteract(); return; }
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
  }, [playable, bullpen, cols, rows, leftCols, bullpenShift, rightCols, doorTopRow, doorBotRow, worldW, worldH]);

  // ── Tap-to-move: invert the iso projection (screen → world foot) ──
  const handlePointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!playable || frozenRef.current) return;
    if ((e.target as HTMLElement).closest('button')) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const S = scaleRef.current || 1;
    const T = TILE * S;
    const off = offRef.current;
    const sx = e.clientX - rect.left - off.x;
    const sy = e.clientY - rect.top - off.y;
    const tx = (sx / (T * 0.5) + sy / (T * 0.25)) / 2;
    const ty = (sy / (T * 0.25) - sx / (T * 0.5)) / 2;
    const wx = Math.max(TILE * 0.5, Math.min(worldW - TILE * 0.5, tx * TILE));
    const wy = Math.max(WALL_ROWS * TILE + TILE * 0.3, Math.min(worldH - TILE * 0.4, ty * TILE));
    tapTargetRef.current = { x: wx, y: wy };
  };

  const promptStation = !nearComputer && activeStationId
    ? stations.find((s) => s.id === activeStationId)
    : undefined;
  const showComputerPrompt = !!onEnterTerminal && nearComputer;

  return (
    <div
      data-testid="pixel-office"
      ref={containerRef}
      onPointerDown={handlePointer}
      style={{
        position: 'relative',
        width: viewportWidth ?? '100%',
        height: viewportHeight ?? '100%',
        margin: '0 auto',
        overflow: 'hidden',
        background: 'radial-gradient(130% 110% at 50% 0%, #1a0d3a 0%, #0a0719 52%, #04030d 100%)',
        boxShadow: '0 0 0 1px rgba(150,120,255,.30), inset 0 0 90px rgba(8,4,26,.85)',
        cursor: playable ? 'pointer' : 'default',
      }}
    >
      <canvas ref={canvasRef} style={{ display: 'block', imageRendering: 'pixelated' }} />

      {/* Corner vignette + scene tint (screen-space). */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at 50% 42%, transparent 56%, rgba(8,4,22,0.62) 100%)',
        zIndex: 5,
      }} />

      {/* Room labels. */}
      {bullpen && (
        <>
          <div style={labelStyle('left')}>▸ PRIVATE</div>
          <div style={labelStyle('right')}>BOT BULLPEN ◂</div>
        </>
      )}

      {/* Walk-up prompt — computer takes precedence; else nearest station. */}
      {playable && !frozen && (showComputerPrompt || promptStation) && (
        <button
          type="button"
          data-testid={showComputerPrompt ? 'office-computer-enter' : `office-station-${promptStation?.id}`}
          onClick={showComputerPrompt ? () => onEnterTerminal?.() : () => promptStation?.onInteract()}
          style={{
            position: 'absolute', left: '50%', bottom: 14, transform: 'translateX(-50%)',
            padding: '.5rem .9rem',
            background: 'linear-gradient(135deg, rgba(236,72,153,.92), rgba(56,189,248,.82))',
            border: '1px solid rgba(244,180,255,.95)', borderRadius: 6, color: '#0a0414',
            font: 'bold .7rem "Share Tech Mono", monospace', letterSpacing: '.16em',
            cursor: 'pointer', zIndex: 30, boxShadow: '0 0 18px rgba(236,72,153,.55)', whiteSpace: 'nowrap',
          }}
        >
          ▸ {showComputerPrompt ? 'ENTER TERMINAL' : promptStation?.label}{isTouch ? '' : ' · PRESS E'}
        </button>
      )}
    </div>
  );
}

function labelStyle(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute',
    [side]: 8, bottom: 6,
    fontFamily: '"Share Tech Mono", "VT323", monospace',
    fontSize: 11,
    color: side === 'left' ? 'rgba(244,180,255,0.9)' : 'rgba(150,230,255,0.9)',
    textShadow: '0 0 6px rgba(0,0,0,0.9)',
    letterSpacing: '0.22em',
    zIndex: 6, pointerEvents: 'none',
  };
}

// ── Scene drawing ─────────────────────────────────────────────────────────
interface SceneCtx {
  P: (tx: number, ty: number) => Vec2;
  HW: number; HH: number; T: number;
  heightPx: (h: number) => number;
  cols: number; rows: number; leftCols: number;
  bullpen: boolean; bullpenShift: number; rightCols: number;
  doorTopRow: number; doorBotRow: number;
  leftDesks: DeskRect[]; bullpenDesks: DeskRect[]; capSpots: { col: number }[];
  seated: PixelOfficeBot[]; sleeping: PixelOfficeBot[];
  rooms: OfficeRoom[]; stations: OfficeStation[]; activeStationId: string | null;
  playable: boolean;
  fx: number; fy: number; facing: 'left' | 'right'; walk: number;
  appearance?: Appearance; costume: string | null;
  S: number; now: number;
  showComputer: boolean; nearComputer: boolean; computerX: number; computerY: number;
}

function drawScene(ctx: CanvasRenderingContext2D, s: SceneCtx) {
  const { P, heightPx, cols, rows, T } = s;

  // ---- Floor ----
  // Solid base quad.
  const fA = P(0, 0), fB = P(cols, 0), fC = P(cols, rows), fD = P(0, rows);
  ctx.beginPath();
  ctx.moveTo(fA.x, fA.y); ctx.lineTo(fB.x, fB.y); ctx.lineTo(fC.x, fC.y); ctx.lineTo(fD.x, fD.y); ctx.closePath();
  const fg = ctx.createLinearGradient(fA.x, fA.y, fC.x, fC.y);
  fg.addColorStop(0, '#241140');
  fg.addColorStop(0.55, '#1a0f33');
  fg.addColorStop(1, '#120b26');
  ctx.fillStyle = fg;
  ctx.fill();

  // Grid lines.
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(150,110,230,0.13)';
  for (let c = 0; c <= cols; c++) { const a = P(c, 0), b = P(c, rows); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  for (let r = 0; r <= rows; r++) { const a = P(0, r), b = P(cols, r); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }

  // Neon floor rim along the two FRONT edges.
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(236,72,153,0.55)';
  ctx.beginPath(); ctx.moveTo(fD.x, fD.y); ctx.lineTo(fC.x, fC.y); ctx.lineTo(fB.x, fB.y); ctx.stroke();

  // ---- Back walls (glass + city skyline) ----
  drawCityWall(ctx, s, 'right'); // along (0,0)->(cols,0)
  drawCityWall(ctx, s, 'left');  // along (0,0)->(0,rows)

  // ---- Divider wall ----
  if (s.bullpen) drawDividerWall(ctx, s);

  // ---- Depth-sorted entities ----
  type Drawable = { depth: number; fn: () => void };
  const items: Drawable[] = [];
  const push = (tx: number, ty: number, fn: () => void) => items.push({ depth: tx + ty, fn });

  // Exec rooms (low walls + nameplate) — draw walls as part of sorted set by their front row.
  for (const room of s.rooms) {
    push(room.x + room.w, room.y + room.h, () => drawExecRoom(ctx, s, room));
  }

  // Desks (both rooms). Left room = player's private (empty desks); right = bullpen (bots).
  for (const d of s.leftDesks) push(d.c + d.w, d.r + d.d, () => drawDesk(ctx, s, d, '#e9d8ff', '#c9a8ff'));
  for (const d of s.bullpenDesks) push(d.c + d.w, d.r + d.d, () => drawDesk(ctx, s, d, '#ffd9b0', '#e0a878'));

  // Capsules (idle bots) along bullpen back wall.
  s.sleeping.forEach((bot, i) => {
    const spot = s.capSpots[i]; if (!spot) return;
    push(spot.col + 1, 1.4, () => drawCapsule(ctx, s, spot.col, bot, i));
  });

  // Seated bots at bullpen desks.
  s.seated.forEach((bot, i) => {
    const d = s.bullpenDesks[i]; if (!d) return;
    const tx = d.c + d.w / 2, ty = d.r + d.d + 0.25;
    push(tx, ty + 0.1, () => drawBot(ctx, s, tx, ty, bot));
  });

  // Stations.
  for (const st of s.stations) {
    const wTiles = st.art ? st.art.wTiles : 1.4;
    const hTiles = st.art ? st.art.hTiles : 1.6;
    const tx = st.col + wTiles / 2, ty = st.row + hTiles;
    push(tx, ty, () => drawStation(ctx, s, st, tx, ty));
  }

  // Desk-computer marker (private office).
  if (s.showComputer) {
    const tx = s.computerX / TILE, ty = s.computerY / TILE;
    push(tx, ty - 0.2, () => drawComputerMarker(ctx, s, tx, ty));
  }

  // Player.
  if (s.playable) {
    const tx = s.fx / TILE, ty = s.fy / TILE;
    push(tx, ty + 0.2, () => drawPlayer(ctx, s, tx, ty));
  }

  items.sort((a, b) => a.depth - b.depth);
  for (const it of items) it.fn();
}

// Filled quad helper.
function quad(ctx: CanvasRenderingContext2D, p: Vec2[], fill: string, stroke?: string) {
  ctx.beginPath();
  ctx.moveTo(p[0].x, p[0].y);
  for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

// Isometric box: tile rect (c,r) size (w,d), logical height h. Colors for the
// three visible faces.
function isoBox(
  ctx: CanvasRenderingContext2D, s: SceneCtx,
  c: number, r: number, w: number, d: number, hLogical: number,
  top: string, leftF: string, rightF: string, stroke?: string,
) {
  const { P } = s;
  const h = s.heightPx(hLogical);
  const A = P(c, r), B = P(c + w, r), C = P(c + w, r + d), D = P(c, r + d);
  const At = { x: A.x, y: A.y - h }, Bt = { x: B.x, y: B.y - h }, Ct = { x: C.x, y: C.y - h }, Dt = { x: D.x, y: D.y - h };
  // left face (D-C base, front-left), right face (B-C base, front-right)
  quad(ctx, [D, C, Ct, Dt], leftF, stroke);
  quad(ctx, [B, C, Ct, Bt], rightF, stroke);
  quad(ctx, [At, Bt, Ct, Dt], top, stroke);
}

function drawDesk(ctx: CanvasRenderingContext2D, s: SceneCtx, d: DeskRect, topCol: string, sideCol: string) {
  // Desk surface block.
  isoBox(ctx, s, d.c, d.r, d.w, d.d, 9, topCol, shade(sideCol, -18), shade(sideCol, -6), 'rgba(20,8,30,0.5)');
  // Monitor at back-centre, glowing.
  const mc = d.c + d.w / 2 - 0.45, mr = d.r + 0.15;
  isoBox(ctx, s, mc, mr, 0.9, 0.45, 16, '#0a141f', '#10202e', '#16303f');
  // glowing screen face
  const { P } = s;
  const h0 = s.heightPx(9);
  const h1 = s.heightPx(16);
  const B = P(mc + 0.9, mr), C = P(mc + 0.9, mr + 0.45);
  const Bt = { x: B.x, y: B.y - h1 }, Ct = { x: C.x, y: C.y - h1 };
  const Bb = { x: B.x, y: B.y - h0 }, Cb = { x: C.x, y: C.y - h0 };
  quad(ctx, [Bb, Cb, Ct, Bt], 'rgba(90,220,255,0.9)');
  ctx.save();
  ctx.shadowColor = 'rgba(90,220,255,0.9)'; ctx.shadowBlur = 10 * (s.T / TILE) * 0.5;
  quad(ctx, [Bb, Cb, Ct, Bt], 'rgba(120,230,255,0.35)');
  ctx.restore();
  // Chair in front of the desk.
  drawChair(ctx, s, d.c + d.w / 2 - 0.4, d.r + d.d + 0.15);
}

function drawChair(ctx: CanvasRenderingContext2D, s: SceneCtx, c: number, r: number) {
  isoBox(ctx, s, c, r, 0.8, 0.8, 5, '#d8623a', '#a8432a', '#c25234'); // seat
  isoBox(ctx, s, c, r, 0.8, 0.2, 12, '#e0764a', '#b04a2c', '#cc5e38'); // back
}

function drawBot(ctx: CanvasRenderingContext2D, s: SceneCtx, tx: number, ty: number, bot: PixelOfficeBot) {
  const { P } = s;
  const p = P(tx, ty);
  const u = (s.T / TILE); // px per logical px
  const bob = Math.sin(s.now / 600 + bot.id) * 1.2;
  const col = bot.teamColor ?? botColor(bot.id);
  // shadow
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.ellipse(p.x, p.y, 7 * u * 0.5, 3.2 * u * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  const baseY = p.y + bob;
  // body
  ctx.fillStyle = col;
  rrect(ctx, p.x - 4 * u * 0.5, baseY - 16 * u * 0.5, 8 * u * 0.5, 13 * u * 0.5, 2 * u * 0.5);
  // head
  ctx.fillStyle = '#f1c9a5';
  ctx.beginPath(); ctx.arc(p.x, baseY - 18 * u * 0.5, 3.4 * u * 0.5, 0, Math.PI * 2); ctx.fill();
  // name plate
  ctx.fillStyle = bot.teamColor ?? 'rgba(180,255,220,0.85)';
  ctx.font = `${Math.max(7, 4 * u * 0.5)}px "Share Tech Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(bot.name.slice(0, 8).toUpperCase(), p.x, baseY + 6 * u * 0.5);
  ctx.textAlign = 'left';
}

function drawPlayer(ctx: CanvasRenderingContext2D, s: SceneCtx, tx: number, ty: number) {
  const { P } = s;
  const p = P(tx, ty);
  const u = (s.T / TILE);
  const spriteScale = u * 0.95; // paper-doll is ~28px wide
  const bob = s.walk ? -1.2 : 0;
  // shadow
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath(); ctx.ellipse(p.x, p.y, 8 * u * 0.5, 3.4 * u * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (s.appearance) {
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.scale(s.facing === 'left' ? -spriteScale : spriteScale, spriteScale);
    // drawPlayerSprite draws around (0,0) with feet ~+11; lift so feet land on p.y
    ctx.translate(0, -11);
    drawPlayerSprite(ctx, s.appearance, { costumeColor: s.costume });
    ctx.restore();
  } else {
    ctx.fillStyle = '#ffd24a';
    rrect(ctx, p.x - 4 * u * 0.5, p.y - 18 * u * 0.5, 8 * u * 0.5, 15 * u * 0.5, 2);
  }
  // golden ground glow
  ctx.save();
  ctx.strokeStyle = 'rgba(255,215,90,0.6)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(p.x, p.y, 8 * u * 0.5, 3.4 * u * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function drawStation(ctx: CanvasRenderingContext2D, s: SceneCtx, st: OfficeStation, tx: number, ty: number) {
  const active = s.playable && s.activeStationId === st.id;
  const accent = active ? '#aef3ff' : 'rgba(150,200,225,0.85)';
  // little kiosk
  isoBox(ctx, s, tx - 0.6, ty - 0.6, 1.2, 1.0, 13, active ? '#1d3550' : '#16283c', '#0e1c2c', '#13283c', active ? 'rgba(90,220,255,0.9)' : 'rgba(40,90,120,0.6)');
  // glyph dot
  const { P } = s;
  const top = P(tx, ty - 0.1);
  ctx.save();
  if (active) { ctx.shadowColor = 'rgba(90,220,255,0.9)'; ctx.shadowBlur = 14; }
  ctx.fillStyle = active ? '#7fe9ff' : '#3a90b8';
  ctx.beginPath(); ctx.arc(top.x, top.y - s.heightPx(15), 3 * (s.T / TILE) * 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // label
  ctx.fillStyle = accent;
  ctx.font = `${Math.max(8, 4.2 * (s.T / TILE) * 0.5)}px "Share Tech Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.fillText((active ? '▸ ' : '') + st.label, top.x, top.y - s.heightPx(15) - 8 * (s.T / TILE) * 0.5);
  ctx.textAlign = 'left';
}

function drawComputerMarker(ctx: CanvasRenderingContext2D, s: SceneCtx, tx: number, ty: number) {
  const { P } = s;
  const p = P(tx, ty);
  const u = (s.T / TILE) * 0.5;
  const t = (Math.sin(s.now / 400) + 1) / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(90,220,255,0.9)'; ctx.shadowBlur = 8 + t * 6;
  ctx.fillStyle = `rgba(120,230,255,${0.7 + t * 0.3})`;
  ctx.font = `${Math.max(12, 8 * u)}px serif`;
  ctx.textAlign = 'center';
  ctx.fillText('💻', p.x, p.y - s.heightPx(20));
  ctx.restore();
  ctx.textAlign = 'left';
}

function drawCapsule(ctx: CanvasRenderingContext2D, s: SceneCtx, col: number, bot: PixelOfficeBot, i: number) {
  const { P } = s;
  const tx = col + 0.5, ty = 1.0;
  const p = P(tx, ty);
  const u = (s.T / TILE) * 0.5;
  const pulse = (Math.sin(s.now / 900 + i) + 1) / 2;
  const accent = bot.teamColor ?? 'rgba(140,210,255,0.8)';
  // pod
  ctx.save();
  ctx.shadowColor = accent; ctx.shadowBlur = 6 + pulse * 8;
  const g = ctx.createLinearGradient(p.x, p.y - s.heightPx(22), p.x, p.y);
  g.addColorStop(0, 'rgba(60,90,150,0.7)');
  g.addColorStop(1, 'rgba(15,30,55,0.85)');
  ctx.fillStyle = g;
  rrect(ctx, p.x - 7 * u, p.y - s.heightPx(22), 14 * u, s.heightPx(22), 6 * u);
  ctx.restore();
  ctx.strokeStyle = accent; ctx.lineWidth = 1;
  rrectStroke(ctx, p.x - 7 * u, p.y - s.heightPx(22), 14 * u, s.heightPx(22), 6 * u);
  // dim sleeping figure
  ctx.fillStyle = `${typeof accent === 'string' ? 'rgba(120,160,210,0.5)' : accent}`;
  ctx.beginPath(); ctx.arc(p.x, p.y - s.heightPx(14), 3 * u, 0, Math.PI * 2); ctx.fill();
  // name + zzz
  ctx.fillStyle = bot.teamColor ?? 'rgba(140,200,255,0.8)';
  ctx.font = `${Math.max(7, 3.4 * u)}px "Share Tech Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(`${bot.name.slice(0, 6).toUpperCase()} 💤`, p.x, p.y + 8 * u);
  ctx.textAlign = 'left';
}

function drawExecRoom(ctx: CanvasRenderingContext2D, s: SceneCtx, room: OfficeRoom) {
  const accent = room.accent ?? '#c4b5fd';
  // rug
  const { P } = s;
  const A = P(room.x, room.y), B = P(room.x + room.w, room.y), C = P(room.x + room.w, room.y + room.h), D = P(room.x, room.y + room.h);
  quad(ctx, [A, B, C, D], hexA(accent, 0.10));
  // low back + side walls (thin iso boxes)
  isoBox(ctx, s, room.x, room.y, room.w, 0.25, 14, hexA(accent, 0.25), 'rgba(20,12,40,0.85)', 'rgba(30,18,55,0.8)');
  isoBox(ctx, s, room.x, room.y, 0.25, room.h, 14, hexA(accent, 0.2), 'rgba(20,12,40,0.85)', 'rgba(28,16,50,0.8)');
  // glass front partition (low) — skip door gap visually with a lighter band
  isoBox(ctx, s, room.x, room.y + room.h - 0.25, room.w, 0.25, 6, hexA(accent, 0.35), hexA(accent, 0.18), hexA(accent, 0.12));
  // nameplate
  const top = P(room.x + room.w / 2, room.y);
  ctx.fillStyle = accent;
  ctx.font = `${Math.max(8, 4.4 * (s.T / TILE) * 0.5)}px "Share Tech Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.fillText((room.label ?? 'OFFICE').toUpperCase(), top.x, top.y - s.heightPx(16));
  if (room.sub) {
    ctx.fillStyle = 'rgba(200,210,255,0.7)';
    ctx.font = `${Math.max(6, 3 * (s.T / TILE) * 0.5)}px "Share Tech Mono", monospace`;
    ctx.fillText(room.sub.toUpperCase(), top.x, top.y - s.heightPx(16) + 9 * (s.T / TILE) * 0.5);
  }
  ctx.textAlign = 'left';
  // occupant
  if (room.occupantSeed != null) {
    const c = room.x + room.w / 2, r = room.y + room.h - 0.8;
    drawBot(ctx, s, c, r, { id: room.occupantSeed, name: room.label ?? '', status: 'active', teamColor: accent });
  }
}

function drawCityWall(ctx: CanvasRenderingContext2D, s: SceneCtx, side: 'left' | 'right') {
  const { P, cols, rows } = s;
  const WALL_H = 4.2; // logical tiles tall
  const h = s.heightPx(WALL_H * TILE);
  // base edge: right wall runs (0,0)->(cols,0); left wall runs (0,0)->(0,rows)
  const e0 = side === 'right' ? P(0, 0) : P(0, rows);
  const e1 = side === 'right' ? P(cols, 0) : P(0, 0);
  const t0 = { x: e0.x, y: e0.y - h };
  const t1 = { x: e1.x, y: e1.y - h };
  // wall plane
  const wallGrad = ctx.createLinearGradient(0, t0.y, 0, e0.y);
  wallGrad.addColorStop(0, '#0c0a1f');
  wallGrad.addColorStop(1, '#070612');
  quad(ctx, [e0, e1, t1, t0], wallGrad);

  // City skyline behind glass — clip to the wall quad, scatter window lights.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(e0.x, e0.y); ctx.lineTo(e1.x, e1.y); ctx.lineTo(t1.x, t1.y); ctx.lineTo(t0.x, t0.y); ctx.closePath();
  ctx.clip();
  // distant buildings (deterministic): bars from base up to varying heights
  const span = side === 'right' ? cols : rows;
  const cols2 = side === 'right' ? cols : 0;
  const rows2 = side === 'right' ? 0 : rows;
  // walk along the base edge in sub-steps; draw vertical light dots
  const STEPS = Math.max(24, Math.floor(span * 2));
  for (let i = 0; i < STEPS; i++) {
    const f = i / STEPS;
    const base = side === 'right' ? P(f * cols2, 0) : P(0, f * rows2);
    const seed = (i * 928371 + (side === 'right' ? 13 : 71)) % 1000 / 1000;
    const bh = h * (0.25 + seed * 0.6);
    // building silhouette
    ctx.fillStyle = `rgba(${20 + seed * 20},${16 + seed * 24},${40 + seed * 40},0.9)`;
    ctx.fillRect(base.x - 2, base.y - bh, 5, bh);
    // window dots
    const winN = Math.floor(bh / 6);
    for (let w = 0; w < winN; w++) {
      const lit = ((i * 7 + w * 13) % 5) < 2;
      if (!lit) continue;
      ctx.fillStyle = ((i + w) % 3 === 0) ? 'rgba(120,230,255,0.85)' : 'rgba(255,200,120,0.8)';
      ctx.fillRect(base.x - 1 + ((w % 2) * 2), base.y - 4 - w * 6, 1.4, 1.4);
    }
  }
  ctx.restore();

  // neon top trim
  ctx.strokeStyle = side === 'right' ? 'rgba(120,230,255,0.7)' : 'rgba(236,72,153,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(t0.x, t0.y); ctx.lineTo(t1.x, t1.y); ctx.stroke();
  // vertical neon mullions
  ctx.strokeStyle = 'rgba(236,72,153,0.4)';
  ctx.lineWidth = 1.5;
  const MULL = side === 'right' ? cols : rows;
  for (let m = 0; m <= MULL; m += 4) {
    const b = side === 'right' ? P(m, 0) : P(0, m);
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x, b.y - h); ctx.stroke();
  }
}

function drawDividerWall(ctx: CanvasRenderingContext2D, s: SceneCtx) {
  const { P, leftCols, rows, doorTopRow, doorBotRow } = s;
  const col = leftCols + 0.5;
  const WALL_H = 2.6;
  const segs: [number, number][] = [[0, doorTopRow], [doorBotRow, rows]];
  for (const [r0, r1] of segs) {
    if (r1 <= r0) continue;
    const A = P(col - 0.1, r0), B = P(col + 0.1, r0), C = P(col + 0.1, r1), D = P(col - 0.1, r1);
    const h = s.heightPx(WALL_H * TILE);
    const At = { x: A.x, y: A.y - h }, Bt = { x: B.x, y: B.y - h }, Ct = { x: C.x, y: C.y - h }, Dt = { x: D.x, y: D.y - h };
    quad(ctx, [D, C, Ct, Dt], 'rgba(28,16,52,0.92)');
    quad(ctx, [B, C, Ct, Bt], 'rgba(20,12,40,0.95)');
    quad(ctx, [At, Bt, Ct, Dt], 'rgba(40,24,70,0.9)');
  }
}

// ── small utils ──
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}
function rrectStroke(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.stroke();
}
function shade(hex: string, amt: number): string {
  // amt in [-100,100]; works on #rrggbb
  const m = hex.replace('#', '');
  if (m.length !== 6) return hex;
  const num = parseInt(m, 16);
  let r = (num >> 16) + amt, g = ((num >> 8) & 0xff) + amt, b = (num & 0xff) + amt;
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  return `rgb(${r},${g},${b})`;
}
function hexA(hex: string, a: number): string {
  const m = hex.replace('#', '');
  if (m.length !== 6) return hex;
  const num = parseInt(m, 16);
  return `rgba(${num >> 16},${(num >> 8) & 0xff},${num & 0xff},${a})`;
}
