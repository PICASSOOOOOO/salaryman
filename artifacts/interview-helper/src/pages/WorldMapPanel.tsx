import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Map, Users, Eye, Activity, MapPin,
  Loader2, RefreshCw, ZoomIn, ZoomOut, Maximize2,
  Building2, Shield, Swords, Radio, Clock,
  Crosshair, ChevronRight, AlertTriangle, Server, ChevronDown,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { resolveAvatarUrl } from '@/lib/avatar';
import { useAuth } from '@workspace/replit-auth-web';
import { useBoomerMode } from '@/hooks/use-mobile';

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

const DISTRICTS = CORE_DISTRICTS.map(d => ({ ...d }));

const FACTIONS = [
  { id: 'rust_syndicate', label: 'RUST SYNDICATE', x: 200,  y: 200,  w: 4800, h: 4800, color: '#ff3c3c', symbol: '🔥' },
  { id: 'void_runners',   label: 'VOID RUNNERS',   x: 5000, y: 200,  w: 4800, h: 4800, color: '#ff8c00', symbol: '⚡' },
  { id: 'static_monks',   label: 'STATIC MONKS',   x: 200,  y: 7600, w: 7000, h: 4800, color: '#c8ff00', symbol: '🕉' },
  { id: 'eastern_bloc',   label: 'EASTERN BLOC',   x: 7200, y: 7600, w: 7000, h: 4800, color: '#3c64ff', symbol: '⭐' },
];

type LandmarkType = 'tower' | 'gov' | 'finance' | 'commerce' | 'combat' | 'transit' | 'social';
const ANCHOR_TYPE_TO_LM: Record<typeof CORE_ANCHORS[number]['type'], LandmarkType> = {
  tower: 'tower', security: 'gov', commerce: 'commerce',
  civic: 'finance', realestate: 'social', terminal: 'transit',
};
const LANDMARKS = CORE_ANCHORS.map(a => ({ id: a.id, label: a.label, x: a.x, y: a.y, type: ANCHOR_TYPE_TO_LM[a.type] }));

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

