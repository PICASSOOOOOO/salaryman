/**
 * LiveOffice — the actual interactive pixel-office canvas, ported from
 * https://github.com/pablodelucca/pixel-agents (MIT, by Pablo De Lucca).
 *
 * What this is:
 *   - A self-contained React component that renders the upstream office
 *     engine (canvas-based, tile + sprite renderer with pathfinding,
 *     character animation states, walls, furniture) inside our app.
 *   - Spawns N pixel agents who pick a desk, walk to it, sit down and
 *     "type". Idle agents periodically wander between seats.
 *   - Optionally spawns a *player-controlled* avatar with WASD / arrow
 *     keys, so the user can be inside their own office instead of just
 *     watching it from the outside.
 *
 * Tier-aware: the floor is tinted to match the user's onboarding office
 * tier (capsule / studio / coworking / suite) so the pick they made at
 * Immigration is reflected in the room they actually sit in.
 *
 * What this is NOT:
 *   - Not the editor. Furniture/floor/wall placement is intentionally
 *     stripped — this read-only view focuses on the live experience.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { OfficeState } from './office/engine/officeState.js';
import { renderFrame, type SelectionRenderState } from './office/engine/renderer.js';
import { startGameLoop } from './office/engine/gameLoop.js';
import { loadPixelOfficeAssets } from './loadAssets.js';
import { SECRETARY_ID, TILE_SIZE } from './constants.js';
import type { ColorValue } from './components/ui/types.js';
import type { OfficeLayout, PlacedFurniture } from './office/types.js';
import { getCatalogEntry } from './office/layout/furnitureCatalog.js';
import { layoutToSeats } from './office/layout/layoutSerializer.js';
import { useLowGfx } from '@/lib/lowGfx';

export type OfficeTier = 'capsule' | 'studio' | 'coworking' | 'suite';

interface LiveOfficeProps {
  /** Number of agents to spawn. Capped by available seats in the layout. */
  agentCount?: number;
  /** Override CSS height. Defaults to a 16:9-ish canvas. */
  height?: number | string;
  /** Optional list of agent labels — if provided overrides agentCount. */
  agents?: { id: number; label?: string; palette?: number; hueShift?: number }[];
  /**
   * Per-agent activity state. Updated reactively (without re-mounting the
   * canvas) so the office reflects live data. Missing entries default to
   * inactive with no current tool.
   */
  activity?: Record<number, { active?: boolean; tool?: string | null }>;
  /** Disable interactions (camera follow, etc.). Default: false. */
  passive?: boolean;
  /**
   * If set, spawn a player-controlled avatar with this id. The player can
   * be moved with WASD / arrow keys and the camera follows them. The id
   * must NOT collide with any agent id in `agents`.
   */
  playerId?: number;
  /** Label rendered above the player (defaults to "YOU"). */
  playerLabel?: string;
  /**
   * Onboarding office tier — drives the floor tint and seat headroom so
   * each tier feels visibly distinct (a capsule isn't an exec suite).
   */
  tier?: OfficeTier;
}

const DEFAULT_AGENTS = 5;

/**
 * Floor tint per tier. Applied as an HSBC adjustment on top of whatever
 * the layout author shipped in tileColors. We use *adjustment* mode (not
 * colorize) so existing flooring textures keep their pattern; the tint
 * just shifts hue + saturation + brightness so the room reads "cramped
 * capsule" vs "warm studio" vs "exec penthouse" at a glance.
 */
const TIER_TINTS: Record<OfficeTier, ColorValue> = {
  capsule:   { h: 200, s:  -5, b: -22, c:   8 }, // cold, dim, claustrophobic
  studio:    { h:  20, s:  20, b:  -5, c:   0 }, // warm orange — live-work loft
  coworking: { h: 140, s:  15, b:  -2, c:   0 }, // green — open hot-desking floor
  suite:     { h: 280, s:  25, b:   8, c:  10 }, // purple/gold — executive
};

/** Per-tier label for the corner badge. */
export const TIER_LABELS: Record<OfficeTier, string> = {
  capsule:   'DESK + CAPSULE',
  studio:    'STUDIO LOFT',
  coworking: 'COWORKING + APARTMENT',
  suite:     'EXEC SUITE + PENTHOUSE',
};

/**
 * Apply the tier tint to every floor tile in the layout. Returns a new
 * layout — never mutates the input. Tile values 0 (WALL) and 255 (VOID)
 * keep their existing color (or null) so walls don't get a chromatic
 * shift along with the floor.
 */
