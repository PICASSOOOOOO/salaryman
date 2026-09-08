import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Users, Building2, UserCog, Eye, AlertTriangle,
  ShieldCheck, Loader2, Ban, Search, ChevronRight,
  BarChart3, ToggleLeft, Settings, Megaphone, MessageSquareWarning,
  ScrollText, Wallet, RotateCcw, Plus, X, Trash2, Check,
  TrendingUp, UserPlus, Gamepad2, Send, FileText, ShieldAlert,
  Globe, Flag, Lock, Unlock, RefreshCw, Phone,
  Activity, Coins, MapPin, Briefcase, DollarSign, Server, HardHat,
  Wifi, CheckCircle2, XCircle, AlertCircle,
  CreditCard,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { resolveAvatarUrl } from '@/lib/avatar';
import { useAuth } from '@/hooks/use-auth';
import { usePlan } from '@/hooks/use-plan';
import { useBoomerMode } from '@/hooks/use-mobile';
import { useLocation } from 'wouter';
import { AdminConstructionOverview } from '@/components/ConstructionOverview';

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

interface GameTelemetry {
  playersOnlineNow: number;
  playersActive24h: number;
  totalPlayers: number;
  businessesByType: { type: string; count: number }[];
  verifiedBusinesses: number;
  buildings: { total: number; occupied: number; demolished: number };
  economy: { currency: string; total: number }[];
  activeSeason: { name: string; number: number; endsAt: string } | null;
  topZones: { zone: string; count: number }[];
  recentlyActive: { charName: string; lastZone: string | null; level: number; lastSavedAt: string }[];
  recentTransactions: { playerName: string; companyName: string | null; category: string; description: string; amount: number; createdAt: string }[];
  generatedAt: string;
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

type AdminTab = 'analytics' | 'pulse' | 'construction' | 'users' | 'orgs' | 'config' | 'toggles' | 'broadcast' | 'reports' | 'bans' | 'audit' | 'security' | 'alpha' | 'phones' | 'costs' | 'status' | 'salaryqual' | 'citizenship' | 'credit';

interface SalaryQualRow {
  id: number;
  userId: string | null;
  playerName: string;
  companyName: string | null;
  industry: string | null;
  payrollProvider: string | null;
  declaredMonthlyIncome: number | null;
  contactEmail: string | null;
  pendingOwnerVerification: boolean;
  createdAt: string;
}

interface CreditReviewRow {
  id: number;
  applicantUserId: string;
  orgId: number | null;
  product: string;
  requestedFiat: number;
  approvedFiat: number;
  aprBps: number;
  termMonths: number;
  purpose: string;
  applicantScore: number;
  orgScore: number | null;
  orgAgeDays: number | null;
  monthlyIncomeFiat: number;
  consistencyScore: number;
  status: string;
  createdAt: string;
  usage: { id: number; eventType: string; amountFiat: number; createdAt: string; metadata: Record<string, unknown> }[];
}

interface TwilioInventoryNumber {
  sid: string;
  number: string;
  friendlyName: string;
  voiceUrl: string;
  smsUrl: string;
  capabilities: Record<string, boolean> | null;
  assignedTo: {
    phoneNumberId: number;
    userId: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    label: string | null;
    isActive: boolean;
    assignedAt: string;
    orgId: number | null;
    orgName: string | null;
  } | null;
}

interface OrphanedPhoneAssignment {
  phoneNumberId: number;
  number: string;
  twilioSid: string | null;
  label: string | null;
  isActive: boolean;
  assignedAt: string;
  user: { id: string; email: string | null; firstName: string | null; lastName: string | null } | null;
  orgId: number | null;
  orgName: string | null;
}

interface OrgOption {
  id: number;
  name: string;
}

const FEATURE_LABELS: Record<string, string> = {
  live_listen: 'LIVE LISTEN',
  screen_scan: 'SCREEN SCAN',
  say_this: 'SAY THIS',
  phone_system: 'PHONE SYSTEM',
  claw_bot: 'CLAW BOT',
};

const ALL_FEATURES = ['live_listen', 'screen_scan', 'say_this', 'phone_system', 'claw_bot'];

const DEFAULT_TOGGLES: { key: string; label: string; desc: string; category: string; defaultOn: boolean }[] = [
  { key: 'maintenance_mode', label: 'MAINTENANCE MODE', desc: 'Disables all user access except Picasso admins', category: 'system', defaultOn: false },
  { key: 'registration_open', label: 'REGISTRATION OPEN', desc: 'Allow new user registration', category: 'system', defaultOn: true },
  { key: 'world_enabled', label: 'SALARYMAN WORLD', desc: 'Enable or disable the Salaryman MMO world', category: 'features', defaultOn: true },
  { key: 'marketplace_enabled', label: 'PIXEL AGENTS STORE', desc: 'Enable or disable the Pixel Agents store', category: 'features', defaultOn: true },
  { key: 'phone_system_enabled', label: 'PHONE SYSTEM', desc: 'Enable or disable the Twilio phone integration', category: 'features', defaultOn: true },
  { key: 'chat_enabled', label: 'CHAT SYSTEM', desc: 'Enable or disable in-app messaging', category: 'features', defaultOn: true },
  { key: 'hiring_enabled', label: 'HIRING BOARD', desc: 'Enable or disable the job board', category: 'features', defaultOn: true },
  { key: 'crm_enabled', label: 'CRM TOOLS', desc: 'Enable or disable CRM / contacts / deals', category: 'features', defaultOn: true },
  { key: 'creative_studio_enabled', label: 'CREATIVE STUDIO', desc: 'Enable or disable AI creative tools', category: 'features', defaultOn: true },
  { key: 'wasteland_enabled', label: 'WASTELAND ACCESS', desc: 'Allow players to enter the wasteland zone', category: 'world', defaultOn: true },
  { key: 'pvp_enabled', label: 'PVP COMBAT', desc: 'Enable or disable player vs player combat', category: 'world', defaultOn: false },
  { key: 'tax_system_enabled', label: 'TAX SYSTEM', desc: 'Enable or disable the in-game tax system', category: 'economy', defaultOn: true },
  { key: 'passive_income_enabled', label: 'PASSIVE INCOME', desc: 'Enable or disable business passive income', category: 'economy', defaultOn: true },
];

type EmailGrant = { id: number; email: string; featureKey: string; source: string; expiresAt: string; createdAt: string };
type EmailGrantGroup = { email: string; grants: EmailGrant[] };

function EmailGrantsCard() {
  const { user } = useAuth();
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
  const grantMyAccount = async () => {
    const email = user?.email?.trim().toLowerCase();
    if (!email) return;
    setBusy('__self');
    try {
      await Promise.all(ALL_FEATURES.map(featureKey =>
        apiFetch('/api/admin/email-grants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, featureKey }),
        })
      ));
      await load();
    } finally { setBusy(null); }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-1 gap-3">
        <h3 className="text-[10px] font-mono tracking-widest uppercase text-zinc-400">EMAIL PRE-GRANTS</h3>
        <span className="text-[10px] text-zinc-500">{groups.length} email{groups.length === 1 ? '' : 's'}</span>
        <button
          type="button"
          onClick={() => void grantMyAccount()}
          disabled={!user?.email || busy === '__self'}
          className="shrink-0 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[10px] font-mono tracking-widest text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40"
        >
          {busy === '__self' ? 'GRANTING…' : 'GRANT MY ACCOUNT ALL ACCESS'}
        </button>
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
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { isOwner, loading: planLoading } = usePlan();
  const [boomerMode] = useBoomerMode();
  const [location, navigate] = useLocation();

  const searchParams = new URLSearchParams(location.split('?')[1] || '');
  const rawTabParam = searchParams.get('tab');
  // Whitelist tabs that actually have a render branch in this page. 'alpha'
  // intentionally lives on its own page (/profile/admin/alpha) and is just
  // a launcher in the tab strip — accepting it here would render a blank
  // content area. Anything unrecognized falls back to analytics.
  const IN_PAGE_TABS: ReadonlyArray<AdminTab> = [
    'analytics', 'pulse', 'construction', 'users', 'orgs', 'config', 'toggles', 'broadcast',
    'reports', 'bans', 'audit', 'security', 'phones', 'costs', 'status', 'salaryqual', 'citizenship', 'credit',
  ];
  const activeTab: AdminTab = IN_PAGE_TABS.includes(rawTabParam as AdminTab)
    ? (rawTabParam as AdminTab)
    : 'analytics';

  // Bookmarked or hand-edited ?tab=alpha → bounce to the dedicated page so
  // the user lands on real content instead of an empty panel.
  useEffect(() => {
    if (rawTabParam === 'alpha') navigate('/profile/admin/alpha');
  }, [rawTabParam, navigate]);

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [orgs, setOrgs] = useState<OrgRecord[]>([]);
  const [bans, setBans] = useState<BanRecord[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [telemetry, setTelemetry] = useState<GameTelemetry | null>(null);
  const [telemetryLoading, setTelemetryLoading] = useState(false);
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

  // Verified-salary qualification queue — real businesses with a declared
  // salary awaiting manual admin verification (the non-payroll path that lets
  // a player start earning their monthlySalary/720 ƒ-per-real-hour wage).
  const [salaryQuals, setSalaryQuals] = useState<SalaryQualRow[]>([]);
  const [salaryQualsLoading, setSalaryQualsLoading] = useState(false);
  const [salaryQualBusyId, setSalaryQualBusyId] = useState<number | null>(null);

  const loadSalaryQuals = useCallback(async () => {
    setSalaryQualsLoading(true);
    try {
      const resp = await apiFetch('/api/admin/salary-qualifications');
      const data = await resp.json();
      setSalaryQuals(data.qualifications ?? []);
    } catch {
      setSalaryQuals([]);
    } finally {
      setSalaryQualsLoading(false);
    }
  }, []);

  const decideSalaryQual = useCallback(async (id: number, approve: boolean) => {
    setSalaryQualBusyId(id);
    try {
      const resp = await apiFetch(`/api/admin/salary-qualifications/${id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approve }),
      });
      if (resp.ok) setSalaryQuals((q) => q.filter((row) => row.id !== id));
    } catch {
      /* leave row in place so the admin can retry */
    } finally {
      setSalaryQualBusyId(null);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'salaryqual') void loadSalaryQuals();
  }, [activeTab, loadSalaryQuals]);

  const [creditReviews, setCreditReviews] = useState<CreditReviewRow[]>([]);
  const [creditReviewsLoading, setCreditReviewsLoading] = useState(false);
  const [creditReviewBusyId, setCreditReviewBusyId] = useState<number | null>(null);
  const loadCreditReviews = useCallback(async () => {
    setCreditReviewsLoading(true);
    try {
      const resp = await apiFetch('/api/credit/admin/applications');
      const data = await resp.json();
      setCreditReviews(data.applications ?? []);
    } catch {
      setCreditReviews([]);
    } finally {
      setCreditReviewsLoading(false);
    }
  }, []);
  const decideCredit = useCallback(async (row: CreditReviewRow, decision: 'approved' | 'declined') => {
    setCreditReviewBusyId(row.id);
    try {
      const response = await apiFetch(`/api/credit/admin/applications/${row.id}/decision`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, approvedFiat: row.requestedFiat, aprBps: Math.max(1500, row.aprBps), termMonths: row.termMonths }),
      });
      if (response.ok) await loadCreditReviews();
    } finally {
      setCreditReviewBusyId(null);
    }
  }, [loadCreditReviews]);
  const fundCredit = useCallback(async (row: CreditReviewRow) => {
    setCreditReviewBusyId(row.id);
    try {
      const response = await apiFetch(`/api/credit/admin/applications/${row.id}/fund`, { method: 'POST' });
      if (response.ok) await loadCreditReviews();
    } finally {
      setCreditReviewBusyId(null);
    }
  }, [loadCreditReviews]);
  useEffect(() => {
    if (activeTab === 'credit') void loadCreditReviews();
  }, [activeTab, loadCreditReviews]);

  // Pending citizenship applications — awaiting admin approve/deny.
  interface CitizenshipApplication {
    id: number;
    user_id: string;
    city_id: string;
    status: string;
    granted_at: string;
    updated_at: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
  }
  const [citizenshipApps, setCitizenshipApps] = useState<CitizenshipApplication[]>([]);
  const [citizenshipLoading, setCitizenshipLoading] = useState(false);
  const [citizenshipBusyId, setCitizenshipBusyId] = useState<number | null>(null);

  const loadCitizenshipApps = useCallback(async () => {
    setCitizenshipLoading(true);
    try {
      const resp = await apiFetch('/api/admin/citizenship/applications');
      const data = await resp.json();
      setCitizenshipApps(data.applications ?? []);
    } catch {
      setCitizenshipApps([]);
    } finally {
      setCitizenshipLoading(false);
    }
  }, []);

  const decideCitizenship = useCallback(async (app: CitizenshipApplication, decision: 'approve' | 'deny') => {
    setCitizenshipBusyId(app.id);
    try {
      const resp = await apiFetch(`/api/admin/citizenship/${app.user_id}/${app.city_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      if (resp.ok) setCitizenshipApps((q) => q.filter((r) => r.id !== app.id));
    } catch {
      /* leave row in place so admin can retry */
    } finally {
      setCitizenshipBusyId(null);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'citizenship') void loadCitizenshipApps();
  }, [activeTab, loadCitizenshipApps]);

  // Pending alpha-tester applications waiting for admin decision. Polled on
  // every AdminPanel mount so the tab badge surfaces new applicants without
  // requiring the admin to navigate into the alpha page first.
  const [alphaPending, setAlphaPending] = useState(0);
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    apiFetch('/api/alpha/applications?status=pending')
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (!cancelled && data) setAlphaPending(data.pendingCount ?? 0); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isAuthenticated]);

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

  // Phone-numbers tab state.
  const [phoneInventory, setPhoneInventory] = useState<TwilioInventoryNumber[]>([]);
  const [phoneOrphans, setPhoneOrphans] = useState<OrphanedPhoneAssignment[]>([]);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneAssignDraft, setPhoneAssignDraft] = useState<Record<string, { userId: string; label: string; orgId: string }>>({});
  const [phoneBusySid, setPhoneBusySid] = useState<string | null>(null);
  const [phoneOrgs, setPhoneOrgs] = useState<OrgOption[]>([]);
  // Tracks per-row in-flight org changes for already-assigned numbers so we
  // can disable the dropdown while the request is on the wire.
  const [phoneOrgBusyId, setPhoneOrgBusyId] = useState<number | null>(null);
  // Independent user-search for the assignment dropdown so admins aren't
  // limited to the first 50 users loaded by the main `users` list.
  const [phoneUserSearch, setPhoneUserSearch] = useState('');
  const [phoneUserResults, setPhoneUserResults] = useState<UserRecord[]>([]);
  const [phoneUserSearching, setPhoneUserSearching] = useState(false);

  useEffect(() => {
    if (activeTab !== 'phones') return;
    const q = phoneUserSearch.trim();
    if (!q) { setPhoneUserResults([]); return; }
    let cancelled = false;
    setPhoneUserSearching(true);
    const t = setTimeout(async () => {
      try {
        const resp = await apiFetch(`/api/admin/users?search=${encodeURIComponent(q)}&limit=50`);
        const data = await resp.json();
        if (!cancelled) setPhoneUserResults(data.users ?? []);
      } catch {
        if (!cancelled) setPhoneUserResults([]);
      } finally {
        if (!cancelled) setPhoneUserSearching(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [phoneUserSearch, activeTab]);

  const loadPhoneInventory = useCallback(async () => {
    setPhoneLoading(true);
    setPhoneError(null);
    try {
      const resp = await apiFetch('/api/admin/phone-numbers/inventory');
      const data = await resp.json();
      if (!resp.ok) {
        setPhoneError(data?.error ?? `HTTP ${resp.status}`);
        return;
      }
      setPhoneInventory(data.twilioNumbers ?? []);
      setPhoneOrphans(data.orphanedAssignments ?? []);
      setPhoneOrgs(data.organizations ?? []);
    } catch (e: unknown) {
      setPhoneError(e instanceof Error ? e.message : 'Failed to load phone inventory');
    } finally {
      setPhoneLoading(false);
    }
  }, []);

  const handleAssignPhone = async (sid: string) => {
    const draft = phoneAssignDraft[sid];
    if (!draft?.userId) return;
    setPhoneBusySid(sid);
    setPhoneError(null);
    try {
      // orgId is optional — empty string ⇒ omit ⇒ no org pool stamp.
      const orgIdNum = draft.orgId ? Number(draft.orgId) : undefined;
      const resp = await apiFetch('/api/admin/phone-numbers/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          twilioSid: sid,
          userId: draft.userId,
          label: draft.label || undefined,
          ...(typeof orgIdNum === 'number' && Number.isFinite(orgIdNum) ? { orgId: orgIdNum } : {}),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) { setPhoneError(data?.error ?? `HTTP ${resp.status}`); return; }
      setPhoneAssignDraft(prev => ({ ...prev, [sid]: { userId: '', label: '', orgId: '' } }));
      loadPhoneInventory();
    } catch (e: unknown) {
      setPhoneError(e instanceof Error ? e.message : 'Assign failed');
    } finally {
      setPhoneBusySid(null);
    }
  };

  // Re-stamp an already-assigned phone number into a different org pool (or
  // detach it). Triggered by changing the per-row org dropdown in the
  // ASSIGNED column. Empty value ⇒ clear org_id.
  const handleSetPhoneOrg = async (phoneNumberId: number, rawOrgId: string) => {
    setPhoneOrgBusyId(phoneNumberId);
    setPhoneError(null);
    try {
      const orgIdNum = rawOrgId ? Number(rawOrgId) : null;
      const resp = await apiFetch(`/api/admin/phone-numbers/${phoneNumberId}/org`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: orgIdNum }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) { setPhoneError(data?.error ?? `HTTP ${resp.status}`); return; }
      loadPhoneInventory();
    } catch (e: unknown) {
      setPhoneError(e instanceof Error ? e.message : 'Set org failed');
    } finally {
      setPhoneOrgBusyId(null);
    }
  };

  const handleUnassignPhone = async (phoneNumberId: number, sid: string | null) => {
    if (!confirm('Release this number? Inbound calls will stop routing to the user immediately.')) return;
    setPhoneBusySid(sid ?? `db-${phoneNumberId}`);
    setPhoneError(null);
    try {
      const resp = await apiFetch(`/api/admin/phone-numbers/${phoneNumberId}`, { method: 'DELETE' });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) { setPhoneError(data?.error ?? `HTTP ${resp.status}`); return; }
      loadPhoneInventory();
    } catch (e: unknown) {
      setPhoneError(e instanceof Error ? e.message : 'Unassign failed');
    } finally {
      setPhoneBusySid(null);
    }
  };

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
    // Alpha applications live on a dedicated page (richer per-row actions,
    // notes, status filters). The tab is just a launcher into it so admins
    // don't have to know the URL.
    if (tab === 'alpha') { navigate('/profile/admin/alpha'); return; }
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

  useEffect(() => {
    if (activeTab === 'phones' && isAuthenticated) loadPhoneInventory();
  }, [activeTab, isAuthenticated, loadPhoneInventory]);

  const loadTelemetry = useCallback(() => {
    setTelemetryLoading(true);
    apiFetch('/api/admin/game-telemetry')
      .then(async r => (r.ok ? (await r.json()) as GameTelemetry : null))
      .then(t => { if (t) setTelemetry(t); })
      .catch(() => {})
      .finally(() => setTelemetryLoading(false));
  }, []);

  // Live "WORLD PULSE" — poll every 12s while the tab is open for a real-time feel.
  useEffect(() => {
    if (activeTab !== 'pulse' || !isAuthenticated) return;
    loadTelemetry();
    const id = setInterval(loadTelemetry, 12000);
    return () => clearInterval(id);
  }, [activeTab, isAuthenticated, loadTelemetry]);

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

  const handleBulkReset = async (target: 'saves' | 'features' | 'all' | 'world') => {
    const labelMap: Record<string, string> = {
      saves: "DELETE EVERY PLAYER'S GAME PROGRESS (Picasso admins preserved)",
      features: "REVOKE EVERY USER'S FEATURE GRANTS (Picasso admins preserved)",
      all: "DELETE EVERY SAVE AND REVOKE EVERY FEATURE (Picasso admins preserved)",
      world: "FULL FRESH START — wipe ALL game progress AND DELETE EVERY ORG for EVERYONE (admins included). Logins, subscriptions/billing, and the world catalog are kept. Everyone replays onboarding from the very beginning.",
    };
    const confirmWord = target === 'world' ? 'RESET' : 'OK';
    if (!confirm(`${labelMap[target]}\n\nType ${confirmWord} in the next prompt to confirm.`)) return;
    const typed = prompt(`Type ${confirmWord} to confirm this destructive bulk action:`);
    if (typed !== confirmWord) return;
    setActionLoading(true);
    try {
      const resp = await apiFetch(`/api/admin/bulk-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (target === 'world') {
          alert(`Full fresh start complete. ${data.total} rows wiped across ${Object.keys(data.counts ?? {}).length} tables (all game progress + every org). Logins, billing, and the world catalog are intact. Everyone now replays onboarding.`);
        } else {
          alert(`Done. Saves deleted: ${data.savesDeleted}. Features revoked: ${data.featuresRevoked}. Owners preserved: ${data.ownersPreserved}.`);
        }
        loadData();
      } else {
        alert('Bulk reset failed.');
      }
    } catch { alert('Bulk reset failed.'); }
    finally { setActionLoading(false); }
  };

  const handleProductionUserReset = async () => {
    setActionLoading(true);
    try {
      const previewResponse = await apiFetch('/api/admin/production-user-reset/preview');
      const preview = await previewResponse.json();
      if (!previewResponse.ok) {
        alert(preview?.error ?? 'Production reset preview is unavailable.');
        return;
      }
      const phrase = String(preview.confirmation);
      const accepted = confirm(
        `PUBLISHED PRODUCTION ONLY\n\nThis will delete ${preview.users} accounts, ${preview.organizations} organizations, ${preview.sessions} sessions, and ${preview.directlyOwnedRows} directly owned rows across ${Object.keys(preview.tables ?? {}).length} tables.\n\nShared catalogs, system configuration, and audit infrastructure are preserved. This cannot be undone.\n\nContinue to typed confirmation?`,
      );
      if (!accepted) return;
      if (prompt(`Type exactly:\n${phrase}`) !== phrase) return;
      const response = await apiFetch('/api/admin/production-user-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: phrase }),
      });
      const result = await response.json();
      if (!response.ok) {
        alert(result?.error ?? 'Production reset failed.');
        return;
      }
      alert(`${result.message}\n\nAccounts deleted: ${result.usersDeleted}\nOrganizations deleted: ${result.organizationsDeleted}`);
      window.location.assign('/');
    } catch {
      alert('Production reset failed.');
    } finally {
      setActionLoading(false);
    }
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

  if (authLoading || planLoading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-amber-400" /></div>;
  }
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

  const tabs: { key: AdminTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }[] = [
    { key: 'analytics', label: 'ANALYTICS', icon: BarChart3 },
    { key: 'pulse', label: 'WORLD PULSE', icon: Activity },
    { key: 'construction', label: 'CONSTRUCTION', icon: HardHat },
    { key: 'alpha', label: 'ALPHA APPS', icon: UserPlus, badge: alphaPending },
    { key: 'users', label: 'USERS', icon: Users },
    { key: 'orgs', label: 'BUSINESSES', icon: Building2 },
    { key: 'toggles', label: 'ACCESS & FLAGS', icon: ToggleLeft },
    { key: 'config', label: 'SYSTEM CONFIG', icon: Settings },
    { key: 'broadcast', label: 'BROADCAST', icon: Megaphone },
    { key: 'reports', label: 'REPORTS', icon: MessageSquareWarning },
    { key: 'bans', label: 'BANS', icon: AlertTriangle },
    { key: 'audit', label: 'AUDIT LOG', icon: ScrollText },
    { key: 'security', label: 'EMAIL SECURITY', icon: ShieldAlert },
    { key: 'phones', label: 'PHONE NUMBERS', icon: Phone },
    { key: 'costs', label: 'COSTS & SERVERS', icon: DollarSign },
    { key: 'status', label: 'CONNECTION STATUS', icon: Wifi },
    { key: 'salaryqual', label: 'SALARY QUALS', icon: Wallet, badge: salaryQuals.length || undefined },
    { key: 'credit', label: 'CREDIT REVIEW', icon: CreditCard, badge: creditReviews.filter((row) => row.status === 'pending').length || undefined },
    { key: 'citizenship', label: 'CITIZENSHIP', icon: Flag, badge: citizenshipApps.length || undefined },
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
              {tab.label}{tab.badge && tab.badge > 0 ? ` (${tab.badge})` : ''}
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
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-amber-500/30 border border-amber-400/40 text-amber-200 text-[9px] font-bold tracking-normal">
                {tab.badge > 99 ? '99+' : tab.badge}
              </span>
            )}
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
                <div className="mt-4 pt-4 border-t border-red-900/40">
                  <p className="text-[11px] text-zinc-500 mb-3">
                    <span className="text-red-300 font-mono">FULL FRESH START</span> — wipes ALL game progress <em>and deletes every org</em> for the entire player base (admins included). Logins, subscriptions/billing, and the world catalog are kept. Everyone replays onboarding from the very beginning.
                  </p>
                  <button
                    onClick={() => handleBulkReset('world')}
                    disabled={actionLoading}
                    className="px-3 py-2 text-[10px] font-mono tracking-widest uppercase rounded-md bg-red-700/80 hover:bg-red-600/90 border border-red-500/70 text-white disabled:opacity-40"
                  >
                    ⚠ RESET EVERYONE TO THE BEGINNING
                  </button>
                </div>
                <div className="mt-4 pt-4 border-t border-black">
                  <p className="text-[11px] text-black mb-3">
                    <span className="font-mono font-bold">PUBLISHED PRODUCTION RESET</span> — previews and then removes all accounts, sessions, organizations, and app data tied to users or organizations. Shared catalogs, system configuration, and audit infrastructure remain.
                  </p>
                  <button
                    onClick={handleProductionUserReset}
                    disabled={actionLoading}
                    className="px-4 py-2 text-[10px] font-mono font-bold tracking-widest uppercase rounded-md bg-[#fffaf0] border-2 border-black text-black disabled:opacity-40"
                  >
                    PREVIEW & RESET ALL PRODUCTION USER DATA
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

          {activeTab === 'pulse' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                  <h3 className="text-xs font-mono tracking-widest uppercase text-emerald-300">LIVE WORLD TELEMETRY</h3>
                  {telemetry && (
                    <span className="text-[10px] font-mono text-zinc-600">updated {new Date(telemetry.generatedAt).toLocaleTimeString()}</span>
                  )}
                </div>
                <button
                  onClick={loadTelemetry}
                  disabled={telemetryLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono tracking-widest uppercase rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-zinc-300 disabled:opacity-40"
                >
                  <RefreshCw className={`w-3 h-3 ${telemetryLoading ? 'animate-spin' : ''}`} /> REFRESH
                </button>
              </div>

              {!telemetry ? (
                <div className="flex justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatCard label="ONLINE NOW" value={telemetry.playersOnlineNow} color="emerald" icon={Activity} />
                    <StatCard label="ACTIVE 24H" value={telemetry.playersActive24h} color="sky" icon={TrendingUp} />
                    <StatCard label="TOTAL PLAYERS" value={telemetry.totalPlayers} color="cyan" icon={Gamepad2} />
                    <StatCard label="VERIFIED BIZ" value={telemetry.verifiedBusinesses} color="violet" icon={Briefcase} />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatCard label="BUILDINGS" value={telemetry.buildings.total} color="sky" icon={Building2} />
                    <StatCard label="OCCUPIED" value={telemetry.buildings.occupied} color="emerald" icon={Building2} />
                    <StatCard label="DEMOLISHED" value={telemetry.buildings.demolished} color={telemetry.buildings.demolished > 0 ? 'red' : 'emerald'} icon={AlertTriangle} />
                    <StatCard label="REAL BUSINESSES" value={telemetry.businessesByType.find(b => b.type === 'real')?.count ?? 0} color="amber" icon={Building2} />
                  </div>

                  <div className="bg-card border border-border rounded-xl p-5">
                    <h3 className="text-xs font-mono tracking-widest uppercase text-zinc-400 mb-4 flex items-center gap-2">
                      <Coins className="w-3.5 h-3.5 text-amber-400" /> ECONOMY — TOTAL HELD
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {telemetry.economy.map(e => (
                        <div key={e.currency} className="bg-muted/20 rounded-lg p-3 text-center">
                          <p className="text-[10px] text-zinc-500 font-mono uppercase mb-1">{e.currency}</p>
                          <p className="text-lg font-bold text-foreground">{e.total.toLocaleString()}</p>
                        </div>
                      ))}
                      {telemetry.economy.length === 0 && <p className="text-xs text-zinc-600 col-span-4">No bank activity yet</p>}
                    </div>
                  </div>

                  <div className="bg-card border border-border rounded-xl p-5">
                    <h3 className="text-xs font-mono tracking-widest uppercase text-zinc-400 mb-4">BUSINESSES BY TYPE</h3>
                    <div className="grid grid-cols-3 gap-3">
                      {telemetry.businessesByType.map(b => (
                        <div key={b.type} className="bg-muted/20 rounded-lg p-3 text-center">
                          <p className="text-[10px] text-zinc-500 font-mono uppercase mb-1">{b.type}</p>
                          <p className="text-lg font-bold text-foreground">{b.count}</p>
                        </div>
                      ))}
                      {telemetry.businessesByType.length === 0 && <p className="text-xs text-zinc-600 col-span-3">No registered businesses yet</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="bg-card border border-border rounded-xl p-5">
                      <h3 className="text-xs font-mono tracking-widest uppercase text-zinc-400 mb-4 flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-sky-400" /> BUSIEST ZONES
                      </h3>
                      <div className="space-y-2">
                        {telemetry.topZones.map((z, i) => (
                          <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/10">
                            <span className="text-[10px] font-mono text-amber-400 w-5">#{i + 1}</span>
                            <span className="text-sm text-foreground flex-1 truncate">{z.zone}</span>
                            <span className="text-[10px] font-mono text-sky-400">{z.count} {z.count === 1 ? 'player' : 'players'}</span>
                          </div>
                        ))}
                        {telemetry.topZones.length === 0 && <p className="text-xs text-zinc-600">No players yet</p>}
                      </div>
                    </div>

                    <div className="bg-card border border-border rounded-xl p-5">
                      <h3 className="text-xs font-mono tracking-widest uppercase text-zinc-400 mb-4">RECENTLY ACTIVE</h3>
                      <div className="space-y-2">
                        {telemetry.recentlyActive.map((p, i) => (
                          <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/10">
                            <span className="text-sm text-foreground flex-1 truncate">{p.charName}</span>
                            <span className="text-[10px] font-mono text-zinc-500 truncate max-w-[110px]">{p.lastZone ?? '\u2014'}</span>
                            <span className="text-[10px] font-mono text-sky-400">LVL {p.level}</span>
                          </div>
                        ))}
                        {telemetry.recentlyActive.length === 0 && <p className="text-xs text-zinc-600">No players yet</p>}
                      </div>
                    </div>
                  </div>

                  <div className="bg-card border border-border rounded-xl p-5">
                    <h3 className="text-xs font-mono tracking-widest uppercase text-zinc-400 mb-4">RECENT ECONOMY ACTIVITY</h3>
                    <div className="space-y-1.5">
                      {telemetry.recentTransactions.map((t, i) => (
                        <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/10 text-xs">
                          <span className="text-foreground truncate max-w-[120px]">{t.playerName}</span>
                          <span className="text-zinc-500 flex-1 truncate">{t.description}</span>
                          <span className={`font-mono ${t.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {t.amount >= 0 ? '+' : ''}{t.amount.toLocaleString()}
                          </span>
                        </div>
                      ))}
                      {telemetry.recentTransactions.length === 0 && <p className="text-xs text-zinc-600">No transactions yet</p>}
                    </div>
                  </div>

                  {telemetry.activeSeason && (
                    <div className="bg-card border border-violet-500/20 rounded-xl p-5">
                      <h3 className="text-xs font-mono tracking-widest uppercase text-violet-300 mb-1">ACTIVE SEASON</h3>
                      <p className="text-sm text-foreground">S{telemetry.activeSeason.number} · {telemetry.activeSeason.name}</p>
                      <p className="text-[11px] text-zinc-500 mt-1">Ends {new Date(telemetry.activeSeason.endsAt).toLocaleDateString()}</p>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}

          {activeTab === 'construction' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <AdminConstructionOverview />
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
                        {resolveAvatarUrl(u.profileImageUrl) ? (
                          <img src={resolveAvatarUrl(u.profileImageUrl)} alt="" className="w-6 h-6 rounded-md object-cover shrink-0" />
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
                      {resolveAvatarUrl(selectedUser.user.profileImageUrl) ? (
                        <img src={resolveAvatarUrl(selectedUser.user.profileImageUrl)} alt="" className="w-12 h-12 rounded-xl object-cover" />
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
                        const val = configMap.get(toggle.key) ?? String(toggle.defaultOn);
                        const isOn = val === 'true';
                        return (
                          <div key={toggle.key} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/10">
                            <div>
                              <p className="text-sm font-bold text-foreground">{toggle.label}</p>
                              <p className="text-[10px] text-zinc-500">{toggle.desc}</p>
                            </div>
                            <button
                              onClick={() => handleToggleConfig(toggle.key, val)}
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
                        {resolveAvatarUrl(user?.profileImageUrl) && <img src={resolveAvatarUrl(user?.profileImageUrl)} className="w-6 h-6 rounded-full" alt="" />}
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

          {activeTab === 'phones' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="bg-card border border-amber-900/40 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-1">
                  <Phone className="w-4 h-4 text-amber-400" />
                  <h3 className="text-xs font-mono tracking-widest uppercase text-amber-300">PHONE NUMBER INVENTORY</h3>
                  <button
                    onClick={loadPhoneInventory}
                    disabled={phoneLoading}
                    className="ml-auto p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/5 disabled:opacity-40"
                    data-testid="phone-inventory-refresh"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${phoneLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <p className="text-[11px] text-zinc-500">
                  Numbers shown here come from the platform Twilio account. Assigning a number wires Twilio's voice + SMS webhooks to this app and links the number to the chosen user. Unassigning clears the webhooks.
                </p>
                {phoneError && (
                  <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-red-300 text-xs font-mono">{phoneError}</div>
                )}
                <div className="mt-3">
                  <label className="block text-[10px] font-mono tracking-widest uppercase text-zinc-500 mb-1">USER SEARCH (FOR ASSIGNMENT)</label>
                  <div className="flex items-center gap-2">
                    <Search className="w-3.5 h-3.5 text-zinc-500" />
                    <input
                      value={phoneUserSearch}
                      onChange={e => setPhoneUserSearch(e.target.value)}
                      placeholder="email, first name, or last name…"
                      className="flex-1 bg-muted/30 border border-border rounded px-2 py-1.5 text-xs text-foreground"
                      data-testid="phone-user-search"
                    />
                    {phoneUserSearching && <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-500" />}
                  </div>
                  <p className="text-[10px] text-zinc-600 mt-1">
                    {phoneUserSearch.trim()
                      ? `${phoneUserResults.length} match(es) — picker dropdowns below show search results`
                      : `Empty search shows the first ${users.length} users loaded with the panel.`}
                  </p>
                </div>
              </div>

              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="grid grid-cols-[1.4fr_1fr_1.6fr_120px] gap-3 px-4 py-2.5 border-b border-border bg-muted/10 text-[10px] font-mono tracking-widest uppercase text-zinc-500">
                  <span>NUMBER</span>
                  <span>CAPABILITIES</span>
                  <span>ASSIGNED TO / ASSIGN</span>
                  <span></span>
                </div>
                {phoneLoading && phoneInventory.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-zinc-600">Loading Twilio inventory…</div>
                ) : phoneInventory.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-zinc-600">No Twilio numbers found on this account.</div>
                ) : phoneInventory.map(n => {
                  const draft = phoneAssignDraft[n.sid] ?? { userId: '', label: '', orgId: '' };
                  const busy = phoneBusySid === n.sid;
                  const caps = n.capabilities ?? {};
                  const capLabels = ['voice', 'SMS', 'MMS', 'fax']
                    .filter(c => caps[c.toLowerCase()] || caps[c])
                    .map(c => c.toUpperCase());
                  const orgBusy = n.assignedTo ? phoneOrgBusyId === n.assignedTo.phoneNumberId : false;
                  return (
                    <div key={n.sid} className="grid grid-cols-[1.4fr_1fr_1.6fr_120px] gap-3 px-4 py-3 border-b border-border/50 hover:bg-white/[0.02] items-center">
                      <div className="min-w-0">
                        <p className="text-sm text-foreground font-mono">{n.number}</p>
                        <p className="text-[10px] text-zinc-500 truncate">{n.friendlyName || n.sid}</p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {capLabels.length === 0 ? (
                          <span className="text-[10px] text-zinc-600 font-mono">—</span>
                        ) : capLabels.map(c => (
                          <span key={c} className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-500/10 border border-amber-500/20 text-amber-300">{c}</span>
                        ))}
                      </div>
                      {n.assignedTo ? (
                        <div className="min-w-0 space-y-1">
                          <p className="text-sm text-emerald-300 truncate">{n.assignedTo.email ?? n.assignedTo.userId}</p>
                          <p className="text-[10px] text-zinc-500 truncate">
                            label: {n.assignedTo.label ?? 'main'} · since {new Date(n.assignedTo.assignedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </p>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-mono tracking-widest uppercase text-zinc-500">ORG POOL</span>
                            <select
                              value={n.assignedTo.orgId ?? ''}
                              onChange={e => handleSetPhoneOrg(n.assignedTo!.phoneNumberId, e.target.value)}
                              disabled={orgBusy}
                              className="flex-1 bg-muted/30 border border-border rounded px-2 py-1 text-[11px] text-foreground disabled:opacity-40"
                              data-testid={`phone-org-${n.sid}`}
                            >
                              <option value="">— None —</option>
                              {phoneOrgs.map(o => (
                                <option key={o.id} value={o.id} className="bg-zinc-900">{o.name}</option>
                              ))}
                            </select>
                            {orgBusy && <Loader2 className="w-3 h-3 animate-spin text-zinc-500" />}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          <select
                            value={draft.userId}
                            onChange={e => setPhoneAssignDraft(prev => ({ ...prev, [n.sid]: { ...draft, userId: e.target.value } }))}
                            className="bg-muted/30 border border-border rounded px-2 py-1.5 text-xs text-foreground"
                            data-testid={`phone-assign-user-${n.sid}`}
                          >
                            <option value="">— Pick user —</option>
                            {(phoneUserSearch.trim() ? phoneUserResults : users).map(u => (
                              <option key={u.id} value={u.id} className="bg-zinc-900">
                                {u.email ?? u.id}
                              </option>
                            ))}
                          </select>
                          <select
                            value={draft.orgId}
                            onChange={e => setPhoneAssignDraft(prev => ({ ...prev, [n.sid]: { ...draft, orgId: e.target.value } }))}
                            className="bg-muted/30 border border-border rounded px-2 py-1.5 text-[11px] text-foreground"
                            data-testid={`phone-assign-org-${n.sid}`}
                          >
                            <option value="">Org pool (optional) — none</option>
                            {phoneOrgs.map(o => (
                              <option key={o.id} value={o.id} className="bg-zinc-900">{o.name}</option>
                            ))}
                          </select>
                          <input
                            value={draft.label}
                            onChange={e => setPhoneAssignDraft(prev => ({ ...prev, [n.sid]: { ...draft, label: e.target.value } }))}
                            placeholder="Label (optional, e.g. 'work')"
                            className="bg-muted/30 border border-border rounded px-2 py-1.5 text-[11px] text-foreground"
                          />
                        </div>
                      )}
                      <div className="flex justify-end">
                        {n.assignedTo ? (
                          <button
                            onClick={() => handleUnassignPhone(n.assignedTo!.phoneNumberId, n.sid)}
                            disabled={busy}
                            className="px-3 py-1.5 rounded text-[10px] font-mono uppercase tracking-widest bg-red-500/10 text-red-300 border border-red-500/25 hover:bg-red-500/20 disabled:opacity-40"
                            data-testid={`phone-unassign-${n.sid}`}
                          >
                            {busy ? '…' : 'RELEASE'}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleAssignPhone(n.sid)}
                            disabled={!draft.userId || busy}
                            className="px-3 py-1.5 rounded text-[10px] font-mono uppercase tracking-widest bg-emerald-500/10 text-emerald-300 border border-emerald-500/25 hover:bg-emerald-500/20 disabled:opacity-40"
                            data-testid={`phone-assign-${n.sid}`}
                          >
                            {busy ? '…' : 'ASSIGN'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {phoneOrphans.length > 0 && (
                <div className="bg-card border border-amber-900/40 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-border bg-amber-500/5 text-[10px] font-mono tracking-widest uppercase text-amber-300">
                    ORPHANED ASSIGNMENTS ({phoneOrphans.length}) — DB rows whose number is no longer on the Twilio account
                  </div>
                  {phoneOrphans.map(o => (
                    <div key={o.phoneNumberId} className="grid grid-cols-[1.4fr_2fr_120px] gap-3 px-4 py-3 border-b border-border/50 items-center">
                      <span className="text-sm text-foreground font-mono">{o.number}</span>
                      <span className="text-[11px] text-zinc-500 truncate">{o.user?.email ?? o.user?.id ?? '—'}</span>
                      <div className="flex justify-end">
                        <button
                          onClick={() => handleUnassignPhone(o.phoneNumberId, o.twilioSid)}
                          disabled={phoneBusySid === (o.twilioSid ?? `db-${o.phoneNumberId}`)}
                          className="px-3 py-1.5 rounded text-[10px] font-mono uppercase tracking-widest bg-red-500/10 text-red-300 border border-red-500/25 hover:bg-red-500/20 disabled:opacity-40"
                        >
                          DELETE
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'costs' && (
            <CostsTab />
          )}

          {activeTab === 'status' && (
            <ConnectionStatusPanel />
          )}

          {activeTab === 'salaryqual' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold tracking-wide flex items-center gap-2">
                    <Wallet className="w-4 h-4" /> SALARY QUALIFICATIONS
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Manually verify a player's declared real-world salary. Approving flips income
                    verification on, so they start earning ƒ{' '}
                    <span className="font-mono">(monthly ÷ 720)</span> per real-world hour into their bank.
                  </p>
                </div>
                <button
                  onClick={() => void loadSalaryQuals()}
                  className="text-xs px-2 py-1 rounded border border-border hover:bg-accent flex items-center gap-1 shrink-0"
                >
                  <RotateCcw className="w-3 h-3" /> REFRESH
                </button>
              </div>

              {salaryQualsLoading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : salaryQuals.length === 0 ? (
                <p className="text-xs text-muted-foreground">No pending salary qualifications.</p>
              ) : (
                <div className="space-y-2">
                  {salaryQuals.map((q) => (
                    <div key={q.id} className="border border-border rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-bold text-sm">{q.playerName}</div>
                        <div className="text-xs text-muted-foreground">
                          {q.companyName ?? '—'}{q.industry ? ` · ${q.industry}` : ''}
                          {q.contactEmail ? ` · ${q.contactEmail}` : ''}
                        </div>
                        <div className="text-xs mt-1">
                          <span className="font-mono text-emerald-500">
                            ${(q.declaredMonthlyIncome ?? 0).toLocaleString()}/mo
                          </span>
                          <span className="text-muted-foreground">
                            {' '}→ ƒ{Math.floor((q.declaredMonthlyIncome ?? 0) / 720).toLocaleString()}/hr
                          </span>
                          {q.payrollProvider && q.payrollProvider !== 'NONE' && (
                            <span className="text-muted-foreground"> · payroll: {q.payrollProvider}</span>
                          )}
                          {q.pendingOwnerVerification && (
                            <span className="ml-2 text-amber-500">PENDING OWNER</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          disabled={salaryQualBusyId === q.id}
                          onClick={() => void decideSalaryQual(q.id, true)}
                          className="text-xs px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" /> APPROVE
                        </button>
                        <button
                          disabled={salaryQualBusyId === q.id}
                          onClick={() => void decideSalaryQual(q.id, false)}
                          className="text-xs px-3 py-1.5 rounded border border-border hover:bg-accent disabled:opacity-50 flex items-center gap-1"
                        >
                          <X className="w-3 h-3" /> REJECT
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'credit' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold tracking-wide flex items-center gap-2">
                    <CreditCard className="w-4 h-4" /> CREDIT APPLICATION REVIEW
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Every loan, credit-line, and funding-grant request requires a human decision. APR cannot be set below 15%; funding is a separate Fiat-only action.
                  </p>
                </div>
                <button onClick={() => void loadCreditReviews()} className="text-xs px-2 py-1 rounded border border-border hover:bg-accent flex items-center gap-1">
                  <RotateCcw className="w-3 h-3" /> REFRESH
                </button>
              </div>
              {creditReviewsLoading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : creditReviews.length === 0 ? (
                <p className="text-xs text-muted-foreground">No credit applications.</p>
              ) : (
                <div className="space-y-3">
                  {creditReviews.map((row) => (
                    <div key={row.id} className="border border-border rounded-lg p-4 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-bold text-sm">#{row.id} · {row.product.replace('_', ' ').toUpperCase()} · ƒ{row.requestedFiat.toLocaleString()}</div>
                          <div className="text-xs text-muted-foreground mt-1">Applicant {row.applicantUserId}{row.orgId ? ` · Org #${row.orgId}` : ' · Individual'}</div>
                        </div>
                        <span className={`text-xs font-mono ${row.status === 'funded' ? 'text-emerald-500' : row.status === 'declined' ? 'text-rose-500' : 'text-amber-500'}`}>{row.status.toUpperCase()}</span>
                      </div>
                      <p className="text-xs text-foreground/80 whitespace-pre-wrap">{row.purpose}</p>
                      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
                        <div><span className="text-muted-foreground">Credit</span><div className="font-mono">{row.applicantScore}</div></div>
                        <div><span className="text-muted-foreground">Org score</span><div className="font-mono">{row.orgScore ?? '—'}</div></div>
                        <div><span className="text-muted-foreground">Org age</span><div className="font-mono">{row.orgAgeDays == null ? '—' : `${row.orgAgeDays}d`}</div></div>
                        <div><span className="text-muted-foreground">Income</span><div className="font-mono">ƒ{row.monthlyIncomeFiat.toLocaleString()}/mo</div></div>
                        <div><span className="text-muted-foreground">Usage</span><div className="font-mono">{row.consistencyScore}/100</div></div>
                        <div><span className="text-muted-foreground">APR</span><div className="font-mono">{(row.aprBps / 100).toFixed(2)}%</div></div>
                      </div>
                      {row.usage.length > 0 && (
                        <div className="rounded border border-border/60 bg-muted/20 p-2 text-[10px] font-mono text-muted-foreground">
                          {row.usage.slice(0, 5).map((event) => (
                            <div key={event.id}>{new Date(event.createdAt).toLocaleString()} · {event.eventType.toUpperCase()} {event.amountFiat ? `· ƒ${event.amountFiat.toLocaleString()}` : ''}</div>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {row.status === 'pending' && (
                          <>
                            <button disabled={creditReviewBusyId === row.id} onClick={() => void decideCredit(row, 'approved')} className="text-xs px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50">APPROVE TERMS</button>
                            <button disabled={creditReviewBusyId === row.id} onClick={() => void decideCredit(row, 'declined')} className="text-xs px-3 py-1.5 rounded border border-border hover:bg-accent disabled:opacity-50">DECLINE</button>
                          </>
                        )}
                        {row.status === 'approved' && (
                          <button disabled={creditReviewBusyId === row.id} onClick={() => void fundCredit(row)} className="text-xs px-3 py-1.5 rounded bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-50">FUND FIAT NOW</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'citizenship' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold tracking-wide flex items-center gap-2">
                    <Flag className="w-4 h-4" /> CITIZENSHIP APPLICATIONS
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Players who have met the visa residency + profitable-business criteria and applied for full citizenship.
                    Approving flips their status to <span className="font-mono">citizen</span>.
                  </p>
                </div>
                <button
                  onClick={() => void loadCitizenshipApps()}
                  className="text-xs px-2 py-1 rounded border border-border hover:bg-accent flex items-center gap-1 shrink-0"
                >
                  <RotateCcw className="w-3 h-3" /> REFRESH
                </button>
              </div>

              {citizenshipLoading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : citizenshipApps.length === 0 ? (
                <p className="text-xs text-muted-foreground">No pending citizenship applications.</p>
              ) : (
                <div className="space-y-2">
                  {citizenshipApps.map((app) => (
                    <div key={app.id} className="border border-border rounded-xl p-4 flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold truncate">
                          {app.first_name || app.last_name
                            ? `${app.first_name ?? ''} ${app.last_name ?? ''}`.trim()
                            : app.email ?? app.user_id}
                        </p>
                        {app.email && (
                          <p className="text-[10px] text-muted-foreground font-mono truncate">{app.email}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          City: <span className="font-mono text-amber-400">{app.city_id.toUpperCase()}</span>
                          {' · '}Applied {new Date(app.updated_at).toLocaleDateString()}
                          {' · '}Visa since {new Date(app.granted_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          disabled={citizenshipBusyId === app.id}
                          onClick={() => void decideCitizenship(app, 'approve')}
                          className="text-xs px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" /> GRANT
                        </button>
                        <button
                          disabled={citizenshipBusyId === app.id}
                          onClick={() => void decideCitizenship(app, 'deny')}
                          className="text-xs px-3 py-1.5 rounded border border-border hover:bg-accent disabled:opacity-50 flex items-center gap-1"
                        >
                          <X className="w-3 h-3" /> DENY
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Executive Costs & Servers ────────────────────────────────────────────────
// Picasso-only view: which realm this deployment is hosting (region/city/cap vs
// live players) and per-user estimated infra cost for the billing period.

interface CostUserRow {
  userId: string;
  email: string | null;
  name: string | null;
  usage: Record<string, number>;
  costUsd: number;
}
interface CostsResponse {
  period: string;
  rates: Record<string, number>;
  kinds: string[];
  users: CostUserRow[];
  totalsByKind: Record<string, { count: number; costUsd: number }>;
  grandTotalUsd: number;
  userCount: number;
}
interface ServersResponse {
  realm: { cityId: string; region: string; maxPlayers: number; online: number; utilization: number };
}

const KIND_LABELS: Record<string, string> = {
  voice_minutes: 'VOICE MIN',
  ai_messages: 'AI MSGS',
  sms_count: 'SMS',
};

function CostsTab() {
  const [costs, setCosts] = useState<CostsResponse | null>(null);
  const [servers, setServers] = useState<ServersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cRes, sRes] = await Promise.all([
        apiFetch('/api/admin/costs'),
        apiFetch('/api/admin/servers'),
      ]);
      if (!cRes.ok) throw new Error(`costs ${cRes.status}`);
      if (!sRes.ok) throw new Error(`servers ${sRes.status}`);
      setCosts(await cRes.json());
      setServers(await sRes.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const realm = servers?.realm;
  const kinds = costs?.kinds ?? ['voice_minutes', 'ai_messages', 'sms_count'];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* Realm / server status */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Server className="w-4 h-4 text-sky-400" />
          <h3 className="text-xs font-mono tracking-widest uppercase text-sky-300">REALM STATUS (THIS DEPLOYMENT)</h3>
          <button
            onClick={load}
            disabled={loading}
            className="ml-auto p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/5 disabled:opacity-40"
            data-testid="costs-refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {realm ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="REGION" value={realm.region} color="sky" icon={Globe} />
            <StatCard label="CITY (REALM)" value={realm.cityId.replace(/_/g, ' ').toUpperCase()} color="violet" icon={MapPin} />
            <StatCard label="ONLINE / CAP" value={`${realm.online} / ${realm.maxPlayers}`} color={realm.utilization >= 90 ? 'red' : 'emerald'} icon={Users} />
            <StatCard label="UTILIZATION" value={`${realm.utilization}%`} color={realm.utilization >= 90 ? 'red' : 'amber'} icon={Activity} />
          </div>
        ) : (
          <p className="text-[11px] text-zinc-500">{loading ? 'Loading realm status…' : 'No realm data.'}</p>
        )}
        <p className="text-[10px] text-zinc-600 mt-3">
          Each realm runs the same game on its own always-on server. NA = MINX CITY, Asia = HUDA CITY.
          Open this admin on each realm's domain to see that realm's live population.
        </p>
      </div>

      {/* Per-user cost breakdown */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <DollarSign className="w-4 h-4 text-emerald-400" />
          <h3 className="text-xs font-mono tracking-widest uppercase text-emerald-300">PER-USER COST (ESTIMATE)</h3>
          {costs && (
            <span className="ml-auto text-[11px] font-mono text-zinc-500">PERIOD {costs.period}</span>
          )}
        </div>
        <p className="text-[10px] text-zinc-600 mb-3">
          Estimated USD draw on real infra (Twilio voice/SMS + AI). Rates:{' '}
          {kinds.map(k => `${KIND_LABELS[k] ?? k} $${costs?.rates?.[k] ?? '—'}`).join(' · ')}.
        </p>

        {error && (
          <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-red-300 text-xs font-mono">{error}</div>
        )}

        {costs && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <StatCard label="GRAND TOTAL" value={`$${costs.grandTotalUsd.toFixed(2)}`} color="emerald" icon={Coins} />
            <StatCard label="USERS WITH USAGE" value={costs.userCount} color="sky" icon={Users} />
            {kinds.slice(0, 2).map(k => (
              <StatCard
                key={k}
                label={`${KIND_LABELS[k] ?? k} ($)`}
                value={`$${(costs.totalsByKind?.[k]?.costUsd ?? 0).toFixed(2)}`}
                color="violet"
                icon={DollarSign}
              />
            ))}
          </div>
        )}

        <div className="border border-border rounded-lg overflow-hidden">
          <div
            className="grid gap-3 px-4 py-2.5 border-b border-border bg-muted/10 text-[10px] font-mono tracking-widest uppercase text-zinc-500"
            style={{ gridTemplateColumns: `2fr repeat(${kinds.length}, 1fr) 1fr` }}
          >
            <span>USER</span>
            {kinds.map(k => <span key={k} className="text-right">{KIND_LABELS[k] ?? k}</span>)}
            <span className="text-right">COST</span>
          </div>
          {loading && !costs ? (
            <div className="px-4 py-8 text-center text-sm text-zinc-600">Loading cost data…</div>
          ) : !costs || costs.users.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-zinc-600">No metered usage this period.</div>
          ) : (
            costs.users.map(u => (
              <div
                key={u.userId}
                className="grid gap-3 px-4 py-2.5 border-b border-border/50 items-center text-xs"
                style={{ gridTemplateColumns: `2fr repeat(${kinds.length}, 1fr) 1fr` }}
              >
                <span className="text-foreground truncate" title={u.email ?? u.userId}>
                  {u.name || u.email || u.userId}
                </span>
                {kinds.map(k => (
                  <span key={k} className="text-right font-mono text-zinc-400">{u.usage[k] ?? 0}</span>
                ))}
                <span className="text-right font-mono text-emerald-300">${u.costUsd.toFixed(2)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Platform Connection Status ────────────────────────────────────────────────
// Owner-only dashboard: live probe results for every external integration.
// Auto-refreshes every 30s while the tab is active. Manual re-check button
// busts the server cache and re-runs all probes immediately.

type ProbeStatus = 'PASS' | 'WARN' | 'FAIL';

interface ProbeResult {
  name: string;
  status: ProbeStatus;
  detail: string;
  latencyMs: number;
  checkedAt: string;
}

interface ConnectionTransition {
  name: string;
  to: 'healthy' | 'broken';
  at: number;
  detail: string | null;
}

interface ConnectionMonitor {
  lastCheckedAt: string | null;
  history: ConnectionTransition[];
}

interface ConnectionStatusResponse {
  results: ProbeResult[];
  overall: ProbeStatus;
  failCount: number;
  warnCount: number;
  checkedAt: string;
  cached: boolean;
  monitor?: ConnectionMonitor;
}

function StatusBadge({ status }: { status: ProbeStatus }) {
  if (status === 'PASS') {
    return (
      <span className="flex items-center gap-1 text-emerald-400">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span className="text-[10px] font-mono tracking-widest">PASS</span>
      </span>
    );
  }
  if (status === 'WARN') {
    return (
      <span className="flex items-center gap-1 text-amber-400">
        <AlertCircle className="w-3.5 h-3.5" />
        <span className="text-[10px] font-mono tracking-widest">WARN</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-red-400">
      <XCircle className="w-3.5 h-3.5" />
      <span className="text-[10px] font-mono tracking-widest">FAIL</span>
    </span>
  );
}

function ConnectionStatusPanel() {
  const [data, setData] = useState<ConnectionStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const endpoint = force
        ? '/api/admin/connections/status/refresh'
        : '/api/admin/connections/status';
      const res = await apiFetch(endpoint, { method: force ? 'POST' : 'GET' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json: ConnectionStatusResponse = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e?.message || 'Failed to load connection status');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus(false);
    const interval = setInterval(() => fetchStatus(false), 30_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const overallColor =
    data?.overall === 'PASS' ? 'emerald' :
    data?.overall === 'WARN' ? 'amber' : 'red';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      <div className={`bg-card border rounded-xl p-5 border-${overallColor}-500/30`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg bg-${overallColor}-500/10 border border-${overallColor}-500/20 flex items-center justify-center`}>
              <Wifi className={`w-4 h-4 text-${overallColor}-400`} />
            </div>
            <div>
              <h3 className="text-xs font-mono tracking-widest uppercase text-zinc-300">Platform Connection Health</h3>
              {data && (
                <p className="text-[10px] text-zinc-500 mt-0.5">
                  {data.failCount === 0 && data.warnCount === 0
                    ? 'All systems nominal'
                    : `${data.failCount} failing · ${data.warnCount} degraded`}
                  {' · '}checked {new Date(data.checkedAt).toLocaleTimeString()}
                  {data.cached ? ' (cached)' : ''}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => fetchStatus(true)}
            disabled={loading || refreshing}
            className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-mono tracking-widest uppercase rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-zinc-300 disabled:opacity-40 cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
            RE-CHECK NOW
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/30 border border-red-800/40 rounded-xl p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {(loading && !data) ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/40" />
        </div>
      ) : data ? (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-[auto_1fr_auto_auto] gap-0 text-[10px] font-mono tracking-widest uppercase text-zinc-500 px-4 py-2.5 border-b border-border bg-muted/10">
            <span className="w-16">STATUS</span>
            <span>SERVICE</span>
            <span className="w-16 text-right">LATENCY</span>
            <span className="ml-6 hidden sm:block w-48 truncate">DETAIL</span>
          </div>
          {data.results.map((r) => (
            <div
              key={r.name}
              className="grid grid-cols-[auto_1fr_auto] sm:grid-cols-[auto_1fr_auto_auto] gap-0 px-4 py-3 border-b border-border/50 last:border-0 items-start sm:items-center"
            >
              <div className="w-16 pt-0.5">
                <StatusBadge status={r.status} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">{r.name}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5 sm:hidden">{r.detail}</p>
              </div>
              <div className="w-16 text-right text-[10px] font-mono text-zinc-500 tabular-nums pt-0.5">
                {r.latencyMs > 0 ? `${r.latencyMs}ms` : '—'}
              </div>
              <div className="ml-6 hidden sm:block w-48">
                <p className="text-[11px] text-zinc-400 truncate" title={r.detail}>{r.detail}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {data?.monitor && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border bg-muted/10">
            <span className="text-[10px] font-mono tracking-widest uppercase text-zinc-400">
              Transition History
            </span>
            <span className="text-[10px] font-mono text-zinc-500">
              {data.monitor.lastCheckedAt
                ? `monitor checked ${new Date(data.monitor.lastCheckedAt).toLocaleTimeString()}`
                : 'monitor warming up…'}
            </span>
          </div>
          {data.monitor.history.length === 0 ? (
            <p className="px-4 py-5 text-[11px] text-zinc-500">
              No connection transitions recorded yet. Confirmed up/down flips will appear here.
            </p>
          ) : (
            <div>
              {data.monitor.history.map((t, i) => (
                <div
                  key={`${t.name}-${t.at}-${i}`}
                  className="grid grid-cols-[auto_1fr_auto] gap-3 px-4 py-2.5 border-b border-border/50 last:border-0 items-start"
                >
                  <span className="w-16 pt-0.5">
                    {t.to === 'broken' ? (
                      <span className="flex items-center gap-1 text-red-400">
                        <XCircle className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-mono tracking-widest">DOWN</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-mono tracking-widest">UP</span>
                      </span>
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">{t.name}</p>
                    {t.detail && (
                      <p className="text-[10px] text-zinc-500 mt-0.5 break-words" title={t.detail}>
                        {t.detail}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500 tabular-nums pt-0.5 whitespace-nowrap">
                    {new Date(t.at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-muted/10 border border-border/50 rounded-xl p-4">
        <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest mb-1.5">Continuous & Scheduled Health Checks</p>
        <p className="text-xs text-zinc-400">
          A continuous in-server monitor re-probes every connection every few minutes and emails admins on confirmed outages (toggle with <code className="bg-white/[0.06] px-1 py-0.5 rounded text-amber-300 text-[10px]">CONN_HEALTH_MONITOR</code>). For an external "is the whole server up" check, also run <code className="bg-white/[0.06] px-1 py-0.5 rounded text-amber-300 text-[10px]">pnpm --filter @workspace/api-server run health:all</code> as a Replit Scheduled Deployment. See the script header for full setup instructions.
        </p>
      </div>
    </motion.div>
  );
}
