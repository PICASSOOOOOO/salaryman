import { apiFetch } from '@/lib/api-client';
import { resolveAvatarUrl } from '@/lib/avatar';
import { useState, useEffect, useCallback } from 'react';
import {
  Briefcase, Users, CalendarDays, Archive, FileText, TrendingUp,
  DollarSign, Receipt, CreditCard, Scale, Shield, Code2, Loader2, Landmark,
  Building2, RefreshCw, AlertTriangle, CheckCircle2,
  Megaphone, Target, Search, BarChart2, LayoutDashboard, Bot,
  Plus, X, Edit2, Trash2, Check, Copy, Crown,
  ClipboardList, Store, Timer, Handshake, ScrollText, Globe,
  Eye, EyeOff, LockKeyhole, BookOpen
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { SignInPage } from '@/components/SignInPrompt';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { invalidateOrgCache } from '@/hooks/use-org';
import { Link } from 'wouter';
import { OrgLaborRequests } from '@/components/OrgLaborRequests';

interface Org {
  id: number;
  businessId: string;
  name: string;
  industry: string | null;
  size: string | null;
  description: string | null;
  website: string | null;
  businessAddress: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  legalEntityName: string | null;
  entityType: string | null;
  ownerUserId: string | null;
}

interface ProtectedRecord {
  id: number;
  label: string;
  maskedValue: string;
  createdAt: string;
  updatedAt: string;
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
    items: [
      { path: '/business/team', label: 'TEAM DIRECTORY', boomer: 'TEAM DIRECTORY', icon: Users },
      { path: '/business/contacts', label: 'CONTACTS', boomer: 'CONTACTS', icon: Users },
      { path: '/business/services', label: 'SERVICES BOARD', boomer: 'SERVICES BOARD', icon: Briefcase },
      { path: '/business/jobs', label: 'JOB BOARD', boomer: 'JOB BOARD & HIRING', icon: Briefcase },
      { path: '/business/interview', label: 'INTERVIEW OFFICE', boomer: 'INTERVIEW OFFICE', icon: Code2 },
      { path: '/business/tasks', label: 'TASK BOARD', boomer: 'TASK BOARD', icon: ClipboardList },
      { path: '/business/time-tracking', label: 'TIME TRACKING', boomer: 'TIME TRACKING', icon: Timer },
      { path: '/business/announcements', label: 'ANNOUNCEMENTS', boomer: 'ANNOUNCEMENTS', icon: Megaphone },
      { path: '/business/calendar', label: 'CALENDAR', boomer: 'CALENDAR', icon: CalendarDays },
      { path: '/business/documents', label: 'DOCUMENTS', boomer: 'DOCUMENTS', icon: Archive },
      { path: '/business/contracts', label: 'CONTRACTS', boomer: 'CONTRACTS', icon: ScrollText },
      { path: '/business/partnerships', label: 'PARTNERSHIPS', boomer: 'PARTNERSHIPS', icon: Handshake },
      { path: '/business/website', label: 'WEBSITE', boomer: 'PUBLIC WEBSITE', icon: Globe },
    ],
  },
  {
    title: 'SALES & REVENUE',
    items: [
      { path: '/business/crm', label: 'CRM WORKSPACE', boomer: 'CRM WORKSPACE', icon: LayoutDashboard },
      { path: '/business/deals', label: 'DEALS', boomer: 'DEALS', icon: TrendingUp },
      { path: '/business/invoices', label: 'INVOICES', boomer: 'INVOICES', icon: FileText },
      { path: '/business/estimates', label: 'ESTIMATES', boomer: 'ESTIMATES & QUOTES', icon: FileText },
      { path: '/marketing/leads', label: 'LEADS', boomer: 'LEAD DATABASE', icon: Target },
    ],
  },
  {
    title: 'FINANCIALS',
    items: [
      { path: '/business/payroll', label: 'PAYROLL', boomer: 'PAYROLL', icon: DollarSign },
      { path: '/business/gusto', label: 'GUSTO PAYROLL', boomer: 'GUSTO PAYROLL', icon: Landmark },
      { path: '/business/bills', label: 'BILLS', boomer: 'BILLS', icon: Receipt },
      { path: '/business/expenses', label: 'EXPENSES', boomer: 'EXPENSES', icon: CreditCard },
      { path: '/business/vendors', label: 'VENDORS', boomer: 'VENDOR DIRECTORY', icon: Store },
      { path: '/business/profit-loss', label: 'P&L', boomer: 'PROFIT & LOSS', icon: TrendingUp },
      { path: '/business/balance-sheet', label: 'BALANCE SHEET', boomer: 'BALANCE SHEET', icon: Scale },
    ],
  },
  {
    title: 'MARKETING & GROWTH',
    items: [
      { path: '/marketing/campaigns', label: 'CAMPAIGNS', boomer: 'CAMPAIGNS', icon: Megaphone },
      { path: '/marketing/seo', label: 'SEO', boomer: 'SEO', icon: Search },
    ],
  },
  {
    title: 'ANALYTICS & INTEL',
    items: [
      { path: '/intel/reports', label: 'REPORTS', boomer: 'REPORTS', icon: BarChart2 },
      { path: '/intel/dashboard', label: 'DASHBOARD', boomer: 'DASHBOARD', icon: LayoutDashboard },
      { path: '/pledge?view=prime', label: 'PABLO PRIME', boomer: 'PABLO PRIME', icon: Bot },
      { path: '/insurance', label: 'INSURANCE API', boomer: 'INSURANCE API', icon: Shield, requireIndustry: 'Insurance' },
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
      <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-background border border-border rounded-sm px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary transition-colors" />
    </div>
  );
}

function TextAreaField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-1">
      <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={2}
        className="w-full resize-y bg-background border border-border rounded-sm px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary transition-colors" />
    </div>
  );
}

