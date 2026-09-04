import { useLocation } from 'wouter';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { User, ChevronDown, ArrowLeft, WalletCards, X, Languages, Coins } from 'lucide-react';
import { MODULES, getModuleForPath } from '../lib/modules';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/use-auth';
import { usePlan } from '../hooks/use-plan';
import { useOrg } from '../hooks/use-org';
import { useAlpha } from '../hooks/use-alpha';
import { useCommsSummary } from '../hooks/use-comms-summary';
import { useFeatureLabel } from '../hooks/use-feature-label';
import { resolveAvatarUrl } from '@/lib/avatar';
import { NotificationBell } from './NotificationBell';
import { apiFetch } from '@/lib/api-client';
import { LanguageSelector } from './LanguageSelector';
import { CurrencySelector } from './CurrencySelector';
import {
  MORE_NAV_ITEMS,
  PRIMARY_NAV_ITEMS,
  isAppNavItemActive,
  canGoBackInApp,
  getAppBackPath,
  consumeAppReturnPath,
  rememberAppReturnPath,
  shouldShowModuleSubnav,
} from '@/lib/app-navigation';

export function MobileSubNav() {
  const [location, navigate] = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  const { label: featureLabel } = useFeatureLabel();

  const pathname = location.split('?')[0];
  const currentModule = getModuleForPath(pathname);

  if (!currentModule || !shouldShowModuleSubnav(currentModule.id, currentModule.subs.length)) return null;

  return (
    <div className="mobile-app-nav bg-[#0a0a0b]/95 backdrop-blur-md border-b border-white/[0.04] overflow-hidden relative" style={{ zIndex: 40 }}>
      <div
        ref={scrollRef}
        className="mobile-scroll-region flex items-center gap-1 px-2 py-1 overflow-x-auto scrollbar-hide"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {currentModule.subs.map(sub => {
          const isActive = pathname === sub.path || pathname.startsWith(sub.path + '/');
          const Icon = sub.icon;
          const label = sub.id === 'classroom'
            ? featureLabel.toUpperCase()
            : t(`labels.${sub.id}`, sub.boomerLabel);
          return (
            <button
              key={sub.id}
              onClick={() => navigate(sub.path)}
              className={`mobile-tap-target flex items-center gap-1 px-3 py-2 rounded-full text-[10px] font-mono tracking-wider uppercase transition-colors shrink-0 touch-manipulation ${
                isActive
                  ? 'bg-sky-500/15 text-sky-400'
                  : 'text-zinc-500 active:text-zinc-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function MobileModuleNav() {
  const [location, navigate] = useLocation();
  const { isAuthenticated, user } = useAuth();
  const { isOwner: planIsOwner, features: planFeatures, loading: planLoading } = usePlan();
  const { org: userOrg } = useOrg();
  const { isApprovedDev, isApprovedTester } = useAlpha();
  const { total: commsCount } = useCommsSummary();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summary, setSummary] = useState<MobileAccountSummary | null>(null);
  const [currentLocation, setCurrentLocation] = useState('CITY / BUILDING NOT REPORTED');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownPanelRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const { t } = useTranslation();

  useEffect(() => {
    if (!summaryOpen || !isAuthenticated) return;
    let alive = true;
    setSummaryLoading(true);
    Promise.allSettled([
      apiFetch('/api/wallet/snapshot', { credentials: 'include' }),
      apiFetch('/api/orgs/me', { credentials: 'include' }),
      apiFetch('/api/enterprise/summary', { credentials: 'include' }),
    ]).then(async ([walletResult, orgResult, enterpriseResult]) => {
      const read = async (result: PromiseSettledResult<Response>): Promise<unknown> =>
        result.status === 'fulfilled' && result.value.ok ? result.value.json().catch(() => null) : null;
      const [wallet, org, enterprise] = await Promise.all([
        read(walletResult), read(orgResult), read(enterpriseResult),
      ]);
      if (alive) setSummary({
        wallet: wallet as MobileAccountSummary['wallet'],
        org: org as MobileAccountSummary['org'],
        enterprise: enterprise as MobileAccountSummary['enterprise'],
      });
    }).finally(() => { if (alive) setSummaryLoading(false); });
    try {
      const save = JSON.parse(localStorage.getItem('sm_save') || '{}') as { cityId?: string; buildingId?: string };
      const city = save.cityId ? save.cityId.replace(/_/g, ' ').toUpperCase() : 'CITY';
      const building = save.buildingId ? ` · ${save.buildingId.replace(/_/g, ' ').toUpperCase()}` : '';
      setCurrentLocation(`${city}${building}`);
    } catch {
      setCurrentLocation('CITY / BUILDING NOT REPORTED');
    }
    return () => { alive = false; };
  }, [summaryOpen, isAuthenticated]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (dropdownRef.current?.contains(t)) return;
      if (dropdownPanelRef.current?.contains(t)) return;
      setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  // Portal the dropdown to <body> so it overlays everything, escaping the mobile
  // nav's sticky/z-index stacking context. Anchor it under the MORE trigger.
  useEffect(() => {
    if (!dropdownOpen) return;
    const place = () => {
      const r = dropdownRef.current?.getBoundingClientRect();
      if (r) setDropdownPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [dropdownOpen]);

  const pathname = location.split('?')[0];
  const isHome = pathname === "/";
  const previousLocationRef = useRef(location);

  useEffect(() => {
    if (location === previousLocationRef.current) return;
    const previous = previousLocationRef.current;
    if (location.split('?')[0].startsWith('/phone')) rememberAppReturnPath(previous);
    previousLocationRef.current = location;
  }, [location]);

  // ADMIN hub is visible only to platform owners and approved staff (devs / testers).
  // Regular org members do NOT see this — AdminPanel is gated at the route level too.
  const canAdmin = planIsOwner || isApprovedDev || isApprovedTester;
  const dropdownItems = MORE_NAV_ITEMS.filter(item => !item.staffOnly || canAdmin);
  const goBack = () => {
    if (canGoBackInApp()) window.history.back();
    else navigate(consumeAppReturnPath() ?? getAppBackPath(isAuthenticated), { replace: true });
  };

  const hasActiveDropdownItem = dropdownItems.some(item => isAppNavItemActive(item, pathname));

  // Phone is a paid feature (PABLO bundle), but we now show the tab to
  // EVERYONE so prospects can discover it. PhoneGate enforces actual
  // access at the route level and renders the paywall/upgrade screen
  // for users without phone_system.
  void planLoading; void planIsOwner; void planFeatures;
  const visibleTabs = PRIMARY_NAV_ITEMS
    .filter(tab => !tab.authOnly || isAuthenticated);

  return (
    <div className="mobile-app-nav bg-[#0a0a0b]/98 backdrop-blur-md border-b border-white/[0.08] relative" style={{ zIndex: 60 }}>
      <div className="flex min-h-14 items-center px-[max(.25rem,var(--app-safe-left))] pr-[max(.25rem,var(--app-safe-right))]">
        <button
          onClick={goBack}
          aria-label="Back"
          title="Back"
          className="mobile-tap-target flex items-center justify-center shrink-0 rounded-md text-zinc-500 active:text-zinc-100 active:bg-white/5 touch-manipulation"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        {visibleTabs.map(tab => {
          const active = isAppNavItemActive(tab, pathname);
          const Icon = tab.icon;
          const isOffice = tab.id === 'office';
          const activeColor = isOffice ? 'text-emerald-400' : 'text-sky-400';
          if (isOffice) {
            return (
              <button
                key={tab.id}
                onClick={() => navigate(consumeAppReturnPath() ?? tab.path)}
                className={`mobile-tap-target flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 py-1 rounded-md transition-colors touch-manipulation relative ${
                  active ? 'text-emerald-400' : 'text-emerald-500 active:text-emerald-400'
                }`}
                style={{ textShadow: '0 0 8px rgba(52,211,153,0.5)' }}
              >
                <div className="absolute inset-x-2 inset-y-0 rounded-md bg-emerald-400/8 border border-emerald-400/20" />
                <Icon className="w-6 h-6 relative z-10 drop-shadow-[0_0_6px_rgba(52,211,153,0.4)]" />
              </button>
            );
          }
          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.path)}
              className={`mobile-tap-target relative flex flex-col items-center justify-center flex-1 min-w-0 py-1 rounded-md transition-colors touch-manipulation ${
                active ? activeColor : 'text-zinc-600 active:text-zinc-400'
              }`}
            >
              <Icon className={`w-6 h-6 ${active ? activeColor : ''}`} />
              {tab.id === 'comms' && isAuthenticated && commsCount > 0 && (
                <span className="absolute top-0 right-1 min-w-[16px] h-4 flex items-center justify-center text-[9px] font-bold bg-red-500 text-white rounded-full px-1 border border-[#0a0a0b]">
                  {commsCount > 99 ? '99+' : commsCount}
                </span>
              )}
            </button>
          );
        })}

        <div className="relative flex-1 min-w-0" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(prev => !prev)}
            className={`mobile-tap-target relative flex flex-col items-center justify-center gap-0.5 w-full py-1 rounded-md transition-colors touch-manipulation ${
              hasActiveDropdownItem || dropdownOpen
                ? 'text-sky-400'
                : 'text-zinc-600 active:text-zinc-400'
            }`}
          >
            <ChevronDown className={`w-5 h-5 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            <span className="text-[10px] max-[360px]:text-[9px] font-mono tracking-wider max-[360px]:tracking-normal uppercase leading-none">
              MORE
            </span>
          </button>

          {dropdownOpen && createPortal(
            <div
              ref={dropdownPanelRef}
              className="mobile-scroll-region fixed w-56 max-w-[calc(100vw-1rem)] max-h-[min(70dvh,30rem)] overflow-y-auto bg-[#111113] border border-white/[0.1] rounded-xl shadow-2xl shadow-black/60 py-1"
              style={{ top: dropdownPos.top, right: Math.max(8, dropdownPos.right), zIndex: 9999 }}
            >
              {dropdownItems
                .filter(item => !item.authOnly || isAuthenticated)
                // Ordered by label length — most letters at top, fewest at bottom.
                .slice()
                .sort((a, b) => b.label.length - a.label.length)
                .map(item => {
                  const active = isAppNavItemActive(item, pathname);
                  const Icon = item.icon;
                  const label = item.id === 'profile' && !isAuthenticated
                    ? 'LOGIN'
                    : item.id === 'org'
                      ? (userOrg?.name ?? 'ORG').toUpperCase()
                      : item.label;
                  const isRed = (item as { accent?: string }).accent === 'red';
                  let cls = 'text-zinc-400 active:bg-white/5';
                  let iconCls = 'text-zinc-600';
                  if (active) {
                    if (isRed) { cls = 'bg-red-500/10 text-red-300'; iconCls = 'text-red-300'; }
                    else { cls = 'bg-sky-500/10 text-sky-400'; iconCls = 'text-sky-400'; }
                  } else if (isRed) {
                    cls = 'text-red-300/85 active:bg-red-950/40'; iconCls = 'text-red-400/80';
                  }
                  const showCommsBadge = item.id === 'comms' && commsCount > 0;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        navigate(item.path);
                        setDropdownOpen(false);
                      }}
                      className={`mobile-tap-target flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors touch-manipulation ${cls}`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${iconCls}`} />
                      <span className="text-xs font-mono tracking-widest uppercase">{label}</span>
                      {showCommsBadge && (
                        <span className="ml-auto min-w-[16px] h-4 flex items-center justify-center text-[9px] font-bold bg-red-500 text-white rounded-full px-1">
                          {commsCount > 99 ? '99+' : commsCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              {!isAuthenticated && (
                <button
                  onClick={() => {
                    navigate('/profile');
                    setDropdownOpen(false);
                  }}
                  className="mobile-tap-target flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors touch-manipulation text-zinc-400 active:bg-white/5"
                >
                  <User className="w-4 h-4 shrink-0 text-zinc-600" />
                  <span className="text-xs font-mono tracking-widest uppercase">
                    {isHome ? "START WORK" : "LOGIN"}
                  </span>
                </button>
              )}
            </div>,
            document.body
          )}
        </div>

        {/* Notification bell + avatar — relocated here from the (now removed)
            NavBar mobile utility row, so mobile chrome stays at two rows
            without losing notifications or quick account access. Shown only
            when signed in; signed-out users reach LOGIN via the MORE menu. */}
        {isAuthenticated && (
          <div className="flex items-center gap-0.5 shrink-0 pl-1 ml-0.5 max-[360px]:pl-0.5 max-[360px]:ml-0 border-l border-white/[0.06]">
            <NotificationBell
              buttonClassName="mobile-tap-target relative flex items-center justify-center text-zinc-500 active:text-sky-400 transition-colors rounded-md touch-manipulation"
              iconClassName="w-5 h-5"
            />
            <button
              onClick={() => setSummaryOpen(true)}
              className="mobile-tap-target flex items-center justify-center hover:opacity-80 transition-opacity touch-manipulation"
              aria-label="Profile"
            >
              {resolveAvatarUrl(user?.profileImageUrl) ? (
                <img
                  src={resolveAvatarUrl(user?.profileImageUrl)}
                  alt={user?.firstName ?? 'User'}
                  className="w-7 h-7 rounded-md object-cover border border-white/10"
                />
              ) : (
                <div className="w-7 h-7 rounded-md flex items-center justify-center font-mono text-sm bg-sky-500/10 border border-sky-500/20 text-sky-300">
                  {(user?.firstName?.[0] ?? user?.email?.[0] ?? '?').toUpperCase()}
                </div>
              )}
            </button>
          </div>
        )}
      </div>
      {summaryOpen && createPortal(
        <MobileAccountSheet
          summary={summary}
          loading={summaryLoading}
          currentLocation={currentLocation}
          onClose={() => setSummaryOpen(false)}
          onNavigate={(path) => { setSummaryOpen(false); navigate(path); }}
        />,
        document.body,
      )}
    </div>
  );
}

export function MobileBottomBar() {
  return null;
}

type MobileAccountSummary = {
  wallet?: {
    bank?: { earnedFiat?: number; fiatTotal?: number };
    faction?: { totalSalary?: number; primary?: { name?: string | null } | null };
    property?: { netWorth?: number };
  } | null;
  org?: {
    org?: { name?: string | null; businessAddress?: string | null } | null;
    members?: Array<{ lastSeenAt?: string | null; status?: string }>;
  } | null;
  enterprise?: {
    employees?: { active?: number };
    financials?: { grossIncome?: number; todayRevenue?: number; netProfit?: number };
  } | null;
};

function fiat(value: unknown): string {
  const amount = Number(value);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return `ƒ${Math.round(safeAmount).toLocaleString()}`;
}

function MobileAccountSheet({
  summary,
  loading,
  currentLocation,
  onClose,
  onNavigate,
}: {
  summary: MobileAccountSummary | null;
  loading: boolean;
  currentLocation: string;
  onClose: () => void;
  onNavigate: (path: string) => void;
}) {
  const spendable = summary?.wallet?.bank?.earnedFiat ?? summary?.wallet?.bank?.fiatTotal ?? 0;
  const org = summary?.org?.org;
  const members = summary?.org?.members ?? [];
  const liveMembers = members.filter(member => {
    if (!member.lastSeenAt) return false;
    return Date.now() - new Date(member.lastSeenAt).getTime() < 90_000;
  }).length;
  const employeeCount = summary?.enterprise?.employees?.active ?? members.length;
  const companyName = org?.name ?? summary?.wallet?.faction?.primary?.name ?? 'NO COMPANY FILED';
  return (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/65 p-2 sm:items-center" onClick={onClose}>
      <section
        className="w-full max-w-md overflow-hidden rounded-2xl border border-sky-400/25 bg-[#101217] shadow-2xl shadow-black/70"
        onClick={event => event.stopPropagation()}
        aria-label="Account summary"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[.2em] text-sky-300">ACCOUNT SNAPSHOT</p>
            <p className="mt-1 text-xs text-zinc-500">Spendable balance and company health</p>
          </div>
          <button className="mobile-tap-target rounded-lg text-zinc-400 active:bg-white/10" onClick={onClose} aria-label="Close account summary">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[75dvh] overflow-y-auto p-3">
          {loading && !summary ? (
            <div className="rounded-xl border border-white/10 bg-white/[.03] p-6 text-center font-mono text-xs uppercase tracking-widest text-zinc-500">LOADING ACCOUNT…</div>
          ) : (
            <>
              <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/[.08] p-4">
                <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[.18em] text-emerald-300">
                  <WalletCards className="h-4 w-4" /> SPENDABLE ACCOUNT
                </div>
                <div className="mt-2 text-3xl font-semibold tracking-tight text-white">{fiat(spendable)}</div>
                <p className="mt-1 text-xs text-emerald-100/70">Available now for shopping, travel, and operating costs.</p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <SummaryMetric label="CURRENT INCOME" value={fiat(summary?.wallet?.faction?.totalSalary)} />
                <SummaryMetric label="NET WORTH" value={fiat(summary?.wallet?.property?.netWorth)} />
                <SummaryMetric label="EMPLOYEES" value={String(employeeCount)} />
                <SummaryMetric label="LIVE NOW" value={`${liveMembers} / ${employeeCount}`} />
              </div>
              <div className="mt-3 rounded-xl border border-white/10 bg-white/[.03] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-[.16em] text-zinc-500">COMPANY</p>
                    <p className="mt-1 text-sm font-semibold text-zinc-100">{companyName}</p>
                    <p className="mt-1 text-xs text-zinc-400">{org?.businessAddress || 'Location not filed'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-mono uppercase tracking-[.16em] text-zinc-500">TODAY / CITY</p>
                    <p className="mt-1 text-xs text-sky-300">{currentLocation}</p>
                    <p className="mt-1 text-xs text-zinc-500">Live presence {liveMembers > 0 ? 'active' : 'quiet'}</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3 text-xs">
                  <div><span className="text-zinc-500">Today’s revenue</span><br /><strong className="text-zinc-200">{fiat(summary?.enterprise?.financials?.todayRevenue)}</strong></div>
                  <div><span className="text-zinc-500">Net profit</span><br /><strong className="text-zinc-200">{fiat(summary?.enterprise?.financials?.netProfit)}</strong></div>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => onNavigate('/profile')} className="mobile-tap-target flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[.04] px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-zinc-300">
                  PROFILE
                </button>
                <button onClick={() => onNavigate('/business')} className="mobile-tap-target flex flex-1 items-center justify-center gap-2 rounded-lg border border-sky-400/25 bg-sky-400/[.08] px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-sky-200">
                  COMPANY
                </button>
              </div>
            </>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[.025] px-3 py-2"><Languages className="h-4 w-4 text-zinc-500" /><LanguageSelector /></div>
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[.025] px-3 py-2"><Coins className="h-4 w-4 text-amber-300" /><CurrencySelector /></div>
          </div>
        </div>
      </section>
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[.03] p-3">
      <p className="text-[9px] font-mono uppercase tracking-[.15em] text-zinc-500">{label}</p>
      <p className="mt-1 text-base font-semibold text-zinc-100">{value}</p>
    </div>
  );
}
