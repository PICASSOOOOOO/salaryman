import { useMemo, useState } from "react";
import { CORE_ANCHORS, DOWNTOWN_BOUNDS } from "@/lib/city-config";
import { CompassRose, LANDMARK_GUIDE } from "@/components/MapChrome";

/**
 * Burned-paper world map — the GO TO WORK chart.
 *
 * Aesthetic: think a torn, sepia, slightly charred sheet pinned to a desk.
 * Unexplored regions are shown but blurred + low-contrast (RDR2 trick: the
 * land is still THERE, you just don't know what's on it). Explored tiles
 * burn through the haze so POIs become readable.
 *
 * Player dots are optional — the same component is reused full-screen for
 * the /game/map page (no dots) and as the in-world minimap (dots overlay).
 *
 * Tile size matches the server fog: 1 tile == 256 world units. We render
 * the explored tiles as a slightly-rotated mask of warm windows in the
 * paper, instead of a stark binary fog cliff.
 */

const TILE = 256;

export type MapPlayer = {
  id: string;
  x: number;
  y: number;
  faction?: "self" | "friendly" | "hostile" | "neutral";
  label?: string;
};

export type MapWaypoint = { x: number; y: number; label?: string | null };

export type WorldEventMarker = {
  id: string;
  eventType: string;
  locationX: number;
  locationY: number;
  rewardFiat?: number;
  banner?: string;
};

const EVENT_META: Record<string, { color: string; stroke: string; icon: string; label: string }> = {
  evt_fire:     { color: "#ff6622", stroke: "#ff8844", icon: "🔥", label: "FIRE" },
  evt_blackout: { color: "#ffe04b", stroke: "#fff066", icon: "⚡", label: "BLACKOUT" },
  evt_medical:  { color: "#22ee88", stroke: "#44ffaa", icon: "⛑", label: "MEDICAL" },
  evt_robbery:  { color: "#ff2233", stroke: "#ff5566", icon: "🔴", label: "ROBBERY" },
};

const DEFAULT_EVENT_META = { color: "#ff6622", stroke: "#ff8844", icon: "⚠", label: "ALERT" };

interface BurnedPaperMapProps {
  exploredTiles: string[]; // "qx,qy"
  players?: MapPlayer[];
  waypoint?: MapWaypoint | null;
  onWaypointSet?: (x: number, y: number) => void;
  events?: WorldEventMarker[];
  onEventClick?: (ev: WorldEventMarker) => void;
  // Optional override of the visible world bounds. Defaults to a margin around city.
  bounds?: { minX: number; minY: number; maxX: number; maxY: number };
  className?: string;
}

// city-config exposes DOWNTOWN_BOUNDS as {left,top,right,bottom}; we adapt
// to {minX,minY,maxX,maxY} here so the map can speak its own coord vocab.
const DEFAULT_BOUNDS = {
  minX: DOWNTOWN_BOUNDS.left - 1500,
  minY: DOWNTOWN_BOUNDS.top - 1500,
  maxX: DOWNTOWN_BOUNDS.right + 1500,
  maxY: DOWNTOWN_BOUNDS.bottom + 1500,
};

