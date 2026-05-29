import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { resolveAvatarUrl } from '@/lib/avatar';
import { useAuth } from '@workspace/replit-auth-web';
import { SignInPage } from '@/components/SignInPrompt';
import {
  Users, UserPlus, Mail, Briefcase, Building2,
  Shield, Loader2, Trash2, Pencil, X, Check, ChevronDown,
  Clock, UserCheck, AlertCircle, Phone, RefreshCw,
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

      <PhonePoolSection orgId={orgId} />
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
