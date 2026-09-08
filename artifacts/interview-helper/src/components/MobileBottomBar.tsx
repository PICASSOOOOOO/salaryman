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
import { EconomyToggle } from './EconomyToggle';
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

  if (!currentModule || !shouldShowModuleSubnav(currentModule.id, currentModule.subs.length, pathname)) return null;

  return (
    <div className="mobile-app-subnav" style={{ zIndex: 40 }}>
      <div
        ref={scrollRef}
        className="mobile-scroll-region mobile-subnav-scroll"
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
              className={`mobile-subnav-item mobile-tap-target ${isActive ? 'is-active' : ''}`}
            >
              <Icon className="mobile-subnav-icon" />
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
  const swipeStartY = useRef<number | null>(null);
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
    <div
      className="mobile-app-nav"
      style={{ zIndex: 60 }}
      onTouchStart={(event) => { swipeStartY.current = event.touches[0]?.clientY ?? null; }}
      onTouchMove={(event) => {
        const currentY = event.touches[0]?.clientY;
        if (isAuthenticated && swipeStartY.current != null && currentY != null && swipeStartY.current - currentY > 40) {
          swipeStartY.current = null;
          setSummaryOpen(true);
        }
      }}
      onTouchEnd={() => { swipeStartY.current = null; }}
    >
      {isAuthenticated && (
        <button
          type="button"
          onClick={() => setSummaryOpen(true)}
          className="flex w-full flex-col items-center gap-0.5 py-1 text-black"
          aria-label="Open account details"
        >
          <span className="h-1 w-12 rounded-full bg-black" />
          <span className="text-[9px] font-semibold tracking-[0.12em]">SWIPE UP FOR ACCOUNT</span>
        </button>
      )}
      <div className="mobile-brand-row">
        <div className="mobile-account-actions">
            <EconomyToggle isAuthenticated={isAuthenticated} />
          {isAuthenticated && (
              <>
                <NotificationBell
                  buttonClassName="mobile-account-button mobile-tap-target"
                  iconClassName="mobile-account-icon"
                />
                <button
                  onClick={() => setSummaryOpen(true)}
                  className="mobile-account-button mobile-tap-target"
                  aria-label="Open account details"
                >
                  {resolveAvatarUrl(user?.profileImageUrl) ? (
                    <img
                      src={resolveAvatarUrl(user?.profileImageUrl)}
                      alt={user?.firstName ?? 'User'}
                      className="mobile-avatar"
                    />
                  ) : (
                    <div className="mobile-avatar mobile-avatar-fallback">
                      {(user?.firstName?.[0] ?? user?.email?.[0] ?? '?').toUpperCase()}
                    </div>
                  )}
                </button>
              </>
          )}
        </div>
      </div>
      <div className="mobile-primary-row">
        <button
          onClick={goBack}
          aria-label="Back"
          title="Back"
          className="mobile-back-button mobile-tap-target"
        >
          <ArrowLeft className="mobile-primary-icon" />
        </button>
        <div className="mobile-primary-scroll">
          {visibleTabs.map(tab => {
            const active = isAppNavItemActive(tab, pathname);
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => navigate(tab.id === 'office' ? (consumeAppReturnPath() ?? tab.path) : tab.path)}
                className={`mobile-primary-item mobile-tap-target ${active ? 'is-active' : ''}`}
                aria-label={tab.label}
              >
                <Icon className="mobile-primary-icon" />
                {tab.id === 'comms' && isAuthenticated && commsCount > 0 && (
                  <span className="mobile-notification-count">
                    {commsCount > 99 ? '99+' : commsCount}
                  </span>
                )}
              </button>
            );
          })}
        <div className="mobile-more-anchor" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(prev => !prev)}
            className={`mobile-primary-item mobile-tap-target ${hasActiveDropdownItem || dropdownOpen ? 'is-active' : ''}`}
            aria-label="More navigation"
          >
            <ChevronDown className={`mobile-primary-icon transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            <span>MORE</span>
          </button>

          {dropdownOpen && createPortal(
            <div
              ref={dropdownPanelRef}
              className="mobile-scroll-region mobile-more-panel fixed"
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
                  const showCommsBadge = item.id === 'comms' && commsCount > 0;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        navigate(item.path);
                        setDropdownOpen(false);
                      }}
                      className={`mobile-more-item mobile-tap-target ${active ? 'is-active' : ''} ${isRed ? 'is-danger' : ''}`}
                    >
                      <Icon className="mobile-more-icon" />
                      <span>{label}</span>
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
                  className="mobile-more-item mobile-tap-target"
                >
                  <User className="mobile-more-icon" />
                  <span>
                    {isHome ? "START WORK" : "LOGIN"}
                  </span>
                </button>
              )}
            </div>,
            document.body
          )}
        </div>
        </div>
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
    <div className="mobile-account-sheet fixed inset-0 z-[10000] flex items-end justify-center px-2 pt-2 pb-[max(12px,var(--app-safe-bottom))] sm:items-center" onClick={onClose}>
      <section
        className="mobile-account-sheet-panel w-full max-w-md overflow-hidden rounded-2xl"
        onClick={event => event.stopPropagation()}
        aria-label="Account summary"
      >
        <div className="flex flex-col items-center gap-1 pt-2" aria-hidden="true">
          <span className="h-1 w-12 rounded-full bg-black" />
          <span className="text-[10px] font-semibold text-black">ACCOUNT DETAILS</span>
        </div>
        <div className="mobile-account-sheet-header flex items-center justify-between px-4 py-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#155b86]">ACCOUNT SNAPSHOT</p>
            <p className="mt-1 text-xs text-[#718392]">Spendable balance and company health</p>
          </div>
          <button className="mobile-tap-target rounded-lg text-[#718392] active:bg-[#e6f2f9]" onClick={onClose} aria-label="Close account summary">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[calc(75dvh-var(--app-safe-bottom))] overflow-y-auto p-3 pb-[max(12px,var(--app-safe-bottom))]">
          {loading && !summary ? (
            <div className="mobile-account-sheet-card rounded-xl p-6 text-center font-mono text-xs uppercase tracking-widest text-[#718392]">LOADING ACCOUNT…</div>
          ) : (
            <>
              <div className="mobile-account-sheet-balance rounded-xl p-4">
                <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[.18em] text-[#298263]">
                  <WalletCards className="h-4 w-4" /> SPENDABLE ACCOUNT
                </div>
                <div className="mt-2 text-3xl font-semibold tracking-tight text-[#172e43]">{fiat(spendable)}</div>
                <p className="mt-1 text-xs text-[#4e806d]">Available now for shopping, travel, and operating costs.</p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <SummaryMetric label="CURRENT INCOME" value={fiat(summary?.wallet?.faction?.totalSalary)} />
                <SummaryMetric label="NET WORTH" value={fiat(summary?.wallet?.property?.netWorth)} />
                <SummaryMetric label="EMPLOYEES" value={String(employeeCount)} />
                <SummaryMetric label="LIVE NOW" value={`${liveMembers} / ${employeeCount}`} />
              </div>
              <div className="mobile-account-sheet-card mt-3 rounded-xl p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-[.16em] text-[#718392]">COMPANY</p>
                    <p className="mt-1 text-sm font-semibold text-[#172e43]">{companyName}</p>
                    <p className="mt-1 text-xs text-[#718392]">{org?.businessAddress || 'Location not filed'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-mono uppercase tracking-[.16em] text-[#718392]">TODAY / CITY</p>
                    <p className="mt-1 text-xs text-[#155b86]">{currentLocation}</p>
                    <p className="mt-1 text-xs text-[#718392]">Live presence {liveMembers > 0 ? 'active' : 'quiet'}</p>
                  </div>
                </div>
                <div className="mobile-account-sheet-rule mt-3 grid grid-cols-2 gap-2 pt-3 text-xs">
                  <div><span className="text-[#718392]">Today’s revenue</span><br /><strong className="text-[#526777]">{fiat(summary?.enterprise?.financials?.todayRevenue)}</strong></div>
                  <div><span className="text-[#718392]">Net profit</span><br /><strong className="text-[#526777]">{fiat(summary?.enterprise?.financials?.netProfit)}</strong></div>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => onNavigate('/profile')} className="mobile-account-sheet-button mobile-tap-target flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 font-mono text-[10px] uppercase tracking-widest">
                  PROFILE
                </button>
                <button onClick={() => onNavigate('/business')} className="mobile-account-sheet-button mobile-account-sheet-button-primary mobile-tap-target flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 font-mono text-[10px] uppercase tracking-widest">
                  COMPANY
                </button>
              </div>
            </>
          )}
          <div className="mobile-account-sheet-rule mt-3 grid grid-cols-2 gap-2 pt-3">
            <div className="mobile-account-sheet-control flex items-center gap-2 rounded-lg px-3 py-2"><Languages className="h-4 w-4 text-[#718392]" /><LanguageSelector /></div>
            <div className="mobile-account-sheet-control flex items-center gap-2 rounded-lg px-3 py-2"><Coins className="h-4 w-4 text-[#b27a26]" /><CurrencySelector /></div>
          </div>
        </div>
      </section>
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="mobile-account-sheet-card rounded-xl p-3">
      <p className="text-[9px] font-mono uppercase tracking-[.15em] text-[#718392]">{label}</p>
      <p className="mt-1 text-base font-semibold text-[#172e43]">{value}</p>
    </div>
  );
}
