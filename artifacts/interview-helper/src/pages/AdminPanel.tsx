import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Users, Building2, UserCog, Eye, AlertTriangle,
  ShieldCheck, Loader2, Ban, Search, ChevronRight,
  BarChart3, ToggleLeft, Settings, Megaphone, MessageSquareWarning,
  ScrollText, Wallet, RotateCcw, Plus, X, Trash2, Check,
  TrendingUp, UserPlus, Gamepad2, Send, FileText, ShieldAlert,
  Globe, Flag, Lock, Unlock, RefreshCw,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@workspace/replit-auth-web';
import { usePlan } from '@/hooks/use-plan';
import { useBoomerMode } from '@/hooks/use-mobile';
import { useLocation } from 'wouter';

interface UserRecord {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  createdAt: string;
}

interface OrgRecord {
  id: number;
  name: string;
  industry: string | null;
  size: string | null;
  memberCount: number;
}

interface BanRecord {
  id: number;
  userId: string;
  reason: string;
  bannedBy: string;
  type: string;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
  userEmail: string | null;
  userFirstName: string | null;
  userLastName: string | null;
}

interface AdminStats {
  totalUsers: number;
  totalOrgs: number;
  activeBans: number;
}

interface Analytics {
  totalUsers: number;
  totalOrgs: number;
  activeBans: number;
  totalSaves: number;
  totalReports: number;
  openReports: number;
  totalBroadcasts: number;
  usersToday: number;
  usersWeek: number;
  usersMonth: number;
  orgsWeek: number;
  featureCounts: { key: string; count: number }[];
  topPlayers: { charName: string; level: number; salary: number; userId: string }[];
}

interface ConfigRow {
  id: number;
  key: string;
  value: string;
  category: string;
  description: string;
  updatedBy: string | null;
  updatedAt: string;
}

interface BroadcastRow {
  id: number;
  title: string;
  message: string;
  type: string;
  active: boolean;
  targetAudience: string;
  createdBy: string | null;
  createdAt: string;
  expiresAt: string | null;
}

interface ReportRow {
  id: number;
  userId: string | null;
  title: string;
  description: string;
  category: string;
  status: string;
  createdAt: string;
}

interface AuditRow {
  id: number;
  adminId: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: string | null;
  createdAt: string;
}

interface UserDetail {
  user: UserRecord;
  memberships: { orgId: number; role: string; status: string; orgName: string | null }[];
  bans: BanRecord[];
  features: { featureKey: string; grantedBy: string }[];
  saves: { id: number; charName: string; charClass: string; level: number; salary: number; lastZone: string | null; playtime: number }[];
}

type AdminTab = 'analytics' | 'users' | 'orgs' | 'config' | 'toggles' | 'broadcast' | 'reports' | 'bans' | 'audit' | 'security';

const FEATURE_LABELS: Record<string, string> = {
  live_listen: 'LIVE LISTEN',
  screen_scan: 'SCREEN SCAN',
  say_this: 'SAY THIS',
  phone_system: 'PHONE SYSTEM',
  claw_bot: 'CLAW BOT',
};

const ALL_FEATURES = ['live_listen', 'screen_scan', 'say_this', 'phone_system', 'claw_bot'];

const DEFAULT_TOGGLES: { key: string; label: string; desc: string; category: string }[] = [
  { key: 'maintenance_mode', label: 'MAINTENANCE MODE', desc: 'Disables all user access except Picasso admins', category: 'system' },
  { key: 'registration_open', label: 'REGISTRATION OPEN', desc: 'Allow new user registration', category: 'system' },
  { key: 'world_enabled', label: 'SALARYMAN WORLD', desc: 'Enable or disable the Salaryman MMO world', category: 'features' },
  { key: 'marketplace_enabled', label: 'BOT MARKETPLACE', desc: 'Enable or disable the Bot Factory marketplace', category: 'features' },
  { key: 'phone_system_enabled', label: 'PHONE SYSTEM', desc: 'Enable or disable the Twilio phone integration', category: 'features' },
  { key: 'chat_enabled', label: 'CHAT SYSTEM', desc: 'Enable or disable in-app messaging', category: 'features' },
  { key: 'hiring_enabled', label: 'HIRING BOARD', desc: 'Enable or disable the job board', category: 'features' },
  { key: 'crm_enabled', label: 'CRM TOOLS', desc: 'Enable or disable CRM / contacts / deals', category: 'features' },
  { key: 'creative_studio_enabled', label: 'CREATIVE STUDIO', desc: 'Enable or disable AI creative tools', category: 'features' },
  { key: 'wasteland_enabled', label: 'WASTELAND ACCESS', desc: 'Allow players to enter the wasteland zone', category: 'world' },
  { key: 'pvp_enabled', label: 'PVP COMBAT', desc: 'Enable or disable player vs player combat', category: 'world' },
  { key: 'tax_system_enabled', label: 'TAX SYSTEM', desc: 'Enable or disable the in-game tax system', category: 'economy' },
  { key: 'passive_income_enabled', label: 'PASSIVE INCOME', desc: 'Enable or disable business passive income', category: 'economy' },
];

type EmailGrant = { id: number; email: string; featureKey: string; source: string; expiresAt: string; createdAt: string };
type EmailGrantGroup = { email: string; grants: EmailGrant[] };

