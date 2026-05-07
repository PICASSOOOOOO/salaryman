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
 *
 * What this is NOT:
 *   - Not the editor. Furniture/floor/wall placement is intentionally
 *     stripped — this read-only view focuses on the live experience.
 *   - Not wired to real-time bot tool calls (yet). Each agent just runs
 *     the engine's wander/sit/type loop. A future pass can plug each
 *     agent's `currentTool` into a real activity feed.
 */
import { useEffect, useRef, useState } from 'react';
import { OfficeState } from './office/engine/officeState.js';
import { renderFrame, type SelectionRenderState } from './office/engine/renderer.js';
import { startGameLoop } from './office/engine/gameLoop.js';
import { loadPixelOfficeAssets } from './loadAssets.js';
import { TILE_SIZE } from './constants.js';

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
}

const DEFAULT_AGENTS = 5;

export function LiveOffice({
  agentCount = DEFAULT_AGENTS,
  agents,
  activity,
  height = 480,
  passive: _passive = false,
}: LiveOfficeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const labelLayerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<OfficeState | null>(null);
  const panRef = useRef({ x: 0, y: 0 });
  // id → name lookup for the DOM label overlay (avoids re-rendering React on
  // every animation frame; we mutate the divs directly).
  const labelMapRef = useRef<Map<number, string>>(new Map());
  const labelNodesRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // ── Asset load + state init ──────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { layout } = await loadPixelOfficeAssets();
        if (cancelled) return;
        const os = new OfficeState();
        if (layout) {
          os.rebuildFromLayout(layout);
        }
        // Spawn agents — addAgent picks free seats and assigns palettes.
        const list: { id: number; label?: string; palette?: number; hueShift?: number }[] =
          agents && agents.length > 0
            ? agents
            : Array.from({ length: agentCount }, (_, i) => ({ id: i + 1 }));
        labelMapRef.current.clear();
        for (const a of list) {
          os.addAgent(a.id, a.palette, a.hueShift, undefined, true);
          if (a.label) labelMapRef.current.set(a.id, a.label);
        }
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
  }, [agentCount, agents]);

  // ── Live activity sync ───────────────────────────────────────
  // Reapply whenever activity changes. Cheap; the engine smooths the
  // visual transition (active agents start typing, idle ones return to
  // their seat or wander).
  useEffect(() => {
    if (status !== 'ready') return;
    const os = stateRef.current;
    if (!os) return;
    for (const ch of os.characters.values()) {
      const a = activity?.[ch.id];
      os.setAgentActive(ch.id, !!a?.active);
      os.setAgentTool(ch.id, a?.tool ?? null);
    }
  }, [activity, status]);

  // ── Game loop + render loop ──────────────────────────────────
  useEffect(() => {
    if (status !== 'ready') return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const os = stateRef.current;
    if (!canvas || !container || !os) return;

    // Resize backing store to device pixels for crispness.
    const dpr = Math.max(1, window.devicePixelRatio || 1);
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

    const stop = startGameLoop(canvas, {
      update: (dt: number) => {
        os.update(dt);
      },
      render: (ctx: CanvasRenderingContext2D) => {
        const zoom = fit();
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
      },
    });

    return () => {
      stop();
      ro.disconnect();
      // Drop any DOM label nodes we appended so a remount starts clean.
      for (const node of labelNodesRef.current.values()) node.remove();
      labelNodesRef.current.clear();
    };
  }, [status]);

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
      <style>{`
        .pixel-office-label {
          position: absolute;
          left: 0;
          top: 0;
          font: 9px "Share Tech Mono", monospace;
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
            font: '12px "Share Tech Mono", monospace',
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
            font: '12px "Share Tech Mono", monospace',
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
