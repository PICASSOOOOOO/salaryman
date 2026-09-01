import React, { useEffect, useMemo, useRef, useState } from 'react';
import { type Appearance, drawPlayerSprite } from '@/lib/character-identity';
import type { OfficeStation, OfficeRoom, PixelOfficeBot } from '@/components/office/office-types';
import {
  findOfficeRoute,
  getOfficeBlockedTiles,
  type OfficePropertyLayout,
} from '@/lib/office-property-layouts';
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

/** A live occupant position on the office floor, normalized to 0..1 of the
 *  floor's width/height, for the top-left occupancy minimap. */
export interface OfficeOccupant {
  x: number;
  y: number;
  kind: 'player' | 'active' | 'idle';
  name?: string;
}
// `colCount` / `rowCount` cap how many desk columns/rows are generated so the
// furnished desk count scales with the owned property tier (capsule → suite).
// Floor WIDTH stays fixed (22 per half) so the hand-placed station strip — whose
// columns run the full width — never falls off the floor.
function deskRects(shift: number, colCount?: number, rowCount?: number, availableCols = 22): DeskRect[] {
  const generatedCols = Array.from(
    { length: Math.max(1, Math.min(colCount ?? BIG_DESK_COLS.length, Math.floor((availableCols - 1) / 4))) },
    (_, i) => 1 + i * 4,
  );
  const generatedRows = Array.from({ length: Math.max(1, rowCount ?? BIG_DESK_ROWS.length) }, (_, i) => 4 + i * 3);
  const cols = colCount == null ? BIG_DESK_COLS : generatedCols;
  const rws = rowCount == null ? BIG_DESK_ROWS : generatedRows;
  const out: DeskRect[] = [];
  rws.forEach((r, ri) =>
    cols.forEach((c, ci) => out.push({ c: shift + c, r, w: 3, d: 2, ci, ri })),
  );
  return out;
}
// `count` caps the number of sleep capsules so the capsule count scales with tier.
function capsuleSpots(shift: number, count?: number): { col: number }[] {
  const cols: { col: number }[] = [];
  for (let c = 0; c <= 22 - 3; c += 3) cols.push({ col: shift + c });
  return count == null ? cols : cols.slice(0, count);
}

export interface IsoOfficeProps {
  /** Authoritative property geometry. Disables legacy generated floor geometry. */
  layout: OfficePropertyLayout;
  scale?: number;
  bullpen?: boolean;
  activeBots?: PixelOfficeBot[];
  idleBots?: PixelOfficeBot[];
  playable?: boolean;
  onEnterTerminal?: () => void;
  /** Fires ONCE on the player's first movement of this mount (key or tap). Drives
   *  the office discovery onboarding ("learn to move by doing"). */
  onMove?: () => void;
  appearance?: Appearance;
  costumeColor?: string | null;
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
  /** Deed customization applied to floor trim, ambient light and furniture accents. */
  accentColor?: string | null;
  lighting?: 'dim' | 'normal' | 'bright';
  mode?: 'wander' | 'still' | 'at-desk';
  /** Walk-up activation for a bullpen/capsule bot — opens its command center.
   *  Mirrors the YOUR DESK computer interaction; computer keeps precedence. */
  onBotInteract?: (bot: { id: number; name: string }) => void;
  /** Tier-driven furniture counts (default: the full hard-coded layout). */
  deskColCount?: number;
  deskRowCount?: number;
  capsuleCount?: number;
  /**
   * When true, suppress floating name labels on stations, capsules and exec
   * rooms. Pass `true` on touch/mobile so the canvas isn't cluttered with
   * overlapping text; the active station still shows its label.
   */
  suppressLabels?: boolean;
  /** Player's character name — shown on the home-desk nameplate instead of "YOUR DESK". */
  playerName?: string;
  /** Live occupancy feed (player + bots), normalized to 0..1 of the floor, for
   *  the see-through wireframe minimap. Polled a few times a second. */
  onOccupants?: (occupants: OfficeOccupant[]) => void;
  initialPose?: { x: number; y: number; facing: 'left' | 'right' };
  onPoseChange?: (pose: { x: number; y: number; facing: 'left' | 'right' }) => void;
}

interface Vec2 { x: number; y: number }

// hsl helper for bot tints
function botColor(id: number, l = 55): string {
  const hue = (id * 47) % 360;
  return `hsl(${hue} 62% ${l}%)`;
}

