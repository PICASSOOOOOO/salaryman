import { useMemo, useState, type MouseEvent } from 'react';
import { CITY_QUADRANTS, CORE_ANCHORS, DOWNTOWN_BOUNDS } from '@/lib/city-config';
import { CompassRose, LANDMARK_GUIDE } from '@/components/MapChrome';

const TILE = 256;

export type MapPlayer = {
  id: string;
  x: number;
  y: number;
  faction?: 'self' | 'friendly' | 'hostile' | 'neutral';
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
  evt_fire: { color: '#ff704d', stroke: '#ffb199', icon: '▲', label: 'FIRE' },
  evt_blackout: { color: '#f5d66d', stroke: '#fff2a8', icon: '✦', label: 'BLACKOUT' },
  evt_medical: { color: '#45e0a0', stroke: '#9affca', icon: '+', label: 'MEDICAL' },
  evt_robbery: { color: '#ff5d79', stroke: '#ff9caf', icon: '!', label: 'ROBBERY' },
};
const DEFAULT_EVENT_META = { color: '#ff704d', stroke: '#ffb199', icon: '!', label: 'ALERT' };

interface BurnedPaperMapProps {
  exploredTiles: string[];
  players?: MapPlayer[];
  currentPosition?: { x: number; y: number } | null;
  waypoint?: MapWaypoint | null;
  onWaypointSet?: (x: number, y: number) => void;
  events?: WorldEventMarker[];
  onEventClick?: (ev: WorldEventMarker) => void;
  bounds?: { minX: number; minY: number; maxX: number; maxY: number };
  className?: string;
}

const DEFAULT_BOUNDS = {
  minX: DOWNTOWN_BOUNDS.left - 900,
  minY: DOWNTOWN_BOUNDS.top - 650,
  maxX: DOWNTOWN_BOUNDS.right + 900,
  maxY: DOWNTOWN_BOUNDS.bottom + 650,
};

function tileId(x: number, y: number): string {
  return `${Math.floor(x / TILE)},${Math.floor(y / TILE)}`;
}

function exploredAreaOverlaps(
  explored: Set<string>,
  area: { x: number; y: number; w: number; h: number },
): boolean {
  const minX = Math.floor(area.x / TILE);
  const maxX = Math.floor((area.x + area.w - 1) / TILE);
  const minY = Math.floor(area.y / TILE);
  const maxY = Math.floor((area.y + area.h - 1) / TILE);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (explored.has(`${x},${y}`)) return true;
    }
  }
  return false;
}

export function mapClientPointToWorld(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): { x: number; y: number } | null {
  const worldWidth = bounds.maxX - bounds.minX;
  const worldHeight = bounds.maxY - bounds.minY;
  if (worldWidth <= 0 || worldHeight <= 0 || rect.width <= 0 || rect.height <= 0) return null;

  const scale = Math.min(rect.width / worldWidth, rect.height / worldHeight);
  const renderedWidth = worldWidth * scale;
  const renderedHeight = worldHeight * scale;
  const offsetX = (rect.width - renderedWidth) / 2;
  const offsetY = (rect.height - renderedHeight) / 2;
  const localX = clientX - rect.left - offsetX;
  const localY = clientY - rect.top - offsetY;

  if (localX < 0 || localY < 0 || localX > renderedWidth || localY > renderedHeight) return null;
  return {
    x: Math.round(bounds.minX + localX / scale),
    y: Math.round(bounds.minY + localY / scale),
  };
}

function factionColor(faction: MapPlayer['faction']): string {
  if (faction === 'self') return '#c7f36b';
  if (faction === 'friendly') return '#55d6ff';
  if (faction === 'hostile') return '#ff5d79';
  return '#a9b5c8';
}