export function BurnedPaperMap({
  exploredTiles,
  players = [],
  waypoint = null,
  onWaypointSet,
  events = [],
  onEventClick,
  bounds = DEFAULT_BOUNDS,
  className = "",
}: BurnedPaperMapProps) {
  const [hoverPoi, setHoverPoi] = useState<string | null>(null);
  const [hoverEvent, setHoverEvent] = useState<string | null>(null);

  // Tile set lookup. Memoized because the explored list comes from server
  // and rarely changes mid-session.
  const exploredSet = useMemo(() => new Set(exploredTiles), [exploredTiles]);

  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;

  // Tile grid for the fog mask.
  const tileMinX = Math.floor(bounds.minX / TILE);
  const tileMinY = Math.floor(bounds.minY / TILE);
  const tileMaxX = Math.ceil(bounds.maxX / TILE);
  const tileMaxY = Math.ceil(bounds.maxY / TILE);

  function svgClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!onWaypointSet) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xFrac = (e.clientX - rect.left) / rect.width;
    const yFrac = (e.clientY - rect.top) / rect.height;
    const wx = Math.round(bounds.minX + xFrac * w);
    const wy = Math.round(bounds.minY + yFrac * h);
    onWaypointSet(wx, wy);
  }

  return (
    <div className={`relative w-full h-full select-none ${className}`} style={{
      // Outer mat: charred edges around the paper
      background: "radial-gradient(ellipse at center, #1a1410 60%, #0a0805 100%)",
      padding: "12px",
      borderRadius: "6px",
    }}>
      <style>{`
        @keyframes evPulse {
          0%   { r: 22; opacity: 0.9; }
          50%  { r: 38; opacity: 0.3; }
          100% { r: 22; opacity: 0.9; }
        }
        @keyframes evRing {
          0%   { r: 28; opacity: 0.7; }
          100% { r: 56; opacity: 0; }
        }
        .ev-pulse { animation: evPulse 1.4s ease-in-out infinite; }
        .ev-ring  { animation: evRing  1.4s ease-out  infinite; }
      `}</style>
      <svg
        viewBox={`${bounds.minX} ${bounds.minY} ${w} ${h}`}
        preserveAspectRatio="xMidYMid meet"
        onClick={svgClick}
        className="w-full h-full"
        style={{ cursor: onWaypointSet ? "crosshair" : "default", display: "block" }}
      >
        <defs>
          {/* Paper texture — layered noise that reads as fibers + foxing */}
          <filter id="paperNoise" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" />
            <feColorMatrix values="0 0 0 0 0.32  0 0 0 0 0.22  0 0 0 0 0.12  0 0 0 0.35 0" />
            <feComposite in2="SourceGraphic" operator="in" />
          </filter>
          <filter id="charBurn" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="3" />
            <feDisplacementMap in="SourceGraphic" scale="40" />
          </filter>
          {/* Vague-but-there: heavy blur for unexplored regions */}
          <filter id="vagueBlur"><feGaussianBlur stdDeviation="14" /></filter>
          <filter id="evGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>

          {/* Burned-edge vignette */}
          <radialGradient id="burnEdge" cx="50%" cy="50%" r="65%">
            <stop offset="0%" stopColor="#d9b88a" stopOpacity="0" />
            <stop offset="55%" stopColor="#7a4a1f" stopOpacity="0.0" />
            <stop offset="80%" stopColor="#3d1f0a" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#0a0502" stopOpacity="1" />
          </radialGradient>
          <linearGradient id="paperBase" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e6cfa3" />
            <stop offset="50%" stopColor="#d2b07f" />
            <stop offset="100%" stopColor="#a47a4c" />
          </linearGradient>
        </defs>

        {/* Paper base */}
        <rect x={bounds.minX} y={bounds.minY} width={w} height={h} fill="url(#paperBase)" />
        {/* Foxing / fibers */}
        <rect x={bounds.minX} y={bounds.minY} width={w} height={h} filter="url(#paperNoise)" opacity="0.6" />

        {/* Vague unexplored layer: hint of streets/blocks under heavy blur */}
        <g filter="url(#vagueBlur)" opacity="0.55">
          {/* Coarse street grid suggestion */}
          {Array.from({ length: 14 }).map((_, i) => (
            <line
              key={`v${i}`}
              x1={bounds.minX + (w / 14) * i}
              x2={bounds.minX + (w / 14) * i}
              y1={bounds.minY} y2={bounds.maxY}
              stroke="#3a2410" strokeWidth="6" opacity="0.4"
            />
          ))}
          {Array.from({ length: 10 }).map((_, i) => (
            <line
              key={`h${i}`}
              x1={bounds.minX} x2={bounds.maxX}
              y1={bounds.minY + (h / 10) * i}
              y2={bounds.minY + (h / 10) * i}
              stroke="#3a2410" strokeWidth="6" opacity="0.4"
            />
          ))}
          {/* Phantom downtown blob */}
          <ellipse
            cx={(DOWNTOWN_BOUNDS.left + DOWNTOWN_BOUNDS.right) / 2}
            cy={(DOWNTOWN_BOUNDS.top + DOWNTOWN_BOUNDS.bottom) / 2}
            rx={(DOWNTOWN_BOUNDS.right - DOWNTOWN_BOUNDS.left) / 2 + 200}
            ry={(DOWNTOWN_BOUNDS.bottom - DOWNTOWN_BOUNDS.top) / 2 + 200}
            fill="#5a3818" opacity="0.5"
          />
        </g>

        {/* Fog mask — clearer "windows" only over explored tiles */}
        <g>
          {Array.from({ length: tileMaxY - tileMinY }).flatMap((_, dy) =>
            Array.from({ length: tileMaxX - tileMinX }).map((_, dx) => {
              const qx = tileMinX + dx;
              const qy = tileMinY + dy;
              if (!exploredSet.has(`${qx},${qy}`)) return null;
              return (
                <rect
                  key={`t${qx}_${qy}`}
                  x={qx * TILE} y={qy * TILE}
                  width={TILE} height={TILE}
                  fill="#f7e6c2"
                  opacity="0.45"
                />
              );
            }),
          )}
        </g>

        {/* Anchor POIs — only visible / labeled when explored nearby OR core */}
        <g>
          {CORE_ANCHORS.map((a) => {
            const tileId = `${Math.floor(a.x / TILE)},${Math.floor(a.y / TILE)}`;
            const known = exploredSet.has(tileId);
            const fill = known ? "#3a1d08" : "#3a1d08";
            const opacity = known ? 1 : 0.35;
            return (
              <g
                key={a.id}
                onMouseEnter={() => setHoverPoi(a.id)}
                onMouseLeave={() => setHoverPoi(null)}
                style={{ cursor: "pointer" }}
              >
                <circle cx={a.x} cy={a.y} r="22" fill={fill} opacity={opacity} />
                <circle cx={a.x} cy={a.y} r="13" fill="#f4d589" opacity={opacity} />
                <text x={a.x} y={a.y + 7} textAnchor="middle" fontSize="20" opacity={opacity}>
                  {LANDMARK_GUIDE[a.type].icon}
                </text>
                {(known || hoverPoi === a.id) && (
                  <text
                    x={a.x} y={a.y - 32}
                    textAnchor="middle"
                    fontFamily="ui-monospace, monospace"
                    fontSize="34"
                    fill="#2a1505"
                    style={{ paintOrder: "stroke", stroke: "#e6cfa3", strokeWidth: 6 }}
                  >
                    {a.short}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        {/* Players */}
        <g>
          {players.map((p) => {
            const color = p.faction === "self" ? "#22c55e"
              : p.faction === "friendly" ? "#3b82f6"
              : p.faction === "hostile" ? "#ef4444"
              : "#a3a3a3";
            return (
              <g key={p.id}>
                <circle cx={p.x} cy={p.y} r="14" fill={color} opacity="0.35" />
                <circle cx={p.x} cy={p.y} r="7" fill={color} stroke="#0a0502" strokeWidth="2" />
                {p.faction === "self" && (
                  <circle cx={p.x} cy={p.y} r="22" fill="none" stroke={color} strokeWidth="2" opacity="0.6">
                    <animate attributeName="r" values="14;28;14" dur="2.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.6;0;0.6" dur="2.5s" repeatCount="indefinite" />
                  </circle>
                )}
              </g>
            );
          })}
        </g>

        {/* World event markers — pulsing alert beacons */}
        <g filter="url(#evGlow)">
          {events.map((ev) => {
            const meta = EVENT_META[ev.eventType] ?? DEFAULT_EVENT_META;
            const isHovered = hoverEvent === ev.id;
            return (
              <g
                key={ev.id}
                style={{ cursor: onEventClick ? "pointer" : "default" }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onEventClick) onEventClick(ev);
                  else if (onWaypointSet) onWaypointSet(ev.locationX, ev.locationY);
                }}
                onMouseEnter={() => setHoverEvent(ev.id)}
                onMouseLeave={() => setHoverEvent(null)}
              >
                {/* Outer expanding ring */}
                <circle
                  cx={ev.locationX} cy={ev.locationY}
                  r="28"
                  fill="none"
                  stroke={meta.stroke}
                  strokeWidth="3"
                  opacity="0.7"
                  className="ev-ring"
                  style={{ animationDelay: `${String(ev.id).charCodeAt(0) * 97 % 800}ms` }}
                />
                {/* Inner pulsing fill */}
                <circle
                  cx={ev.locationX} cy={ev.locationY}
                  r="22"
                  fill={meta.color}
                  fillOpacity="0.25"
                  stroke={meta.stroke}
                  strokeWidth="3"
                  className="ev-pulse"
                  style={{ animationDelay: `${String(ev.id).charCodeAt(0) * 97 % 800}ms` }}
                />
                {/* Icon */}
                <text
                  x={ev.locationX} y={ev.locationY + 10}
                  textAnchor="middle"
                  fontSize="28"
                >
                  {meta.icon}
                </text>
                {/* Label badge */}
                <rect
                  x={ev.locationX - 42} y={ev.locationY - 68}
                  width="84" height="22"
                  rx="4"
                  fill="#0a0502"
                  fillOpacity="0.85"
                  stroke={meta.color}
                  strokeWidth="2"
                />
                <text
                  x={ev.locationX} y={ev.locationY - 52}
                  textAnchor="middle"
                  fontFamily="ui-monospace, monospace"
                  fontSize="18"
                  fill={meta.color}
                  fontWeight="bold"
                >
                  {isHovered ? "→ GO HERE" : meta.label}
                </text>
              </g>
            );
          })}
        </g>

        {/* Waypoint marker */}
        {waypoint && (
          <g>
            <circle cx={waypoint.x} cy={waypoint.y} r="36" fill="none" stroke="#facc15" strokeWidth="6" strokeDasharray="14 10" />
            <line x1={waypoint.x} y1={waypoint.y - 60} x2={waypoint.x} y2={waypoint.y - 24} stroke="#facc15" strokeWidth="6" />
            <text
              x={waypoint.x} y={waypoint.y - 70}
              textAnchor="middle"
              fontFamily="ui-monospace, monospace"
              fontSize="32" fill="#facc15"
              style={{ paintOrder: "stroke", stroke: "#0a0502", strokeWidth: 5 }}
            >
              {waypoint.label || "WAYPOINT"}
            </text>
          </g>
        )}

        {/* Burned-edge vignette on top */}
        <rect x={bounds.minX} y={bounds.minY} width={w} height={h} fill="url(#burnEdge)" pointerEvents="none" />
      </svg>

      {/* Title strip */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded text-[10px] font-mono tracking-[0.45em]"
        style={{ background: "rgba(20,12,4,0.7)", color: "#e6cfa3", border: "1px solid #5a3a18" }}>
        MINX CITY · VISITOR MAP
      </div>

      <CompassRose size={54} color="#e6cfa3" accent="#c98a3a"
        className="absolute bottom-4 right-4 pointer-events-none opacity-80" />

      {/* Active event legend */}
      {events.length > 0 && (
        <div className="absolute bottom-4 left-4 flex flex-col gap-1">
          {events.map((ev) => {
            const meta = EVENT_META[ev.eventType] ?? DEFAULT_EVENT_META;
            return (
              <div
                key={ev.id}
                className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono tracking-widest cursor-pointer"
                style={{
                  background: "rgba(10,5,2,0.85)",
                  border: `1px solid ${meta.color}55`,
                  color: meta.color,
                }}
                onClick={() => {
                  if (onEventClick) onEventClick(ev);
                  else if (onWaypointSet) onWaypointSet(ev.locationX, ev.locationY);
                }}
              >
                <span>{meta.icon}</span>
                <span>{meta.label}</span>
                <span style={{ color: "#a0916a" }}>· TAP TO GO</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