export function IsoOffice({
  layout,
  scale = 3,
  bullpen = false,
  activeBots = [],
  idleBots = [],
  playable = false,
  onEnterTerminal,
  onMove,
  appearance,
  costumeColor,
  viewportWidth,
  viewportHeight,
  stations = [],
  frozen = false,
  followCam = false,
  rooms = [],
  doorTopRow: doorTopRowProp,
  doorBotRow: doorBotRowProp,
  onBotInteract,
  deskColCount,
  deskRowCount,
  capsuleCount,
  suppressLabels = false,
  playerName = '',
  onOccupants,
  initialPose,
  onPoseChange,
  accentColor = null,
  lighting = 'normal',
}: IsoOfficeProps) {
  const isTouch =
    typeof window !== 'undefined' &&
    (('ontouchstart' in window) || (navigator.maxTouchPoints ?? 0) > 0);

  const effectiveBullpen = false;
  const leftCols = layout.cols;
  const dividerCols = effectiveBullpen ? 1 : 0;
  const rightCols = 0;
  const cols = leftCols + dividerCols + rightCols;
  const rows = layout.rows;
  const bullpenShift = leftCols + dividerCols;

  const doorTopRow = doorTopRowProp ?? (rows - 3);
  const doorBotRow = doorBotRowProp ?? (rows - 1);

  const worldW = cols * TILE;
  const worldH = rows * TILE;

  // Interior executive-office walls → blocked tile set (col,row), same algo as
  // PixelOffice so collision is identical.
  const blockedTiles = useMemo(() => {
    if (layout) return getOfficeBlockedTiles(layout);
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
  }, [layout, rooms]);

  const deskRowDesks = useMemo(
    () => [{ c: layout.playerDesk.col, r: layout.playerDesk.row, w: layout.playerDesk.w, d: layout.playerDesk.d, ci: 0, ri: 0 }],
    [layout],
  );
  const bullpenDesks = useMemo(
    () => layout.teamDesks.map((desk, i) => ({ c: desk.col, r: desk.row, w: desk.w, d: desk.d, ci: i, ri: 0 })),
    [layout, effectiveBullpen, bullpenShift, deskColCount, deskRowCount, rightCols],
  );
  const capSpots = useMemo(
    () => layout.capsuleSpots.map((spot) => ({ col: spot.col, row: spot.row, w: spot.w, d: spot.d })),
    [layout, effectiveBullpen, bullpenShift, capsuleCount],
  );

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
  const COMPUTER_X = (layout.playerDesk.col + layout.playerDesk.w / 2) * TILE;
  const COMPUTER_Y = (layout.playerDesk.row + layout.playerDesk.d) * TILE;

  // Hard-object collision: each interaction object + the player's own desk is a
  // SOLID prop the player must walk around — no walking through furniture. The
  // blocked tiles mirror each object's DRAWN floor footprint (computed from the
  // same tx/ty the renderer uses) so collision only ever lines up with what's
  // painted, never an invisible wall.
  const stationBlocked = useMemo(() => {
    if (layout) return new Set<string>();
    const set = new Set<string>();
    const addRect = (c0: number, r0: number, c1: number, r1: number) => {
      for (let c = Math.floor(c0); c <= Math.floor(c1); c++)
        for (let r = Math.floor(r0); r <= Math.floor(r1); r++) set.add(`${c},${r}`);
    };
    for (const st of stations) {
      const wTiles = st.art ? st.art.wTiles : 1.4;
      const hTiles = st.art ? st.art.hTiles : 1.6;
      const tx = st.col + wTiles / 2;
      const ty = st.row + hTiles;
      if (st.glyph === 'elevator') addRect(tx - 1.0, ty - 0.35, tx + 1.0, ty + 0.35);
      else addRect(tx - 0.6, ty - 0.6, tx + 0.6, ty + 0.4);
    }
    // The player's own desk terminal is solid too (2.0 × 0.9 footprint).
    if (onEnterTerminal) {
      addRect(COMPUTER_X / TILE - 1.0, COMPUTER_Y / TILE - 0.4, COMPUTER_X / TILE + 1.0, COMPUTER_Y / TILE + 0.5);
    }
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, stations, onEnterTerminal]);

  // ── Refs the rAF loop reads (so the loop never restarts on prop churn) ──
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fxRef = useRef<number>(initialPose?.x ?? Math.round((effectiveBullpen ? bullpenShift + rightCols / 2 : cols / 2) * TILE));
  const fyRef = useRef<number>(initialPose?.y ?? Math.round((rows - 3) * TILE));
  const facingRef = useRef<'left' | 'right'>(initialPose?.facing ?? 'right');
  const walkRef = useRef(0); // 0..1 walk phase for a tiny bob
  const runRef = useRef(false); // true while sprinting (Shift held / long tap)
  const heldRef = useRef<Set<string>>(new Set());
  const tapTargetRef = useRef<Vec2 | null>(null);
  const tapPathRef = useRef<Vec2[]>([]);
  const frozenRef = useRef(frozen);
  const scaleRef = useRef(scale);
  const followRef = useRef(followCam);
  const viewWRef = useRef(viewportWidth ?? 800);
  const viewHRef = useRef(viewportHeight ?? 480);
  const offRef = useRef<Vec2>({ x: 0, y: 0 });
  const nearComputerRef = useRef(false);
  const activeStationRef = useRef<string | null>(null);
  const activeBotRef = useRef<number | null>(null);
  const activeBotObjRef = useRef<{ id: number; name: string } | null>(null);
  const onBotInteractRef = useRef(onBotInteract);
  const onEnterRef = useRef(onEnterTerminal);
  const onMoveRef = useRef(onMove);
  const onPoseChangeRef = useRef(onPoseChange);
  const movedOnceRef = useRef(false);
  const stationsRef = useRef<OfficeStation[]>(stations);
  const blockedRef = useRef(blockedTiles);
  const stationBlockedRef = useRef(stationBlocked);
  const seatedRef = useRef(seatedBots);
  const sleepingRef = useRef(sleepingBots);
  const roomsRef = useRef(rooms);
  const appearanceRef = useRef(appearance);
  const costumeRef = useRef(costumeColor);
  const bullpenDesksRef = useRef(bullpenDesks);
  const leftDesksRef = useRef(deskRowDesks);
  const capSpotsRef = useRef(capSpots);
  const suppressLabelsRef = useRef(suppressLabels);
  const playerNameRef = useRef(playerName);
  const accentColorRef = useRef(accentColor);
  const lightingRef = useRef(lighting);

  const [nearComputer, setNearComputer] = useState(false);
  const [activeStationId, setActiveStationId] = useState<string | null>(null);
  const [activeBot, setActiveBot] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => {
    frozenRef.current = frozen;
    if (frozen) {
      heldRef.current.clear();
      tapTargetRef.current = null;
      tapPathRef.current = [];
    }
  }, [frozen]);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { followRef.current = followCam; }, [followCam]);
  useEffect(() => { suppressLabelsRef.current = suppressLabels; }, [suppressLabels]);
  useEffect(() => { playerNameRef.current = playerName; }, [playerName]);
  useEffect(() => { accentColorRef.current = accentColor; }, [accentColor]);
  useEffect(() => { lightingRef.current = lighting; }, [lighting]);
  useEffect(() => { onEnterRef.current = onEnterTerminal; }, [onEnterTerminal]);
  useEffect(() => { onMoveRef.current = onMove; }, [onMove]);
  useEffect(() => { onPoseChangeRef.current = onPoseChange; }, [onPoseChange]);
  useEffect(() => { onBotInteractRef.current = onBotInteract; }, [onBotInteract]);
  useEffect(() => { stationsRef.current = stations; }, [stations]);
  useEffect(() => { blockedRef.current = blockedTiles; }, [blockedTiles]);
  useEffect(() => { stationBlockedRef.current = stationBlocked; }, [stationBlocked]);
  useEffect(() => { seatedRef.current = seatedBots; }, [seatedBots]);
  useEffect(() => { sleepingRef.current = sleepingBots; }, [sleepingBots]);
  useEffect(() => { roomsRef.current = rooms; }, [rooms]);
  useEffect(() => { appearanceRef.current = appearance; }, [appearance]);
  useEffect(() => { costumeRef.current = costumeColor; }, [costumeColor]);
  useEffect(() => { bullpenDesksRef.current = bullpenDesks; }, [bullpenDesks]);
  useEffect(() => { leftDesksRef.current = deskRowDesks; }, [deskRowDesks]);
  useEffect(() => { capSpotsRef.current = capSpots; }, [capSpots]);

  // ── Live occupancy feed for the top-left wireframe minimap ──────────────────
  // Polls the player + seated/sleeping bot positions a few times a second from
  // the same refs the rAF loop reads, normalized to 0..1 of the floor. Uses an
  // interval (not the render loop) so the parent never re-renders per frame.
  useEffect(() => {
    if (!onOccupants) return;
    const emit = () => {
      const occ: OfficeOccupant[] = [];
      occ.push({ x: fxRef.current / worldW, y: fyRef.current / worldH, kind: 'player', name: playerNameRef.current || undefined });
      seatedRef.current.forEach((bot, i) => {
        const d = bullpenDesksRef.current[i];
        if (!d) return;
        occ.push({ x: ((d.c + d.w / 2) * TILE) / worldW, y: ((d.r + d.d) * TILE) / worldH, kind: 'active', name: bot.name });
      });
      sleepingRef.current.forEach((bot, i) => {
        const spot = capSpotsRef.current[i];
        if (!spot) return;
        occ.push({ x: ((spot.col + 0.5) * TILE) / worldW, y: (1.0 * TILE) / worldH, kind: 'idle', name: bot.name });
      });
      onOccupants(occ);
    };
    emit();
    const iv = window.setInterval(emit, 300);
    return () => window.clearInterval(iv);
  }, [onOccupants, worldW, worldH]);
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
        if (dx !== 0 || dy !== 0) {
          tapTargetRef.current = null;
          tapPathRef.current = [];
        }

        let vx = dx, vy = dy, moving = dx !== 0 || dy !== 0;
        if (!moving && tapTargetRef.current) {
          const ddx = tapTargetRef.current.x - fxRef.current;
          const ddy = tapTargetRef.current.y - fyRef.current;
          const dist = Math.hypot(ddx, ddy);
          if (dist <= 2) tapTargetRef.current = tapPathRef.current.shift() ?? null;
          else { vx = ddx / dist; vy = ddy / dist; moving = true; }
        }

        // RUN STATE — Shift sprints (desktop); a long tap auto-sprints so a
        // pointer-only player covers distance too. Drives a faster gait, a
        // bigger bob and a forward lean in drawPlayer.
        let running = false;
        if (moving) {
          running = k.has('shift');
          const tt = tapTargetRef.current;
          if (tt && Math.hypot(tt.x - fxRef.current, tt.y - fyRef.current) > 64) running = true;
        }
        runRef.current = running && moving;

        if (moving) {
          const norm = (dx !== 0 && dy !== 0 && !tapTargetRef.current) ? Math.SQRT1_2 : 1;
          // tap vectors are already unit; key diagonals get SQRT1_2
          const isTap = !!tapTargetRef.current;
          const stepInv = (!isTap && dx !== 0 && dy !== 0) ? Math.SQRT1_2 : 1;
          const runMul = running ? 1.75 : 1;
          const step = SPEED * runMul * (dt / 1000) * (isTap ? 1 : stepInv) * (norm === norm ? 1 : 1);
          let nx = fxRef.current + vx * step;
          let ny = fyRef.current + vy * step;
          nx = Math.max(TILE * 0.5, Math.min(worldW - TILE * 0.5, nx));
          ny = Math.max(WALL_ROWS * TILE + TILE * 0.3, Math.min(worldH - TILE * 0.4, ny));

          // Bullpen divider — only crossable through the door band.
          if (effectiveBullpen) {
            const dividerCenter = (leftCols + 0.5) * TILE;
            const inDoor = ny >= doorTopRow * TILE && ny <= doorBotRow * TILE;
            if (!inDoor) {
              if ((fxRef.current - dividerCenter) * (nx - dividerCenter) <= 0) nx = fxRef.current;
            }
          }
          // Interior exec walls + solid props (desk / ATM / vending / payphone /
          // lift) — per-axis tile collision (slide) against the SAME footprints
          // that are drawn, so the player is only ever stopped by something
          // visible, and can slide cleanly along an obstacle instead of sticking.
          const bset = blockedRef.current;
          const sset = stationBlockedRef.current;
          if (bset.size || sset.size) {
            const col = (px: number) => Math.floor(px / TILE);
            const row = (py: number) => Math.floor(py / TILE);
            const solid = (c: number, r: number) => bset.has(`${c},${r}`) || sset.has(`${c},${r}`);
            if (solid(col(nx), row(fyRef.current))) nx = fxRef.current;
            if (solid(col(nx), row(ny))) ny = fyRef.current;
          }
          if (Math.abs(nx - fxRef.current) < 0.05 && Math.abs(ny - fyRef.current) < 0.05) {
            tapTargetRef.current = tapPathRef.current.shift() ?? null;
          }
          if (Math.abs(vx) > 0.01) facingRef.current = vx > 0 ? 'right' : 'left';
          fxRef.current = nx;
          fyRef.current = ny;
           onPoseChangeRef.current?.({ x: nx, y: ny, facing: facingRef.current });
          frameAccum += dt;
          const gait = running ? FRAME_PERIOD_MS * 0.6 : FRAME_PERIOD_MS;
          if (frameAccum >= gait) {
            frameAccum = 0;
            walkRef.current = walkRef.current > 0 ? 0 : 1;
            footfall = !footfall;
            if (footfall) sfxStep(running ? 0.5 : 0.4, (running ? 185 : 165) + Math.random() * 50);
          }
        } else {
          walkRef.current = 0;
          runRef.current = false;
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
          const sx = (st.col + (st.footprint?.w ?? 1) / 2) * TILE;
          const sy = (st.row + (st.footprint?.d ?? 1) / 2) * TILE;
          const d = Math.hypot(cx - sx, cy - sy);
          if (d <= (st.radius ?? 26) && d < bestDist) { bestDist = d; bestId = st.id; }
        }
        // Walk-up bots — seated at a bullpen desk, or dormant in a sleep capsule.
        // Mirrors the station/computer activation so any desk/object is usable.
        let bestBot: { id: number; name: string } | null = null;
        let bestBotDist = Infinity;
        const seatedNow = seatedRef.current, bdesksNow = bullpenDesksRef.current;
        for (let i = 0; i < seatedNow.length; i++) {
          const d = bdesksNow[i]; if (!d) continue;
          const sx = (d.c + d.w / 2) * TILE, sy = (d.r + d.d + 0.25) * TILE;
          const dd = Math.hypot(cx - sx, cy - sy);
          if (dd <= 28 && dd < bestBotDist) { bestBotDist = dd; bestBot = { id: seatedNow[i].id, name: seatedNow[i].name }; }
        }
        const sleepingNow = sleepingRef.current, capsNow = capSpotsRef.current;
        for (let i = 0; i < sleepingNow.length; i++) {
          const sp = capsNow[i]; if (!sp) continue;
          const sx = (sp.col + sp.w / 2) * TILE, sy = (sp.row + sp.d) * TILE;
          const dd = Math.hypot(cx - sx, cy - sy);
          if (dd <= 30 && dd < bestBotDist) { bestBotDist = dd; bestBot = { id: sleepingNow[i].id, name: sleepingNow[i].name }; }
        }
        // Computer keeps precedence (handled separately at the prompt/handler).
        // Between a station and a bot, the NEARER one wins so only one prompt shows.
        const botWins = bestBot != null && (bestId == null || bestBotDist < bestDist);
        const winStation = botWins ? null : bestId;
        const winBot = botWins ? bestBot : null;
        if (winStation !== activeStationRef.current) { activeStationRef.current = winStation; setActiveStationId(winStation); }
        const winBotId = winBot ? winBot.id : null;
        if (winBotId !== activeBotRef.current) {
          activeBotRef.current = winBotId;
          activeBotObjRef.current = winBot;
          setActiveBot(winBot);
        }
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
        cols, rows, leftCols, bullpen: effectiveBullpen, bullpenShift, rightCols,
        doorTopRow, doorBotRow,
        leftDesks: leftDesksRef.current,
        bullpenDesks: bullpenDesksRef.current,
        capSpots: capSpotsRef.current,
        seated: seatedRef.current,
        sleeping: sleepingRef.current,
        rooms: roomsRef.current,
        stations: stationsRef.current,
        activeStationId: activeStationRef.current,
        activeBotId: activeBotRef.current,
        playable,
        fx: fxRef.current, fy: fyRef.current,
        facing: facingRef.current,
        walk: walkRef.current,
        run: runRef.current,
        appearance: appearanceRef.current,
        costume: costumeRef.current ?? null,
        S, now,
        showComputer: false,
        nearComputer: nearComputerRef.current,
        computerX: COMPUTER_X, computerY: COMPUTER_Y,
        backdrop: null,
        viewW, viewH,
        suppressLabels: suppressLabelsRef.current,
        playerName: playerNameRef.current,
        accentColor: accentColorRef.current,
        lighting: lightingRef.current,
      });

      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);

    const onKeyDown = (e: KeyboardEvent) => {
      if (frozenRef.current || !playable) return;
      const key = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) e.preventDefault();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key) && !movedOnceRef.current) {
        movedOnceRef.current = true;
        onMoveRef.current?.();
      }
      if (key === 'e' || key === 'enter') {
        if (nearComputerRef.current) { onEnterRef.current?.(); return; }
        if (activeBotObjRef.current) { onBotInteractRef.current?.(activeBotObjRef.current); return; }
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
  }, [playable, effectiveBullpen, cols, rows, leftCols, bullpenShift, rightCols, doorTopRow, doorBotRow, worldW, worldH]);

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
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    const deskTx = COMPUTER_X / TILE;
    const deskTy = COMPUTER_Y / TILE;
    const deskPoint = {
      x: (deskTx - deskTy) * (T * 0.5) + off.x,
      y: (deskTx + deskTy) * (T * 0.25) + off.y,
    };
    // Raised isometric furniture does not invert to its own floor footprint.
    // Treat the visible home terminal as a direct, generous touch target while
    // preserving the normal walk-up prompt and keyboard interaction.
    if (onEnterTerminal && Math.hypot(localX - deskPoint.x, localY - (deskPoint.y - T * 0.55)) <= Math.max(34, T * 0.9)) {
      onEnterTerminal();
      return;
    }
    const sx = localX - off.x;
    const sy = localY - off.y;
    const tx = (sx / (T * 0.5) + sy / (T * 0.25)) / 2;
    const ty = (sy / (T * 0.25) - sx / (T * 0.5)) / 2;
    const wx = Math.max(TILE * 0.5, Math.min(worldW - TILE * 0.5, tx * TILE));
    const wy = Math.max(WALL_ROWS * TILE + TILE * 0.3, Math.min(worldH - TILE * 0.4, ty * TILE));
    if (layout) {
      const waypoints = findOfficeRoute(
        layout,
        { col: fxRef.current / TILE, row: fyRef.current / TILE },
        { col: wx / TILE, row: wy / TILE },
      ).map((tile) => ({ x: (tile.col + 0.5) * TILE, y: (tile.row + 0.5) * TILE }));
      tapTargetRef.current = waypoints.shift() ?? null;
      tapPathRef.current = waypoints;
    } else {
      tapTargetRef.current = { x: wx, y: wy };
      tapPathRef.current = [];
    }
    if (!movedOnceRef.current) { movedOnceRef.current = true; onMoveRef.current?.(); }
  };

  const showComputerPrompt = !!onEnterTerminal && nearComputer;
  // Precedence: computer (YOUR DESK) > walk-up bot > generic station.
  const promptBot = !nearComputer && activeBot ? activeBot : undefined;
  const promptStation = !nearComputer && !promptBot && activeStationId
    ? stations.find((s) => s.id === activeStationId)
    : undefined;

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
        touchAction: playable ? 'none' : 'auto',
        userSelect: 'none',
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
      {effectiveBullpen && (
        <>
          <div style={labelStyle('left')}>▸ PRIVATE</div>
          <div style={labelStyle('right')}>BOT BULLPEN ◂</div>
        </>
      )}

      {/* Walk-up prompt — computer > bot command center > nearest station. */}
      {playable && !frozen && (showComputerPrompt || promptBot || promptStation) && (
        <button
          type="button"
          data-testid={
            showComputerPrompt
              ? 'office-computer-enter'
              : promptBot
                ? `office-bot-${promptBot.id}`
                : `office-station-${promptStation?.id}`
          }
          onClick={
            showComputerPrompt
              ? () => onEnterTerminal?.()
              : promptBot
                ? () => onBotInteract?.(promptBot)
                : () => promptStation?.onInteract()
          }
          style={{
            position: 'absolute', left: '50%', bottom: 14, transform: 'translateX(-50%)',
            minHeight: 44,
            maxWidth: 'calc(100% - 24px)',
            padding: '.65rem 1rem',
            background: 'linear-gradient(135deg, rgba(236,72,153,.92), rgba(56,189,248,.82))',
            border: '1px solid rgba(244,180,255,.95)', borderRadius: 6, color: '#0a0414',
            font: 'bold .7rem "var(--font-sans)", monospace', letterSpacing: '.16em',
            cursor: 'pointer', zIndex: 30, boxShadow: '0 0 18px rgba(236,72,153,.55)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          ▸ {showComputerPrompt
            ? 'ENTER TERMINAL'
            : promptBot
              ? `MANAGE ${promptBot.name.toUpperCase()}`
              : promptStation?.label}{isTouch ? '' : ' · PRESS E'}
        </button>
      )}
    </div>
  );
}

