import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { resolveAvatarUrl } from '@/lib/avatar';
import { useAuth } from '@workspace/replit-auth-web';
import { SignInPage } from '@/components/SignInPrompt';
import {
  Users, UserPlus, Mail, Briefcase, Building2,
  Shield, Loader2, Trash2, Pencil, X, Check, ChevronDown,
  Clock, UserCheck, AlertCircle, Phone, RefreshCw, Scale, ChevronRight,
  FileText, Hammer, Plus, Ban,
} from 'lucide-react';

interface OrgMember {
  orgId: number;
  userId: string;
  role: string;
  department: string | null;
  status: string;
  title: string | null;
  salary: string | null;
  memberType: string;
  inviteEmail: string | null;
  joinedAt: string | null;
  createdAt: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  profileImageUrl: string | null;
}

interface PendingInvite {
  id: number;
  inviteEmail: string | null;
  inviteUsername: string | null;
  status: string;
  createdAt: string;
  expiresAt: string;
}

const ROLES = ['ceo', 'executive', 'director', 'manager', 'specialist'] as const;
const ROLE_LABELS: Record<string, string> = {
  owner: 'OWNER', ceo: 'CEO', executive: 'EXECUTIVE',
  director: 'DIRECTOR', manager: 'MANAGER', specialist: 'SPECIALIST',
};
const ROLE_COLORS: Record<string, string> = {
  owner: 'text-amber-400', ceo: 'text-purple-400', executive: 'text-blue-400',
  director: 'text-cyan-400', manager: 'text-green-400', specialist: 'text-gray-400',
};

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  active: { bg: 'bg-green-500/15', text: 'text-green-400', label: 'ACTIVE' },
  invited: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'PENDING' },
  removed: { bg: 'bg-red-500/15', text: 'text-red-400', label: 'REMOVED' },
};

const FIAT_TO_USD = 0.012;

function fmtFiat(v: string | number | null) {
  const n = Number(v);
  return isFinite(n) && n > 0 ? `ƒ${n.toLocaleString('en-US', { minimumFractionDigits: 0 })}` : '—';
}

