import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Eye, Activity, Users, AlertTriangle, Shield,
  Clock, MapPin, MessageSquare, Gamepad2, TrendingUp,
  Loader2, Ban, FileText, Search,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { resolveAvatarUrl } from '@/lib/avatar';
import { useAuth } from '@/hooks/use-auth';
import { useBoomerMode } from '@/hooks/use-mobile';
import { useLocation } from 'wouter';

interface ActiveUser {
  userId: string;
  firstName: string | null;
  email: string | null;
  profileImageUrl: string | null;
  lastSeen: string;
  currentZone: string | null;
  status: string;
}

export default function ModeratorPanel() {
  const { isAuthenticated } = useAuth();
  const [boomerMode] = useBoomerMode();
  const [, navigate] = useLocation();

  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!isAuthenticated) return;
    setLoading(true);
    setAccessDenied(false);
    apiFetch('/api/world/online')
      .then(async r => {
        if (r.status === 403) { setAccessDenied(true); return null; }
        return r.json();
      })
      .then(d => {
        if (!d) return;
        const players = (d.players ?? []).map((p: any) => ({
          userId: p.userId ?? p.id,
          firstName: p.firstName ?? p.username ?? null,
          email: p.email ?? null,
          profileImageUrl: p.profileImageUrl ?? null,
          lastSeen: p.lastSeen ?? new Date().toISOString(),
          currentZone: p.zone ?? p.currentZone ?? 'Unknown',
          status: p.status ?? 'online',
        }));
        setActiveUsers(players);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    const interval = setInterval(() => {
      apiFetch('/api/world/online')
        .then(async r => {
          if (r.status === 403) { setAccessDenied(true); return null; }
          return r.json();
        })
        .then(d => {
          if (!d) return;
          const players = (d.players ?? []).map((p: any) => ({
            userId: p.userId ?? p.id,
            firstName: p.firstName ?? p.username ?? null,
            email: p.email ?? null,
            profileImageUrl: p.profileImageUrl ?? null,
            lastSeen: p.lastSeen ?? new Date().toISOString(),
            currentZone: p.zone ?? p.currentZone ?? 'Unknown',
            status: p.status ?? 'online',
          }));
          setActiveUsers(players);
        })
        .catch(() => {});
    }, 15000);

    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const filtered = activeUsers.filter(u => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (u.firstName?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.currentZone?.toLowerCase().includes(q));
  });

  return (
    <div className="p-6 max-w-5xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
          <Eye className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">{boomerMode ? 'MODERATOR WATCHTOWER' : 'WATCHTOWER'}</h2>
          <p className="text-sm text-muted-foreground">World-wide player oversight, separate from platform administration</p>
        </div>
      </div>

      {accessDenied && (
        <div className="mb-6 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-4">
          <p className="text-sm font-semibold text-amber-200">Moderator access required</p>
          <p className="mt-1 text-xs text-amber-100/70">This watchtower is for approved moderators, administrators, and organization executives viewing their own people.</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'ONLINE NOW', value: activeUsers.length, icon: Users, color: 'emerald' },
          { label: 'FLAGGED', value: 0, icon: AlertTriangle, color: 'amber' },
          { label: 'ACTIVE BANS', value: 0, icon: Ban, color: 'red' },
          { label: 'REPORTS', value: 0, icon: FileText, color: 'sky' },
        ].map(stat => (
          <div key={stat.label} className={`bg-${stat.color}-500/5 border border-${stat.color}-500/15 rounded-xl px-4 py-3`}>
            <div className="flex items-center gap-2 mb-1">
              <stat.icon className={`w-3.5 h-3.5 text-${stat.color}-400`} />
              <span className="text-[10px] font-mono text-zinc-500 tracking-widest uppercase">{stat.label}</span>
            </div>
            <p className={`text-xl font-bold text-${stat.color}-400`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/10">
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[10px] font-mono text-zinc-400 tracking-widest uppercase">LIVE ACTIVITY FEED</span>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>
          <div className="p-4 space-y-2 max-h-[300px] overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-zinc-600" />
              </div>
            ) : activeUsers.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                <p className="text-sm text-zinc-600">No users online</p>
              </div>
            ) : (
              activeUsers.map(u => (
                <div key={u.userId} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/10 hover:bg-muted/20 transition-colors">
                  <div className="relative">
                    {resolveAvatarUrl(u.profileImageUrl) ? (
                      <img src={resolveAvatarUrl(u.profileImageUrl)} alt="" className="w-7 h-7 rounded-md object-cover" />
                    ) : (
                      <div className="w-7 h-7 rounded-md bg-sky-500/10 flex items-center justify-center text-[10px] font-mono text-sky-300">
                        {(u.firstName?.[0] || '?').toUpperCase()}
                      </div>
                    )}
                    <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0a0a0b] ${
                      u.status === 'online' ? 'bg-emerald-400' : 'bg-zinc-600'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{u.firstName || 'Anonymous'}</p>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-2.5 h-2.5 text-zinc-600" />
                      <span className="text-[10px] text-zinc-500">{u.currentZone || 'Unknown Zone'}</span>
                    </div>
                  </div>
                  <span className="text-[9px] text-zinc-600 font-mono">
                    {new Date(u.lastSeen).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))
            )}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/10">
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] font-mono text-zinc-400 tracking-widest uppercase">MODERATION ACTIONS</span>
            </div>
          </div>
          <div className="p-4 space-y-3">
            {[
              { label: 'MANAGE BANS', desc: 'Issue warnings, temporary bans, and permanent bans', icon: Ban, path: '/profile/admin?tab=bans', color: 'red' },
              { label: 'CHAT MONITOR', desc: 'Review public and private chat messages for violations', icon: MessageSquare, path: '#', color: 'sky' },
              { label: 'FLAGGED CONTENT', desc: 'User-reported content awaiting moderator review', icon: AlertTriangle, path: '#', color: 'amber' },
            ].map(item => (
              <button
                key={item.label}
                onClick={() => item.path !== '#' && navigate(item.path)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-${item.color}-500/5 border border-${item.color}-500/10 hover:border-${item.color}-500/25 transition-colors text-left`}
              >
                <div className={`w-8 h-8 rounded-lg bg-${item.color}-500/15 flex items-center justify-center`}>
                  <item.icon className={`w-4 h-4 text-${item.color}-400`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-foreground">{item.label}</p>
                  <p className="text-[10px] text-zinc-500">{item.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="mt-6 bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/10">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-[10px] font-mono text-zinc-400 tracking-widest uppercase">MODERATION LOG</span>
          </div>
          <span className="text-[10px] text-zinc-600 font-mono">Auto-refreshes every 15s</span>
        </div>
        <div className="px-4 py-12 text-center">
          <Clock className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
          <p className="text-sm text-zinc-600">No moderation actions recorded</p>
          <p className="text-[10px] text-zinc-700 mt-1">Actions taken by moderators will appear here with full audit trail</p>
        </div>
      </motion.div>
    </div>
  );
}
