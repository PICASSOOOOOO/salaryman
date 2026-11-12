import { apiFetch } from '@/lib/api-client';
import { resolveAvatarUrl } from '@/lib/avatar';
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { User, Brain, Database, Trash2, Download, Save, Loader2, Check, AlertTriangle, Users, LogOut, Zap, CreditCard, Heart, Building2, DollarSign, Briefcase, Plug, Globe, SlidersHorizontal, FlaskConical, ChevronRight, Wrench, Laptop, Eye, EyeOff, Map, Network, ShieldCheck, ShoppingBag } from 'lucide-react';
import { LanguageSelector } from '@/components/LanguageSelector';
import { CurrencySelector } from '@/components/CurrencySelector';
import { useLocation, Link, Redirect } from 'wouter';

import { useBoomerMode } from '@/hooks/use-mobile';
import { usePlan } from '@/hooks/use-plan';
import { useAuth } from '@/hooks/use-auth';
import { SignInPage } from '@/components/SignInPrompt';
import { useTranslation } from 'react-i18next';
import GoogleLinkSection from '@/components/GoogleLinkSection';
import GithubLinkSection from '@/components/GithubLinkSection';
import DiscordLinkSection from '@/components/DiscordLinkSection';
import { ReferralPanel } from '@/components/ReferralPanel';
import { getActiveCityName, hydrateActiveCityFromSave } from '@/lib/city-defs';
import { AppInstallCard } from '@/components/AppInstallCard';

const AdminPanel = lazy(() => import("@/pages/AdminPanel"));

interface DonationRecord { id: number; amountCents: number; tier: string | null; status: string; createdAt: string; }
interface LaborHistoryEntry { id: string; source: 'task' | 'construction'; kind: string; orgId: string; orgName: string; payoff: number; createdAt: string; }
interface LaborHistory { history: LaborHistoryEntry[]; totalPayoff: number; count: number; }
const LABOR_KIND_LABEL: Record<string, string> = { ad: 'Ad Viewing', sponsor: 'Sponsor Click', label: 'Data Labelling', bug: 'Bug Report', feature: 'Feature Idea', build: 'World Build Task', construction: 'Construction Shift', service_listing: 'Service Gig' };
interface AccountData { user: { id: string; email?: string; firstName?: string; lastName?: string; profileImageUrl?: string; createdAt: string }; contactCount: number; memory: string; memoryUpdatedAt: string | null; pabloPrivacyMode: boolean; }
interface OrgAffiliation { membership: { orgId: number; userId: string; role: string; department: string | null; title: string | null; salary: string | null; joinedAt: string | null; }; organization: { id: number; name: string; industry: string | null; size: string | null; } | null; }
interface VisaRow { id: number; cityId: string; status: string; grantedAt: string; updatedAt: string; }
interface MiniProfile { id: string; playerName: string; avatarColor: string; }

function Panel({ title, icon: Icon, children, headerRight, className = '' }: { title: string; icon?: any; children: React.ReactNode; headerRight?: React.ReactNode; className?: string }) {
  return (
    <div className={`border border-black bg-[#fffaf0] flex flex-col ${className}`}>
      <div className="flex items-center justify-between border-b border-black px-3 py-2 bg-black/5">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-3.5 h-3.5 text-black" />}
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-black">{title}</h3>
        </div>
        {headerRight}
      </div>
      <div className="p-3 flex-1 flex flex-col">
        {children}
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, subtitle }: { icon: React.ComponentType<{ className?: string }>; title: string; subtitle?: string; }) {
  return (
    <div className="flex items-center gap-3 mb-6 border-b border-black pb-4">
      <div className="w-10 h-10 border border-black flex items-center justify-center shrink-0 bg-black/5">
        <Icon className="w-5 h-5 text-black" />
      </div>
      <div className="min-w-0">
        <h2 className="text-xl font-bold text-black uppercase tracking-tight">{title}</h2>
        {subtitle && <p className="text-[10px] font-mono text-black/60 uppercase tracking-widest">{subtitle}</p>}
      </div>
    </div>
  );
}