function labelStyle(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute',
    [side]: 8, top: 8,
    fontFamily: "var(--font-sans)",
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
  leftDesks: DeskRect[];
  bullpenDesks: DeskRect[];
  capSpots: { col: number; row: number; w: number; d: number }[];
  seated: PixelOfficeBot[]; sleeping: PixelOfficeBot[];
  rooms: OfficeRoom[]; stations: OfficeStation[]; activeStationId: string | null;
  activeBotId: number | null;
  playable: boolean;
  fx: number; fy: number; facing: 'left' | 'right'; walk: number; run: boolean;
  appearance?: Appearance; costume: string | null;
  S: number; now: number;
  showComputer: boolean; nearComputer: boolean; computerX: number; computerY: number;
  backdrop: HTMLImageElement | null; viewW: number; viewH: number;
  suppressLabels?: boolean;
  playerName?: string;
  accentColor?: string | null;
  lighting: 'dim' | 'normal' | 'bright';
}

function drawScene(ctx: CanvasRenderingContext2D, s: SceneCtx) {
  const { P, heightPx, cols, rows, T } = s;
  const accent = /^#[0-9a-f]{6}$/i.test(s.accentColor ?? '') ? s.accentColor! : '#ec4899';
  const light = s.lighting === 'dim' ? 0.62 : s.lighting === 'bright' ? 1.24 : 1;

  // ---- Realty backdrop ----
  // When the player's property art is loaded, paint it COVER-fit as the room's
  // establishing illustration so the office reads as the SAME isometric realty
  // image as the store card. The procedural floor/walls then become a subtle
  // holographic stage layered over it. `painted` gates the fallback so an
  // un-generated/absent asset keeps the original fully-procedural neon-noir look.
  const painted = !!s.backdrop;
  if (s.backdrop) {
    const img = s.backdrop;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (iw > 0 && ih > 0) {
      const cover = Math.max(s.viewW / iw, s.viewH / ih);
      const dw = iw * cover, dh = ih * cover;
      ctx.drawImage(img, (s.viewW - dw) / 2, (s.viewH - dh) / 2, dw, dh);
      // Darken so the foreground sprites/furniture read against the art.
      const ov = ctx.createLinearGradient(0, 0, 0, s.viewH);
      ov.addColorStop(0, `rgba(10,6,24,${Math.min(0.78, 0.55 / light)})`);
      ov.addColorStop(0.6, `rgba(10,6,24,${Math.min(0.65, 0.32 / light)})`);
      ov.addColorStop(1, `rgba(8,4,18,${Math.min(0.82, 0.62 / light)})`);
      ctx.fillStyle = ov;
      ctx.fillRect(0, 0, s.viewW, s.viewH);
    }
  }

  // ---- Floor ----
  // Solid base quad.
  const fA = P(0, 0), fB = P(cols, 0), fC = P(cols, rows), fD = P(0, rows);
  ctx.beginPath();
  ctx.moveTo(fA.x, fA.y); ctx.lineTo(fB.x, fB.y); ctx.lineTo(fC.x, fC.y); ctx.lineTo(fD.x, fD.y); ctx.closePath();
  if (painted) {
    // Translucent stage tint over the painted floor.
    const fg = ctx.createLinearGradient(fA.x, fA.y, fC.x, fC.y);
    fg.addColorStop(0, 'rgba(36,17,64,0.42)');
    fg.addColorStop(0.55, 'rgba(26,15,51,0.36)');
    fg.addColorStop(1, 'rgba(18,11,38,0.5)');
    ctx.fillStyle = fg;
  } else {
    const fg = ctx.createLinearGradient(fA.x, fA.y, fC.x, fC.y);
    fg.addColorStop(0, '#241140');
    fg.addColorStop(0.55, '#1a0f33');
    fg.addColorStop(1, '#120b26');
    ctx.fillStyle = fg;
  }
  ctx.fill();
  ctx.save();
  ctx.globalAlpha = s.lighting === 'bright' ? 0.22 : s.lighting === 'dim' ? 0.08 : 0.14;
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1, T / 20);
  ctx.stroke();
  ctx.restore();

  // Grid lines.
  ctx.lineWidth = 1;
  ctx.strokeStyle = painted ? 'rgba(150,110,230,0.09)' : 'rgba(150,110,230,0.13)';
  for (let c = 0; c <= cols; c++) { const a = P(c, 0), b = P(c, rows); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  for (let r = 0; r <= rows; r++) { const a = P(0, r), b = P(cols, r); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }

  // Neon floor rim along the two FRONT edges.
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(236,72,153,0.55)';
  ctx.beginPath(); ctx.moveTo(fD.x, fD.y); ctx.lineTo(fC.x, fC.y); ctx.lineTo(fB.x, fB.y); ctx.stroke();

  // ---- Back walls (glass + city skyline) ----
  // Skipped when the realty art is painted — the illustration already supplies
  // the room's walls/windows, so the procedural skyline would fight it.
  if (!painted) {
    drawCityWall(ctx, s, 'right'); // along (0,0)->(cols,0)
    drawCityWall(ctx, s, 'left');  // along (0,0)->(0,rows)
  }

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
    push(spot.col + spot.w, spot.row + spot.d, () => drawCapsule(ctx, s, spot, bot, i));
  });

  // Seated bots at bullpen desks.
  s.seated.forEach((bot, i) => {
    const d = s.bullpenDesks[i]; if (!d) return;
    const tx = d.c + d.w / 2, ty = d.r + d.d + 0.25;
    push(tx, ty + 0.1, () => drawBot(ctx, s, tx, ty, bot));
  });

  // Stations.
  for (const st of s.stations) {
    const wTiles = st.footprint?.w ?? 1;
    const hTiles = st.footprint?.d ?? 1;
    const tx = st.col + wTiles / 2, ty = st.row + hTiles / 2;
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
function quad(ctx: CanvasRenderingContext2D, p: Vec2[], fill: string | CanvasGradient | CanvasPattern, stroke?: string) {
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

// Soft grounded contact shadow under a footprint (centre c..c+w, r..r+depth)
// so furniture/objects read as planted on the floor rather than floating.
function groundShadow(ctx: CanvasRenderingContext2D, s: SceneCtx, c: number, r: number, w: number, depth: number, alpha = 0.34) {
  const { P } = s;
  const ctr = P(c + w / 2, r + depth / 2);
  const rx = ((w + depth) / 2) * s.T * 0.5 * 0.6;
  const ry = ((w + depth) / 2) * s.T * 0.5 * 0.25;
  if (rx <= 0 || ry <= 0) return;
  ctx.save();
  const g = ctx.createRadialGradient(ctr.x, ctr.y, 0, ctr.x, ctr.y, rx);
  g.addColorStop(0, `rgba(0,0,0,${alpha})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(ctr.x, ctr.y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawDesk(ctx: CanvasRenderingContext2D, s: SceneCtx, d: DeskRect, topCol: string, sideCol: string) {
  groundShadow(ctx, s, d.c, d.r, d.w, d.d);
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
  // walk-up highlight ring when this seated bot is the active interaction target
  if (s.playable && s.activeBotId === bot.id) {
    ctx.save();
    ctx.strokeStyle = 'rgba(120,240,255,0.95)'; ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(120,240,255,0.9)'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 8 * u * 0.5, 3.6 * u * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  const baseY = p.y + bob;
  // body
  ctx.fillStyle = col;
  rrect(ctx, p.x - 4 * u * 0.5, baseY - 16 * u * 0.5, 8 * u * 0.5, 13 * u * 0.5, 2 * u * 0.5);
  // head
  const headY = baseY - 18 * u * 0.5;
  const headR = 3.4 * u * 0.5;
  ctx.fillStyle = '#f1c9a5';
  ctx.beginPath(); ctx.arc(p.x, headY, headR, 0, Math.PI * 2); ctx.fill();
  // face — two tiny eyes so bots read as little characters, not blobs
  const eyeDx = headR * 0.42;
  const eyeDy = headR * 0.12;
  const eyeR = Math.max(0.7, headR * 0.2);
  ctx.fillStyle = '#1c1024';
  ctx.beginPath(); ctx.arc(p.x - eyeDx, headY - eyeDy, eyeR, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(p.x + eyeDx, headY - eyeDy, eyeR, 0, Math.PI * 2); ctx.fill();
  // name plate
  ctx.fillStyle = bot.teamColor ?? 'rgba(180,255,220,0.85)';
  ctx.font = `${Math.max(7, 4 * u * 0.5)}px "Fira Code", monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(bot.name.slice(0, 8).toUpperCase(), p.x, baseY + 6 * u * 0.5);
  ctx.textAlign = 'left';
}

function drawPlayer(ctx: CanvasRenderingContext2D, s: SceneCtx, tx: number, ty: number) {
  const { P } = s;
  const p = P(tx, ty);
  const u = (s.T / TILE);
  // Scaled to read as a person standing next to the room's furniture (roughly a
  // touch shorter than the elevator door), matching the concept art / intro
  // video proportions rather than the old oversized doll.
  const spriteScale = u * 0.5;
  // Running exaggerates the bob and adds a forward lean in the facing direction.
  const bob = s.walk ? (s.run ? -2.6 : -1.2) : 0;
  const lean = s.run && s.walk ? (s.facing === 'left' ? 0.16 : -0.16) : 0;
  // shadow — slightly stretched while sprinting
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath(); ctx.ellipse(p.x, p.y, (s.run ? 9.5 : 8) * u * 0.5, 3.4 * u * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (s.appearance) {
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    if (lean) ctx.rotate(lean);
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

function drawElevator(ctx: CanvasRenderingContext2D, s: SceneCtx, st: OfficeStation, tx: number, ty: number) {
  const { P, heightPx } = s;
  const active = s.playable && s.activeStationId === st.id;
  const u = (s.T / TILE) * 0.5;
  const pulse = (Math.sin(s.now / 900) + 1) / 2;
  const blink = Math.floor(s.now / 650) % 2 === 0;

  const w = st.footprint?.w ?? 1;
  const d = st.footprint?.d ?? 1;
  groundShadow(ctx, s, st.col, st.row, w, d);

  // Steel isometric shaft body
  isoBox(
    ctx, s,
    st.col, st.row, w, d, 22,
    active ? '#1e2f48' : '#16222f',
    '#0e1720',
    '#111d2a',
    active
      ? `rgba(56,240,255,${0.55 + pulse * 0.35})`
      : `rgba(28,90,130,${0.28 + pulse * 0.18})`,
  );

  // Door split seam — dark vertical crack down the isometric front face
  const seam = P(tx, ty + d / 2);
  ctx.save();
  ctx.strokeStyle = 'rgba(4,8,16,0.95)';
  ctx.lineWidth = Math.max(1, 1.4 * u);
  ctx.beginPath();
  ctx.moveTo(seam.x, seam.y - heightPx(21));
  ctx.lineTo(seam.x, seam.y - heightPx(1));
  ctx.stroke();
  ctx.restore();

  // Floor indicator — blinking yellow triangle above the doors
  const top = P(tx, ty);
  ctx.save();
  ctx.fillStyle = blink ? '#ffd23f' : 'rgba(255,210,63,0.1)';
  ctx.shadowColor = 'rgba(255,210,63,0.85)';
  ctx.shadowBlur = blink ? 10 : 1;
  const ts = 4.5 * u;
  ctx.beginPath();
  ctx.moveTo(top.x, top.y - heightPx(30) - ts);
  ctx.lineTo(top.x - ts, top.y - heightPx(30) + ts * 0.5);
  ctx.lineTo(top.x + ts, top.y - heightPx(30) + ts * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Call button — pulsing cyan circle on the right panel
  const btn = P(st.col + w * .85, st.row + d * .6);
  ctx.save();
  ctx.fillStyle = `rgba(56,240,255,${0.35 + pulse * 0.5})`;
  ctx.shadowColor = 'rgba(56,240,255,0.95)';
  ctx.shadowBlur = 5 + pulse * 12;
  ctx.beginPath();
  ctx.arc(btn.x, btn.y - heightPx(8), 2.8 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // LOCKED badge shown only when player is within proximity
  if (active) {
    ctx.save();
    ctx.shadowColor = 'rgba(244,63,94,0.75)';
    ctx.shadowBlur = 9;
    ctx.fillStyle = '#f43f5e';
    ctx.font = `bold ${Math.max(7, 4 * u)}px "Fira Code", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('LOCKED', top.x, top.y - heightPx(40));
    ctx.textAlign = 'left';
    ctx.restore();
  }

  // Station label
  if (!s.suppressLabels || active) {
    ctx.fillStyle = active ? '#aef3ff' : 'rgba(140,195,220,0.75)';
    ctx.font = `${Math.max(8, 4.2 * u)}px "Fira Code", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText((active ? '▸ ' : '') + 'ELEVATOR', top.x, top.y - heightPx(15) - 8 * u);
    ctx.textAlign = 'left';
  }
}

// Distinct freestanding machine (ATM / vending / payphone) so each interaction
// object reads as a real, recognisable appliance built into the room — a
// coloured cabinet planted on the floor with a glowing faceplate + icon — rather
// than an identical generic kiosk with a floating dot.
interface MachineCfg {
  w: number; h: number;                // footprint width (tiles) + cabinet height
  top: string; topA: string;           // cabinet top face (idle / active)
  left: string; right: string;         // cabinet side faces
  rim: string; rimA: string;           // cabinet edge stroke (idle / active)
  face: string; faceA: string;         // glowing faceplate (idle / active)
  glow: string;                        // faceplate glow colour
  icon: string;                        // recognisable emoji icon
  label: string;                       // idle label colour
}
function drawMachine(ctx: CanvasRenderingContext2D, s: SceneCtx, st: OfficeStation, tx: number, ty: number, cfg: MachineCfg) {
  const { P, heightPx } = s;
  const active = s.playable && s.activeStationId === st.id;
  const u = (s.T / TILE) * 0.5;
  const w = st.footprint?.w ?? 1, d = st.footprint?.d ?? 1;
  const c = st.col, r = st.row;
  groundShadow(ctx, s, c, r, w, d, 0.36);
  // Cabinet body.
  isoBox(ctx, s, c, r, w, d, cfg.h, active ? cfg.topA : cfg.top, cfg.left, cfg.right, active ? cfg.rimA : cfg.rim);
  // Faceplate ("screen"/glass) floating just below the cabinet top, drawn in
  // screen space so it always faces the camera and reads clearly.
  const top = P(tx, ty);
  const fw = 8 * u, fh = 8 * u;
  const fy = top.y - heightPx(cfg.h) - fh * 0.15;
  ctx.save();
  if (active) { ctx.shadowColor = cfg.glow; ctx.shadowBlur = 14; }
  ctx.fillStyle = active ? cfg.faceA : cfg.face;
  rrect(ctx, top.x - fw / 2, fy, fw, fh, 1.6 * u);
  ctx.strokeStyle = active ? cfg.rimA : cfg.rim;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
  // Recognisable icon on the faceplate.
  ctx.save();
  ctx.font = `${Math.max(9, 5.4 * u)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(cfg.icon, top.x, fy + fh / 2 + 0.5 * u);
  ctx.restore();
  ctx.textBaseline = 'alphabetic';
  // Label — suppressed on mobile/touch unless this station is active.
  if (!s.suppressLabels || active) {
    ctx.fillStyle = active ? '#aef3ff' : cfg.label;
    ctx.font = `${Math.max(8, 4.2 * u)}px "Fira Code", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText((active ? '▸ ' : '') + st.label, top.x, fy - 4 * u);
    ctx.textAlign = 'left';
  }
}

const ATM_CFG: MachineCfg = {
  w: 1.1, h: 19,
  top: '#0e4034', topA: '#13564a', left: '#05201a', right: '#083026',
  rim: 'rgba(40,170,120,0.6)', rimA: 'rgba(90,255,200,0.95)',
  face: 'rgba(14,52,42,0.9)', faceA: 'rgba(120,255,210,0.92)', glow: 'rgba(80,255,200,0.9)',
  icon: '💵', label: 'rgba(120,220,180,0.85)',
};
const VENDING_CFG: MachineCfg = {
  w: 1.2, h: 20,
  top: '#4a0e2a', topA: '#5e1338', left: '#200512', right: '#360820',
  rim: 'rgba(236,72,153,0.6)', rimA: 'rgba(255,120,200,0.95)',
  face: 'rgba(42,10,26,0.9)', faceA: 'rgba(255,150,210,0.92)', glow: 'rgba(236,72,153,0.9)',
  icon: '🥤', label: 'rgba(240,160,200,0.85)',
};
const PAYPHONE_CFG: MachineCfg = {
  w: 0.85, h: 22,
  top: '#0e2a50', topA: '#133a66', left: '#05122a', right: '#082040',
  rim: 'rgba(56,150,240,0.6)', rimA: 'rgba(120,200,255,0.95)',
  face: 'rgba(10,28,58,0.9)', faceA: 'rgba(150,210,255,0.92)', glow: 'rgba(56,150,255,0.9)',
  icon: '☎️', label: 'rgba(150,200,255,0.85)',
};

function drawStation(ctx: CanvasRenderingContext2D, s: SceneCtx, st: OfficeStation, tx: number, ty: number) {
  const w = st.footprint?.w ?? 1;
  const d = st.footprint?.d ?? 1;
  // Each object gets a distinct, recognisable render so it reads as part of the
  // room — never an identical kiosk with a floating marker.
  if (st.glyph === 'elevator') { drawElevator(ctx, s, st, tx, ty); return; }
  if (st.glyph === 'atm') { drawMachine(ctx, s, st, tx, ty, ATM_CFG); return; }
  if (st.glyph === 'vending') { drawMachine(ctx, s, st, tx, ty, VENDING_CFG); return; }
  if (st.glyph === 'payphone') { drawMachine(ctx, s, st, tx, ty, PAYPHONE_CFG); return; }

  // Generic fallback kiosk for any other glyph.
  groundShadow(ctx, s, st.col, st.row, w, d);
  const active = s.playable && s.activeStationId === st.id;
  const accent = active ? '#aef3ff' : 'rgba(150,200,225,0.85)';
  isoBox(ctx, s, st.col, st.row, w, d, 13, active ? '#1d3550' : '#16283c', '#0e1c2c', '#13283c', active ? 'rgba(90,220,255,0.9)' : 'rgba(40,90,120,0.6)');
  const { P } = s;
  const top = P(tx, ty - 0.1);
  ctx.save();
  if (active) { ctx.shadowColor = 'rgba(90,220,255,0.9)'; ctx.shadowBlur = 14; }
  ctx.fillStyle = active ? '#7fe9ff' : '#3a90b8';
  ctx.beginPath(); ctx.arc(top.x, top.y - s.heightPx(15), 3 * (s.T / TILE) * 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (!s.suppressLabels || active) {
    ctx.fillStyle = accent;
    ctx.font = `${Math.max(8, 4.2 * (s.T / TILE) * 0.5)}px "Fira Code", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText((active ? '▸ ' : '') + st.label, top.x, top.y - s.heightPx(15) - 8 * (s.T / TILE) * 0.5);
    ctx.textAlign = 'left';
  }
}

function drawComputerMarker(ctx: CanvasRenderingContext2D, s: SceneCtx, tx: number, ty: number) {
  const { P } = s;
  const p = P(tx, ty);
  const u = (s.T / TILE) * 0.5;
  const t = (Math.sin(s.now / 400) + 1) / 2;
  // The player's HOME desk — visually distinct from generic desks/capsules:
  // a warm gold-accented private terminal that reads "this is mine". Sitting
  // here opens the terminal platform (the GAME hub) directly.
  const GOLD = '255,205,90';
  groundShadow(ctx, s, tx - 1.0, ty - 0.4, 2.0, 0.9, 0.4);
  // Distinct gold desk block beneath the terminal.
  isoBox(ctx, s, tx - 1.0, ty - 0.4, 2.0, 0.9, 9, '#3a2c0e', '#241a06', '#2e2208', `rgba(${GOLD},0.55)`);
  // Glowing gold terminal tower on the desk.
  ctx.save();
  ctx.shadowColor = `rgba(${GOLD},0.9)`; ctx.shadowBlur = 8 + t * 8;
  isoBox(ctx, s, tx - 0.45, ty - 0.25, 0.9, 0.45, 16, '#1a1305', `rgba(${GOLD},0.45)`, `rgba(${GOLD},${0.7 + t * 0.3})`, `rgba(${GOLD},0.9)`);
  ctx.restore();
  // Floating terminal glyph.
  ctx.save();
  ctx.shadowColor = `rgba(${GOLD},0.9)`; ctx.shadowBlur = 8 + t * 6;
  ctx.fillStyle = `rgba(255,225,150,${0.75 + t * 0.25})`;
  ctx.font = `${Math.max(12, 8 * u)}px serif`;
  ctx.textAlign = 'center';
  ctx.fillText('🖥️', p.x, p.y - s.heightPx(20));
  ctx.restore();
  // "YOUR DESK" nameplate so it's unmistakably the player's own station.
  ctx.save();
  ctx.fillStyle = `rgba(${GOLD},${0.85 + t * 0.15})`;
  ctx.font = `${Math.max(8, 3.6 * u)}px "Fira Code", monospace`;
  ctx.textAlign = 'center';
  const deskLabel = (s.playerName && s.playerName.trim())
    ? s.playerName.trim().toUpperCase().slice(0, 18)
    : 'YOUR DESK';
  ctx.fillText(deskLabel, p.x, p.y - s.heightPx(30));
  ctx.restore();
  ctx.textAlign = 'left';
}

function drawCapsule(
  ctx: CanvasRenderingContext2D,
  s: SceneCtx,
  spot: { col: number; row: number; w: number; d: number },
  bot: PixelOfficeBot,
  i: number,
) {
  const { P } = s;
  const tx = spot.col + spot.w / 2, ty = spot.row + spot.d;
  const p = P(tx, ty);
  const u = (s.T / TILE) * 0.5;
  const pulse = (Math.sin(s.now / 900 + i) + 1) / 2;
  const accent = bot.teamColor ?? 'rgba(140,210,255,0.8)';
  groundShadow(ctx, s, spot.col, spot.row, spot.w, spot.d);
  const botActive = s.playable && s.activeBotId === bot.id;
  if (botActive) {
    ctx.save();
    ctx.strokeStyle = 'rgba(120,240,255,0.95)'; ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(120,240,255,0.9)'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 9 * u, 3.8 * u, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
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
  // name + zzz — suppressed on mobile/touch
  if (!s.suppressLabels) {
    ctx.fillStyle = bot.teamColor ?? 'rgba(140,200,255,0.8)';
    ctx.font = `${Math.max(7, 3.4 * u)}px "Fira Code", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(`${bot.name.slice(0, 6).toUpperCase()} 💤`, p.x, p.y + 8 * u);
    ctx.textAlign = 'left';
  }
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
  // nameplate — suppressed on mobile/touch
  const top = P(room.x + room.w / 2, room.y);
  if (!s.suppressLabels) {
    ctx.fillStyle = accent;
    ctx.font = `${Math.max(8, 4.4 * (s.T / TILE) * 0.5)}px "Fira Code", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText((room.label ?? 'OFFICE').toUpperCase(), top.x, top.y - s.heightPx(16));
    if (room.sub) {
      ctx.fillStyle = 'rgba(200,210,255,0.7)';
      ctx.font = `${Math.max(6, 3 * (s.T / TILE) * 0.5)}px "Fira Code", monospace`;
      ctx.fillText(room.sub.toUpperCase(), top.x, top.y - s.heightPx(16) + 9 * (s.T / TILE) * 0.5);
    }
    ctx.textAlign = 'left';
  }
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
