import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Map, Users, Eye, Activity, MapPin,
  Loader2, RefreshCw, ZoomIn, ZoomOut, Maximize2,
  Building2, Shield, Swords, Radio, Clock,
  Crosshair, AlertTriangle, Server, ChevronDown,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { resolveAvatarUrl } from '@/lib/avatar';
import { useAuth } from '@workspace/replit-auth-web';
import { useBoomerMode } from '@/hooks/use-mobile';
import { CompassRose, PamphletBanner, LANDMARK_GUIDE } from '@/components/MapChrome';

interface PlayerPin {
  userId: string;
  firstName: string | null;
  profileImageUrl: string | null;
  x: number;
  y: number;
  zone: string;
  status: string;
  lastAction: string | null;
  class: string | null;
  company: string | null;
  level: number | null;
  hp: number | null;
  maxHp: number | null;
  speaking: boolean;
}

import { CORE_ANCHORS, CORE_DISTRICTS, DOWNTOWN_BOUNDS } from '../lib/city-config';

const W = 14400, H = 12400;
const CITY_TOP = DOWNTOWN_BOUNDS.top, CITY_BOTTOM = DOWNTOWN_BOUNDS.bottom;
const CITY_LEFT = DOWNTOWN_BOUNDS.left, CITY_RIGHT = DOWNTOWN_BOUNDS.right;
const CITY_CX = (CITY_LEFT + CITY_RIGHT) / 2;
const CITY_CY = (CITY_TOP + CITY_BOTTOM) / 2;

// ── Poison-fog overview geometry (world units) ──────────────────────────────
// MINX CITY is the only safe ground. A band of lethal fog encircles the core,
// and the land continues out into the fogged wastes that only clear over the
// in-game year. These radii drive the map artwork below.
const GAS_INNER = 1350;    // inner edge of the gas band == edge of the safe core
const GAS_OUTER = 3050;    // outer edge of the gas band
const LAND_RADIUS = 6400;  // the landmass fades into void past this

const DISTRICTS = CORE_DISTRICTS.map(d => ({ ...d }));

const LANDMARKS = CORE_ANCHORS.map(a => ({ id: a.id, label: a.label, short: a.short, desc: a.desc, x: a.x, y: a.y, type: a.type }));

interface BuiltPlot { id: string; title: string; x: number; y: number; status: string; }

const SUBWAY_LINES = [
  { from: { x: 7295, y: 5750 }, to: { x: 6530, y: 6380 }, label: 'NORTH→CENTRAL' },
  { from: { x: 6530, y: 6380 }, to: { x: 5750, y: 6660 }, label: 'CENTRAL→SOUTH' },
  { from: { x: 6530, y: 6380 }, to: { x: 7120, y: 6660 }, label: 'CENTRAL→EAST' },
];

interface GameServer {
  id: string;
  label: string;
  region: string;
  status: 'online' | 'maintenance' | 'offline';
}

const SERVERS: GameServer[] = [
  { id: 'minx_prime', label: 'MINX PRIME', region: 'US-WEST (PST)', status: 'online' },
];

function getZoneForCoords(x: number, y: number): string {
  if (x >= CITY_LEFT && x <= CITY_RIGHT && y >= CITY_TOP && y <= CITY_BOTTOM) {
    for (const d of DISTRICTS) {
      if (x >= d.x && x <= d.x + d.w && y >= d.y && y <= d.y + d.h) return d.label;
    }
    return 'MINX CITY';
  }
  if (y < CITY_TOP) return 'NORTH WASTELAND';
  if (y > CITY_BOTTOM) return 'SOUTH WASTELAND';
  return 'WASTELAND';
}

interface BOCollectorPin { x: number; y: number; }

function readBoCollectorsFromSave(): { collectors: BOCollectorPin[]; wantedLevel: number } {
  try {
    // Prefer sm_live (written every ~1s by the game loop) so the map reflects
    // real-time positions. Fall back to sm_save (written every 30s) when the
    // game is not running (e.g. map opened from a different tab).
    const liveRaw = localStorage.getItem('sm_live');
    if (liveRaw) {
      const live = JSON.parse(liveRaw);
      const collectors = (Array.isArray(live.boCollectors) ? live.boCollectors : []) as BOCollectorPin[];
      const wantedLevel = (live.wantedLevel ?? 0) as number;
      return { collectors, wantedLevel };
    }
    const raw = localStorage.getItem('sm_save');
    if (!raw) return { collectors: [], wantedLevel: 0 };
    const save = JSON.parse(raw);
    const wantedLevel = (save.wantedLevel ?? 0) as number;
    const collectors = (Array.isArray(save.boCollectors) ? save.boCollectors : []) as BOCollectorPin[];
    return { collectors, wantedLevel };
  } catch {
    return { collectors: [], wantedLevel: 0 };
  }
}

