import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import {
  Briefcase, Building2, DollarSign, MapPin, Clock, Users, ChevronDown,
  ChevronUp, Plus, Loader2, X, CheckCircle, XCircle, Send, AlertTriangle,
  Zap, Filter, RefreshCw, FileText, TrendingUp,
} from 'lucide-react';

const INDUSTRIES = [
  '', 'CONSTRUCTION & TRADES', 'FINANCE & ACCOUNTING', 'HEALTHCARE & MEDICINE',
  'LAW & LEGAL SERVICES', 'MILITARY & DEFENSE', 'IT & TECHNOLOGY', 'CREATIVE & DESIGN',
  'LOGISTICS & SUPPLY CHAIN', 'EDUCATION & TRAINING', 'SALES & MARKETING', 'REAL ESTATE',
  'FOOD & HOSPITALITY', 'MANUFACTURING', 'ENERGY & UTILITIES', 'MEDIA & ENTERTAINMENT',
  'BIOTECH & PHARMA', 'TRANSPORTATION & AUTO', 'GOVERNMENT & CIVIL', 'AGRICULTURE & FOOD SCI',
  'INSURANCE & RISK',
  'SOFTWARE / SAAS', 'AGENCY / CONSULTING', 'E-COMMERCE / RETAIL', 'FINTECH',
  'MEDIA / CONTENT', 'LOGISTICS / DELIVERY', 'BAR / RESTAURANT', 'SECURITY / ENFORCEMENT',
];

type Job = {
  id: number; orgId: number; orgName: string; orgIndustry: string | null;
  title: string; industry: string; payRateFiat: string;
  requiredSkillTier: number; slots: number; status: string;
  description: string; createdAt: string; applicantCount: number;
};

type Application = {
  id: number; postingId: number; postingTitle: string; postingIndustry: string;
  postingPayRate: string; orgName: string; status: string; createdAt: string;
};

type Contract = {
  id: number; orgId: number; orgName: string; orgIndustry: string | null;
  roleTitle: string; payRateFiat: string; status: string;
  startedAt: string | null; endedAt: string | null; createdAt: string;
  severancePaid: boolean;
};

type OrgInfo = { orgId: number; orgName: string; role: string };

type Applicant = {
  application: { id: number; postingId: number; applicantUserId: string; coverNote: string; status: string; createdAt: string };
  firstName: string | null; lastName: string | null; email: string | null; profileImageUrl: string | null;
};

function fiat(v: string | number) {
  const n = Number(v);
  if (!n) return 'ƒ—';
  return 'ƒ' + n.toLocaleString();
}

function relativeTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const STATUS_COLORS: Record<string, string> = {
  open: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
  filled: 'text-amber-400 border-amber-400/30 bg-amber-400/10',
  closed: 'text-zinc-500 border-zinc-500/30 bg-zinc-500/10',
  pending: 'text-sky-400 border-sky-400/30 bg-sky-400/10',
  active: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
  terminated: 'text-red-400 border-red-400/30 bg-red-400/10',
  declined: 'text-zinc-500 border-zinc-500/30 bg-zinc-500/10',
  offered: 'text-fuchsia-400 border-fuchsia-400/30 bg-fuchsia-400/10',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest ${STATUS_COLORS[status] ?? STATUS_COLORS.closed}`}>
      {status}
    </span>
  );
}

function Card({ title, icon, children }: { title?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-950 p-5">
      {title && (
        <div className="mb-4 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-sky-400">
          {icon}{title}
        </div>
      )}
      {children}
    </div>
  );
}

type Tab = 'browse' | 'my-applications' | 'my-contracts' | 'post-jobs' | 'org-contracts';

export default function JobBoard() {
  const { isAuthenticated } = useAuth();
  const [tab, setTab] = useState<Tab>('browse');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [orgContracts, setOrgContracts] = useState<Contract[]>([]);
  const [orgPostings, setOrgPostings] = useState<Job[]>([]);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [selectedPosting, setSelectedPosting] = useState<Job | null>(null);
  const [myOrgs, setMyOrgs] = useState<OrgInfo[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lfw, setLfw] = useState(false);
  const [lfwLoading, setLfwLoading] = useState(false);
  const [industryFilter, setIndustryFilter] = useState('');
  const [expandedJob, setExpandedJob] = useState<number | null>(null);

  // Create posting form
  const [newTitle, setNewTitle] = useState('');
  const [newIndustry, setNewIndustry] = useState('');
  const [newPay, setNewPay] = useState('');
  const [newSlots, setNewSlots] = useState('1');
  const [newDesc, setNewDesc] = useState('');
  const [posting, setPostingBusy] = useState(false);
  const [postOk, setPostOk] = useState(false);

  // Offer form state
  const [offerModal, setOfferModal] = useState<{ applicant: Applicant; posting: Job } | null>(null);
  const [offerRole, setOfferRole] = useState('');
  const [offerPay, setOfferPay] = useState('');
  const [offerBusy, setOfferBusy] = useState(false);

  const loadJobs = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = industryFilter ? `?industry=${encodeURIComponent(industryFilter)}` : '';
      const res = await apiFetch(`/api/labor/jobs${params}`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setJobs(data.jobs ?? []);
    } catch { setError('Could not load job board.'); }
    finally { setLoading(false); }
  }, [industryFilter]);

  const loadMyApplications = useCallback(async () => {
    if (!isAuthenticated) return;
    const res = await apiFetch('/api/labor/my/applications');
    if (res.ok) { const d = await res.json(); setApplications(d.applications ?? []); }
  }, [isAuthenticated]);

  const loadMyContracts = useCallback(async () => {
    if (!isAuthenticated) return;
    const res = await apiFetch('/api/labor/my/contracts');
    if (res.ok) { const d = await res.json(); setContracts(d.contracts ?? []); }
  }, [isAuthenticated]);

  const loadLfw = useCallback(async () => {
    if (!isAuthenticated) return;
    const res = await apiFetch('/api/labor/looking-for-work');
    if (res.ok) { const d = await res.json(); setLfw(!!d.lookingForWork); }
  }, [isAuthenticated]);

  const loadMyOrgs = useCallback(async () => {
    if (!isAuthenticated) return;
    const res = await apiFetch('/api/my-office');
    if (res.ok) { const d = await res.json(); setMyOrgs(d.orgs ?? []); }
  }, [isAuthenticated]);

  const loadOrgPostings = useCallback(async () => {
    if (!selectedOrgId) return;
    const res = await apiFetch(`/api/labor/jobs?orgId=${selectedOrgId}&status=open`);
    if (res.ok) { const d = await res.json(); setOrgPostings(d.jobs ?? []); }
  }, [selectedOrgId]);

  const loadOrgContracts = useCallback(async () => {
    if (!selectedOrgId) return;
    const res = await apiFetch(`/api/labor/orgs/${selectedOrgId}/contracts`);
    if (res.ok) { const d = await res.json(); setOrgContracts(d.contracts ?? []); }
  }, [selectedOrgId]);

  const loadApplicants = useCallback(async (postingId: number) => {
    const res = await apiFetch(`/api/labor/jobs/${postingId}/applicants`);
    if (res.ok) { const d = await res.json(); setApplicants(d.applicants ?? []); }
  }, []);

  useEffect(() => { void loadJobs(); }, [loadJobs]);
  useEffect(() => {
    if (!isAuthenticated) return;
    void loadMyApplications();
    void loadMyContracts();
    void loadLfw();
    void loadMyOrgs();
  }, [isAuthenticated, loadMyApplications, loadMyContracts, loadLfw, loadMyOrgs]);
  useEffect(() => { if (selectedOrgId) { void loadOrgPostings(); void loadOrgContracts(); } }, [selectedOrgId, loadOrgPostings, loadOrgContracts]);
  useEffect(() => { if (selectedPosting) void loadApplicants(selectedPosting.id); }, [selectedPosting, loadApplicants]);

  // Detect org tab access from query string
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('tab');
    if (t && ['browse', 'my-applications', 'my-contracts', 'post-jobs', 'org-contracts'].includes(t)) {
      setTab(t as Tab);
    }
  }, []);

  const apply = async (jobId: number) => {
    setActing(jobId);
    try {
      const res = await apiFetch(`/api/labor/jobs/${jobId}/apply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coverNote: '' }) });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? 'Failed to apply'); return; }
      await loadJobs();
      await loadMyApplications();
      setExpandedJob(null);
    } catch { setError('Failed to apply'); }
    finally { setActing(null); }
  };

  const acceptContract = async (id: number) => {
    setActing(id);
    try {
      const res = await apiFetch(`/api/labor/contracts/${id}/accept`, { method: 'POST' });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed'); return; }
      await loadMyContracts();
    } catch { setError('Failed to accept'); }
    finally { setActing(null); }
  };

  const declineContract = async (id: number) => {
    setActing(id);
    try {
      const res = await apiFetch(`/api/labor/contracts/${id}/decline`, { method: 'POST' });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed'); return; }
      await loadMyContracts();
    } catch { setError('Failed to decline'); }
    finally { setActing(null); }
  };

  const terminateContract = async (id: number) => {
    if (!confirm('Terminate this employment contract?')) return;
    setActing(id);
    try {
      const res = await apiFetch(`/api/labor/contracts/${id}/terminate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cause: '' }) });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed'); return; }
      await loadOrgContracts();
    } catch { setError('Failed to terminate'); }
    finally { setActing(null); }
  };

  const sendOffer = async () => {
    if (!offerModal || !selectedOrgId) return;
    setOfferBusy(true);
    try {
      const res = await apiFetch(`/api/labor/jobs/${offerModal.posting.id}/offer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicantUserId: offerModal.applicant.application.applicantUserId, roleTitle: offerRole || offerModal.posting.title, payRateFiat: Number(offerPay) || Number(offerModal.posting.payRateFiat) }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? 'Failed to send offer'); return; }
      setOfferModal(null);
      await loadApplicants(offerModal.posting.id);
    } catch { setError('Failed to send offer'); }
    finally { setOfferBusy(false); }
  };

  const createPosting = async () => {
    if (!selectedOrgId || !newTitle.trim()) { setError('Title required'); return; }
    setPostingBusy(true); setError(null);
    try {
      const res = await apiFetch('/api/labor/jobs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: selectedOrgId, title: newTitle, industry: newIndustry, payRateFiat: Number(newPay) || 0, slots: Number(newSlots) || 1, description: newDesc }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? 'Failed'); return; }
      setPostOk(true);
      setNewTitle(''); setNewIndustry(''); setNewPay(''); setNewSlots('1'); setNewDesc('');
      setTimeout(() => setPostOk(false), 3000);
      await loadOrgPostings();
    } catch { setError('Failed to post job'); }
    finally { setPostingBusy(false); }
  };

  const toggleLfw = async () => {
    setLfwLoading(true);
    try {
      const res = await apiFetch('/api/labor/looking-for-work', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !lfw }) });
      if (res.ok) setLfw(!lfw);
    } catch { /* silent */ }
    finally { setLfwLoading(false); }
  };

  const managerOrgs = myOrgs.filter(o => ['owner', 'ceo', 'executive', 'director', 'manager'].includes(o.role.toLowerCase()));

  const TABS: { id: Tab; label: string }[] = [
    { id: 'browse', label: 'JOB BOARD' },
    ...(isAuthenticated ? [
      { id: 'my-applications' as Tab, label: `MY APPLICATIONS${applications.length ? ` (${applications.length})` : ''}` },
      { id: 'my-contracts' as Tab, label: `MY CONTRACTS${contracts.filter(c => c.status === 'pending').length ? ` ✦${contracts.filter(c => c.status === 'pending').length}` : ''}` },
    ] : []),
    ...(managerOrgs.length > 0 ? [
      { id: 'post-jobs' as Tab, label: 'POST A JOB' },
      { id: 'org-contracts' as Tab, label: 'TEAM CONTRACTS' },
    ] : []),
  ];

  return (
    <div className="min-h-screen bg-zinc-950 pb-20 pt-6">
      <div className="mx-auto max-w-5xl px-4">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-sky-400">
            <Briefcase size={13} /> Labor Market
          </div>
          <h1 className="mt-1 font-mono text-3xl font-bold tracking-tighter text-zinc-50">JOB BOARD</h1>
          <p className="mt-1 text-sm text-zinc-500">Open positions across all orgs · Apply, get hired, build your career in the city.</p>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <AlertTriangle size={14} />
            {error}
            <button onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
          </div>
        )}

        {/* LFW toggle (logged in only) */}
        {isAuthenticated && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-white/5 bg-zinc-900/50 px-4 py-3">
            <div>
              <div className="text-sm font-mono text-zinc-200">Looking for Work</div>
              <div className="text-xs text-zinc-500 mt-0.5">Toggle visibility to org employers browsing available workers.</div>
            </div>
            <button
              onClick={toggleLfw}
              disabled={lfwLoading}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 transition-colors ${lfw ? 'border-emerald-500 bg-emerald-500' : 'border-zinc-600 bg-zinc-700'}`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${lfw ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 flex gap-1 overflow-x-auto rounded-lg border border-white/10 bg-zinc-900 p-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setSelectedPosting(null); setExpandedJob(null); }}
              className={`flex-shrink-0 rounded px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors ${tab === t.id ? 'bg-sky-500/20 text-sky-300' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── BROWSE TAB ────────────────────────────────────────────────────── */}
        {tab === 'browse' && (
          <div className="space-y-4">
            {/* Filter bar */}
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <select
                  value={industryFilter}
                  onChange={e => setIndustryFilter(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-zinc-900 pl-8 pr-3 py-2 font-mono text-xs text-zinc-300 focus:border-sky-500/50 focus:outline-none"
                >
                  <option value="">All Industries</option>
                  {INDUSTRIES.filter(i => i).map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <button onClick={loadJobs} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 font-mono text-[10px] uppercase text-zinc-400 hover:text-zinc-200">
                <RefreshCw size={12} /> Refresh
              </button>
            </div>

            {loading ? (
              <div className="py-16 text-center font-mono text-sm text-zinc-600">
                <Loader2 size={20} className="mx-auto mb-3 animate-spin text-sky-500" />
                SCANNING THE WIRE…
              </div>
            ) : jobs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 py-16 text-center">
                <Briefcase size={24} className="mx-auto mb-3 text-zinc-700" />
                <p className="font-mono text-sm text-zinc-600">No open positions right now.</p>
                <p className="mt-1 text-xs text-zinc-700">Orgs haven't posted jobs yet — or your filter is too narrow.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {jobs.map(job => (
                  <div key={job.id} className="rounded-xl border border-white/10 bg-zinc-900 overflow-hidden">
                    <button
                      className="w-full p-4 text-left"
                      onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-sm font-semibold text-zinc-100 truncate">{job.title}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                            <span className="flex items-center gap-1"><Building2 size={11} />{job.orgName}</span>
                            {job.industry && <span className="flex items-center gap-1"><MapPin size={11} />{job.industry}</span>}
                            <span className="flex items-center gap-1"><DollarSign size={11} />{fiat(job.payRateFiat)}/hr</span>
                            <span className="flex items-center gap-1"><Users size={11} />{job.slots} slot{job.slots !== 1 ? 's' : ''}</span>
                            <span className="flex items-center gap-1"><Clock size={11} />{relativeTime(job.createdAt)}</span>
                          </div>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-2">
                          <StatusBadge status={job.status} />
                          {expandedJob === job.id ? <ChevronUp size={14} className="text-zinc-500" /> : <ChevronDown size={14} className="text-zinc-500" />}
                        </div>
                      </div>
                    </button>
                    {expandedJob === job.id && (
                      <div className="border-t border-white/5 px-4 pb-4 pt-3">
                        {job.description && <p className="mb-4 text-sm text-zinc-400 leading-relaxed">{job.description}</p>}
                        <div className="flex items-center gap-3">
                          {isAuthenticated ? (
                            <button
                              onClick={() => apply(job.id)}
                              disabled={acting === job.id}
                              className="flex items-center gap-1.5 rounded-lg bg-sky-500/20 border border-sky-500/30 px-4 py-2 font-mono text-xs text-sky-300 hover:bg-sky-500/30 disabled:opacity-50"
                            >
                              {acting === job.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                              Apply Now
                            </button>
                          ) : (
                            <a href="/login" className="flex items-center gap-1.5 rounded-lg bg-sky-500/20 border border-sky-500/30 px-4 py-2 font-mono text-xs text-sky-300">
                              Sign in to Apply
                            </a>
                          )}
                          <span className="font-mono text-[10px] text-zinc-600">{job.applicantCount} applicant{job.applicantCount !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── MY APPLICATIONS TAB ───────────────────────────────────────────── */}
        {tab === 'my-applications' && (
          <div className="space-y-3">
            {applications.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 py-12 text-center">
                <FileText size={24} className="mx-auto mb-3 text-zinc-700" />
                <p className="font-mono text-sm text-zinc-600">No applications yet.</p>
                <p className="mt-1 text-xs text-zinc-700">Browse open jobs and hit Apply.</p>
              </div>
            ) : applications.map(app => (
              <div key={app.id} className="rounded-xl border border-white/10 bg-zinc-900 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-sm font-semibold text-zinc-100">{app.postingTitle}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                      <span className="flex items-center gap-1"><Building2 size={11} />{app.orgName}</span>
                      {app.postingIndustry && <span>{app.postingIndustry}</span>}
                      <span className="flex items-center gap-1"><DollarSign size={11} />{fiat(app.postingPayRate)}/hr</span>
                      <span className="flex items-center gap-1"><Clock size={11} />{relativeTime(app.createdAt)}</span>
                    </div>
                  </div>
                  <StatusBadge status={app.status} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── MY CONTRACTS TAB ─────────────────────────────────────────────── */}
        {tab === 'my-contracts' && (
          <div className="space-y-3">
            {contracts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 py-12 text-center">
                <Zap size={24} className="mx-auto mb-3 text-zinc-700" />
                <p className="font-mono text-sm text-zinc-600">No employment contracts yet.</p>
                <p className="mt-1 text-xs text-zinc-700">Apply for a job and wait for an org to extend an offer.</p>
              </div>
            ) : contracts.map(c => (
              <div key={c.id} className={`rounded-xl border bg-zinc-900 p-4 ${c.status === 'pending' ? 'border-fuchsia-500/40' : 'border-white/10'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm font-semibold text-zinc-100">{c.roleTitle}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                      <span className="flex items-center gap-1"><Building2 size={11} />{c.orgName}</span>
                      {c.orgIndustry && <span>{c.orgIndustry}</span>}
                      <span className="flex items-center gap-1"><TrendingUp size={11} />{fiat(c.payRateFiat)}/hr</span>
                      {c.startedAt && <span className="flex items-center gap-1"><Clock size={11} />Started {relativeTime(c.startedAt)}</span>}
                      {c.severancePaid && <span className="text-amber-400">Severance paid</span>}
                    </div>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
                {c.status === 'pending' && (
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => acceptContract(c.id)} disabled={acting === c.id} className="flex items-center gap-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 px-3 py-1.5 font-mono text-xs text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50">
                      {acting === c.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                      Accept
                    </button>
                    <button onClick={() => declineContract(c.id)} disabled={acting === c.id} className="flex items-center gap-1.5 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-1.5 font-mono text-xs text-red-300 hover:bg-red-500/20 disabled:opacity-50">
                      <XCircle size={12} /> Decline
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── POST A JOB TAB ───────────────────────────────────────────────── */}
        {tab === 'post-jobs' && (
          <div className="space-y-5">
            {/* Org selector */}
            <Card title="Select Your Org" icon={<Building2 size={13} />}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {managerOrgs.map(o => (
                  <button key={o.orgId} onClick={() => setSelectedOrgId(o.orgId)}
                    className={`rounded-lg border p-3 text-left transition-colors ${selectedOrgId === o.orgId ? 'border-sky-500/50 bg-sky-500/10' : 'border-white/10 bg-zinc-900 hover:border-white/20'}`}>
                    <div className="font-mono text-sm text-zinc-200">{o.orgName}</div>
                    <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">{o.role}</div>
                  </button>
                ))}
              </div>
            </Card>

            {selectedOrgId && (
              <>
                {/* Create posting form */}
                <Card title="Post New Opening" icon={<Plus size={13} />}>
                  <div className="space-y-4">
                    <div>
                      <label className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 block mb-1">Job Title *</label>
                      <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Senior Netrunner" className="w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-sky-500/50 focus:outline-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 block mb-1">Industry</label>
                        <select value={newIndustry} onChange={e => setNewIndustry(e.target.value)} className="w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-sky-500/50 focus:outline-none">
                          <option value="">— select —</option>
                          {INDUSTRIES.filter(i => i).map(i => <option key={i} value={i}>{i}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 block mb-1">Pay Rate (ƒ/hr)</label>
                        <input type="number" min="0" value={newPay} onChange={e => setNewPay(e.target.value)} placeholder="0" className="w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-sky-500/50 focus:outline-none" />
                      </div>
                    </div>
                    <div>
                      <label className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 block mb-1">Slots Available</label>
                      <input type="number" min="1" value={newSlots} onChange={e => setNewSlots(e.target.value)} className="w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-sky-500/50 focus:outline-none" />
                    </div>
                    <div>
                      <label className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 block mb-1">Description</label>
                      <textarea rows={4} value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="What does this role involve?" className="w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-sky-500/50 focus:outline-none resize-none" />
                    </div>
                    {postOk && <p className="font-mono text-xs text-emerald-400">✓ Job posted successfully!</p>}
                    <button onClick={createPosting} disabled={posting || !newTitle.trim()} className="flex items-center gap-2 rounded-lg bg-sky-500/20 border border-sky-500/30 px-5 py-2.5 font-mono text-xs uppercase tracking-widest text-sky-300 hover:bg-sky-500/30 disabled:opacity-50">
                      {posting ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                      Post Opening
                    </button>
                  </div>
                </Card>

                {/* Existing postings with applicant management */}
                {orgPostings.length > 0 && (
                  <Card title="Your Active Postings" icon={<FileText size={13} />}>
                    <div className="space-y-3">
                      {orgPostings.map(p => (
                        <div key={p.id}>
                          <button className="w-full text-left rounded-lg border border-white/10 bg-zinc-800/50 p-3 hover:border-white/20" onClick={() => setSelectedPosting(selectedPosting?.id === p.id ? null : p)}>
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-mono text-sm text-zinc-100">{p.title}</div>
                                <div className="mt-0.5 font-mono text-xs text-zinc-500">{fiat(p.payRateFiat)}/hr · {p.slots} slot{p.slots !== 1 ? 's' : ''} · {p.applicantCount} applicant{p.applicantCount !== 1 ? 's' : ''}</div>
                              </div>
                              <StatusBadge status={p.status} />
                            </div>
                          </button>
                          {selectedPosting?.id === p.id && applicants.length > 0 && (
                            <div className="mt-2 space-y-2 pl-3">
                              <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Applicants</div>
                              {applicants.map(a => (
                                <div key={a.application.id} className="flex items-center justify-between rounded-lg border border-white/5 bg-zinc-900 px-3 py-2">
                                  <div>
                                    <div className="text-sm text-zinc-200">{[a.firstName, a.lastName].filter(Boolean).join(' ') || a.email || 'Anonymous'}</div>
                                    <div className="font-mono text-xs text-zinc-600">{a.application.coverNote?.slice(0, 60) || 'No cover note'}</div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <StatusBadge status={a.application.status} />
                                    {a.application.status === 'pending' && (
                                      <button onClick={() => { setOfferModal({ applicant: a, posting: p }); setOfferRole(p.title); setOfferPay(p.payRateFiat); }} className="rounded border border-fuchsia-500/30 bg-fuchsia-500/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-fuchsia-300 hover:bg-fuchsia-500/20">
                                        Offer
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </>
            )}
          </div>
        )}

        {/* ── ORG CONTRACTS TAB ────────────────────────────────────────────── */}
        {tab === 'org-contracts' && (
          <div className="space-y-4">
            {/* Org selector */}
            <Card title="Select Your Org" icon={<Building2 size={13} />}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {managerOrgs.map(o => (
                  <button key={o.orgId} onClick={() => setSelectedOrgId(o.orgId)}
                    className={`rounded-lg border p-3 text-left transition-colors ${selectedOrgId === o.orgId ? 'border-sky-500/50 bg-sky-500/10' : 'border-white/10 bg-zinc-900 hover:border-white/20'}`}>
                    <div className="font-mono text-sm text-zinc-200">{o.orgName}</div>
                    <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">{o.role}</div>
                  </button>
                ))}
              </div>
            </Card>

            {selectedOrgId && orgContracts.length === 0 && (
              <div className="rounded-xl border border-dashed border-white/10 py-12 text-center">
                <Users size={24} className="mx-auto mb-3 text-zinc-700" />
                <p className="font-mono text-sm text-zinc-600">No active employment contracts.</p>
                <p className="mt-1 text-xs text-zinc-700">Post a job, find applicants, and extend offers to build your team.</p>
              </div>
            )}
            {orgContracts.map(c => (
              <div key={c.id} className="rounded-xl border border-white/10 bg-zinc-900 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm font-semibold text-zinc-100">{c.roleTitle}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                      <span className="text-zinc-300">{(c as any).firstName ? `${(c as any).firstName} ${(c as any).lastName ?? ''}`.trim() : (c as any).email ?? 'Employee'}</span>
                      <span className="flex items-center gap-1"><TrendingUp size={11} />{fiat(c.payRateFiat)}/hr</span>
                      {c.startedAt && <span className="flex items-center gap-1"><Clock size={11} />Since {relativeTime(c.startedAt)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={c.status} />
                    {c.status === 'active' && (
                      <button onClick={() => terminateContract(c.id)} disabled={acting === c.id} className="rounded border border-red-500/30 bg-red-500/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-red-300 hover:bg-red-500/20 disabled:opacity-50">
                        {acting === c.id ? '…' : 'Terminate'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Offer modal ──────────────────────────────────────────────────────── */}
      {offerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-white/15 bg-zinc-900 p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="font-mono text-sm font-bold text-zinc-100">Send Offer</div>
              <button onClick={() => setOfferModal(null)}><X size={16} className="text-zinc-500 hover:text-zinc-300" /></button>
            </div>
            <p className="mb-4 text-xs text-zinc-500">
              Sending offer to <span className="text-zinc-300">{[offerModal.applicant.firstName, offerModal.applicant.lastName].filter(Boolean).join(' ') || offerModal.applicant.email}</span> for <span className="text-zinc-300">{offerModal.posting.title}</span>.
            </p>
            <div className="space-y-3">
              <div>
                <label className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 block mb-1">Role Title</label>
                <input value={offerRole} onChange={e => setOfferRole(e.target.value)} className="w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-sky-500/50 focus:outline-none" />
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 block mb-1">Pay Rate (ƒ/hr)</label>
                <input type="number" min="0" value={offerPay} onChange={e => setOfferPay(e.target.value)} className="w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-sky-500/50 focus:outline-none" />
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button onClick={sendOffer} disabled={offerBusy} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-fuchsia-500/20 border border-fuchsia-500/30 py-2.5 font-mono text-xs uppercase tracking-widest text-fuchsia-300 hover:bg-fuchsia-500/30 disabled:opacity-50">
                {offerBusy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                Send Offer
              </button>
              <button onClick={() => setOfferModal(null)} className="rounded-lg border border-white/10 px-4 py-2.5 font-mono text-xs text-zinc-500 hover:text-zinc-300">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
