import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Map, Users, Eye, Activity, MapPin,
  Loader2, RefreshCw, ZoomIn, ZoomOut, Maximize2,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
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
}

const ZONES = [
  { id: 'downtown', label: 'DOWNTOWN', x: 40, y: 30, w: 20, h: 20, color: '#38bdf8' },
  { id: 'industrial', label: 'INDUSTRIAL', x: 65, y: 25, w: 18, h: 15, color: '#f59e0b' },
  { id: 'residential', label: 'RESIDENTIAL', x: 15, y: 55, w: 22, h: 18, color: '#a78bfa' },
  { id: 'harbor', label: 'HARBOR', x: 70, y: 60, w: 20, h: 20, color: '#34d399' },
  { id: 'plaza', label: 'PLAZA', x: 42, y: 60, w: 15, h: 12, color: '#fb7185' },
  { id: 'outskirts', label: 'OUTSKIRTS', x: 10, y: 20, w: 18, h: 15, color: '#94a3b8' },
];

export default function WorldMapPanel() {
  const { isAuthenticated } = useAuth();
  const [boomerMode] = useBoomerMode();
  const [players, setPlayers] = useState<PlayerPin[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerPin | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  const fetchPlayers = () => {
    apiFetch('/api/world/online')
      .then(r => r.json())
      .then(d => {
        const mapped = (d.players ?? []).map((p: any, i: number) => {
          const zoneIndex = i % ZONES.length;
          const zone = ZONES[zoneIndex];
          return {
            userId: p.userId ?? p.id ?? `u-${i}`,
            firstName: p.firstName ?? p.username ?? null,
            profileImageUrl: p.profileImageUrl ?? null,
            x: zone.x + Math.random() * zone.w,
            y: zone.y + Math.random() * zone.h,
            zone: zone.label,
            status: p.status ?? 'online',
            lastAction: p.lastAction ?? null,
          };
        });
        setPlayers(mapped);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!isAuthenticated) { setLoading(false); return; }
    fetchPlayers();
    const interval = setInterval(fetchPlayers, 10000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  return (
    <div className="p-6 max-w-6xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/25 flex items-center justify-center">
            <Map className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">{boomerMode ? 'WORLD OVERVIEW' : 'OVERWATCH'}</h2>
            <p className="text-sm text-muted-foreground">Real-time surveillance map of all users and actions</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="relative bg-[#0c0c0f] border border-border rounded-xl overflow-hidden"
          style={{ minHeight: 500 }}
        >
          <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
            <button onClick={() => setZoom(z => Math.min(z + 0.25, 2))} className="w-7 h-7 rounded-md bg-black/60 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white">
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setZoom(z => Math.max(z - 0.25, 0.5))} className="w-7 h-7 rounded-md bg-black/60 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white">
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setZoom(1)} className="w-7 h-7 rounded-md bg-black/60 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white">
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div
            ref={mapRef}
            className="relative w-full h-full transition-transform"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', minHeight: 500 }}
          >
            <div className="absolute inset-0" style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.03) 1px, transparent 0)',
              backgroundSize: '20px 20px',
            }} />

            {ZONES.map(zone => (
              <div
                key={zone.id}
                className="absolute rounded-lg border border-white/5"
                style={{
                  left: `${zone.x}%`,
                  top: `${zone.y}%`,
                  width: `${zone.w}%`,
                  height: `${zone.h}%`,
                  backgroundColor: `${zone.color}08`,
                  borderColor: `${zone.color}20`,
                }}
              >
                <span className="absolute top-1 left-2 text-[8px] font-mono tracking-widest uppercase" style={{ color: `${zone.color}80` }}>
                  {zone.label}
                </span>
              </div>
            ))}

            {players.map(p => (
              <button
                key={p.userId}
                onClick={() => setSelectedPlayer(selectedPlayer?.userId === p.userId ? null : p)}
                className="absolute transition-all hover:scale-150 z-10 group"
                style={{
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  transform: 'translate(-50%, -50%)',
                }}
                title={p.firstName || 'Anonymous'}
              >
                <div className="relative">
                  {p.profileImageUrl ? (
                    <img src={p.profileImageUrl} alt="" className="w-5 h-5 rounded-full border border-emerald-500/50 object-cover" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-emerald-500/30 border border-emerald-500/50 flex items-center justify-center text-[8px] font-bold text-emerald-300">
                      {(p.firstName?.[0] || '?').toUpperCase()}
                    </div>
                  )}
                  <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border border-[#0c0c0f]" />
                </div>
                <div className="absolute left-1/2 -translate-x-1/2 -top-6 hidden group-hover:block">
                  <span className="px-2 py-0.5 rounded bg-black/80 border border-white/10 text-[9px] font-mono text-white whitespace-nowrap">
                    {p.firstName || 'Anonymous'}
                  </span>
                </div>
              </button>
            ))}

            {loading && players.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-zinc-600" />
              </div>
            )}
            {!loading && players.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <Users className="w-10 h-10 text-zinc-700" />
                <p className="text-sm text-zinc-600 font-mono">NO PLAYERS ONLINE</p>
                <p className="text-[10px] text-zinc-700">The world is empty right now</p>
              </div>
            )}
          </div>

          <div className="absolute bottom-3 left-3 flex items-center gap-3 px-3 py-1.5 rounded-lg bg-black/60 border border-white/10">
            <span className="text-[9px] font-mono text-zinc-500">ZOOM: {Math.round(zoom * 100)}%</span>
            <span className="text-zinc-700">|</span>
            <span className="text-[9px] font-mono text-emerald-400">{players.length} ACTIVE</span>
            <span className="text-zinc-700">|</span>
            <span className="text-[9px] font-mono text-zinc-500">MINX CITY</span>
          </div>
        </motion.div>

        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/10">
              <span className="text-[10px] font-mono text-zinc-400 tracking-widest uppercase">ZONE DENSITY</span>
            </div>
            <div className="p-3 space-y-2">
              {ZONES.map(zone => {
                const count = players.filter(p => p.zone === zone.label).length;
                const pct = players.length > 0 ? Math.round((count / players.length) * 100) : 0;
                return (
                  <div key={zone.id} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: zone.color }} />
                    <span className="text-[10px] font-mono text-zinc-400 flex-1 uppercase">{zone.label}</span>
                    <span className="text-[10px] font-mono text-foreground font-bold">{count}</span>
                    <div className="w-12 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: zone.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {selectedPlayer && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card border border-emerald-500/20 rounded-xl p-4"
            >
              <div className="flex items-center gap-3 mb-3">
                {selectedPlayer.profileImageUrl ? (
                  <img src={selectedPlayer.profileImageUrl} alt="" className="w-10 h-10 rounded-xl object-cover border border-border" />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-sm font-bold text-emerald-300">
                    {(selectedPlayer.firstName?.[0] || '?').toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{selectedPlayer.firstName || 'Anonymous'}</p>
                  <div className="flex items-center gap-1">
                    <MapPin className="w-2.5 h-2.5 text-zinc-500" />
                    <span className="text-[10px] text-zinc-400">{selectedPlayer.zone}</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-muted/20 rounded-lg px-3 py-2">
                  <p className="text-[9px] text-zinc-600 uppercase tracking-wider">STATUS</p>
                  <p className="text-xs font-bold text-emerald-400 uppercase">{selectedPlayer.status}</p>
                </div>
                <div className="bg-muted/20 rounded-lg px-3 py-2">
                  <p className="text-[9px] text-zinc-600 uppercase tracking-wider">COORDS</p>
                  <p className="text-xs font-bold text-foreground">{Math.round(selectedPlayer.x)}, {Math.round(selectedPlayer.y)}</p>
                </div>
              </div>
              {selectedPlayer.lastAction && (
                <div className="mt-2 bg-muted/10 rounded-lg px-3 py-2">
                  <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-0.5">LAST ACTION</p>
                  <p className="text-xs text-foreground">{selectedPlayer.lastAction}</p>
                </div>
              )}
            </motion.div>
          )}

          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-[10px] font-mono text-zinc-400 tracking-widest uppercase">LEGEND</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-400/30 border border-emerald-500/50" />
                <span className="text-[10px] text-zinc-400">Online Player</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-400/30 border border-amber-500/50" />
                <span className="text-[10px] text-zinc-400">Flagged Player</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-400/30 border border-red-500/50" />
                <span className="text-[10px] text-zinc-400">Banned Player</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
