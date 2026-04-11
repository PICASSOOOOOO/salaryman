import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Users, Building2, UserCog, Eye, AlertTriangle, FileText,
  LayoutDashboard, Crosshair, ShieldCheck, Loader2, Ban,
  Search, ChevronRight, Map,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@workspace/replit-auth-web';
import { useOrg } from '@/hooks/use-org';
import { usePlan } from '@/hooks/use-plan';
import { useBoomerMode } from '@/hooks/use-mobile';
import { useLocation } from 'wouter';
import { ADMIN_SUBS } from '@/lib/modules';

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

type AdminTab = 'users' | 'orgs' | 'roles' | 'moderators' | 'bans';

export default function AdminPanel() {
  const { isAuthenticated } = useAuth();
  const { org } = useOrg();
  const { isOwner } = usePlan();
  const [boomerMode] = useBoomerMode();
  const [location, navigate] = useLocation();

  const searchParams = new URLSearchParams(location.split('?')[1] || '');
  const tabParam = searchParams.get('tab') as AdminTab | null;
  const activeTab: AdminTab = tabParam ?? 'users';

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [orgs, setOrgs] = useState<OrgRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!isAuthenticated) return;
    setLoading(true);
    Promise.all([
      apiFetch('/api/admin/users').then(r => r.json()).catch(() => ({ users: [] })),
      apiFetch('/api/admin/orgs').then(r => r.json()).catch(() => ({ orgs: [] })),
    ]).then(([u, o]) => {
      setUsers(u.users ?? []);
      setOrgs(o.orgs ?? []);
    }).finally(() => setLoading(false));
  }, [isAuthenticated]);

  if (!org && !isOwner) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <ShieldCheck className="w-12 h-12 text-zinc-600" />
        <p className="text-sm text-zinc-500 font-mono tracking-widest uppercase">ACCESS RESTRICTED</p>
        <p className="text-xs text-zinc-600">Admin panel requires organization membership.</p>
      </div>
    );
  }

  const filteredUsers = users.filter(u => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (u.email?.toLowerCase().includes(q) || u.firstName?.toLowerCase().includes(q) || u.lastName?.toLowerCase().includes(q));
  });

  return (
    <div className="p-6 max-w-5xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">{boomerMode ? 'ADMIN PANEL' : 'COMMAND CENTER'}</h2>
          <p className="text-sm text-muted-foreground">Manage users, businesses, roles, and moderation</p>
        </div>
      </div>

      <div className="flex gap-1 mb-6 overflow-x-auto scrollbar-hide border-b border-white/[0.06] pb-2">
        {(['users', 'orgs', 'roles', 'moderators', 'bans'] as AdminTab[]).map(tab => {
          const icons: Record<AdminTab, React.ComponentType<{ className?: string }>> = {
            users: Users,
            orgs: Building2,
            roles: UserCog,
            moderators: Eye,
            bans: AlertTriangle,
          };
          const labels: Record<AdminTab, string> = {
            users: 'USERS',
            orgs: 'BUSINESSES',
            roles: 'ROLES',
            moderators: 'MODERATORS',
            bans: 'BANS',
          };
          const Icon = icons[tab];
          return (
            <button
              key={tab}
              onClick={() => navigate(tab === 'users' ? '/profile/admin' : `/profile/admin?tab=${tab}`)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-mono tracking-widest uppercase transition-colors shrink-0 ${
                activeTab === tab
                  ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                  : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/4 border border-transparent'
              }`}
            >
              <Icon className="w-3 h-3" />
              {labels[tab]}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" />
        </div>
      ) : (
        <>
          {activeTab === 'users' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search users..."
                  className="w-full pl-10 pr-4 py-2.5 bg-muted/20 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-sky-500/40"
                />
              </div>
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="grid grid-cols-[1fr_1fr_120px_80px] gap-4 px-4 py-2.5 border-b border-border bg-muted/10 text-[10px] font-mono tracking-widest uppercase text-zinc-500">
                  <span>NAME</span>
                  <span>EMAIL</span>
                  <span>JOINED</span>
                  <span>ACTIONS</span>
                </div>
                {filteredUsers.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-zinc-600">No users found</div>
                ) : (
                  filteredUsers.slice(0, 50).map(u => (
                    <div key={u.id} className="grid grid-cols-[1fr_1fr_120px_80px] gap-4 px-4 py-3 border-b border-border/50 hover:bg-white/[0.02] items-center">
                      <div className="flex items-center gap-2 min-w-0">
                        {u.profileImageUrl ? (
                          <img src={u.profileImageUrl} alt="" className="w-6 h-6 rounded-md object-cover" />
                        ) : (
                          <div className="w-6 h-6 rounded-md bg-sky-500/10 flex items-center justify-center text-[10px] font-mono text-sky-300">
                            {(u.firstName?.[0] || u.email?.[0] || '?').toUpperCase()}
                          </div>
                        )}
                        <span className="text-sm text-foreground truncate">
                          {[u.firstName, u.lastName].filter(Boolean).join(' ') || 'Unknown'}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground truncate">{u.email || '—'}</span>
                      <span className="text-[10px] text-zinc-500">
                        {new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                      </span>
                      <button
                        onClick={() => navigate(`/profile/${u.id}`)}
                        className="text-[10px] font-mono text-sky-400 hover:text-sky-300 transition-colors"
                      >
                        VIEW
                      </button>
                    </div>
                  ))
                )}
              </div>
              <p className="text-[10px] text-zinc-600 font-mono">{filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''} total</p>
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
                    <div className="flex gap-3">
                      <div className="bg-muted/20 rounded-lg px-3 py-1.5 flex-1">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Members</p>
                        <p className="text-sm font-bold text-foreground">{o.memberCount ?? '—'}</p>
                      </div>
                      <div className="bg-muted/20 rounded-lg px-3 py-1.5 flex-1">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Size</p>
                        <p className="text-sm font-bold text-foreground">{o.size ?? '—'}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {orgs.length === 0 && (
                <div className="text-center py-12 text-sm text-zinc-600">No organizations registered yet</div>
              )}
            </motion.div>
          )}

          {activeTab === 'roles' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <p className="text-xs text-zinc-500 mb-4">Assign roles and permissions to users within the platform.</p>
              {[
                { role: 'owner', label: 'OWNER', desc: 'Full access to all platform features, billing, and admin controls.', color: 'amber' },
                { role: 'manager', label: 'MANAGER', desc: 'Manage team members, view reports, and configure business settings.', color: 'violet' },
                { role: 'moderator', label: 'MODERATOR', desc: 'Monitor user activity, manage bans, review reports, and oversee Minx City.', color: 'emerald' },
                { role: 'member', label: 'MEMBER', desc: 'Standard access to all subscribed features and tools.', color: 'sky' },
              ].map(r => (
                <div key={r.role} className={`bg-card border border-border rounded-xl p-4 hover:border-${r.color}-500/20 transition-colors`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg bg-${r.color}-500/15 border border-${r.color}-500/25 flex items-center justify-center`}>
                        <UserCog className={`w-4 h-4 text-${r.color}-400`} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground">{r.label}</p>
                        <p className="text-xs text-muted-foreground">{r.desc}</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-600" />
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {activeTab === 'moderators' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-5 mb-4">
                <div className="flex items-center gap-3 mb-3">
                  <Eye className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-sm font-bold text-foreground">MODERATOR SYSTEM</h3>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Moderators are trusted users who help manage the platform. They can monitor user activity in Minx City,
                  review flagged content, issue warnings and temporary bans, and access the World Overview Map for real-time surveillance.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { label: 'WORLD MONITOR', desc: 'Watch real-time player activity on the world map', icon: Map, path: '/profile/world-map' },
                  { label: 'BAN MANAGEMENT', desc: 'Issue warnings, temp bans, and permanent bans', icon: Ban, path: '/profile/admin?tab=bans' },
                  { label: 'CONTENT REVIEW', desc: 'Review flagged messages, usernames, and business names', icon: FileText, path: '#' },
                  { label: 'ACTIVITY LOG', desc: 'Audit trail of all moderator actions taken', icon: Crosshair, path: '#' },
                ].map(item => (
                  <button
                    key={item.label}
                    onClick={() => item.path !== '#' && navigate(item.path)}
                    className="bg-card border border-border rounded-xl p-4 text-left hover:border-emerald-500/20 transition-colors group"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                        <item.icon className="w-4 h-4 text-emerald-400" />
                      </div>
                      <p className="text-xs font-bold text-foreground tracking-wider">{item.label}</p>
                    </div>
                    <p className="text-[11px] text-zinc-500">{item.desc}</p>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'bans' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="bg-red-500/5 border border-red-500/15 rounded-xl p-5 mb-4">
                <div className="flex items-center gap-3 mb-3">
                  <Ban className="w-5 h-5 text-red-400" />
                  <h3 className="text-sm font-bold text-foreground">BANS & SUSPENSIONS</h3>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Manage user bans and suspensions across the platform. Moderators and admins can issue temporary bans,
                  permanent bans, and warnings for policy violations in Minx City, chat, and the marketplace.
                </p>
              </div>

              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="grid grid-cols-[1fr_120px_120px_80px] gap-4 px-4 py-2.5 border-b border-border bg-muted/10 text-[10px] font-mono tracking-widest uppercase text-zinc-500">
                  <span>USER</span>
                  <span>TYPE</span>
                  <span>EXPIRES</span>
                  <span>STATUS</span>
                </div>
                <div className="px-4 py-12 text-center">
                  <Ban className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                  <p className="text-sm text-zinc-600">No active bans</p>
                  <p className="text-[10px] text-zinc-700 mt-1">Bans issued by moderators will appear here</p>
                </div>
              </div>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