export default function WorldMapPanel() {
  const { isAuthenticated } = useAuth();
  const [boomerMode] = useBoomerMode();
  const [players, setPlayers] = useState<PlayerPin[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerPin | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<typeof DISTRICTS[0] | null>(null);
  const [viewCenter, setViewCenter] = useState({ x: CITY_CX, y: CITY_CY });
  const [mapMode, setMapMode] = useState<'city' | 'world'>('world');
  const [activeServer, setActiveServer] = useState<GameServer>(SERVERS[0]);
  const [serverDropdownOpen, setServerDropdownOpen] = useState(false);
  const [serverStatus, setServerStatus] = useState<{ online: number; max: number } | null>(null);
  const [builtPlots, setBuiltPlots] = useState<BuiltPlot[]>([]);
  const [boCollectors, setBoCollectors] = useState<BOCollectorPin[]>([]);
  const [wantedLevel, setWantedLevel] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);

  const fetchPlayers = useCallback(() => {
    apiFetch(`/api/world/online?serverId=${activeServer.id}`)
      .then(r => r.json())
      .then(d => {
        const mapped = (d.players ?? []).map((p: any, i: number) => {
          const rawX = p.x ?? (CITY_LEFT + Math.random() * (CITY_RIGHT - CITY_LEFT));
          const rawY = p.y ?? (CITY_TOP + Math.random() * (CITY_BOTTOM - CITY_TOP));
          return {
            userId: p.userId ?? p.id ?? `u-${i}`,
            firstName: p.firstName ?? p.username ?? null,
            profileImageUrl: p.profileImageUrl ?? null,
            x: rawX,
            y: rawY,
            zone: getZoneForCoords(rawX, rawY),
            status: p.status ?? 'online',
            lastAction: p.lastAction ?? null,
            class: p.class ?? null,
            company: p.company ?? null,
            level: p.level ?? null,
            hp: p.hp ?? null,
            maxHp: p.maxHp ?? null,
            speaking: p.speaking ?? false,
          };
        });
        setPlayers(mapped);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    apiFetch('/api/world/server-status')
      .then(r => r.json())
      .then(d => setServerStatus({ online: d.online ?? 0, max: d.max ?? 100 }))
      .catch(() => {});
  }, [activeServer.id]);

  useEffect(() => {
    if (!isAuthenticated) { setLoading(false); return; }
    fetchPlayers();
    const interval = setInterval(fetchPlayers, 10000);
    return () => clearInterval(interval);
  }, [isAuthenticated, fetchPlayers]);

  useEffect(() => {
    const refresh = () => {
      const { collectors, wantedLevel: wl } = readBoCollectorsFromSave();
      setBoCollectors(collectors);
      setWantedLevel(wl);
    };
    refresh();
    const interval = setInterval(refresh, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadPlots = () => {
      apiFetch('/api/real-estate/listings')
        .then(r => r.ok ? r.json() : { listings: [] })
        .then(d => {
          if (cancelled) return;
          const items = (d.listings ?? d ?? []) as any[];
          const pad = DOWNTOWN_BOUNDS;
          setBuiltPlots(items.slice(0, 200).map((l: any, i: number) => {
            const coords = l.coords ?? l.location ?? null;
            let x = coords?.x ?? null;
            let y = coords?.y ?? null;
            if (x == null || y == null) {
              const angle = (i * 137.508) * (Math.PI / 180);
              const r = 280 + (i % 7) * 40;
              x = (pad.left + pad.right) / 2 + Math.cos(angle) * r;
              y = (pad.top + pad.bottom) / 2 + Math.sin(angle) * r;
            }
            return {
              id: String(l.id ?? `plot-${i}`),
              title: String(l.title ?? l.name ?? 'PLAYER PLOT'),
              x, y,
              status: String(l.status ?? 'active'),
            };
          }));
        })
        .catch(() => {});
    };
    loadPlots();
    const t = setInterval(loadPlots, 30000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const switchServer = (server: GameServer) => {
    setActiveServer(server);
    setServerDropdownOpen(false);
    setPlayers([]);
    setSelectedPlayer(null);
    setSelectedDistrict(null);
    setLoading(true);
    setViewCenter({ x: CITY_CX, y: CITY_CY });
    setZoom(1);
    setMapMode('world');
  };

  const viewRange = mapMode === 'city' ? 1100 / zoom : 4200 / zoom;
  const vbX = viewCenter.x - viewRange;
  const vbY = viewCenter.y - viewRange;
  const vbW = viewRange * 2;
  const vbH = viewRange * 2;

  const cityPlayers = players.filter(p => p.x >= CITY_LEFT && p.x <= CITY_RIGHT && p.y >= CITY_TOP && p.y <= CITY_BOTTOM);
  const wastelandPlayers = players.filter(p => !(p.x >= CITY_LEFT && p.x <= CITY_RIGHT && p.y >= CITY_TOP && p.y <= CITY_BOTTOM));

  const districtCounts = DISTRICTS.map(d => ({
    ...d,
    count: players.filter(p => p.x >= d.x && p.x <= d.x + d.w && p.y >= d.y && p.y <= d.y + d.h).length,
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto w-full">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/25 flex items-center justify-center">
            <Map className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">{boomerMode ? 'CITY MAP' : 'VISITOR MAP'}</h2>
            <p className="text-sm text-muted-foreground">Welcome to Minx City — your pocket guide to the safe streets. Mind the fog. · {activeServer.label}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <button
              onClick={() => setServerDropdownOpen(!serverDropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/30 border border-white/[0.06] hover:border-sky-500/20 transition-colors"
            >
              <Server className="w-3 h-3 text-sky-400" />
              <span className="text-[10px] font-mono text-sky-300 tracking-wider">{activeServer.label}</span>
              <span className={`w-1.5 h-1.5 rounded-full ${activeServer.status === 'online' ? 'bg-emerald-400' : activeServer.status === 'maintenance' ? 'bg-amber-400' : 'bg-red-400'}`} />
              <ChevronDown className={`w-3 h-3 text-zinc-500 transition-transform ${serverDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {serverDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setServerDropdownOpen(false)} />
                <div className="absolute top-full mt-1 left-0 w-64 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                  <div className="px-3 py-2 border-b border-white/[0.06]">
                    <span className="text-[9px] font-mono text-zinc-500 tracking-widest uppercase">SELECT SERVER</span>
                  </div>
                  {SERVERS.map(s => (
                    <button
                      key={s.id}
                      onClick={() => switchServer(s)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.04] transition-colors text-left ${activeServer.id === s.id ? 'bg-sky-500/[0.06]' : ''}`}
                    >
                      <Server className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono text-foreground tracking-wider">{s.label}</span>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.status === 'online' ? 'bg-emerald-400' : s.status === 'maintenance' ? 'bg-amber-400' : 'bg-red-400'}`} />
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[9px] font-mono text-zinc-500">{s.region}</span>
                          {serverStatus && activeServer.id === s.id && (
                            <span className="text-[9px] font-mono text-zinc-600">{serverStatus.online}/{serverStatus.max}</span>
                          )}
                        </div>
                      </div>
                      {activeServer.id === s.id && (
                        <span className="text-[8px] font-mono text-sky-400 tracking-widest">ACTIVE</span>
                      )}
                    </button>
                  ))}
                  <div className="px-3 py-2 border-t border-white/[0.06]">
                    <span className="text-[8px] font-mono text-zinc-600 tracking-wider">MORE SERVERS COMING SOON</span>
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-1 bg-black/30 border border-white/[0.06] rounded-lg p-0.5">
            <button
              onClick={() => { setMapMode('city'); setViewCenter({ x: CITY_CX, y: CITY_CY }); setZoom(1); }}
              className={`px-2.5 py-1 rounded-md text-[10px] font-mono tracking-wider transition-colors ${mapMode === 'city' ? 'bg-sky-500/15 text-sky-300' : 'text-zinc-500 hover:text-zinc-300'}`}
            >CITY</button>
            <button
              onClick={() => { setMapMode('world'); setViewCenter({ x: CITY_CX, y: CITY_CY }); setZoom(1); }}
              className={`px-2.5 py-1 rounded-md text-[10px] font-mono tracking-wider transition-colors ${mapMode === 'world' ? 'bg-sky-500/15 text-sky-300' : 'text-zinc-500 hover:text-zinc-300'}`}
            >WORLD</button>
          </div>
          <span className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            {players.length} ONLINE
          </span>
          <button
            onClick={() => { setLoading(true); fetchPlayers(); }}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[10px] font-mono text-zinc-500 tracking-widest">TOTAL ONLINE</span>
          </div>
          <p className="text-xl font-bold text-emerald-400">{players.length}</p>
        </div>
        <div className="bg-sky-500/5 border border-sky-500/15 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-[10px] font-mono text-zinc-500 tracking-widest">IN CITY</span>
          </div>
          <p className="text-xl font-bold text-sky-400">{cityPlayers.length}</p>
        </div>
        <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <Swords className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[10px] font-mono text-zinc-500 tracking-widest">WASTELAND</span>
          </div>
          <p className="text-xl font-bold text-amber-400">{wastelandPlayers.length}</p>
        </div>
        <div className="bg-violet-500/5 border border-violet-500/15 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <Server className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-[10px] font-mono text-zinc-500 tracking-widest">CAPACITY</span>
          </div>
          <p className="text-xl font-bold text-violet-400">{serverStatus ? `${serverStatus.online}/${serverStatus.max}` : '—'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="relative bg-[#04060c] border border-border rounded-xl overflow-hidden aspect-[4/3] lg:aspect-square" style={{ minHeight: 520 }}>

          <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
            <button onClick={() => setZoom(z => Math.min(z + 0.3, 4))} className="w-7 h-7 rounded-md bg-black/70 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors">
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setZoom(z => Math.max(z - 0.3, 0.3))} className="w-7 h-7 rounded-md bg-black/70 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors">
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => { setZoom(1); setViewCenter({ x: CITY_CX, y: CITY_CY }); }}
              className="w-7 h-7 rounded-md bg-black/70 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors">
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <svg
            ref={svgRef}
            className="w-full h-full cursor-crosshair"
            style={{ minHeight: 520 }}
            viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
            preserveAspectRatio="xMidYMid meet"
            onWheel={(e) => { e.preventDefault(); setZoom(z => e.deltaY < 0 ? Math.min(4, z * 1.15) : Math.max(0.3, z / 1.15)); }}
          >
            <defs>
              <radialGradient id="landBase" gradientUnits="userSpaceOnUse" cx={CITY_CX} cy={CITY_CY} r={LAND_RADIUS}>
                <stop offset="0%" stopColor="#222a3a" />
                <stop offset="45%" stopColor="#151b29" />
                <stop offset="100%" stopColor="#080b14" />
              </radialGradient>
              <radialGradient id="safeCore" gradientUnits="userSpaceOnUse" cx={CITY_CX} cy={CITY_CY} r={GAS_INNER + 250}>
                <stop offset="0%" stopColor="rgba(56,189,248,0.30)" />
                <stop offset="55%" stopColor="rgba(56,189,248,0.10)" />
                <stop offset="100%" stopColor="rgba(56,189,248,0)" />
              </radialGradient>
              <radialGradient id="gasBand" gradientUnits="userSpaceOnUse" cx={CITY_CX} cy={CITY_CY} r={GAS_OUTER}>
                <stop offset="0%" stopColor="rgba(150,235,40,0)" />
                <stop offset={`${(GAS_INNER / GAS_OUTER) * 100 - 4}%`} stopColor="rgba(150,235,40,0)" />
                <stop offset={`${(GAS_INNER / GAS_OUTER) * 100 + 6}%`} stopColor="rgba(163,255,60,0.50)" />
                <stop offset="78%" stopColor="rgba(110,190,30,0.34)" />
                <stop offset="100%" stopColor="rgba(50,95,15,0.06)" />
              </radialGradient>
              <radialGradient id="fogAll" gradientUnits="userSpaceOnUse" cx={CITY_CX} cy={CITY_CY} r={LAND_RADIUS}>
                <stop offset="0%" stopColor="rgba(130,200,50,0)" />
                <stop offset={`${(GAS_INNER / LAND_RADIUS) * 100 - 2}%`} stopColor="rgba(130,200,50,0)" />
                <stop offset={`${(GAS_INNER / LAND_RADIUS) * 100 + 3}%`} stopColor="rgba(130,200,50,0.16)" />
                <stop offset="100%" stopColor="rgba(90,150,35,0.13)" />
              </radialGradient>
              <radialGradient id="voidEdge" gradientUnits="userSpaceOnUse" cx={CITY_CX} cy={CITY_CY} r={LAND_RADIUS}>
                <stop offset="0%" stopColor="rgba(4,6,12,0)" />
                <stop offset="74%" stopColor="rgba(4,6,12,0)" />
                <stop offset="100%" stopColor="rgba(4,6,12,1)" />
              </radialGradient>
              <filter id="gasBlur" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="70" />
              </filter>
              <filter id="landTexture">
                <feTurbulence type="fractalNoise" baseFrequency="0.0045" numOctaves="3" seed="11" result="n" />
                <feColorMatrix in="n" values="0 0 0 0 0.10  0 0 0 0 0.14  0 0 0 0 0.20  0 0 0 0.55 0" />
                <feComposite in2="SourceGraphic" operator="in" />
              </filter>
              <pattern id="gridPattern" width="220" height="220" patternUnits="userSpaceOnUse">
                <path d="M 220 0 L 0 0 0 220" fill="none" stroke="rgba(120,170,210,0.05)" strokeWidth="1.2" />
              </pattern>
            </defs>

            {/* Void backdrop */}
            <rect x={0} y={0} width={W} height={H} fill="#04060c" />

            {/* The land exists: a continent of dust centered on the city */}
            <circle cx={CITY_CX} cy={CITY_CY} r={LAND_RADIUS} fill="url(#landBase)" />
            <circle cx={CITY_CX} cy={CITY_CY} r={LAND_RADIUS} fill="url(#gridPattern)" opacity={0.5} />
            <circle cx={CITY_CX} cy={CITY_CY} r={LAND_RADIUS} filter="url(#landTexture)" opacity={0.7} />

            {/* The whole land beyond the safe core is drowned in fog */}
            <circle cx={CITY_CX} cy={CITY_CY} r={LAND_RADIUS} fill="url(#fogAll)" pointerEvents="none" />

            {/* Dense poison fog encircling the city — a hazy, pulsing band */}
            <g filter="url(#gasBlur)">
              <circle cx={CITY_CX} cy={CITY_CY} r={GAS_OUTER} fill="url(#gasBand)">
                <animate attributeName="opacity" values="0.72;1;0.72" dur="7s" repeatCount="indefinite" />
              </circle>
            </g>

            {/* Toxic rim line marking where the safe core ends */}
            <circle cx={CITY_CX} cy={CITY_CY} r={GAS_INNER} fill="none"
              stroke="rgba(180,255,70,0.45)" strokeWidth={6} strokeDasharray="26 20">
              <animateTransform attributeName="transform" type="rotate"
                from={`0 ${CITY_CX} ${CITY_CY}`} to={`360 ${CITY_CX} ${CITY_CY}`} dur="120s" repeatCount="indefinite" />
            </circle>

            {/* Safe city core glow */}
            <circle cx={CITY_CX} cy={CITY_CY} r={GAS_INNER + 200} fill="url(#safeCore)" />

            {/* Land fades into the void at the rim */}
            <circle cx={CITY_CX} cy={CITY_CY} r={LAND_RADIUS} fill="url(#voidEdge)" pointerEvents="none" />

            {/* Safe-zone footprint (the actual downtown bounds) */}
            <rect x={CITY_LEFT} y={CITY_TOP} width={CITY_RIGHT - CITY_LEFT} height={CITY_BOTTOM - CITY_TOP}
              fill="rgba(56,189,248,0.05)" stroke="rgba(56,189,248,0.35)" strokeWidth={3} rx={8} />

            {DISTRICTS.map(d => (
              <g key={d.id} style={{ cursor: 'pointer' }}
                onClick={() => { setSelectedDistrict(d); setSelectedPlayer(null); setViewCenter({ x: d.x + d.w / 2, y: d.y + d.h / 2 }); }}>
                <rect x={d.x} y={d.y} width={d.w} height={d.h}
                  fill={`${d.color}0a`} stroke={`${d.color}30`} strokeWidth={1} rx={2} />
                <text x={d.x + d.w / 2} y={d.y + 16} textAnchor="middle"
                  fill={`${d.color}70`} fontSize={9} fontFamily="Share Tech Mono" fontWeight="bold">
                  {d.label}
                </text>
                <text x={d.x + d.w / 2} y={d.y + 28} textAnchor="middle"
                  fill={`${d.color}35`} fontSize={6} fontFamily="Share Tech Mono">
                  {d.desc}
                </text>
              </g>
            ))}

            {SUBWAY_LINES.map((line, i) => (
              <g key={i}>
                <line x1={line.from.x} y1={line.from.y} x2={line.to.x} y2={line.to.y}
                  stroke="rgba(56,189,248,0.15)" strokeWidth={3} strokeDasharray="8 4" />
                <circle cx={line.from.x} cy={line.from.y} r={5} fill="rgba(56,189,248,0.3)" stroke="rgba(56,189,248,0.5)" strokeWidth={1} />
                <circle cx={line.to.x} cy={line.to.y} r={5} fill="rgba(56,189,248,0.3)" stroke="rgba(56,189,248,0.5)" strokeWidth={1} />
              </g>
            ))}

            {builtPlots.map(plot => {
              const sold = plot.status === 'sold' || plot.status === 'owned';
              const fill = sold ? 'rgba(56,189,248,0.35)' : 'rgba(251,191,36,0.20)';
              const stroke = sold ? 'rgba(56,189,248,0.7)' : 'rgba(251,191,36,0.55)';
              return (
                <g key={`plot-${plot.id}`}>
                  <rect x={plot.x - 4} y={plot.y - 4} width={8} height={8} fill={fill} stroke={stroke} strokeWidth={0.8} rx={1} />
                  {zoom > 1.8 && (
                    <text x={plot.x} y={plot.y - 7} textAnchor="middle" fill={stroke} fontSize={4} fontFamily="Share Tech Mono">
                      {plot.title.slice(0, 16)}
                    </text>
                  )}
                </g>
              );
            })}
            {builtPlots.length === 0 && (
              <text x={(CITY_LEFT + CITY_RIGHT) / 2} y={CITY_BOTTOM - 30} textAnchor="middle"
                fill="rgba(251,191,36,0.55)" fontSize={10} fontFamily="Share Tech Mono">
                EMPTY LOTS — VISIT REAL ESTATE OFFICE TO BUILD
              </text>
            )}

            {LANDMARKS.map(lm => {
              const guide = LANDMARK_GUIDE[lm.type];
              const size = lm.type === 'tower' ? 34 : 26;
              const chipW = lm.label.length * 6.4 + 12;
              return (
                <g key={lm.id} style={{ cursor: 'pointer' }}
                  onClick={(e) => { e.stopPropagation(); setViewCenter({ x: lm.x, y: lm.y }); setZoom(2.2); setMapMode('city'); setSelectedPlayer(null); }}>
                  <circle cx={lm.x} cy={lm.y} r={size / 2} fill="rgba(8,12,20,0.82)" stroke={guide.color} strokeWidth={2} />
                  <text x={lm.x} y={lm.y + size * 0.2} textAnchor="middle" fontSize={size * 0.56}>{guide.icon}</text>
                  <rect x={lm.x - chipW / 2} y={lm.y - size / 2 - 19} width={chipW} height={14} rx={3}
                    fill="rgba(8,12,20,0.85)" stroke={`${guide.color}99`} strokeWidth={0.8} />
                  <text x={lm.x} y={lm.y - size / 2 - 9} textAnchor="middle"
                    fill={guide.color} fontSize={8.5} fontFamily="Share Tech Mono" fontWeight="bold">
                    {lm.label}
                  </text>
                </g>
              );
            })}

            {mapMode === 'world' && (
              <g fontFamily="Share Tech Mono" pointerEvents="none">
                <text x={CITY_CX} y={CITY_CY - (GAS_INNER + GAS_OUTER) / 2} textAnchor="middle"
                  fill="rgba(180,255,70,0.55)" fontSize={150} fontWeight="bold" letterSpacing="14">P O I S O N   F O G</text>
                <text x={CITY_CX} y={CITY_CY + (GAS_INNER + GAS_OUTER) / 2 + 40} textAnchor="middle"
                  fill="rgba(150,210,60,0.4)" fontSize={88} letterSpacing="10">LETHAL · NO ENTRY WITHOUT A MASK</text>
                <text x={CITY_CX} y={CITY_CY - LAND_RADIUS * 0.78} textAnchor="middle"
                  fill="rgba(140,150,170,0.35)" fontSize={130} letterSpacing="12">THE WASTES</text>
                <text x={CITY_CX} y={CITY_CY + LAND_RADIUS * 0.8} textAnchor="middle"
                  fill="rgba(140,150,170,0.3)" fontSize={88} letterSpacing="8">FOG LIFTS WITH THE YEAR</text>
                <text x={CITY_CX} y={CITY_CY} textAnchor="middle"
                  fill="rgba(56,189,248,0.75)" fontSize={64} fontWeight="bold" letterSpacing="8">MINX CITY · SAFE ZONE</text>
              </g>
            )}

            {/* Fine city grid (only meaningful when zoomed into the core) */}
            {mapMode === 'city' && (
              <g stroke="rgba(56,189,248,0.08)" strokeWidth={1}>
                <line x1={CITY_LEFT} y1={6000} x2={CITY_RIGHT} y2={6000} />
                <line x1={CITY_LEFT} y1={6200} x2={CITY_RIGHT} y2={6200} />
                <line x1={6200} y1={CITY_TOP} x2={6200} y2={CITY_BOTTOM} />
                <line x1={6700} y1={CITY_TOP} x2={6700} y2={CITY_BOTTOM} />
                <line x1={7100} y1={CITY_TOP} x2={7100} y2={CITY_BOTTOM} />
              </g>
            )}

            {players.map(p => {
              const isSelected = selectedPlayer?.userId === p.userId;
              const classColor = p.class === 'replicant' ? '#38bdf8' : p.class === 'outcast' ? '#f97316' :
                p.class === 'corporate' ? '#a78bfa' : p.class === 'contractor' ? '#fbbf24' : '#10b981';
              return (
                <g key={p.userId} style={{ cursor: 'pointer' }}
                  onClick={(e) => { e.stopPropagation(); setSelectedPlayer(isSelected ? null : p); setSelectedDistrict(null); }}>
                  {isSelected && (
                    <circle cx={p.x} cy={p.y} r={18} fill="none" stroke="#38bdf8" strokeWidth={1} strokeDasharray="4 3" opacity={0.6}>
                      <animate attributeName="r" values="15;22;15" dur="2s" repeatCount="indefinite" />
                    </circle>
                  )}
                  {p.speaking && (
                    <circle cx={p.x} cy={p.y} r={12} fill="none" stroke="#fbbf24" strokeWidth={0.8} opacity={0.5}>
                      <animate attributeName="r" values="10;16;10" dur="1.5s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.5;0.1;0.5" dur="1.5s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <circle cx={p.x} cy={p.y} r={5} fill={`${classColor}66`} stroke={classColor} strokeWidth={1.5} />
                  <circle cx={p.x} cy={p.y} r={2} fill={classColor} />
                  {p.status === 'idle' && (
                    <text x={p.x + 7} y={p.y + 2} fill="rgba(251,191,36,0.6)" fontSize={6} fontFamily="Share Tech Mono">z</text>
                  )}
                  {(zoom > 1.5 || isSelected) && (
                    <text x={p.x} y={p.y - 9} textAnchor="middle" fill={classColor} fontSize={5} fontFamily="Share Tech Mono">
                      {p.firstName || 'ANON'}
                    </text>
                  )}
                </g>
              );
            })}

            {boCollectors.length > 0 && wantedLevel > 0 && boCollectors.map((bc, i) => (
              <g key={`bo-${i}`} pointerEvents="none">
                <circle cx={bc.x} cy={bc.y} r={14} fill="none" stroke="rgba(255,30,30,0.35)" strokeWidth={1}>
                  <animate attributeName="r" values="10;18;10" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.5;0.1;0.5" dur="2s" repeatCount="indefinite" />
                </circle>
                <circle cx={bc.x} cy={bc.y} r={5} fill="rgba(255,30,30,0.5)" stroke="#ff1e1e" strokeWidth={1.5} />
                <circle cx={bc.x} cy={bc.y} r={2} fill="#ff1e1e" />
                {zoom > 1.2 && (
                  <text x={bc.x} y={bc.y - 10} textAnchor="middle" fill="#ff4444" fontSize={6} fontFamily="Share Tech Mono" fontWeight="bold">BO</text>
                )}
              </g>
            ))}
          </svg>

          <PamphletBanner title="VISITOR MAP" subtitle="WELCOME TO MINX CITY"
            className="absolute top-3 left-3 z-10 pointer-events-none" />
          <CompassRose size={58} color="#38bdf8" accent="#a3ff3c"
            className="absolute bottom-3 right-3 z-10 pointer-events-none opacity-80" />

          <div className="absolute bottom-3 left-3 flex items-center gap-3 px-3 py-1.5 rounded-lg bg-black/70 border border-white/10 backdrop-blur-sm">
            <span className="text-[9px] font-mono text-zinc-500">ZOOM: {Math.round(zoom * 100)}%</span>
            <span className="text-zinc-700">|</span>
            <span className="text-[9px] font-mono text-emerald-400">{players.length} ACTIVE</span>
            {boCollectors.length > 0 && wantedLevel > 0 && (
              <>
                <span className="text-zinc-700">|</span>
                <span className="text-[9px] font-mono text-red-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                  {boCollectors.length} COLLECTOR{boCollectors.length > 1 ? 'S' : ''}
                </span>
              </>
            )}
            <span className="text-zinc-700">|</span>
            <span className="text-[9px] font-mono text-zinc-500">{activeServer.label}</span>
            <span className="text-zinc-700">|</span>
            <span className="text-[9px] font-mono text-zinc-600">
              <Clock className="w-2.5 h-2.5 inline mr-1" />
              {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </motion.div>

        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/10 flex items-center justify-between">
              <span className="text-[10px] font-mono text-zinc-400 tracking-widest uppercase">DISTRICT DENSITY</span>
              <span className="text-[9px] font-mono text-zinc-600">{cityPlayers.length} in city</span>
            </div>
            <div className="p-3 space-y-1.5 max-h-[250px] overflow-y-auto">
              {districtCounts.sort((a, b) => b.count - a.count).map(d => {
                const pct = players.length > 0 ? Math.round((d.count / Math.max(1, players.length)) * 100) : 0;
                return (
                  <button key={d.id} onClick={() => { setSelectedDistrict(d); setViewCenter({ x: d.x + d.w / 2, y: d.y + d.h / 2 }); setSelectedPlayer(null); }}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors text-left ${selectedDistrict?.id === d.id ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}`}>
                    <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: d.color }} />
                    <span className="text-[10px] font-mono text-zinc-400 flex-1 uppercase truncate">{d.label}</span>
                    <span className="text-[10px] font-mono text-foreground font-bold">{d.count}</span>
                    <div className="w-10 h-1.5 bg-muted/30 rounded-full overflow-hidden shrink-0">
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct * 3)}%`, backgroundColor: d.color }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {mapMode === 'world' && (
            <div className="bg-card border border-lime-500/20 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/10 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-lime-400" />
                <span className="text-[10px] font-mono text-lime-300 tracking-widest uppercase">POISON FOG</span>
              </div>
              <div className="p-3 space-y-2 text-[10px] font-mono text-zinc-400 leading-relaxed">
                <p>The whole land is drowned in lethal fog. Only <span className="text-sky-300">MINX CITY</span> and your own home base are safe.</p>
                <p className="text-zinc-500">Cross the fog only with a <span className="text-lime-300">HAZMAT MASK</span> or a hazmat escort. The fog slowly lifts over the in-game year.</p>
              </div>
            </div>
          )}

          {selectedDistrict && !selectedPlayer && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="bg-card border rounded-xl p-4" style={{ borderColor: `${selectedDistrict.color}30` }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: selectedDistrict.color }} />
                <span className="text-sm font-bold text-foreground">{selectedDistrict.label}</span>
              </div>
              <p className="text-xs text-zinc-500 mb-3">{selectedDistrict.desc}</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-muted/20 rounded-lg px-3 py-2">
                  <p className="text-[9px] text-zinc-600 uppercase tracking-wider">PLAYERS</p>
                  <p className="text-xs font-bold" style={{ color: selectedDistrict.color }}>
                    {districtCounts.find(d => d.id === selectedDistrict.id)?.count ?? 0}
                  </p>
                </div>
                <div className="bg-muted/20 rounded-lg px-3 py-2">
                  <p className="text-[9px] text-zinc-600 uppercase tracking-wider">COORDS</p>
                  <p className="text-xs font-bold text-foreground">{selectedDistrict.x}, {selectedDistrict.y}</p>
                </div>
              </div>
            </motion.div>
          )}

          {selectedPlayer && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="bg-card border border-emerald-500/20 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                {resolveAvatarUrl(selectedPlayer.profileImageUrl) ? (
                  <img src={resolveAvatarUrl(selectedPlayer.profileImageUrl)} alt="" className="w-10 h-10 rounded-xl object-cover border border-border" />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-sm font-bold text-emerald-300">
                    {(selectedPlayer.firstName?.[0] || '?').toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{selectedPlayer.firstName || 'Anonymous'}</p>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-2.5 h-2.5 text-zinc-500" />
                    <span className="text-[10px] text-zinc-400">{selectedPlayer.zone}</span>
                    {selectedPlayer.speaking && (
                      <span className="text-[9px] text-amber-400 flex items-center gap-0.5">
                        <Radio className="w-2.5 h-2.5" /> VOICE
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-muted/20 rounded-lg px-3 py-2">
                  <p className="text-[9px] text-zinc-600 uppercase tracking-wider">STATUS</p>
                  <p className="text-xs font-bold text-emerald-400 uppercase">{selectedPlayer.status}</p>
                </div>
                <div className="bg-muted/20 rounded-lg px-3 py-2">
                  <p className="text-[9px] text-zinc-600 uppercase tracking-wider">POSITION</p>
                  <p className="text-xs font-bold text-foreground">{Math.round(selectedPlayer.x)}, {Math.round(selectedPlayer.y)}</p>
                </div>
                {selectedPlayer.class && (
                  <div className="bg-muted/20 rounded-lg px-3 py-2">
                    <p className="text-[9px] text-zinc-600 uppercase tracking-wider">CLASS</p>
                    <p className="text-xs font-bold text-sky-400 uppercase">{selectedPlayer.class}</p>
                  </div>
                )}
                {selectedPlayer.level != null && (
                  <div className="bg-muted/20 rounded-lg px-3 py-2">
                    <p className="text-[9px] text-zinc-600 uppercase tracking-wider">LEVEL</p>
                    <p className="text-xs font-bold text-amber-400">LVL {selectedPlayer.level}</p>
                  </div>
                )}
              </div>
              {selectedPlayer.hp != null && selectedPlayer.maxHp != null && (
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] text-zinc-600 uppercase tracking-wider">HP</span>
                    <span className="text-[9px] font-mono text-zinc-400">{selectedPlayer.hp} / {selectedPlayer.maxHp}</span>
                  </div>
                  <div className="w-full h-1.5 bg-muted/30 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${Math.round((selectedPlayer.hp / selectedPlayer.maxHp) * 100)}%`,
                      backgroundColor: selectedPlayer.hp / selectedPlayer.maxHp > 0.5 ? '#10b981' : selectedPlayer.hp / selectedPlayer.maxHp > 0.25 ? '#f59e0b' : '#ef4444',
                    }} />
                  </div>
                </div>
              )}
              {selectedPlayer.company && (
                <div className="mt-2 bg-muted/10 rounded-lg px-3 py-2">
                  <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-0.5">COMPANY</p>
                  <p className="text-xs text-foreground font-mono">{selectedPlayer.company}</p>
                </div>
              )}
              {selectedPlayer.lastAction && (
                <div className="mt-2 bg-muted/10 rounded-lg px-3 py-2">
                  <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-0.5">LAST ACTION</p>
                  <p className="text-xs text-foreground">{selectedPlayer.lastAction}</p>
                </div>
              )}
            </motion.div>
          )}

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/10 flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-[10px] font-mono text-zinc-400 tracking-widest uppercase">LEGEND</span>
            </div>
            <div className="p-3 grid grid-cols-2 gap-1.5">
              {[
                ['#10b981', 'VISITORS HERE NOW'],
                ['#38bdf8', 'SAFE — MINX CITY'],
                ['#a3ff3c', 'DANGER — POISON FOG'],
                ['#c084fc', '🏢 LANDMARK'],
                ['#f87171', '🚓 POLICE'],
                ['#fbbf24', '🏛️ CIVIC'],
                ['#34d399', '🛒 SHOPS'],
                ['#38bdf8', '🚇 METRO LINE'],
              ].map(([c, l]) => (
                <div key={l} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: c }} />
                  <span className="text-[9px] text-zinc-500 tracking-wider">{l}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[10px] font-mono text-zinc-400 tracking-widest uppercase">LIVE ROSTER</span>
              </div>
              <span className="text-[9px] font-mono text-emerald-400">{players.length}</span>
            </div>
            <div className="p-2 space-y-0.5 max-h-[200px] overflow-y-auto">
              {players.length === 0 ? (
                <p className="text-[10px] text-zinc-600 text-center py-3">No players online</p>
              ) : players.map(p => {
                const cColor = p.class === 'replicant' ? 'text-sky-400' : p.class === 'outcast' ? 'text-orange-400' :
                  p.class === 'corporate' ? 'text-violet-400' : p.class === 'contractor' ? 'text-amber-400' : 'text-emerald-400';
                return (
                  <button key={p.userId}
                    onClick={() => { setSelectedPlayer(p); setSelectedDistrict(null); setViewCenter({ x: p.x, y: p.y }); setZoom(2); setMapMode('city'); }}
                    className={`w-full flex items-center gap-2 px-2 py-1 rounded-md transition-colors text-left ${selectedPlayer?.userId === p.userId ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.status === 'active' ? 'bg-emerald-400' : p.status === 'idle' ? 'bg-amber-400' : 'bg-zinc-500'}`} />
                    <span className={`text-[10px] font-mono flex-1 truncate ${cColor}`}>{p.firstName || 'ANON'}</span>
                    {p.speaking && <Radio className="w-2.5 h-2.5 text-amber-400 shrink-0" />}
                    {p.level != null && <span className="text-[8px] font-mono text-zinc-600 shrink-0">L{p.level}</span>}
                    <span className="text-[8px] font-mono text-zinc-700 shrink-0">{p.zone.split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/10 flex items-center gap-2">
              <Crosshair className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] font-mono text-zinc-400 tracking-widest uppercase">KEY LANDMARKS</span>
            </div>
            <div className="p-3 space-y-1">
              {LANDMARKS.map(lm => {
                const guide = LANDMARK_GUIDE[lm.type];
                return (
                  <button key={lm.id}
                    onClick={() => { setViewCenter({ x: lm.x, y: lm.y }); setZoom(2.2); setMapMode('city'); }}
                    className="w-full flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-white/[0.03] transition-colors text-left">
                    <span className="text-base leading-none shrink-0">{guide.icon}</span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="text-[10px] font-mono flex-1 truncate" style={{ color: guide.color }}>{lm.label}</span>
                        <span className="text-[8px] font-mono text-zinc-600 shrink-0">{guide.tag}</span>
                      </span>
                      <span className="block text-[9px] text-zinc-600 leading-snug mt-0.5 truncate">{lm.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
