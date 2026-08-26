import { LogIn, LogOut, Eye, EyeOff, ChevronDown, Zap, Bug, ExternalLink, User, Building2, Terminal, Phone, Bot, Code2, Briefcase, Layers, Megaphone, MessageSquare, FlaskConical, Network, Settings, ShieldCheck } from 'lucide-react';
import { PicassoLogo } from './PicassoLogo';
import { useLocation } from 'wouter';
import { useAuth } from '@workspace/replit-auth-web';
import { useAppMode } from '../hooks/use-app-mode';
import { usePlan } from '../hooks/use-plan';
import { useAlpha } from '../hooks/use-alpha';
import { resolveAvatarUrl } from '@/lib/avatar';
import { useCommsSummary } from '../hooks/use-comms-summary';
import { useOrg } from '../hooks/use-org';
import { useFeatureLabel } from '../hooks/use-feature-label';
import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { PABLO_PRODUCTS } from '../lib/product-names';
import { getDefaultBoomerMode } from '../hooks/use-mobile';
import { MODULES, getModuleForPath } from '../lib/modules';
import { FeedbackModal } from './FeedbackModal';
import { LanguageSelector } from './LanguageSelector';
import { CurrencySelector } from './CurrencySelector';
import { HummingbirdNavButton } from './HummingbirdNavButton';
import { isTutorialDone } from '@/lib/tutorial-progress';
import { useStreamerMode } from '@/hooks/use-streamer-mode';
import { PabloNavButton } from './PabloNavButton';
import { NotificationBell } from './NotificationBell';
import { useTranslation } from 'react-i18next';

// Mirrors MobileBottomBar PRIMARY_TABS / DROPDOWN_ITEMS so desktop and mobile show the same nav.
const NAV_PRIMARY = [
  { id: 'pablo', path: '/pablo', label: 'PABLO', icon: Terminal },
  { id: 'phone', path: '/phone/dialer', label: 'PHONE', icon: Phone },
  { id: 'bots', path: '/pledge', label: 'AGENTS', icon: Bot },
  { id: 'office', path: '/office', label: 'OFFICE', icon: Building2, accent: 'emerald' as const },
  // ORG — dedicated org-management hub. Label is replaced at render time with
  // the live org name (falls back to 'ORG'). Distinct from OFFICE above.
  { id: 'org', path: '/org', label: 'ORG', icon: Network, authOnly: true },
];
const NAV_MORE = [
  { id: 'comms', path: '/comms', label: 'COMMS', icon: MessageSquare },
  { id: 'console', path: '/console', label: 'TERMINAL', icon: Code2 },
  { id: 'business', path: '/business', label: 'BUSINESS', icon: Briefcase },
  { id: 'creative', path: '/creative/music', label: 'CREATIVE', icon: Layers },
  { id: 'marketing', path: '/marketing', label: 'MARKETING', icon: Megaphone },
  { id: 'settings', path: '/settings', label: 'SETTINGS', icon: Settings, authOnly: true },
];
// ADMIN hub entry — appended at render time only for owners/admins/moderators.
const NAV_ADMIN = { id: 'admin', path: '/profile/admin', label: 'ADMIN', icon: ShieldCheck } as const;