function EmailGrantsCard() {
  const [groups, setGroups] = React.useState<EmailGrantGroup[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [newEmail, setNewEmail] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch('/api/admin/email-grants');
      if (r.ok) {
        const data = await r.json();
        setGroups(data.grants ?? []);
      }
    } finally { setLoading(false); }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const toggle = async (email: string, featureKey: string, currentId: number | null) => {
    const busyKey = `${email}:${featureKey}`;
    setBusy(busyKey);
    try {
      if (currentId !== null) {
        await apiFetch(`/api/admin/email-grants/${currentId}`, { method: 'DELETE' });
      } else {
        await apiFetch('/api/admin/email-grants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, featureKey }),
        });
      }
      await load();
    } finally { setBusy(null); }
  };

  const addEmail = async () => {
    const e = newEmail.trim().toLowerCase();
    if (!e || !e.includes('@')) return;
    setBusy('__add');
    try {
      // Grant all features by default
      await Promise.all(ALL_FEATURES.map(f =>
        apiFetch('/api/admin/email-grants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: e, featureKey: f }),
        })
      ));
      setNewEmail('');
      await load();
    } finally { setBusy(null); }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[10px] font-mono tracking-widest uppercase text-zinc-400">EMAIL PRE-GRANTS</h3>
        <span className="text-[10px] text-zinc-500">{groups.length} email{groups.length === 1 ? '' : 's'}</span>
      </div>
      <p className="text-[11px] text-zinc-500 mb-4">
        Pre-grant paid features by email. Activates the moment the user signs up &amp; logs in. Toggle individual features off any time.
      </p>

      <div className="flex gap-2 mb-4">
        <input
          value={newEmail}
          onChange={e => setNewEmail(e.target.value)}
          placeholder="user@example.com"
          className="flex-1 px-3 py-2 bg-muted/20 border border-border rounded-lg text-sm text-foreground outline-none"
        />
        <button
          onClick={addEmail}
          disabled={busy === '__add' || !newEmail.includes('@')}
          className="px-4 py-2 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 rounded-lg text-xs font-bold text-emerald-300 disabled:opacity-40"
        >
          {busy === '__add' ? 'GRANTING...' : 'GRANT ALL FEATURES'}
        </button>
      </div>

      {loading && <p className="text-xs text-zinc-500">Loading grants...</p>}
      {!loading && groups.length === 0 && (
        <p className="text-xs text-zinc-500 italic">No email pre-grants. Add one above.</p>
      )}

      <div className="space-y-3">
        {groups.map(g => (
          <div key={g.email} className="bg-muted/10 border border-border/50 rounded-lg p-3">
            <p className="text-sm font-mono text-foreground mb-3 break-all">{g.email}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ALL_FEATURES.map(fk => {
                const grant = g.grants.find(x => x.featureKey === fk);
                const isOn = !!grant;
                const busyKey = `${g.email}:${fk}`;
                return (
                  <div key={fk} className="flex items-center justify-between py-1.5 px-2.5 rounded bg-background/30">
                    <span className="text-[11px] font-mono text-zinc-300">{FEATURE_LABELS[fk] ?? fk}</span>
                    <button
                      onClick={() => toggle(g.email, fk, grant?.id ?? null)}
                      disabled={busy === busyKey}
                      className={`w-10 h-5 rounded-full relative transition-colors ${isOn ? 'bg-emerald-500/30' : 'bg-zinc-700/30'} disabled:opacity-50`}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
                        isOn ? 'left-[22px] bg-emerald-400' : 'left-0.5 bg-zinc-500'
                      }`} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, color = 'sky', icon: Icon }: { label: string; value: number | string; color?: string; icon?: React.ComponentType<{ className?: string }> }) {
  const colorMap: Record<string, string> = {
    sky: 'bg-sky-500/5 border-sky-500/15 text-sky-400',
    violet: 'bg-violet-500/5 border-violet-500/15 text-violet-400',
    amber: 'bg-amber-500/5 border-amber-500/15 text-amber-400',
    emerald: 'bg-emerald-500/5 border-emerald-500/15 text-emerald-400',
    red: 'bg-red-500/5 border-red-500/15 text-red-400',
    pink: 'bg-pink-500/5 border-pink-500/15 text-pink-400',
    cyan: 'bg-cyan-500/5 border-cyan-500/15 text-cyan-400',
  };
  const c = colorMap[color] || colorMap.sky;
  return (
    <div className={`${c.split(' ').slice(0, 2).join(' ')} border rounded-xl p-4`}>
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className={`w-3.5 h-3.5 ${c.split(' ')[2]}`} />}
        <p className="text-[10px] text-zinc-500 font-mono tracking-widest uppercase">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${c.split(' ')[2]}`}>{value}</p>
    </div>
  );
}

export default function AdminPanel() {
  const { isAuthenticated } = useAuth();
  const { isOwner } = usePlan();
  const [boomerMode] = useBoomerMode();
  const [location, navigate] = useLocation();

  const searchParams = new URLSearchParams(location.split('?')[1] || '');
  const tabParam = searchParams.get('tab') as AdminTab | null;
  const activeTab: AdminTab = tabParam ?? 'analytics';

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [orgs, setOrgs] = useState<OrgRecord[]>([]);
  const [bans, setBans] = useState<BanRecord[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [configs, setConfigs] = useState<ConfigRow[]>([]);
  const [broadcasts, setBroadcasts] = useState<BroadcastRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [auditLog, setAuditLog] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [userDetailLoading, setUserDetailLoading] = useState(false);

  const [banUserId, setBanUserId] = useState('');
  const [banReason, setBanReason] = useState('');
  const [banType, setBanType] = useState<'temporary' | 'permanent'>('temporary');
  const [banSubmitting, setBanSubmitting] = useState(false);

  const [bcTitle, setBcTitle] = useState('');
  const [bcMessage, setBcMessage] = useState('');
  const [bcType, setBcType] = useState('info');
  const [bcTarget, setBcTarget] = useState('all');
  const [bcSubmitting, setBcSubmitting] = useState(false);

  const [cfgKey, setCfgKey] = useState('');
  const [cfgValue, setCfgValue] = useState('');
  const [cfgCategory, setCfgCategory] = useState('general');
  const [cfgDesc, setCfgDesc] = useState('');

  const [balanceAmount, setBalanceAmount] = useState('');
  const [balanceReason, setBalanceReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const [reportFilter, setReportFilter] = useState('open');

  const [secStats, setSecStats] = useState<{ builtinDomains: number; customBlockedDomains: number; flaggedUsers: number; blockedLoginsToday: number; totalLoginsToday: number } | null>(null);
  const [blockedDomains, setBlockedDomains] = useState<{ id: number; domain: string; reason: string; active: boolean; createdAt: string }[]>([]);
  const [flaggedUsers, setFlaggedUsers] = useState<{ flag: any; user: any }[]>([]);
  const [loginAttempts, setLoginAttempts] = useState<{ id: number; email: string | null; ipAddress: string | null; blocked: boolean; blockReason: string | null; createdAt: string }[]>([]);
  const [secView, setSecView] = useState<'overview' | 'domains' | 'flagged' | 'attempts'>('overview');
  const [newDomain, setNewDomain] = useState('');
  const [newDomainReason, setNewDomainReason] = useState('');
  const [secLoading, setSecLoading] = useState(false);
  const [screenTestEmail, setScreenTestEmail] = useState('');
  const [screenTestResult, setScreenTestResult] = useState<any>(null);

  const loadSecurityData = useCallback(async () => {
    setSecLoading(true);
    try {
      const [stats, domains, flagged, attempts] = await Promise.all([
        apiFetch('/api/admin/email-security/stats').then(r => r.json()).catch(() => null),
        apiFetch('/api/admin/email-security/blocked-domains').then(r => r.json()).catch(() => ({ domains: [] })),
        apiFetch('/api/admin/email-security/flagged-users').then(r => r.json()).catch(() => ({ flaggedUsers: [] })),
        apiFetch('/api/admin/email-security/login-attempts?blocked=true').then(r => r.json()).catch(() => ({ attempts: [] })),
      ]);
      setSecStats(stats);
      setBlockedDomains(domains.domains ?? []);
      setFlaggedUsers(flagged.flaggedUsers ?? []);
      setLoginAttempts(attempts.attempts ?? []);
    } finally { setSecLoading(false); }
  }, []);

  const handleAddDomain = async () => {
    if (!newDomain) return;
    setSecLoading(true);
    try {
      const resp = await apiFetch('/api/admin/email-security/blocked-domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: newDomain, reason: newDomainReason || 'manual' }),
      });
      if (resp.ok) { setNewDomain(''); setNewDomainReason(''); loadSecurityData(); }
    } finally { setSecLoading(false); }
  };

  const handleRemoveDomain = async (id: number) => {
    try {
      await apiFetch(`/api/admin/email-security/blocked-domains/${id}`, { method: 'DELETE' });
      loadSecurityData();
    } catch {}
  };

  const handleResolveFlag = async (id: number, resolved: boolean) => {
    try {
      await apiFetch(`/api/admin/email-security/flagged-users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved }),
      });
      loadSecurityData();
    } catch {}
  };

  const handleScreenTest = async () => {
    if (!screenTestEmail) return;
    const resp = await apiFetch('/api/admin/email-security/screen-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: screenTestEmail }),
    });
    if (resp.ok) setScreenTestResult(await resp.json());
  };

  const setTab = useCallback((tab: AdminTab) => {
    navigate(tab === 'analytics' ? '/profile/admin' : `/profile/admin?tab=${tab}`);
  }, [navigate]);

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch('/api/admin/stats').then(r => r.json()).catch(() => null),
      apiFetch('/api/admin/users').then(r => r.json()).catch(() => ({ users: [] })),
      apiFetch('/api/admin/orgs').then(r => r.json()).catch(() => ({ orgs: [] })),
      apiFetch('/api/admin/bans?active=false').then(r => r.json()).catch(() => ({ bans: [] })),
      apiFetch('/api/admin/analytics').then(r => r.json()).catch(() => null),
      apiFetch('/api/admin/system-config').then(r => r.json()).catch(() => ({ config: [] })),
      apiFetch('/api/admin/broadcasts').then(r => r.json()).catch(() => ({ broadcasts: [] })),
      apiFetch('/api/admin/reports?status=open').then(r => r.json()).catch(() => ({ reports: [] })),
      apiFetch('/api/admin/audit-log').then(r => r.json()).catch(() => ({ logs: [] })),
    ]).then(([s, u, o, b, a, c, bc, rp, al]) => {
      setStats(s);
      setUsers(u.users ?? []);
      setOrgs(o.orgs ?? []);
      setBans(b.bans ?? []);
      setAnalytics(a);
      setConfigs(c.config ?? []);
      setBroadcasts(bc.broadcasts ?? []);
      setReports(rp.reports ?? []);
      setAuditLog(al.logs ?? []);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadData();
  }, [isAuthenticated, loadData]);

  useEffect(() => {
    if (activeTab === 'security' && isAuthenticated) loadSecurityData();
  }, [activeTab, isAuthenticated, loadSecurityData]);

  const loadUserDetail = async (userId: string) => {
    setUserDetailLoading(true);
    try {
      const resp = await apiFetch(`/api/admin/users/${userId}`);
      if (resp.ok) {
        const data = await resp.json();
        setSelectedUser(data);
      }
    } catch {} finally {
      setUserDetailLoading(false);
    }
  };

  const handleIssueBan = async () => {
    if (!banUserId || !banReason) return;
    setBanSubmitting(true);
    try {
      const resp = await apiFetch('/api/admin/bans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: banUserId, reason: banReason, type: banType }),
      });
      if (resp.ok) { setBanUserId(''); setBanReason(''); loadData(); }
    } catch {} finally { setBanSubmitting(false); }
  };

  const handleToggleBan = async (banId: number, active: boolean) => {
    try {
      await apiFetch(`/api/admin/bans/${banId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      loadData();
    } catch {}
  };

  const handleToggleConfig = async (key: string, currentValue: string) => {
    const newValue = currentValue === 'true' ? 'false' : 'true';
    const toggle = DEFAULT_TOGGLES.find(t => t.key === key);
    try {
      await apiFetch('/api/admin/system-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: newValue, category: toggle?.category || 'toggles', description: toggle?.desc || '' }),
      });
      loadData();
    } catch {}
  };

  const handleSaveConfig = async () => {
    if (!cfgKey) return;
    try {
      await apiFetch('/api/admin/system-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: cfgKey, value: cfgValue, category: cfgCategory, description: cfgDesc }),
      });
      setCfgKey(''); setCfgValue(''); setCfgDesc('');
      loadData();
    } catch {}
  };

  const handleDeleteConfig = async (key: string) => {
    try {
      await apiFetch(`/api/admin/system-config/${key}`, { method: 'DELETE' });
      loadData();
    } catch {}
  };

  const handleSendBroadcast = async () => {
    if (!bcTitle || !bcMessage) return;
    setBcSubmitting(true);
    try {
      await apiFetch('/api/admin/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: bcTitle, message: bcMessage, type: bcType, targetAudience: bcTarget }),
      });
      setBcTitle(''); setBcMessage('');
      loadData();
    } catch {} finally { setBcSubmitting(false); }
  };

  const handleToggleBroadcast = async (id: number, active: boolean) => {
    try {
      await apiFetch(`/api/admin/broadcasts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      loadData();
    } catch {}
  };

  const handleUpdateReport = async (id: number, status: string) => {
    try {
      await apiFetch(`/api/admin/reports/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      loadData();
    } catch {}
  };

  const handleAdjustBalance = async (userId: string) => {
    if (!balanceAmount) return;
    setActionLoading(true);
    try {
      await apiFetch(`/api/admin/users/${userId}/adjust-balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parseInt(balanceAmount), reason: balanceReason }),
      });
      setBalanceAmount(''); setBalanceReason('');
      loadUserDetail(userId);
      loadData();
    } catch {} finally { setActionLoading(false); }
  };

  const handleGrantFeature = async (userId: string, featureKey: string) => {
    try {
      await apiFetch(`/api/admin/users/${userId}/grant-feature`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureKey }),
      });
      loadUserDetail(userId);
    } catch {}
  };

  const handleRevokeFeature = async (userId: string, featureKey: string) => {
    try {
      await apiFetch(`/api/admin/users/${userId}/revoke-feature`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureKey }),
      });
      loadUserDetail(userId);
    } catch {}
  };

  // One-tap "free access" — grants every paid feature to a user. Used to
  // comp specific people (e.g. PAMW@innerlighthealth) without making them
  // an OWNER_EMAILS-level admin.
  const handleGrantAllFeatures = async (userId: string) => {
    setActionLoading(true);
    try {
      await apiFetch(`/api/admin/users/${userId}/grant-all-features`, { method: 'POST' });
      loadUserDetail(userId);
    } catch {} finally { setActionLoading(false); }
  };
  const handleRevokeAllFeatures = async (userId: string) => {
    if (!confirm("Revoke ALL features for this user?")) return;
    setActionLoading(true);
    try {
      await apiFetch(`/api/admin/users/${userId}/revoke-all-features`, { method: 'POST' });
      loadUserDetail(userId);
    } catch {} finally { setActionLoading(false); }
  };
  // Bulk-grant FREE ACCESS to every active member of an org. Used to comp
  // entire businesses (e.g. the Medicare Club) from the BUSINESSES tab.
  const handleGrantOrgFreeAccess = async (orgId: string | number, orgName: string) => {
    if (!confirm(`Grant FREE ACCESS (all features) to every active member of "${orgName}"?`)) return;
    setActionLoading(true);
    try {
      const r = await apiFetch(`/api/admin/orgs/${orgId}/grant-all-features`, { method: 'POST' });
      const j = await r.json().catch(() => null);
      alert(j ? `Comped ${j.members ?? 0} members · ${j.granted ?? 0} new grants` : "Done");
      loadData();
    } catch {} finally { setActionLoading(false); }
  };

  const handleResetUser = async (userId: string, resetType: string) => {
    if (!confirm(`Are you sure you want to reset ${resetType} for this user? This cannot be undone.`)) return;
    setActionLoading(true);
    try {
      await apiFetch(`/api/admin/users/${userId}/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetType }),
      });
      loadUserDetail(userId);
      loadData();
    } catch {} finally { setActionLoading(false); }
  };

  const handleBulkReset = async (target: 'saves' | 'features' | 'all') => {
    const labelMap: Record<string, string> = {
      saves: "DELETE EVERY PLAYER'S GAME PROGRESS (Picasso admins preserved)",
      features: "REVOKE EVERY USER'S FEATURE GRANTS (Picasso admins preserved)",
      all: "DELETE EVERY SAVE AND REVOKE EVERY FEATURE (Picasso admins preserved)",
    };
    if (!confirm(`${labelMap[target]}\n\nType OK in the next prompt to confirm.`)) return;
    const typed = prompt('Type OK to confirm this destructive bulk action:');
    if (typed !== 'OK') return;
    setActionLoading(true);
    try {
      const resp = await apiFetch(`/api/admin/bulk-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      });
      if (resp.ok) {
        const data = await resp.json();
        alert(`Done. Saves deleted: ${data.savesDeleted}. Features revoked: ${data.featuresRevoked}. Owners preserved: ${data.ownersPreserved}.`);
        loadData();
      } else {
        alert('Bulk reset failed.');
      }
    } catch { alert('Bulk reset failed.'); }
    finally { setActionLoading(false); }
  };

  const loadReportsByStatus = async (status: string) => {
    setReportFilter(status);
    try {
      const resp = await apiFetch(`/api/admin/reports?status=${status}`);
      if (resp.ok) {
        const data = await resp.json();
        setReports(data.reports ?? []);
      }
    } catch {}
  };

  if (!isOwner) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <ShieldCheck className="w-12 h-12 text-zinc-600" />
        <p className="text-sm text-zinc-500 font-mono tracking-widest uppercase">PICASSO ACCESS ONLY</p>
        <p className="text-xs text-zinc-600">This panel is restricted to Picasso.ai internal staff.</p>
      </div>
    );
  }

  const filteredUsers = users.filter(u => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (u.email?.toLowerCase().includes(q) || u.firstName?.toLowerCase().includes(q) || u.lastName?.toLowerCase().includes(q));
  });

  const configMap = new Map<string, string>(configs.map(c => [c.key, c.value]));

  const tabs: { key: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 'analytics', label: 'ANALYTICS', icon: BarChart3 },
    { key: 'users', label: 'USERS', icon: Users },
    { key: 'orgs', label: 'BUSINESSES', icon: Building2 },
    { key: 'toggles', label: 'FEATURE TOGGLES', icon: ToggleLeft },
    { key: 'config', label: 'SYSTEM CONFIG', icon: Settings },
    { key: 'broadcast', label: 'BROADCAST', icon: Megaphone },
    { key: 'reports', label: 'REPORTS', icon: MessageSquareWarning },
    { key: 'bans', label: 'BANS', icon: AlertTriangle },
    { key: 'audit', label: 'AUDIT LOG', icon: ScrollText },
    { key: 'security', label: 'EMAIL SECURITY', icon: ShieldAlert },
  ];

  return (
    <div className="p-3 sm:p-6 max-w-6xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-4 sm:mb-6">
        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
          <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-bold text-foreground truncate">{boomerMode ? 'ADMIN PANEL' : 'PICASSO COMMAND CENTER'}</h2>
          <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Internal platform management for Picasso.ai staff</p>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4 sm:mb-6">
          <StatCard label="TOTAL USERS" value={stats.totalUsers} color="sky" icon={Users} />
          <StatCard label="ORGANIZATIONS" value={stats.totalOrgs} color="violet" icon={Building2} />
          <StatCard label="ACTIVE BANS" value={stats.activeBans} color={stats.activeBans > 0 ? 'red' : 'emerald'} icon={Ban} />
        </div>
      )}

      {/* Mobile (<sm): single-row dropdown — 10 tabs in a horizontal strip
          overflow even on landscape phones. Desktop (sm+): full tab strip. */}
      <div className="sm:hidden mb-4 sticky top-0 z-30 bg-background/95 backdrop-blur-sm pt-2 pb-2 -mx-3 px-3 border-b border-white/[0.06]">
        <label className="block text-[10px] font-mono tracking-widest text-zinc-500 mb-1">SECTION</label>
        <select
          value={activeTab}
          onChange={(e) => setTab(e.target.value as AdminTab)}
          className="w-full px-3 py-2.5 bg-amber-500/10 border border-amber-500/25 rounded-md text-[12px] font-mono tracking-widest uppercase text-amber-200 outline-none focus:border-amber-400/50"
          data-testid="admin-tab-select"
        >
          {tabs.map(tab => (
            <option key={tab.key} value={tab.key} className="bg-zinc-900 text-amber-100">
              {tab.label}
            </option>
          ))}
        </select>
      </div>
      <div className="hidden sm:flex gap-1.5 mb-6 overflow-x-auto scrollbar-hide border-b border-white/[0.06] pb-2 -mx-2 px-2 sticky top-[52px] z-30 bg-background/95 backdrop-blur-sm pt-2">
        {tabs.map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-2.5 min-h-[40px] rounded-md text-[11px] font-mono tracking-widest uppercase transition-colors shrink-0 cursor-pointer select-none touch-manipulation ${
              activeTab === tab.key
                ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent active:bg-white/[0.08]'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" />
        </div>
      ) : (
        <>
          {activeTab === 'analytics' && analytics && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              {/* TESTING CONTROLS — bulk reset for fresh-test campaigns */}
              <div className="bg-card border border-red-900/40 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <h3 className="text-xs font-mono tracking-widest uppercase text-red-300">TESTING CONTROLS — DESTRUCTIVE</h3>
                </div>
                <p className="text-[11px] text-zinc-500 mb-4">
                  Wipe game state across the whole player base so testers start from the intro. Picasso admin accounts (OWNER_EMAILS) are always preserved.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleBulkReset('saves')}
                    disabled={actionLoading}
                    className="px-3 py-2 text-[10px] font-mono tracking-widest uppercase rounded-md bg-red-950/40 hover:bg-red-900/50 border border-red-800/50 text-red-200 disabled:opacity-40"
                  >
                    RESET ALL GAME SAVES
                  </button>
                  <button
                    onClick={() => handleBulkReset('features')}
                    disabled={actionLoading}
                    className="px-3 py-2 text-[10px] font-mono tracking-widest uppercase rounded-md bg-amber-950/40 hover:bg-amber-900/50 border border-amber-800/50 text-amber-200 disabled:opacity-40"
                  >
                    REVOKE ALL FEATURE GRANTS
                  </button>
                  <button
                    onClick={() => handleBulkReset('all')}
                    disabled={actionLoading}
                    className="px-3 py-2 text-[10px] font-mono tracking-widest uppercase rounded-md bg-red-950/60 hover:bg-red-900/70 border border-red-700/60 text-red-100 disabled:opacity-40"
                  >
                    NUCLEAR — RESET BOTH
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="USERS TODAY" value={analytics.usersToday} color="emerald" icon={UserPlus} />
                <StatCard label="USERS THIS WEEK" value={analytics.usersWeek} color="sky" icon={TrendingUp} />
                <StatCard label="USERS THIS MONTH" value={analytics.usersMonth} color="violet" icon={Users} />
                <StatCard label="NEW ORGS (WEEK)" value={analytics.orgsWeek} color="amber" icon={Building2} />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="TOTAL PLAYERS" value={analytics.totalSaves} color="cyan" icon={Gamepad2} />
                <StatCard label="OPEN REPORTS" value={analytics.openReports} color={analytics.openReports > 0 ? 'red' : 'emerald'} icon={MessageSquareWarning} />
                <StatCard label="TOTAL REPORTS" value={analytics.totalReports} color="pink" icon={FileText} />
                <StatCard label="BROADCASTS SENT" value={analytics.totalBroadcasts} color="amber" icon={Megaphone} />
              </div>

              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="text-xs font-mono tracking-widest uppercase text-zinc-400 mb-4">FEATURE SUBSCRIPTIONS</h3>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {analytics.featureCounts.map(f => (
                    <div key={f.key} className="bg-muted/20 rounded-lg p-3 text-center">
                      <p className="text-[10px] text-zinc-500 font-mono uppercase mb-1">{FEATURE_LABELS[f.key] || f.key}</p>
                      <p className="text-lg font-bold text-foreground">{f.count}</p>
                    </div>
                  ))}
                  {analytics.featureCounts.length === 0 && (
                    <p className="text-xs text-zinc-600 col-span-5">No feature subscriptions yet</p>
                  )}
                </div>
              </div>

              {analytics.topPlayers.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-5">
                  <h3 className="text-xs font-mono tracking-widest uppercase text-zinc-400 mb-4">TOP PLAYERS BY LEVEL</h3>
                  <div className="space-y-2">
                    {analytics.topPlayers.map((p, i) => (
                      <div key={i} className="flex items-center gap-4 px-3 py-2 rounded-lg bg-muted/10">
                        <span className="text-[10px] font-mono text-amber-400 w-6">#{i + 1}</span>
                        <span className="text-sm text-foreground flex-1 truncate">{p.charName}</span>
                        <span className="text-[10px] font-mono text-sky-400">LVL {p.level}</span>
                        <span className="text-[10px] font-mono text-emerald-400">{'\u0192'}{p.salary.toLocaleString()}</span>
                        <button onClick={() => loadUserDetail(p.userId)} className="text-[10px] font-mono text-zinc-500 hover:text-sky-400">VIEW</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'users' && !selectedUser && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search users by name or email..."
                  className="w-full pl-10 pr-4 py-2.5 bg-muted/20 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-sky-500/40"
                />
              </div>
              {/* Mobile (<sm): stacked card per user — long emails wrap on
                  their own line so the page never scrolls sideways.
                  Desktop (sm+): the original 4-column grid. */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="hidden sm:grid grid-cols-[1fr_1fr_120px_80px] gap-4 px-4 py-2.5 border-b border-border bg-muted/10 text-[10px] font-mono tracking-widest uppercase text-zinc-500">
                  <span>NAME</span><span>EMAIL</span><span>JOINED</span><span>ACTIONS</span>
                </div>
                {filteredUsers.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-zinc-600">No users found</div>
                ) : (
                  filteredUsers.slice(0, 50).map(u => (
                    <div
                      key={u.id}
                      className="flex flex-col gap-2 sm:grid sm:grid-cols-[1fr_1fr_120px_80px] sm:gap-4 sm:items-center px-3 sm:px-4 py-3 border-b border-border/50 hover:bg-white/[0.02]"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {u.profileImageUrl ? (
                          <img src={u.profileImageUrl} alt="" className="w-6 h-6 rounded-md object-cover shrink-0" />
                        ) : (
                          <div className="w-6 h-6 rounded-md bg-sky-500/10 flex items-center justify-center text-[10px] font-mono text-sky-300 shrink-0">
                            {(u.firstName?.[0] || u.email?.[0] || '?').toUpperCase()}
                          </div>
                        )}
                        <span className="text-sm text-foreground truncate min-w-0">
                          {[u.firstName, u.lastName].filter(Boolean).join(' ') || 'Unknown'}
                        </span>
                      </div>
                      {/* Email: wrap on mobile (break-all so even long
                          tokens like an unbroken address don't overflow),
                          truncate to one line on desktop. */}
                      <span className="text-xs text-muted-foreground break-all sm:break-normal sm:truncate min-w-0">
                        {u.email || '\u2014'}
                      </span>
                      <div className="flex items-center justify-between sm:justify-start sm:contents">
                        <span className="text-[10px] text-zinc-500 sm:order-none">
                          {new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                        </span>
                        <button
                          onClick={() => loadUserDetail(u.id)}
                          className="text-[10px] font-mono text-sky-400 hover:text-sky-300 transition-colors px-2 py-1 sm:px-0 sm:py-0 rounded border border-sky-500/30 sm:border-0 bg-sky-500/10 sm:bg-transparent"
                        >
                          MANAGE
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <p className="text-[10px] text-zinc-600 font-mono">{filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''} total</p>
            </motion.div>
          )}

          {activeTab === 'users' && selectedUser && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <button onClick={() => setSelectedUser(null)} className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 mb-2">
                <ChevronRight className="w-3 h-3 rotate-180" /> BACK TO USERS
              </button>

              {userDetailLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>
              ) : (
                <>
                  <div className="bg-card border border-border rounded-xl p-5">
                    <div className="flex items-center gap-4 mb-4">
                      {selectedUser.user.profileImageUrl ? (
                        <img src={selectedUser.user.profileImageUrl} alt="" className="w-12 h-12 rounded-xl object-cover" />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-sky-500/10 flex items-center justify-center text-lg font-mono text-sky-300">
                          {(selectedUser.user.firstName?.[0] || '?').toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="text-lg font-bold text-foreground">
                          {[selectedUser.user.firstName, selectedUser.user.lastName].filter(Boolean).join(' ') || 'Unknown'}
                        </p>
                        <p className="text-xs text-zinc-500">{selectedUser.user.email || 'No email'}</p>
                        <p className="text-[10px] text-zinc-600 font-mono mt-0.5">ID: {selectedUser.user.id}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                      {selectedUser.memberships.map(m => (
                        <div key={m.orgId} className="bg-muted/20 rounded-lg px-3 py-2">
                          <p className="text-[10px] text-zinc-500 uppercase">ORG ROLE</p>
                          <p className="text-sm font-bold text-foreground">{m.role.toUpperCase()}</p>
                          <p className="text-[10px] text-zinc-400 truncate">{m.orgName}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {selectedUser.saves.length > 0 && (
                    <div className="bg-card border border-border rounded-xl p-5">
                      <h4 className="text-xs font-mono tracking-widest uppercase text-zinc-400 mb-3">SALARYMAN SAVE DATA</h4>
                      {selectedUser.saves.map(s => (
                        <div key={s.id} className="flex flex-wrap items-center gap-4 px-3 py-2 rounded-lg bg-muted/10 mb-2">
                          <span className="text-sm font-bold text-foreground">{s.charName}</span>
                          <span className="text-[10px] font-mono text-violet-400">{s.charClass}</span>
                          <span className="text-[10px] font-mono text-sky-400">LVL {s.level}</span>
                          <span className="text-[10px] font-mono text-emerald-400">{'\u0192'}{s.salary.toLocaleString()}</span>
                          <span className="text-[10px] font-mono text-zinc-500">{s.lastZone}</span>
                          <span className="text-[10px] font-mono text-zinc-600">{Math.floor(s.playtime / 60)}h {s.playtime % 60}m</span>
                        </div>
                      ))}

                      <div className="mt-4 p-3 bg-amber-500/5 border border-amber-500/15 rounded-lg">
                        <h5 className="text-[10px] font-mono text-amber-400 tracking-widest uppercase mb-2">ADJUST FIAT BALANCE</h5>
                        <div className="flex gap-2">
                          <input value={balanceAmount} onChange={e => setBalanceAmount(e.target.value)} placeholder="Amount (+/-)" type="number"
                            className="flex-1 px-3 py-1.5 bg-muted/20 border border-border rounded-lg text-sm text-foreground outline-none" />
                          <input value={balanceReason} onChange={e => setBalanceReason(e.target.value)} placeholder="Reason"
                            className="flex-1 px-3 py-1.5 bg-muted/20 border border-border rounded-lg text-sm text-foreground outline-none" />
                          <button onClick={() => handleAdjustBalance(selectedUser.user.id)} disabled={actionLoading}
                            className="px-3 py-1.5 bg-amber-500/20 border border-amber-500/30 rounded-lg text-[10px] font-mono text-amber-300 hover:bg-amber-500/30 disabled:opacity-40">
                            <Wallet className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="bg-card border border-border rounded-xl p-5">
                    <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                      <h4 className="text-xs font-mono tracking-widest uppercase text-zinc-400">FEATURES</h4>
                      {(() => {
                        const allHave = ALL_FEATURES.every(fk => selectedUser.features.some(f => f.featureKey === fk));
                        return (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleGrantAllFeatures(selectedUser.user.id)}
                              disabled={actionLoading || allHave}
                              data-testid="grant-free-access"
                              className="px-3 py-1.5 rounded-md text-[10px] font-mono tracking-widest uppercase border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <Check className="w-3 h-3 inline mr-1" />
                              {allHave ? 'FREE ACCESS GRANTED' : 'GRANT FREE ACCESS'}
                            </button>
                            <button
                              onClick={() => handleRevokeAllFeatures(selectedUser.user.id)}
                              disabled={actionLoading || selectedUser.features.length === 0}
                              className="px-3 py-1.5 rounded-md text-[10px] font-mono tracking-widest uppercase border border-zinc-600/40 bg-zinc-700/10 text-zinc-400 hover:bg-zinc-700/20 disabled:opacity-40"
                            >
                              REVOKE ALL
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {ALL_FEATURES.map(fk => {
                        const has = selectedUser.features.some(f => f.featureKey === fk);
                        return (
                          <button key={fk} onClick={() => has ? handleRevokeFeature(selectedUser.user.id, fk) : handleGrantFeature(selectedUser.user.id, fk)}
                            className={`px-3 py-2 rounded-lg text-[10px] font-mono tracking-wider border transition-colors ${
                              has ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-muted/10 border-border text-zinc-500 hover:text-zinc-300'
                            }`}>
                            {has ? <Check className="w-3 h-3 inline mr-1" /> : <Plus className="w-3 h-3 inline mr-1" />}
                            {FEATURE_LABELS[fk] || fk}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="bg-red-500/5 border border-red-500/15 rounded-xl p-5">
                    <h4 className="text-xs font-mono tracking-widest uppercase text-red-400 mb-3">DESTRUCTIVE ACTIONS</h4>
                    <div className="flex gap-3">
                      <button onClick={() => handleResetUser(selectedUser.user.id, 'save')} disabled={actionLoading}
                        className="px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-[10px] font-mono text-red-400 hover:bg-red-500/20 disabled:opacity-40">
                        <RotateCcw className="w-3 h-3 inline mr-1.5" /> RESET SAVE DATA
                      </button>
                      <button onClick={() => handleResetUser(selectedUser.user.id, 'features')} disabled={actionLoading}
                        className="px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-[10px] font-mono text-red-400 hover:bg-red-500/20 disabled:opacity-40">
                        <Trash2 className="w-3 h-3 inline mr-1.5" /> REVOKE ALL FEATURES
                      </button>
                    </div>
                  </div>

                  {selectedUser.bans.length > 0 && (
                    <div className="bg-card border border-border rounded-xl p-5">
                      <h4 className="text-xs font-mono tracking-widest uppercase text-zinc-400 mb-3">BAN HISTORY</h4>
                      {selectedUser.bans.map(b => (
                        <div key={b.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/10 mb-1">
                          <span className={`text-[10px] font-mono ${b.active ? 'text-red-400' : 'text-zinc-600'}`}>{b.active ? 'ACTIVE' : 'LIFTED'}</span>
                          <span className="text-xs text-foreground flex-1 truncate">{b.reason}</span>
                          <span className="text-[10px] text-zinc-500">{new Date(b.createdAt).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}

          {activeTab === 'orgs' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {orgs.map(o => (
                  <div key={o.id} className="bg-card border border-border rounded-xl p-4 hover:border-sky-500/20 transition-colors">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-primary/70" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-foreground truncate">{o.name}</p>
                        {o.industry && <p className="text-[10px] text-muted-foreground truncate">{o.industry}</p>}
                      </div>
                    </div>
                    <div className="flex gap-3 mb-3">
                      <div className="bg-muted/20 rounded-lg px-3 py-1.5 flex-1">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">MEMBERS</p>
                        <p className="text-sm font-bold text-foreground">{o.memberCount ?? '\u2014'}</p>
                      </div>
                      <div className="bg-muted/20 rounded-lg px-3 py-1.5 flex-1">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">SIZE</p>
                        <p className="text-sm font-bold text-foreground">{o.size ?? '\u2014'}</p>
                      </div>
                    </div>
                    {/* Comp the entire business — grants every paid feature
                        to all active members in one tap. */}
                    <button
                      onClick={() => handleGrantOrgFreeAccess(o.id, o.name)}
                      disabled={actionLoading || (o.memberCount ?? 0) === 0}
                      data-testid={`org-grant-free-access-${o.id}`}
                      className="w-full px-3 py-2 rounded-md text-[10px] font-mono tracking-widest uppercase border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <Check className="w-3 h-3 inline mr-1" />
                      GRANT FREE ACCESS · ALL MEMBERS
                    </button>
                  </div>
                ))}
              </div>
              {orgs.length === 0 && (
                <div className="text-center py-12 text-sm text-zinc-600">No organizations registered yet</div>
              )}
            </motion.div>
          )}

          {activeTab === 'toggles' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <EmailGrantsCard />
              <p className="text-xs text-zinc-500 mb-2 mt-6">Toggle platform features on or off. Changes take effect immediately.</p>
              {['system', 'features', 'world', 'economy'].map(cat => {
                const items = DEFAULT_TOGGLES.filter(t => t.category === cat);
                if (items.length === 0) return null;
                return (
                  <div key={cat} className="bg-card border border-border rounded-xl p-5">
                    <h3 className="text-[10px] font-mono tracking-widest uppercase text-zinc-400 mb-4">{cat.toUpperCase()}</h3>
                    <div className="space-y-3">
                      {items.map(toggle => {
                        const val = configMap.get(toggle.key);
                        const isOn = val === 'true';
                        return (
                          <div key={toggle.key} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/10">
                            <div>
                              <p className="text-sm font-bold text-foreground">{toggle.label}</p>
                              <p className="text-[10px] text-zinc-500">{toggle.desc}</p>
                            </div>
                            <button
                              onClick={() => handleToggleConfig(toggle.key, val ?? 'false')}
                              className={`w-12 h-6 rounded-full relative transition-colors ${isOn ? 'bg-emerald-500/30' : 'bg-zinc-700/30'}`}
                            >
                              <div className={`absolute top-0.5 w-5 h-5 rounded-full transition-all ${
                                isOn ? 'left-[26px] bg-emerald-400' : 'left-0.5 bg-zinc-500'
                              }`} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </motion.div>
          )}

          {activeTab === 'config' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl p-5">
                <h3 className="text-xs font-mono tracking-widest uppercase text-amber-400 mb-3">ADD / UPDATE CONFIG</h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <input value={cfgKey} onChange={e => setCfgKey(e.target.value)} placeholder="Key (e.g. tax_rate)"
                    className="px-3 py-2 bg-muted/20 border border-border rounded-lg text-sm text-foreground outline-none" />
                  <input value={cfgValue} onChange={e => setCfgValue(e.target.value)} placeholder="Value"
                    className="px-3 py-2 bg-muted/20 border border-border rounded-lg text-sm text-foreground outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <select value={cfgCategory} onChange={e => setCfgCategory(e.target.value)}
                    className="px-3 py-2 bg-muted/20 border border-border rounded-lg text-sm text-foreground outline-none">
                    <option value="general">GENERAL</option>
                    <option value="economy">ECONOMY</option>
                    <option value="world">WORLD</option>
                    <option value="features">FEATURES</option>
                    <option value="system">SYSTEM</option>
                  </select>
                  <input value={cfgDesc} onChange={e => setCfgDesc(e.target.value)} placeholder="Description (optional)"
                    className="px-3 py-2 bg-muted/20 border border-border rounded-lg text-sm text-foreground outline-none" />
                </div>
                <button onClick={handleSaveConfig} disabled={!cfgKey}
                  className="px-4 py-2 bg-amber-500/20 border border-amber-500/30 rounded-lg text-xs font-mono text-amber-300 hover:bg-amber-500/30 disabled:opacity-40">
                  SAVE CONFIG
                </button>
              </div>

              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="grid grid-cols-[1fr_1fr_100px_140px_60px] gap-4 px-4 py-2.5 border-b border-border bg-muted/10 text-[10px] font-mono tracking-widest uppercase text-zinc-500">
                  <span>KEY</span><span>VALUE</span><span>CATEGORY</span><span>UPDATED</span><span></span>
                </div>
                {configs.filter(c => !DEFAULT_TOGGLES.some(t => t.key === c.key)).map(c => (
                  <div key={c.id} className="grid grid-cols-[1fr_1fr_100px_140px_60px] gap-4 px-4 py-3 border-b border-border/50 hover:bg-white/[0.02] items-center">
                    <span className="text-sm text-foreground font-mono truncate">{c.key}</span>
                    <span className="text-sm text-sky-400 font-mono truncate">{c.value}</span>
                    <span className="text-[10px] text-zinc-500 uppercase">{c.category}</span>
                    <span className="text-[10px] text-zinc-500">{c.updatedBy ?? '\u2014'}</span>
                    <button onClick={() => handleDeleteConfig(c.key)}
                      className="text-[10px] font-mono text-red-400 hover:text-red-300">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {configs.filter(c => !DEFAULT_TOGGLES.some(t => t.key === c.key)).length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-zinc-600">No custom config entries yet</div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'broadcast' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="bg-violet-500/5 border border-violet-500/15 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-4">
                  <Megaphone className="w-5 h-5 text-violet-400" />
                  <h3 className="text-xs font-mono tracking-widest uppercase text-violet-400">SEND BROADCAST</h3>
                </div>
                <div className="space-y-3">
                  <input value={bcTitle} onChange={e => setBcTitle(e.target.value)} placeholder="Broadcast title..."
                    className="w-full px-3 py-2 bg-muted/20 border border-border rounded-lg text-sm text-foreground outline-none focus:border-violet-500/40" />
                  <textarea value={bcMessage} onChange={e => setBcMessage(e.target.value)} placeholder="Message body..."
                    rows={3} className="w-full px-3 py-2 bg-muted/20 border border-border rounded-lg text-sm text-foreground outline-none focus:border-violet-500/40 resize-none" />
                  <div className="flex gap-3">
                    <select value={bcType} onChange={e => setBcType(e.target.value)}
                      className="px-3 py-2 bg-muted/20 border border-border rounded-lg text-sm text-foreground outline-none flex-1">
                      <option value="info">INFO</option>
                      <option value="warning">WARNING</option>
                      <option value="urgent">URGENT</option>
                      <option value="update">UPDATE</option>
                      <option value="maintenance">MAINTENANCE</option>
                    </select>
                    <select value={bcTarget} onChange={e => setBcTarget(e.target.value)}
                      className="px-3 py-2 bg-muted/20 border border-border rounded-lg text-sm text-foreground outline-none flex-1">
                      <option value="all">ALL USERS</option>
                      <option value="subscribers">SUBSCRIBERS ONLY</option>
                      <option value="free">FREE TIER ONLY</option>
                    </select>
                    <button onClick={handleSendBroadcast} disabled={!bcTitle || !bcMessage || bcSubmitting}
                      className="px-4 py-2 bg-violet-500/20 border border-violet-500/30 rounded-lg text-xs font-mono text-violet-300 hover:bg-violet-500/30 disabled:opacity-40 flex items-center gap-1.5">
                      <Send className="w-3 h-3" /> {bcSubmitting ? 'SENDING...' : 'SEND'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="grid grid-cols-[1fr_100px_100px_80px_80px] gap-4 px-4 py-2.5 border-b border-border bg-muted/10 text-[10px] font-mono tracking-widest uppercase text-zinc-500">
                  <span>BROADCAST</span><span>TYPE</span><span>AUDIENCE</span><span>STATUS</span><span>ACTION</span>
                </div>
                {broadcasts.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-zinc-600">No broadcasts sent yet</div>
                ) : broadcasts.map(b => (
                  <div key={b.id} className="grid grid-cols-[1fr_100px_100px_80px_80px] gap-4 px-4 py-3 border-b border-border/50 hover:bg-white/[0.02] items-center">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">{b.title}</p>
                      <p className="text-[10px] text-zinc-500 truncate">{b.message.substring(0, 60)}</p>
                    </div>
                    <span className={`text-[10px] font-mono tracking-wider ${
                      b.type === 'urgent' ? 'text-red-400' : b.type === 'warning' ? 'text-amber-400' : 'text-sky-400'
                    }`}>{b.type.toUpperCase()}</span>
                    <span className="text-[10px] text-zinc-500 uppercase">{b.targetAudience}</span>
                    <span className={`text-[10px] font-mono ${b.active ? 'text-emerald-400' : 'text-zinc-600'}`}>
                      {b.active ? 'LIVE' : 'OFF'}
                    </span>
                    <button onClick={() => handleToggleBroadcast(b.id, !b.active)}
                      className={`text-[10px] font-mono ${b.active ? 'text-red-400 hover:text-red-300' : 'text-emerald-400 hover:text-emerald-300'}`}>
                      {b.active ? 'DEACTIVATE' : 'ACTIVATE'}
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'reports' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="flex gap-2 mb-4">
                {['open', 'in_progress', 'resolved', 'dismissed'].map(s => (
                  <button key={s} onClick={() => loadReportsByStatus(s)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-mono tracking-widest uppercase border transition-colors ${
                      reportFilter === s ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' : 'text-zinc-500 border-border hover:text-zinc-300'
                    }`}>{s.replace('_', ' ')}</button>
                ))}
              </div>

              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="grid grid-cols-[1fr_100px_100px_120px] gap-4 px-4 py-2.5 border-b border-border bg-muted/10 text-[10px] font-mono tracking-widest uppercase text-zinc-500">
                  <span>REPORT</span><span>CATEGORY</span><span>STATUS</span><span>ACTIONS</span>
                </div>
                {reports.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-zinc-600">No {reportFilter.replace('_', ' ')} reports</div>
                ) : reports.map(r => (
                  <div key={r.id} className="grid grid-cols-[1fr_100px_100px_120px] gap-4 px-4 py-3 border-b border-border/50 hover:bg-white/[0.02] items-center">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">{r.title}</p>
                      <p className="text-[10px] text-zinc-500 truncate">{r.description.substring(0, 80)}</p>
                    </div>
                    <span className="text-[10px] text-zinc-400 font-mono uppercase">{r.category}</span>
                    <span className={`text-[10px] font-mono uppercase ${
                      r.status === 'open' ? 'text-amber-400' : r.status === 'resolved' ? 'text-emerald-400' : 'text-zinc-500'
                    }`}>{r.status.replace('_', ' ')}</span>
                    <div className="flex gap-1">
                      {r.status === 'open' && (
                        <>
                          <button onClick={() => handleUpdateReport(r.id, 'in_progress')} className="text-[10px] font-mono text-sky-400 hover:text-sky-300">REVIEW</button>
                          <button onClick={() => handleUpdateReport(r.id, 'dismissed')} className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 ml-2">DISMISS</button>
                        </>
                      )}
                      {r.status === 'in_progress' && (
                        <button onClick={() => handleUpdateReport(r.id, 'resolved')} className="text-[10px] font-mono text-emerald-400 hover:text-emerald-300">RESOLVE</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'bans' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="bg-red-500/5 border border-red-500/15 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-3">
                  <Ban className="w-5 h-5 text-red-400" />
                  <h3 className="text-sm font-bold text-foreground">ISSUE BAN</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <input value={banUserId} onChange={e => setBanUserId(e.target.value)} placeholder="User ID"
                    className="px-3 py-2 bg-muted/20 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-red-500/40" />
                  <select value={banType} onChange={e => setBanType(e.target.value as 'temporary' | 'permanent')}
                    className="px-3 py-2 bg-muted/20 border border-border rounded-lg text-sm text-foreground outline-none focus:border-red-500/40">
                    <option value="temporary">TEMPORARY</option>
                    <option value="permanent">PERMANENT</option>
                  </select>
                </div>
                <div className="flex gap-3">
                  <input value={banReason} onChange={e => setBanReason(e.target.value)} placeholder="Reason for ban..."
                    className="flex-1 px-3 py-2 bg-muted/20 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-red-500/40" />
                  <button onClick={handleIssueBan} disabled={!banUserId || !banReason || banSubmitting}
                    className="px-4 py-2 bg-red-500/20 border border-red-500/30 rounded-lg text-xs font-mono text-red-300 hover:bg-red-500/30 transition-colors disabled:opacity-40">
                    {banSubmitting ? 'BANNING...' : 'ISSUE BAN'}
                  </button>
                </div>
              </div>

              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="grid grid-cols-[1fr_100px_100px_80px_80px] gap-4 px-4 py-2.5 border-b border-border bg-muted/10 text-[10px] font-mono tracking-widest uppercase text-zinc-500">
                  <span>USER</span><span>TYPE</span><span>ISSUED</span><span>STATUS</span><span>ACTION</span>
                </div>
                {bans.length === 0 ? (
                  <div className="px-4 py-12 text-center">
                    <Ban className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                    <p className="text-sm text-zinc-600">No bans on record</p>
                  </div>
                ) : bans.map(b => (
                  <div key={b.id} className="grid grid-cols-[1fr_100px_100px_80px_80px] gap-4 px-4 py-3 border-b border-border/50 hover:bg-white/[0.02] items-center">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">
                        {[b.userFirstName, b.userLastName].filter(Boolean).join(' ') || b.userEmail || b.userId}
                      </p>
                      <p className="text-[10px] text-zinc-500 truncate">{b.reason}</p>
                    </div>
                    <span className={`text-[10px] font-mono tracking-wider ${b.type === 'permanent' ? 'text-red-400' : 'text-amber-400'}`}>
                      {b.type.toUpperCase()}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      {new Date(b.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span className={`text-[10px] font-mono ${b.active ? 'text-red-400' : 'text-zinc-600'}`}>
                      {b.active ? 'ACTIVE' : 'LIFTED'}
                    </span>
                    <button onClick={() => handleToggleBan(b.id, !b.active)}
                      className={`text-[10px] font-mono transition-colors ${
                        b.active ? 'text-emerald-400 hover:text-emerald-300' : 'text-red-400 hover:text-red-300'
                      }`}>{b.active ? 'LIFT' : 'REINSTATE'}</button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'audit' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <p className="text-xs text-zinc-500 mb-2">Every admin action is logged here for accountability.</p>
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="grid grid-cols-[140px_120px_100px_1fr_140px] gap-4 px-4 py-2.5 border-b border-border bg-muted/10 text-[10px] font-mono tracking-widest uppercase text-zinc-500">
                  <span>TIMESTAMP</span><span>ACTION</span><span>TARGET</span><span>DETAILS</span><span>ADMIN</span>
                </div>
                {auditLog.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-zinc-600">No audit log entries yet</div>
                ) : auditLog.map(a => (
                  <div key={a.id} className="grid grid-cols-[140px_120px_100px_1fr_140px] gap-4 px-4 py-3 border-b border-border/50 hover:bg-white/[0.02] items-center">
                    <span className="text-[10px] text-zinc-500">
                      {new Date(a.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-[10px] font-mono text-amber-400 uppercase">{a.action.replace(/_/g, ' ')}</span>
                    <span className="text-[10px] text-zinc-400 font-mono truncate">{a.targetType}/{a.targetId ?? '\u2014'}</span>
                    <span className="text-[10px] text-zinc-500 truncate">{a.details || '\u2014'}</span>
                    <span className="text-[10px] text-zinc-500 font-mono truncate">{a.adminId.substring(0, 12)}...</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'security' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                {(['overview', 'domains', 'flagged', 'attempts'] as const).map(v => (
                  <button key={v} onClick={() => setSecView(v)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-mono tracking-widest uppercase transition-colors ${
                      secView === v ? 'bg-red-500/15 text-red-400 border border-red-500/25' : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
                    }`}>{v === 'overview' ? 'OVERVIEW' : v === 'domains' ? 'BLOCKED DOMAINS' : v === 'flagged' ? 'FLAGGED USERS' : 'LOGIN ATTEMPTS'}</button>
                ))}
                <button onClick={loadSecurityData} className="ml-auto p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/5">
                  <RefreshCw className={`w-3.5 h-3.5 ${secLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {secView === 'overview' && secStats && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatCard label="BUILTIN BLOCKED DOMAINS" value={secStats.builtinDomains} color="red" icon={Lock} />
                    <StatCard label="CUSTOM BLOCKED DOMAINS" value={secStats.customBlockedDomains} color="amber" icon={Globe} />
                    <StatCard label="FLAGGED USERS" value={secStats.flaggedUsers} color="pink" icon={Flag} />
                    <StatCard label="BLOCKED LOGINS (24H)" value={secStats.blockedLoginsToday} color="red" icon={ShieldAlert} />
                  </div>
                  <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                    <p className="text-[10px] font-mono tracking-widest uppercase text-zinc-500">SCREEN TEST</p>
                    <div className="flex gap-2">
                      <input value={screenTestEmail} onChange={e => setScreenTestEmail(e.target.value)}
                        placeholder="test@example.com" className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground" />
                      <button onClick={handleScreenTest} className="px-4 py-2 bg-red-500/15 text-red-400 border border-red-500/25 rounded-lg text-xs font-medium hover:bg-red-500/25">TEST</button>
                    </div>
                    {screenTestResult && (
                      <div className={`p-3 rounded-lg border text-xs font-mono ${
                        screenTestResult.result?.allowed ? 'bg-emerald-500/5 border-emerald-500/15 text-emerald-400' : 'bg-red-500/5 border-red-500/15 text-red-400'
                      }`}>
                        <span className="font-bold">{screenTestResult.result?.allowed ? 'ALLOWED' : 'BLOCKED'}</span>
                        {screenTestResult.result?.reason && <span className="ml-2 text-zinc-500">{screenTestResult.result.reason}</span>}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {secView === 'domains' && (
                <div className="space-y-3">
                  <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                    <p className="text-[10px] font-mono tracking-widest uppercase text-zinc-500">ADD BLOCKED DOMAIN</p>
                    <div className="flex gap-2">
                      <input value={newDomain} onChange={e => setNewDomain(e.target.value)}
                        placeholder="spammer.com" className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground" />
                      <input value={newDomainReason} onChange={e => setNewDomainReason(e.target.value)}
                        placeholder="Reason (optional)" className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground" />
                      <button onClick={handleAddDomain} disabled={!newDomain || secLoading}
                        className="px-4 py-2 bg-red-500/15 text-red-400 border border-red-500/25 rounded-lg text-xs font-medium hover:bg-red-500/25 disabled:opacity-40">
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="grid grid-cols-[1fr_120px_100px_60px] gap-4 px-4 py-2.5 border-b border-border bg-muted/10 text-[10px] font-mono tracking-widest uppercase text-zinc-500">
                      <span>DOMAIN</span><span>REASON</span><span>ADDED</span><span></span>
                    </div>
                    {blockedDomains.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-zinc-600">No custom blocked domains yet. Builtin list is always active.</div>
                    ) : blockedDomains.map(d => (
                      <div key={d.id} className="grid grid-cols-[1fr_120px_100px_60px] gap-4 px-4 py-3 border-b border-border/50 hover:bg-white/[0.02] items-center">
                        <span className="text-sm text-foreground font-mono">{d.domain}</span>
                        <span className="text-[10px] text-zinc-500">{d.reason}</span>
                        <span className="text-[10px] text-zinc-500">{new Date(d.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        <button onClick={() => handleRemoveDomain(d.id)} className="p-1 text-red-400 hover:bg-red-500/10 rounded">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {secView === 'flagged' && (
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="grid grid-cols-[1fr_1fr_120px_100px_80px] gap-4 px-4 py-2.5 border-b border-border bg-muted/10 text-[10px] font-mono tracking-widest uppercase text-zinc-500">
                    <span>USER</span><span>REASON</span><span>DETAILS</span><span>FLAGGED</span><span></span>
                  </div>
                  {flaggedUsers.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-zinc-600">No flagged users</div>
                  ) : flaggedUsers.map(({ flag, user }) => (
                    <div key={flag.id} className="grid grid-cols-[1fr_1fr_120px_100px_80px] gap-4 px-4 py-3 border-b border-border/50 hover:bg-white/[0.02] items-center">
                      <div className="flex items-center gap-2 min-w-0">
                        {user?.profileImageUrl && <img src={user.profileImageUrl} className="w-6 h-6 rounded-full" alt="" />}
                        <div className="min-w-0">
                          <p className="text-sm text-foreground truncate">{user?.firstName ?? 'Unknown'} {user?.lastName ?? ''}</p>
                          <p className="text-[10px] text-zinc-500 truncate">{user?.email ?? flag.email}</p>
                        </div>
                      </div>
                      <span className="text-[10px] text-amber-400 font-mono uppercase">{flag.reason}</span>
                      <span className="text-[10px] text-zinc-500 truncate">{flag.details || '\u2014'}</span>
                      <span className="text-[10px] text-zinc-500">{new Date(flag.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      <button onClick={() => handleResolveFlag(flag.id, !flag.resolved)}
                        className={`px-2 py-1 rounded text-[10px] font-mono ${flag.resolved ? 'text-amber-400 hover:bg-amber-500/10' : 'text-emerald-400 hover:bg-emerald-500/10'}`}>
                        {flag.resolved ? 'UNRESOLVE' : 'RESOLVE'}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {secView === 'attempts' && (
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="grid grid-cols-[1fr_120px_120px_100px] gap-4 px-4 py-2.5 border-b border-border bg-muted/10 text-[10px] font-mono tracking-widest uppercase text-zinc-500">
                    <span>EMAIL</span><span>IP</span><span>REASON</span><span>TIME</span>
                  </div>
                  {loginAttempts.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-zinc-600">No blocked login attempts</div>
                  ) : loginAttempts.map(a => (
                    <div key={a.id} className="grid grid-cols-[1fr_120px_120px_100px] gap-4 px-4 py-3 border-b border-border/50 hover:bg-white/[0.02] items-center">
                      <span className="text-sm text-foreground font-mono truncate">{a.email ?? '\u2014'}</span>
                      <span className="text-[10px] text-zinc-500 font-mono">{a.ipAddress ?? '\u2014'}</span>
                      <span className="text-[10px] text-red-400 font-mono uppercase">{a.blockReason ?? '\u2014'}</span>
                      <span className="text-[10px] text-zinc-500">
                        {new Date(a.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
