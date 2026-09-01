import { apiFetch } from '@/lib/api-client';
import { resolveAvatarUrl } from '@/lib/avatar';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, Loader2, Building2, Briefcase, Users, TrendingUp, ArrowLeft, Wrench } from 'lucide-react';
import { useLocation, useParams } from 'wouter';

import { useAuth } from '@/hooks/use-auth';
import { useBoomerMode } from '@/hooks/use-mobile';
import { SignInPage } from '@/components/SignInPrompt';

interface ProfileAffiliation {
  orgId: number;
  orgName: string;
  role: string;
  title: string | null;
  department: string | null;
  salary?: string | null;
  joinedAt: string | null;
}

interface MemberProfileData {
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
    createdAt: string;
  };
  affiliations: ProfileAffiliation[];
}

interface EmployerBadge {
  roleTitle: string;
  orgName: string;
  orgIndustry: string | null;
  payRateFiat: string;
  startedAt: string | null;
}

interface LaborHistoryEntry {
  id: string;
  source: 'task' | 'construction';
  kind: string;
  orgId: string;
  orgName: string;
  payoff: number;
  createdAt: string;
}

interface LaborHistory {
  history: LaborHistoryEntry[];
  totalPayoff: number;
  count: number;
  fullDetail: boolean;
}

const LABOR_KIND_LABEL: Record<string, string> = {
  ad: 'Ad Viewing',
  sponsor: 'Sponsor Click',
  label: 'Data Labelling',
  bug: 'Bug Report',
  feature: 'Feature Idea',
  build: 'World Build Task',
  construction: 'Construction Shift',
  service_listing: 'Service Gig',
};