export function NavBar() {
  const [location, navigate] = useLocation();
  const { user, isLoading, isAuthenticated, login, logout } = useAuth();
  const { config, toggleMode, isDiscreet } = useAppMode();
  const streamerMode = useStreamerMode();
  const { isPro, isOwner, features, loading: planLoading } = usePlan();
  const { isApprovedTester, isApprovedDev } = useAlpha();
  // Discord-style role hierarchy: ADMIN > MOD. Approved devs are administrators,
  // approved testers are city moderators during the rework. The OWNER badge is
  // intentionally suppressed — owners read as regular players in the chrome.
  const roleBadge = isApprovedDev
    ? { label: 'ADMIN', title: 'Administrator', cls: 'text-rose-300 bg-rose-500/12 border-rose-400/40' }
    : isApprovedTester
      ? { label: 'MOD', title: 'City moderator — approved tester', cls: 'text-sky-300 bg-sky-500/12 border-sky-400/40' }
      : null;
  const { total: commsCount } = useCommsSummary();
  const { org: userOrg } = useOrg();
  const { label: featureLabel } = useFeatureLabel();
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const morePanelRef = useRef<HTMLDivElement>(null);
  const [morePos, setMorePos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const [showFeedback, setShowFeedback] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'sm_boomer') setBoomerMode(e.newValue === '1'); };
    window.addEventListener('storage', onStorage);
    const id = setInterval(() => { try { setBoomerMode(localStorage.getItem('sm_boomer') === '1'); } catch {} }, 2000);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(id); };
  }, []);

  const pathname = location.split('?')[0];
  const currentModule = getModuleForPath(pathname);

  // Phone is a paid feature (PABLO bundle), but we now show the tab to
  // EVERYONE so prospects can discover it. PhoneGate enforces actual
  // access at the route level and renders the paywall/upgrade screen
  // for users without phone_system. Keeping isOwner/features lookups
  // referenced here so a future change can re-introduce variant chrome
  // (e.g. a "PRO" badge on the tab) without having to re-thread state.
  void planLoading; void isOwner; void features;
  const visiblePrimary = NAV_PRIMARY;

  const isPrimaryActive = (tab: typeof NAV_PRIMARY[0]) => {
    if (tab.id === 'pablo') return pathname === '/pablo';
    if (tab.id === 'office') return pathname === '/office' || pathname === '/my-office' ||
      pathname.startsWith('/office/') ||
      pathname === '/game/map' || pathname === '/game/economy' || pathname === '/game/bank' ||
      pathname === '/game/character' || pathname === '/game/settings';
    if (tab.id === 'bots') return pathname.startsWith('/bots') || pathname.startsWith('/pledge');
    if (tab.id === 'phone') return pathname.startsWith('/phone');
    if (tab.id === 'org') return pathname === '/org' || pathname.startsWith('/org/');
    return false;
  };

  // ADMIN hub is visible only to platform owners and approved staff (devs / testers).
  // Regular org members do NOT see this — AdminPanel is gated at the route level too.
  const canAdmin = isOwner || isApprovedDev || isApprovedTester;
  const moreItems = [...NAV_MORE, ...(canAdmin ? [NAV_ADMIN] : [])];

  const isMoreActive = (item: typeof moreItems[0]) => {
    if (item.id === 'console') return pathname === '/console' || pathname.startsWith('/console/');
    if (item.id === 'settings') return pathname.startsWith('/settings');
    if (item.id === 'admin') return pathname.startsWith('/profile/admin') ||
      pathname.startsWith('/profile/moderator') || pathname.startsWith('/profile/world-map');
    return pathname.startsWith('/' + item.id);
  };

  const hasActiveMore = moreItems.some(isMoreActive);

  useEffect(() => {
    if (!moreOpen) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (moreRef.current?.contains(t)) return;
      if (morePanelRef.current?.contains(t)) return;
      setMoreOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [moreOpen]);

  // The MORE dropdown is portaled to <body> so it overlays everything regardless
  // of ancestor stacking contexts (e.g. the mobile sticky-z-50 nav wrapper). Anchor
  // it under the trigger, and keep it pinned while open if the layout shifts.
  useEffect(() => {
    if (!moreOpen) return;
    const place = () => {
      const r = moreRef.current?.getBoundingClientRect();
      if (r) setMorePos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [moreOpen]);

  const getSubLabel = (sub: typeof MODULES[0]['subs'][0]) => {
    // The classroom/live-session entry is renamed dynamically: education orgs
    // see "Classroom", everyone else "Conference".
    if (sub.id === 'classroom') return featureLabel.toUpperCase();
    if (boomerMode) {
      return t(`labels.${sub.id}`, sub.boomerLabel);
    }
    return t(`codenames.${sub.id}`, sub.codename);
  };

  return (
    <header className="app-header shrink-0 hidden sm:block bg-[#0a0a0b] border-b border-white/[0.06]">

      {/* Top strip — brand + plan / trial info (hidden on mobile). The brand
          (logo + PABLO TERMINAL subtitle) now lives up here, stacked above the
          ALPHA badge, so the main nav row below stays slim. */}
      <div className="hidden sm:flex items-start justify-between px-4 py-1.5 border-b border-white/[0.04] bg-white/[0.015]">
        <div className="flex flex-col gap-1">
          <div
            className="flex items-center gap-2.5 cursor-pointer group/logo"
            onClick={() => navigate('/')}
          >
            <div className="w-7 h-7 rounded-md flex items-center justify-center">
              <PicassoLogo size={22} gap={2} glow />
            </div>
            <div>
              <h1 className="font-['Share_Tech_Mono',monospace] text-sm font-normal text-zinc-100 tracking-widest leading-none">
                {config.name}
              </h1>
              <p className="font-mono text-[11px] text-zinc-500 tracking-widest leading-none mt-0.5">
                {config.sub.replace(/\s*·\s*ALPHA.*$/i, '')}
              </p>
            </div>
            <button
              onClick={e => { e.stopPropagation(); toggleMode(); }}
              title={isDiscreet ? t('nav.discreetShow') : t('nav.discreetHide')}
              className="p-1 text-zinc-700 hover:text-zinc-400 transition-colors"
            >
              {isDiscreet ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-xs text-zinc-500 tracking-widest uppercase">
              {boomerMode ? t('nav.salarymanLabel') : t('nav.pabloCorpLabel')}
            </span>
            <span className="text-zinc-700 text-xs">◆</span>
            <span className="font-mono text-[11px] text-sky-400/70 border border-sky-500/25 bg-sky-500/8 px-2 py-0.5 rounded tracking-widest uppercase">
              ALPHA {__BUILD_VERSION__}
            </span>
            <button
              onClick={() => navigate('/pledge')}
              className="font-mono text-[11px] text-amber-500/70 tracking-widest uppercase hover:text-amber-400 transition-colors"
            >
              PLEDGE STORE
            </button>
            <button
              onClick={() => navigate('/feedback')}
              className="font-mono text-[11px] text-zinc-600 tracking-widest uppercase hover:text-sky-400/70 transition-colors"
            >
              Feedback
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* The live BTC → USD → ƒ → Gold ticker now lives inside the in-game
              world HUD (WorldPlay), where it also shows the player's spendable
              ƒ balance. It was removed from the top nav to declutter. */}
          <span className="flex items-center gap-1.5">
            {isOwner ? (
              <span className="flex items-center gap-1.5" title={t('nav.corpAdmin')}>
                <Zap className="w-3 h-3 text-amber-500" />
                <span className="font-mono text-xs text-amber-400 tracking-wide">
                  {t('nav.corpAdmin')}
                </span>
              </span>
            ) : isPro || features.size > 0 ? (
              <button onClick={() => navigate('/pricing')} className="flex items-center gap-1.5 hover:opacity-80 transition-opacity">
                <Zap className="w-3 h-3 text-amber-500" />
                <span className="font-mono text-xs text-amber-400 tracking-wide">
                  {boomerMode
                    ? `${features.size} ${t('nav.active')}`
                    : `${features.size} ${t('nav.module', { count: features.size })}${features.size !== 1 ? 'S' : ''}`}
                </span>
              </button>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                <button
                  onClick={() => navigate('/pricing')}
                  className="font-mono text-xs text-red-400 tracking-wide hover:text-red-300 transition-colors"
                >
                  {boomerMode ? 'PRICING' : t('nav.upgradeLabelCodename')}
                </button>
              </>
            )}
          </span>
          {!location.startsWith('/world') && (
            <button
              onClick={() => {
                const nb = !boomerMode;
                setBoomerMode(nb);
                try { localStorage.setItem('sm_boomer', nb ? '1' : '0'); } catch {}
              }}
              className={`font-mono text-xs tracking-wide px-2 py-0.5 rounded border transition-colors ${
                boomerMode
                  ? 'text-amber-400 border-amber-500/30 bg-amber-500/8'
                  : 'text-zinc-600 border-zinc-700/50 hover:text-zinc-400'
              }`}
              title={boomerMode ? t('nav.boomerModeTooltipOn') : t('nav.boomerModeTooltipOff')}
            >
              {boomerMode ? t('nav.boomerModeOn') : t('nav.boomerModeOff')}
            </button>
          )}
          <LanguageSelector />
          <CurrencySelector />
        </div>
      </div>

      {/* Main nav row — desktop only. On mobile the entire NavBar is hidden
          (the header is `hidden sm:block`); the mobile primary bar lives in
          MobileModuleNav, which now also carries the notification bell +
          avatar/profile so mobile chrome stays at two rows. */}
      <div className="flex items-center px-4 h-12">

        {/* Primary tabs + MORE dropdown — mirrors mobile bottom bar so layouts match.
            ml-auto keeps the cluster pinned to the right edge. */}
        <nav className="hidden sm:flex items-center gap-1 shrink-0 ml-auto">
          {visiblePrimary.filter(t => !(t as { authOnly?: boolean }).authOnly || isAuthenticated).map(tab => {
            const active = isPrimaryActive(tab);
            const Icon = tab.icon;
            const isOffice = tab.accent === 'emerald';
            const activeCls = isOffice
              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25'
              : 'bg-sky-500/10 text-sky-300 border-sky-500/25';
            const idleCls = isOffice
              ? 'text-emerald-400/70 border-emerald-500/20 hover:bg-emerald-500/8 hover:text-emerald-300'
              : 'text-zinc-400 border-transparent hover:text-zinc-100 hover:bg-white/5';
            return (
              <button
                key={tab.id}
                onClick={() => navigate(tab.path)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-mono tracking-widest uppercase transition-colors border ${active ? activeCls : idleCls}`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {tab.id === 'org' ? (userOrg?.name ?? 'ORG') : tab.label}
              </button>
            );
          })}

          {/* MORE ▾ — collapses everything else */}
          <div className="relative" ref={moreRef}>
            <button
              onClick={() => setMoreOpen(o => !o)}
              className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-mono tracking-widest uppercase transition-colors border ${
                hasActiveMore || moreOpen
                  ? 'bg-sky-500/10 text-sky-300 border-sky-500/25'
                  : 'text-zinc-400 border-transparent hover:text-zinc-100 hover:bg-white/5'
              }`}
            >
              MORE
              <ChevronDown className={`w-2.5 h-2.5 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
              {commsCount > 0 && !moreOpen && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center text-[9px] font-bold bg-red-500 text-white rounded-full px-1 border border-[#0a0a0b]">
                  {commsCount > 99 ? '99+' : commsCount}
                </span>
              )}
            </button>
            {moreOpen && createPortal(
              <div ref={morePanelRef} className="fixed w-52 bg-[#111113] border border-white/[0.1] rounded-lg shadow-2xl shadow-black/60 py-1 z-[9999]" style={{ top: morePos.top, right: morePos.right }}>
                {/* Ordered by label length — most letters at top, fewest at bottom. */}
                {moreItems.filter(it => !(it as { authOnly?: boolean }).authOnly || isAuthenticated).sort((a, b) => b.label.length - a.label.length).map(item => {
                  const active = isMoreActive(item);
                  const Icon = item.icon;
                  const isEmerald = (item as { accent?: string }).accent === 'emerald';
                  let cls = 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100';
                  let iconCls = 'text-zinc-600';
                  if (active) {
                    if (isEmerald) { cls = 'bg-emerald-500/10 text-emerald-300'; iconCls = 'text-emerald-300'; }
                    else { cls = 'bg-sky-500/10 text-sky-300'; iconCls = 'text-sky-300'; }
                  } else if (isEmerald) {
                    cls = 'text-emerald-300/85 hover:bg-emerald-950/40 hover:text-emerald-200'; iconCls = 'text-emerald-400/80';
                  }
                  const showCommsBadge = item.id === 'comms' && commsCount > 0;
                  return (
                    <button
                      key={item.id}
                      onClick={() => { navigate(item.path); setMoreOpen(false); }}
                      className={`flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors ${cls}`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${iconCls}`} />
                      <span className="text-xs font-mono tracking-widest uppercase">{item.label}</span>
                      {showCommsBadge && (
                        <span className="ml-auto min-w-[16px] h-4 flex items-center justify-center text-[9px] font-bold bg-red-500 text-white rounded-full px-1">
                          {commsCount > 99 ? '99+' : commsCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>,
              document.body
            )}
          </div>

          {/* Auth */}
          <div className="ml-2 pl-2 flex items-center gap-2 border-l border-white/[0.06]">
            {/* Hummingbird shortcut — sits next to CORP ADMIN-area cluster.
                Pulses cyan when something's playing in the background. */}
            <PabloNavButton />
            {isAuthenticated && isTutorialDone() && <HummingbirdNavButton />}
            {/* Notification bell — desktop (self-contained, shared with mobile) */}
            {isAuthenticated && <NotificationBell />}
            {/* Tester program shortcut */}
            <button
              onClick={() => navigate('/alpha')}
              title="Tester Program — apply for alpha access"
              className="p-1.5 text-zinc-600 hover:text-fuchsia-400 transition-colors rounded-md hover:bg-fuchsia-500/8"
            >
              <FlaskConical className="w-3.5 h-3.5" />
            </button>
            {/* Bug report button */}
            <button
              onClick={() => setShowFeedback(true)}
              title="Report an issue"
              className="p-1.5 text-zinc-600 hover:text-sky-400 transition-colors rounded-md hover:bg-sky-500/8"
            >
              <Bug className="w-3.5 h-3.5" />
            </button>
            {isLoading ? (
              <div className="w-7 h-7 rounded-md bg-white/4 animate-pulse" />
            ) : isAuthenticated && user ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate('/profile')}
                  className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                  title="My account"
                >
                  {resolveAvatarUrl(user.profileImageUrl) ? (
                    <img
                      src={resolveAvatarUrl(user.profileImageUrl)}
                      alt={user.firstName ?? 'User'}
                      className="w-7 h-7 rounded-md object-cover border border-white/10"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-md flex items-center justify-center font-mono text-sm bg-sky-500/10 border border-sky-500/20 text-sky-300">
                      {(user.firstName?.[0] ?? user.email?.[0] ?? '?').toUpperCase()}
                    </div>
                  )}
                  <div className="hidden sm:flex flex-col items-end gap-1">
                    <p className="text-xs font-mono text-zinc-300 leading-none">
                      {user.firstName ?? (streamerMode ? 'STREAMER' : user.email?.split('@')[0]) ?? 'USER'}
                    </p>
                    {roleBadge && (
                      <span
                        title={roleBadge.title}
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-widest uppercase border ${roleBadge.cls}`}
                      >
                        {roleBadge.label}
                      </span>
                    )}
                  </div>
                </button>
                <button
                  onClick={logout}
                  title={t('nav.logout')}
                  className="p-1.5 text-zinc-600 hover:text-red-400 transition-colors rounded-md hover:bg-red-500/8"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => login()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono tracking-widest uppercase text-zinc-300 border border-white/10 bg-white/4 hover:bg-white/8 transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                {t('nav.login')}
              </button>
            )}
          </div>
        </nav>
      </div>

      {/* Sub-nav row — shows subs for whichever module the user is currently inside (desktop only) */}
      {currentModule && currentModule.subs.length > 0 && (
        <div className="hidden sm:flex items-center gap-1 px-4 py-1.5 border-t border-white/[0.04] bg-white/[0.015] overflow-x-auto scrollbar-hide">
          <span className="font-mono text-xs text-zinc-600 tracking-widest uppercase mr-2 shrink-0">
            {boomerMode ? t(`nav.${currentModule.id}`, currentModule.label) : t(`codenames.${currentModule.id}`, currentModule.codename)}
          </span>
          {currentModule.subs.map(sub => {
            const isSubActive = pathname === sub.path;
            const Icon = sub.icon;
            return (
              <button
                key={sub.id}
                onClick={() => navigate(sub.path)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono tracking-widest uppercase transition-colors shrink-0 ${
                  isSubActive
                    ? 'bg-sky-500/10 text-sky-300 border border-sky-500/20'
                    : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/4 border border-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {getSubLabel(sub)}
              </button>
            );
          })}
          <button
            onClick={() => {
              const base = import.meta.env.BASE_URL ?? '/';
              window.open(`${base}${pathname.replace(/^\//, '')}`, '_blank', 'noopener');
            }}
            title="OPEN IN NEW TAB"
            className="ml-auto p-1 rounded text-zinc-600 hover:text-sky-400 hover:bg-white/4 transition-colors shrink-0"
          >
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      )}

      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
    </header>
  );
}
