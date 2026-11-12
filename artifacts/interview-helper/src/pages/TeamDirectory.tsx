import { apiFetch } from '@/lib/api-client';
import { resolveAvatarUrl } from '@/lib/avatar';
import { useState, useEffect, useCallback, type FormEvent } from 'react';
import {
  Users, Loader2, Search, Building2, Briefcase, UserCheck, UserPlus,
  RefreshCw, AlertTriangle, Mail, ShieldCheck, CalendarDays, Check, X,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { SignInPage } from '@/components/SignInPrompt';
import {
  getListOrganizationTimeOffRequestsQueryKey,
  useCreateOrganizationTimeOffRequest,
  useListOrganizationTimeOffRequests,
  useUpdateOrganizationTimeOffRequest,
} from '@workspace/api-client-react';

interface Organization {
  id: number;
  name: string;
  businessId: string;
}

interface OrganizationMembership {
  userId: string;
  role: string;
  status: string;
  title: string | null;
  department: string | null;
  salary: string | null;
  memberType: string | null;
  joinedAt: string | null;
  createdAt: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  inviteEmail: string | null;
  profileImageUrl: string | null;
}

interface OrganizationResponse {
  org: Organization | null;
  allOrgs: { organization: Organization | null; membership: { role: string } }[];
}

interface MembersResponse {
  members: OrganizationMembership[];
  pendingInvites?: PendingInvite[];
  callerRole: string;
  canManageMembers: boolean;
  hiddenCount?: number;
}

interface PendingInvite {
  id: number;
  inviteEmail: string | null;
  offeredRole: string | null;
  offeredTitle: string | null;
  offeredDepartment: string | null;
  offeredMemberType: string | null;
  expiresAt: string;
  createdAt: string;
}

const ROLE_OPTIONS = [
  { value: 'specialist', label: 'Specialist' },
  { value: 'manager', label: 'Manager' },
  { value: 'director', label: 'Director' },
  { value: 'executive', label: 'Executive' },
] as const;

const MEMBER_TYPES = [
  { value: 'employee', label: 'Employee' },
  { value: 'contractor', label: 'Contractor' },
] as const;

function displayName(member: OrganizationMembership) {
  const name = [member.firstName, member.lastName].filter(Boolean).join(' ');
  return name || member.email || member.inviteEmail || member.userId.slice(0, 14);
}

function initials(name: string) {
  return name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || '?';
}

function formatSalary(value: string | null) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0
    ? `$${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    : '—';
}

function localDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatCalendarDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString();
}

export default function TeamDirectory() {
  const { isAuthenticated, user } = useAuth();
  const [boomerMode] = useState(() => getDefaultBoomerMode());
  const [activePanel, setActivePanel] = useState<'team' | 'time-off'>('team');
  const [organizationData, setOrganizationData] = useState<OrganizationResponse | null>(null);
  const [membersData, setMembersData] = useState<MembersResponse | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(() => {
    try {
      const stored = localStorage.getItem('sm_active_org');
      return stored ? Number(stored) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [showAddMember, setShowAddMember] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [inviteNotice, setInviteNotice] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [timeOffForm, setTimeOffForm] = useState(() => {
    const today = localDateInputValue();
    return { startDate: today, endDate: today, leaveType: 'vacation', note: '' };
  });
  const [timeOffNotice, setTimeOffNotice] = useState('');
  const [timeOffError, setTimeOffError] = useState('');
  const [actingRequestId, setActingRequestId] = useState<number | null>(null);
  const [addForm, setAddForm] = useState({
    email: '',
    role: 'specialist',
    department: '',
    title: '',
    memberType: 'employee',
  });

  const activeOrg = organizationData?.allOrgs.find(
    item => item.organization?.id === selectedOrgId,
  )?.organization ?? organizationData?.org;
  const activeOrgId = activeOrg?.id ?? null;
  const timeOffQuery = useListOrganizationTimeOffRequests(activeOrgId ?? 0, {
    query: {
      enabled: Boolean(activeOrgId && isAuthenticated),
      queryKey: getListOrganizationTimeOffRequestsQueryKey(activeOrgId ?? 0),
    },
  });
  const createTimeOffRequest = useCreateOrganizationTimeOffRequest();
  const updateTimeOffRequest = useUpdateOrganizationTimeOffRequest();

  const loadMembers = useCallback(async (orgId: number) => {
    const response = await apiFetch(`/api/orgs/${orgId}/members`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'TEAM ROSTER COULD NOT BE LOADED');
    setMembersData(data);
  }, []);

  const loadOrganizations = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/api/orgs/me');
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'ORGANIZATIONS COULD NOT BE LOADED');
      setOrganizationData(data);
      const organizations = (data.allOrgs ?? []).filter(
        (item: { organization: Organization | null }) => item.organization,
      ) as OrganizationResponse['allOrgs'];
      const nextOrgId = organizations.some(item => item.organization?.id === selectedOrgId)
        ? selectedOrgId
        : data.org?.id ?? organizations[0]?.organization?.id ?? null;
      setSelectedOrgId(nextOrgId);
      if (nextOrgId) await loadMembers(nextOrgId);
      else setMembersData(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'TEAM ROSTER COULD NOT BE LOADED');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, loadMembers, selectedOrgId]);

  useEffect(() => { void loadOrganizations(); }, [loadOrganizations]);

  const changeOrganization = async (value: string) => {
    const orgId = Number(value);
    setSelectedOrgId(orgId);
    try { localStorage.setItem('sm_active_org', String(orgId)); } catch {}
    setLoading(true);
    setError('');
    try {
      await loadMembers(orgId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'TEAM ROSTER COULD NOT BE LOADED');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeOrgId || !addForm.email.trim()) return;
    setAdding(true);
    setAddError('');
    setInviteNotice('');
    setInviteUrl('');
    try {
      const response = await apiFetch(`/api/orgs/${activeOrgId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: addForm.email.trim(),
          offeredRole: addForm.role,
          offeredDepartment: addForm.department.trim() || undefined,
          offeredTitle: addForm.title.trim() || undefined,
          offeredMemberType: addForm.memberType,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setAddError(data.error || 'MEMBER COULD NOT BE ADDED');
        return;
      }
      setAddForm({ email: '', role: 'specialist', department: '', title: '', memberType: 'employee' });
      setInviteNotice(data.emailSent ? 'INVITATION EMAIL SENT' : 'INVITATION CREATED — EMAIL DELIVERY NEEDS ATTENTION');
      setInviteUrl(data.inviteUrl || '');
      await loadMembers(activeOrgId);
    } catch {
      setAddError('NETWORK ERROR — TRY AGAIN');
    } finally {
      setAdding(false);
    }
  };

  const submitTimeOffRequest = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeOrgId) return;
    setTimeOffError('');
    setTimeOffNotice('');
    if (timeOffForm.endDate < timeOffForm.startDate) {
      setTimeOffError('End date must be on or after the start date.');
      return;
    }
    try {
      await createTimeOffRequest.mutateAsync({
        orgId: activeOrgId,
        data: {
          startDate: timeOffForm.startDate,
          endDate: timeOffForm.endDate,
          leaveType: timeOffForm.leaveType as 'vacation' | 'personal' | 'other',
          note: timeOffForm.note.trim(),
        },
      });
      setTimeOffNotice('Request submitted for review.');
      setTimeOffForm(form => ({ ...form, note: '' }));
      await timeOffQuery.refetch();
    } catch (cause) {
      setTimeOffError(cause instanceof Error ? cause.message : 'Could not submit the request.');
    }
  };

  const updateTimeOffStatus = async (requestId: number, status: 'approved' | 'declined' | 'cancelled') => {
    if (!activeOrgId) return;
    setActingRequestId(requestId);
    setTimeOffError('');
    setTimeOffNotice('');
    try {
      await updateTimeOffRequest.mutateAsync({
        orgId: activeOrgId,
        requestId,
        data: { status },
      });
      setTimeOffNotice(status === 'cancelled' ? 'Request withdrawn.' : `Request ${status}.`);
      await timeOffQuery.refetch();
    } catch (cause) {
      setTimeOffError(cause instanceof Error ? cause.message : 'Could not update the request.');
    } finally {
      setActingRequestId(null);
    }
  };

  if (!isAuthenticated && !loading) return <SignInPage context="Sign in to view your organization team." />;

  const members = membersData?.members ?? [];
  const departments = ['all', ...new Set(members.map(member => member.department).filter(Boolean) as string[])];
  const query = search.trim().toLowerCase();
  const filteredMembers = members.filter(member => {
    if (departmentFilter !== 'all' && member.department !== departmentFilter) return false;
    if (!query) return true;
    return [displayName(member), member.role, member.title, member.department, member.email, member.inviteEmail]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(query));
  });
  const activeCount = members.filter(member => member.status === 'active').length;
  const pendingInvites = membersData?.pendingInvites ?? [];
  const pendingCount = members.filter(member => member.status !== 'active').length + pendingInvites.length;
  const canManageMembers = membersData?.canManageMembers === true;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 p-4 sm:p-6 max-w-5xl mx-auto w-full">
        <header className="mb-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-bold text-foreground uppercase tracking-wider truncate">
                  {boomerMode ? 'Organization Team' : 'TEAM ROSTER'}
                </h1>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest truncate">
                  {activeOrg ? `${activeOrg.name} · ${activeOrg.businessId}` : 'ORGANIZATION MEMBERSHIP'}
                </p>
              </div>
            </div>
            {activeOrg && (
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={activeOrg.id}
                  onChange={event => void changeOrganization(event.target.value)}
                  className="max-w-[220px] bg-card border border-border rounded-sm px-2 py-2 text-[10px] font-bold uppercase tracking-widest text-foreground outline-none focus:border-primary"
                  aria-label="Select organization"
                >
                  {organizationData?.allOrgs.filter(item => item.organization).map(item => (
                    <option key={item.organization!.id} value={item.organization!.id}>{item.organization!.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void loadOrganizations()}
                  className="p-2 border border-border rounded-sm text-muted-foreground hover:text-primary hover:border-primary transition-colors"
                  aria-label="Refresh team"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {activeOrg && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] uppercase tracking-widest text-muted-foreground">
              <span><strong className="text-foreground">{activeCount}</strong> ACTIVE</span>
              <span><strong className="text-foreground">{pendingCount}</strong> PENDING</span>
              {membersData?.hiddenCount ? <span>{membersData.hiddenCount} HIDDEN BY ROLE POLICY</span> : null}
              {canManageMembers && activePanel === 'team' && (
                <button
                  type="button"
                  onClick={() => { setShowAddMember(value => !value); setAddError(''); }}
                  className="inline-flex items-center gap-1.5 text-primary font-bold hover:underline"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  {showAddMember ? 'CANCEL' : 'ADD MEMBER'}
                </button>
              )}
            </div>
          )}
        </header>

        {activeOrg && (
          <nav className="flex gap-2 mb-5" aria-label="Organization people tools">
            <button
              type="button"
              onClick={() => setActivePanel('team')}
              aria-pressed={activePanel === 'team'}
              className={`px-3 py-2 border rounded-sm text-[10px] font-bold uppercase tracking-widest transition-colors ${activePanel === 'team' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:text-foreground'}`}
            >
              Team roster
            </button>
            <button
              type="button"
              onClick={() => setActivePanel('time-off')}
              aria-pressed={activePanel === 'time-off'}
              className={`inline-flex items-center gap-1.5 px-3 py-2 border rounded-sm text-[10px] font-bold uppercase tracking-widest transition-colors ${activePanel === 'time-off' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:text-foreground'}`}
            >
              <CalendarDays className="w-3.5 h-3.5" /> Time off
            </button>
          </nav>
        )}

        {activePanel === 'team' && showAddMember && canManageMembers && (
          <form onSubmit={handleAddMember} className="mb-5 p-4 border border-primary/30 bg-primary/5 rounded-md space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
              <UserPlus className="w-4 h-4 text-primary" />
              Add to {activeOrg?.name}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <label className="space-y-1 lg:col-span-2">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Email</span>
                <input required type="email" value={addForm.email} onChange={event => setAddForm(form => ({ ...form, email: event.target.value }))} placeholder="person@company.com"
                  className="w-full bg-background border border-border rounded-sm px-2 py-2 text-xs outline-none focus:border-primary" />
              </label>
              <label className="space-y-1">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Member type</span>
                <select value={addForm.memberType} onChange={event => setAddForm(form => ({ ...form, memberType: event.target.value }))}
                  className="w-full bg-background border border-border rounded-sm px-2 py-2 text-xs outline-none focus:border-primary">
                  {MEMBER_TYPES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Role</span>
                <select value={addForm.role} onChange={event => setAddForm(form => ({ ...form, role: event.target.value }))}
                  className="w-full bg-background border border-border rounded-sm px-2 py-2 text-xs outline-none focus:border-primary">
                  {ROLE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Department</span>
                <input value={addForm.department} onChange={event => setAddForm(form => ({ ...form, department: event.target.value }))} placeholder="Operations"
                  className="w-full bg-background border border-border rounded-sm px-2 py-2 text-xs outline-none focus:border-primary" />
              </label>
              <label className="space-y-1">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Title</span>
                <input value={addForm.title} onChange={event => setAddForm(form => ({ ...form, title: event.target.value }))} placeholder="Operations lead"
                  className="w-full bg-background border border-border rounded-sm px-2 py-2 text-xs outline-none focus:border-primary" />
              </label>
            </div>
            {addError && <p className="text-[10px] text-destructive font-bold uppercase tracking-widest">{addError}</p>}
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[10px] text-muted-foreground">An email invitation is sent. The recipient joins after accepting it.</p>
              <button type="submit" disabled={adding || !activeOrgId} className="inline-flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-sm text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 shrink-0">
                {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                Add member
              </button>
            </div>
            {inviteNotice && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-emerald-600">
                <span>{inviteNotice}</span>
                {inviteUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!navigator.clipboard) return;
                      void navigator.clipboard.writeText(inviteUrl);
                    }}
                    className="self-start text-primary hover:underline"
                  >
                    COPY FALLBACK LINK
                  </button>
                )}
              </div>
            )}
          </form>
        )}

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" /></div>
        ) : error ? (
          <div className="border border-destructive/30 bg-destructive/5 rounded-md p-8 text-center">
            <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-3" />
            <p className="text-xs font-bold uppercase tracking-widest text-destructive">{error}</p>
            <button type="button" onClick={() => void loadOrganizations()} className="mt-4 inline-flex items-center gap-2 px-3 py-2 border border-border rounded-sm text-[10px] font-bold uppercase tracking-widest hover:border-primary hover:text-primary">
              <RefreshCw className="w-3.5 h-3.5" /> Retry
            </button>
          </div>
        ) : !activeOrg ? (
          <div className="border border-border rounded-md p-12 text-center">
            <Building2 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-bold uppercase tracking-widest">No organization yet</p>
            <p className="text-xs text-muted-foreground mt-2">Create an organization in the Business hub before adding team members.</p>
          </div>
        ) : activePanel === 'time-off' ? (
          <section className="space-y-4">
            <header className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <CalendarDays className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h2 className="text-sm font-bold uppercase tracking-widest">Time off</h2>
                <p className="text-[10px] text-muted-foreground">Submit a request or review your organization’s requests.</p>
              </div>
            </header>

            <form onSubmit={submitTimeOffRequest} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 border border-border rounded-md bg-card">
              <label className="space-y-1">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Start date</span>
                <input
                  required
                  type="date"
                  value={timeOffForm.startDate}
                  onChange={event => setTimeOffForm(form => ({ ...form, startDate: event.target.value }))}
                  className="w-full bg-background border border-border rounded-sm px-2 py-2 text-xs outline-none focus:border-primary"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">End date</span>
                <input
                  required
                  type="date"
                  min={timeOffForm.startDate}
                  value={timeOffForm.endDate}
                  onChange={event => setTimeOffForm(form => ({ ...form, endDate: event.target.value }))}
                  className="w-full bg-background border border-border rounded-sm px-2 py-2 text-xs outline-none focus:border-primary"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Request type</span>
                <select
                  value={timeOffForm.leaveType}
                  onChange={event => setTimeOffForm(form => ({ ...form, leaveType: event.target.value }))}
                  className="w-full bg-background border border-border rounded-sm px-2 py-2 text-xs outline-none focus:border-primary"
                >
                  <option value="vacation">Vacation</option>
                  <option value="personal">Personal</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <button
                type="submit"
                disabled={createTimeOffRequest.isPending || !activeOrgId}
                className="self-end inline-flex items-center justify-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-sm text-[10px] font-bold uppercase tracking-widest disabled:opacity-50"
              >
                {createTimeOffRequest.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarDays className="w-3.5 h-3.5" />}
                Submit request
              </button>
              <label className="space-y-1 sm:col-span-2 lg:col-span-4">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Note for your manager (optional)</span>
                <textarea
                  maxLength={500}
                  rows={2}
                  value={timeOffForm.note}
                  onChange={event => setTimeOffForm(form => ({ ...form, note: event.target.value }))}
                  placeholder="Add a brief note"
                  className="w-full resize-y bg-background border border-border rounded-sm px-2 py-2 text-xs outline-none focus:border-primary"
                />
              </label>
            </form>

            {timeOffNotice && <p role="status" className="text-xs text-emerald-600">{timeOffNotice}</p>}
            {timeOffError && (
              <div role="alert" className="flex items-center justify-between gap-3 border border-destructive/30 bg-destructive/5 rounded-md px-3 py-2 text-xs text-destructive">
                <span>{timeOffError}</span>
                <button type="button" onClick={() => setTimeOffError('')} className="font-bold underline">Dismiss</button>
              </div>
            )}

            {timeOffQuery.isLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground/40" /></div>
            ) : timeOffQuery.isError ? (
              <div className="border border-destructive/30 bg-destructive/5 rounded-md p-6 text-center">
                <p className="text-xs text-destructive">Time-off requests could not be loaded.</p>
                <button type="button" onClick={() => void timeOffQuery.refetch()} className="mt-2 text-xs font-bold underline">Retry</button>
              </div>
            ) : (timeOffQuery.data?.requests ?? []).length === 0 ? (
              <div className="border border-border rounded-md p-8 text-center">
                <p className="text-xs font-bold uppercase tracking-widest">No requests yet</p>
                <p className="text-[10px] text-muted-foreground mt-1">Your organization’s time-off requests will appear here.</p>
              </div>
            ) : (
              <div className="border border-border rounded-md bg-card divide-y divide-border">
                {(timeOffQuery.data?.requests ?? []).map(request => {
                  const isMine = request.requesterUserId === user?.id;
                  const isActing = actingRequestId === request.id;
                  return (
                    <article key={request.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-xs font-bold">{isMine ? 'Your request' : request.requesterName}</h3>
                          <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase ${request.status === 'approved' ? 'bg-emerald-500/10 text-emerald-700' : request.status === 'declined' ? 'bg-destructive/10 text-destructive' : request.status === 'pending' ? 'bg-amber-500/10 text-amber-700' : 'bg-muted text-muted-foreground'}`}>
                            {request.status}
                          </span>
                        </div>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {formatCalendarDate(request.startDate)} – {formatCalendarDate(request.endDate)} · {request.leaveType}
                        </p>
                        {request.note && <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">{request.note}</p>}
                      </div>
                      {request.status === 'pending' && (
                        <div className="flex items-center gap-2 shrink-0">
                          {timeOffQuery.data?.canReview && !isMine && (
                            <>
                              <button
                                type="button"
                                onClick={() => void updateTimeOffStatus(request.id, 'approved')}
                                disabled={isActing || updateTimeOffRequest.isPending}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-emerald-600/30 rounded-sm text-[9px] font-bold uppercase text-emerald-700 hover:bg-emerald-600/10 disabled:opacity-50"
                              >
                                <Check className="w-3 h-3" /> Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => void updateTimeOffStatus(request.id, 'declined')}
                                disabled={isActing || updateTimeOffRequest.isPending}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-border rounded-sm text-[9px] font-bold uppercase text-muted-foreground hover:text-destructive disabled:opacity-50"
                              >
                                <X className="w-3 h-3" /> Decline
                              </button>
                            </>
                          )}
                          {isMine && (
                            <button
                              type="button"
                              onClick={() => void updateTimeOffStatus(request.id, 'cancelled')}
                              disabled={isActing || updateTimeOffRequest.isPending}
                              className="px-2.5 py-1.5 border border-border rounded-sm text-[9px] font-bold uppercase text-muted-foreground hover:text-destructive disabled:opacity-50"
                            >
                              Withdraw
                            </button>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, role, department..."
                  className="w-full bg-card border border-border rounded-sm pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary" />
              </div>
              <select value={departmentFilter} onChange={event => setDepartmentFilter(event.target.value)}
                className="bg-card border border-border rounded-sm px-3 py-2 text-xs text-foreground outline-none focus:border-primary">
                {departments.map(department => <option key={department} value={department}>{department === 'all' ? 'ALL DEPARTMENTS' : department.toUpperCase()}</option>)}
              </select>
            </div>

            {filteredMembers.length === 0 ? (
              <div className="border border-border rounded-md p-12 text-center">
                <Users className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm font-bold uppercase tracking-widest">{members.length ? 'No matching members' : 'No members yet'}</p>
                <p className="text-xs text-muted-foreground mt-2">{members.length ? 'Try a different search or department.' : 'Use Add member to build this organization roster.'}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredMembers.map(member => {
                  const name = displayName(member);
                  const avatar = resolveAvatarUrl(member.profileImageUrl);
                  return (
                    <article key={member.userId} className="border border-border rounded-md bg-card p-4 hover:border-primary/40 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0 overflow-hidden">
                          {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : initials(name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h2 className="text-sm font-bold truncate">{name}</h2>
                          <p className="text-xs text-muted-foreground truncate">{member.title || member.role}</p>
                        </div>
                        <span className={`shrink-0 px-2 py-0.5 rounded-full text-[8px] font-bold ${member.status === 'active' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
                          {member.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="mt-3 pt-3 border-t border-border space-y-1.5">
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground"><ShieldCheck className="w-3 h-3" /><span>{member.role.toUpperCase()} · {member.memberType || 'MEMBER'}</span></div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground"><Building2 className="w-3 h-3" /><span>{member.department || 'General'}</span></div>
                        {member.email || member.inviteEmail ? <div className="flex items-center gap-2 text-[10px] text-muted-foreground truncate"><Mail className="w-3 h-3 shrink-0" /><span className="truncate">{member.email || member.inviteEmail}</span></div> : null}
                        {member.salary ? <div className="flex items-center gap-2 text-[10px] text-muted-foreground"><Briefcase className="w-3 h-3" /><span>{formatSalary(member.salary)}</span></div> : null}
                        {member.joinedAt ? <div className="flex items-center gap-2 text-[10px] text-muted-foreground"><UserCheck className="w-3 h-3" /><span>Joined {new Date(member.joinedAt).toLocaleDateString()}</span></div> : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            {pendingInvites.length > 0 && (
              <section className="mt-6 border border-border rounded-md bg-card">
                <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                  <Mail className="w-4 h-4 text-primary" />
                  <h2 className="text-xs font-bold uppercase tracking-widest">PENDING EMAIL INVITATIONS ({pendingInvites.length})</h2>
                </div>
                <div className="divide-y divide-border">
                  {pendingInvites.map(invite => (
                    <div key={invite.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate">{invite.inviteEmail || 'Email invitation'}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                          {[invite.offeredRole, invite.offeredDepartment, invite.offeredTitle].filter(Boolean).join(' · ') || 'SPECIALIST'}
                        </p>
                      </div>
                      <span className="text-[9px] text-muted-foreground uppercase tracking-widest shrink-0">
                        Expires {new Date(invite.expiresAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}