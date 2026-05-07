import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Briefcase, Users, CalendarDays, Archive, FileText, TrendingUp,
  DollarSign, Receipt, CreditCard, Scale, Shield, Code2, Loader2, Landmark,
  ArrowRight, Building2, RefreshCw, AlertTriangle, CheckCircle2,
  ArrowUpRight, ArrowDownRight, Megaphone, Target, Search,
  BarChart2, LayoutDashboard, Bot, Zap, Clock, Phone,
  Lightbulb, BookOpen, Star, Info, Plus, X, UserPlus,
  Edit2, Trash2, Check, Copy, ChevronDown, Mail, Crown,
  Save, ClipboardList, Store, Timer, Handshake, ScrollText,
} from 'lucide-react';
import { useAuth } from '@workspace/replit-auth-web';
import { SignInPage } from '@/components/SignInPrompt';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { invalidateOrgCache } from '@/hooks/use-org';
import { Link } from 'wouter';

interface Org {
  id: number;
  name: string;
  industry: string | null;
  size: string | null;
  ownerUserId: string | null;
}

interface Member {
  orgId: number;
  userId: string;
  role: string;
  status: string;
  title: string | null;
  salary: string | null;
  department: string | null;
  joinedAt: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  username: string | null;
}

interface OrgData {
  org: Org | null;
  member: Member | null;
  members: Member[];
  allOrgs: { membership: Member; organization: Org | null }[];
}

interface Summary {
  employees: { active: number };
  bills: { total: number; pending: number; overdue: number };
  expenses: { total: number; amount: number };
  invoices: { total: number; paid: number; open: number; overdue: number };
  payroll: { runs: number; total: number };
  financials: { grossIncome: number; payrollTotal: number; billsTotal: number; expensesTotal: number; netProfit: number };
}

const ROLES = ['ceo', 'executive', 'director', 'manager', 'specialist'] as const;
const INDUSTRIES = ['Technology', 'Finance', 'Healthcare', 'Insurance', 'Legal', 'Real Estate', 'Marketing', 'Consulting', 'Education', 'Retail', 'Manufacturing', 'Media', 'Other'];
const SIZES = ['1-10', '11-50', '51-200', '201-500', '500+'];