function fmtUsd(v: string | number | null) {
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return '';
  return `≈ $${(n * FIAT_TO_USD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function memberName(m: OrgMember): string {
  if (m.firstName || m.lastName) return [m.firstName, m.lastName].filter(Boolean).join(' ');
  if (m.email) return m.email.split('@')[0];
  if (m.inviteEmail) return m.inviteEmail.split('@')[0];
  return m.userId.startsWith('pending_') ? 'Pending Registration' : m.userId;
}

export default function TeamManagement({ orgId, onlineUserIds }: { orgId: number; onlineUserIds?: Set<string> }) {
  const { isAuthenticated } = useAuth();
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [callerRole, setCallerRole] = useState('');
  const [hiddenCount, setHiddenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [addForm, setAddForm] = useState({
    email: '', role: 'specialist', department: '', title: '', salary: '', memberType: 'employee',
  });
  const [editForm, setEditForm] = useState({
    role: '', department: '', title: '', salary: '', memberType: '',
  });

  const isManager = ['owner', 'ceo', 'executive', 'director', 'manager'].includes(callerRole);

  const fetchMembers = useCallback(async () => {
    if (!orgId) return;
    try {
      const res = await apiFetch(`/api/orgs/${orgId}/members`);
      if (!res.ok) throw new Error('Failed to load team');
      const data = await res.json();
      setMembers(data.members || []);
      setPendingInvites(data.pendingInvites || []);
      setCallerRole(data.callerRole || '');
      setHiddenCount(typeof data.hiddenCount === 'number' ? data.hiddenCount : 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load team');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const handleAdd = async () => {
    if (!addForm.email.includes('@')) {
      setError('Enter a valid email address');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch(`/api/orgs/${orgId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: addForm.email,
          role: addForm.role,
          department: addForm.department || undefined,
          title: addForm.title || undefined,
          salary: addForm.salary || undefined,
          memberType: addForm.memberType,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to add member'); return; }
      setShowAddForm(false);
      setAddForm({ email: '', role: 'specialist', department: '', title: '', salary: '', memberType: 'employee' });
      fetchMembers();
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (memberId: string) => {
    setSaving(true);
    setError('');
    try {
      const body: Record<string, string | null> = {};
      if (editForm.role) body.role = editForm.role;
      if (editForm.department !== undefined) body.department = editForm.department || null;
      if (editForm.title !== undefined) body.title = editForm.title || null;
      if (editForm.salary !== undefined) body.salary = editForm.salary || null;
      if (editForm.memberType) body.memberType = editForm.memberType;

      const res = await apiFetch(`/api/orgs/${orgId}/members/${memberId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to update member'); return; }
      setEditingId(null);
      fetchMembers();
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (memberId: string, name: string) => {
    if (!confirm(`Remove ${name} from the organization?`)) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/orgs/${orgId}/members/${memberId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to remove member');
        return;
      }
      fetchMembers();
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (m: OrgMember) => {
    setEditingId(m.userId);
    setEditForm({
      role: m.role,
      department: m.department || '',
      title: m.title || '',
      salary: m.salary || '',
      memberType: m.memberType || 'employee',
    });
  };

  if (!isAuthenticated && !loading) return <SignInPage context="Sign in to manage your team." />;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 text-cyan-500/40 animate-spin" />
      </div>
    );
  }

  const activeMembers = members.filter(m => m.status === 'active');
  const pendingMembers = members.filter(m => m.status === 'invited');
  const removedMembers = members.filter(m => m.status === 'removed');

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-xs font-mono">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto"><X className="w-3 h-3" /></button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-cyan-500/50" />
          <span className="font-mono text-xs text-cyan-400/70 tracking-wider">
            TEAM ({activeMembers.length} ACTIVE)
          </span>
        </div>
        {isManager && (
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/25 text-cyan-400/80 font-mono text-[10px] tracking-wider hover:bg-cyan-500/20 transition-colors rounded"
          >
            <UserPlus className="w-3 h-3" />
            ADD MEMBER
          </button>
        )}
      </div>

      {showAddForm && (
        <div className="bg-[#0c1018] border border-cyan-500/15 rounded-lg p-4 space-y-3">
          <h3 className="font-mono text-[11px] text-cyan-400/80 tracking-wider flex items-center gap-2">
            <UserPlus className="w-3.5 h-3.5" />
            ADD NEW TEAM MEMBER
          </h3>
          <p className="font-mono text-[9px] text-cyan-500/35 leading-relaxed">
            Enter their email. If they already have an account, they'll be added immediately and notified.
            If not, they'll be linked when they register with that email.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="font-mono text-[9px] text-cyan-500/40 tracking-wider mb-1 block">EMAIL *</label>
              <div className="relative">
                <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-cyan-500/30" />
                <input
                  type="email"
                  value={addForm.email}
                  onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="name@company.com"
                  className="w-full pl-8 pr-3 py-2 bg-[#080c12] border border-cyan-500/15 rounded text-cyan-300/80 text-xs font-mono placeholder:text-cyan-500/20 focus:border-cyan-500/40 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="font-mono text-[9px] text-cyan-500/40 tracking-wider mb-1 block">TYPE</label>
              <div className="flex gap-2">
                {(['employee', 'contractor'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setAddForm(f => ({ ...f, memberType: t }))}
                    className={`flex-1 px-3 py-2 rounded font-mono text-[10px] tracking-wider border transition-colors ${
                      addForm.memberType === t
                        ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                        : 'bg-[#080c12] border-cyan-500/10 text-cyan-500/40 hover:border-cyan-500/25'
                    }`}
                  >
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="font-mono text-[9px] text-cyan-500/40 tracking-wider mb-1 block">ROLE</label>
              <div className="relative">
                <Shield className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-cyan-500/30" />
                <select
                  value={addForm.role}
                  onChange={e => setAddForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full pl-8 pr-3 py-2 bg-[#080c12] border border-cyan-500/15 rounded text-cyan-300/80 text-xs font-mono focus:border-cyan-500/40 outline-none appearance-none"
                >
                  {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-cyan-500/30 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="font-mono text-[9px] text-cyan-500/40 tracking-wider mb-1 block">DEPARTMENT</label>
              <div className="relative">
                <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-cyan-500/30" />
                <input
                  type="text"
                  value={addForm.department}
                  onChange={e => setAddForm(f => ({ ...f, department: e.target.value }))}
                  placeholder="e.g. Engineering, Sales"
                  className="w-full pl-8 pr-3 py-2 bg-[#080c12] border border-cyan-500/15 rounded text-cyan-300/80 text-xs font-mono placeholder:text-cyan-500/20 focus:border-cyan-500/40 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="font-mono text-[9px] text-cyan-500/40 tracking-wider mb-1 block">TITLE</label>
              <div className="relative">
                <Briefcase className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-cyan-500/30" />
                <input
                  type="text"
                  value={addForm.title}
                  onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Sr. Developer"
                  className="w-full pl-8 pr-3 py-2 bg-[#080c12] border border-cyan-500/15 rounded text-cyan-300/80 text-xs font-mono placeholder:text-cyan-500/20 focus:border-cyan-500/40 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="font-mono text-[9px] text-cyan-500/40 tracking-wider mb-1 block">SALARY / RATE (ƒ FIAT)</label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-amber-400/40 font-mono">ƒ</span>
                <input
                  type="text"
                  value={addForm.salary}
                  onChange={e => setAddForm(f => ({ ...f, salary: e.target.value.replace(/[^0-9.]/g, '') }))}
                  placeholder="75000"
                  className="w-full pl-8 pr-3 py-2 bg-[#080c12] border border-cyan-500/15 rounded text-cyan-300/80 text-xs font-mono placeholder:text-cyan-500/20 focus:border-cyan-500/40 outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-1.5 font-mono text-[10px] text-cyan-500/40 tracking-wider hover:text-cyan-500/60 transition-colors"
            >
              CANCEL
            </button>
            <button
              onClick={handleAdd}
              disabled={saving || !addForm.email}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-mono text-[10px] tracking-wider hover:bg-cyan-500/25 transition-colors rounded disabled:opacity-40"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
              ADD TO TEAM
            </button>
          </div>
        </div>
      )}

      {!isManager && hiddenCount > 0 && (
        <div className="mb-2 px-3 py-2 bg-cyan-500/5 border border-cyan-500/15 rounded-lg flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-cyan-400/60 shrink-0" />
          <span className="font-mono text-[10px] text-cyan-300/60 tracking-wider">
            {hiddenCount} {hiddenCount === 1 ? 'ASSOCIATE' : 'ASSOCIATES'} ABOVE YOUR RANK NOT SHOWN
          </span>
        </div>
      )}

      {activeMembers.length > 0 && (
        <div className="space-y-1">
          {activeMembers.map(m => {
            const name = memberName(m);
            const isEditing = editingId === m.userId;
            const badge = STATUS_BADGE[m.status] || STATUS_BADGE.active;
            return (
              <div key={m.userId} className="bg-[#0c1018] border border-cyan-500/8 rounded-lg p-3 hover:border-cyan-500/15 transition-colors relative">
                {onlineUserIds?.has(m.userId) && (
                  <span className="absolute top-2 right-2 flex items-center gap-1.5 text-[9px] font-mono text-green-400/80 tracking-widest" title="Currently online">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.8)] animate-pulse" />
                    ONLINE
                  </span>
                )}
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-cyan-300/80">{name}</span>
                      <div className="flex gap-1.5">
                        <button onClick={() => handleUpdate(m.userId)} disabled={saving}
                          className="p-1 text-green-400/60 hover:text-green-400 transition-colors">
                          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => setEditingId(null)} className="p-1 text-red-400/60 hover:text-red-400 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="font-mono text-[8px] text-cyan-500/30 mb-0.5 block">TYPE</label>
                        <select value={editForm.memberType} onChange={e => setEditForm(f => ({ ...f, memberType: e.target.value }))}
                          className="w-full px-2 py-1.5 bg-[#080c12] border border-cyan-500/15 rounded text-cyan-300/80 text-[10px] font-mono outline-none">
                          <option value="employee">EMPLOYEE</option>
                          <option value="contractor">CONTRACTOR</option>
                        </select>
                      </div>
                      <div>
                        <label className="font-mono text-[8px] text-cyan-500/30 mb-0.5 block">ROLE</label>
                        <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                          className="w-full px-2 py-1.5 bg-[#080c12] border border-cyan-500/15 rounded text-cyan-300/80 text-[10px] font-mono outline-none">
                          {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="font-mono text-[8px] text-cyan-500/30 mb-0.5 block">DEPARTMENT</label>
                        <input value={editForm.department} onChange={e => setEditForm(f => ({ ...f, department: e.target.value }))}
                          className="w-full px-2 py-1.5 bg-[#080c12] border border-cyan-500/15 rounded text-cyan-300/80 text-[10px] font-mono outline-none" />
                      </div>
                      <div>
                        <label className="font-mono text-[8px] text-cyan-500/30 mb-0.5 block">TITLE</label>
                        <input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                          className="w-full px-2 py-1.5 bg-[#080c12] border border-cyan-500/15 rounded text-cyan-300/80 text-[10px] font-mono outline-none" />
                      </div>
                      <div>
                        <label className="font-mono text-[8px] text-cyan-500/30 mb-0.5 block">SALARY (ƒ FIAT)</label>
                        <input value={editForm.salary} onChange={e => setEditForm(f => ({ ...f, salary: e.target.value.replace(/[^0-9.]/g, '') }))}
                          className="w-full px-2 py-1.5 bg-[#080c12] border border-cyan-500/15 rounded text-cyan-300/80 text-[10px] font-mono outline-none" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-cyan-500/10 border border-cyan-500/15 flex items-center justify-center flex-shrink-0">
                      {resolveAvatarUrl(m.profileImageUrl) ? (
                        <img src={resolveAvatarUrl(m.profileImageUrl)} alt="" className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <span className="font-mono text-[10px] text-cyan-400/60">{name.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-cyan-300/80 truncate">{name}</span>
                        <span className={`font-mono text-[8px] tracking-wider ${ROLE_COLORS[m.role] || 'text-gray-400'}`}>
                          {ROLE_LABELS[m.role] || m.role.toUpperCase()}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded font-mono text-[7px] tracking-wider ${badge.bg} ${badge.text}`}>
                          {badge.label}
                        </span>
                        <span className="font-mono text-[8px] text-cyan-500/25 tracking-wider">
                          {(m.memberType || 'employee').toUpperCase()}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {m.title && <span className="font-mono text-[9px] text-cyan-500/40">{m.title}</span>}
                        {m.department && (
                          <span className="font-mono text-[9px] text-cyan-500/30 flex items-center gap-1">
                            <Building2 className="w-2.5 h-2.5" />{m.department}
                          </span>
                        )}
                        {m.email && (
                          <span className="font-mono text-[9px] text-cyan-500/25 flex items-center gap-1">
                            <Mail className="w-2.5 h-2.5" />{m.email}
                          </span>
                        )}
                        {m.salary && (
                          <span className="font-mono text-[9px] text-amber-400/50 flex items-center gap-1">
                            {fmtFiat(m.salary)}
                            <span className="text-emerald-400/30">{fmtUsd(m.salary)}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    {isManager && m.role !== 'owner' && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => startEdit(m)} className="p-1.5 text-cyan-500/30 hover:text-cyan-400 transition-colors" title="Edit">
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button onClick={() => handleRemove(m.userId, name)} className="p-1.5 text-cyan-500/20 hover:text-red-400 transition-colors" title="Remove">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {pendingMembers.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 pt-2">
            <Clock className="w-3.5 h-3.5 text-amber-500/50" />
            <span className="font-mono text-[10px] text-amber-400/60 tracking-wider">
              PENDING ({pendingMembers.length})
            </span>
          </div>
          {pendingMembers.map(m => {
            const name = memberName(m);
            return (
              <div key={m.userId} className="bg-[#0c1018] border border-amber-500/8 rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/15 flex items-center justify-center flex-shrink-0">
                    <span className="font-mono text-[10px] text-amber-400/60">{name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-cyan-300/60 truncate">{name}</span>
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/15 font-mono text-[7px] text-amber-400 tracking-wider">PENDING</span>
                      <span className="font-mono text-[8px] text-cyan-500/25 tracking-wider">
                        {(m.memberType || 'employee').toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {m.email && (
                        <span className="font-mono text-[9px] text-cyan-500/25 flex items-center gap-1">
                          <Mail className="w-2.5 h-2.5" />{m.email}
                        </span>
                      )}
                      <span className="font-mono text-[8px] text-cyan-500/20">
                        Not yet registered — will be linked when they sign up with this email
                      </span>
                    </div>
                  </div>
                  {isManager && (
                    <button onClick={() => handleRemove(m.userId, name)} className="p-1.5 text-cyan-500/20 hover:text-red-400 transition-colors" title="Remove">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pendingInvites.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 pt-2">
            <Mail className="w-3.5 h-3.5 text-purple-500/50" />
            <span className="font-mono text-[10px] text-purple-400/60 tracking-wider">
              INVITE LINKS ({pendingInvites.length})
            </span>
          </div>
          {pendingInvites.map(inv => (
            <div key={inv.id} className="bg-[#0c1018] border border-purple-500/8 rounded-lg p-2.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-cyan-300/50">
                  {inv.inviteEmail || inv.inviteUsername || 'Open invite'}
                </span>
                <span className="font-mono text-[8px] text-cyan-500/20">
                  Expires {new Date(inv.expiresAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {removedMembers.length > 0 && (
        <details className="pt-2">
          <summary className="font-mono text-[10px] text-red-400/40 tracking-wider cursor-pointer hover:text-red-400/60">
            REMOVED ({removedMembers.length})
          </summary>
          <div className="space-y-1 mt-1">
            {removedMembers.map(m => (
              <div key={m.userId} className="bg-[#0c1018] border border-red-500/5 rounded-lg p-2.5 opacity-50">
                <span className="font-mono text-xs text-cyan-300/40">{memberName(m)}</span>
                <span className="ml-2 font-mono text-[8px] text-red-400/40">REMOVED</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {members.length === 0 && !loading && (
        <div className="text-center py-10">
          <UserCheck className="w-8 h-8 text-cyan-500/20 mx-auto mb-3" />
          <p className="font-mono text-[11px] text-cyan-500/30 mb-1">NO TEAM MEMBERS YET</p>
          <p className="font-mono text-[9px] text-cyan-500/20">
            Use the "Add Member" button to add employees or contractors by email.
          </p>
        </div>
      )}

      <OrgPermissionsSection orgId={orgId} />

      <PhonePoolSection orgId={orgId} />

      {isManager && <OrgLaborHistorySection orgId={orgId} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// OrgPermissionsSection — the straightforward per-org permissions matrix. Every
// shareable capability (cross-user finances, tax export, CRM, roster, billing,
// settings) is a row mapped to a minimum role. Members whose role meets/exceeds
// the row's role may use that capability across the org. Only members holding
// `org.settings` (default CEO/owner) can change the matrix; everyone else sees
// it read-only so the policy is transparent.
// ---------------------------------------------------------------------------

interface PermissionRow {
  key: string;
  label: string;
  description: string;
  group: string;
  minRole: string;
  defaultMinRole: string;
  callerAllowed: boolean;
}

function OrgPermissionsSection({ orgId }: { orgId: number }) {
  const [rows, setRows] = useState<PermissionRow[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [callerRole, setCallerRole] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState(0);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`/api/orgs/${orgId}/permissions`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load permissions');
      const data = await res.json();
      setRows(data.permissions || []);
      setRoles(data.roles || []);
      setCanEdit(!!data.canEdit);
      setCallerRole(data.callerRole || '');
      setDraft({});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load permissions');
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const dirty = Object.keys(draft).length > 0;

  function setRoleFor(key: string, role: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, minRole: role } : r)));
    setDraft((prev) => ({ ...prev, [key]: role }));
  }

  async function save() {
    if (!dirty) return;
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch(`/api/orgs/${orgId}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: draft }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to save permissions');
      setSavedAt(Date.now());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save permissions');
    } finally {
      setSaving(false);
    }
  }

  if (!loaded && !loading) return null;

  const groups = Array.from(new Set(rows.map((r) => r.group)));

  return (
    <div className="mt-6 pt-4 border-t border-cyan-500/10 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-violet-400/70" />
          <span className="font-mono text-xs text-violet-300/70 tracking-wider">
            ORG PERMISSIONS
          </span>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-1.5 text-cyan-500/40 hover:text-cyan-300 disabled:opacity-40"
          title="Refresh"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <p className="font-mono text-[9px] text-cyan-500/40 leading-relaxed">
        Minimum role required for each shared capability. Members at or above the role can cross-use that org data.
        {!canEdit && <> Read-only — only those who can edit settings (your role: {callerRole.toUpperCase()}) can change this.</>}
      </p>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-[10px] font-mono">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto"><X className="w-3 h-3" /></button>
        </div>
      )}

      {groups.map((group) => (
        <div key={group} className="space-y-1.5">
          <p className="font-mono text-[9px] text-violet-300/40 tracking-widest uppercase">{group}</p>
          {rows.filter((r) => r.group === group).map((r) => (
            <div key={r.key} className="bg-[#0c1018] border border-violet-500/10 rounded-lg p-3 hover:border-violet-500/20 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs text-violet-200/90 flex items-center gap-1.5">
                    {r.label}
                    {r.callerAllowed
                      ? <Check className="w-3 h-3 text-emerald-400/70" />
                      : <X className="w-3 h-3 text-red-400/50" />}
                  </p>
                  <p className="font-mono text-[10px] text-cyan-500/50 leading-relaxed">{r.description}</p>
                </div>
                <select
                  value={r.minRole}
                  disabled={!canEdit || saving}
                  onChange={(e) => setRoleFor(r.key, e.target.value)}
                  className="bg-[#070a10] border border-violet-500/20 rounded px-2 py-1 font-mono text-[10px] text-violet-200/90 disabled:opacity-50 disabled:cursor-not-allowed focus:border-violet-400/50 focus:outline-none"
                >
                  {roles.filter((role) => role !== 'owner').map((role) => (
                    <option key={role} value={role}>{role.toUpperCase()}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      ))}

      {canEdit && (
        <div className="flex items-center justify-end gap-3 pt-1">
          {savedAt > 0 && !dirty && (
            <span className="font-mono text-[10px] text-emerald-400/70 flex items-center gap-1">
              <Check className="w-3 h-3" /> Saved
            </span>
          )}
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/15 border border-violet-500/30 rounded font-mono text-[10px] text-violet-200 hover:bg-violet-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Shield className="w-3 h-3" />}
            {saving ? 'Saving…' : 'Save permissions'}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PhonePoolSection — shows the org's phone-number pool (numbers Picasso staff
// have stamped into this org). All active members can see who currently
// holds each number; org admins (>= director, configurable server-side) can
// reassign or release numbers without going through Picasso staff.
//
// Hidden entirely if the pool is empty AND the caller can't manage it, so
// orgs without any allocated numbers don't see a misleading empty section.
// ---------------------------------------------------------------------------

interface PoolPhoneNumber {
  id: number;
  number: string;
  label: string;
  friendlyName: string | null;
  twilioSid: string | null;
  isActive: boolean;
  assignedAt: string;
  assignedTo: {
    userId: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  };
}

interface PoolMember {
  userId: string;
  role: string;
  title: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

function PhonePoolSection({ orgId }: { orgId: number }) {
  const [phones, setPhones] = useState<PoolPhoneNumber[]>([]);
  const [poolMembers, setPoolMembers] = useState<PoolMember[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [minRole, setMinRole] = useState<string>('director');
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [pickTarget, setPickTarget] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/orgs/${orgId}/phone-numbers`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 403 = not a member; just hide the section. Other errors surface.
        if (res.status !== 403) setError(data.error || `HTTP ${res.status}`);
        setLoaded(true);
        return;
      }
      setPhones(data.phoneNumbers || []);
      setPoolMembers(data.members || []);
      setCanManage(!!data.canManage);
      setMinRole(data.minManageRole || 'director');
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load phone pool');
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const handleAssign = async (phoneId: number) => {
    const targetUserId = pickTarget[phoneId];
    if (!targetUserId) return;
    setBusyId(phoneId);
    setError('');
    try {
      const res = await apiFetch(`/api/orgs/${orgId}/phone-numbers/${phoneId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUserId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || `HTTP ${res.status}`); return; }
      setPickTarget(prev => ({ ...prev, [phoneId]: '' }));
      load();
    } finally {
      setBusyId(null);
    }
  };

  const handleRelease = async (phoneId: number) => {
    if (!confirm('Release this number back to the org owner? Inbound calls will route to the owner until reassigned.')) return;
    setBusyId(phoneId);
    setError('');
    try {
      const res = await apiFetch(`/api/orgs/${orgId}/phone-numbers/${phoneId}/release`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || `HTTP ${res.status}`); return; }
      load();
    } finally {
      setBusyId(null);
    }
  };

  // Hide entirely if the org has no pool and the caller can't manage it.
  // Picasso staff still see/manage everything via the Admin Panel PHONES tab.
  if (loaded && phones.length === 0 && !canManage) return null;
  if (!loaded && !loading) return null;

  function memberLabel(m: PoolMember): string {
    const name = [m.firstName, m.lastName].filter(Boolean).join(' ').trim();
    return name || m.email || m.userId;
  }

  function holderLabel(p: PoolPhoneNumber): string {
    const a = p.assignedTo;
    const name = [a.firstName, a.lastName].filter(Boolean).join(' ').trim();
    return name || a.email || a.userId;
  }

  return (
    <div className="mt-6 pt-4 border-t border-cyan-500/10 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4 text-amber-400/70" />
          <span className="font-mono text-xs text-amber-300/70 tracking-wider">
            ORG PHONE POOL ({phones.length})
          </span>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-1.5 text-cyan-500/40 hover:text-cyan-300 disabled:opacity-40"
          title="Refresh"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-[10px] font-mono">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto"><X className="w-3 h-3" /></button>
        </div>
      )}

      {!canManage && phones.length > 0 && (
        <p className="font-mono text-[9px] text-cyan-500/40 leading-relaxed">
          Read-only — only {minRole.toUpperCase()} and above can reassign org phone numbers.
        </p>
      )}

      {phones.length === 0 ? (
        <p className="font-mono text-[10px] text-cyan-500/30 italic">
          No numbers in this org's pool yet. Picasso staff can add numbers from the Admin Panel.
        </p>
      ) : (
        <div className="space-y-1.5">
          {phones.map(p => {
            const holder = holderLabel(p);
            const draftUser = pickTarget[p.id] ?? '';
            const isBusy = busyId === p.id;
            return (
              <div key={p.id} className="bg-[#0c1018] border border-amber-500/10 rounded-lg p-3 hover:border-amber-500/20 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm text-amber-200/90">{p.number}</p>
                    <p className="font-mono text-[10px] text-cyan-500/50 truncate">
                      held by <span className="text-emerald-300/80">{holder}</span> · label: {p.label || 'main'}
                    </p>
                  </div>
                  {canManage && (
                    <button
                      onClick={() => handleRelease(p.id)}
                      disabled={isBusy}
                      className="px-2.5 py-1 rounded text-[9px] font-mono uppercase tracking-widest bg-red-500/10 text-red-300/80 border border-red-500/20 hover:bg-red-500/20 disabled:opacity-40"
                    >
                      {isBusy ? '…' : 'RELEASE'}
                    </button>
                  )}
                </div>
                {canManage && (
                  <div className="flex items-center gap-2 mt-2">
                    <select
                      value={draftUser}
                      onChange={e => setPickTarget(prev => ({ ...prev, [p.id]: e.target.value }))}
                      className="flex-1 bg-[#080c12] border border-cyan-500/15 rounded px-2 py-1 text-[10px] font-mono text-cyan-300/80"
                      data-testid={`phone-pool-pick-${p.id}`}
                    >
                      <option value="">— Reassign to —</option>
                      {poolMembers
                        .filter(m => m.userId !== p.assignedTo.userId)
                        .map(m => (
                          <option key={m.userId} value={m.userId} className="bg-zinc-900">
                            {memberLabel(m)} · {m.role}
                          </option>
                        ))}
                    </select>
                    <button
                      onClick={() => handleAssign(p.id)}
                      disabled={!draftUser || isBusy}
                      className="px-3 py-1 rounded text-[10px] font-mono uppercase tracking-widest bg-emerald-500/10 text-emerald-300 border border-emerald-500/25 hover:bg-emerald-500/20 disabled:opacity-30"
                      data-testid={`phone-pool-assign-${p.id}`}
                    >
                      {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : 'ASSIGN'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// OrgLaborHistorySection — shows org admins (manager+) a summary of all
// inmate labor that was directed to this org: who worked, how many tasks /
// construction shifts they completed, and how much total debt was forgiven
// as a result of that org-directed labor.
// ---------------------------------------------------------------------------

interface OrgLaborDebtor {
  userId: string;
  name: string;
  taskCount: number;
  shiftCount: number;
  totalLaborUnits: number;
  totalDebtForgiven: number;
  lastWorkedAt: string | null;
}

interface OrgLaborData {
  summary: {
    debtorCount: number;
    totalTaskCount: number;
    totalShiftCount: number;
    totalLaborUnits: number;
    totalDebtForgiven: number;
  };
  debtors: OrgLaborDebtor[];
}

interface OrgLaborSubmission {
  id: string;
  source: 'task' | 'construction';
  kind: string;
  body?: string | null;
  payload?: Record<string, unknown> | null;
  payoff: number;
  projectName?: string | null;
  units?: number | null;
  createdAt: string;
}

interface ActiveLaborRequest {
  id: number;
  title: string;
  payFiat: number;
  status: string;
  claimerName: string | null;
  claimedAt: string | null;
  createdAt: string;
  posterUserId: string;
}

function OrgLaborHistorySection({ orgId }: { orgId: number }) {
  const [data, setData] = useState<OrgLaborData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [expandedDebtor, setExpandedDebtor] = useState<string | null>(null);
  const [debtorSubmissions, setDebtorSubmissions] = useState<Map<string, OrgLaborSubmission[]>>(new Map());
  const [submissionsLoading, setSubmissionsLoading] = useState<string | null>(null);
  const [submissionsError, setSubmissionsError] = useState<Record<string, string>>({});

  // Active labor requests state
  const [activeRequests, setActiveRequests] = useState<ActiveLaborRequest[]>([]);
  const [activeLoading, setActiveLoading] = useState(false);
  const [activeError, setActiveError] = useState('');
  const [activeExpanded, setActiveExpanded] = useState(true);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [cancelError, setCancelError] = useState('');

  // Bounty form state
  const [showBountyForm, setShowBountyForm] = useState(false);
  const [bountyTitle, setBountyTitle] = useState('');
  const [bountyDesc, setBountyDesc] = useState('');
  const [bountyPay, setBountyPay] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [bountyError, setBountyError] = useState('');
  const [bountySuccess, setBountySuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`/api/cf/org-labor-history?orgId=${orgId}`);
      if (!res.ok) {
        if (res.status === 403) return;
        throw new Error('Failed to load labor history');
      }
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  const loadActiveRequests = useCallback(async () => {
    setActiveLoading(true);
    setActiveError('');
    try {
      const res = await apiFetch(`/api/services/by-org/${orgId}`);
      if (!res.ok) {
        if (res.status === 403) return;
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error ?? 'Failed to load active requests');
      }
      const json = await res.json();
      setActiveRequests(json.listings ?? []);
    } catch (e) {
      setActiveError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setActiveLoading(false);
    }
  }, [orgId]);

  const cancelRequest = useCallback(async (id: number) => {
    setCancellingId(id);
    setCancelError('');
    try {
      const res = await apiFetch(`/api/services/${id}/cancel`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCancelError(json?.error ?? 'Failed to cancel request.');
      } else {
        setActiveRequests((prev) => prev.filter((r) => r.id !== id));
      }
    } catch {
      setCancelError('Network error — please try again.');
    } finally {
      setCancellingId(null);
    }
  }, []);

  useEffect(() => { load(); loadActiveRequests(); }, [load, loadActiveRequests]);

  const loadSubmissions = useCallback(async (userId: string) => {
    if (debtorSubmissions.has(userId)) return;
    setSubmissionsLoading(userId);
    setSubmissionsError((prev) => { const next = { ...prev }; delete next[userId]; return next; });
    try {
      const res = await apiFetch(`/api/cf/org-labor-submissions?orgId=${orgId}&userId=${encodeURIComponent(userId)}`);
      if (!res.ok) throw new Error('Failed to load submissions');
      const json = await res.json();
      setDebtorSubmissions((prev) => new Map(prev).set(userId, json.submissions ?? []));
    } catch (e) {
      setSubmissionsError((prev) => ({ ...prev, [userId]: e instanceof Error ? e.message : 'Failed to load' }));
    } finally {
      setSubmissionsLoading(null);
    }
  }, [orgId, debtorSubmissions]);

  const toggleDebtor = useCallback((userId: string) => {
    if (expandedDebtor === userId) {
      setExpandedDebtor(null);
    } else {
      setExpandedDebtor(userId);
      loadSubmissions(userId);
    }
  }, [expandedDebtor, loadSubmissions]);

  const submitBounty = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setBountyError('');
    setBountySuccess('');
    const pay = parseInt(bountyPay, 10);
    if (!bountyTitle.trim()) { setBountyError('Title is required.'); return; }
    if (!Number.isFinite(pay) || pay <= 0) { setBountyError('Reward must be a positive number.'); return; }
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'Construction',
          title: bountyTitle.trim(),
          description: bountyDesc.trim() || undefined,
          payFiat: pay,
          payType: 'flat',
          posterOrgId: orgId,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBountyError(json?.error ?? 'Failed to post labor request.');
      } else {
        setBountySuccess(`Labor request posted. ID #${json?.listing?.id ?? '?'} — debtors can now claim it from the Collections Facility.`);
        setBountyTitle('');
        setBountyDesc('');
        setBountyPay('');
        setShowBountyForm(false);
        load();
        loadActiveRequests();
      }
    } catch {
      setBountyError('Network error — please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [bountyTitle, bountyDesc, bountyPay, orgId, load, loadActiveRequests]);

  if (!data && loading) return (
    <div className="mt-6 pt-4 border-t border-cyan-500/10 flex items-center gap-2 py-3">
      <Loader2 className="w-3 h-3 text-cyan-500/30 animate-spin" />
      <span className="font-mono text-[10px] text-cyan-500/30">Loading inmate labor data…</span>
    </div>
  );
  if (!data) return null;

  const { summary, debtors } = data;
  const visibleDebtors = showAll ? debtors : debtors.slice(0, 5);

  return (
    <div className="mt-6 pt-4 border-t border-cyan-500/10 space-y-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between group"
      >
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-amber-400/70" />
          <span className="font-mono text-xs text-amber-300/70 tracking-wider">
            INMATE LABOR RECEIVED
          </span>
          {summary.debtorCount > 0 && (
            <span className="px-1.5 py-0.5 bg-amber-500/15 text-amber-300/80 text-[9px] font-mono rounded">
              {summary.debtorCount} worker{summary.debtorCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); setShowBountyForm((v) => !v); setBountyError(''); setBountySuccess(''); }}
            className={`flex items-center gap-1 px-2 py-1 rounded border text-[9px] font-mono cursor-pointer transition-colors ${showBountyForm ? 'bg-amber-500/20 border-amber-500/40 text-amber-200' : 'bg-amber-500/10 border-amber-500/20 text-amber-400/70 hover:border-amber-500/40 hover:text-amber-200'}`}
            title="Post a labor request that CF debtors can claim"
          >
            <Plus className="w-2.5 h-2.5" />
            POST REQUEST
          </span>
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); load(); }}
            className="p-1.5 text-cyan-500/40 hover:text-cyan-300 cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </span>
          <ChevronDown
            className={`w-4 h-4 text-cyan-500/40 transition-transform group-hover:text-cyan-400 ${expanded ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-[10px] font-mono">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto"><X className="w-3 h-3" /></button>
        </div>
      )}

      {bountySuccess && (
        <div className="flex items-start gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded text-emerald-300 text-[10px] font-mono">
          <Check className="w-3 h-3 flex-shrink-0 mt-0.5" />
          <span className="flex-1">{bountySuccess}</span>
          <button onClick={() => setBountySuccess('')} className="flex-shrink-0"><X className="w-3 h-3" /></button>
        </div>
      )}

      {showBountyForm && (
        <form
          onSubmit={submitBounty}
          className="bg-[#0a0d12] border border-amber-500/20 rounded-lg p-4 space-y-3"
        >
          <p className="font-mono text-[9px] text-amber-400/60 tracking-widest uppercase">New Labor Request</p>
          <p className="font-mono text-[10px] text-cyan-500/50 leading-relaxed">
            Post a gig that CF debtors can claim from the Collections Facility. Reward is escrowed from your checking account and applied to their debt on completion.
          </p>

          {bountyError && (
            <div className="flex items-center gap-2 px-2.5 py-2 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-[10px] font-mono">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              <span className="flex-1">{bountyError}</span>
              <button type="button" onClick={() => setBountyError('')}><X className="w-3 h-3" /></button>
            </div>
          )}

          <div className="space-y-2">
            <label className="block">
              <span className="font-mono text-[9px] text-amber-400/60 tracking-wider uppercase">Title *</span>
              <input
                type="text"
                value={bountyTitle}
                onChange={(e) => setBountyTitle(e.target.value)}
                placeholder="e.g. Office cleaning shift"
                maxLength={120}
                required
                className="mt-1 w-full bg-[#0c1018] border border-cyan-500/20 rounded px-2.5 py-1.5 font-mono text-xs text-cyan-100 placeholder:text-cyan-500/30 focus:outline-none focus:border-amber-500/40"
              />
            </label>

            <label className="block">
              <span className="font-mono text-[9px] text-amber-400/60 tracking-wider uppercase">Description</span>
              <textarea
                value={bountyDesc}
                onChange={(e) => setBountyDesc(e.target.value)}
                placeholder="Describe the work and any requirements…"
                rows={2}
                maxLength={1000}
                className="mt-1 w-full bg-[#0c1018] border border-cyan-500/20 rounded px-2.5 py-1.5 font-mono text-xs text-cyan-100 placeholder:text-cyan-500/30 focus:outline-none focus:border-amber-500/40 resize-none"
              />
            </label>

            <label className="block">
              <span className="font-mono text-[9px] text-amber-400/60 tracking-wider uppercase">ƒ Reward per shift *</span>
              <input
                type="number"
                value={bountyPay}
                onChange={(e) => setBountyPay(e.target.value)}
                placeholder="500"
                min={1}
                max={500000000}
                required
                className="mt-1 w-full bg-[#0c1018] border border-cyan-500/20 rounded px-2.5 py-1.5 font-mono text-xs text-amber-200 placeholder:text-cyan-500/30 focus:outline-none focus:border-amber-500/40"
              />
              <p className="font-mono text-[9px] text-cyan-500/40 mt-0.5">Debited from your checking account as escrow.</p>
            </label>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 border border-amber-500/30 text-amber-200 font-mono text-[10px] rounded hover:bg-amber-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              {submitting ? 'Posting…' : 'Post Labor Request'}
            </button>
            <button
              type="button"
              onClick={() => { setShowBountyForm(false); setBountyError(''); }}
              className="px-3 py-1.5 border border-cyan-500/20 text-cyan-500/50 hover:text-cyan-300 font-mono text-[10px] rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* ── Active Labor Requests ── */}
      <div className="border border-amber-500/15 rounded-lg overflow-hidden">
        <button
          onClick={() => setActiveExpanded((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2.5 group bg-[#0a0d12] hover:bg-amber-500/5 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Hammer className="w-3.5 h-3.5 text-amber-400/60" />
            <span className="font-mono text-[10px] text-amber-300/70 tracking-wider uppercase">
              Active Labor Requests
            </span>
            {activeRequests.length > 0 && (
              <span className="px-1.5 py-0.5 bg-amber-500/15 text-amber-300/80 text-[9px] font-mono rounded">
                {activeRequests.length}
              </span>
            )}
            {activeLoading && <Loader2 className="w-3 h-3 text-amber-400/40 animate-spin" />}
          </div>
          <div className="flex items-center gap-2">
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); loadActiveRequests(); }}
              className="p-1 text-cyan-500/40 hover:text-cyan-300 cursor-pointer"
              title="Refresh"
            >
              <RefreshCw className={`w-3 h-3 ${activeLoading ? 'animate-spin' : ''}`} />
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-cyan-500/40 transition-transform group-hover:text-cyan-400 ${activeExpanded ? 'rotate-180' : ''}`}
            />
          </div>
        </button>

        {activeExpanded && (
          <div className="border-t border-amber-500/10 px-3 pb-3 pt-2.5 space-y-2 bg-[#080c12]">
            {activeError && (
              <div className="flex items-center gap-2 px-2.5 py-2 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-[10px] font-mono">
                <AlertCircle className="w-3 h-3 flex-shrink-0" />
                <span className="flex-1">{activeError}</span>
                <button onClick={() => setActiveError('')}><X className="w-3 h-3" /></button>
              </div>
            )}

            {cancelError && (
              <div className="flex items-center gap-2 px-2.5 py-2 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-[10px] font-mono">
                <AlertCircle className="w-3 h-3 flex-shrink-0" />
                <span className="flex-1">{cancelError}</span>
                <button onClick={() => setCancelError('')}><X className="w-3 h-3" /></button>
              </div>
            )}

            {!activeLoading && activeRequests.length === 0 && !activeError && (
              <p className="font-mono text-[10px] text-cyan-500/30 italic py-1">
                No open labor requests. Use POST REQUEST above to create one.
              </p>
            )}

            {activeRequests.map((req) => {
              const postedDate = new Date(req.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              const isOpen = req.status === 'open';
              const isCancelling = cancellingId === req.id;
              return (
                <div
                  key={req.id}
                  className="bg-[#0c1018] border border-amber-500/10 rounded-lg p-2.5 flex items-start gap-2 hover:border-amber-500/20 transition-colors"
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-medium tracking-wide ${
                          isOpen
                            ? 'bg-emerald-500/15 text-emerald-300/80'
                            : 'bg-amber-500/15 text-amber-300/80'
                        }`}
                      >
                        {isOpen ? 'OPEN' : 'CLAIMED'}
                      </span>
                      <span className="font-mono text-[9px] text-cyan-500/30">#{req.id}</span>
                      <span className="font-mono text-[9px] text-cyan-500/30">{postedDate}</span>
                    </div>
                    <p className="font-mono text-xs text-cyan-100/85 leading-snug truncate" title={req.title}>
                      {req.title}
                    </p>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[10px] text-amber-300/70">
                        ƒ{req.payFiat.toLocaleString('en-US')} reward
                      </span>
                      {!isOpen && req.claimerName && (
                        <span className="font-mono text-[10px] text-cyan-400/60">
                          → {req.claimerName}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => cancelRequest(req.id)}
                    disabled={isCancelling}
                    className="flex-shrink-0 flex items-center gap-1 px-2 py-1 bg-red-500/10 border border-red-500/20 text-red-400/70 hover:text-red-300 hover:bg-red-500/20 font-mono text-[9px] rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Cancel this request and return escrow"
                  >
                    {isCancelling ? (
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    ) : (
                      <Ban className="w-2.5 h-2.5" />
                    )}
                    {isCancelling ? 'Cancelling…' : 'Cancel'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {summary.debtorCount === 0 ? (
        <p className="font-mono text-[10px] text-cyan-500/30 italic">
          No inmate labor directed to this org yet. When debtors in the Collections Facility choose your org's projects, their activity will appear here.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#0c1018] border border-amber-500/10 rounded-lg p-3 text-center">
              <p className="font-mono text-base text-amber-200/90 leading-none">
                ƒ{summary.totalDebtForgiven.toLocaleString('en-US')}
              </p>
              <p className="font-mono text-[9px] text-amber-400/50 tracking-wider mt-1">DEBT FORGIVEN</p>
            </div>
            <div className="bg-[#0c1018] border border-emerald-500/10 rounded-lg p-3 text-center">
              <p className="font-mono text-base text-emerald-200/90 leading-none">
                {summary.debtorCount}
              </p>
              <p className="font-mono text-[9px] text-emerald-400/50 tracking-wider mt-1">WORKERS</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-[#0c1018] border border-cyan-500/10 rounded-lg p-2.5 text-center">
              <p className="font-mono text-sm text-cyan-200/90 leading-none">
                {summary.totalShiftCount.toLocaleString('en-US')}
              </p>
              <p className="font-mono text-[9px] text-cyan-400/50 tracking-wider mt-1">SHIFTS</p>
            </div>
            <div className="bg-[#0c1018] border border-violet-500/10 rounded-lg p-2.5 text-center">
              <p className="font-mono text-sm text-violet-200/90 leading-none">
                {summary.totalLaborUnits.toLocaleString('en-US')}
              </p>
              <p className="font-mono text-[9px] text-violet-400/50 tracking-wider mt-1">LABOR UNITS</p>
            </div>
            <div className="bg-[#0c1018] border border-blue-500/10 rounded-lg p-2.5 text-center">
              <p className="font-mono text-sm text-blue-200/90 leading-none">
                {summary.totalTaskCount.toLocaleString('en-US')}
              </p>
              <p className="font-mono text-[9px] text-blue-400/50 tracking-wider mt-1">TASK SUBS</p>
            </div>
          </div>

          {expanded && (
            <div className="space-y-1.5">
              <p className="font-mono text-[9px] text-cyan-500/40 tracking-widest uppercase pt-1">Worker breakdown</p>
              {visibleDebtors.map((d) => {
                const lastDate = d.lastWorkedAt
                  ? new Date(d.lastWorkedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  : null;
                const isDebtorExpanded = expandedDebtor === d.userId;
                const subs = debtorSubmissions.get(d.userId);
                const subsLoadingThis = submissionsLoading === d.userId;
                const subErr = submissionsError[d.userId];
                return (
                  <div
                    key={d.userId}
                    className="bg-[#0c1018] border border-amber-500/10 rounded-lg overflow-hidden hover:border-amber-500/20 transition-colors"
                  >
                    <button
                      onClick={() => toggleDebtor(d.userId)}
                      className="w-full flex items-start justify-between gap-3 p-3 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-xs text-amber-200/90 truncate">{d.name}</p>
                        <p className="font-mono text-[10px] text-cyan-500/50 mt-0.5">
                          {d.taskCount > 0 && <>{d.taskCount} task sub{d.taskCount !== 1 ? 's' : ''}</>}
                          {d.taskCount > 0 && d.shiftCount > 0 && <span className="mx-1 opacity-40">·</span>}
                          {d.shiftCount > 0 && <>{d.shiftCount} shift{d.shiftCount !== 1 ? 's' : ''}{d.totalLaborUnits > 0 ? ` (${d.totalLaborUnits.toLocaleString('en-US')} units)` : ''}</>}
                          {lastDate && <span className="ml-1 opacity-50">· last {lastDate}</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="text-right">
                          <p className="font-mono text-xs text-amber-300/80">
                            ƒ{d.totalDebtForgiven.toLocaleString('en-US')}
                          </p>
                          <p className="font-mono text-[9px] text-amber-500/40">forgiven</p>
                        </div>
                        <ChevronDown
                          className={`w-3 h-3 text-cyan-500/40 transition-transform ${isDebtorExpanded ? 'rotate-180' : ''}`}
                        />
                      </div>
                    </button>

                    {isDebtorExpanded && (
                      <div className="border-t border-amber-500/10 px-3 pb-3 pt-2 space-y-1.5">
                        {subsLoadingThis && (
                          <div className="flex items-center gap-2 py-2">
                            <Loader2 className="w-3 h-3 text-cyan-500/30 animate-spin" />
                            <span className="font-mono text-[10px] text-cyan-500/30">Loading submissions…</span>
                          </div>
                        )}
                        {subErr && (
                          <div className="flex items-center gap-2 px-2 py-1.5 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-[10px] font-mono">
                            <AlertCircle className="w-3 h-3 flex-shrink-0" />
                            <span>{subErr}</span>
                          </div>
                        )}
                        {subs && subs.length === 0 && (
                          <p className="font-mono text-[10px] text-cyan-500/30 italic py-1">No submission detail found.</p>
                        )}
                        {subs && subs.length > 0 && (
                          <>
                            <p className="font-mono text-[9px] text-cyan-500/30 tracking-widest uppercase">Submissions</p>
                            {subs.map((s) => {
                              const ts = new Date(s.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                              const kindTag = s.kind === 'bug' ? 'BUG' : s.kind === 'feature' ? 'FEATURE' : s.kind === 'construction' ? 'BUILD' : s.kind.toUpperCase();
                              const kindColor = s.kind === 'bug'
                                ? 'bg-red-500/15 text-red-300/80'
                                : s.kind === 'feature'
                                ? 'bg-violet-500/15 text-violet-300/80'
                                : s.kind === 'construction'
                                ? 'bg-amber-500/15 text-amber-300/80'
                                : 'bg-cyan-500/10 text-cyan-300/60';
                              return (
                                <div key={s.id} className="rounded border border-cyan-500/8 bg-[#080c12] p-2 space-y-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5">
                                      {s.source === 'construction' ? (
                                        <Hammer className="w-2.5 h-2.5 text-amber-400/50" />
                                      ) : (
                                        <FileText className="w-2.5 h-2.5 text-cyan-400/50" />
                                      )}
                                      <span className={`px-1 py-0.5 rounded text-[9px] font-mono font-medium ${kindColor}`}>
                                        {kindTag}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-[9px] text-amber-400/60">
                                        ƒ{s.payoff.toLocaleString('en-US')}
                                      </span>
                                      <span className="font-mono text-[9px] text-cyan-500/30">{ts}</span>
                                    </div>
                                  </div>
                                  {s.source === 'construction' && s.projectName && (
                                    <p className="font-mono text-[10px] text-cyan-300/60 leading-snug">
                                      {s.projectName}
                                      {s.units != null && s.units > 0 && (
                                        <span className="ml-1 text-cyan-500/40">· {s.units} unit{s.units !== 1 ? 's' : ''}</span>
                                      )}
                                    </p>
                                  )}
                                  {s.source === 'task' && s.body && (
                                    <p className="font-mono text-[10px] text-cyan-100/70 leading-snug whitespace-pre-wrap break-words">
                                      {s.body}
                                    </p>
                                  )}
                                  {s.source === 'task' && !s.body && s.payload && (
                                    <p className="font-mono text-[10px] text-cyan-500/40 leading-snug">
                                      {JSON.stringify(s.payload)}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {debtors.length > 5 && !showAll && (
                <button
                  onClick={() => setShowAll(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 font-mono text-[10px] text-cyan-500/50 hover:text-cyan-300 transition-colors"
                >
                  <ChevronRight className="w-3 h-3" />
                  Show all {debtors.length} workers
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
