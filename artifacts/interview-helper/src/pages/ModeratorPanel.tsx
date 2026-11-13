import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Eye, Activity, Users, AlertTriangle, Shield,
  MapPin, Loader2, FileText,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { resolveAvatarUrl } from '@/lib/avatar';
import { useAuth } from '@/hooks/use-auth';
import { useBoomerMode } from '@/hooks/use-mobile';
import { useLocation } from 'wouter';

interface ActiveUser {
  userId: string;
  firstName: string | null;
  profileImageUrl: string | null;
  status: string;
}

interface SecuritySummary {
  activeFlags: number;
  activeBans: number;
  openReports: number;
  loginAttempts24h: number;
  blockedLogins24h: number;
}

export default function ModeratorPanel() {
  const { isAuthenticated } = useAuth();
  const [boomerMode] = useBoomerMode();
  const [, navigate] = useLocation();

  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [security, setSecurity] = useState<SecuritySummary | null>(null);
  const [scope, setScope] = useState<'platform' | 'moderator' | 'organization' | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setActiveUsers([]);
      setSecurity(null);
      setScope(null);
      setAccessDenied(false);
      setLoading(false);
      return;
    }
    let mounted = true;
    const loadMonitor = async () => {
      try {
        const [presenceResponse, securityResponse] = await Promise.all([
          apiFetch('/api/world/online'),
          apiFetch('/api/world/monitoring-security'),
        ]);
        if (!mounted) return;
        if ([401, 403].includes(presenceResponse.status) || [401, 403].includes(securityResponse.status)) {
          setAccessDenied(true);
          setActiveUsers([]);
          setSecurity(null);
          setScope(null);
          return;
        }
        if (!presenceResponse.ok || !securityResponse.ok) throw new Error('Could not load monitoring data');
        const [presenceData, securityData] = await Promise.all([
          presenceResponse.json(),
          securityResponse.json(),
        ]);
        if (!mounted) return;
        setScope(presenceData.scope);
        setActiveUsers(Array.isArray(presenceData.players) ? presenceData.players.map((player: ActiveUser) => ({
          userId: player.userId,
          firstName: player.firstName,
          profileImageUrl: player.profileImageUrl,
          status: player.status,
        })) : []);
        setSecurity(securityData.security ?? null);
        setAccessDenied(false);
      } catch {
        if (mounted) setSecurity(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    setLoading(true);
    void loadMonitor();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void loadMonitor();
    }, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [isAuthenticated]);

  const scopeTitle = scope === 'platform'
    ? 'ADMIN MONITOR'
    : scope === 'organization'
      ? 'ORGANIZATION MONITOR'
      : scope === 'moderator'
        ? 'MODERATOR WATCHTOWER'
        : 'LIVE MONITOR';

  return (
    <div className="p-6 max-w-5xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
          <Eye className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">{boomerMode ? scopeTitle : 'WATCHTOWER'}</h2>
          <p className="text-sm text-muted-foreground">
            {scope === 'organization'
              ? 'Your organization’s active people only · security metadata and avatar presence'
              : scope === 'platform'
                ? 'Platform-wide user presence and security monitoring'
                : 'Global security metadata and avatar presence · no private conversation content'}
          </p>
        </div>
      </div>

      {accessDenied && (
        <div className="mb-6 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-4">
          <p className="text-sm font-semibold text-amber-200">Monitoring access unavailable</p>
          <p className="mt-1 text-xs text-amber-100/70">Access is limited to approved platform staff or organization owners viewing their own people.</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'ONLINE NOW', value: activeUsers.length, icon: Users, color: 'emerald' },
          { label: 'OPEN FLAGS', value: security?.activeFlags ?? '—', icon: AlertTriangle, color: 'amber' },
          { label: 'BLOCKED LOGINS · 24H', value: security?.blockedLogins24h ?? '—', icon: Shield, color: 'red' },
          { label: 'OPEN REPORTS', value: security?.openReports ?? '—', icon: FileText, color: 'sky' },
        ].map(stat => (
          <div key={stat.label} className={`bg-${stat.color}-500/5 border border-${stat.color}-500/15 rounded-xl px-4 py-3`}>
            <div className="flex items-center gap-2 mb-1">
              <stat.icon className={`w-3.5 h-3.5 text-${stat.color}-400`} />
              <span className="text-[10px] font-mono text-zinc-500 tracking-widest uppercase">{stat.label}</span>
            </div>
              <p data-testid={`monitor-stat-${stat.label.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`} className={`text-xl font-bold text-${stat.color}-400`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/10">
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[10px] font-mono text-zinc-400 tracking-widest uppercase">LIVE USER PRESENCE</span>
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
                <div data-testid={`monitor-user-${u.userId}`} key={u.userId} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/10 hover:bg-muted/20 transition-colors">
                  <div className="relative">
                    {resolveAvatarUrl(u.profileImageUrl) ? (
                      <img src={resolveAvatarUrl(u.profileImageUrl)} alt="" className="w-7 h-7 rounded-md object-cover" />
                    ) : (
                      <div className="w-7 h-7 rounded-md bg-sky-500/10 flex items-center justify-center text-[10px] font-mono text-sky-300">
                        {(u.firstName?.[0] || '?').toUpperCase()}
                      </div>
                    )}
                    <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0a0a0b] ${
                      u.status === 'online' || u.status === 'active' ? 'bg-emerald-400' : 'bg-zinc-600'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{u.firstName || 'Anonymous'}</p>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-2.5 h-2.5 text-zinc-600" />
                      <span className="text-[10px] text-zinc-500">Live world presence</span>
                    </div>
                  </div>
                  <span className="text-[9px] text-zinc-600 font-mono">{u.status.toUpperCase()}</span>
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
              <span className="text-[10px] font-mono text-zinc-400 tracking-widest uppercase">SECURITY SCOPE</span>
            </div>
          </div>
          <div className="p-4 space-y-3">
            <div data-testid="text-monitoring-privacy" className="border border-border bg-muted/10 p-3">
              <p className="text-xs font-bold text-foreground">Metadata only</p>
              <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
                This view shows account security counts and avatar presence. It does not expose private chats, call content, login IP addresses, or report text.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="border border-border bg-muted/10 p-3">
                <p className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">Active bans</p>
                <p data-testid="monitor-stat-active-bans" className="mt-1 text-lg font-bold text-foreground">{security?.activeBans ?? '—'}</p>
              </div>
              <div className="border border-border bg-muted/10 p-3">
                <p className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">Login attempts · 24h</p>
                <p data-testid="monitor-stat-login-attempts" className="mt-1 text-lg font-bold text-foreground">{security?.loginAttempts24h ?? '—'}</p>
              </div>
            </div>
            {scope === 'platform' && (
              <button
                data-testid="button-open-admin-security"
                type="button"
                onClick={() => navigate('/profile/admin?tab=security')}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-red-500/5 border border-red-500/10 hover:border-red-500/25 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-foreground">OPEN ADMIN SECURITY</p>
                  <p className="text-[10px] text-zinc-500">Review detailed security records and take administrative action.</p>
                </div>
              </button>
            )}
          </div>
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="mt-6 bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/10">
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-[10px] font-mono text-zinc-400 tracking-widest uppercase">LIVE MONITORING</span>
          </div>
          <span className="text-[10px] text-zinc-600 font-mono">Auto-refreshes every 15s</span>
        </div>
        <div className="px-4 py-4 text-[10px] leading-relaxed text-zinc-500">
          Security totals cover the last 24 hours where noted. Counts refresh from the server; account-level actions and private report details remain in the platform admin console.
        </div>
      </motion.div>
    </div>
  );
}