function tintLayoutForTier(layout: OfficeLayout, tier: OfficeTier): OfficeLayout {
  const tint = TIER_TINTS[tier];
  const newColors = layout.tileColors
    ? layout.tileColors.slice()
    : new Array<ColorValue | null>(layout.tiles.length).fill(null);
  for (let i = 0; i < layout.tiles.length; i++) {
    const t = layout.tiles[i];
    if (t === 0 || t === 255) continue; // wall / void — leave alone
    const cur = newColors[i];
    if (cur) {
      // Bias the existing color toward the tier tint. We average hue and
      // sum the deltas so authored colors still poke through but the room
      // *reads* as the tier the user picked. Hue is circular (0 == 360),
      // so a naive (a+b)/2 of e.g. 350 and 10 yields 180 — the
      // *opposite* color. Take the shorter arc instead.
      newColors[i] = {
        h: averageHue(cur.h, tint.h),
        s: clamp(cur.s + tint.s, -100, 100),
        b: clamp(cur.b + tint.b, -100, 100),
        c: clamp(cur.c + tint.c, -100, 100),
        ...(cur.colorize ? { colorize: true } : {}),
      };
    } else {
      newColors[i] = { ...tint };
    }
  }
  return { ...layout, tileColors: newColors };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Circular mean of two hues in degrees [0, 360). Walks the shorter arc
 * between them so 350° and 10° average to 0° (not 180°), and 90° and
 * 270° average to a deterministic edge of the diameter rather than
 * snapping to a complementary color the author never asked for.
 */
function averageHue(a: number, b: number): number {
  const A = ((a % 360) + 360) % 360;
  const B = ((b % 360) + 360) % 360;
  const diff = B - A;
  const shortest = diff > 180 ? diff - 360 : diff < -180 ? diff + 360 : diff;
  return ((A + shortest / 2) % 360 + 360) % 360;
}

/**
 * Per-tier extra-desk count layered on top of whatever the default layout
 * already ships with. Capsule users keep the cramped default; suite users
 * walk into a bullpen of empty desks that look ready to be filled with
 * the team they haven't hired yet.
 */
const TIER_EXTRA_DESKS: Record<OfficeTier, number> = {
  capsule:   0,
  studio:    2,
  coworking: 4,
  suite:     6,
};

/** Landmark furniture stand-ins. The upstream catalog ships no real
 *  vending machine or water cooler sprites; the closest "tall thing
 *  against a wall" is DOUBLE_BOOKSHELF, and the closest "small floor
 *  fixture" is PLANT_2. We label them in the overlay so the player
 *  reads them as VENDING / WATER COOLER even though the pixels are
 *  borrowed. */
interface LandmarkSeed {
  type: string;
  label: string;
}
const LANDMARKS: LandmarkSeed[] = [
  { type: 'DOUBLE_BOOKSHELF', label: 'VENDING' },
  { type: 'PLANT_2',          label: 'COOLER'  },
];

/** Result returned by the seeder so the host can paint floating labels
 *  above whichever landmarks actually got placed. */
interface SeedResult {
  layout: OfficeLayout;
  landmarks: Array<{ col: number; row: number; label: string }>;
}

/**
 * Drop tier-scaled extra desks (with chairs) plus a vending machine and a
 * water cooler onto the first walkable footprints we can find. Pure: never
 * mutates the input layout; returns a fresh one. Fails open — if there
 * just isn't room for everything we ship what we could fit instead of
 * throwing, since the canvas should still be usable.
 */
function seedTierFurniture(layout: OfficeLayout, tier: OfficeTier): SeedResult {
  const cols = layout.cols;
  const rows = layout.rows;
  // Track every blocked cell as we go so each new piece avoids prior ones.
  const blocked = new Set<string>();
  for (const f of layout.furniture) {
    const entry = getCatalogEntry(f.type);
    const w = entry?.footprintW ?? 1;
    const h = entry?.footprintH ?? 1;
    for (let dr = 0; dr < h; dr++) {
      for (let dc = 0; dc < w; dc++) {
        blocked.add(`${f.col + dc},${f.row + dr}`);
      }
    }
  }
  // Existing seat tiles, derived the same way the engine derives them
  // (layoutToSeats applies backgroundTiles offsets and emits multiple
  // seat tiles for multi-tile chairs). Validating against chair *origin*
  // tiles silently misses seats that live at row+backgroundTiles, e.g.
  // WOODEN_CHAIR_* whose seat is at row+1, not row.
  const existingSeatTiles: Array<{ col: number; row: number }> = [];
  for (const seat of layoutToSeats(layout.furniture).values()) {
    existingSeatTiles.push({ col: seat.seatCol, row: seat.seatRow });
  }
  const isWall = (c: number, r: number) => {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return true;
    const t = layout.tiles[r * cols + c];
    return t === 0 || t === 255;
  };
  const fits = (c: number, r: number, w: number, h: number) => {
    for (let dr = 0; dr < h; dr++) {
      for (let dc = 0; dc < w; dc++) {
        if (isWall(c + dc, r + dr)) return false;
        if (blocked.has(`${c + dc},${r + dr}`)) return false;
      }
    }
    return true;
  };
  const claim = (c: number, r: number, w: number, h: number) => {
    for (let dr = 0; dr < h; dr++)
      for (let dc = 0; dc < w; dc++)
        blocked.add(`${c + dc},${r + dr}`);
  };
  const unclaim = (c: number, r: number, w: number, h: number) => {
    for (let dr = 0; dr < h; dr++)
      for (let dc = 0; dc < w; dc++)
        blocked.delete(`${c + dc},${r + dr}`);
  };

  // ── Connectivity: BFS over walkable tiles (not wall, not blocked).
  //    The anchor must be re-picked per candidate, because a candidate
  //    footprint can land on top of the previously-chosen anchor and
  //    seed the BFS inside a blocked cell — yielding a false positive
  //    that traverses BOTH sides of the cut. We pick the first
  //    walkable interior tile *under the current blocked set*.
  const pickAnchor = (): { col: number; row: number } | null => {
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        if (!isWall(c, r) && !blocked.has(`${c},${r}`)) return { col: c, row: r };
      }
    }
    return null;
  };
  const reachableFrom = (start: { col: number; row: number }): Set<string> => {
    // Defensive: never seed BFS inside a blocked/wall tile, or it
    // would walk out of the cut and report bogus connectivity.
    if (isWall(start.col, start.row) || blocked.has(`${start.col},${start.row}`)) {
      return new Set();
    }
    const seen = new Set<string>([`${start.col},${start.row}`]);
    const stack: Array<{ col: number; row: number }> = [start];
    while (stack.length) {
      const { col, row } = stack.pop()!;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const c = col + dc;
        const r = row + dr;
        const k = `${c},${r}`;
        if (seen.has(k)) continue;
        if (isWall(c, r)) continue;
        if (blocked.has(k)) continue;
        seen.add(k);
        stack.push({ col: c, row: r });
      }
    }
    return seen;
  };
  /** True when every seat tile in `seats` has at least one adjacent
   *  walkable tile in the freshly-computed reachable set. The engine's
   *  pathfinder temporarily unblocks the destination seat itself, so
   *  what we really need to guarantee is that *some* neighbour of the
   *  seat is reachable from anywhere else in the room. */
  const allSeatsReachable = (seats: Array<{ col: number; row: number }>): boolean => {
    const anchor = pickAnchor();
    if (!anchor) return false; // candidate fully sealed off the room — reject
    const reach = reachableFrom(anchor);
    for (const s of seats) {
      const adj = [
        `${s.col + 1},${s.row}`,
        `${s.col - 1},${s.row}`,
        `${s.col},${s.row + 1}`,
        `${s.col},${s.row - 1}`,
      ];
      if (!adj.some((k) => reach.has(k))) return false;
    }
    return true;
  };

  /** Find the first footprint whose placement keeps every existing
   *  seat (plus an optional new seat) reachable. Row-major scan keeps
   *  placement deterministic across reloads. */
  const findValidSpot = (
    w: number,
    h: number,
    opts?: { newSeat?: { col: number; row: number }; fromRow?: number },
  ): { col: number; row: number } | null => {
    const startR = opts?.fromRow ?? 1;
    for (let r = startR; r <= rows - h - 1; r++) {
      for (let c = 1; c <= cols - w - 1; c++) {
        if (!fits(c, r, w, h)) continue;
        // Tentatively claim, validate connectivity, undo if it breaks.
        claim(c, r, w, h);
        const newSeat = opts?.newSeat
          ? { col: c + opts.newSeat.col, row: r + opts.newSeat.row }
          : null;
        const seatsToCheck = newSeat
          ? [...existingSeatTiles, newSeat]
          : existingSeatTiles;
        const ok = allSeatsReachable(seatsToCheck);
        unclaim(c, r, w, h);
        if (ok) return { col: c, row: r };
      }
    }
    return null;
  };

  const out: PlacedFurniture[] = layout.furniture.slice();
  let uidCounter = 0;
  const mkUid = () => `tier-${tier}-${++uidCounter}-${Math.random().toString(36).slice(2, 6)}`;

  // ── Extra desks (DESK_FRONT 3w×2h + CUSHIONED_CHAIR_BACK at offset
  //    (1, 2) inside the 3×3 clearing). The new chair is registered
  //    with the connectivity check so we don't strand the seat we just
  //    created.
  const extraDesks = TIER_EXTRA_DESKS[tier];
  for (let i = 0; i < extraDesks; i++) {
    // CUSHIONED_CHAIR_BACK has footprintH:1 and backgroundTiles:0, so
    // the chair origin IS the seat tile. Validate the seat directly so
    // the new desk's own chair stays reachable.
    const spot = findValidSpot(3, 3, { newSeat: { col: 1, row: 2 } });
    if (!spot) break; // out of room — ship what we could
    out.push({ uid: mkUid(), type: 'DESK_FRONT', col: spot.col, row: spot.row });
    out.push({ uid: mkUid(), type: 'CUSHIONED_CHAIR_BACK', col: spot.col + 1, row: spot.row + 2 });
    claim(spot.col, spot.row, 3, 3);
    existingSeatTiles.push({ col: spot.col + 1, row: spot.row + 2 });
  }

  // ── Landmarks (vending + cooler). Footprints come from the catalog
  //    so we never drift from sprite reality. Same connectivity gate,
  //    no new chair to register since landmarks are purely scenic.
  const landmarks: SeedResult['landmarks'] = [];
  for (const lm of LANDMARKS) {
    const entry = getCatalogEntry(lm.type);
    if (!entry) continue; // sprite missing from catalog — skip silently
    const w = entry.footprintW;
    const h = entry.footprintH;
    const spot = findValidSpot(w, h, { fromRow: 1 });
    if (!spot) continue;
    out.push({ uid: mkUid(), type: lm.type, col: spot.col, row: spot.row });
    claim(spot.col, spot.row, w, h);
    landmarks.push({
      col: spot.col + w / 2,
      row: spot.row,
      label: lm.label,
    });
  }

  return { layout: { ...layout, furniture: out }, landmarks };
}