const EMPTY_EDIT_FORM = {
  name: '', industry: '', size: '', description: '', website: '', businessAddress: '',
  contactEmail: '', contactPhone: '', legalEntityName: '', entityType: '',
};

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="space-y-1">
      <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-background border border-border rounded-sm px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary transition-colors">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function StatBox({ label, value, prefix, color }: { label: string; value: string; prefix?: string; color?: string }) {
  return (
    <div className="p-3 flex flex-col justify-center gap-1 hover:bg-muted/5 transition-colors">
      <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{label}</div>
      <div className={`text-sm font-bold tracking-wider tabular-nums ${color || 'text-foreground'}`}>
        {prefix}{value}
      </div>
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
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const [protectedRecords, setProtectedRecords] = useState<ProtectedRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordForm, setRecordForm] = useState({ label: '', value: '' });
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null);
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [recordSaving, setRecordSaving] = useState(false);
  const [recordError, setRecordError] = useState('');
  const [revealedRecords, setRevealedRecords] = useState<Record<number, string>>({});

  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [memberEditForm, setMemberEditForm] = useState({ role: '', title: '', salary: '' });
  const [memberSaving, setMemberSaving] = useState(false);
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

  const activeOrgId = orgData?.org?.id ?? null;
  const canManageOrg = !!orgData?.member && ['owner', 'ceo', 'executive', 'director', 'manager'].includes(orgData.member.role);

  const loadProtectedRecords = useCallback(async () => {
    setRevealedRecords({});
    if (!activeOrgId || !canManageOrg) {
      setProtectedRecords([]);
      return;
    }
    setRecordsLoading(true);
    setRecordError('');
    try {
      const res = await apiFetch(`/api/orgs/${activeOrgId}/protected-records`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setRecordError(data.error || 'PROTECTED RECORDS COULD NOT BE LOADED');
      else setProtectedRecords(data.records ?? []);
    } catch {
      setRecordError('NETWORK ERROR');
    }
    setRecordsLoading(false);
  }, [activeOrgId, canManageOrg]);

  useEffect(() => { void loadProtectedRecords(); }, [loadProtectedRecords]);

  if (!isAuthenticated) return <SignInPage />;

  const activeOrg = orgData?.org;
  const activeMember = orgData?.member;
  const allOrgs = orgData?.allOrgs ?? [];
  const members = orgData?.members ?? [];
  const activeMembers = members.filter(m => m.status === 'active');
  const isManager = canManageOrg;
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
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) { setEditError(data.error || 'UPDATE FAILED'); setEditSaving(false); return; }
      setEditingOrg(false);
      invalidateOrgCache();
      await loadData();
    } catch { setEditError('NETWORK ERROR'); }
    setEditSaving(false);
  };

  const openEditOrg = () => {
    if (!activeOrg) return;
    setEditForm({
      name: activeOrg.name,
      industry: activeOrg.industry || '',
      size: activeOrg.size || '',
      description: activeOrg.description || '',
      website: activeOrg.website || '',
      businessAddress: activeOrg.businessAddress || '',
      contactEmail: activeOrg.contactEmail || '',
      contactPhone: activeOrg.contactPhone || '',
      legalEntityName: activeOrg.legalEntityName || '',
      entityType: activeOrg.entityType || '',
    });
    setEditingOrg(true);
    setEditError('');
  };

  const resetRecordForm = () => {
    setRecordForm({ label: '', value: '' });
    setEditingRecordId(null);
    setShowRecordForm(false);
    setRecordError('');
  };

  const handleSaveRecord = async () => {
    if (!activeOrg || !recordForm.label.trim()) return;
    if (!editingRecordId && !recordForm.value.trim()) {
      setRecordError('A VALUE IS REQUIRED FOR A NEW RECORD');
      return;
    }
    setRecordSaving(true);
    setRecordError('');
    try {
      const res = await apiFetch(
        editingRecordId
          ? `/api/orgs/${activeOrg.id}/protected-records/${editingRecordId}`
          : `/api/orgs/${activeOrg.id}/protected-records`,
        {
          method: editingRecordId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label: recordForm.label, ...(recordForm.value ? { value: recordForm.value } : {}) }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setRecordError(data.error || 'RECORD COULD NOT BE SAVED');
      else {
        resetRecordForm();
        await loadProtectedRecords();
      }
    } catch {
      setRecordError('NETWORK ERROR');
    }
    setRecordSaving(false);
  };

  const handleRevealRecord = async (recordId: number) => {
    if (!activeOrg) return;
    if (revealedRecords[recordId] !== undefined) {
      setRevealedRecords(current => {
        const next = { ...current };
        delete next[recordId];
        return next;
      });
      return;
    }
    setRecordError('');
    try {
      const res = await apiFetch(`/api/orgs/${activeOrg.id}/protected-records/${recordId}/reveal`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setRecordError(data.error || 'RECORD COULD NOT BE REVEALED');
      else setRevealedRecords(current => ({ ...current, [recordId]: data.value }));
    } catch {
      setRecordError('NETWORK ERROR');
    }
  };

  const handleDeleteRecord = async (record: ProtectedRecord) => {
    if (!activeOrg || !window.confirm(`Delete protected record "${record.label}"?`)) return;
    setRecordError('');
    try {
      const res = await apiFetch(`/api/orgs/${activeOrg.id}/protected-records/${record.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setRecordError(data.error || 'RECORD COULD NOT BE DELETED');
      else await loadProtectedRecords();
    } catch {
      setRecordError('NETWORK ERROR');
    }
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

  const handleDeleteOrg = async () => {
    if (!activeOrg) return;
    const typed = window.prompt(
      `This permanently deletes "${activeOrg.name}" and removes every member, invite, and partnership. This cannot be undone.\n\nType the business name to confirm:`,
    );
    if (typed === null) return;
    if (typed.trim() !== activeOrg.name) { setDeleteError('NAME DID NOT MATCH — DELETE CANCELLED'); return; }
    setEditSaving(true);
    setDeleteError('');
    try {
      const res = await apiFetch(`/api/orgs/${activeOrg.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmName: typed.trim() }),
      });
      if (!res.ok) { const data = await res.json().catch(() => ({})); setDeleteError(data.error || 'DELETE FAILED'); setEditSaving(false); return; }
      setEditingOrg(false);
      invalidateOrgCache();
      await loadData();
    } catch { setDeleteError('NETWORK ERROR'); }
    setEditSaving(false);
  };

  const copyInviteUrl = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const switchOrg = async (orgId: number) => {
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
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8 max-w-[1200px] mx-auto space-y-6">

      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-xl font-bold tracking-widest uppercase">{boomerMode ? 'ORGANIZATION SETTINGS' : 'HUB // COMMAND'}</h1>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">
            {activeOrg ? `${activeOrg.name} · ${activeOrg.businessId}` : 'YOUR BUSINESS HEADQUARTERS'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {allOrgs.length > 1 && (
            <select
              className="bg-card border border-border rounded-sm px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest outline-none focus:border-primary transition-colors cursor-pointer"
              value={selectedOrgId || ''}
              onChange={e => switchOrg(Number(e.target.value))}
            >
              {allOrgs.map(entry => (
                <option key={entry.organization?.id} value={entry.organization?.id}>
                  {entry.organization?.name}
                </option>
              ))}
            </select>
          )}
          <button onClick={loadData} className="flex items-center gap-2 px-3 py-1.5 rounded-sm border border-border bg-card text-[10px] font-bold uppercase tracking-widest hover:border-primary hover:text-primary transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> REFRESH
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
      ) : (
        <>
          {!activeOrg && (
            <div className="max-w-md mx-auto mt-12 p-6 border border-border rounded-md bg-card space-y-4">
              <div className="flex items-center gap-2 border-b border-border pb-3">
                <Building2 className="w-5 h-5 text-primary" />
                <h2 className="text-sm font-bold uppercase tracking-widest">REGISTER BUSINESS</h2>
              </div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest leading-relaxed">
                CREATE AN ORGANIZATION TO UNLOCK TEAM MANAGEMENT, SHARED BILLING, EMPLOYEE TRACKING, AND COLLABORATIVE FEATURES.
              </p>
              <Field label="BUSINESS NAME *" value={createForm.name} onChange={v => setCreateForm(f => ({ ...f, name: v }))} placeholder="YOUR COMPANY NAME" />
              <SelectField label="INDUSTRY" value={createForm.industry} onChange={v => setCreateForm(f => ({ ...f, industry: v }))} options={[{ value: '', label: '— SELECT —' }, ...INDUSTRIES.map(i => ({ value: i, label: i.toUpperCase() }))]} />
              <SelectField label="COMPANY SIZE" value={createForm.size} onChange={v => setCreateForm(f => ({ ...f, size: v }))} options={[{ value: '', label: '— SELECT —' }, ...SIZES.map(s => ({ value: s, label: s }))]} />
              {createError && <p className="text-[10px] text-destructive font-bold uppercase tracking-widest">{createError}</p>}
              <button onClick={handleCreateOrg} disabled={creating} className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-widest rounded-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'CREATE ORGANIZATION'}
              </button>
            </div>
          )}

          {activeOrg && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

              {/* LEFT COLUMN: Main Hub & Matrix */}
              <div className="lg:col-span-8 space-y-6">

                {summary && (summary.bills.overdue > 0 || summary.invoices.overdue > 0 || summary.invoices.open > 0) && (
                  <div className="p-4 border border-primary bg-primary/5 rounded-md flex flex-col gap-3">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" /> ACTION REQUIRED
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {summary.bills.overdue > 0 && (
                        <Link href="/business/bills" className="px-3 py-1.5 bg-background border border-primary text-[9px] font-bold uppercase tracking-widest text-primary hover:bg-primary hover:text-primary-foreground rounded-sm transition-colors flex items-center gap-1.5">
                          <Receipt className="w-3 h-3" /> {summary.bills.overdue} OVERDUE BILLS
                        </Link>
                      )}
                      {summary.invoices.overdue > 0 && (
                        <Link href="/business/invoices" className="px-3 py-1.5 bg-background border border-primary text-[9px] font-bold uppercase tracking-widest text-primary hover:bg-primary hover:text-primary-foreground rounded-sm transition-colors flex items-center gap-1.5">
                          <FileText className="w-3 h-3" /> {summary.invoices.overdue} OVERDUE INVOICES
                        </Link>
                      )}
                      {summary.invoices.open > 0 && (
                        <Link href="/business/invoices" className="px-3 py-1.5 bg-background border border-border text-[9px] font-bold uppercase tracking-widest text-foreground hover:bg-primary hover:text-primary-foreground rounded-sm transition-colors flex items-center gap-1.5">
                          <FileText className="w-3 h-3" /> {summary.invoices.open} OPEN INVOICES
                        </Link>
                      )}
                    </div>
                  </div>
                )}

                {summary && (
                  <div className="border border-border rounded-md bg-card">
                    <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                      <BarChart2 className="w-4 h-4" />
                      <h2 className="text-xs font-bold uppercase tracking-widest">FINANCIAL SNAPSHOT</h2>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-border">
                      <StatBox label="NET PROFIT" value={fmt(Math.abs(netProfit))} prefix={isPositive ? '+' : '-'} color={isPositive ? 'text-primary' : 'text-foreground'} />
                      <StatBox label="GROSS INCOME" value={fmt(summary.financials.grossIncome)} />
                      <StatBox label="OUTGOINGS" value={fmt(summary.financials.payrollTotal + summary.financials.billsTotal + summary.financials.expensesTotal)} />
                      <StatBox label="ACTIVE EMPLOYEES" value={String(summary.employees.active)} />
                    </div>
                  </div>
                )}

                <div className="space-y-6">
                  {SECTIONS.filter(section => {
                    const orgIndustry = activeOrg?.industry?.toLowerCase() ?? '';
                    return section.items.some((item: any) => !item.requireIndustry || item.requireIndustry.toLowerCase() === orgIndustry);
                  }).map(section => {
                    const orgIndustry = activeOrg?.industry?.toLowerCase() ?? '';
                    const items = section.items.filter((item: any) => !item.requireIndustry || item.requireIndustry.toLowerCase() === orgIndustry);
                    return (
                      <div key={section.title} className="space-y-3">
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{section.title}</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {items.map((item: any) => (
                            <Link key={item.path} href={item.path} className="flex flex-col items-start gap-2 p-3 border border-border bg-card hover:border-primary hover:bg-primary/5 transition-all rounded-md group">
                              <item.icon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                              <span className="text-[9px] font-bold uppercase tracking-widest text-foreground group-hover:text-primary transition-colors truncate w-full text-left">
                                {boomerMode ? item.boomer : item.label}
                              </span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
                  <Link href="/business/accounting" className="flex items-center justify-center gap-2 p-3 border border-border bg-card hover:border-primary hover:bg-primary/5 transition-all rounded-md group">
                    <BookOpen className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-foreground group-hover:text-primary transition-colors">OPEN ACCOUNTING</span>
                  </Link>
                  <Link href="/business/taxes" className="flex items-center justify-center gap-2 p-3 border border-border bg-card hover:border-primary hover:bg-primary/5 transition-all rounded-md group">
                    <Landmark className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-foreground group-hover:text-primary transition-colors">ESTIMATE TAXES</span>
                  </Link>
                </div>
              </div>

              {/* RIGHT COLUMN: Settings & Admin */}
              <div className="lg:col-span-4 space-y-6">

                <div className="border border-border rounded-md bg-card flex flex-col">
                  <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4" />
                      <h2 className="text-xs font-bold uppercase tracking-widest">DETAILS</h2>
                    </div>
                    {isManager && (
                      <button onClick={() => { setEditingOrg(!editingOrg); if(!editingOrg) openEditOrg(); }} className="text-[9px] font-bold uppercase tracking-widest text-primary hover:underline">
                        {editingOrg ? 'CANCEL' : 'EDIT'}
                      </button>
                    )}
                  </div>
                  <div className="p-4">
                    {editingOrg ? (
                      <div className="space-y-3">
                        {isOwner ? (
                          <Field label="NAME" value={editForm.name} onChange={v => setEditForm(f => ({ ...f, name: v }))} placeholder={activeOrg.name} />
                        ) : (
                          <div className="text-[9px] text-muted-foreground uppercase tracking-widest">NAME: {activeOrg.name} (OWNER ONLY)</div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <SelectField label="INDUSTRY" value={editForm.industry} onChange={v => setEditForm(f => ({ ...f, industry: v }))} options={[{ value: '', label: '—' }, ...INDUSTRIES.map(i => ({ value: i, label: i.toUpperCase() }))]} />
                          <SelectField label="SIZE" value={editForm.size} onChange={v => setEditForm(f => ({ ...f, size: v }))} options={[{ value: '', label: '—' }, ...SIZES.map(s => ({ value: s, label: s }))]} />
                        </div>
                        <Field label="ENTITY NAME" value={editForm.legalEntityName} onChange={v => setEditForm(f => ({ ...f, legalEntityName: v }))} />
                        <Field label="ENTITY TYPE" value={editForm.entityType} onChange={v => setEditForm(f => ({ ...f, entityType: v }))} />
                        <Field label="WEBSITE" value={editForm.website} onChange={v => setEditForm(f => ({ ...f, website: v }))} type="url" />
                        <Field label="EMAIL" value={editForm.contactEmail} onChange={v => setEditForm(f => ({ ...f, contactEmail: v }))} type="email" />
                        <Field label="PHONE" value={editForm.contactPhone} onChange={v => setEditForm(f => ({ ...f, contactPhone: v }))} type="tel" />
                        <TextAreaField label="ADDRESS" value={editForm.businessAddress} onChange={v => setEditForm(f => ({ ...f, businessAddress: v }))} />
                        <TextAreaField label="DESCRIPTION" value={editForm.description} onChange={v => setEditForm(f => ({ ...f, description: v }))} />
                        {editError && <div className="text-[9px] font-bold text-destructive uppercase tracking-widest">{editError}</div>}
                        <button onClick={handleEditOrg} disabled={editSaving} className="w-full mt-2 py-2 bg-primary text-primary-foreground font-bold uppercase tracking-widest text-[9px] rounded-sm disabled:opacity-50 hover:bg-primary/90 transition-colors">
                          {editSaving ? 'SAVING...' : 'SAVE CHANGES'}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">NAME</div>
                          <div className="text-xs font-bold uppercase tracking-wider">{activeOrg.name}</div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">INDUSTRY</div>
                            <div className="text-xs font-bold uppercase tracking-wider">{activeOrg.industry || '—'}</div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">SIZE</div>
                            <div className="text-xs font-bold uppercase tracking-wider">{activeOrg.size || '—'}</div>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">YOUR ROLE</div>
                          <div className="text-xs font-bold uppercase tracking-wider text-primary">{activeMember?.role} {activeMember?.title ? `(${activeMember.title})` : ''}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border border-border rounded-md bg-card flex flex-col">
                  <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      <h2 className="text-xs font-bold uppercase tracking-widest">TEAM ({activeMembers.length})</h2>
                    </div>
                    {isManager && (
                      <button onClick={() => { setShowInvite(!showInvite); setInviteUrl(''); setInviteError(''); }} className="text-[9px] font-bold uppercase tracking-widest text-primary hover:underline">
                        {showInvite ? 'CANCEL' : '+ INVITE'}
                      </button>
                    )}
                  </div>

                  {showInvite && (
                    <div className="p-3 border-b border-border bg-muted/20 space-y-2">
                      <div className="flex gap-2">
                        <input
                          value={inviteInput} onChange={e => setInviteInput(e.target.value)} placeholder="EMAIL OR USERNAME"
                          className="flex-1 bg-background border border-border rounded-sm px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary transition-colors"
                          onKeyDown={e => e.key === 'Enter' && handleInvite()}
                        />
                        <button onClick={handleInvite} disabled={inviting || !inviteInput.trim()} className="px-3 py-1.5 bg-primary text-primary-foreground font-bold uppercase tracking-widest text-[9px] rounded-sm disabled:opacity-50 hover:bg-primary/90 transition-colors">
                          {inviting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'SEND'}
                        </button>
                      </div>
                      {inviteError && <p className="text-[9px] text-destructive font-bold uppercase tracking-widest">{inviteError}</p>}
                      {inviteUrl && (
                        <div className="flex items-center gap-2 p-2 border border-primary bg-primary/10 rounded-sm">
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                          <span className="text-[9px] text-primary font-bold uppercase tracking-widest flex-1 truncate">LINK GENERATED</span>
                          <button onClick={copyInviteUrl} className="flex items-center gap-1 px-2 py-1 bg-primary text-primary-foreground text-[9px] font-bold uppercase tracking-widest rounded-sm hover:bg-primary/90 transition-colors">
                            {copied ? 'COPIED' : 'COPY'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {memberError && (
                    <div className="p-3 border-b border-border text-[9px] font-bold text-destructive uppercase tracking-widest">{memberError}</div>
                  )}

                  <div className="divide-y divide-border max-h-80 overflow-y-auto">
                    {activeMembers.map(m => {
                      const isEditing = editingMember === m.userId;
                      const isSelf = m.userId === user?.id;
                      const canEdit = isManager && m.role !== 'owner' && !isSelf;

                      return (
                        <div key={m.userId} className="p-3 text-xs hover:bg-muted/5 transition-colors">
                          {isEditing ? (
                            <div className="space-y-3 bg-muted/20 p-3 rounded-sm border border-border">
                              <div className="flex items-center justify-between pb-2 border-b border-border">
                                <span className="text-[9px] font-bold uppercase tracking-widest text-primary">EDIT MEMBER</span>
                                <button onClick={() => setEditingMember(null)}><X className="w-3.5 h-3.5"/></button>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <SelectField label="ROLE" value={memberEditForm.role} onChange={v => setMemberEditForm(f => ({ ...f, role: v }))} options={ROLES.map(r => ({ value: r, label: r.toUpperCase() }))} />
                                <Field label="TITLE" value={memberEditForm.title} onChange={v => setMemberEditForm(f => ({ ...f, title: v }))} />
                                <Field label="SALARY" type="number" value={memberEditForm.salary} onChange={v => setMemberEditForm(f => ({ ...f, salary: v }))} />
                              </div>
                              <div className="flex items-center gap-2 pt-1">
                                <button onClick={() => handleUpdateMember(m.userId)} disabled={memberSaving} className="px-3 py-1.5 bg-primary text-primary-foreground font-bold uppercase tracking-widest text-[9px] rounded-sm disabled:opacity-50 hover:bg-primary/90 transition-colors">SAVE</button>
                                <button onClick={() => handleRemoveMember(m.userId)} className="px-3 py-1.5 bg-background border border-destructive text-destructive font-bold uppercase tracking-widest text-[9px] rounded-sm hover:bg-destructive hover:text-destructive-foreground transition-colors">REMOVE</button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className="w-7 h-7 rounded-sm overflow-hidden bg-background border border-border flex items-center justify-center flex-shrink-0">
                                  {resolveAvatarUrl(m.profileImageUrl) ? (
                                    <img src={resolveAvatarUrl(m.profileImageUrl)} alt="" className="w-full h-full object-cover" />
                                  ) : (m.role === 'owner' ? <Crown className="w-4 h-4 text-primary" /> : <Users className="w-4 h-4 text-muted-foreground" />)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold uppercase tracking-wider truncate">
                                      {m.firstName ? `${m.firstName}${m.lastName ? ` ${m.lastName}` : ''}` : m.username || m.userId.slice(0, 12)}
                                    </span>
                                    {isSelf && <span className="text-[8px] font-bold text-primary bg-primary/10 px-1 py-0.5 rounded-sm">YOU</span>}
                                  </div>
                                  <div className="text-[9px] text-muted-foreground uppercase tracking-widest truncate">
                                    {m.role}{m.title ? ` · ${m.title}` : ''}{m.salary ? ` · $${Number(m.salary).toLocaleString()}` : ''}
                                  </div>
                                </div>
                              </div>
                              {canEdit && (
                                <button onClick={() => { setEditingMember(m.userId); setMemberEditForm({ role: m.role, title: m.title || '', salary: m.salary || '' }); }} className="p-1.5 hover:text-primary transition-colors text-muted-foreground">
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="p-3 border-t border-border flex justify-between items-center bg-muted/5">
                    <Link href="/business/team" className="text-[9px] font-bold uppercase tracking-widest text-foreground hover:text-primary transition-colors">MANAGE FULL TEAM</Link>
                    {!isOwner && (
                      <button onClick={() => { if (confirm('Are you sure you want to leave this organization?')) handleRemoveMember(user?.id ?? ''); }} className="text-[9px] font-bold uppercase tracking-widest text-destructive hover:underline">LEAVE ORG</button>
                    )}
                  </div>
                </div>

                {isManager && <OrgLaborRequests orgId={activeOrg.id} orgName={activeOrg.name} />}

                {isManager && (
                  <div className="border border-border rounded-md bg-card flex flex-col">
                    <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <LockKeyhole className="w-4 h-4" />
                        <h2 className="text-xs font-bold uppercase tracking-widest">RECORDS</h2>
                      </div>
                      <button onClick={() => { resetRecordForm(); setShowRecordForm(!showRecordForm); }} className="text-[9px] font-bold uppercase tracking-widest text-primary hover:underline">
                        {showRecordForm ? 'CANCEL' : '+ ADD'}
                      </button>
                    </div>

                    {showRecordForm && (
                      <div className="p-4 border-b border-border bg-muted/20 space-y-3">
                        <div className="text-[9px] font-bold uppercase tracking-widest text-primary pb-2 border-b border-border">{editingRecordId ? 'EDIT RECORD' : 'NEW RECORD'}</div>
                        <Field label="LABEL" value={recordForm.label} onChange={v => setRecordForm(f => ({ ...f, label: v }))} placeholder="TAX ID, ETC" />
                        <Field label={editingRecordId ? 'NEW VALUE (OPTIONAL)' : 'VALUE'} value={recordForm.value} onChange={v => setRecordForm(f => ({ ...f, value: v }))} placeholder={editingRecordId ? 'LEAVE BLANK TO KEEP CURRENT' : 'SENSITIVE VALUE'} type="password" />
                        {recordError && <div className="text-[9px] font-bold text-destructive uppercase tracking-widest">{recordError}</div>}
                        <button onClick={handleSaveRecord} disabled={recordSaving || !recordForm.label.trim()} className="w-full mt-2 py-2 bg-primary text-primary-foreground font-bold uppercase tracking-widest text-[9px] rounded-sm disabled:opacity-50 hover:bg-primary/90 transition-colors">
                          {recordSaving ? 'SAVING...' : 'SAVE RECORD'}
                        </button>
                      </div>
                    )}

                    <div className="divide-y divide-border max-h-80 overflow-y-auto">
                      {recordsLoading ? (
                        <div className="p-4 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
                      ) : protectedRecords.length === 0 ? (
                        <div className="p-4 text-center text-[9px] text-muted-foreground uppercase tracking-widest">NO RECORDS SAVED</div>
                      ) : (
                        protectedRecords.map(record => {
                          const revealed = revealedRecords[record.id];
                          return (
                            <div key={record.id} className="p-3 flex items-center justify-between gap-3 hover:bg-muted/10 transition-colors">
                              <div className="flex-1 min-w-0">
                                <div className="text-[10px] font-bold uppercase tracking-widest truncate">{record.label}</div>
                                <div className={`text-xs font-mono truncate ${revealed !== undefined ? 'text-primary' : 'text-muted-foreground'}`}>
                                  {revealed !== undefined ? revealed : record.maskedValue}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button onClick={() => handleRevealRecord(record.id)} className="p-1.5 text-muted-foreground hover:text-primary transition-colors">
                                  {revealed !== undefined ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                                <button onClick={() => { setEditingRecordId(record.id); setRecordForm({ label: record.label, value: '' }); setShowRecordForm(true); setRecordError(''); }} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => handleDeleteRecord(record)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                )}

                {isOwner && (
                  <div className="border border-destructive/50 rounded-md bg-card flex flex-col">
                    <div className="px-4 py-3 border-b border-destructive/20 flex items-center gap-2 bg-destructive/5">
                      <AlertTriangle className="w-4 h-4 text-destructive" />
                      <h2 className="text-xs font-bold uppercase tracking-widest text-destructive">DANGER ZONE</h2>
                    </div>
                    <div className="p-4 space-y-4">
                      <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest leading-relaxed">
                        PERMANENTLY DELETE THIS BUSINESS AND ALL RELATED ORGANIZATION DATA.
                      </p>
                      {deleteError && <div className="text-[9px] font-bold text-destructive uppercase tracking-widest">{deleteError}</div>}
                      <button onClick={handleDeleteOrg} disabled={editSaving} className="w-full py-2 bg-background border border-destructive text-destructive font-bold uppercase tracking-widest text-[9px] rounded-sm hover:bg-destructive hover:text-destructive-foreground transition-colors disabled:opacity-50">
                        {editSaving ? 'DELETING...' : 'DELETE BUSINESS'}
                      </button>
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <button onClick={() => { setShowCreateOrg(!showCreateOrg); setCreateForm({ name: '', industry: '', size: '' }); setCreateError(''); }} className="w-full py-3 border border-dashed border-border bg-card text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:border-primary hover:text-primary transition-colors rounded-md flex items-center justify-center gap-2">
                    {showCreateOrg ? 'CANCEL REGISTRATION' : <><Plus className="w-3.5 h-3.5" /> REGISTER ANOTHER BUSINESS</>}
                  </button>

                  {showCreateOrg && (
                    <div className="mt-4 p-4 border border-border bg-card rounded-md space-y-4">
                      <div className="flex items-center justify-between border-b border-border pb-2">
                        <h3 className="text-xs font-bold uppercase tracking-widest">NEW BUSINESS</h3>
                      </div>
                      <Field label="BUSINESS NAME *" value={createForm.name} onChange={v => setCreateForm(f => ({ ...f, name: v }))} placeholder="YOUR COMPANY NAME" />
                      <div className="grid grid-cols-2 gap-2">
                        <SelectField label="INDUSTRY" value={createForm.industry} onChange={v => setCreateForm(f => ({ ...f, industry: v }))} options={[{ value: '', label: '— SELECT —' }, ...INDUSTRIES.map(i => ({ value: i, label: i.toUpperCase() }))]} />
                        <SelectField label="SIZE" value={createForm.size} onChange={v => setCreateForm(f => ({ ...f, size: v }))} options={[{ value: '', label: '— SELECT —' }, ...SIZES.map(s => ({ value: s, label: s }))]} />
                      </div>
                      {createError && <div className="text-[9px] font-bold text-destructive uppercase tracking-widest">{createError}</div>}
                      <button onClick={handleCreateOrg} disabled={creating} className="w-full py-2 bg-primary text-primary-foreground font-bold uppercase tracking-widest text-[9px] rounded-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
                        {creating ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'CREATE ORGANIZATION'}
                      </button>
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