export function BurnedPaperMap({
  exploredTiles,
  players = [],
  currentPosition = null,
  waypoint = null,
  onWaypointSet,
  events = [],
  onEventClick,
  bounds = DEFAULT_BOUNDS,
  className = '',
}: BurnedPaperMapProps) {
  const [hoverPoi, setHoverPoi] = useState<string | null>(null);
  const [hoverEvent, setHoverEvent] = useState<string | null>(null);
  const exploredSet = useMemo(() => new Set(exploredTiles), [exploredTiles]);
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  const tileMinX = Math.floor(bounds.minX / TILE);
  const tileMinY = Math.floor(bounds.minY / TILE);
  const tileMaxX = Math.ceil(bounds.maxX / TILE);
  const tileMaxY = Math.ceil(bounds.maxY / TILE);

  function svgClick(event: MouseEvent<SVGSVGElement>) {
    if (!onWaypointSet) return;
    const point = mapClientPointToWorld(
      event.clientX,
      event.clientY,
      event.currentTarget.getBoundingClientRect(),
      bounds,
    );
    if (point) onWaypointSet(point.x, point.y);
  }

  const cityW = DOWNTOWN_BOUNDS.right - DOWNTOWN_BOUNDS.left;
  const cityH = DOWNTOWN_BOUNDS.bottom - DOWNTOWN_BOUNDS.top;
  const cityCx = DOWNTOWN_BOUNDS.left + cityW / 2;
  const cityCy = DOWNTOWN_BOUNDS.top + cityH / 2;

  return (
    <div className={`relative w-full h-full select-none ${className}`}
      style={{ background: 'radial-gradient(circle at 50% 30%, #112637 0%, #071019 55%, #03060b 100%)', padding: 10 }}>
      <style>{`
        @keyframes mapPulse { 0%,100% { opacity:.45; transform:scale(.8) } 50% { opacity:0; transform:scale(1.45) } }
        @keyframes mapDash { to { stroke-dashoffset:-120 } }
        @keyframes mapBeacon { 0%,100% { opacity:.7 } 50% { opacity:1 } }
        .map-pulse { transform-box:fill-box; transform-origin:center; animation:mapPulse 2.3s ease-out infinite; }
        .map-dash { animation:mapDash 14s linear infinite; }
        .map-beacon { animation:mapBeacon 1.8s ease-in-out infinite; }
      `}</style>
      <svg
        viewBox={`${bounds.minX} ${bounds.minY} ${w} ${h}`}
        preserveAspectRatio="xMidYMid meet"
        onClick={svgClick}
        className="w-full h-full"
        style={{ cursor: onWaypointSet ? 'crosshair' : 'default', display: 'block' }}
        aria-label="Minx City visitor map"
        data-testid="visitor-map"
      >
        <defs>
          <linearGradient id="atlasBase" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#142c3d" />
            <stop offset="52%" stopColor="#0b1a29" />
            <stop offset="100%" stopColor="#071019" />
          </linearGradient>
          <linearGradient id="cityCore" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#153c4d" stopOpacity=".75" />
            <stop offset="50%" stopColor="#102439" stopOpacity=".78" />
            <stop offset="100%" stopColor="#102035" stopOpacity=".9" />
          </linearGradient>
          <pattern id="atlasGrid" width="128" height="128" patternUnits="userSpaceOnUse">
            <path d="M128 0H0V128" fill="none" stroke="#65d4ee" strokeOpacity=".08" strokeWidth="2" />
            <circle cx="4" cy="4" r="2" fill="#65d4ee" fillOpacity=".12" />
          </pattern>
          <pattern id="fogTile" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M-8 32L32 -8M8 40L40 8" stroke="#02060d" strokeOpacity=".42" strokeWidth="9" />
            <path d="M0 0H32V32H0Z" fill="#030811" fillOpacity=".56" />
          </pattern>
          <filter id="atlasGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="10" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <radialGradient id="atlasEdge" cx="50%" cy="48%" r="66%">
            <stop offset="58%" stopColor="#02060b" stopOpacity="0" />
            <stop offset="86%" stopColor="#02060b" stopOpacity=".55" />
            <stop offset="100%" stopColor="#02060b" stopOpacity=".98" />
          </radialGradient>
        </defs>

        <rect x={bounds.minX} y={bounds.minY} width={w} height={h} fill="url(#atlasBase)" />
        <rect x={bounds.minX} y={bounds.minY} width={w} height={h} fill="url(#atlasGrid)" opacity=".75" />

        {/* Outer geography: the safe city is a bright island in a much darker map. */}
        <path d={`M ${bounds.minX + 150} ${cityCy - 190} L ${DOWNTOWN_BOUNDS.left - 420} ${DOWNTOWN_BOUNDS.top + 220}
          L ${DOWNTOWN_BOUNDS.left - 130} ${DOWNTOWN_BOUNDS.bottom + 270}
          L ${DOWNTOWN_BOUNDS.right + 480} ${DOWNTOWN_BOUNDS.bottom + 140}
          L ${DOWNTOWN_BOUNDS.right + 370} ${DOWNTOWN_BOUNDS.top - 250} Z`}
          fill="#091520" stroke="#2d7184" strokeOpacity=".22" strokeWidth="12" />
        <path d={`M ${bounds.minX} ${cityCy + 290} C ${cityCx - 720} ${cityCy + 80}, ${cityCx - 260} ${cityCy + 520}, ${bounds.maxX} ${cityCy + 160}`}
          fill="none" stroke="#2a8a9a" strokeOpacity=".13" strokeWidth="20" />
        <path d={`M ${bounds.minX} ${cityCy + 290} C ${cityCx - 720} ${cityCy + 80}, ${cityCx - 260} ${cityCy + 520}, ${bounds.maxX} ${cityCy + 160}`}
          fill="none" stroke="#65d4ee" strokeOpacity=".18" strokeWidth="3" strokeDasharray="28 20" className="map-dash" />

        {/* City core and its four readable district plates. */}
        <rect x={DOWNTOWN_BOUNDS.left} y={DOWNTOWN_BOUNDS.top} width={cityW} height={cityH}
          rx="22" fill="url(#cityCore)" stroke="#59d6f2" strokeOpacity=".56" strokeWidth="5" />
        {CITY_QUADRANTS.map((district) => {
          const known = exploredAreaOverlaps(exploredSet, district);
          return (
            <g key={district.id}>
              <rect x={district.x} y={district.y} width={district.w} height={district.h}
                fill={district.color} fillOpacity={known ? '.12' : '.045'} stroke={district.color}
                strokeOpacity={known ? '.55' : '.2'} strokeWidth="3" strokeDasharray="12 8" />
              <path d={`M${district.x + 26} ${district.y + 52}H${district.x + district.w - 26}`}
                stroke={district.color} strokeOpacity={known ? '.3' : '.1'} strokeWidth="2" />
              <text x={district.x + 28} y={district.y + 38} fill={district.color} fillOpacity={known ? '.95' : '.32'}
                fontSize="24" fontFamily="monospace" fontWeight="bold" letterSpacing="3">
                {district.label}
              </text>
              <text x={district.x + 30} y={district.y + 76} fill="#a9bfd1" fillOpacity={known ? '.7' : '.24'}
                fontSize="15" fontFamily="monospace" letterSpacing="1">
                {known ? district.blurb.toUpperCase() : 'SIGNAL OBSCURED · EXPLORE TO REVEAL'}
              </text>
            </g>
          );
        })}

        {/* A street spine and block-scale route hints. */}
        <g fill="none" strokeLinecap="round">
          <path d={`M${DOWNTOWN_BOUNDS.left + 50} ${cityCy}H${DOWNTOWN_BOUNDS.right - 50}`}
            stroke="#07111e" strokeWidth="66" />
          <path d={`M${cityCx} ${DOWNTOWN_BOUNDS.top + 35}V${DOWNTOWN_BOUNDS.bottom - 35}`}
            stroke="#07111e" strokeWidth="62" />
          <path d={`M${DOWNTOWN_BOUNDS.left + 50} ${cityCy}H${DOWNTOWN_BOUNDS.right - 50}`}
            stroke="#55d6ff" strokeOpacity=".43" strokeWidth="4" strokeDasharray="25 16" className="map-dash" />
          <path d={`M${cityCx} ${DOWNTOWN_BOUNDS.top + 35}V${DOWNTOWN_BOUNDS.bottom - 35}`}
            stroke="#55d6ff" strokeOpacity=".35" strokeWidth="4" strokeDasharray="25 16" className="map-dash" />
          {[DOWNTOWN_BOUNDS.left + 260, DOWNTOWN_BOUNDS.left + 550, DOWNTOWN_BOUNDS.right - 260].map((x) => (
            <path key={`road-v-${x}`} d={`M${x} ${DOWNTOWN_BOUNDS.top + 45}V${DOWNTOWN_BOUNDS.bottom - 45}`}
              stroke="#9dc2cf" strokeOpacity=".14" strokeWidth="12" />
          ))}
          {[DOWNTOWN_BOUNDS.top + 190, DOWNTOWN_BOUNDS.top + 430, DOWNTOWN_BOUNDS.bottom - 150].map((y) => (
            <path key={`road-h-${y}`} d={`M${DOWNTOWN_BOUNDS.left + 45} ${y}H${DOWNTOWN_BOUNDS.right - 45}`}
              stroke="#9dc2cf" strokeOpacity=".14" strokeWidth="12" />
          ))}
        </g>
        <text x={cityCx} y={DOWNTOWN_BOUNDS.bottom + 190} textAnchor="middle"
          fill="#75d7ea" fillOpacity=".55" fontSize="17" fontFamily="monospace" letterSpacing="5">
          SAFE CORE // STREET GRID
        </text>

        {/* Fog is a deliberate overlay: every tile remains legible as a shape,
            but its detail is hidden until the exploration set says otherwise. */}
        <g pointerEvents="none">
          {Array.from({ length: tileMaxY - tileMinY }).flatMap((_, dy) =>
            Array.from({ length: tileMaxX - tileMinX }).map((__, dx) => {
              const qx = tileMinX + dx;
              const qy = tileMinY + dy;
              const known = exploredSet.has(`${qx},${qy}`);
              return (
                <rect key={`fog-${qx}-${qy}`} x={qx * TILE} y={qy * TILE} width={TILE} height={TILE}
                  fill={known ? '#6ce7ef' : 'url(#fogTile)'} fillOpacity={known ? '.08' : '.5'}
                  stroke={known ? '#6ce7ef' : '#152b3c'} strokeOpacity={known ? '.18' : '.12'} strokeWidth="2" />
              );
            }),
          )}
        </g>

        {/* POIs become crisp and labeled only after their tile is discovered. */}
        <g>
          {CORE_ANCHORS.map((anchor) => {
            const known = exploredSet.has(tileId(anchor.x, anchor.y));
            const guide = LANDMARK_GUIDE[anchor.type];
            const visible = known || hoverPoi === anchor.id;
            return (
              <g key={anchor.id} onClick={(event) => event.stopPropagation()}
                onMouseEnter={() => setHoverPoi(anchor.id)} onMouseLeave={() => setHoverPoi(null)}
                style={{ cursor: 'help' }} data-testid={`poi-${anchor.id}`}>
                <circle cx={anchor.x} cy={anchor.y} r="48" fill={guide.color} fillOpacity={known ? '.15' : '.035'} />
                <circle cx={anchor.x} cy={anchor.y} r="30" fill="#071019" stroke={guide.color}
                  strokeOpacity={known ? '.95' : '.3'} strokeWidth={known ? '5' : '3'} />
                <text x={anchor.x} y={anchor.y + 10} textAnchor="middle" fill={guide.color}
                  fillOpacity={known ? '1' : '.35'} fontSize="26" fontFamily="monospace" fontWeight="bold">
                  {guide.icon}
                </text>
                {visible && (
                  <g>
                    <rect x={anchor.x - 105} y={anchor.y - 86} width="210" height="35" rx="5"
                      fill="#050c14" fillOpacity=".94" stroke={guide.color} strokeOpacity=".65" />
                    <text x={anchor.x} y={anchor.y - 63} textAnchor="middle" fill="#e0f5ff"
                      fontSize="19" fontFamily="monospace" fontWeight="bold" letterSpacing="2">
                      {anchor.short}
                    </text>
                    <text x={anchor.x} y={anchor.y + 73} textAnchor="middle" fill={guide.color}
                      fillOpacity={known ? '.8' : '.5'} fontSize="13" fontFamily="monospace" letterSpacing="2">
                      {known ? guide.tag : 'SIGNAL LOST'}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>

        {/* The player's position is always readable, even if the tile itself is
            still fogged, so the chart never loses its orientation. */}
        {currentPosition && (
          <g pointerEvents="none">
            <circle cx={currentPosition.x} cy={currentPosition.y} r="78" fill="#c7f36b" fillOpacity=".2" className="map-pulse" />
            <circle cx={currentPosition.x} cy={currentPosition.y} r="25" fill="#c7f36b" fillOpacity=".2" stroke="#c7f36b" strokeWidth="4" />
            <path d={`M${currentPosition.x} ${currentPosition.y - 42}l-12 18h24z`} fill="#c7f36b" filter="url(#softGlow)" />
            <text x={currentPosition.x} y={currentPosition.y + 63} textAnchor="middle" fill="#d9ff83"
              fontSize="15" fontFamily="monospace" fontWeight="bold" letterSpacing="2">
              YOU ARE HERE
            </text>
          </g>
        )}
        <g>
          {players.map((player) => {
            const color = factionColor(player.faction);
            return (
              <g key={player.id} pointerEvents="none">
                <circle cx={player.x} cy={player.y} r="24" fill={color} fillOpacity=".18" />
                <circle cx={player.x} cy={player.y} r="10" fill={color} stroke="#02060b" strokeWidth="3" />
                {player.label && <text x={player.x} y={player.y - 20} textAnchor="middle" fill={color} fontSize="13" fontFamily="monospace">{player.label}</text>}
              </g>
            );
          })}
        </g>

        <g>
          {events.map((event) => {
            const meta = EVENT_META[event.eventType] ?? DEFAULT_EVENT_META;
            const hovered = hoverEvent === event.id;
            return (
              <g key={event.id} style={{ cursor: onEventClick ? 'pointer' : 'default' }}
                onClick={(e) => { e.stopPropagation(); onEventClick ? onEventClick(event) : onWaypointSet?.(event.locationX, event.locationY); }}
                onMouseEnter={() => setHoverEvent(event.id)} onMouseLeave={() => setHoverEvent(null)}
                data-testid={`map-event-${event.id}`}>
                <circle cx={event.locationX} cy={event.locationY} r="55" fill="none" stroke={meta.stroke}
                  strokeWidth="5" className="map-pulse" />
                <circle cx={event.locationX} cy={event.locationY} r="28" fill={meta.color} fillOpacity=".28"
                  stroke={meta.stroke} strokeWidth="4" className="map-beacon" filter="url(#softGlow)" />
                <text x={event.locationX} y={event.locationY + 10} textAnchor="middle" fill="#fff" fontSize="25" fontFamily="monospace" fontWeight="bold">{meta.icon}</text>
                <rect x={event.locationX - 70} y={event.locationY - 88} width="140" height="28" rx="4"
                  fill="#050c14" fillOpacity=".95" stroke={meta.color} strokeWidth="2" />
                <text x={event.locationX} y={event.locationY - 68} textAnchor="middle" fill={meta.color}
                  fontSize="14" fontFamily="monospace" fontWeight="bold" letterSpacing="1">
                  {hovered ? 'SELECT RESPONSE' : meta.label}
                </text>
              </g>
            );
          })}
        </g>

        {waypoint && (
          <g pointerEvents="none">
            <circle cx={waypoint.x} cy={waypoint.y} r="45" fill="none" stroke="#e7ff65" strokeWidth="5" strokeDasharray="16 11" />
            <line x1={waypoint.x} y1={waypoint.y - 72} x2={waypoint.x} y2={waypoint.y - 38} stroke="#e7ff65" strokeWidth="5" />
            <text x={waypoint.x} y={waypoint.y - 82} textAnchor="middle" fill="#e7ff65"
              fontSize="16" fontFamily="monospace" fontWeight="bold" letterSpacing="2"
              style={{ paintOrder: 'stroke', stroke: '#03060b', strokeWidth: 6 }}>
              {waypoint.label || 'WAYPOINT'}
            </text>
          </g>
        )}
        <rect x={bounds.minX} y={bounds.minY} width={w} height={h} fill="url(#atlasEdge)" pointerEvents="none" />
      </svg>

      <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded border border-cyan-300/30 bg-[#050c14]/90 text-center pointer-events-none">
        <div className="text-[8px] font-mono tracking-[.35em] text-cyan-300/60">SALARYMAN // {DOWNTOWN_BOUNDS.left === 5600 ? 'MINX CITY' : 'CITY'}</div>
        <div className="text-[12px] font-mono tracking-[.24em] text-cyan-100 font-bold">VISITOR ATLAS</div>
      </div>
      <div className="absolute bottom-4 left-4 flex flex-wrap gap-2 text-[9px] font-mono tracking-widest text-slate-400 pointer-events-none">
        <span className="px-2 py-1 rounded border border-cyan-300/25 bg-[#050c14]/85 text-cyan-200">▦ DISCOVERED SIGNAL</span>
        <span className="px-2 py-1 rounded border border-slate-500/30 bg-[#050c14]/85 text-slate-500">▧ UNCHARTED</span>
      </div>
      <CompassRose size={62} color="#b7d8e1" accent="#c7f36b"
        className="absolute bottom-4 right-4 pointer-events-none opacity-85" />
    </div>
  );
}