export default function WorldMapPanel() {
  const { isAuthenticated } = useAuth();
  const [boomerMode] = useBoomerMode();
  const [players, setPlayers] = useState<PlayerPin[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerPin | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<typeof DISTRICTS[0] | null>(null);
  const [viewCenter, setViewCenter] = useState({ x: 6500, y: 6300 });
  const [mapMode, setMapMode] = useState<'city' | 'world'>('city');
  const [activeServer, setActiveServer] = useState<GameServer>(SERVERS[0]);
  const [serverDropdownOpen, setServerDropdownOpen] = useState(false);
  const [serverStatus, setServerStatus] = useState<{ online: number; max: number } | null>(null);
  const [builtPlots, setBuiltPlots] = useState<BuiltPlot[]>([]);
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
    setViewCenter({ x: 6500, y: 6300 });
    setZoom(1);
    setMapMode('city');
  };

  const viewRange = mapMode === 'city' ? 1200 / zoom : 8000 / zoom;
  const vbX = viewCenter.x - viewRange;
  const vbY = viewCenter.y - viewRange * 0.7;
  const vbW = viewRange * 2;
  const vbH = viewRange * 1.4;

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
            <h2 className="text-xl font-bold text-foreground">{boomerMode ? 'WORLD OVERVIEW' : 'OVERWATCH'}</h2>
            <p className="text-sm text-muted-foreground">Real-time tactical map — {activeServer.label} · {activeServer.region}</p>
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
              onClick={() => { setMapMode('city'); setViewCenter({ x: 6500, y: 6300 }); setZoom(1); }}
              className={`px-2.5 py-1 rounded-md text-[10px] font-mono tracking-wider transition-colors ${mapMode === 'city' ? 'bg-sky-500/15 text-sky-300' : 'text-zinc-500 hover:text-zinc-300'}`}
            >CITY</button>
            <button
              onClick={() => { setMapMode('world'); setViewCenter({ x: 7000, y: 6200 }); setZoom(1); }}
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
          className="relative bg-[#020408] border border-border rounded-xl overflow-hidden" style={{ minHeight: 520 }}>

          <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
            <button onClick={() => setZoom(z => Math.min(z + 0.3, 4))} className="w-7 h-7 rounded-md bg-black/70 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors">
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setZoom(z => Math.max(z - 0.3, 0.3))} className="w-7 h-7 rounded-md bg-black/70 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors">
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => { setZoom(1); setViewCenter(mapMode === 'city' ? { x: 6500, y: 6300 } : { x: 7000, y: 6200 }); }}
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
              <radialGradient id="cityGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(56,189,248,0.08)" />
                <stop offset="100%" stopColor="rgba(0,0,0,0)" />
              </radialGradient>
              <pattern id="gridPattern" width="100" height="100" patternUnits="userSpaceOnUse">
                <path d="M 100 0 L 0 0 0 100" fill="none" stroke="rgba(56,189,248,0.04)" strokeWidth="0.5" />
              </pattern>
            </defs>

            <rect x={0} y={0} width={W} height={H} fill="#020408" />
            <rect x={0} y={0} width={W} height={H} fill="url(#gridPattern)" />

            {mapMode === 'world' && FACTIONS.map(f => (
              <g key={f.id}>
                <rect x={f.x} y={f.y} width={f.w} height={f.h}
                  fill={`${f.color}08`} stroke={`${f.color}20`} strokeWidth={2} strokeDasharray="12 6" />
                <text x={f.x + f.w / 2} y={f.y + 60} textAnchor="middle"
                  fill={`${f.color}40`} fontSize={mapMode === 'world' ? 80 : 20} fontFamily="Share Tech Mono" fontWeight="bold">
                  {f.label}
                </text>
                <text x={f.x + f.w / 2} y={f.y + 120} textAnchor="middle"
                  fill={`${f.color}25`} fontSize={40} fontFamily="Share Tech Mono">
                  TERRITORY
                </text>
              </g>
            ))}

            <rect x={0} y={0} width={W} height={CITY_TOP} fill="rgba(15,8,0,0.6)" />
            <rect x={0} y={CITY_BOTTOM} width={W} height={H - CITY_BOTTOM} fill="rgba(15,8,0,0.6)" />

            <rect x={CITY_LEFT} y={CITY_TOP} width={CITY_RIGHT - CITY_LEFT} height={CITY_BOTTOM - CITY_TOP}
              fill="url(#cityGlow)" stroke="rgba(56,189,248,0.25)" strokeWidth={2} />

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
              const color = lm.type === 'tower' ? '#c084fc' : lm.type === 'gov' ? '#ef4444' : lm.type === 'finance' ? '#fbbf24' :
                lm.type === 'commerce' ? '#34d399' : lm.type === 'combat' ? '#f97316' : lm.type === 'transit' ? '#38bdf8' : '#a78bfa';
              const size = lm.type === 'tower' ? 12 : 8;
              return (
                <g key={lm.id}>
                  <rect x={lm.x - size / 2} y={lm.y - size / 2} width={size} height={size}
                    fill={`${color}40`} stroke={color} strokeWidth={1} rx={1} />
                  <text x={lm.x} y={lm.y - size / 2 - 4} textAnchor="middle"
                    fill={`${color}cc`} fontSize={6} fontFamily="Share Tech Mono" fontWeight="bold">
                    {lm.label}
                  </text>
                </g>
              );
            })}

            {mapMode === 'world' && (
              <>
                <text x={W / 2} y={CITY_TOP - 200} textAnchor="middle" fill="rgba(255,130,50,0.25)" fontSize={60} fontFamily="Share Tech Mono">NORTH WASTELAND</text>
                <text x={W / 2} y={CITY_BOTTOM + 300} textAnchor="middle" fill="rgba(255,130,50,0.25)" fontSize={60} fontFamily="Share Tech Mono">SOUTH WASTELAND</text>
              </>
            )}

            <line x1={CITY_LEFT} y1={CITY_TOP} x2={CITY_RIGHT} y2={CITY_TOP} stroke="rgba(56,189,248,0.2)" strokeWidth={2} strokeDasharray="10 5" />
            <line x1={CITY_LEFT} y1={CITY_BOTTOM} x2={CITY_RIGHT} y2={CITY_BOTTOM} stroke="rgba(56,189,248,0.2)" strokeWidth={2} strokeDasharray="10 5" />
            <line x1={CITY_LEFT} y1={CITY_TOP} x2={CITY_LEFT} y2={CITY_BOTTOM} stroke="rgba(56,189,248,0.15)" strokeWidth={1.5} />
            <line x1={CITY_RIGHT} y1={CITY_TOP} x2={CITY_RIGHT} y2={CITY_BOTTOM} stroke="rgba(56,189,248,0.15)" strokeWidth={1.5} />

            <line x1={CITY_LEFT} y1={6000} x2={CITY_RIGHT} y2={6000} stroke="rgba(56,189,248,0.08)" strokeWidth={1} />
            <line x1={CITY_LEFT} y1={6200} x2={CITY_RIGHT} y2={6200} stroke="rgba(56,189,248,0.08)" strokeWidth={1} />
            <line x1={6200} y1={CITY_TOP} x2={6200} y2={CITY_BOTTOM} stroke="rgba(56,189,248,0.08)" strokeWidth={1} />
            <line x1={6700} y1={CITY_TOP} x2={6700} y2={CITY_BOTTOM} stroke="rgba(56,189,248,0.08)" strokeWidth={1} />
            <line x1={7100} y1={CITY_TOP} x2={7100} y2={CITY_BOTTOM} stroke="rgba(56,189,248,0.08)" strokeWidth={1} />

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
          </svg>

          <div className="absolute bottom-3 left-3 flex items-center gap-3 px-3 py-1.5 rounded-lg bg-black/70 border border-white/10 backdrop-blur-sm">
            <span className="text-[9px] font-mono text-zinc-500">ZOOM: {Math.round(zoom * 100)}%</span>
            <span className="text-zinc-700">|</span>
            <span className="text-[9px] font-mono text-emerald-400">{players.length} ACTIVE</span>
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
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/10">
                <span className="text-[10px] font-mono text-zinc-400 tracking-widest uppercase">FACTION TERRITORIES</span>
              </div>
              <div className="p-3 space-y-2">
                {FACTIONS.map(f => (
                  <button key={f.id} onClick={() => { setViewCenter({ x: f.x + f.w / 2, y: f.y + f.h / 2 }); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/[0.03] transition-colors text-left">
                    <span className="text-sm">{f.symbol}</span>
                    <span className="text-[10px] font-mono flex-1 uppercase" style={{ color: f.color }}>{f.label}</span>
                    <ChevronRight className="w-3 h-3 text-zinc-600" />
                  </button>
                ))}
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
                ['#10b981', 'ONLINE PLAYER'],
                ['#38bdf8', 'CITY BOUNDARY'],
                ['#c084fc', 'TOWER / LANDMARK'],
                ['#ef4444', 'GOVERNMENT'],
                ['#fbbf24', 'FINANCE'],
                ['#34d399', 'COMMERCE'],
                ['#f97316', 'COMBAT / TRAINING'],
                ['#38bdf8', 'METRO LINE'],
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
                const color = lm.type === 'tower' ? '#c084fc' : lm.type === 'gov' ? '#ef4444' : lm.type === 'finance' ? '#fbbf24' :
                  lm.type === 'commerce' ? '#34d399' : lm.type === 'combat' ? '#f97316' : lm.type === 'transit' ? '#38bdf8' : '#a78bfa';
                return (
                  <button key={lm.id}
                    onClick={() => { setViewCenter({ x: lm.x, y: lm.y }); setZoom(2); setMapMode('city'); }}
                    className="w-full flex items-center gap-2 px-2 py-1 rounded-md hover:bg-white/[0.03] transition-colors text-left">
                    <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-[10px] font-mono text-zinc-400 flex-1">{lm.label}</span>
                    <span className="text-[9px] font-mono text-zinc-600">{lm.type.toUpperCase()}</span>
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
