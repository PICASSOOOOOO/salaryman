import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { resolveAvatarUrl } from '@/lib/avatar';
import { Loader2, Users, Building2, Shield, MessageSquare } from 'lucide-react';

interface ColleagueMember {
  userId: string;
  role: string;
  department: string | null;
  title: string | null;
  memberType: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  online: boolean;
  lastSeenAt: string | null;
  isSelf: boolean;
}

interface ColleagueOrgGroup {
  orgId: number;
  orgName: string;
  callerRole: string;
  hiddenCount: number;
  members: ColleagueMember[];
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'OWNER', ceo: 'CEO', executive: 'EXECUTIVE',
  director: 'DIRECTOR', manager: 'MANAGER', specialist: 'SPECIALIST',
};
const ROLE_COLORS: Record<string, string> = {
  owner: 'text-amber-400', ceo: 'text-purple-400', executive: 'text-blue-400',
  director: 'text-cyan-400', manager: 'text-green-400', specialist: 'text-gray-400',
};
const ROLE_RANK: Record<string, number> = {
  owner: 100, ceo: 90, executive: 80, director: 60, manager: 40, specialist: 20,
};

function memberName(m: ColleagueMember): string {
  if (m.firstName || m.lastName) return [m.firstName, m.lastName].filter(Boolean).join(' ');
  return m.userId.startsWith('pending_') ? 'Pending Registration' : m.userId;
}

function fmtRelative(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'moments ago';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function ColleaguesPanel() {
  const [groups, setGroups] = useState<ColleagueOrgGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/orgs/me/colleagues');
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      setGroups(data.orgs ?? []);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load colleagues');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 25_000);
    return () => clearInterval(t);
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-5 h-5 text-cyan-400/40 animate-spin" />
      </div>
    );
  }

  if (error) {
    return <div className="p-6 text-center text-red-400/70 font-mono text-xs">{error}</div>;
  }

  if (groups.length === 0) {
    return (
      <div className="p-10 text-center">
        <Users className="w-10 h-10 text-cyan-400/15 mx-auto mb-3" />
        <p className="font-mono text-xs text-cyan-400/40">NO ASSOCIATES — JOIN OR CREATE AN ORGANIZATION</p>
      </div>
    );
  }

  const totalOnline = groups.reduce((acc, g) => acc + g.members.filter(m => m.online && !m.isSelf).length, 0);
  const totalMembers = groups.reduce((acc, g) => acc + g.members.filter(m => !m.isSelf).length, 0);

  return (
    <div className="p-4 max-w-4xl mx-auto w-full space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-cyan-400/60" />
          <span className="font-sans text-xs text-cyan-300/70 tracking-widest font-medium">ASSOCIATES</span>
        </div>
        <div className="font-mono text-[10px] text-cyan-400/50 tracking-wider">
          <span className="text-green-400/80">{totalOnline}</span> ONLINE / {totalMembers} TOTAL
          {' · '}
          {groups.length} {groups.length === 1 ? 'OFFICE' : 'OFFICES'}
        </div>
      </div>

      {groups.map(g => {
        const sorted = [...g.members].sort((a, b) => {
          if (a.online !== b.online) return a.online ? -1 : 1;
          const ar = ROLE_RANK[a.role] ?? 0;
          const br = ROLE_RANK[b.role] ?? 0;
          if (ar !== br) return br - ar;
          return memberName(a).localeCompare(memberName(b));
        });
        const onlineHere = g.members.filter(m => m.online && !m.isSelf).length;
        return (
          <div key={g.orgId} className="border border-cyan-500/10 rounded-lg overflow-hidden bg-[#0a0d14]">
            <div className="flex items-center justify-between px-3 py-2 border-b border-cyan-500/10 bg-[#0c1018]">
              <div className="flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-cyan-400/50" />
                <span className="font-sans text-xs text-cyan-300/80 tracking-widest font-medium">{g.orgName.toUpperCase()}</span>
                <span className={`font-mono text-[9px] tracking-widest ${ROLE_COLORS[g.callerRole] ?? 'text-cyan-400/50'}`}>
                  YOU: {ROLE_LABELS[g.callerRole] ?? g.callerRole.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center gap-2 font-mono text-[10px] text-cyan-400/50">
                <span><span className="text-green-400/80">{onlineHere}</span>/{g.members.filter(m => !m.isSelf).length}</span>
                {g.hiddenCount > 0 && (
                  <span className="flex items-center gap-1 text-cyan-400/40" title="Some associates are above your rank and hidden">
                    <Shield className="w-3 h-3" />+{g.hiddenCount}
                  </span>
                )}
              </div>
            </div>
            <div className="divide-y divide-cyan-500/5">
              {sorted.map(m => {
                const name = memberName(m);
                return (
                  <div key={m.userId} className="flex items-center gap-3 px-3 py-2 hover:bg-cyan-500/[0.03] transition-colors">
                    <div className="relative shrink-0">
                      {resolveAvatarUrl(m.profileImageUrl) ? (
                        <img src={resolveAvatarUrl(m.profileImageUrl)} alt={name} className="w-7 h-7 rounded-full object-cover" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center font-mono text-[11px] text-cyan-300/70">
                          {(name?.trim()?.[0] ?? '?').toUpperCase()}
                        </div>
                      )}
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0a0d14] ${
                          m.online ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.8)]' : 'bg-gray-600'
                        }`}
                        title={m.online ? 'Online' : `Last seen ${fmtRelative(m.lastSeenAt)}`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-cyan-200/90 truncate">{name}{m.isSelf ? ' (you)' : ''}</span>
                        <span className={`font-mono text-[9px] tracking-widest ${ROLE_COLORS[m.role] ?? 'text-gray-400'}`}>
                          {ROLE_LABELS[m.role] ?? m.role.toUpperCase()}
                        </span>
                      </div>
                      {(m.title || m.department) && (
                        <div className="font-mono text-[10px] text-cyan-400/40 truncate">
                          {[m.title, m.department].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>
                    <div className="font-mono text-[9px] text-cyan-400/40 tracking-wider shrink-0">
                      {m.online ? <span className="text-green-400/80">ONLINE</span> : fmtRelative(m.lastSeenAt).toUpperCase()}
                    </div>
                    {!m.isSelf && !m.userId.startsWith('pending_') && (
                      <button
                        onClick={() => window.dispatchEvent(new CustomEvent('salaryman:open-dm', { detail: { userId: m.userId } }))}
                        className="ml-1 p-1.5 rounded text-cyan-400/40 hover:text-cyan-300 hover:bg-cyan-500/10 transition-colors shrink-0"
                        title={`Message ${name}`}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