export function LiveOffice({
  agentCount = DEFAULT_AGENTS,
  agents,
  activity,
  height = 480,
  passive: _passive = false,
  playerId,
  playerLabel = 'YOU',
  tier,
}: LiveOfficeProps) {
  const [lowGfx] = useLowGfx();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const labelLayerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<OfficeState | null>(null);
  const panRef = useRef({ x: 0, y: 0 });
  // id → name lookup for the DOM label overlay (avoids re-rendering React on
  // every animation frame; we mutate the divs directly).
  const labelMapRef = useRef<Map<number, string>>(new Map());
  const labelNodesRef = useRef<Map<number, HTMLDivElement>>(new Map());
  // Static world landmarks (vending, water cooler) get floating labels
  // anchored to tile coordinates instead of moving characters. Stored as
  // a ref so the seeder can write to them without triggering re-renders.
  const landmarksRef = useRef<Array<{ col: number; row: number; label: string }>>([]);
  const landmarkNodesRef = useRef<HTMLDivElement[]>([]);
  // Held-key set for player movement. Read once per frame so a held key
  // walks the avatar tile-by-tile without backing up a queue of inputs.
  const heldKeysRef = useRef<Set<string>>(new Set());
  const playerIdRef = useRef<number | undefined>(playerId);
  useEffect(() => { playerIdRef.current = playerId; }, [playerId]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Stable reference to the agents array — defaults to a generated list of
  // ids when the caller didn't pass one. Memoized so the init effect
  // doesn't re-run on every parent render and re-spawn a fresh office.
  // Explicit element type so the default branch (just `{ id }`) doesn't
  // narrow the inferred return type and strip palette/hueShift/label off
  // the consumer-supplied entries used below.
  type AgentEntry = NonNullable<LiveOfficeProps['agents']>[number];
  const agentList = useMemo<AgentEntry[]>(() => {
    if (agents && agents.length > 0) return agents;
    return Array.from({ length: agentCount }, (_, i) => ({ id: i + 1 }));
  }, [agents, agentCount]);
  // Read the latest roster inside the init effect WITHOUT making it a dep.
  // The roster changes whenever the parent re-polls staff (every ~30s), and
  // rebuilding the whole world on that cadence is what teleported the player
  // back to spawn. Roster changes are instead reconciled in a separate effect
  // below that never touches the world or the player avatar.
  const agentListRef = useRef<AgentEntry[]>(agentList);
  useEffect(() => { agentListRef.current = agentList; }, [agentList]);

  // ── Asset load + state init ──────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    // Force the render-loop effect to tear down its old `os` capture
    // and re-init against the freshly-built OfficeState. Without this
    // a tier change reseeds the layout in a new state object that the
    // running game loop never picks up — characters keep walking the
    // old map.
    setStatus('loading');
    (async () => {
      try {
        const { layout } = await loadPixelOfficeAssets();
        if (cancelled) return;
        const os = new OfficeState();
        if (layout) {
          // Apply tier tint (if any) BEFORE rebuilding so the renderer
          // picks up the new tileColors on its first frame — no flicker.
          const tinted = tier ? tintLayoutForTier(layout, tier) : layout;
          // Then sprinkle tier-scaled extra desks + landmark stand-ins.
          // Done after tinting so the new pieces inherit the tinted
          // floor underneath but get standard sprite colors themselves.
          const seeded = tier ? seedTierFurniture(tinted, tier) : { layout: tinted, landmarks: [] };
          landmarksRef.current = seeded.landmarks;
          os.rebuildFromLayout(seeded.layout);
        }
        // Spawn agents — addAgent picks free seats and assigns palettes.
        labelMapRef.current.clear();
        for (const a of agentListRef.current) {
          if (playerId !== undefined && a.id === playerId) continue; // safety
          os.addAgent(a.id, a.palette, a.hueShift, undefined, true);
          if (a.label) labelMapRef.current.set(a.id, a.label);
        }
        // Spawn the player last — with the matrix "spawn" effect on so
        // the user gets a visible "arrival" animation when they enter.
        if (playerId !== undefined) {
          os.addAgent(playerId, 0, 220, undefined, false);
          labelMapRef.current.set(playerId, playerLabel);
          os.cameraFollowId = playerId;
          // CRITICAL: the engine's update loop auto-paths any *active*
          // character with a seatId back to their desk every tick, which
          // would override every WASD step the player makes. Strip both
          // the seat assignment AND the active flag so the player owns
          // their own movement and never gets yanked back to a chair.
          const playerCh = os.characters.get(playerId);
          if (playerCh) {
            // Release the seat addAgent claimed — the player isn't going
            // to sit there, and a real teammate should be free to take it.
            if (playerCh.seatId) {
              const claimed = os.seats.get(playerCh.seatId);
              if (claimed) claimed.assigned = false;
            }
            playerCh.seatId = null;
            playerCh.isActive = false;
            playerCh.isPlayer = true; // FSM skips it entirely — input-only movement
            playerCh.wanderTimer = Number.POSITIVE_INFINITY; // never autowander
          }
        }
        // Every office gets a built-in front-desk SECRETARY: an NPC greeter at
        // reception, not a paid pixel-agent, so it's always present regardless
        // of PRIME, tier, or how many real staff are on the roster.
        os.addSecretary(SECRETARY_ID);
        labelMapRef.current.set(SECRETARY_ID, 'Reception');
        stateRef.current = os;
        setStatus('ready');
      } catch (e) {
        console.error('[LiveOffice] failed to load assets', e);
        if (!cancelled) {
          setErrMsg(e instanceof Error ? e.message : String(e));
          setStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // NOTE: agentList and playerLabel are deliberately NOT deps. Rebuilding
    // the world (and respawning the player at the default spawn tile) on every
    // roster poll is what made the avatar "reset" its position. The world only
    // needs to rebuild on a tier change or a player identity change; roster and
    // label changes are handled by the lighter effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier, playerId]);

  // ── Agent roster reconciliation ──────────────────────────────
  // Add/remove NPCs to match the latest roster WITHOUT rebuilding the world
  // or touching the player avatar. This keeps the player's position stable
  // across the parent's periodic staff re-polls.
  useEffect(() => {
    if (status !== 'ready') return;
    const os = stateRef.current;
    if (!os) return;
    const want = new Set<number>();
    for (const a of agentList) {
      if (playerId !== undefined && a.id === playerId) continue;
      want.add(a.id);
      const existing = os.characters.get(a.id);
      if (!existing) {
        os.addAgent(a.id, a.palette, a.hueShift, undefined, true);
      } else if (existing.matrixEffect === 'despawn') {
        // Re-joined the roster before its despawn finished — revive it so the
        // next update() tick doesn't delete a wanted agent.
        os.cancelDespawn(a.id);
      }
      if (a.label) labelMapRef.current.set(a.id, a.label);
      else labelMapRef.current.delete(a.id);
    }
    // Despawn NPCs that have left the roster (never the player or secretary).
    for (const id of Array.from(os.characters.keys())) {
      if (playerId !== undefined && id === playerId) continue;
      if (id === SECRETARY_ID) continue; // built-in NPC, not part of the roster
      if (!want.has(id)) {
        os.removeAgent(id);
        labelMapRef.current.delete(id);
      }
    }
  }, [agentList, status, playerId]);

  // ── Player label sync ────────────────────────────────────────
  // The avatar's floating label can change (e.g. a rename) without needing a
  // world rebuild, so keep it out of the init effect's deps.
  useEffect(() => {
    if (status !== 'ready' || playerId === undefined) return;
    labelMapRef.current.set(playerId, playerLabel);
  }, [playerLabel, status, playerId]);

  // ── Live activity sync ───────────────────────────────────────
  // Reapply whenever activity changes. Cheap; the engine smooths the
  // visual transition (active agents start typing, idle ones return to
  // their seat or wander). Skip the player — their active flag is owned
  // by the input loop, not the parent's task feed.
  useEffect(() => {
    if (status !== 'ready') return;
    const os = stateRef.current;
    if (!os) return;
    for (const ch of os.characters.values()) {
      if (playerId !== undefined && ch.id === playerId) continue;
      if (ch.id === SECRETARY_ID) continue; // greeter has no task feed
      const a = activity?.[ch.id];
      os.setAgentActive(ch.id, !!a?.active);
      os.setAgentTool(ch.id, a?.tool ?? null);
    }
  }, [activity, status, playerId]);

  // ── Player keyboard input ────────────────────────────────────
  // We track held keys at the window level (so the user doesn't have to
  // click the canvas first) but only react when the office is ready and
  // a player exists. The actual step happens inside the render loop so
  // a held key walks the avatar one tile at a time — no input queue, no
  // input-rate dependency, and no fighting the engine's animation timing.
  useEffect(() => {
    if (status !== 'ready' || playerId === undefined) return;
    const isPlayerKey = (k: string): boolean =>
      k === 'w' || k === 'a' || k === 's' || k === 'd' ||
      k === 'W' || k === 'A' || k === 'S' || k === 'D' ||
      k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight';
    const onKey = (e: KeyboardEvent) => {
      if (!isPlayerKey(e.key)) return;
      // Skip IME composition so confirming a candidate doesn't move the avatar.
      if (e.isComposing || e.keyCode === 229) return;
      // Don't hijack movement keys when the user is typing somewhere.
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = (t.tagName || '').toUpperCase();
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (t.isContentEditable) return;
      }
      // Spacebar is intentionally NOT a movement key — Hummingbird owns
      // it for play/pause. Arrow keys cause page scroll by default; eat.
      e.preventDefault();
      heldKeysRef.current.add(e.key.toLowerCase());
    };
    const onUp = (e: KeyboardEvent) => {
      heldKeysRef.current.delete(e.key.toLowerCase());
      // Arrow keys: lowercase key === "arrowup" etc — already handled.
    };
    const onBlur = () => heldKeysRef.current.clear();
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
      heldKeysRef.current.clear();
    };
  }, [status, playerId]);

  // Pull one held direction off the input set and translate to a delta.
  // Returns null when nothing is held. Diagonal input picks the first
  // axis we see — keeps the avatar grid-aligned.
  const consumeHeldDirection = useCallback((): { dc: number; dr: number } | null => {
    const k = heldKeysRef.current;
    if (k.has('w') || k.has('arrowup')) return { dc: 0, dr: -1 };
    if (k.has('s') || k.has('arrowdown')) return { dc: 0, dr: 1 };
    if (k.has('a') || k.has('arrowleft')) return { dc: -1, dr: 0 };
    if (k.has('d') || k.has('arrowright')) return { dc: 1, dr: 0 };
    return null;
  }, []);

  // ── Game loop + render loop ──────────────────────────────────
  useEffect(() => {
    if (status !== 'ready') return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const os = stateRef.current;
    if (!canvas || !container || !os) return;

    // Bound the canvas backing store. DPR 3–4 phones otherwise allocate 9–16x
    // the CSS pixel area even though the pixel-art renderer gains no useful
    // detail beyond 2x.
    const dpr = lowGfx ? 1 : Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const resize = () => {
      const rect = container.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // Compute zoom that fits the entire layout into the canvas with margin.
    // The renderer takes a zoom factor in CSS-pixel units, so we account
    // for DPR ourselves.
    const layout = os.getLayout();
    const baseTile = 16;
    const fit = () => {
      const w = canvas.width;
      const h = canvas.height;
      const zx = w / (layout.cols * baseTile);
      const zy = h / (layout.rows * baseTile);
      // Clamp to integer for crisp pixels (no fractional scaling artifacts).
      return Math.max(2, Math.min(8, Math.floor(Math.min(zx, zy))));
    };
    // Player follow uses a higher fixed zoom so the avatar feels close —
    // "you are inside the office" instead of staring at a dollhouse.
    const playerZoom = () => {
      const fitZoom = fit();
      // One step closer than fit, capped at 8 for crisp pixels.
      return Math.min(8, Math.max(fitZoom, fitZoom + 2));
    };

    const stop = startGameLoop(canvas, {
      update: (dt: number) => {
        os.update(dt);

        // Player movement: if a key is held and the player has finished
        // their last walk, request the next tile. The engine handles the
        // walk animation; we just feed it one destination at a time.
        const pid = playerIdRef.current;
        if (pid !== undefined) {
          const ch = os.characters.get(pid);
          if (ch && ch.path.length === 0 && ch.moveProgress === 0) {
            const dir = consumeHeldDirection();
            if (dir) {
              const target = { col: ch.tileCol + dir.dc, row: ch.tileRow + dir.dr };
              // walkToTile silently returns false if the next tile is a
              // wall or blocked — that's fine, the player just bumps.
              os.walkToTile(pid, target.col, target.row);
            }
          }
        }
      },
      render: (ctx: CanvasRenderingContext2D) => {
        // Pick zoom + camera based on whether a player is present.
        const pid = playerIdRef.current;
        const player = pid !== undefined ? os.characters.get(pid) : undefined;
        const zoom = player ? playerZoom() : fit();

        // Camera-follow: center the canvas on the player. The renderer
        // already auto-centers small layouts; we offset *that* with our
        // own pan so the player ends up at the canvas center.
        if (player) {
          // Compute the renderer's natural offset so we can subtract it
          // from the desired pan target.
          const layoutPxW = layout.cols * baseTile * zoom;
          const layoutPxH = layout.rows * baseTile * zoom;
          const centerX = canvas.width / 2;
          const centerY = canvas.height / 2;
          const wantX = centerX - player.x * zoom;
          const wantY = centerY - player.y * zoom;
          // The renderer adds its own offsetX/offsetY = (canvas - layout)/2
          // when the layout fits, then adds panRef on top. Subtract it.
          const renderOffsetX = Math.floor((canvas.width - layoutPxW) / 2);
          const renderOffsetY = Math.floor((canvas.height - layoutPxH) / 2);
          let panX = wantX - renderOffsetX;
          let panY = wantY - renderOffsetY;
          // Clamp pan so the layout edges never reveal empty space outside
          // the map. Final on-screen origin is renderOffset + pan; for the
          // map to fully cover the viewport we need that origin in
          // [canvas - layoutPx, 0]. When the layout is smaller than the
          // canvas the renderer already centers it, so just pin pan to 0.
          if (layoutPxW <= canvas.width) {
            panX = 0;
          } else {
            const minPanX = canvas.width - layoutPxW - renderOffsetX;
            const maxPanX = -renderOffsetX;
            panX = Math.max(minPanX, Math.min(maxPanX, panX));
          }
          if (layoutPxH <= canvas.height) {
            panY = 0;
          } else {
            const minPanY = canvas.height - layoutPxH - renderOffsetY;
            const maxPanY = -renderOffsetY;
            panY = Math.max(minPanY, Math.min(maxPanY, panY));
          }
          panRef.current.x = panX;
          panRef.current.y = panY;
        }

        const selection: SelectionRenderState = {
          selectedAgentId: null,
          hoveredAgentId: null,
          hoveredTile: null,
          seats: os.seats,
          characters: os.characters,
        };

        const { offsetX, offsetY } = renderFrame(
          ctx,
          canvas.width,
          canvas.height,
          os.tileMap,
          os.furniture,
          os.getCharacters(),
          zoom,
          panRef.current.x,
          panRef.current.y,
          selection,
          undefined,
          os.getLayout().tileColors,
          layout.cols,
          layout.rows,
        );

        // Position name labels above each character. Render-loop mutation
        // (no React state) — keeps animation buttery on long sessions.
        const labelLayer = labelLayerRef.current;
        if (labelLayer && labelMapRef.current.size > 0) {
          const seen = new Set<number>();
          for (const ch of os.characters.values()) {
            const name = labelMapRef.current.get(ch.id);
            if (!name) continue;
            seen.add(ch.id);
            let node = labelNodesRef.current.get(ch.id);
            if (!node) {
              node = document.createElement('div');
              node.className = 'pixel-office-label';
              if (ch.id === pid) node.classList.add('pixel-office-label--player');
              node.textContent = name;
              labelLayer.appendChild(node);
              labelNodesRef.current.set(ch.id, node);
            }
            // Character.x / .y are pixel positions in tile-space; scale by
            // zoom and add the renderer's centering offset, then divide by
            // DPR so the DOM coords match the canvas's CSS pixels.
            const screenX = (offsetX + ch.x * zoom) / dpr;
            const screenY = (offsetY + ch.y * zoom) / dpr;
            // Anchor above the character's head: sprite is one tile tall.
            const headOffset = (TILE_SIZE * zoom * 1.5) / dpr;
            node.style.transform = `translate(-50%, -100%) translate(${screenX}px, ${screenY - headOffset}px)`;
            node.style.opacity = ch.matrixEffect === 'spawn' ? '0' : '1';
          }
          // Drop labels for characters that no longer exist.
          for (const [id, node] of labelNodesRef.current) {
            if (!seen.has(id)) {
              node.remove();
              labelNodesRef.current.delete(id);
            }
          }
        }

        // Static landmark labels (vending, water cooler). Anchored to
        // tile coordinates instead of moving characters — but still
        // re-positioned every frame because the camera pans on player
        // movement, so screen-space coords drift.
        if (labelLayer && landmarksRef.current.length > 0) {
          // Lazily create the DOM nodes on the first frame after a load.
          if (landmarkNodesRef.current.length !== landmarksRef.current.length) {
            for (const node of landmarkNodesRef.current) node.remove();
            landmarkNodesRef.current = landmarksRef.current.map((lm) => {
              const node = document.createElement('div');
              node.className = 'pixel-office-label pixel-office-label--landmark';
              node.textContent = lm.label;
              labelLayer.appendChild(node);
              return node;
            });
          }
          for (let i = 0; i < landmarksRef.current.length; i++) {
            const lm = landmarksRef.current[i];
            const node = landmarkNodesRef.current[i];
            // Tile-space → pixel-space → screen-space (mirrors the
            // character label math but without per-frame movement).
            const px = lm.col * TILE_SIZE;
            const py = lm.row * TILE_SIZE;
            const screenX = (offsetX + px * zoom) / dpr;
            const screenY = (offsetY + py * zoom) / dpr;
            node.style.transform = `translate(-50%, -100%) translate(${screenX}px, ${screenY}px)`;
          }
        }
      },
    }, { maxFps: lowGfx ? 30 : undefined });

    return () => {
      stop();
      ro.disconnect();
      // Drop any DOM label nodes we appended so a remount starts clean.
      for (const node of labelNodesRef.current.values()) node.remove();
      labelNodesRef.current.clear();
      for (const node of landmarkNodesRef.current) node.remove();
      landmarkNodesRef.current = [];
    };
  }, [status, consumeHeldDirection, lowGfx]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: typeof height === 'number' ? `${height}px` : height,
        background: '#0a0a0a',
        overflow: 'hidden',
        boxShadow: '0 0 0 1px rgba(56,189,248,.3), inset 0 0 32px rgba(0,16,24,.7)',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          imageRendering: 'pixelated',
          width: '100%',
          height: '100%',
        }}
      />
      <div
        ref={labelLayerRef}
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          overflow: 'hidden',
        }}
      />
      {tier && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            padding: '4px 8px',
            font: '10px "var(--font-sans)", monospace',
            letterSpacing: '.18em',
            color: '#7dd3fc',
            background: 'rgba(2,12,24,0.8)',
            border: '1px solid rgba(56,189,248,0.4)',
            pointerEvents: 'none',
          }}
        >
          TIER · {TIER_LABELS[tier]}
        </div>
      )}
      {playerId !== undefined && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            padding: '4px 8px',
            font: '10px "var(--font-sans)", monospace',
            letterSpacing: '.16em',
            color: 'rgba(125,211,252,.85)',
            background: 'rgba(2,12,24,0.75)',
            border: '1px solid rgba(56,189,248,0.3)',
            pointerEvents: 'none',
          }}
        >
          MOVE · WASD / ARROWS
        </div>
      )}
      <style>{`
        .pixel-office-label {
          position: absolute;
          left: 0;
          top: 0;
          font: 9px "var(--font-sans)", monospace;
          letter-spacing: .08em;
          color: #cbe9ff;
          background: rgba(2, 12, 24, 0.75);
          border: 1px solid rgba(56, 189, 248, 0.4);
          padding: 1px 5px;
          border-radius: 2px;
          white-space: nowrap;
          text-transform: uppercase;
          will-change: transform, opacity;
          transition: opacity .25s ease;
          text-shadow: 0 0 4px rgba(56, 189, 248, 0.6);
        }
        .pixel-office-label--player {
          color: #fde68a;
          background: rgba(40, 24, 0, 0.8);
          border-color: rgba(253, 224, 71, 0.6);
          text-shadow: 0 0 6px rgba(253, 224, 71, 0.7);
        }
        .pixel-office-label--landmark {
          color: #c4f5d4;
          background: rgba(2, 24, 12, 0.8);
          border-color: rgba(74, 222, 128, 0.5);
          text-shadow: 0 0 4px rgba(74, 222, 128, 0.6);
          letter-spacing: .14em;
        }
      `}</style>
      {status === 'loading' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#38bdf8',
            font: '12px "var(--font-sans)", monospace',
            letterSpacing: '.1em',
            background: 'rgba(0,0,0,.4)',
          }}
        >
          DECODING SPRITES…
        </div>
      )}
      {status === 'error' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#f87171',
            font: '12px "var(--font-sans)", monospace',
            padding: '1rem',
            textAlign: 'center',
          }}
        >
          OFFICE LOAD FAILED — {errMsg ?? 'unknown error'}
        </div>
      )}
    </div>
  );
}
