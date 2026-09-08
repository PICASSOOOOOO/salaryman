import { apiFetch } from '@/lib/api-client';
import { resolveAvatarUrl } from '@/lib/avatar';
import { useState, useEffect, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import { User, Brain, Database, Trash2, Download, Save, Loader2, Check, AlertTriangle, Users, LogOut, Smartphone, Share2, Zap, CreditCard, Heart, Building2, DollarSign, Briefcase, TrendingUp, ShieldCheck, Network, Eye, Map, EyeOff, Plug, Gauge, Bug, Globe, Bell, SlidersHorizontal, FlaskConical, ChevronRight, Wrench, Laptop } from 'lucide-react';
import { LanguageSelector } from '@/components/LanguageSelector';
import { CurrencySelector } from '@/components/CurrencySelector';
import { FeedbackModal } from '@/components/FeedbackModal';
import { useLocation, Link, Redirect } from 'wouter';

import { useBoomerMode } from '@/hooks/use-mobile';
import { usePlan } from '@/hooks/use-plan';
import { useOrg } from '@/hooks/use-org';
import { useAlpha } from '@/hooks/use-alpha';
import { SignInPage } from '@/components/SignInPrompt';
import { useTranslation } from 'react-i18next';
import { PROFILE_MODULES } from '@/lib/modules';
import GoogleLinkSection from '@/components/GoogleLinkSection';
import GithubLinkSection from '@/components/GithubLinkSection';
import DiscordLinkSection from '@/components/DiscordLinkSection';
import { ReferralPanel } from '@/components/ReferralPanel';
import { useCommsAlerts, useCommsCityDnd } from '@/lib/commsAlerts';
import { getActiveCityName, hydrateActiveCityFromSave } from '@/lib/city-defs';
import { useAuth } from '@/hooks/use-auth';
import { AppInstallCard } from '@/components/AppInstallCard';

const PlatformAPI = lazy(() => import("@/pages/PlatformAPI"));
const AdminPanel = lazy(() => import("@/pages/AdminPanel"));
const ModeratorPanel = lazy(() => import("@/pages/ModeratorPanel"));

interface DonationRecord {
  id: number;
  amountCents: number;
  tier: string | null;
  status: string;
  createdAt: string;
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

interface AccountData {
  user: { id: string; email?: string; firstName?: string; lastName?: string; profileImageUrl?: string; createdAt: string };
  contactCount: number;
  memory: string;
  memoryUpdatedAt: string | null;
  pabloPrivacyMode: boolean;
}

interface OrgAffiliation {
  membership: {
    orgId: number;
    userId: string;
    role: string;
    department: string | null;
    title: string | null;
    salary: string | null;
    joinedAt: string | null;
  };
  organization: {
    id: number;
    name: string;
    industry: string | null;
    size: string | null;
  } | null;
}

function MobileInstallSection() {
  const { t } = useTranslation();
  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&color=ffffff&bgcolor=09090b&data=${encodeURIComponent(appUrl)}`;
  const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="bg-card border border-border rounded-2xl p-6"
    >
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center">
          <Smartphone className="w-4 h-4 text-violet-400" />
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">{t('profile.getMobileApp')}</p>
          <p className="text-xs text-muted-foreground">{t('profile.installNoAppStore')}</p>
        </div>
      </div>

      {isIOS || isAndroid ? (
        <div className="bg-muted/20 border border-border rounded-xl p-4 space-y-3">
          {isIOS ? (
            <>
              <p className="text-xs font-semibold text-foreground">{t('profile.iosHow')}</p>
              <ol className="space-y-2 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
                  {t('profile.iosStep1')} <Share2 className="w-3 h-3 inline mx-0.5 text-violet-400" />
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
                  {t('profile.iosStep2')}
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
                  {t('profile.iosStep3')}
                </li>
              </ol>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold text-foreground">{t('profile.androidHow')}</p>
              <ol className="space-y-2 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
                  {t('profile.androidStep1')}
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
                  {t('profile.androidStep2')}
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
                  {t('profile.androidStep3')}
                </li>
              </ol>
            </>
          )}
        </div>
      ) : (
        <div className="flex gap-5 items-start">
          <div className="shrink-0">
            <div className="w-[100px] h-[100px] rounded-xl border border-border overflow-hidden bg-[#09090b] flex items-center justify-center">
              <img
                src={qrUrl}
                alt="QR code to open Salaryman on your phone"
                className="w-full h-full object-cover"
              />
            </div>
            <p className="text-[10px] text-muted-foreground/50 text-center mt-1.5">Scan with your phone</p>
          </div>

          <div className="flex-1 space-y-4">
            <div>
              <p className="text-xs font-semibold text-foreground mb-2">On iPhone (Safari):</p>
              <ol className="space-y-1 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="text-violet-400 font-bold">1.</span>
                  Scan the QR code to open the app
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-violet-400 font-bold">2.</span>
                  Tap <Share2 className="w-3 h-3 inline mx-0.5" /> Share → <strong className="text-foreground">Add to Home Screen</strong>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-violet-400 font-bold">3.</span>
                  Tap <strong className="text-foreground">Add</strong> — done!
                </li>
              </ol>
            </div>

            <div>
              <p className="text-xs font-semibold text-foreground mb-2">On Android (Chrome):</p>
              <ol className="space-y-1 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="text-violet-400 font-bold">1.</span>
                  Scan the QR code to open the app
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-violet-400 font-bold">2.</span>
                  Tap <strong className="text-foreground">⋮</strong> menu → <strong className="text-foreground">Install app</strong>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-violet-400 font-bold">3.</span>
                  Confirm — it's on your home screen
                </li>
              </ol>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-border">
        <a
          href={`${appUrl}${import.meta.env.BASE_URL}mobile`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 p-3 rounded-xl border border-sky-500/20 bg-sky-500/5 hover:bg-sky-500/10 transition-colors"
        >
          <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/25 flex items-center justify-center text-sm">
            📱
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold text-sky-400">Mobile Game Terminal</p>
            <p className="text-[10px] text-muted-foreground">Check stats, chat with Pablo, and view your business overview from your phone</p>
          </div>
        </a>
      </div>
    </motion.section>
  );
}

function CompanyAffiliationCard({ affiliation, boomerMode }: { affiliation: OrgAffiliation; boomerMode: boolean }) {
  const org = affiliation.organization;
  const m = affiliation.membership;
  const roleBadgeColor =
    m.role === 'owner' ? 'bg-amber-500/15 border-amber-500/25 text-amber-400' :
    m.role === 'manager' ? 'bg-violet-500/15 border-violet-500/25 text-violet-400' :
    'bg-sky-500/15 border-sky-500/25 text-sky-400';

  const roleLabel = m.role === 'owner' ? 'Admin' : m.role === 'manager' ? 'Manager' : 'User';

  return (
    <div className="bg-muted/20 border border-border rounded-xl p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-primary/70" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{org?.name ?? 'Unknown'}</p>
            {org?.industry && (
              <p className="text-[11px] text-muted-foreground truncate">{org.industry}</p>
            )}
          </div>
        </div>
        <span className={`shrink-0 px-2 py-0.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider ${roleBadgeColor}`}>
          {roleLabel}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {m.title && (
          <div className="bg-background/50 rounded-lg px-3 py-2">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Briefcase className="w-3 h-3 text-muted-foreground/60" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Title</span>
            </div>
            <p className="text-xs font-semibold text-foreground truncate">{m.title}</p>
          </div>
        )}
        {m.department && (
          <div className="bg-background/50 rounded-lg px-3 py-2">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Users className="w-3 h-3 text-muted-foreground/60" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Dept</span>
            </div>
            <p className="text-xs font-semibold text-foreground truncate">{m.department}</p>
          </div>
        )}
        {m.salary && (
          <div className="bg-background/50 rounded-lg px-3 py-2">
            <div className="flex items-center gap-1.5 mb-0.5">
              <DollarSign className="w-3 h-3 text-emerald-400/60" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Salary</span>
            </div>
            <p className="text-xs font-bold text-emerald-400">${Number(m.salary).toLocaleString()}</p>
          </div>
        )}
        {m.joinedAt && (
          <div className="bg-background/50 rounded-lg px-3 py-2">
            <div className="flex items-center gap-1.5 mb-0.5">
              <TrendingUp className="w-3 h-3 text-muted-foreground/60" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Joined</span>
            </div>
            <p className="text-xs font-semibold text-foreground">
              {new Date(m.joinedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            </p>
          </div>
        )}
      </div>

      {m.joinedAt && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Performance Stats</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-background/50 rounded-lg px-2 py-1.5 text-center">
              <p className="text-xs font-bold text-foreground">
                {(() => {
                  const joined = new Date(m.joinedAt);
                  const now = new Date();
                  const months = (now.getFullYear() - joined.getFullYear()) * 12 + (now.getMonth() - joined.getMonth());
                  return months < 1 ? '<1' : months;
                })()}
              </p>
              <p className="text-[9px] text-muted-foreground">months</p>
            </div>
            <div className="bg-background/50 rounded-lg px-2 py-1.5 text-center">
              <p className="text-xs font-bold text-foreground">{roleLabel}</p>
              <p className="text-[9px] text-muted-foreground">rank</p>
            </div>
            <div className="bg-background/50 rounded-lg px-2 py-1.5 text-center">
              <p className="text-xs font-bold text-emerald-400">Active</p>
              <p className="text-[9px] text-muted-foreground">status</p>
            </div>
          </div>
        </div>
      )}
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
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 }}
      className="bg-card border border-border rounded-2xl p-6"
    >
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
          <DollarSign className="w-4 h-4 text-emerald-400" />
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">
            {boomerMode ? 'Financial Summary' : 'EARNINGS DASHBOARD'}
          </p>
          <p className="text-xs text-muted-foreground">
            {boomerMode ? 'Combined salary across all companies' : 'Combined corporate earnings overview'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Salary
            </span>
          </div>
          <p className="text-xl font-bold text-emerald-400">
            {totalSalary > 0 ? `$${totalSalary.toLocaleString()}` : '$0'}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            combined
          </p>
        </div>
        <div className={`border rounded-xl px-4 py-3 ${netWorth >= 0 ? 'bg-sky-500/5 border-sky-500/15' : 'bg-red-500/5 border-red-500/15'}`}>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className={`w-3.5 h-3.5 ${netWorth >= 0 ? 'text-sky-400' : 'text-red-400'}`} />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Net Worth
            </span>
          </div>
          <p className={`text-xl font-bold ${netWorth >= 0 ? 'text-sky-400' : 'text-red-400'}`}>
            {netWorth !== 0 ? `${netWorth < 0 ? '-' : ''}$${Math.abs(netWorth).toLocaleString()}` : '$0'}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            balance
          </p>
        </div>
        <div className="bg-muted/20 border border-border rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-3.5 h-3.5 text-primary/60" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Orgs
            </span>
          </div>
          <p className="text-xl font-bold text-foreground">{affiliations.length}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            active
          </p>
        </div>
      </div>

      {companiesWithSalary.length > 1 && (
        <div className="space-y-2">
          {companiesWithSalary.map((a) => {
            const salaryNum = Number(a.membership.salary);
            const pct = totalSalary > 0 ? Math.round((salaryNum / totalSalary) * 100) : 0;
            return (
              <div key={a.membership.orgId} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-foreground truncate">
                      {a.organization?.name ?? 'Unknown'}
                    </p>
                    <p className="text-xs font-bold text-emerald-400 shrink-0 ml-2">
                      ${salaryNum.toLocaleString()}
                    </p>
                  </div>
                  <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500/60 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground w-8 text-right shrink-0">{pct}%</span>
              </div>
            );
          })}
        </div>
      )}
    </motion.section>
  );
}

type ProfileTab = 'account' | 'apis' | 'admin' | 'platform' | 'moderator';

function getTabFromPath(pathname: string): ProfileTab {
  if (pathname.startsWith('/profile/apis')) return 'apis';
  if (pathname.startsWith('/profile/admin')) return 'admin';
  if (pathname.startsWith('/profile/platform')) return 'platform';
  if (pathname.startsWith('/profile/moderator')) return 'moderator';
  return 'account';
}

const TAB_CONFIG: { id: ProfileTab; path: string; label: string; boomerLabel: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'account', path: '/profile', label: 'ACCOUNT', boomerLabel: 'MY ACCOUNT', icon: User },
  { id: 'apis', path: '/profile/apis', label: 'APIS', boomerLabel: 'CONNECTED APIS', icon: Plug },
  { id: 'admin', path: '/profile/admin', label: 'ADMIN', boomerLabel: 'ADMIN PANEL', icon: ShieldCheck },
  { id: 'platform', path: '/profile/platform', label: 'PLATFORM', boomerLabel: 'PLATFORM API', icon: Network },
  { id: 'moderator', path: '/profile/moderator', label: 'MODERATOR', boomerLabel: 'MODERATOR', icon: Eye },
];

function ApisTab() {
  const [boomerMode] = useBoomerMode();
  return (
    <div className="p-6 max-w-2xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-9 h-9 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
          <Plug className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">{boomerMode ? 'CONNECTED APIS' : 'APIS &amp; INTEGRATIONS'}</h2>
          <p className="text-sm text-muted-foreground">Link external services to your Salaryman account</p>
        </div>
      </div>
      <div className="space-y-4">
        <GoogleLinkSection />
        <GithubLinkSection />
        <DiscordLinkSection />
      </div>
    </div>
  );
}

interface MiniProfile { id: string; playerName: string; avatarColor: string }
function ProfileSwitcherCard({ boomerMode }: { boomerMode: boolean }) {
  const [, navigate] = useLocation();
  const [profiles, setProfiles] = useState<MiniProfile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await apiFetch('/api/profiles');
        const j = await r.json().catch(() => ({}));
        if (!cancelled && r.ok) {
          setProfiles(j.profiles || []);
          setActiveId(j.activeProfileId || null);
        }
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);
  const active = profiles.find(p => p.id === activeId);
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.03 }}
      className="bg-card border border-border rounded-2xl p-6"
      data-testid="profile-switcher-card"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/25 flex items-center justify-center">
          <Users className="w-4 h-4 text-fuchsia-400/80" />
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">
            {boomerMode ? 'CHARACTERS' : 'PROFILES'}
          </p>
          <p className="text-xs text-muted-foreground">
            {boomerMode
              ? 'You can have more than one character on this account.'
              : 'Multiple in-game characters per account — useful for testing.'}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : active ? (
            <>
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-base font-bold text-white shrink-0"
                style={{ backgroundColor: active.avatarColor }}
              >
                {active.playerName.charAt(0) || '?'}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-mono font-bold tracking-wider text-foreground truncate">{active.playerName}</div>
                <div className="text-[11px] text-muted-foreground">
                  {profiles.length} of 12 {profiles.length === 1 ? 'profile' : 'profiles'}
                </div>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">No active profile.</div>
          )}
        </div>
        <button
          type="button"
          onClick={() => navigate('/profiles')}
          className="px-3 py-2 rounded-lg bg-fuchsia-500/15 border border-fuchsia-500/40 text-fuchsia-300 text-xs font-mono tracking-wider hover-elevate active-elevate-2"
          data-testid="btn-open-profile-picker"
        >
          {boomerMode ? 'SWITCH / ADD' : 'MANAGE PROFILES'}
        </button>
      </div>
    </motion.section>
  );
}

function CommsAlertsCard({ boomerMode }: { boomerMode: boolean }) {
  const [alertsOn, setAlertsOn] = useCommsAlerts();
  const [cityDndOn, setCityDndOn] = useCommsCityDnd();
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 }}
      className="bg-card border border-border rounded-2xl p-6"
      data-testid="comms-alerts-card"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center">
          <Bell className="w-4 h-4 text-cyan-400/80" />
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">
            {boomerMode ? 'NOTIFICATIONS' : 'PAYPHONE ALERTS'}
          </p>
          <p className="text-xs text-muted-foreground">
            {boomerMode
              ? 'Show a little pop-up when you get a new message.'
              : 'Pop-up toasts for new DMs, company messages, and associate requests.'}
          </p>
        </div>
      </div>
      <label className="flex items-center justify-between gap-4 p-3 rounded-xl border border-border bg-secondary/40 cursor-pointer hover-elevate active-elevate-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">
            {boomerMode ? 'POP-UP ALERTS' : 'PAYPHONE POP-UPS'}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            When off, your unread badge counts still update — only the pop-up toasts are hidden.
          </div>
        </div>
        <input
          type="checkbox"
          className="w-10 h-6 appearance-none rounded-full bg-zinc-700 checked:bg-cyan-500 transition-colors relative cursor-pointer
                     before:content-[''] before:absolute before:top-0.5 before:left-0.5 before:w-5 before:h-5 before:rounded-full before:bg-white before:transition-transform
                     checked:before:translate-x-4"
          checked={alertsOn}
          onChange={(e) => setAlertsOn(e.target.checked)}
          data-testid="toggle-comms-alerts"
        />
      </label>
      <label
        className={`flex items-center justify-between gap-4 p-3 mt-3 rounded-xl border border-border bg-secondary/40 cursor-pointer hover-elevate active-elevate-2 ${alertsOn ? '' : 'opacity-50 pointer-events-none'}`}
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">
            {boomerMode ? 'QUIET DURING GAMES' : 'DO NOT DISTURB WHILE PLAYING'}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {boomerMode
              ? 'Hide the pop-ups while you are in the city, but keep them everywhere else.'
              : 'Silence pop-ups while in the city / full-screen views — alerts still fire elsewhere and badge counts always update.'}
          </div>
        </div>
        <input
          type="checkbox"
          className="w-10 h-6 appearance-none rounded-full bg-zinc-700 checked:bg-cyan-500 transition-colors relative cursor-pointer
                     before:content-[''] before:absolute before:top-0.5 before:left-0.5 before:w-5 before:h-5 before:rounded-full before:bg-white before:transition-transform
                     checked:before:translate-x-4"
          checked={cityDndOn}
          disabled={!alertsOn}
          onChange={(e) => setCityDndOn(e.target.checked)}
          data-testid="toggle-comms-city-dnd"
        />
      </label>
    </motion.section>
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
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.09 }}
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
            {boomerMode ? 'Org-directed work you served' : 'Org-directed shifts on record'}
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
            ƒ{data.totalPayoff.toLocaleString()}
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
          <p className="text-xl font-bold text-foreground">{data.count}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">total worked</p>
        </div>
      </div>

      <div className="space-y-2 max-h-56 overflow-y-auto">
        {data.history.map((entry) => {
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
    </motion.section>
  );
}

// ── City Visa & Citizenship Section ──────────────────────────────────────────
// Shows which cities the player holds a visa / citizenship for, and lets them
// apply for citizenship once the eligibility criteria are met.
interface VisaRow {
  id: number;
  cityId: string;
  status: string;
  grantedAt: string;
  updatedAt: string;
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

  const CITY_LABELS: Record<string, string> = {
    minx_city: 'MINX CITY',
    huda_city: 'HUDA CITY',
  };
  const STATUS_STYLE: Record<string, string> = {
    visa: 'text-sky-400 border-sky-500/30 bg-sky-500/10',
    applicant: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
    citizen: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}
      className="bg-card border border-border rounded-2xl p-6"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-xl bg-sky-500/15 border border-sky-500/25 flex items-center justify-center">
          <Globe className="w-4 h-4 text-sky-400" />
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">CITY VISAS</p>
          <p className="text-[11px] text-muted-foreground">Your city authorizations &amp; residency status.</p>
        </div>
      </div>
      <div className="space-y-2">
        {visas.map(v => {
          const cityLabel = CITY_LABELS[v.cityId] ?? v.cityId.toUpperCase();
          const statusClass = STATUS_STYLE[v.status] ?? 'text-muted-foreground border-border bg-muted/10';
          const canApplyCitizenship = v.status === 'visa';
          const days = Math.floor((Date.now() - new Date(v.grantedAt).getTime()) / (1000 * 60 * 60 * 24));
          return (
            <div key={v.cityId} className="flex items-center justify-between px-4 py-3 bg-muted/10 border border-border/60 rounded-xl gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-foreground truncate">{cityLabel}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {days === 0 ? 'Active today' : `Active ${days}d`}
                  {v.status === 'citizen' && ' · Full citizen'}
                  {v.status === 'applicant' && ' · Citizenship pending review'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg border ${statusClass}`}>
                  {v.status}
                </span>
                {canApplyCitizenship && (
                  <button
                    onClick={() => void applyCitizenship(v.cityId)}
                    disabled={applying === v.cityId}
                    className="text-[10px] px-2 py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-400 disabled:opacity-50 transition-colors"
                  >
                    {applying === v.cityId ? '…' : 'Apply Citizenship'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {msg && (
        <p className="text-xs mt-3 text-muted-foreground leading-relaxed">{msg}</p>
      )}
    </motion.section>
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
  const [showFeedback, setShowFeedback] = useState(false);

  const [affiliations, setAffiliations] = useState<OrgAffiliation[]>([]);
  const [affiliationsLoading, setAffiliationsLoading] = useState(true);
  const [activeEmployer, setActiveEmployer] = useState<{ roleTitle: string; orgName: string; orgIndustry: string | null; payRateFiat: string; startedAt: string | null } | null>(null);

  const [memoryDraft, setMemoryDraft] = useState('');
  const [savingMemory, setSavingMemory] = useState(false);
  const [memorySaved, setMemorySaved] = useState(false);

  // Player display name (world_businesses.player_name) — editable post-onboarding
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState<string | null>(null);
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

  const primaryTitle = affiliations.length > 0
    ? affiliations.map(a => a.membership.title).filter(Boolean).join(' / ') || null
    : null;

  const primaryCompanies = affiliations.length > 0
    ? affiliations.map(a => a.organization?.name).filter(Boolean).join(', ')
    : null;

  return (
    <>
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" />
          </div>
        ) : view === 'profile' ? (
            <div className="space-y-5">

              <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}
              className="bg-card border border-border rounded-2xl p-6">
              <div className="flex items-center gap-4">
                {resolveAvatarUrl(user?.profileImageUrl) ? (
                  <img src={resolveAvatarUrl(user?.profileImageUrl)} alt={displayName}
                    className="w-16 h-16 rounded-2xl border border-border object-cover" />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center text-2xl font-bold text-primary">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-bold text-foreground truncate">{displayName}</p>
                  {user?.email && <p className="text-sm text-muted-foreground truncate">{user.email}</p>}
                  {data?.user.createdAt && (
                    <p className="text-xs text-muted-foreground/50 mt-1">
                      Member since {new Date(data.user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </p>
                  )}
                </div>
                <button onClick={logout}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-red-400 hover:bg-red-500/10 border border-border hover:border-red-500/20 transition-colors">
                  <LogOut className="w-3.5 h-3.5" /> {t('profile.signOut')}
                </button>
              </div>

              {/* Editable display name (player_name on the world registry).
                  Pablo and the in-game NPCs address you by THIS name, not by
                  your auth profile name. Changing it here re-labels every
                  ledger / chat / phone surface that uses player_name. */}
              <div className="mt-5 pt-5 border-t border-border">
                <label className="block text-xs font-bold text-muted-foreground tracking-wider mb-1.5">
                  {boomerMode ? 'DISPLAY NAME' : 'CALL SIGN'}
                </label>
                <p className="text-[11px] text-muted-foreground/70 mb-2 leading-snug">
                  How Pablo and everyone in {getActiveCityName()} addresses you. Stored uppercase, max 32 chars.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={nameDraft}
                    onChange={e => setNameDraft(e.target.value)}
                    placeholder={displayName}
                    maxLength={64}
                    className="flex-1 min-w-0 bg-background border border-border focus:border-primary/60 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none transition-colors"
                    data-testid="profile-name-input"
                  />
                  <button
                    onClick={saveName}
                    disabled={!nameDraft.trim() || savingName}
                    data-testid="profile-name-save"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary/15 hover:bg-primary/25 border border-primary/30 text-sm text-primary disabled:opacity-40 transition-colors"
                  >
                    {savingName ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Save
                  </button>
                </div>
                {nameMsg && (
                  <div className="mt-2 text-xs text-muted-foreground">{nameMsg}</div>
                )}
              </div>
            </motion.section>

              <ProfileSwitcherCard boomerMode={boomerMode} />

            <ReferralPanel boomerMode={boomerMode} />

            <AppInstallCard />

          </div>
          ) : (
            <div className="space-y-10">

              <div className="space-y-5">
                <SectionHeader icon={Building2} title={boomerMode ? 'My Organization' : 'ORG'} subtitle="Employment, finances, and members" />

              {/* ORG HUB — link to org management; graceful when user has no org. */}
              <motion.section
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="bg-card border border-border rounded-2xl p-2"
              >
                <Link href="/org"
                  className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/[0.04] transition-colors group">
                  <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
                    <Network className="w-4 h-4 text-primary/70" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground">{boomerMode ? 'My Organization' : 'ORG HUB'}</p>
                    <p className="text-[11px] text-muted-foreground">Manage your organization &amp; members.</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
                </Link>
              </motion.section>

              {activeEmployer && (
              <motion.section
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04 }}
                className="bg-card border border-emerald-500/20 rounded-2xl p-6"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                    <Briefcase className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">
                      {boomerMode ? 'Current Employment' : 'ACTIVE EMPLOYER BADGE'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {boomerMode ? 'Your current job contract' : 'Labor contract on file'}
                    </p>
                  </div>
                  <Link href="/business/jobs?tab=my-contracts" className="ml-auto text-[10px] font-mono uppercase tracking-widest text-emerald-400 hover:underline">
                    Manage →
                  </Link>
                </div>
                <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl px-4 py-3">
                  <p className="text-sm font-bold text-foreground">{activeEmployer.roleTitle}</p>
                  <p className="text-xs text-emerald-300 mt-0.5">{activeEmployer.orgName}{activeEmployer.orgIndustry ? ` · ${activeEmployer.orgIndustry}` : ''}</p>
                  <p className="text-xs text-muted-foreground mt-1 font-mono">
                    ƒ{Number(activeEmployer.payRateFiat).toLocaleString()}/hr
                    {activeEmployer.startedAt && <span className="ml-2">· since {new Date(activeEmployer.startedAt).toLocaleDateString()}</span>}
                  </p>
                </div>
              </motion.section>
            )}

            {!affiliationsLoading && affiliations.length > 0 && (
              <FinancialDashboard affiliations={affiliations} boomerMode={boomerMode} />
            )}

            {!affiliationsLoading && affiliations.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.06 }}
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
                      {affiliations.length} active {affiliations.length === 1 ? 'membership' : 'memberships'}
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  {affiliations.map((a) => (
                    <CompanyAffiliationCard
                      key={a.membership.orgId}
                      affiliation={a}
                      boomerMode={boomerMode}
                    />
                  ))}
                </div>
              </motion.section>
            )}

            <LaborRecordSection boomerMode={boomerMode} />

            {!affiliationsLoading && affiliations.length === 0 && (
                <div className="bg-card border border-border rounded-2xl p-6 text-center">
                  <Building2 className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-foreground">{boomerMode ? "You're not in a company yet" : 'NO AFFILIATIONS'}</p>
                  <p className="text-xs text-muted-foreground mt-1">Join or found an organization to see employment, finances, and labor records here.</p>
                </div>
              )}

              </div>

              <div className="space-y-5">
                <SectionHeader icon={Map} title={getActiveCityName()} subtitle="Your city services and access" />

              {/* CITY VISAS & CITIZENSHIP — shows which cities the player is
                authorized to enter, and whether they're a citizen yet. */}
            <VisaCitizenshipSection />

            {/* CITY LINKS — quick access to city services. */}
              <motion.section
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
                className="bg-card border border-border rounded-2xl p-2"
              >
                {([
                  { href: '/desktop', icon: Laptop, label: boomerMode ? 'Desktop Office' : 'DESKTOP OFFICE', desc: 'Open the finance and office client.' },
                ] as { href: string; icon: React.ComponentType<{className?: string}>; label: string; desc: string }[]).map(({ href, icon: Icon, label, desc }) => (
                  <Link key={href} href={href}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/[0.04] transition-colors group">
                    <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-primary/70" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground">{label}</p>
                      <p className="text-[11px] text-muted-foreground">{desc}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
                  </Link>
                ))}
              </motion.section>

              <CommsAlertsCard boomerMode={boomerMode} />


            </div>

              <div className="space-y-5">
                <SectionHeader icon={SlidersHorizontal} title={boomerMode ? 'General' : 'GENERAL'} subtitle="Connections, account, and preferences" />

              {/* MOBILE-ONLY SETTINGS CARD — these toggles used to live in
                the mobile NavBar but were stranding the top bar. Surfaced
                here so language, boomer mode, and bug reporting stay
                reachable on phones. Hidden on desktop, where the top
                strip already exposes them. */}
            <motion.section
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="bg-card border border-border rounded-2xl p-5 space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center">
                  <Smartphone className="w-4 h-4 text-primary/70" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">
                    {boomerMode ? 'Preferences' : 'PREFERENCES'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Language, currency, labels, and feedback.
                  </p>
                </div>
              </div>

              {/* Language */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs text-foreground tracking-wide">Language</span>
                </div>
                <LanguageSelector />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <DollarSign className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs text-foreground tracking-wide">Currency</span>
                </div>
                <CurrencySelector />
              </div>

              {/* Bug report */}
              <button
                onClick={() => setShowFeedback(true)}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-border hover:border-sky-500/30 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0 text-left">
                  <Bug className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs text-foreground tracking-wide">
                      {boomerMode ? 'Report a bug' : 'REPORT BUG'}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      Something broken? Tell us.
                    </div>
                  </div>
                </div>
                <span className="text-muted-foreground text-xs">›</span>
              </button>
            </motion.section>
            {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}

            {/* TESTER PROGRAM link — alpha access. */}
              <motion.section
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="bg-card border border-border rounded-2xl p-2"
              >
                <Link href="/alpha"
                  className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/[0.04] transition-colors group">
                  <div className="w-8 h-8 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/25 flex items-center justify-center shrink-0">
                    <FlaskConical className="w-4 h-4 text-fuchsia-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground">{boomerMode ? 'Become a Tester' : 'TESTER PROGRAM'}</p>
                    <p className="text-[11px] text-muted-foreground">Apply for alpha access &amp; early builds.</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
                </Link>
              </motion.section>

              <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }}
              className="bg-card border border-border rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isPro ? 'bg-amber-500/15 border border-amber-500/25' : 'bg-muted/30 border border-border'}`}>
                  {isPro ? <Zap className="w-4 h-4 text-amber-400" /> : <CreditCard className="w-4 h-4 text-muted-foreground" />}
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">
                    {boomerMode ? t('profile.membershipStatus') : t('profile.corporateClearanceLevel')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {boomerMode ? t('profile.currentPlanDetails') : t('profile.employeeClassification')}
                  </p>
                </div>
              </div>

              {isOwner ? (
                <div className="flex items-center justify-between bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <div>
                      <p className="text-sm font-bold text-amber-300">
                        {boomerMode ? t('profile.corporateAdmin') : t('profile.corpAdminAllUnlocked')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {boomerMode ? t('profile.ownerAllFeaturesUnlocked') : t('profile.ownerImplantActive')}
                      </p>
                    </div>
                  </div>
                </div>
              ) : features.size > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-400" />
                      <div>
                        <p className="text-sm font-bold text-amber-300">
                          {boomerMode ? `${features.size} Active Subscription${features.size !== 1 ? 's' : ''}` : `${features.size} MODULE${features.size !== 1 ? 'S' : ''} ACTIVE`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {[...features].join(', ').replace(/_/g, ' ')}
                        </p>
                      </div>
                    </div>
                    <a
                      href="https://billing.stripe.com/p/login"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-mono text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors shrink-0"
                    >
                      Manage
                    </a>
                  </div>
                  <button
                    onClick={() => navigate('/pricing')}
                    className="w-full flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-muted/15 border border-border text-muted-foreground text-xs font-mono hover:bg-muted/25 transition-colors"
                  >
                    {boomerMode ? t('profile.addMoreTools') : t('profile.browseModules')}
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between bg-muted/15 border border-border rounded-xl px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {boomerMode ? t('profile.standardPlan') : t('profile.standardEmployeeNoModules')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {boomerMode ? t('profile.coreFeaturesFree') : t('profile.standardModulesAvailable')}
                    </p>
                  </div>
                  <button
                    onClick={() => navigate('/pricing')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/25 text-amber-400 text-xs font-bold hover:bg-amber-500/25 transition-colors shrink-0 ml-3"
                  >
                    <Zap className="w-3 h-3" />
                    {boomerMode ? 'Browse' : 'Modules'}
                  </button>
                </div>
              )}
            </motion.section>


                <ApisTab />

                <Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" /></div>}>
                  <PlatformAPI />
                </Suspense>

              <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
              className="bg-card border border-border rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-xl bg-sky-500/15 border border-sky-500/25 flex items-center justify-center">
                  <Brain className="w-4 h-4 text-sky-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">{boomerMode ? t('profile.myNotesAiMemory') : t('profile.pabloMemory')}</p>
                  <p className="text-xs text-muted-foreground">{t('profile.whatPabloKnows')}</p>
                </div>
              </div>

              <div className={`mb-3 rounded-xl border p-4 ${privacyMode ? 'bg-violet-500/5 border-violet-500/25' : 'bg-muted/20 border-border'}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${privacyMode ? 'bg-violet-500/20 border border-violet-500/30' : 'bg-muted/30 border border-border'}`}>
                    {privacyMode ? <EyeOff className="w-4 h-4 text-violet-400" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-sm font-bold text-foreground">
                        PRIVACY MODE {privacyMode && <span className="text-[10px] font-bold text-violet-400 ml-1">ON</span>}
                      </p>
                      <button
                        onClick={togglePrivacyMode}
                        disabled={privacyToggling}
                        role="switch"
                        aria-checked={privacyMode}
                        className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${privacyMode ? 'bg-violet-500' : 'bg-muted'}`}
                      >
                        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${privacyMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </button>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {privacyMode
                        ? 'Pablo will not save your conversations or remember anything between sessions. Memory below is disabled while privacy mode is on. Conversation context is only kept in your browser tab.'
                        : 'When enabled, Pablo will not store conversations or use the memory below. Nothing is written to the database. Turning it on will permanently delete existing Pablo conversation history.'}
                    </p>
                  </div>
                </div>
              </div>

              <textarea
                value={memoryDraft}
                onChange={e => setMemoryDraft(e.target.value)}
                placeholder={t('profile.memoryPlaceholder')}
                rows={6}
                disabled={privacyMode}
                className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-sky-500/40 transition-colors resize-none mb-3 disabled:opacity-40 disabled:cursor-not-allowed"
              />

              <div className="flex items-center justify-between">
                {data?.memoryUpdatedAt && (
                  <p className="text-[11px] text-muted-foreground/40">
                    Last updated {new Date(data.memoryUpdatedAt).toLocaleDateString()}
                  </p>
                )}
                <div className="flex items-center gap-2 ml-auto">
                  <button onClick={() => setDeleteTarget('memory')}
                    className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors">
                    {t('profile.clear')}
                  </button>
                  <button onClick={saveMemory} disabled={savingMemory || memoryDraft === data?.memory}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-sky-500/15 border border-sky-500/25 text-sky-300 text-xs font-semibold hover:bg-sky-500/25 transition-colors disabled:opacity-40">
                    {savingMemory ? <Loader2 className="w-3 h-3 animate-spin" /> : memorySaved ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
                    {memorySaved ? t('profile.saved') : t('profile.save')}
                  </button>
                </div>
              </div>
            </motion.section>

            {donationHistory.filter(d => d.status === 'completed').length > 0 && (
              <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                className="bg-card border border-border rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-8 h-8 rounded-xl bg-yellow-500/15 border border-yellow-500/25 flex items-center justify-center">
                    <Heart className="w-4 h-4 text-yellow-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">Pablo's Slush Fund</p>
                    <p className="text-xs text-muted-foreground">Your contributions to the cause</p>
                  </div>
                  {donorTitle && (
                    <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                      <span className="text-[10px] font-bold text-yellow-400 uppercase tracking-wider">{donorTitle}</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 mb-4">
                  <div className="flex-1 bg-muted/20 border border-border rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Heart className="w-3.5 h-3.5 text-yellow-400" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Given</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">${(donationTotalCents / 100).toFixed(2)}</p>
                  </div>
                  <div className="flex-1 bg-muted/20 border border-border rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="w-3.5 h-3.5 text-yellow-400" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Donations</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{donationHistory.filter(d => d.status === 'completed').length}</p>
                  </div>
                </div>

                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {donationHistory.filter(d => d.status === 'completed').map(d => (
                    <div key={d.id} className="flex items-center justify-between px-3 py-2 bg-muted/10 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {new Date(d.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        {d.tier && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 font-semibold uppercase">{d.tier}</span>
                        )}
                      </div>
                      <span className="text-xs font-bold text-foreground">${(d.amountCents / 100).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </motion.section>
            )}

            <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="bg-card border border-border rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center">
                  <Database className="w-4 h-4 text-primary/70" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">{t('profile.myData')}</p>
                  <p className="text-xs text-muted-foreground">{t('profile.exportOrDeleteInfo')}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="flex-1 bg-muted/20 border border-border rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="w-3.5 h-3.5 text-violet-400" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contacts</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{data?.contactCount ?? 0}</p>
                  </div>
                  <div className="flex-1 bg-muted/20 border border-border rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Brain className="w-3.5 h-3.5 text-sky-400" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Memory</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{data?.memory ? data.memory.split('\n').filter(Boolean).length : 0}
                      <span className="text-sm font-normal text-muted-foreground ml-1">lines</span>
                    </p>
                  </div>
                </div>

                <button onClick={exportData}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/20 border border-border hover:border-primary/30 hover:bg-primary/5 transition-colors text-left">
                  <Download className="w-4 h-4 text-primary/60" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t('profile.exportMyData')}</p>
                    <p className="text-xs text-muted-foreground">{t('profile.downloadAsJson')}</p>
                  </div>
                </button>

                <button onClick={() => setDeleteTarget('contacts')}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/20 border border-border hover:border-red-500/20 hover:bg-red-500/5 transition-colors text-left">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t('profile.deleteAllContacts')}</p>
                    <p className="text-xs text-muted-foreground">{t('profile.permanentlyRemoveContacts')}</p>
                  </div>
                </button>

                <button onClick={() => setDeleteTarget('all')}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/5 border border-red-500/15 hover:border-red-500/30 hover:bg-red-500/10 transition-colors text-left">
                  <Trash2 className="w-4 h-4 text-red-400/70" />
                  <div>
                    <p className="text-sm font-semibold text-red-400">{t('profile.deleteAllMyData')}</p>
                    <p className="text-xs text-muted-foreground">{t('profile.contactsPlusMemoryCannotUndo')}</p>
                  </div>
                </button>
              </div>
            </motion.section>
            </div>
          </div>
        )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm bg-card border border-border rounded-2xl p-6 shadow-2xl"
          >
            {deleted ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="w-12 h-12 rounded-xl bg-sky-500/15 border border-sky-500/25 flex items-center justify-center">
                  <Check className="w-6 h-6 text-sky-400" />
                </div>
                <p className="text-sm font-semibold text-foreground">{t('profile.dataDeleted')}</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/25 flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-red-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">{t('profile.areYouSure')}</p>
                    <p className="text-xs text-muted-foreground">
                      {deleteTarget === 'memory' && t('profile.clearMemoryConfirm')}
                      {deleteTarget === 'contacts' && t('profile.deleteContactsConfirm')}
                      {deleteTarget === 'all' && t('profile.deleteAllConfirm')}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setDeleteTarget(null)} disabled={deleting}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                    {t('profile.cancel')}
                  </button>
                  <button onClick={() => deleteData(deleteTarget)} disabled={deleting}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-red-500/15 border border-red-500/25 text-red-400 text-sm font-semibold hover:bg-red-500/25 transition-colors disabled:opacity-50">
                    {deleting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t('profile.delete')}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </>
  );
}

// Anchor id per tab so deep links like /profile/apis still land on the
// right section after we collapsed the sticky bar into a single page.
const TAB_ANCHOR: Record<ProfileTab, string> = {
  'account':   'profile-account',
  'apis':      'profile-apis',
  'admin':     'profile-admin',
  'platform':  'profile-platform',
  'moderator': 'profile-moderator',
};

/** Section header used between stacked panels on the consolidated page. */
function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="w-9 h-9 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div className="min-w-0">
        <h2 className="text-xl font-bold text-foreground">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

const PAGE_LOADER = <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" /></div>;

/** /profile — personal identity only. */
export default function Profile() {
  const { isAuthenticated } = useAuth();
  const [boomerMode] = useBoomerMode();

  if (!isAuthenticated) {
    return <SignInPage context="Sign in to manage your account." />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="absolute top-[-5%] left-[-5%] w-[30%] h-[30%] bg-primary/8 blur-[120px] rounded-full pointer-events-none" />
      <main className="flex-1 relative z-10 max-w-2xl mx-auto w-full px-6 py-8 space-y-8">
        <Suspense fallback={PAGE_LOADER}>
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

/** /settings — organization, building, and general preferences. */
export function SettingsPage() {
  const { isAuthenticated } = useAuth();
  const [boomerMode] = useBoomerMode();

  if (!isAuthenticated) {
    return <SignInPage context="Sign in to manage your settings." />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="absolute top-[-5%] left-[-5%] w-[30%] h-[30%] bg-primary/8 blur-[120px] rounded-full pointer-events-none" />
      <main className="flex-1 relative z-10 max-w-2xl mx-auto w-full px-6 py-8 space-y-8">
        <Suspense fallback={PAGE_LOADER}>
          <SectionHeader
            icon={SlidersHorizontal}
            title={boomerMode ? 'SETTINGS' : 'SETTINGS'}
            subtitle="Organization, building, and general preferences"
          />
          <nav aria-label="Settings sections" className="flex gap-2 overflow-x-auto pb-1">
            <a href="#account-settings" className="shrink-0 rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground hover:bg-white/[0.05]">ACCOUNT &amp; BUILDING</a>
          </nav>
          <section id="account-settings" className="scroll-mt-24">
            <AccountTab view="settings" />
          </section>
        </Suspense>
      </main>
    </div>
  );
}

/** /profile/admin — platform administration. Moderator tools have their own
 * route and must never be presented as a tab inside the account profile. */
export function AdminHub() {
  const { isAuthenticated } = useAuth();
  const [boomerMode] = useBoomerMode();
  const { isOwner } = usePlan();

  if (!isAuthenticated) {
    return <SignInPage context="Sign in to access the admin hub." />;
  }

  if (!isOwner) return <Redirect to="/profile" />;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="absolute top-[-5%] left-[-5%] w-[30%] h-[30%] bg-primary/8 blur-[120px] rounded-full pointer-events-none" />
      <main className="flex-1 relative z-10 max-w-2xl mx-auto w-full px-6 py-8 space-y-12">
        <Suspense fallback={PAGE_LOADER}>
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