const SECTIONS = [
  {
    title: 'PEOPLE & OPERATIONS',
    subtitle: 'MANAGE YOUR TEAM, CONTACTS, AND DAY-TO-DAY OPERATIONS',
    items: [
      { path: '/business/team', label: 'TEAM DIRECTORY', boomer: 'TEAM DIRECTORY', desc: 'COMPLETE ORG VIEW — ROLES, DEPARTMENTS, COMPENSATION.', icon: Users, color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
      { path: '/business/contacts', label: 'CONTACTS', boomer: 'CONTACTS', desc: 'MANAGE YOUR CONTACT DATABASE, COMPANY RELATIONSHIPS, AND INTERACTION HISTORY.', icon: Users, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
      { path: '/business/hiring', label: 'HIRING', boomer: 'HIRING & HR', desc: 'POST JOBS, TRACK APPLICANTS, MANAGE STAFF DIRECTORY AND ONBOARDING.', icon: Briefcase, color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
      { path: '/business/interview', label: 'INTERVIEW OFFICE', boomer: 'INTERVIEW OFFICE', desc: 'AI-POWERED INTERVIEWS AND TECHNICAL ASSESSMENTS.', icon: Code2, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' },
      { path: '/business/tasks', label: 'TASK BOARD', boomer: 'TASK BOARD', desc: 'ASSIGN TASKS, SET PRIORITIES, TRACK PROGRESS AND DEADLINES.', icon: ClipboardList, color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
      { path: '/business/time-tracking', label: 'TIME TRACKING', boomer: 'TIME TRACKING', desc: 'CLOCK IN/OUT, TIMESHEETS, BILLABLE HOURS, RATE TRACKING.', icon: Timer, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' },
      { path: '/business/announcements', label: 'ANNOUNCEMENTS', boomer: 'ANNOUNCEMENTS', desc: 'COMPANY-WIDE UPDATES, POLICY CHANGES, AND TEAM BROADCASTS.', icon: Megaphone, color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
      { path: '/business/calendar', label: 'CALENDAR', boomer: 'CALENDAR', desc: 'SCHEDULE MEETINGS, DEADLINES, AND EVENTS.', icon: CalendarDays, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
      { path: '/business/documents', label: 'DOCUMENTS', boomer: 'DOCUMENTS', desc: 'STORE AND ORGANIZE YOUR BUSINESS FILES.', icon: Archive, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
      { path: '/business/contracts', label: 'CONTRACTS', boomer: 'CONTRACTS', desc: 'AI-DRAFT NDAs, MSAs, EMPLOYMENT, CONTRACTOR, LEASES, PARTNERSHIPS, LICENSING. PABLO REVIEWS RISK.', icon: ScrollText, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
      { path: '/business/partnerships', label: 'PARTNERSHIPS', boomer: 'PARTNERSHIPS', desc: 'CONNECT WITH OTHER ORGANIZATIONS. SHARED OFFICES, RENTAL AGREEMENTS, AND CROSS-ORG MANAGEMENT.', icon: Handshake, color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
    ],
  },
  {
    title: 'SALES & REVENUE',
    subtitle: 'PIPELINE, INVOICING, AND LEAD MANAGEMENT',
    items: [
      { path: '/business/deals', label: 'DEALS', boomer: 'DEALS', desc: 'KANBAN SALES PIPELINE FROM LEAD TO CLOSE.', icon: TrendingUp, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
      { path: '/business/invoices', label: 'INVOICES', boomer: 'INVOICES', desc: 'CREATE AND MANAGE CLIENT BILLING AND RECEIVABLES.', icon: FileText, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
      { path: '/business/estimates', label: 'ESTIMATES', boomer: 'ESTIMATES & QUOTES', desc: 'CREATE QUOTES AND PROPOSALS BEFORE INVOICING CLIENTS.', icon: FileText, color: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/20' },
      { path: '/marketing/leads', label: 'LEADS', boomer: 'LEAD DATABASE', desc: 'PROSPECT DATABASE WITH SCORING AND QUALIFICATION.', icon: Target, color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
    ],
  },
  {
    title: 'FINANCIALS',
    subtitle: 'PAYROLL, BILLS, EXPENSES, AND P&L',
    items: [
      { path: '/business/payroll', label: 'PAYROLL', boomer: 'PAYROLL', desc: 'EMPLOYEE COMPENSATION AND PAYROLL RUNS.', icon: DollarSign, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
      { path: '/business/gusto', label: 'GUSTO PAYROLL', boomer: 'GUSTO PAYROLL', desc: 'LIVE GUSTO DATA — EMPLOYEES, PAY RUNS, TAXES.', icon: Landmark, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
      { path: '/business/bills', label: 'BILLS', boomer: 'BILLS', desc: 'ACCOUNTS PAYABLE WITH VENDOR TRACKING.', icon: Receipt, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
      { path: '/business/expenses', label: 'EXPENSES', boomer: 'EXPENSES', desc: 'CATEGORIZED SPENDING WITH RECEIPT TRACKING.', icon: CreditCard, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
      { path: '/business/vendors', label: 'VENDORS', boomer: 'VENDOR DIRECTORY', desc: 'MANAGE VENDOR CONTACTS, PAYMENT TERMS, AND RELATIONSHIPS.', icon: Store, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
      { path: '/business/profit-loss', label: 'P&L', boomer: 'PROFIT & LOSS', desc: 'INCOME STATEMENT — REVENUE, COSTS, AND NET PROFIT.', icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
      { path: '/business/balance-sheet', label: 'BALANCE SHEET', boomer: 'BALANCE SHEET', desc: 'COMPLETE FINANCIAL OVERVIEW AND LEDGER.', icon: Scale, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
    ],
  },
  {
    title: 'MARKETING & GROWTH',
    subtitle: 'CAMPAIGNS, SEO, AND OUTREACH',
    items: [
      { path: '/marketing/campaigns', label: 'CAMPAIGNS', boomer: 'CAMPAIGNS', desc: 'MARKETING CAMPAIGN MANAGEMENT AND OUTREACH.', icon: Megaphone, color: 'text-pink-400', bg: 'bg-pink-500/10', border: 'border-pink-500/20' },
      { path: '/marketing/seo', label: 'SEO', boomer: 'SEO', desc: 'SITE AUDIT, KEYWORD RESEARCH, AND OPTIMIZATION.', icon: Search, color: 'text-lime-400', bg: 'bg-lime-500/10', border: 'border-lime-500/20' },
    ],
  },
  {
    title: 'ANALYTICS & AI',
    subtitle: 'REPORTS, DASHBOARDS, BOTS, AND AUTOMATION',
    items: [
      { path: '/intel/reports', label: 'REPORTS', boomer: 'REPORTS', desc: 'BUSINESS INTELLIGENCE AND DATA VISUALIZATION.', icon: BarChart2, color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
      { path: '/intel/dashboard', label: 'DASHBOARD', boomer: 'DASHBOARD', desc: 'REAL-TIME KPI COMMAND DASHBOARD.', icon: LayoutDashboard, color: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/20' },
      { path: '/bots', label: 'BOT FACTORY', boomer: 'BOT FACTORY', desc: '77 SPECIALIZED AI BOTS BY PIXEL AGENTS.', icon: Bot, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
      { path: '/insurance', label: 'INSURANCE API', boomer: 'INSURANCE API', desc: 'SEARCH AND COMPARE INSURANCE CARRIERS.', icon: Shield, color: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/20', requireIndustry: 'Insurance' },
    ],
  },
];

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function Field({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors" />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export default function BusinessHub() {
  const { isAuthenticated, user } = useAuth();
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());
  const [orgData, setOrgData] = useState<OrgData | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', industry: '', size: '' });
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteInput, setInviteInput] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [copied, setCopied] = useState(false);

  const [editingOrg, setEditingOrg] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', industry: '', size: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [memberEditForm, setMemberEditForm] = useState({ role: '', title: '', salary: '' });
  const [memberSaving, setMemberSaving] = useState(false);

  const [showOrgSwitcher, setShowOrgSwitcher] = useState(false);
  const [memberError, setMemberError] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(() => {
    try { const v = localStorage.getItem('sm_active_org'); return v ? parseInt(v) : null; } catch { return null; }
  });

  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'sm_boomer') setBoomerMode(e.newValue === '1'); };
    window.addEventListener('storage', onStorage);
    const id = setInterval(() => { try { setBoomerMode(localStorage.getItem('sm_boomer') === '1'); } catch {} }, 2000);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(id); };
  }, []);

  const loadData = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    setLoading(true);
    try {
      const [orgRes, sumRes] = await Promise.all([
        apiFetch('/api/orgs/me'),
        apiFetch('/api/enterprise/summary'),
      ]);
      if (orgRes.ok) {
        const data = await orgRes.json();
        if (selectedOrgId && data.allOrgs?.some((a: { organization: Org | null }) => a.organization?.id === selectedOrgId)) {
          const target = data.allOrgs.find((a: { organization: Org | null }) => a.organization?.id === selectedOrgId);
          if (target?.organization) {
            try {
              const detailRes = await apiFetch(`/api/orgs/${selectedOrgId}`);
              if (detailRes.ok) {
                const detail = await detailRes.json();
                data.org = target.organization;
                data.member = target.membership;
                data.members = detail.members ?? [];
              }
            } catch {}
          }
        } else if (data.org?.id) {
          try {
            const detailRes = await apiFetch(`/api/orgs/${data.org.id}`);
            if (detailRes.ok) {
              const detail = await detailRes.json();
              data.members = detail.members ?? [];
            }
          } catch {}
        }
        setOrgData(data);
      }
      if (sumRes.ok) setSummary(await sumRes.json());
    } catch {}
    setLoading(false);
  }, [isAuthenticated, selectedOrgId]);

  useEffect(() => { loadData(); }, [loadData]);

  if (!isAuthenticated) return <SignInPage />;

  const activeOrg = orgData?.org;
  const activeMember = orgData?.member;
  const allOrgs = orgData?.allOrgs ?? [];
  const members = orgData?.members ?? [];
  const activeMembers = members.filter(m => m.status === 'active');
  const isManager = activeMember && ['owner', 'ceo', 'executive', 'director', 'manager'].includes(activeMember.role);
  const isOwner = activeMember?.role === 'owner';
  const netProfit = summary?.financials?.netProfit ?? 0;
  const isPositive = netProfit >= 0;

  const handleCreateOrg = async () => {
    if (!createForm.name.trim()) { setCreateError('BUSINESS NAME IS REQUIRED'); return; }
    if (createForm.name.trim().length < 2) { setCreateError('NAME MUST BE AT LEAST 2 CHARACTERS'); return; }
    setCreating(true);
    setCreateError('');
    try {
      const res = await apiFetch('/api/orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: createForm.name.trim(), industry: createForm.industry || undefined, size: createForm.size || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setCreateError(data.error || 'CREATION FAILED'); setCreating(false); return; }
      setShowCreateOrg(false);
      setCreateForm({ name: '', industry: '', size: '' });
      invalidateOrgCache();
      await loadData();
    } catch { setCreateError('NETWORK ERROR'); }
    setCreating(false);
  };

  const handleInvite = async () => {
    if (!inviteInput.trim() || !activeOrg) return;
    setInviting(true);
    setInviteError('');
    setInviteUrl('');
    const isEmail = inviteInput.includes('@');
    try {
      const res = await apiFetch(`/api/orgs/${activeOrg.id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEmail ? { email: inviteInput.trim() } : { username: inviteInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setInviteError(data.error || 'INVITE FAILED'); setInviting(false); return; }
      setInviteUrl(data.inviteUrl || '');
      setInviteInput('');
    } catch { setInviteError('NETWORK ERROR'); }
    setInviting(false);
  };

  const handleEditOrg = async () => {
    if (!activeOrg) return;
    setEditSaving(true);
    setEditError('');
    try {
      const res = await apiFetch(`/api/orgs/${activeOrg.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editForm.name || undefined, industry: editForm.industry, size: editForm.size }),
      });
      const data = await res.json();
      if (!res.ok) { setEditError(data.error || 'UPDATE FAILED'); setEditSaving(false); return; }
      setEditingOrg(false);
      invalidateOrgCache();
      await loadData();
    } catch { setEditError('NETWORK ERROR'); }
    setEditSaving(false);
  };

  const handleUpdateMember = async (userId: string) => {
    if (!activeOrg) return;
    setMemberSaving(true);
    setMemberError('');
    try {
      const body: Record<string, string | null> = {};
      if (memberEditForm.role) body.role = memberEditForm.role;
      if (memberEditForm.title !== undefined) body.title = memberEditForm.title || null;
      if (memberEditForm.salary !== undefined) body.salary = memberEditForm.salary || null;
      const res = await apiFetch(`/api/orgs/${activeOrg.id}/members/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) { setEditingMember(null); await loadData(); }
      else { const data = await res.json().catch(() => ({})); setMemberError(data.error || 'UPDATE FAILED'); }
    } catch { setMemberError('NETWORK ERROR'); }
    setMemberSaving(false);
  };

  const handleRemoveMember = async (userId: string) => {
    if (!activeOrg) return;
    setMemberError('');
    try {
      const res = await apiFetch(`/api/orgs/${activeOrg.id}/members/${userId}`, { method: 'DELETE' });
      if (res.ok) await loadData();
      else { const data = await res.json().catch(() => ({})); setMemberError(data.error || 'REMOVE FAILED'); }
    } catch { setMemberError('NETWORK ERROR'); }
  };

  const copyInviteUrl = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const switchOrg = async (orgId: number) => {
    setShowOrgSwitcher(false);
    setSelectedOrgId(orgId);
    try { localStorage.setItem('sm_active_org', String(orgId)); } catch {}
    const target = allOrgs.find(a => a.organization?.id === orgId);
    if (target?.organization) {
      setOrgData(prev => prev ? { ...prev, org: target.organization, member: target.membership } : prev);
      try {
        const detailRes = await apiFetch(`/api/orgs/${orgId}`);
        if (detailRes.ok) {
          const detail = await detailRes.json();
          setOrgData(prev => prev ? { ...prev, org: target.organization, member: target.membership, members: detail.members ?? [] } : prev);
        }
      } catch {}
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      <div className="absolute inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-violet-500/5 rounded-full blur-[120px]" />
      </div>

      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Briefcase className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-wider uppercase">{boomerMode ? 'BUSINESS MANAGEMENT' : 'OPS-CORE // COMMAND'}</h1>
            <p className="text-xs text-muted-foreground tracking-wider uppercase">
              {activeOrg ? activeOrg.name : 'YOUR BUSINESS HEADQUARTERS'}
            </p>
          </div>
        </div>
        <button onClick={loadData} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/30 border border-border/50 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all">
          <RefreshCw className="w-3.5 h-3.5" /> REFRESH
        </button>
      </motion.div>

      {allOrgs.length > 1 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }}>
          <button
            onClick={() => setShowOrgSwitcher(!showOrgSwitcher)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-card/50 border border-border/50 hover:border-primary/30 transition-all"
          >
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider">SWITCH BUSINESS</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">({allOrgs.length} ORGANIZATIONS)</span>
            </div>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showOrgSwitcher ? 'rotate-180' : ''}`} />
          </button>
          <AnimatePresence>
            {showOrgSwitcher && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="mt-2 rounded-xl bg-card/50 border border-border/50 divide-y divide-border/30">
                  {allOrgs.map((entry) => {
                    const org = entry.organization;
                    if (!org) return null;
                    const isActive = org.id === activeOrg?.id;
                    return (
                      <button
                        key={org.id}
                        onClick={() => switchOrg(org.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/10 transition-colors ${isActive ? 'bg-primary/5' : ''}`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isActive ? 'bg-primary/20 border border-primary/30' : 'bg-muted/20 border border-border/30'}`}>
                          <Building2 className={`w-4 h-4 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-bold uppercase tracking-wider">{org.name}</div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                            {entry.membership.role} {org.industry ? `· ${org.industry}` : ''}
                          </div>
                        </div>
                        {isActive && <Check className="w-4 h-4 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {activeOrg && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="rounded-xl bg-card/50 border border-border/50 p-4">
          {editingOrg ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-primary">EDIT BUSINESS DETAILS</span>
                <button onClick={() => setEditingOrg(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
              </div>
              <Field label="BUSINESS NAME" value={editForm.name} onChange={v => setEditForm(f => ({ ...f, name: v }))} placeholder={activeOrg.name} />
              <SelectField label="INDUSTRY" value={editForm.industry} onChange={v => setEditForm(f => ({ ...f, industry: v }))}
                options={[{ value: '', label: '— SELECT —' }, ...INDUSTRIES.map(i => ({ value: i, label: i.toUpperCase() }))]} />
              <SelectField label="COMPANY SIZE" value={editForm.size} onChange={v => setEditForm(f => ({ ...f, size: v }))}
                options={[{ value: '', label: '— SELECT —' }, ...SIZES.map(s => ({ value: s, label: s + ' EMPLOYEES' }))]} />
              {editError && <p className="text-[10px] text-red-400 font-bold uppercase tracking-wider">{editError}</p>}
              <button onClick={handleEditOrg} disabled={editSaving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider hover:bg-primary/90 transition-colors disabled:opacity-50">
                {editSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} SAVE CHANGES
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-4 flex-wrap">
              <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Building2 className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1 min-w-[200px]">
                <div className="text-sm font-bold tracking-wider uppercase">{activeOrg.name}</div>
                <div className="text-xs text-muted-foreground tracking-wider uppercase">
                  {activeOrg.industry || 'NO INDUSTRY SET'} {activeOrg.size ? `· ${activeOrg.size}` : ''}
                </div>
              </div>
              {activeMember && (
                <div className="text-right">
                  <div className="text-xs font-bold uppercase tracking-wider text-primary">{activeMember.role}</div>
                  {activeMember.title && <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{activeMember.title}</div>}
                </div>
              )}
              {activeMembers.length > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/20 border border-border/30">
                  <Users className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-bold text-muted-foreground">{activeMembers.length} MEMBERS</span>
                </div>
              )}
              {isManager && (
                <button
                  onClick={() => { setEditForm({ name: activeOrg.name, industry: activeOrg.industry || '', size: activeOrg.size || '' }); setEditingOrg(true); setEditError(''); }}
                  className="p-2 rounded-lg hover:bg-muted/20 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </motion.div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : (
        <>
          {summary && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-xl bg-card/50 border border-border/50 p-4 space-y-4">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-primary" />
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em]">FINANCIAL SNAPSHOT</span>
              </div>
              <div className="space-y-3">
                <StatRow label="NET PROFIT" value={fmt(Math.abs(netProfit))} prefix={isPositive ? '+' : '-'} icon={isPositive ? ArrowUpRight : ArrowDownRight} color={isPositive ? 'text-emerald-400' : 'text-red-400'} bg={isPositive ? 'bg-emerald-500/10' : 'bg-red-500/10'} border={isPositive ? 'border-emerald-500/20' : 'border-red-500/20'} highlight />
                <StatRow label="GROSS INCOME" value={fmt(summary.financials.grossIncome)} icon={DollarSign} color="text-sky-400" bg="bg-sky-500/10" border="border-sky-500/20" />
                <StatRow label="TOTAL OUTGOINGS" value={fmt(summary.financials.payrollTotal + summary.financials.billsTotal + summary.financials.expensesTotal)} icon={ArrowDownRight} color="text-amber-400" bg="bg-amber-500/10" border="border-amber-500/20" />
                <div className="border-t border-border/30 pt-3 space-y-2">
                  <StatRow label="PAYROLL" value={fmt(summary.payroll.total)} sub={`${summary.payroll.runs} RUNS`} icon={DollarSign} color="text-blue-400" bg="bg-blue-500/10" border="border-blue-500/20" />
                  <StatRow label="BILLS" value={fmt(summary.financials.billsTotal)} sub={summary.bills.overdue > 0 ? `${summary.bills.overdue} OVERDUE` : `${summary.bills.total} TOTAL`} subColor={summary.bills.overdue > 0 ? 'text-red-400' : undefined} icon={Receipt} color="text-orange-400" bg="bg-orange-500/10" border="border-orange-500/20" />
                  <StatRow label="EXPENSES" value={fmt(summary.expenses.amount)} sub={`${summary.expenses.total} ENTRIES`} icon={CreditCard} color="text-purple-400" bg="bg-purple-500/10" border="border-purple-500/20" />
                </div>
                <div className="border-t border-border/30 pt-3 space-y-2">
                  <StatRow label="INVOICES" value={String(summary.invoices.total)} sub={summary.invoices.open > 0 ? `${summary.invoices.open} OPEN` : `${summary.invoices.paid} PAID`} icon={FileText} color="text-emerald-400" bg="bg-emerald-500/10" border="border-emerald-500/20" />
                  <StatRow label="EMPLOYEES" value={String(summary.employees.active)} sub="ACTIVE" icon={Users} color="text-violet-400" bg="bg-violet-500/10" border="border-violet-500/20" />
                </div>
              </div>
            </motion.div>
          )}

          {summary && (summary.bills.overdue > 0 || summary.invoices.overdue > 0 || summary.invoices.open > 0) && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400">ACTION REQUIRED</span>
              </div>
              <div className="space-y-2">
                {summary.bills.overdue > 0 && (
                  <Link href="/business/bills" className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs font-bold uppercase tracking-wider text-red-400 hover:bg-red-500/20 transition-colors">
                    <Receipt className="w-4 h-4 flex-shrink-0" /> <span className="flex-1">{summary.bills.overdue} OVERDUE {summary.bills.overdue === 1 ? 'BILL' : 'BILLS'}</span> <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                )}
                {summary.invoices.overdue > 0 && (
                  <Link href="/business/invoices" className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs font-bold uppercase tracking-wider text-red-400 hover:bg-red-500/20 transition-colors">
                    <FileText className="w-4 h-4 flex-shrink-0" /> <span className="flex-1">{summary.invoices.overdue} OVERDUE {summary.invoices.overdue === 1 ? 'INVOICE' : 'INVOICES'}</span> <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                )}
                {summary.invoices.open > 0 && (
                  <Link href="/business/invoices" className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs font-bold uppercase tracking-wider text-amber-400 hover:bg-amber-500/20 transition-colors">
                    <FileText className="w-4 h-4 flex-shrink-0" /> <span className="flex-1">{summary.invoices.open} OPEN {summary.invoices.open === 1 ? 'INVOICE' : 'INVOICES'}</span> <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>
            </motion.div>
          )}

          {activeOrg && activeMember && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }} className="rounded-xl bg-card/50 border border-border/50 overflow-hidden">
              <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" />
                    <h2 className="text-xs font-bold uppercase tracking-[0.15em]">TEAM ROSTER</h2>
                  </div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{activeMembers.length} ACTIVE MEMBER{activeMembers.length !== 1 ? 'S' : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  {!isOwner && (
                    <button onClick={() => { if (confirm('Are you sure you want to leave this organization?')) handleRemoveMember(user?.id ?? ''); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-[10px] font-bold uppercase tracking-wider text-red-400 hover:bg-red-500/20 transition-colors">
                      LEAVE ORG
                    </button>
                  )}
                  {isManager && (
                    <button onClick={() => { setShowInvite(!showInvite); setInviteUrl(''); setInviteError(''); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary/20 transition-colors">
                      <UserPlus className="w-3.5 h-3.5" /> INVITE
                    </button>
                  )}
                </div>
              </div>

              <AnimatePresence>
                {showInvite && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="px-4 pb-3 space-y-2">
                      <div className="flex gap-2">
                        <input
                          value={inviteInput} onChange={e => setInviteInput(e.target.value)} placeholder="EMAIL OR USERNAME"
                          className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50"
                          onKeyDown={e => e.key === 'Enter' && handleInvite()}
                        />
                        <button onClick={handleInvite} disabled={inviting || !inviteInput.trim()}
                          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider hover:bg-primary/90 disabled:opacity-50">
                          {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'SEND'}
                        </button>
                      </div>
                      {inviteError && <p className="text-[10px] text-red-400 font-bold uppercase tracking-wider">{inviteError}</p>}
                      {inviteUrl && (
                        <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                          <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider flex-1 truncate">INVITE LINK GENERATED</span>
                          <button onClick={copyInviteUrl} className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider hover:bg-emerald-500/30">
                            {copied ? <><Check className="w-3 h-3" /> COPIED</> : <><Copy className="w-3 h-3" /> COPY LINK</>}
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {memberError && (
                <div className="px-4 py-2">
                  <p className="text-[10px] text-red-400 font-bold uppercase tracking-wider">{memberError}</p>
                </div>
              )}
              <div className="divide-y divide-border/30">
                {activeMembers.map((m) => {
                  const isEditing = editingMember === m.userId;
                  const isSelf = m.userId === user?.id;
                  const canEdit = isManager && m.role !== 'owner' && !isSelf;
                  return (
                    <div key={m.userId} className="px-4 py-3">
                      {isEditing ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-primary">EDITING MEMBER</span>
                            <button onClick={() => setEditingMember(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <SelectField label="ROLE" value={memberEditForm.role} onChange={v => setMemberEditForm(f => ({ ...f, role: v }))}
                              options={ROLES.map(r => ({ value: r, label: r.toUpperCase() }))} />
                            <Field label="TITLE" value={memberEditForm.title} onChange={v => setMemberEditForm(f => ({ ...f, title: v }))} placeholder="JOB TITLE" />
                            <Field label="SALARY" value={memberEditForm.salary} onChange={v => setMemberEditForm(f => ({ ...f, salary: v }))} placeholder="0.00" type="number" />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleUpdateMember(m.userId)} disabled={memberSaving}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider hover:bg-primary/90 disabled:opacity-50">
                              {memberSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} SAVE
                            </button>
                            <button onClick={() => handleRemoveMember(m.userId)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-[10px] font-bold uppercase tracking-wider text-red-400 hover:bg-red-500/20">
                              <Trash2 className="w-3 h-3" /> REMOVE
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden ${m.role === 'owner' ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-muted/20 border border-border/30'}`}>
                            {m.profileImageUrl ? (
                              <img src={m.profileImageUrl} alt="" className="w-full h-full object-cover" />
                            ) : m.role === 'owner' ? <Crown className="w-4 h-4 text-amber-400" /> : <Users className="w-4 h-4 text-muted-foreground" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold uppercase tracking-wider">
                                {m.firstName ? `${m.firstName}${m.lastName ? ` ${m.lastName}` : ''}` : m.username || m.userId.slice(0, 12)}
                              </span>
                              {isSelf && <span className="text-[9px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded">YOU</span>}
                            </div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                              {m.role}{m.title ? ` · ${m.title}` : ''}{m.department ? ` · ${m.department}` : ''}
                            </div>
                          </div>
                          {m.salary && <span className="text-xs font-bold text-emerald-400 tabular-nums">${Number(m.salary).toLocaleString()}</span>}
                          {canEdit && (
                            <button
                              onClick={() => { setEditingMember(m.userId); setMemberEditForm({ role: m.role, title: m.title || '', salary: m.salary || '' }); }}
                              className="p-1.5 rounded-lg hover:bg-muted/20 text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {activeMembers.length === 0 && (
                  <div className="px-4 py-6 text-center">
                    <Users className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">NO TEAM MEMBERS YET — INVITE YOUR FIRST EMPLOYEE ABOVE</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {SECTIONS.map((section, si) => {
            const orgIndustry = activeOrg?.industry?.toLowerCase() ?? '';
            const filteredItems = section.items.filter((item: any) =>
              !item.requireIndustry || item.requireIndustry.toLowerCase() === orgIndustry
            );
            if (filteredItems.length === 0) return null;
            return (
            <motion.div key={section.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + si * 0.03 }}
              className="rounded-xl bg-card/50 border border-border/50 overflow-hidden">
              <div className="px-4 pt-4 pb-2">
                <h2 className="text-xs font-bold uppercase tracking-[0.15em]">{section.title}</h2>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{section.subtitle}</p>
              </div>
              <div className="divide-y divide-border/30">
                {filteredItems.map((item: any) => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.path} href={item.path} className="group flex items-start gap-3 px-4 py-3.5 hover:bg-muted/10 transition-colors">
                      <div className={`w-9 h-9 rounded-lg ${item.bg} border ${item.border} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                        <Icon className={`w-4 h-4 ${item.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold uppercase tracking-wider">{boomerMode ? item.boomer : item.label}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                        </div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1 leading-relaxed">{item.desc}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </motion.div>
            );
          })}

          {!activeOrg && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              {showCreateOrg ? (
                <div className="rounded-xl bg-card/50 border border-primary/20 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-primary" />
                      <h3 className="text-sm font-bold uppercase tracking-wider">REGISTER YOUR BUSINESS</h3>
                    </div>
                    <button onClick={() => setShowCreateOrg(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
                  </div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-relaxed">
                    CREATE AN ORGANIZATION TO UNLOCK TEAM MANAGEMENT, SHARED BILLING, EMPLOYEE TRACKING, AND COLLABORATIVE FEATURES ACROSS ALL BUSINESS MODULES.
                  </p>
                  <Field label="BUSINESS NAME *" value={createForm.name} onChange={v => setCreateForm(f => ({ ...f, name: v }))} placeholder="YOUR COMPANY NAME" />
                  <SelectField label="INDUSTRY" value={createForm.industry} onChange={v => setCreateForm(f => ({ ...f, industry: v }))}
                    options={[{ value: '', label: '— SELECT INDUSTRY —' }, ...INDUSTRIES.map(i => ({ value: i, label: i.toUpperCase() }))]} />
                  <SelectField label="COMPANY SIZE" value={createForm.size} onChange={v => setCreateForm(f => ({ ...f, size: v }))}
                    options={[{ value: '', label: '— SELECT SIZE —' }, ...SIZES.map(s => ({ value: s, label: s + ' EMPLOYEES' }))]} />
                  {createError && <p className="text-[10px] text-red-400 font-bold uppercase tracking-wider">{createError}</p>}
                  <button onClick={handleCreateOrg} disabled={creating}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider hover:bg-primary/90 transition-colors disabled:opacity-50">
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} CREATE ORGANIZATION
                  </button>
                </div>
              ) : (
                <div className="rounded-xl bg-primary/5 border border-primary/20 p-6 text-center space-y-4">
                  <Building2 className="w-12 h-12 text-primary/60 mx-auto" />
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider">NO ORGANIZATION YET</h3>
                    <p className="text-xs text-muted-foreground tracking-wider mt-1 uppercase leading-relaxed">
                      REGISTER A BUSINESS TO UNLOCK TEAM MANAGEMENT, EMPLOYEE TRACKING, SHARED BILLING, AND FULL BUSINESS OPERATIONS.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowCreateOrg(true)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider hover:bg-primary/90 transition-colors"
                  >
                    <Plus className="w-4 h-4" /> REGISTER A BUSINESS
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {activeOrg && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
              <button
                onClick={() => { setShowCreateOrg(true); setCreateForm({ name: '', industry: '', size: '' }); setCreateError(''); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-card/50 border border-dashed border-border/50 hover:border-primary/30 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-all"
              >
                <Plus className="w-4 h-4" /> REGISTER ANOTHER BUSINESS
              </button>
              <AnimatePresence>
                {showCreateOrg && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mt-3">
                    <div className="rounded-xl bg-card/50 border border-primary/20 p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-5 h-5 text-primary" />
                          <h3 className="text-sm font-bold uppercase tracking-wider">REGISTER NEW BUSINESS</h3>
                        </div>
                        <button onClick={() => setShowCreateOrg(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
                      </div>
                      <Field label="BUSINESS NAME *" value={createForm.name} onChange={v => setCreateForm(f => ({ ...f, name: v }))} placeholder="YOUR COMPANY NAME" />
                      <SelectField label="INDUSTRY" value={createForm.industry} onChange={v => setCreateForm(f => ({ ...f, industry: v }))}
                        options={[{ value: '', label: '— SELECT INDUSTRY —' }, ...INDUSTRIES.map(i => ({ value: i, label: i.toUpperCase() }))]} />
                      <SelectField label="COMPANY SIZE" value={createForm.size} onChange={v => setCreateForm(f => ({ ...f, size: v }))}
                        options={[{ value: '', label: '— SELECT SIZE —' }, ...SIZES.map(s => ({ value: s, label: s + ' EMPLOYEES' }))]} />
                      {createError && <p className="text-[10px] text-red-400 font-bold uppercase tracking-wider">{createError}</p>}
                      <button onClick={handleCreateOrg} disabled={creating}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider hover:bg-primary/90 transition-colors disabled:opacity-50">
                        {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} CREATE ORGANIZATION
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}

function StatRow({ label, value, prefix, sub, subColor, icon: Icon, color, bg, border, highlight }: {
  label: string; value: string; prefix?: string; sub?: string; subColor?: string;
  icon: React.ComponentType<{ className?: string }>; color: string; bg: string; border: string; highlight?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${highlight ? `${bg} border ${border}` : ''}`}>
      <div className={`w-8 h-8 rounded-lg ${bg} border ${border} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex-1">{label}</span>
      {sub && <span className={`text-[10px] font-bold uppercase tracking-wider ${subColor || 'text-muted-foreground/60'}`}>{sub}</span>}
      <span className={`text-sm font-bold tracking-wider ${color} tabular-nums`}>{prefix}{value}</span>
    </div>
  );
}