export default function MemberProfile() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const params = useParams<{ userId: string }>();
  const [boomerMode] = useBoomerMode();
  const [data, setData] = useState<MemberProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [employerBadge, setEmployerBadge] = useState<EmployerBadge | null>(null);
  const [laborHistory, setLaborHistory] = useState<LaborHistory | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !params.userId) { setLoading(false); return; }
    apiFetch(`/api/orgs/members/${params.userId}/profile`)
      .then(r => {
        if (!r.ok) return r.json().then(d => { throw new Error(d.error || 'Failed to load profile'); });
        return r.json();
      })
      .then((d: MemberProfileData) => setData(d))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
    apiFetch(`/api/labor/employer-badge/${params.userId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.contract) setEmployerBadge(d.contract); })
      .catch(() => {});
    apiFetch(`/api/cf/labor-history?userId=${encodeURIComponent(params.userId)}`)
      .then(r => r.ok ? r.json() : null)
      .then((j: LaborHistory | null) => { if (j && j.count > 0) setLaborHistory(j); })
      .catch(() => {});
  }, [isAuthenticated, params.userId]);

  if (!isAuthenticated) {
    return <SignInPage context="Sign in to view member profiles." />;
  }

  const displayName = data?.user
    ? [data.user.firstName, data.user.lastName].filter(Boolean).join(' ') || 'Unknown'
    : '';

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="absolute top-[-5%] left-[-5%] w-[30%] h-[30%] bg-primary/8 blur-[120px] rounded-full pointer-events-none" />
      <main className="flex-1 p-6 max-w-2xl mx-auto w-full relative z-10">

        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate('/profile')}
            className="w-9 h-9 rounded-xl bg-muted/30 border border-border flex items-center justify-center hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-foreground">
              {boomerMode ? 'Member Profile' : 'SALARYMAN DOSSIER'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {boomerMode ? 'View member details' : 'Personnel file access'}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-4 py-20">
            <p className="text-sm text-red-400">{error}</p>
            <button
              onClick={() => navigate('/profile')}
              className="px-4 py-2 rounded-xl bg-muted/30 border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Go back
            </button>
          </div>
        ) : data ? (
          <div className="space-y-5">

            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card border border-border rounded-2xl p-6"
            >
              <div className="flex items-center gap-4">
                {resolveAvatarUrl(data.user.profileImageUrl) ? (
                  <img
                    src={resolveAvatarUrl(data.user.profileImageUrl)}
                    alt={displayName}
                    className="w-16 h-16 rounded-2xl border border-border object-cover"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center text-2xl font-bold text-primary">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-bold text-foreground truncate">{displayName}</p>
                  {data.affiliations.length > 0 && (
                    <p className="text-sm text-primary/80 truncate">
                      {data.affiliations.map(a => a.title).filter(Boolean).join(' / ') || data.affiliations.map(a => a.role === 'owner' ? 'Admin' : a.role === 'manager' ? 'Manager' : 'User').join(' / ')}
                    </p>
                  )}
                  {data.affiliations.length > 0 && (
                    <p className="text-xs text-muted-foreground truncate">
                      {data.affiliations.map(a => a.orgName).join(', ')}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground/50 mt-1">
                    Member since {new Date(data.user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </p>
                </div>
              </div>
            </motion.section>

            {employerBadge && (
              <motion.section
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04 }}
                className="bg-card border border-emerald-500/20 rounded-2xl p-5"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                    <Briefcase className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <p className="text-sm font-bold text-foreground">
                    {boomerMode ? 'Currently Employed' : 'EMPLOYER BADGE'}
                  </p>
                </div>
                <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl px-4 py-3">
                  <p className="text-sm font-semibold text-foreground">{employerBadge.roleTitle}</p>
                  <p className="text-xs text-emerald-300 mt-0.5">
                    {employerBadge.orgName}{employerBadge.orgIndustry ? ` · ${employerBadge.orgIndustry}` : ''}
                  </p>
                  {employerBadge.startedAt && (
                    <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                      since {new Date(employerBadge.startedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </motion.section>
            )}

            {data.affiliations.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="bg-card border border-border rounded-2xl p-6"
              >
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-primary/70" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">
                      {boomerMode ? 'Company Affiliations' : 'CORPORATE AFFILIATIONS'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {data.affiliations.length} shared {data.affiliations.length === 1 ? 'organization' : 'organizations'}
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  {data.affiliations.map((a) => {
                    const roleBadgeColor =
                      a.role === 'owner' ? 'bg-amber-500/15 border-amber-500/25 text-amber-400' :
                      a.role === 'manager' ? 'bg-violet-500/15 border-violet-500/25 text-violet-400' :
                      'bg-sky-500/15 border-sky-500/25 text-sky-400';
                    const roleLabel = a.role === 'owner' ? 'Admin' : a.role === 'manager' ? 'Manager' : 'User';

                    return (
                      <div key={a.orgId} className="bg-muted/20 border border-border rounded-xl p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                              <Building2 className="w-5 h-5 text-primary/70" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-foreground truncate">{a.orgName}</p>
                            </div>
                          </div>
                          <span className={`shrink-0 px-2 py-0.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider ${roleBadgeColor}`}>
                            {roleLabel}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {a.title && (
                            <div className="bg-background/50 rounded-lg px-3 py-2">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <Briefcase className="w-3 h-3 text-muted-foreground/60" />
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Title</span>
                              </div>
                              <p className="text-xs font-semibold text-foreground truncate">{a.title}</p>
                            </div>
                          )}
                          {a.department && (
                            <div className="bg-background/50 rounded-lg px-3 py-2">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <Users className="w-3 h-3 text-muted-foreground/60" />
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Dept</span>
                              </div>
                              <p className="text-xs font-semibold text-foreground truncate">{a.department}</p>
                            </div>
                          )}
                          {a.joinedAt && (
                            <div className="bg-background/50 rounded-lg px-3 py-2">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <TrendingUp className="w-3 h-3 text-muted-foreground/60" />
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Joined</span>
                              </div>
                              <p className="text-xs font-semibold text-foreground">
                                {new Date(a.joinedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.section>
            )}

            {laborHistory && (
              <motion.section
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.07 }}
                className="bg-card border border-orange-500/20 rounded-2xl p-6"
              >
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-8 h-8 rounded-xl bg-orange-500/15 border border-orange-500/25 flex items-center justify-center">
                    <Wrench className="w-4 h-4 text-orange-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">
                      {boomerMode ? 'Labor Record' : 'LABOR RECORD'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {boomerMode ? 'Org-directed work on record' : 'Org-directed shifts on file'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-orange-500/5 border border-orange-500/15 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Wrench className="w-3.5 h-3.5 text-orange-400" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Total Payoff
                      </span>
                    </div>
                    <p className="text-xl font-bold text-orange-400">
                      ƒ{laborHistory.totalPayoff.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">debt erased</p>
                  </div>
                  <div className="bg-muted/20 border border-border rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Briefcase className="w-3.5 h-3.5 text-muted-foreground/60" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Shifts
                      </span>
                    </div>
                    <p className="text-xl font-bold text-foreground">{laborHistory.count}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">total worked</p>
                  </div>
                </div>

                {laborHistory.fullDetail && laborHistory.history.length > 0 && (
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {laborHistory.history.map((entry) => {
                      const kindLabel = LABOR_KIND_LABEL[entry.kind] ?? entry.kind.toUpperCase();
                      const date = new Date(entry.createdAt).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      });
                      return (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between px-3 py-2.5 bg-muted/10 border border-border/60 rounded-xl"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wider">
                                {kindLabel}
                              </span>
                              <span className="text-[10px] text-muted-foreground/50">{date}</span>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              for <span className="text-sky-400 font-semibold">{entry.orgName}</span>
                            </p>
                          </div>
                          <div className="shrink-0 text-right ml-3">
                            <p className="text-sm font-bold text-orange-400">
                              ƒ{entry.payoff.toLocaleString()}
                            </p>
                            <p className="text-[9px] text-muted-foreground/40 uppercase tracking-wider">erased</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {!laborHistory.fullDetail && (
                  <p className="text-xs text-muted-foreground/60 text-center pt-1">
                    {boomerMode
                      ? 'Full shift details are only visible to org owners and managers.'
                      : 'Full shift log visible to org owners and managers only.'}
                  </p>
                )}
              </motion.section>
            )}
          </div>
        ) : null}
      </main>
    </div>
  );
}