export function LaborRecordSection({ boomerMode }: { boomerMode: boolean }) {
  const [data, setData] = useState<LaborHistory | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/cf/labor-history')
      .then(r => r.ok ? r.json() : null)
      .then((j: LaborHistory | null) => { if (j) setData(j); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data || data.count === 0) return null;

  return (
    <Panel title={boomerMode ? 'Labor Record' : 'LABOR RECORD'} icon={Wrench}>
      <div className="flex gap-2 mb-3">
        <div className="flex-1 border border-black p-2 bg-black/5">
          <div className="text-[9px] font-mono text-black/60 uppercase">Shifts</div>
          <div className="font-bold text-sm text-black">{data.count}</div>
        </div>
        <div className="flex-1 border border-emerald-600 p-2 bg-emerald-600/10">
          <div className="text-[9px] font-mono text-emerald-700 uppercase">Total Payoff</div>
          <div className="font-bold text-sm text-emerald-700">ƒ{data.totalPayoff.toLocaleString()}</div>
        </div>
      </div>
      <div className="max-h-40 overflow-y-auto space-y-1 pr-1 scrollbar-hide">
        {data.history.map((entry) => {
          const kindLabel = LABOR_KIND_LABEL[entry.kind] ?? entry.kind.toUpperCase();
          const date = new Date(entry.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          return (
            <div key={entry.id} className="flex items-center justify-between text-[10px] font-mono border-b border-black/10 pb-1.5 pt-1">
              <div className="flex-1 min-w-0 pr-2">
                <div className="font-bold truncate text-black">{kindLabel}</div>
                <div className="text-black/50 truncate text-[9px]">{entry.orgName}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-emerald-700 font-bold tracking-wide">ƒ{entry.payoff.toLocaleString()}</div>
                <div className="text-black/40 text-[9px]">{date}</div>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function VisaCitizenshipSection() {
  const [visas, setVisas] = useState<VisaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/world/cities/my-visas')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setVisas(d.visas ?? []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const applyCitizenship = async (cityId: string) => {
    if (applying) return;
    setApplying(cityId); setMsg(null);
    try {
      const r = await apiFetch(`/api/world/cities/${cityId}/citizenship/apply`, { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg(j?.error ?? `Failed (${r.status})`);
      } else {
        setMsg(j.message ?? 'Application submitted.');
        setVisas(prev => prev.map(v => v.cityId === cityId ? { ...v, status: 'applicant' } : v));
      }
    } catch { setMsg('Request failed.'); }
    finally { setApplying(null); setTimeout(() => setMsg(null), 6000); }
  };

  if (loading || visas.length === 0) return null;

  const CITY_LABELS: Record<string, string> = { minx_city: 'MINX', huda_city: 'HUDA' };

  return (
    <Panel title="Visas & Citizenship" icon={Globe}>
      <div className="space-y-2">
        {visas.map(v => {
          const days = Math.floor((Date.now() - new Date(v.grantedAt).getTime()) / (1000 * 60 * 60 * 24));
          const canApply = v.status === 'visa';
          return (
            <div key={v.cityId} className="flex items-center justify-between border border-black p-2 text-[10px]">
              <div>
                <div className="font-bold font-mono text-black">{CITY_LABELS[v.cityId] ?? v.cityId.toUpperCase()}</div>
                <div className="text-black/50 font-mono mt-0.5">{days === 0 ? 'Active today' : `Active ${days}d`}</div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className={`px-1.5 border font-bold uppercase tracking-widest text-[9px] ${v.status === 'citizen' ? 'border-emerald-600 text-emerald-700 bg-emerald-600/10' : v.status === 'applicant' ? 'border-amber-500 text-amber-600 bg-amber-500/10' : 'border-black text-black bg-black/5'}`}>
                  {v.status}
                </span>
                {canApply && (
                  <button onClick={() => applyCitizenship(v.cityId)} disabled={applying === v.cityId}
                    className="underline text-emerald-700 hover:text-emerald-800 disabled:opacity-50 font-mono text-[9px]">
                    {applying === v.cityId ? 'Applying...' : 'Apply Citizenship'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {msg && <div className="text-[9px] font-mono text-emerald-700 mt-2">{msg}</div>}
      </div>
    </Panel>
  );
}

function CompanyAffiliationCard({ affiliation, boomerMode }: { affiliation: OrgAffiliation; boomerMode: boolean }) {
  const org = affiliation.organization;
  const m = affiliation.membership;
  const roleLabel = m.role === 'owner' ? 'ADMIN' : m.role === 'manager' ? 'MANAGER' : 'USER';
  const isElevated = m.role === 'owner' || m.role === 'manager';

  return (
    <div className="border border-black bg-[#fffaf0] p-3 text-black">
      <div className="flex items-center justify-between border-b border-black/20 pb-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
          <div className="font-bold text-xs uppercase truncate">{org?.name ?? 'UNKNOWN'}</div>
          {org?.industry && <div className="text-[10px] font-mono text-black/60 truncate">({org.industry})</div>}
        </div>
        <div className={`px-1.5 py-0.5 border text-[9px] font-bold tracking-widest shrink-0 ${isElevated ? 'border-emerald-600 text-emerald-700 bg-emerald-600/10' : 'border-black text-black bg-black/5'}`}>
          {roleLabel}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] font-mono">
        {m.title && (
          <div className="flex justify-between gap-2">
            <span className="text-black/50">TITLE</span>
            <span className="font-bold truncate text-right">{m.title}</span>
          </div>
        )}
        {m.department && (
          <div className="flex justify-between gap-2">
            <span className="text-black/50">DEPT</span>
            <span className="font-bold truncate text-right">{m.department}</span>
          </div>
        )}
        {m.salary && (
          <div className="flex justify-between gap-2">
            <span className="text-black/50">SALARY</span>
            <span className="font-bold text-emerald-700">${Number(m.salary).toLocaleString()}</span>
          </div>
        )}
        {m.joinedAt && (
          <div className="flex justify-between gap-2">
            <span className="text-black/50">JOINED</span>
            <span className="font-bold truncate">{new Date(m.joinedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function FinancialDashboard({ affiliations, boomerMode }: { affiliations: OrgAffiliation[]; boomerMode: boolean }) {
  const [financials, setFinancials] = useState<{ totalSalary: number; netWorth: number } | null>(null);

  useEffect(() => {
    apiFetch('/api/orgs/me/financials')
      .then(r => r.json())
      .then(d => setFinancials({ totalSalary: d.totalSalary ?? 0, netWorth: d.netWorth ?? 0 }))
      .catch(() => {});
  }, []);

  const totalSalary = financials?.totalSalary ?? affiliations.reduce((sum, a) => {
    return sum + (a.membership.salary ? Number(a.membership.salary) : 0);
  }, 0);
  const netWorth = financials?.netWorth ?? 0;
  const companiesWithSalary = affiliations.filter(a => a.membership.salary && Number(a.membership.salary) > 0);

  if (companiesWithSalary.length === 0 && affiliations.length === 0) return null;

  return (
    <Panel title={boomerMode ? 'Financial Summary' : 'Financial Dashboard'} icon={DollarSign}>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="border border-emerald-600 p-2 bg-emerald-600/5">
          <div className="text-[9px] text-emerald-700 font-mono tracking-widest uppercase mb-1">Salary</div>
          <div className="text-xs font-bold text-emerald-700 truncate">${totalSalary.toLocaleString()}</div>
        </div>
        <div className={`border p-2 ${netWorth >= 0 ? 'border-black bg-black/5' : 'border-red-600 bg-red-600/5'}`}>
          <div className={`text-[9px] font-mono tracking-widest uppercase mb-1 ${netWorth >= 0 ? 'text-black/60' : 'text-red-700/60'}`}>Net Worth</div>
          <div className={`text-xs font-bold truncate ${netWorth >= 0 ? 'text-black' : 'text-red-700'}`}>
            {netWorth !== 0 ? `${netWorth < 0 ? '-' : ''}$${Math.abs(netWorth).toLocaleString()}` : '$0'}
          </div>
        </div>
        <div className="border border-black p-2 bg-black/5">
          <div className="text-[9px] text-black/60 font-mono tracking-widest uppercase mb-1">Orgs</div>
          <div className="text-xs font-bold text-black">{affiliations.length}</div>
        </div>
      </div>

      {companiesWithSalary.length > 1 && (
        <div className="space-y-1.5 pt-2 border-t border-black/10">
          {companiesWithSalary.map((a) => {
            const salaryNum = Number(a.membership.salary);
            const pct = totalSalary > 0 ? Math.round((salaryNum / totalSalary) * 100) : 0;
            return (
              <div key={a.membership.orgId} className="flex items-center justify-between text-[10px] font-mono">
                <span className="truncate flex-1 font-bold">{a.organization?.name ?? 'UNKNOWN'}</span>
                <span className="text-emerald-700 font-bold mx-2 shrink-0">${salaryNum.toLocaleString()}</span>
                <span className="text-black/40 w-8 text-right shrink-0">{pct}%</span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function ProfileSwitcherCard({ boomerMode }: { boomerMode: boolean }) {
  const [, navigate] = useLocation();
  const [profiles, setProfiles] = useState<MiniProfile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/profiles')
      .then(r => r.json())
      .then(j => { if (!cancelled) { setProfiles(j.profiles || []); setActiveId(j.activeProfileId || null); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const active = profiles.find(p => p.id === activeId);
  return (
    <Panel title={boomerMode ? 'Characters' : 'Profiles'} icon={Users} headerRight={
      <button onClick={() => navigate('/profiles')} className="text-[9px] font-bold tracking-widest uppercase border border-black px-2 py-0.5 hover:bg-black/5 transition-colors" data-testid="btn-open-profile-picker">
        Manage
      </button>
    }>
      {loading ? (
        <div className="text-[10px] font-mono text-black/50">Loading...</div>
      ) : active ? (
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 flex items-center justify-center font-bold text-[#fffaf0] text-xl border border-black shrink-0" style={{ backgroundColor: active.avatarColor }}>
            {active.playerName.charAt(0) || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm font-mono truncate">{active.playerName}</div>
            <div className="text-[9px] font-mono text-black/50 uppercase tracking-widest mt-1">
              Slot {profiles.findIndex(p => p.id === activeId) + 1} of {profiles.length}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-[10px] font-mono text-black/50 uppercase">No active profile</div>
      )}
    </Panel>
  );
}

function AccountTab({ view }: { view: 'profile' | 'settings' }) {
  hydrateActiveCityFromSave();
  const { user, isAuthenticated, logout } = useAuth();
  const [, navigate] = useLocation();
  const [data, setData] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [boomerMode] = useBoomerMode();
  const { isPro, isOwner, features } = usePlan();
  const { t } = useTranslation();

  const [affiliations, setAffiliations] = useState<OrgAffiliation[]>([]);
  const [affiliationsLoading, setAffiliationsLoading] = useState(true);
  const [activeEmployer, setActiveEmployer] = useState<{ roleTitle: string; orgName: string; orgIndustry: string | null; payRateFiat: string; startedAt: string | null } | null>(null);

  const [memoryDraft, setMemoryDraft] = useState('');
  const [savingMemory, setSavingMemory] = useState(false);
  const [memorySaved, setMemorySaved] = useState(false);

  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState<string | null>(null);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [privacyToggling, setPrivacyToggling] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<'memory' | 'contacts' | 'all' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState<string | null>(null);

  const [donationHistory, setDonationHistory] = useState<DonationRecord[]>([]);
  const [donationTotalCents, setDonationTotalCents] = useState(0);
  const [donorTitle, setDonorTitle] = useState('');

  useEffect(() => {
    if (!isAuthenticated) { setLoading(false); setAffiliationsLoading(false); return; }
    apiFetch('/api/account')
      .then(r => r.json())
      .then((d: AccountData) => {
        setData(d);
        setMemoryDraft(d.memory ?? '');
        setPrivacyMode(Boolean(d.pabloPrivacyMode));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    apiFetch('/api/stripe/donation-history')
      .then(r => r.json())
      .then(d => {
        setDonationHistory(d.history ?? []);
        setDonationTotalCents(d.totalCents ?? 0);
        setDonorTitle(d.donorTitle ?? '');
      })
      .catch(() => {});
    apiFetch('/api/orgs/me/all')
      .then(r => r.json())
      .then(d => {
        setAffiliations(d.memberships ?? []);
      })
      .catch(() => {})
      .finally(() => setAffiliationsLoading(false));
    apiFetch('/api/labor/my/contracts')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const active = (d?.contracts ?? []).find((c: { status: string }) => c.status === 'active');
        if (active) setActiveEmployer(active);
      })
      .catch(() => {});
  }, [isAuthenticated]);

  const saveName = async () => {
    const v = nameDraft.trim();
    if (!v || savingName) return;
    setSavingName(true); setNameMsg(null);
    try {
      const r = await apiFetch('/api/world/me/name', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName: v }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `Save failed (${r.status})`);
      setNameMsg(`Saved as ${j.playerName}.`);
      setTimeout(() => setNameMsg(null), 3000);
    } catch (e: any) {
      setNameMsg(e?.message || 'Save failed.');
    } finally { setSavingName(false); }
  };

  const togglePrivacyMode = async () => {
    if (privacyToggling) return;
    const next = !privacyMode;
    if (next && !confirm('Turn on privacy mode? This will permanently delete all of your existing Pablo conversation history. Future conversations and memory will not be saved.')) {
      return;
    }
    setPrivacyToggling(true);
    try {
      const res = await apiFetch('/api/account/privacy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pabloPrivacyMode: next }),
      });
      if (res.ok) {
        setPrivacyMode(next);
        setData(prev => prev ? { ...prev, pabloPrivacyMode: next } : prev);
      }
    } catch {}
    setPrivacyToggling(false);
  };

  const saveMemory = async () => {
    setSavingMemory(true);
    try {
      await apiFetch('/api/account/memory', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memory: memoryDraft }),
      });
      setData(prev => prev ? { ...prev, memory: memoryDraft } : prev);
      setMemorySaved(true);
      setTimeout(() => setMemorySaved(false), 2500);
    } catch {}
    setSavingMemory(false);
  };

  const deleteData = async (scope: 'memory' | 'contacts' | 'all') => {
    setDeleting(true);
    try {
      const s = scope === 'all' ? '' : scope;
      await apiFetch(`/api/account/data${s ? `?scope=${s}` : ''}`, { method: 'DELETE' });
      setDeleted(scope);
      if (scope === 'memory' || scope === 'all') {
        setMemoryDraft('');
        setData(prev => prev ? { ...prev, memory: '' } : prev);
      }
      if (scope === 'contacts' || scope === 'all') {
        setData(prev => prev ? { ...prev, contactCount: 0 } : prev);
      }
      setTimeout(() => { setDeleted(null); setDeleteTarget(null); }, 2500);
    } catch {}
    setDeleting(false);
  };

  const exportData = () => {
    if (!data) return;
    const exportObj = {
      exportedAt: new Date().toISOString(),
      profile: {
        name: [data.user.firstName, data.user.lastName].filter(Boolean).join(' '),
        email: data.user.email,
        memberSince: data.user.createdAt,
      },
      pabloMemory: data.memory,
      contactCount: data.contactCount,
    };
    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'salaryman-my-data.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const displayName = user?.firstName
    ? [user.firstName, user.lastName].filter(Boolean).join(' ')
    : user?.email?.split('@')[0] ?? 'User';

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-black/40" /></div>;
  }

  return (
    <>
      <div className={view === 'profile' ? "max-w-md mx-auto space-y-4" : "grid grid-cols-1 md:grid-cols-2 gap-4 items-start"}>
        {view === 'profile' ? (
          <>
            <Panel title="Identity" icon={User}>
              <div className="flex items-start gap-4 mb-4">
                {resolveAvatarUrl(user?.profileImageUrl) ? (
                  <img src={resolveAvatarUrl(user?.profileImageUrl)} alt="Avatar" className="w-16 h-16 border border-black object-cover shrink-0" />
                ) : (
                  <div className="w-16 h-16 border border-black bg-black/5 flex items-center justify-center text-xl font-bold shrink-0 text-black">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-base truncate">{displayName}</div>
                  <div className="text-[10px] font-mono text-black/60 truncate">{user?.email}</div>
                  <button onClick={() => logout()} className="mt-2 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-red-600 hover:bg-red-600/10 border border-red-600/20 px-2.5 py-1 transition-colors">
                    <LogOut className="w-3 h-3" /> Terminate Session
                  </button>
                </div>
              </div>

              <div className="border-t border-black pt-3 mt-1">
                <label className="block text-[9px] font-bold tracking-widest uppercase mb-1.5 text-black">Call Sign</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={nameDraft}
                    onChange={e => setNameDraft(e.target.value)}
                    placeholder={displayName}
                    maxLength={64}
                    className="flex-1 border border-black bg-transparent px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-emerald-600 transition-colors"
                    data-testid="profile-name-input"
                  />
                  <button
                    onClick={saveName}
                    disabled={!nameDraft.trim() || savingName}
                    data-testid="profile-name-save"
                    className="border border-black px-3 py-1.5 text-[10px] font-bold tracking-widest uppercase hover:bg-black/5 disabled:opacity-50 transition-colors"
                  >
                    {savingName ? '...' : 'Save'}
                  </button>
                </div>
                {nameMsg && <div className="text-[9px] font-mono text-emerald-700 mt-1.5">{nameMsg}</div>}
              </div>
            </Panel>

            <ProfileSwitcherCard boomerMode={boomerMode} />
            <ReferralPanel boomerMode={boomerMode} />
            <AppInstallCard />
          </>
        ) : (
          <>
            {/* Settings Left Column */}
            <div className="space-y-4">
              {activeEmployer && (
                <Panel title="Active Contract" icon={Briefcase} headerRight={
                  <Link href="/business/jobs?tab=my-contracts" className="text-[9px] font-bold uppercase tracking-widest text-emerald-700 hover:text-emerald-800 underline">Manage</Link>
                }>
                  <div className="font-bold text-sm truncate">{activeEmployer.roleTitle}</div>
                  <div className="text-[10px] font-mono text-black/60 truncate">{activeEmployer.orgName} {activeEmployer.orgIndustry ? `(${activeEmployer.orgIndustry})` : ''}</div>
                  <div className="text-[10px] font-mono text-emerald-700 font-bold mt-2">ƒ{Number(activeEmployer.payRateFiat).toLocaleString()}/hr</div>
                </Panel>
              )}

              {!affiliationsLoading && affiliations.length > 0 && <FinancialDashboard affiliations={affiliations} boomerMode={boomerMode} />}
              <LaborRecordSection boomerMode={boomerMode} />

              {!affiliationsLoading && affiliations.length > 0 && (
                <Panel title="Affiliations" icon={Building2}>
                  <div className="space-y-2">
                    {affiliations.map((a) => <CompanyAffiliationCard key={a.membership.orgId} affiliation={a} boomerMode={boomerMode} />)}
                  </div>
                </Panel>
              )}

              {!affiliationsLoading && affiliations.length === 0 && (
                <Panel title="Affiliations" icon={Building2}>
                  <div className="text-center py-6">
                    <Building2 className="w-6 h-6 text-black/20 mx-auto mb-2" />
                    <p className="text-xs font-bold uppercase tracking-widest">No Affiliations</p>
                    <p className="text-[10px] font-mono text-black/50 mt-1">Join an organization.</p>
                  </div>
                </Panel>
              )}

              <Panel title="Platform Integrations" icon={Plug}>
                <div className="space-y-3">
                  <GoogleLinkSection />
                  <GithubLinkSection />
                  <DiscordLinkSection />
                </div>
              </Panel>
            </div>

            {/* Settings Right Column */}
            <div className="space-y-4">
              <Panel title="Access Level" icon={Zap}>
                {isOwner ? (
                  <div className="border border-emerald-600 bg-emerald-600/10 p-2.5 text-emerald-700">
                    <div className="font-bold text-xs uppercase tracking-widest">SysAdmin</div>
                    <div className="text-[10px] font-mono mt-1 opacity-90">All clearance levels unlocked.</div>
                  </div>
                ) : features.size > 0 ? (
                  <div className="space-y-2">
                    <div className="border border-emerald-600 p-2.5 text-emerald-700 bg-emerald-600/5">
                      <div className="flex justify-between items-center mb-1">
                        <div className="font-bold text-xs uppercase tracking-widest">{features.size} Modules</div>
                        <a href="https://billing.stripe.com/p/login" target="_blank" rel="noopener noreferrer" className="text-[9px] uppercase tracking-widest underline font-bold">Manage</a>
                      </div>
                      <div className="text-[9px] font-mono opacity-80">{[...features].join(', ').replace(/_/g, ' ')}</div>
                    </div>
                    <button onClick={() => navigate('/pricing')} className="w-full border border-black p-2 text-[10px] font-bold uppercase tracking-widest hover:bg-black/5 transition-colors">Browse Modules</button>
                  </div>
                ) : (
                  <div className="border border-black p-2.5 flex justify-between items-center bg-black/5">
                    <div>
                      <div className="font-bold text-xs uppercase tracking-widest">Standard</div>
                      <div className="text-[10px] font-mono text-black/60 mt-0.5">Core features only.</div>
                    </div>
                    <button onClick={() => navigate('/pricing')} className="border border-emerald-600 text-emerald-700 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-600/10 transition-colors">Upgrade</button>
                  </div>
                )}
                <Link href="/pricing" className="flex items-center justify-between border border-black p-2.5 hover:bg-black/5 transition-colors group">
                  <div>
                    <div className="font-bold text-[10px] uppercase tracking-widest text-black group-hover:text-emerald-700 transition-colors">Pledge Store</div>
                    <div className="text-[9px] font-mono text-black/60 mt-0.5">View membership plans.</div>
                  </div>
                  <ShoppingBag className="w-4 h-4 text-black/30 group-hover:text-emerald-700 transition-colors" />
                </Link>
              </Panel>

              <Panel title="City Links" icon={Laptop}>
                <div className="space-y-2">
                  <Link href="/desktop" className="flex items-center justify-between border border-black p-2.5 hover:bg-black/5 transition-colors group">
                    <div>
                      <div className="font-bold text-[10px] uppercase tracking-widest text-black group-hover:text-emerald-700 transition-colors">Desktop Office</div>
                      <div className="text-[9px] font-mono text-black/60 mt-0.5">Launch finance and office client.</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-black/30 group-hover:text-emerald-700 transition-colors" />
                  </Link>
                  <Link href="/alpha" className="flex items-center justify-between border border-black p-2.5 hover:bg-black/5 transition-colors group">
                    <div>
                      <div className="font-bold text-[10px] uppercase tracking-widest text-black group-hover:text-emerald-700 transition-colors">Tester Program</div>
                      <div className="text-[9px] font-mono text-black/60 mt-0.5">Apply for alpha access.</div>
                    </div>
                    <FlaskConical className="w-4 h-4 text-black/30 group-hover:text-emerald-700 transition-colors" />
                  </Link>
                  <Link href="/org" className="flex items-center justify-between border border-black p-2.5 hover:bg-black/5 transition-colors group">
                    <div>
                      <div className="font-bold text-[10px] uppercase tracking-widest text-black group-hover:text-emerald-700 transition-colors">Org Hub</div>
                      <div className="text-[9px] font-mono text-black/60 mt-0.5">Manage your organization.</div>
                    </div>
                    <Network className="w-4 h-4 text-black/30 group-hover:text-emerald-700 transition-colors" />
                  </Link>
                </div>
              </Panel>

              <VisaCitizenshipSection />

              <Panel title="Preferences" icon={SlidersHorizontal}>
                <div className="space-y-4 text-[10px] font-bold uppercase tracking-widest text-black">
                  <div className="flex items-center justify-between">
                    <span>Language</span>
                    <div className="w-32"><LanguageSelector /></div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Currency</span>
                    <div className="w-32"><CurrencySelector /></div>
                  </div>
                </div>
              </Panel>

              {donationHistory.filter(d => d.status === 'completed').length > 0 && (
                <Panel title="Slush Fund" icon={Heart}>
                  <div className="flex gap-2 mb-3">
                    <div className="flex-1 border border-black p-2 bg-black/5">
                      <div className="text-[9px] font-mono text-black/60 uppercase">Total Given</div>
                      <div className="font-bold text-sm text-black">${(donationTotalCents / 100).toFixed(2)}</div>
                    </div>
                    {donorTitle && (
                      <div className="border border-emerald-600 bg-emerald-600/10 p-2 flex items-center justify-center px-4">
                        <span className="font-bold text-[10px] text-emerald-700 uppercase tracking-widest text-center">{donorTitle}</span>
                      </div>
                    )}
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-1 scrollbar-hide pr-1">
                    {donationHistory.filter(d => d.status === 'completed').map(d => (
                      <div key={d.id} className="flex justify-between items-center text-[10px] font-mono border-b border-black/10 pb-1.5 pt-1">
                        <div className="flex items-center gap-2">
                          <span className="text-black/60">{new Date(d.createdAt).toLocaleDateString()}</span>
                          {d.tier && <span className="text-[9px] border border-black/20 px-1 bg-black/5 font-bold uppercase">{d.tier}</span>}
                        </div>
                        <div className="font-bold text-black">${(d.amountCents / 100).toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}

              <Panel title="Pablo AI Memory" icon={Brain}>
                <div className="flex items-center justify-between mb-3 border-b border-black/10 pb-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-black">Privacy Mode</span>
                  <button
                    onClick={togglePrivacyMode}
                    disabled={privacyToggling}
                    className={`border px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest transition-colors ${privacyMode ? 'border-red-600 bg-red-600/10 text-red-700' : 'border-black text-black hover:bg-black/5'}`}
                  >
                    {privacyMode ? 'ENGAGED' : 'DISABLED'}
                  </button>
                </div>
                <textarea
                  value={memoryDraft}
                  onChange={e => setMemoryDraft(e.target.value)}
                  placeholder="Knowledge banks..."
                  disabled={privacyMode}
                  rows={5}
                  className="w-full border border-black bg-transparent p-2.5 text-xs font-mono disabled:opacity-40 focus:outline-none focus:border-emerald-600 mb-3 resize-none transition-colors"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono text-black/50">
                    {data?.memoryUpdatedAt ? `UPD ${new Date(data.memoryUpdatedAt).toLocaleDateString()}` : ''}
                  </span>
                  <div className="flex gap-3">
                    <button onClick={() => setDeleteTarget('memory')} className="text-[9px] uppercase tracking-widest font-bold text-red-600 hover:text-red-800 transition-colors">Clear</button>
                    <button onClick={saveMemory} disabled={savingMemory || memoryDraft === data?.memory} className="text-[9px] uppercase tracking-widest font-bold text-emerald-700 hover:text-emerald-800 transition-colors disabled:opacity-40">
                      {savingMemory ? 'Saving...' : memorySaved ? 'Saved' : 'Commit'}
                    </button>
                  </div>
                </div>
              </Panel>

              <Panel title="Security & Data" icon={Database}>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="border border-black p-2 bg-black/5">
                    <div className="text-[9px] font-mono text-black/60 uppercase">Contacts</div>
                    <div className="font-bold text-sm text-black">{data?.contactCount ?? 0}</div>
                  </div>
                  <div className="border border-black p-2 bg-black/5">
                    <div className="text-[9px] font-mono text-black/60 uppercase">Memory</div>
                    <div className="font-bold text-sm text-black">{data?.memory ? data.memory.split('\n').filter(Boolean).length : 0} <span className="text-[10px] font-normal">L</span></div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <button onClick={exportData} className="w-full text-left p-2 border border-black hover:bg-black/5 text-[10px] font-bold uppercase tracking-widest flex items-center justify-between text-black transition-colors">
                    <span>Export Data (JSON)</span>
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setDeleteTarget('contacts')} className="w-full text-left p-2 border border-black hover:bg-red-600/10 text-red-600 text-[10px] font-bold uppercase tracking-widest flex items-center justify-between transition-colors">
                    <span>Purge Contacts</span>
                    <Users className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setDeleteTarget('all')} className="w-full text-left p-2 border border-red-600 bg-red-600/5 hover:bg-red-600/15 text-red-700 text-[10px] font-bold uppercase tracking-widest flex items-center justify-between transition-colors">
                    <span>Terminate Account Data</span>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </Panel>
            </div>
          </>
        )}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-[#fffaf0] border border-black shadow-xl">
            {deleted ? (
              <div className="flex flex-col items-center gap-3 p-8 text-center">
                <div className="w-12 h-12 border border-emerald-600 bg-emerald-600/10 flex items-center justify-center">
                  <Check className="w-6 h-6 text-emerald-700" />
                </div>
                <p className="text-[10px] font-bold text-black uppercase tracking-widest">{t('profile.dataDeleted')}</p>
              </div>
            ) : (
              <div className="p-5">
                <div className="flex items-start gap-4 mb-5 border-b border-black/10 pb-4">
                  <div className="w-10 h-10 border border-red-600 bg-red-600/10 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5 text-red-700" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-black uppercase tracking-tight mb-1">{t('profile.areYouSure')}</p>
                    <p className="text-[10px] font-mono text-black/70 leading-relaxed">
                      {deleteTarget === 'memory' && t('profile.clearMemoryConfirm')}
                      {deleteTarget === 'contacts' && t('profile.deleteContactsConfirm')}
                      {deleteTarget === 'all' && t('profile.deleteAllConfirm')}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setDeleteTarget(null)} disabled={deleting}
                    className="flex-1 px-4 py-2 border border-black text-black text-[10px] font-bold uppercase tracking-widest hover:bg-black/5 transition-colors disabled:opacity-50">
                    {t('profile.cancel')}
                  </button>
                  <button onClick={() => deleteData(deleteTarget)} disabled={deleting}
                    className="flex-1 px-4 py-2 border border-red-600 bg-red-600/10 text-red-700 text-[10px] font-bold uppercase tracking-widest hover:bg-red-600/20 transition-colors disabled:opacity-50">
                    {deleting ? 'Processing...' : t('profile.delete')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default function Profile() {
  const { isAuthenticated } = useAuth();
  const [boomerMode] = useBoomerMode();

  if (!isAuthenticated) {
    return <SignInPage context="Sign in to manage your account." />;
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#fffaf0] text-black font-sans">
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8 sm:py-10 space-y-6">
        <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-black/40" /></div>}>
          <SectionHeader
            icon={User}
            title={boomerMode ? 'MY PROFILE' : 'PROFILE'}
            subtitle={boomerMode ? 'Your personal identity and character' : 'Your identity'}
          />
          <AccountTab view="profile" />
        </Suspense>
      </main>
    </div>
  );
}

export function SettingsPage() {
  const { isAuthenticated } = useAuth();
  const [boomerMode] = useBoomerMode();

  if (!isAuthenticated) {
    return <SignInPage context="Sign in to manage your settings." />;
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#fffaf0] text-black font-sans">
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8 sm:py-10 space-y-6">
        <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-black/40" /></div>}>
          <SectionHeader
            icon={SlidersHorizontal}
            title={boomerMode ? 'SETTINGS' : 'SETTINGS'}
            subtitle="Account, privacy, and shared preferences"
          />
          <AccountTab view="settings" />
        </Suspense>
      </main>
    </div>
  );
}

export function AdminHub() {
  const { isAuthenticated } = useAuth();
  const [boomerMode] = useBoomerMode();
  const { isOwner } = usePlan();

  if (!isAuthenticated) {
    return <SignInPage context="Sign in to access the admin hub." />;
  }

  if (!isOwner) return <Redirect to="/profile" />;

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#fffaf0] text-black font-sans">
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8 sm:py-10 space-y-8">
        <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-black/40" /></div>}>
          <SectionHeader
            icon={ShieldCheck}
            title={boomerMode ? 'ADMIN PANEL' : 'ADMIN'}
            subtitle="Full platform administration"
          />
          <AdminPanel />
        </Suspense>
      </main>
    </div>
  );
}