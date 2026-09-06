import React, { useEffect, useMemo, useRef, useState } from 'react';
import { type Appearance, drawPlayerSprite } from '@/lib/character-identity';
import type { OfficeStation, OfficeRoom, PixelOfficeBot } from '@/components/office/office-types';
import { approachMovementVelocity, isometricKeyboardMovementVector } from '@/lib/movement';
import {
  findOfficeRoute,
  getOfficeBlockedTiles,
  routeOfficePath,
  type OfficePropertyLayout,
} from '@/lib/office-property-layouts';
import { sfxStep } from '@/soundEngine';
import { useLowGfx } from '@/lib/lowGfx';

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

/** Non-interactive people placed directly on a shared floor (visitors, staff,
 * queue members). Unlike activeBots these occupants stand in the room and do
 * not require a desk or capsule. */
export interface OfficeAmbientOccupant {
  id: number;
  name: string;
  col: number;
  row: number;
  color?: string;
  /** Optional looped route for staff who work the floor instead of standing still. */
  path?: readonly { col: number; row: number }[];
  speed?: number;
  role?: string;
  /** Concrete task shown above the resident while they follow their route. */
  workLabel?: string;
  /** Workspace-relative public art path, resolved against the artifact base URL. */
  artSrc?: string;
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
  lighting?: 'dim' | 'normal' | 'bright' | 'warm' | 'cool';
  hallwayStyle?: 'central' | 'gallery' | 'executive';
  hallwaySignage?: string;
  mode?: 'wander' | 'still' | 'at-desk';
  /** Walk-up activation for a bullpen/capsule bot — opens its command center.
   *  Mirrors the YOUR DESK computer interaction; computer keeps precedence. */
  onBotInteract?: (bot: { id: number; name: string }) => void;
  /** Walk-up activation for a physical Tower resident/operator. */
  onAmbientInteract?: (occupant: { id: number; name: string }) => void;
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
  /** Use the shipped Shadow Tower wall, floor and terminal artwork. */
  towerArt?: boolean;
  /** Optional authored environment plate behind the playable geometry. */
  backdropSrc?: string | null;
  /** Standing scene population that is not part of the player's bot roster. */
  ambientOccupants?: OfficeAmbientOccupant[];
  /** In-world speech bubble and compact response choices for an ambient NPC. */
  dialogue?: {
    occupantId: number;
    text: string;
    options: readonly { id: string; label: string }[];
    onOption: (id: string) => void;
  } | null;
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
  onAmbientInteract,
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
  hallwayStyle,
  hallwaySignage,
  towerArt = true,
  backdropSrc = null,
  ambientOccupants = [],
  dialogue = null,
}: IsoOfficeProps) {
  const [lowGfx] = useLowGfx();
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
    () => layout.playerDesk ? [{ c: layout.playerDesk.col, r: layout.playerDesk.row, w: layout.playerDesk.w, d: layout.playerDesk.d, ci: 0, ri: 0 }] : [],
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
  const COMPUTER_X = layout.playerDesk
    ? (layout.playerDesk.col + layout.playerDesk.w / 2) * TILE
    : layout.spawn.x;
  const COMPUTER_Y = layout.playerDesk
    ? (layout.playerDesk.row + layout.playerDesk.d) * TILE
    : layout.spawn.y;
  const hasComputer = Boolean(layout.playerDesk);

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
    if (onEnterTerminal && hasComputer) {
      addRect(COMPUTER_X / TILE - 1.0, COMPUTER_Y / TILE - 0.4, COMPUTER_X / TILE + 1.0, COMPUTER_Y / TILE + 0.5);
    }
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, stations, onEnterTerminal]);

  // Authored resident paths describe intent, not geometry. Project them through
  // the same authoritative floor collision contract as the player so staff
  // avoid walls, furniture, stations, and lift banks when a layout changes.
  const collisionSafeAmbientOccupants = useMemo(
    () => ambientOccupants.map((occupant) => ({
      ...occupant,
      path: occupant.path && occupant.path.length > 1
        ? routeOfficePath(layout, occupant.path)
        : occupant.path,
    })),
    [ambientOccupants, layout],
  );

  // ── Refs the rAF loop reads (so the loop never restarts on prop churn) ──
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fxRef = useRef<number>(initialPose?.x ?? Math.round((effectiveBullpen ? bullpenShift + rightCols / 2 : cols / 2) * TILE));
  const fyRef = useRef<number>(initialPose?.y ?? Math.round((rows - 3) * TILE));
  const facingRef = useRef<'left' | 'right'>(initialPose?.facing ?? 'right');
  const walkRef = useRef(0); // 0..1 walk phase for a tiny bob
  const runRef = useRef(false); // true while sprinting (Shift held / long tap)
  const velocityRef = useRef<Vec2>({ x: 0, y: 0 });
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
  const activeAmbientRef = useRef<{ id: number; name: string } | null>(null);
  const onBotInteractRef = useRef(onBotInteract);
  const onAmbientInteractRef = useRef(onAmbientInteract);
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
  const hallwayStyleRef = useRef(hallwayStyle);
  const hallwaySignageRef = useRef(hallwaySignage);
  const ambientOccupantsRef = useRef(ambientOccupants);
  const dialogueRef = useRef(dialogue);

  const [nearComputer, setNearComputer] = useState(false);
  const [activeStationId, setActiveStationId] = useState<string | null>(null);
  const [activeBot, setActiveBot] = useState<{ id: number; name: string } | null>(null);
  const [activeAmbient, setActiveAmbient] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => {
    frozenRef.current = frozen;
    if (frozen) {
      heldRef.current.clear();
      tapTargetRef.current = null;
      tapPathRef.current = [];
      velocityRef.current = { x: 0, y: 0 };
    }
  }, [frozen]);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { followRef.current = followCam; }, [followCam]);
  useEffect(() => { suppressLabelsRef.current = suppressLabels; }, [suppressLabels]);
  useEffect(() => { playerNameRef.current = playerName; }, [playerName]);
  useEffect(() => { accentColorRef.current = accentColor; }, [accentColor]);
  useEffect(() => { lightingRef.current = lighting; }, [lighting]);
  useEffect(() => { hallwayStyleRef.current = hallwayStyle; }, [hallwayStyle]);
  useEffect(() => { hallwaySignageRef.current = hallwaySignage; }, [hallwaySignage]);
  useEffect(() => { ambientOccupantsRef.current = collisionSafeAmbientOccupants; }, [collisionSafeAmbientOccupants]);
  useEffect(() => { dialogueRef.current = dialogue; }, [dialogue]);
  useEffect(() => { onEnterRef.current = onEnterTerminal; }, [onEnterTerminal]);
  useEffect(() => { onMoveRef.current = onMove; }, [onMove]);
  useEffect(() => { onPoseChangeRef.current = onPoseChange; }, [onPoseChange]);
  useEffect(() => { onBotInteractRef.current = onBotInteract; }, [onBotInteract]);
  useEffect(() => { onAmbientInteractRef.current = onAmbientInteract; }, [onAmbientInteract]);
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
    let lastRenderedAt = 0;
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
      if (lowGfx && lastRenderedAt !== 0 && now - lastRenderedAt < 1000 / 30) {
        raf = window.requestAnimationFrame(tick);
        return;
      }
      const dt = Math.min(50, Math.max(0, now - last));
      last = now;
      lastRenderedAt = now;

      const S = scaleRef.current || 1;
      const T = TILE * S; // px per tile-axis
      const HW = T * 0.5;
      const HH = T * 0.25;
      const viewW = viewWRef.current;
      const viewH = viewHRef.current;
      const dpr = lowGfx ? 1 : Math.min(2, window.devicePixelRatio || 1);

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
        const keyboard = isometricKeyboardMovementVector(k);
        const dx = keyboard.x;
        const dy = keyboard.y;
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
        const runMul = running ? 1.75 : 1;
        const velocity = approachMovementVelocity(
          velocityRef.current,
          moving ? { x: vx * runMul, y: vy * runMul } : { x: 0, y: 0 },
          dt / (1000 / 60),
        );
        velocityRef.current = velocity;
        const smoothMoving = Math.hypot(velocity.x, velocity.y) > 0.015;
        runRef.current = running && smoothMoving;

        if (smoothMoving) {
          const step = SPEED * (dt / 1000);
          let nx = fxRef.current + velocity.x * step;
          let ny = fyRef.current + velocity.y * step;
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
          if (Math.abs(velocity.x) > 0.01) facingRef.current = velocity.x > 0 ? 'right' : 'left';
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

        // Proximity — computer + resident + nearest station (world-space).
        const cx = fxRef.current;
        const cy = fyRef.current;
        if (onEnterRef.current) {
          const near = Math.hypot(cx - COMPUTER_X, cy - COMPUTER_Y) <= 26;
          if (near !== nearComputerRef.current) { nearComputerRef.current = near; setNearComputer(near); }
        }
        let bestAmbient: { id: number; name: string } | null = null;
        let bestAmbientDist = Infinity;
        for (const occupant of ambientOccupantsRef.current) {
          const position = getAmbientPosition(occupant, now);
          const distance = Math.hypot(cx - position.col * TILE, cy - position.row * TILE);
          if (distance <= 30 && distance < bestAmbientDist) {
            bestAmbientDist = distance;
            bestAmbient = { id: occupant.id, name: occupant.name };
          }
        }
        if (bestAmbient?.id !== activeAmbientRef.current?.id) {
          activeAmbientRef.current = bestAmbient;
          setActiveAmbient(bestAmbient);
          // The lobby is a first-person tutorial, not a keyboard puzzle. When
          // the player walks close enough to someone, begin their conversation
          // automatically. The response buttons remain the only interaction.
          if (bestAmbient && !dialogueRef.current) {
            onAmbientInteractRef.current?.(bestAmbient);
          }
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
        suppressLabels: suppressLabelsRef.current,
        playerName: playerNameRef.current,
        accentColor: accentColorRef.current,
        lighting: lightingRef.current,
        hallwayStyle: hallwayStyleRef.current,
        hallwaySignage: hallwaySignageRef.current,
        towerArt,
        ambientOccupants: ambientOccupantsRef.current,
        dialogue: dialogueRef.current,
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
        if (hasComputer && nearComputerRef.current) { onEnterRef.current?.(); return; }
        if (activeAmbientRef.current) { onAmbientInteractRef.current?.(activeAmbientRef.current); return; }
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
  }, [playable, effectiveBullpen, cols, rows, leftCols, bullpenShift, rightCols, doorTopRow, doorBotRow, worldW, worldH, lowGfx]);

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
    if (hasComputer && onEnterTerminal && Math.hypot(localX - deskPoint.x, localY - (deskPoint.y - T * 0.55)) <= Math.max(34, T * 0.9)) {
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

  const showComputerPrompt = hasComputer && !!onEnterTerminal && nearComputer;
  // Precedence: computer (YOUR DESK) > resident > bot command center > station.
  const promptAmbient = !nearComputer && activeAmbient ? activeAmbient : undefined;
  const promptBot = !nearComputer && !promptAmbient && activeBot ? activeBot : undefined;
  const promptStation = !nearComputer && !promptAmbient && !promptBot && activeStationId
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
        backgroundImage: backdropSrc
          ? 'linear-gradient(180deg, rgba(5,8,15,.32), rgba(5,8,15,.78)), var(--iso-office-backdrop)'
          : 'radial-gradient(130% 110% at 50% 0%, #1a0d3a 0%, #0a0719 52%, #04030d 100%)',
        backgroundSize: backdropSrc ? 'cover' : undefined,
        backgroundPosition: backdropSrc ? 'center' : undefined,
        backgroundRepeat: 'no-repeat',
        ['--iso-office-backdrop' as string]: backdropSrc ? `url("${backdropSrc}")` : undefined,
        boxShadow: '0 0 0 1px rgba(150,120,255,.30), inset 0 0 90px rgba(8,4,26,.85)',
        cursor: playable ? 'pointer' : 'default',
        touchAction: playable ? 'none' : 'auto',
        userSelect: 'none',
      }}
    >
      <canvas ref={canvasRef} style={{ display: 'block', imageRendering: 'pixelated' }} />
      {playable && !dialogue && !activeAmbient ? (
        <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2 border border-white/20 bg-[#10271f]/85 px-3 py-2 text-[10px] font-bold tracking-[.14em] text-emerald-50 shadow-lg">
          CLICK A TILE TO WALK · WALK TO A PERSON TO TALK
        </div>
      ) : null}
      {dialogue?.options?.length ? (
        <div
          className="pointer-events-auto absolute bottom-3 left-1/2 z-40 flex w-[min(92%,34rem)] -translate-x-1/2 flex-col items-stretch gap-2 border border-emerald-200/35 bg-[#0a1712]/95 p-2 shadow-[0_8px_28px_rgba(0,0,0,.4)]"
          data-testid="office-dialogue-options"
          role="group"
          aria-label="Dialogue responses"
        >
          <div className="flex flex-wrap justify-center gap-2">
          {dialogue.options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => dialogue.onOption(option.id)}
              className="border border-emerald-200/65 bg-[#10271f]/95 px-3 py-2 text-[10px] font-bold tracking-[.12em] text-emerald-50 shadow-[0_8px_24px_rgba(0,0,0,.35)] transition hover:border-amber-200 hover:bg-[#214936]"
            >
              {option.label}
            </button>
          ))}
          </div>
        </div>
      ) : null}

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

      {/* Walk-up prompt — computer > resident > bot command center > nearest station. */}
      {playable && !frozen && (showComputerPrompt || promptAmbient || promptBot || promptStation) && (
        <button
          type="button"
          data-testid={
            showComputerPrompt
              ? 'office-computer-enter'
              : promptAmbient
                ? `office-resident-${promptAmbient.id}`
                : promptBot
                  ? `office-bot-${promptBot.id}`
                : `office-station-${promptStation?.id}`
          }
          onClick={
            showComputerPrompt
              ? () => onEnterTerminal?.()
              : promptAmbient
                ? () => onAmbientInteract?.(promptAmbient)
                : promptBot
                  ? () => onBotInteract?.(promptBot)
                : () => promptStation?.onInteract()
          }
          style={{
            position: 'absolute', left: '50%', bottom: 14, transform: 'translateX(-50%)',
            minHeight: 44,
            maxWidth: 'calc(100% - 24px)',
            padding: '.65rem 1rem',
            background: 'linear-gradient(135deg, rgba(196,126,63,.95), rgba(64,199,190,.86))',
            border: '1px solid rgba(244,180,255,.95)', borderRadius: 6, color: '#0a0414',
            font: 'bold .7rem "var(--font-sans)", monospace', letterSpacing: '.16em',
            cursor: 'pointer', zIndex: 30, boxShadow: '0 0 18px rgba(196,126,63,.48)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          ▸ {showComputerPrompt
            ? 'ENTER TERMINAL'
            : promptAmbient
              ? `TALK TO ${promptAmbient.name.toUpperCase()}`
              : promptBot
                ? `MANAGE ${promptBot.name.toUpperCase()}`
              : promptStation?.label}
          {isTouch ? ' · TAP TO USE' : ' · E · USE'}
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
  suppressLabels?: boolean;
  playerName?: string;
  accentColor?: string | null;
  lighting: 'dim' | 'normal' | 'bright' | 'warm' | 'cool';
  hallwayStyle?: 'central' | 'gallery' | 'executive';
  hallwaySignage?: string;
  towerArt: boolean;
  ambientOccupants: OfficeAmbientOccupant[];
  dialogue?: {
    occupantId: number;
    text: string;
  } | null;
}

function getAmbientPosition(occupant: OfficeAmbientOccupant, now: number): { col: number; row: number } {
  const path = occupant.path;
  if (!path || path.length < 2) return { col: occupant.col, row: occupant.row };
  const phase = ((now / 1000) * (occupant.speed ?? 0.15) + occupant.id * 0.37) % path.length;
  const index = Math.floor(phase);
  const progress = phase - index;
  const from = path[index] ?? path[0];
  const to = path[(index + 1) % path.length] ?? path[0];
  return {
    col: from.col + (to.col - from.col) * progress,
    row: from.row + (to.row - from.row) * progress,
  };
}

function drawScene(ctx: CanvasRenderingContext2D, s: SceneCtx) {
  const { P, heightPx, cols, rows, T } = s;
  const accent = /^#[0-9a-f]{6}$/i.test(s.accentColor ?? '') ? s.accentColor! : '#c47e3f';

  // ---- Floor ----
  // Solid base quad.
  const fA = P(0, 0), fB = P(cols, 0), fC = P(cols, rows), fD = P(0, rows);
  ctx.beginPath();
  ctx.moveTo(fA.x, fA.y); ctx.lineTo(fB.x, fB.y); ctx.lineTo(fC.x, fC.y); ctx.lineTo(fD.x, fD.y); ctx.closePath();
  const fg = ctx.createLinearGradient(fA.x, fA.y, fC.x, fC.y);
  if (s.lighting === 'warm') {
    fg.addColorStop(0, '#30221d');
    fg.addColorStop(0.55, '#21191a');
    fg.addColorStop(1, '#111218');
  } else if (s.lighting === 'cool') {
    fg.addColorStop(0, '#142a32');
    fg.addColorStop(0.55, '#0f1b25');
    fg.addColorStop(1, '#081017');
  } else {
    fg.addColorStop(0, '#17252b');
    fg.addColorStop(0.55, '#101b23');
    fg.addColorStop(1, '#091118');
  }
  ctx.fillStyle = fg;
  ctx.fill();
  if (s.towerArt) {
    const floorArt = getMachineArt(`${import.meta.env.BASE_URL}pixel-agents/assets/floors/floor_0.png`);
    if (floorArt?.complete && floorArt.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(fA.x, fA.y); ctx.lineTo(fB.x, fB.y); ctx.lineTo(fC.x, fC.y); ctx.lineTo(fD.x, fD.y); ctx.closePath();
      ctx.clip();
      const pattern = ctx.createPattern(floorArt, 'repeat');
      if (pattern) {
         ctx.globalAlpha = 0.72;
        ctx.fillStyle = pattern;
        const minX = Math.min(fA.x, fB.x, fC.x, fD.x);
        const minY = Math.min(fA.y, fB.y, fC.y, fD.y);
        const maxX = Math.max(fA.x, fB.x, fC.x, fD.x);
        const maxY = Math.max(fA.y, fB.y, fC.y, fD.y);
        ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
      }
      ctx.restore();
    }
  }
  ctx.save();
  ctx.globalAlpha = s.lighting === 'bright' ? 0.22 : s.lighting === 'dim' ? 0.08 : 0.14;
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1, T / 20);
  ctx.stroke();
  ctx.restore();

  // Grid lines.
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(141,198,191,0.12)';
  for (let c = 0; c <= cols; c++) { const a = P(c, 0), b = P(c, rows); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  for (let r = 0; r <= rows; r++) { const a = P(0, r), b = P(cols, r); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }

  drawHallwayTreatment(ctx, s);

  // Neon floor rim along the two FRONT edges.
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(196,126,63,0.58)';
  ctx.beginPath(); ctx.moveTo(fD.x, fD.y); ctx.lineTo(fC.x, fC.y); ctx.lineTo(fB.x, fB.y); ctx.stroke();

  // ---- Back walls (glass + city skyline) ----
  // The walls are projected from the same floor corners as movement/collision;
  // there is no screen-sized illustration to drift away from the playable map.
  drawCityWall(ctx, s, 'right'); // along (0,0)->(cols,0)
  drawCityWall(ctx, s, 'left');  // along (0,0)->(0,rows)
  drawOfficeMediaDecor(ctx, s);

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

  // Visitors and staff who belong to the room itself rather than a desk.
  for (const occupant of s.ambientOccupants) {
    const position = getAmbientPosition(occupant, s.now);
    push(position.col, position.row, () => drawBot(ctx, s, position.col, position.row, {
      id: occupant.id,
      name: occupant.name,
      status: 'active',
      teamColor: occupant.color,
      workLabel: occupant.workLabel,
      role: occupant.role,
      artSrc: occupant.artSrc,
      dialogueText: occupant.id === s.dialogue?.occupantId ? s.dialogue.text : undefined,
    }));
  }

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
  if (s.towerArt) {
    const terminalArt = getMachineArt(`${import.meta.env.BASE_URL}pixel-agents/shadow-tower/public-terminal.png`);
    if (terminalArt?.complete && terminalArt.naturalWidth > 0) {
      const anchor = P(d.c + d.w / 2, d.r + d.d * 0.4);
      const artW = Math.max(16, 12 * (s.T / TILE));
      const artH = artW * (terminalArt.naturalHeight / terminalArt.naturalWidth);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(terminalArt, anchor.x - artW / 2, anchor.y - artH - h0, artW, artH);
      ctx.restore();
    }
  }
  // Chair in front of the desk.
  drawChair(ctx, s, d.c + d.w / 2 - 0.4, d.r + d.d + 0.15);
}

function drawChair(ctx: CanvasRenderingContext2D, s: SceneCtx, c: number, r: number) {
  isoBox(ctx, s, c, r, 0.8, 0.8, 5, '#d8623a', '#a8432a', '#c25234'); // seat
  isoBox(ctx, s, c, r, 0.8, 0.2, 12, '#e0764a', '#b04a2c', '#cc5e38'); // back
}

function drawBot(
  ctx: CanvasRenderingContext2D,
  s: SceneCtx,
  tx: number,
  ty: number,
  bot: PixelOfficeBot & { workLabel?: string; role?: string; artSrc?: string; dialogueText?: string },
) {
  const { P } = s;
  const p = P(tx, ty);
  const u = Math.max(0.7, (s.T / TILE) * 0.5);
  const bob = Math.sin(s.now / 600 + bot.id) * 1.2;
  const col = bot.teamColor ?? botColor(bot.id);
  const active = s.playable && s.activeBotId === bot.id;
  const bodyW = 9 * u;
  const bodyH = 10 * u;

  // A compact paper-doll silhouette gives every bot a readable head, uniform,
  // legs and team-coloured jacket while keeping the existing desk footprint.
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.ellipse(p.x, p.y, 7 * u, 3.2 * u, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // Walk-up highlight ring when this bot is the active interaction target.
  if (active) {
    ctx.save();
    ctx.strokeStyle = 'rgba(120,240,255,0.95)'; ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(120,240,255,0.9)'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 8 * u, 3.6 * u, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  const baseY = p.y + bob;
  const namedArt = bot.artSrc
    ? getMachineArt(`${import.meta.env.BASE_URL}${bot.artSrc.replace(/^\/+/, '')}`)
    : null;
  if (namedArt?.complete && namedArt.naturalWidth > 0) {
    // All named Tower residents occupy the same character frame as the
    // procedural residents: fixed 24×32 logical px, feet on the same baseline.
    // This keeps a single hand-painted asset from reading as a giant or tiny
    // exception when it shares a floor with the NPC paper dolls.
    const frameW = 24 * u;
    const frameH = 32 * u;
    const fit = Math.min(frameW / namedArt.naturalWidth, frameH / namedArt.naturalHeight);
    const artW = namedArt.naturalWidth * fit;
    const artH = namedArt.naturalHeight * fit;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(namedArt, p.x - artW / 2, baseY - artH, artW, artH);
    ctx.restore();
    drawAmbientWorkBadge(ctx, s, p.x, baseY - artH, u, bot.workLabel);
    drawSpeechBubble(ctx, p.x, baseY - artH - 8 * u, u, bot.dialogueText);
    ctx.fillStyle = active ? '#b9f5ff' : bot.teamColor ?? 'rgba(180,255,220,0.85)';
    ctx.font = `700 ${Math.max(7, 4 * u)}px "Fira Code", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(bot.name.slice(0, 14).toUpperCase(), p.x, baseY + 7 * u);
    ctx.textAlign = 'left';
    return;
  }
  const legY = baseY - 2 * u;
  const hipY = baseY - bodyH - 4 * u;
  const headR = 3.4 * u;
  const headY = hipY - 4.7 * u;
  ctx.save();
  ctx.translate(p.x, 0);
  ctx.lineCap = 'round';

  // Shoes and legs.
  ctx.strokeStyle = '#07111b';
  ctx.lineWidth = Math.max(1.5, 2.2 * u);
  ctx.beginPath(); ctx.moveTo(-2.1 * u, legY); ctx.lineTo(-2.1 * u, hipY + 3.8 * u); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(2.1 * u, legY); ctx.lineTo(2.1 * u, hipY + 3.8 * u); ctx.stroke();
  ctx.strokeStyle = 'rgba(180,220,230,.7)';
  ctx.lineWidth = Math.max(1, 0.8 * u);
  ctx.beginPath(); ctx.moveTo(-3.2 * u, legY + .2 * u); ctx.lineTo(-1.2 * u, legY + .2 * u); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(1.2 * u, legY + .2 * u); ctx.lineTo(3.2 * u, legY + .2 * u); ctx.stroke();

  // Jacket/torso with a contrasting shoulder seam.
  ctx.fillStyle = col;
  rrect(ctx, -bodyW / 2, hipY, bodyW, bodyH, 2 * u);
  ctx.fillStyle = 'rgba(4,12,22,.44)';
  ctx.fillRect(-bodyW * .38, hipY + bodyH * .48, bodyW * .76, Math.max(1, .8 * u));
  ctx.fillStyle = active ? '#b9f5ff' : 'rgba(180,230,240,.7)';
  ctx.fillRect(-.55 * u, hipY + 2.2 * u, 1.1 * u, 2.1 * u);

  // Arms rest toward the desk, with a small angular elbow.
  ctx.strokeStyle = shade(col, -20);
  ctx.lineWidth = Math.max(1.5, 1.8 * u);
  ctx.beginPath(); ctx.moveTo(-bodyW * .44, hipY + 3 * u); ctx.lineTo(-bodyW * .66, hipY + 7 * u); ctx.lineTo(-bodyW * .44, hipY + 8.2 * u); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bodyW * .44, hipY + 3 * u); ctx.lineTo(bodyW * .66, hipY + 7 * u); ctx.lineTo(bodyW * .44, hipY + 8.2 * u); ctx.stroke();

  // Neck, face and hair cap.
  ctx.fillStyle = '#d89d7e';
  ctx.fillRect(-1.2 * u, hipY - 1.2 * u, 2.4 * u, 2 * u);
  ctx.fillStyle = '#f1c9a5';
  ctx.beginPath(); ctx.arc(0, headY, headR, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = shade(col, -35);
  ctx.beginPath(); ctx.arc(0, headY - headR * .5, headR * .9, Math.PI, Math.PI * 2); ctx.fill();
  const eyeDx = headR * .42;
  const eyeR = Math.max(.7, headR * .18);
  ctx.fillStyle = '#1c1024';
  ctx.beginPath(); ctx.arc(-eyeDx, headY - headR * .02, eyeR, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(eyeDx, headY - headR * .02, eyeR, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // name plate
  ctx.fillStyle = active ? '#b9f5ff' : bot.teamColor ?? 'rgba(180,255,220,0.85)';
  ctx.font = `700 ${Math.max(7, 4 * u)}px "Fira Code", monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(bot.name.slice(0, 8).toUpperCase(), p.x, baseY + 7 * u);
  ctx.textAlign = 'left';
  drawAmbientWorkBadge(ctx, s, p.x, headY, u, bot.workLabel);
  drawSpeechBubble(ctx, p.x, headY - 8 * u, u, bot.dialogueText);
}

function drawSpeechBubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  u: number,
  text?: string,
) {
  if (!text) return;
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  ctx.save();
  ctx.font = `600 ${Math.max(8, 3.6 * u)}px "Fira Code", monospace`;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > 150 * u && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, 3);
  const width = Math.min(176 * u, Math.max(72 * u, ...shown.map((item) => ctx.measureText(item).width + 14 * u)));
  const lineHeight = Math.max(10, 7 * u);
  const height = shown.length * lineHeight + 12 * u;
  const left = x - width / 2;
  const top = y - height;
  ctx.fillStyle = "rgba(248, 252, 235, .96)";
  rrect(ctx, left, top, width, height, 4 * u);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 4 * u, top + height);
  ctx.lineTo(x + 1 * u, top + height + 7 * u);
  ctx.lineTo(x + 7 * u, top + height);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#173b2c";
  ctx.textAlign = "center";
  shown.forEach((item, index) => ctx.fillText(item, x, top + (index + 1) * lineHeight + 2 * u));
  ctx.restore();
}

function drawAmbientWorkBadge(
  ctx: CanvasRenderingContext2D,
  s: SceneCtx,
  x: number,
  y: number,
  u: number,
  workLabel?: string,
) {
  if (!workLabel) return;
  const text = `WORK · ${workLabel.slice(0, 22).toUpperCase()}`;
  ctx.save();
  ctx.font = `700 ${Math.max(7, 3.1 * u)}px "Fira Code", monospace`;
  ctx.textAlign = "center";
  const width = Math.min(150 * u, Math.max(48 * u, ctx.measureText(text).width + 8 * u));
  const height = Math.max(11 * u, 10);
  ctx.fillStyle = "rgba(5, 18, 29, .9)";
  rrect(ctx, x - width / 2, y - 12 * u, width, height, 2 * u);
  ctx.fill();
  ctx.strokeStyle = "rgba(103, 232, 249, .72)";
  ctx.lineWidth = Math.max(1, u * .45);
  ctx.stroke();
  ctx.fillStyle = "#a5f3fc";
  ctx.fillText(text, x, y - 4 * u);
  ctx.restore();
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
    // Deterministic fallback for a save without appearance data. Keep it
    // deliberately close to the paper-doll proportions above instead of
    // dropping to a featureless rectangle.
    const baseY = p.y + bob;
    const bodyW = 8 * u;
    const bodyH = 10 * u;
    const headR = 3.2 * u;
    const headY = baseY - bodyH - 5.2 * u;
    ctx.save();
    ctx.translate(p.x, 0);
    ctx.strokeStyle = '#101827';
    ctx.lineWidth = Math.max(1.5, 2 * u);
    ctx.beginPath(); ctx.moveTo(-1.8 * u, baseY); ctx.lineTo(-1.8 * u, baseY - 4 * u); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(1.8 * u, baseY); ctx.lineTo(1.8 * u, baseY - 4 * u); ctx.stroke();
    ctx.fillStyle = '#ffd24a';
    rrect(ctx, -bodyW / 2, baseY - bodyH - 3 * u, bodyW, bodyH, 2 * u);
    ctx.fillStyle = 'rgba(8,16,28,.5)';
    ctx.fillRect(-bodyW * .36, baseY - bodyH + 2 * u, bodyW * .72, Math.max(1, .8 * u));
    ctx.fillStyle = '#d89d7e';
    ctx.fillRect(-1.1 * u, headY + headR - .2 * u, 2.2 * u, 2 * u);
    ctx.fillStyle = '#f1c9a5';
    ctx.beginPath(); ctx.arc(0, headY, headR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7c5b3e';
    ctx.beginPath(); ctx.arc(0, headY - headR * .52, headR * .92, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1c1024';
    ctx.fillRect(-headR * .52, headY - .2 * u, Math.max(1, .8 * u), Math.max(1, .7 * u));
    ctx.fillRect(headR * .18, headY - .2 * u, Math.max(1, .8 * u), Math.max(1, .7 * u));
    ctx.restore();
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
// coloured cabinet planted on the floor with a geometric faceplate — rather than
// an identical generic kiosk with a floating dot.
interface MachineCfg {
  w: number; h: number;                // footprint width (tiles) + cabinet height
  top: string; topA: string;           // cabinet top face (idle / active)
  left: string; right: string;         // cabinet side faces
  rim: string; rimA: string;           // cabinet edge stroke (idle / active)
  face: string; faceA: string;         // glowing faceplate (idle / active)
  glow: string;                        // faceplate glow colour
  label: string;                       // idle label colour
  artSrc?: string;                     // real object art used in the playable room
}

const machineArtCache = new Map<string, HTMLImageElement>();
function getMachineArt(src: string): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  const cached = machineArtCache.get(src);
  if (cached) return cached;
  const image = new Image();
  image.src = src;
  machineArtCache.set(src, image);
  return image;
}

function drawMachine(ctx: CanvasRenderingContext2D, s: SceneCtx, st: OfficeStation, tx: number, ty: number, cfg: MachineCfg) {
  const { P, heightPx } = s;
  const active = s.playable && s.activeStationId === st.id;
  const u = (s.T / TILE) * 0.5;
  const w = st.footprint?.w ?? 1, d = st.footprint?.d ?? 1;
  const c = st.col, r = st.row;
  groundShadow(ctx, s, c, r, w, d, 0.36);
  const objectArt = cfg.artSrc ? getMachineArt(cfg.artSrc) : null;
  if (objectArt?.complete && objectArt.naturalWidth > 0) {
    const anchor = P(tx, ty + d * .45);
    const artW = 22 * u;
    const artH = artW * (objectArt.naturalHeight / objectArt.naturalWidth);
    ctx.save();
    if (active) {
      ctx.shadowColor = cfg.glow;
      ctx.shadowBlur = 14;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(objectArt, anchor.x - artW / 2, anchor.y - artH, artW, artH);
    ctx.restore();
    if (!s.suppressLabels || active) {
      ctx.fillStyle = active ? '#aef3ff' : cfg.label;
      ctx.font = `${Math.max(8, 4.2 * u)}px "Fira Code", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText((active ? '▸ ' : '') + st.label, anchor.x, anchor.y - artH - 4 * u);
      ctx.textAlign = 'left';
    }
    return;
  }
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
  // Geometric status bars keep the fallback machine legible without relying on
  // pictograms that can render differently across platforms.
  ctx.save();
  ctx.fillStyle = active ? 'rgba(226,232,240,.9)' : 'rgba(148,163,184,.62)';
  ctx.fillRect(top.x - fw * .3, fy + fh * .25, fw * .6, Math.max(1, u * .35));
  ctx.fillStyle = active ? 'rgba(125,211,252,.72)' : 'rgba(100,116,139,.5)';
  ctx.fillRect(top.x - fw * .3, fy + fh * .52, fw * .34, Math.max(1, u * .3));
  ctx.fillRect(top.x - fw * .3, fy + fh * .7, fw * .5, Math.max(1, u * .3));
  ctx.restore();
  // Label — suppressed on mobile/touch unless this station is active.
  if (!s.suppressLabels || active) {
    ctx.fillStyle = active ? '#aef3ff' : cfg.label;
    ctx.font = `${Math.max(8, 4.2 * u)}px "Fira Code", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText((active ? '▸ ' : '') + st.label, top.x, fy - 4 * u);
    ctx.textAlign = 'left';
  }
}

/** A deliberately quiet self-service ATM: one screen, one card slot, one status light. */
function drawAtm(ctx: CanvasRenderingContext2D, s: SceneCtx, st: OfficeStation, tx: number, ty: number) {
  const { P, heightPx } = s;
  const active = s.playable && s.activeStationId === st.id;
  const u = (s.T / TILE) * 0.5;
  const c = st.col, r = st.row;
  const w = st.footprint?.w ?? 1, d = st.footprint?.d ?? 1;
  groundShadow(ctx, s, c, r, w, d, 0.26);
  isoBox(
    ctx, s, c, r, w, d, 16,
    active ? '#202d3d' : '#151e2a',
    '#0b111a',
    '#101925',
    active ? 'rgba(148,163,184,.75)' : 'rgba(100,116,139,.42)',
  );

  const top = P(tx, ty);
  const faceW = 9 * u;
  const faceH = 6 * u;
  const faceY = top.y - heightPx(16) - faceH * 0.2;
  ctx.save();
  ctx.fillStyle = active ? '#13283a' : '#0c1724';
  ctx.fillRect(top.x - faceW / 2, faceY, faceW, faceH);
  ctx.strokeStyle = active ? 'rgba(125,211,252,.8)' : 'rgba(100,116,139,.48)';
  ctx.lineWidth = Math.max(1, u * 0.35);
  ctx.strokeRect(top.x - faceW / 2, faceY, faceW, faceH);

  // Minimal banking-app layout; no cash icon, teller window, or decorative glow.
  ctx.fillStyle = active ? 'rgba(186,230,253,.9)' : 'rgba(148,163,184,.72)';
  ctx.fillRect(top.x - faceW * 0.34, faceY + faceH * 0.22, faceW * 0.68, Math.max(1, u * 0.35));
  ctx.fillStyle = active ? 'rgba(125,211,252,.7)' : 'rgba(100,116,139,.58)';
  ctx.fillRect(top.x - faceW * 0.34, faceY + faceH * 0.48, faceW * 0.42, Math.max(1, u * 0.3));
  ctx.fillRect(top.x - faceW * 0.34, faceY + faceH * 0.67, faceW * 0.58, Math.max(1, u * 0.3));

  // Card slot and a single ready light below the screen.
  ctx.fillStyle = '#050a10';
  ctx.fillRect(top.x - faceW * 0.22, faceY + faceH + 2 * u, faceW * 0.44, Math.max(1, u * 0.42));
  ctx.fillStyle = active ? '#7dd3fc' : '#64748b';
  ctx.fillRect(top.x - 1.2 * u, faceY + faceH + 4.5 * u, 2.4 * u, 1.2 * u);
  ctx.restore();

  if (!s.suppressLabels || active) {
    ctx.fillStyle = active ? '#bae6fd' : 'rgba(148,163,184,.72)';
    ctx.font = `${Math.max(8, 4.2 * u)}px "Fira Code", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText((active ? '▸ ' : '') + 'ATM', top.x, faceY - 4 * u);
    ctx.textAlign = 'left';
  }
}

const ATM_CFG: MachineCfg = {
  w: 1, h: 16,
  top: '#151e2a', topA: '#202d3d', left: '#0b111a', right: '#101925',
  rim: 'rgba(100,116,139,.42)', rimA: 'rgba(148,163,184,.75)',
  face: '#0c1724', faceA: '#13283a', glow: 'rgba(125,211,252,.35)',
  label: 'rgba(148,163,184,.72)',
  artSrc: `${import.meta.env.BASE_URL}pixel-agents/shadow-tower/atm.png`,
};
const VENDING_CFG: MachineCfg = {
  w: 1.2, h: 20,
  top: '#4a0e2a', topA: '#5e1338', left: '#200512', right: '#360820',
  rim: 'rgba(196,126,63,0.68)', rimA: 'rgba(255,190,112,0.95)',
  face: 'rgba(35,25,20,0.92)', faceA: 'rgba(255,210,150,0.92)', glow: 'rgba(196,126,63,0.9)',
  label: 'rgba(240,160,200,0.85)',
  artSrc: `${import.meta.env.BASE_URL}pixel-agents/shadow-tower/vending.png`,
};
const PAYPHONE_CFG: MachineCfg = {
  w: 0.85, h: 22,
  top: '#0e2a50', topA: '#133a66', left: '#05122a', right: '#082040',
  rim: 'rgba(56,150,240,0.6)', rimA: 'rgba(120,200,255,0.95)',
  face: 'rgba(10,28,58,0.9)', faceA: 'rgba(150,210,255,0.92)', glow: 'rgba(56,150,255,0.9)',
  label: 'rgba(150,200,255,0.85)',
};

function drawStation(ctx: CanvasRenderingContext2D, s: SceneCtx, st: OfficeStation, tx: number, ty: number) {
  // Public cafe computers are already rendered by the authoritative team-desk
  // furniture pass. Their station records exist only for proximity/action
  // handling; drawing another marker here would stack a fake prop on the desk.
  if (st.id.startsWith('cafe-computer-')) return;
  if (st.id.endsWith('-door')) { drawLockedDoorMarker(ctx, s, st, tx, ty); return; }
  const w = st.footprint?.w ?? 1;
  const d = st.footprint?.d ?? 1;
  // Each object gets a distinct, recognisable render so it reads as part of the
  // room — never an identical kiosk with a floating marker.
  if (st.glyph === 'elevator' || st.id.startsWith('office-wing-door-')) { drawElevator(ctx, s, st, tx, ty); return; }
  if (st.glyph === 'atm') { drawMachine(ctx, s, st, tx, ty, ATM_CFG); return; }
  if (st.glyph === 'vending') { drawMachine(ctx, s, st, tx, ty, VENDING_CFG); return; }
  if (st.glyph === 'payphone') { drawMachine(ctx, s, st, tx, ty, PAYPHONE_CFG); return; }
  if (st.glyph === 'music') { drawShadowRadio(ctx, s, st, tx, ty); return; }

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

function drawLockedDoorMarker(ctx: CanvasRenderingContext2D, s: SceneCtx, st: OfficeStation, tx: number, ty: number) {
  const { P } = s;
  const p = P(tx, ty);
  const u = Math.max(0.75, s.T / TILE);
  const active = s.playable && s.activeStationId === st.id;
  ctx.save();
  ctx.fillStyle = active ? "rgba(248, 216, 120, .96)" : "rgba(231, 181, 79, .9)";
  ctx.strokeStyle = active ? "#fff1a8" : "#9d6b25";
  ctx.lineWidth = Math.max(1, u);
  ctx.shadowColor = active ? "rgba(255, 221, 120, .9)" : "rgba(212, 157, 45, .5)";
  ctx.shadowBlur = active ? 14 * u : 7 * u;
  ctx.fillRect(p.x - 4 * u, p.y - 10 * u, 8 * u, 8 * u);
  ctx.strokeRect(p.x - 4 * u, p.y - 10 * u, 8 * u, 8 * u);
  ctx.beginPath();
  ctx.arc(p.x, p.y - 11 * u, 3 * u, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = "#17131a";
  ctx.fillRect(p.x - 1 * u, p.y - 7 * u, 2 * u, 3 * u);
  ctx.restore();
  if (!s.suppressLabels || active) {
    ctx.save();
    ctx.fillStyle = active ? "#fff1a8" : "rgba(245, 210, 130, .86)";
    ctx.font = `${Math.max(8, 4.2 * u * 0.5)}px "Fira Code", monospace`;
    ctx.textAlign = "center";
    ctx.fillText(active ? `▸ ${st.label}` : "LOCKED DOOR", p.x, p.y - 18 * u);
    ctx.restore();
  }
}

function drawShadowRadio(ctx: CanvasRenderingContext2D, s: SceneCtx, st: OfficeStation, tx: number, ty: number) {
  const active = s.playable && s.activeStationId === st.id;
  const { P } = s;
  const p = P(tx, ty);
  const u = Math.max(.65, (s.T / TILE) * .5);
  const pulse = (Math.sin(s.now / 260) + 1) / 2;

  groundShadow(ctx, s, st.col, st.row, st.footprint?.w ?? 1, st.footprint?.d ?? 1, .42);
  // Low, wide cassette boombox silhouette—deliberately unlike the generic
  // terminal cubes so the radio is identifiable before the prompt appears.
  isoBox(
    ctx, s, st.col - .24, st.row + .05, 1.48, .72, 10,
    active ? '#3f285d' : '#251a35',
    '#100b18',
    '#1b1028',
    active ? 'rgba(251,191,36,.95)' : 'rgba(244,114,182,.55)',
  );
  const faceY = p.y - s.heightPx(8);
  ctx.save();
  if (active) {
    ctx.shadowColor = 'rgba(251,191,36,.9)';
    ctx.shadowBlur = 12 + pulse * 8;
  }
  ctx.fillStyle = '#09070d';
  ctx.fillRect(p.x - 18 * u, faceY - 4 * u, 36 * u, 12 * u);
  ctx.strokeStyle = active ? '#fbbf24' : 'rgba(244,114,182,.7)';
  ctx.lineWidth = Math.max(1, u);
  ctx.strokeRect(p.x - 18 * u, faceY - 4 * u, 36 * u, 12 * u);
  for (const x of [-11, 11]) {
    ctx.beginPath();
    ctx.fillStyle = '#17121f';
    ctx.arc(p.x + x * u, faceY + 2 * u, 5 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(103,232,249,.45)';
    ctx.stroke();
  }
  ctx.fillStyle = active ? '#fbbf24' : '#67e8f9';
  ctx.fillRect(p.x - 4 * u, faceY - 1 * u, 8 * u, 4 * u);
  ctx.fillStyle = `rgba(251,191,36,${.45 + pulse * .55})`;
  ctx.fillRect(p.x + 13 * u, faceY - 7 * u, 2 * u, 2 * u);
  ctx.restore();

  // Unlike secondary furniture labels, the station identity is persistent on
  // desktop and touch layouts: a radio without a readable name is not actionable.
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = active ? '#fde68a' : 'rgba(253,230,138,.82)';
  ctx.font = `700 ${Math.max(8, 4.2 * u)}px "Fira Code", monospace`;
  ctx.fillText((active ? '▸ ' : '') + 'SHADOW RADIO · 107.3', p.x, faceY - 11 * u);
  ctx.restore();
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
  // Floating geometric terminal mark.
  ctx.save();
  ctx.shadowColor = `rgba(${GOLD},0.9)`; ctx.shadowBlur = 8 + t * 6;
  ctx.strokeStyle = `rgba(255,225,150,${0.75 + t * 0.25})`;
  ctx.lineWidth = Math.max(1, u * .65);
  ctx.strokeRect(p.x - 5 * u, p.y - s.heightPx(24), 10 * u, 6 * u);
  ctx.beginPath();
  ctx.moveTo(p.x - 2 * u, p.y - s.heightPx(16.5));
  ctx.lineTo(p.x + 2 * u, p.y - s.heightPx(16.5));
  ctx.moveTo(p.x, p.y - s.heightPx(18));
  ctx.lineTo(p.x, p.y - s.heightPx(16.5));
  ctx.stroke();
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
  // Name + status — suppressed on mobile/touch.
  if (!s.suppressLabels) {
    ctx.fillStyle = bot.teamColor ?? 'rgba(140,200,255,0.8)';
    ctx.font = `${Math.max(7, 3.4 * u)}px "Fira Code", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(`${bot.name.slice(0, 6).toUpperCase()} · REST`, p.x, p.y + 8 * u);
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
  // Glass front partition (low), split around the walkable doorway. This is
  // especially important for the shared elevator hall: the lift reads as a
  // walled circulation core instead of a freestanding office prop.
  const frontY = room.y + room.h - 0.25;
  const side = room.doorSide ?? "bottom";
  const span = Math.max(0, Math.min(room.doorSpan ?? 2, room.w));
  const doorAt = Math.max(room.x, Math.min(room.x + room.w - span, room.doorAt ?? room.x + (room.w - span) / 2));
  if (side === "bottom" && span > 0 && doorAt > room.x) {
    isoBox(ctx, s, room.x, frontY, doorAt - room.x, 0.25, 6, hexA(accent, 0.35), hexA(accent, 0.18), hexA(accent, 0.12));
  }
  if (side === "bottom" && span > 0 && doorAt + span < room.x + room.w) {
    isoBox(ctx, s, doorAt + span, frontY, room.x + room.w - doorAt - span, 0.25, 6, hexA(accent, 0.35), hexA(accent, 0.18), hexA(accent, 0.12));
  }
  if (side !== "bottom" || span === 0) {
    isoBox(ctx, s, room.x, frontY, room.w, 0.25, 6, hexA(accent, 0.35), hexA(accent, 0.18), hexA(accent, 0.12));
  }
  if (side === "bottom" && span > 0) {
    const doorway = P(doorAt + span / 2, room.y + room.h);
    ctx.save();
    ctx.strokeStyle = hexA(accent, 0.65);
    ctx.lineWidth = Math.max(1, 1.2 * (s.T / TILE));
    ctx.setLineDash([3 * (s.T / TILE), 2 * (s.T / TILE)]);
    ctx.beginPath();
    ctx.moveTo(doorway.x - 4 * (s.T / TILE), doorway.y);
    ctx.lineTo(doorway.x + 4 * (s.T / TILE), doorway.y);
    ctx.stroke();
    ctx.restore();
    if (room.locked) {
      const u = Math.max(0.7, s.T / TILE);
      ctx.save();
      ctx.fillStyle = "rgba(30, 22, 18, .94)";
      ctx.strokeStyle = room.accent ?? "#e8bb63";
      ctx.lineWidth = Math.max(1, u);
      ctx.shadowColor = "rgba(235, 187, 94, .7)";
      ctx.shadowBlur = 8 * u;
      ctx.fillRect(doorway.x - 5 * u, doorway.y - 9 * u, 10 * u, 9 * u);
      ctx.strokeRect(doorway.x - 5 * u, doorway.y - 9 * u, 10 * u, 9 * u);
      ctx.beginPath();
      ctx.arc(doorway.x, doorway.y - 10 * u, 3.5 * u, Math.PI, 0);
      ctx.stroke();
      ctx.fillStyle = "#f6d78c";
      ctx.fillRect(doorway.x - 1 * u, doorway.y - 6 * u, 2 * u, 3 * u);
      ctx.restore();
    }
  }
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

const OFFICE_COMMERCIALS = [
  { brand: 'BANCO OMBRA', line: 'CREDIT FOR THE COMMITTED', color: '#7CFC9B' },
  { brand: 'CALL HOME', line: 'THE NIGHT SHIFT BROADCAST', color: '#67e8f9' },
  { brand: 'MYRIAD', line: 'A BETTER CITY IS LOADING', color: '#f0abfc' },
  { brand: 'SHADOW RADIO', line: '107.3 · ALWAYS AFTER DARK', color: '#fbbf24' },
] as const;

function drawHallwayTreatment(ctx: CanvasRenderingContext2D, s: SceneCtx) {
  const { P, cols, rows, hallwayStyle, hallwaySignage } = s;
  if (!hallwayStyle && !hallwaySignage) return;

  const style = hallwayStyle ?? 'central';

  ctx.save();
  ctx.lineJoin = 'round';

  if (style === 'central') {
    // Glowing central runner path
    const rA = P(2, 0), rB = P(4, 0), rC = P(4, rows), rD = P(2, rows);
    ctx.beginPath(); ctx.moveTo(rA.x, rA.y); ctx.lineTo(rB.x, rB.y); ctx.lineTo(rC.x, rC.y); ctx.lineTo(rD.x, rD.y); ctx.closePath();
    ctx.fillStyle = s.lighting === 'dim' ? 'rgba(56, 189, 248, 0.05)' : 'rgba(56, 189, 248, 0.1)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Cross-path to the middle of the room
    const cA = P(4, rows / 2 - 1), cB = P(cols, rows / 2 - 1), cC = P(cols, rows / 2 + 1), cD = P(4, rows / 2 + 1);
    ctx.beginPath(); ctx.moveTo(cA.x, cA.y); ctx.lineTo(cB.x, cB.y); ctx.lineTo(cC.x, cC.y); ctx.lineTo(cD.x, cD.y); ctx.closePath();
    ctx.fillStyle = s.lighting === 'dim' ? 'rgba(56, 189, 248, 0.05)' : 'rgba(56, 189, 248, 0.1)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.stroke();

  } else if (style === 'gallery') {
    // Alternating tiles bordering the room
    for (let x = 0; x < cols; x += 2) {
      for (let y = 0; y < rows; y += 2) {
        if (x < 2 || x > cols - 3 || y < 2 || y > rows - 3) {
          const tA = P(x, y), tB = P(x+1, y), tC = P(x+1, y+1), tD = P(x, y+1);
          ctx.beginPath(); ctx.moveTo(tA.x, tA.y); ctx.lineTo(tB.x, tB.y); ctx.lineTo(tC.x, tC.y); ctx.lineTo(tD.x, tD.y); ctx.closePath();
          ctx.fillStyle = 'rgba(244, 114, 182, 0.08)';
          ctx.fill();
        }
      }
    }
  } else if (style === 'executive') {
    // Plush dark inset rug with a gold accent
    const eA = P(1, 1), eB = P(cols - 1, 1), eC = P(cols - 1, rows - 1), eD = P(1, rows - 1);
    ctx.beginPath(); ctx.moveTo(eA.x, eA.y); ctx.lineTo(eB.x, eB.y); ctx.lineTo(eC.x, eC.y); ctx.lineTo(eD.x, eD.y); ctx.closePath();
    ctx.fillStyle = 'rgba(10, 6, 20, 0.8)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Draw the office name as a wall-mounted plaque. Its anchor is a floor-plane
  // coordinate, so it stays attached to the authoritative room when the camera
  // follows the player or the floor dimensions change.
  if (hallwaySignage) {
    ctx.save();
    const signCol = Math.max(2, Math.min(cols - 2, cols * .5));
    const signBase = P(signCol, 0);
    const u = Math.max(.7, s.T / 32);
    const text = hallwaySignage.trim().toUpperCase().slice(0, 30);
    const signW = Math.min(Math.max(132 * u, text.length * 7.2 * u), Math.max(180 * u, cols * s.T * .58));
    const signH = 24 * u;
    const signY = signBase.y - s.heightPx(TILE * 2.55);
    ctx.fillStyle = 'rgba(5,12,24,.9)';
    ctx.fillRect(signBase.x - signW / 2, signY, signW, signH);
    ctx.strokeStyle = s.lighting === 'dim' ? 'rgba(56,189,248,.42)' : 'rgba(56,189,248,.78)';
    ctx.lineWidth = Math.max(1, u * .7);
    ctx.strokeRect(signBase.x - signW / 2, signY, signW, signH);
    ctx.fillStyle = 'rgba(196,126,63,.82)';
    ctx.fillRect(signBase.x - signW / 2, signY, Math.max(3, 3 * u), signH);
    ctx.font = `700 ${Math.max(8, 6.5 * u)}px "Fira Code", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(226,232,240,.92)';
    ctx.fillText(text, signBase.x, signY + signH / 2 + .5 * u);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  ctx.restore();
}

function drawOfficeMediaDecor(ctx: CanvasRenderingContext2D, s: SceneCtx) {
  const { P, T, cols } = s;
  const u = Math.max(0.55, T / 32);
  const commercial = OFFICE_COMMERCIALS[Math.floor(s.now / 4200) % OFFICE_COMMERCIALS.length];

  // Old wall-mounted CRT: an actual looping in-world commercial screen, not a
  // floating HUD. Scan bar and copy change over time while retaining the same
  // low-resolution office rendering language.
  const tv = P(Math.max(1.8, Math.min(cols - 1.8, cols * .5)), 0);
  const tw = 58 * u, th = 37 * u;
  const tx = tv.x - tw / 2, ty = tv.y - s.heightPx(54);
  ctx.save();
  ctx.fillStyle = 'rgba(10,8,13,.96)';
  rrect(ctx, tx - 5 * u, ty - 5 * u, tw + 10 * u, th + 11 * u, 5 * u);
  ctx.strokeStyle = 'rgba(148,163,184,.35)';
  ctx.lineWidth = Math.max(1, u);
  rrectStroke(ctx, tx - 5 * u, ty - 5 * u, tw + 10 * u, th + 11 * u, 5 * u);
  const glow = ctx.createLinearGradient(tx, ty, tx + tw, ty + th);
  glow.addColorStop(0, hexA(commercial.color, .32));
  glow.addColorStop(.55, 'rgba(8,15,28,.96)');
  glow.addColorStop(1, 'rgba(196,126,63,.24)');
  ctx.fillStyle = glow;
  ctx.fillRect(tx, ty, tw, th);
  ctx.fillStyle = 'rgba(255,255,255,.11)';
  ctx.fillRect(tx, ty + ((s.now / 28) % th), tw, Math.max(1, u));
  ctx.textAlign = 'center';
  ctx.fillStyle = commercial.color;
  ctx.font = `700 ${Math.max(7, 6 * u)}px "Fira Code", monospace`;
  ctx.fillText(commercial.brand, tv.x, ty + 15 * u);
  ctx.fillStyle = 'rgba(226,232,240,.65)';
  ctx.font = `${Math.max(5, 3.4 * u)}px "Fira Code", monospace`;
  ctx.fillText(commercial.line, tv.x, ty + 24 * u);
  ctx.fillStyle = 'rgba(255,255,255,.16)';
  for (let y = ty + 2 * u; y < ty + th; y += 4 * u) ctx.fillRect(tx, y, tw, .5 * u);
  ctx.restore();

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
  wallGrad.addColorStop(0, '#101c24');
  wallGrad.addColorStop(1, '#080f15');
  quad(ctx, [e0, e1, t1, t0], wallGrad);
  if (s.towerArt) {
    const wallArt = getMachineArt(`${import.meta.env.BASE_URL}pixel-agents/assets/walls/wall_0.png`);
    if (wallArt?.complete && wallArt.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(e0.x, e0.y); ctx.lineTo(e1.x, e1.y); ctx.lineTo(t1.x, t1.y); ctx.lineTo(t0.x, t0.y); ctx.closePath();
      ctx.clip();
      const pattern = ctx.createPattern(wallArt, 'repeat');
      if (pattern) {
        ctx.globalAlpha = 0.72;
        ctx.fillStyle = pattern;
        const minX = Math.min(e0.x, e1.x, t0.x, t1.x);
        const minY = Math.min(e0.y, e1.y, t0.y, t1.y);
        const maxX = Math.max(e0.x, e1.x, t0.x, t1.x);
        const maxY = Math.max(e0.y, e1.y, t0.y, t1.y);
        ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
      }
      ctx.restore();
    }
  }

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
  // Exterior billboards visible through the glass. They sit inside the clipped
  // skyline so they read as part of the city outside, not office UI.
  const exteriorBrands = side === 'right'
    ? ['BANCO OMBRA', 'MYRIAD', 'CALL HOME']
    : ['NIGHT MART', 'PABLO CORP', 'SHADOW 107.3'];
  exteriorBrands.forEach((brand, index) => {
    const f = .18 + index * .29;
    const base = side === 'right' ? P(f * cols, 0) : P(0, f * rows);
    const bw = Math.max(26, s.T * 1.55);
    const by = base.y - h * (.48 + (index % 2) * .12);
    ctx.globalAlpha = .45;
    ctx.fillStyle = index % 2 ? 'rgba(196,126,63,.22)' : 'rgba(64,199,190,.18)';
    ctx.fillRect(base.x - bw / 2, by - 10, bw, 14);
    ctx.strokeStyle = index % 2 ? 'rgba(244,114,182,.45)' : 'rgba(103,232,249,.4)';
    ctx.strokeRect(base.x - bw / 2, by - 10, bw, 14);
    ctx.fillStyle = 'rgba(226,232,240,.72)';
    ctx.font = `700 ${Math.max(5, s.T * .17)}px "Fira Code", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(brand, base.x, by);
  });
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
  ctx.restore();

  // neon top trim
  ctx.strokeStyle = side === 'right' ? 'rgba(111,224,216,0.74)' : 'rgba(196,126,63,0.72)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(t0.x, t0.y); ctx.lineTo(t1.x, t1.y); ctx.stroke();
  // vertical neon mullions
  ctx.strokeStyle = 'rgba(196,126,63,0.4)';
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
