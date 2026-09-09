import { LogIn, LogOut, Eye, EyeOff, ChevronDown, Zap, Bug, ExternalLink, FlaskConical, ArrowLeft } from 'lucide-react';
import { PicassoLogo } from './PicassoLogo';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { useAppMode } from '../hooks/use-app-mode';
import { usePlan } from '../hooks/use-plan';
import { useAlpha } from '../hooks/use-alpha';
import { resolveAvatarUrl } from '@/lib/avatar';
import { useCommsSummary } from '../hooks/use-comms-summary';
import { useOrg } from '../hooks/use-org';
import { useFeatureLabel } from '../hooks/use-feature-label';
import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getDefaultBoomerMode } from '../hooks/use-mobile';
import { MODULES, getModuleForPath } from '../lib/modules';
import { FeedbackModal } from './FeedbackModal';
import { LanguageSelector } from './LanguageSelector';
import { CurrencySelector } from './CurrencySelector';
import { HummingbirdNavButton } from './HummingbirdNavButton';
import { isTutorialDone } from '@/lib/tutorial-progress';
import { PabloNavButton } from './PabloNavButton';
import { NotificationBell } from './NotificationBell';
import { useTranslation } from 'react-i18next';
import { useStreamerMode } from '@/hooks/use-streamer-mode';
import {
  MORE_NAV_ITEMS,
  PRIMARY_NAV_ITEMS,
  isAppNavItemActive,
  canGoBackInApp,
  consumeAppReturnPath,
  getAppBackPath,
  getAppHomePath,
  rememberAppReturnPath,
  shouldShowModuleSubnav,
} from '@/lib/app-navigation';

export function NavBar() {
  const [location, navigate] = useLocation();
  const { user, isLoading, isAuthenticated, login, logout } = useAuth();
  const { config, toggleMode, isDiscreet } = useAppMode();
  const streamerMode = useStreamerMode();
  const { isPro, isOwner, features, loading: planLoading } = usePlan();
  const { isApprovedTester, isApprovedDev, isAdmin } = useAlpha();
  const roleBadge = isAdmin || isApprovedDev
    ? { label: 'ADMIN', cls: 'bg-black text-[#00FF41]' }
    : isApprovedTester
      ? { label: 'MOD', cls: 'bg-black text-white' }
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
  void planLoading;
  const visiblePrimary = PRIMARY_NAV_ITEMS;
  const canAdmin = isOwner || isApprovedDev || isApprovedTester;
  const moreItems = MORE_NAV_ITEMS.filter(item => !item.staffOnly || canAdmin);

  const goBack = () => {
    if (canGoBackInApp()) window.history.back();
    else navigate(consumeAppReturnPath() ?? getAppBackPath(isAuthenticated), { replace: true });
  };

  const previousLocationRef = useRef(location);
  useEffect(() => {
    if (location === previousLocationRef.current) return;
    const previous = previousLocationRef.current;
    if (location.split('?')[0].startsWith('/phone')) rememberAppReturnPath(previous);
    previousLocationRef.current = location;
  }, [location]);

  const hasActiveMore = moreItems.some(item => isAppNavItemActive(item, pathname));

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
    if (sub.id === 'classroom') return featureLabel.toUpperCase();
    if (boomerMode) return t(`labels.${sub.id}`, sub.boomerLabel);
    return t(`codenames.${sub.id}`, sub.codename);
  };

  return (
    <header className="app-header desktop-app-nav shrink-0 bg-[#FAF7EF] border-b border-[#D8D1C3]">
      <div className="flex items-start justify-between px-4 py-1.5 border-b border-[#E5DED1] bg-[#FFFCF5]">
        <div className="flex flex-col gap-1">
          <div
            className="flex items-center gap-2.5 cursor-pointer group/logo"
            onClick={() => navigate(getAppHomePath(isAuthenticated))}
          >
            <div className="w-7 h-7 rounded-md flex items-center justify-center bg-black text-[#FAF7EF]">
              <PicassoLogo size={22} gap={2} />
            </div>
            <div>
              <h1 className="font-mono text-sm font-normal text-black tracking-widest leading-none">
                {config.name}
              </h1>
              <p className="font-mono text-[11px] text-[#777064] tracking-widest leading-none mt-0.5">
                {config.sub.replace(/\s*·\s*ALPHA.*$/i, '')}
              </p>
            </div>
            <button
              onClick={event => { event.stopPropagation(); toggleMode(); }}
              title={isDiscreet ? t('nav.discreetShow') : t('nav.discreetHide')}
              className="p-1 text-[#A59D90] hover:text-black transition-colors"
            >
              {isDiscreet ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-xs text-[#777064] tracking-widest uppercase">
              {boomerMode ? t('nav.salarymanLabel') : t('nav.pabloCorpLabel')}
            </span>
            <span className="text-[#B9B1A2] text-xs">◆</span>
            <span className="font-mono text-[11px] text-black border border-[#CFC6B7] bg-[#F4EFE5] px-2 py-0.5 rounded tracking-widest uppercase">
              ALPHA {__BUILD_VERSION__}
            </span>
            <button
              onClick={() => navigate('/pledge')}
              className="font-mono text-[11px] text-[#6C665C] tracking-widest uppercase hover:text-black transition-colors"
            >
              PLEDGE STORE
            </button>
            <button
              onClick={() => navigate('/feedback')}
              className="font-mono text-[11px] text-[#8B8376] tracking-widest uppercase hover:text-black transition-colors"
            >
              Feedback
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            {isOwner ? (
              <span className="flex items-center gap-1.5" title={t('nav.corpAdmin')}>
                <Zap className="w-3 h-3 text-black" />
                <span className="font-mono text-xs text-black tracking-wide">{t('nav.corpAdmin')}</span>
              </span>
            ) : isPro || features.size > 0 ? (
              <button onClick={() => navigate('/pricing')} className="flex items-center gap-1.5 hover:opacity-60 transition-opacity">
                <Zap className="w-3 h-3 text-black" />
                <span className="font-mono text-xs text-black tracking-wide">
                  {boomerMode
                    ? `${features.size} ${t('nav.active')}`
                    : `${features.size} ${t('nav.module', { count: features.size })}${features.size !== 1 ? 'S' : ''}`}
                </span>
              </button>
            ) : (
              <button onClick={() => navigate('/pricing')} className="font-mono text-xs text-[#6C665C] tracking-wide hover:text-black transition-colors">
                {boomerMode ? 'PRICING' : t('nav.upgradeLabelCodename')}
              </button>
            )}
          </span>
          {!location.startsWith('/world') && (
            <button
              onClick={() => {
                const next = !boomerMode;
                setBoomerMode(next);
                try { localStorage.setItem('sm_boomer', next ? '1' : '0'); } catch {}
              }}
              className={`font-mono text-xs tracking-wide px-2 py-0.5 rounded border transition-colors ${
                boomerMode
                  ? 'text-black border-black bg-[#F4EFE5]'
                  : 'text-[#777064] border-[#CFC6B7] hover:text-black'
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

      <div className="flex items-center px-4 h-12 bg-[#FAF7EF]">
        <nav className="flex items-center gap-1 shrink-0 ml-auto">
          <button
            onClick={goBack}
            aria-label="Back"
            title="Back"
            className="flex items-center justify-center w-8 h-8 rounded-md text-[#777064] hover:text-black hover:bg-[#EEE8DC] border border-transparent"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {visiblePrimary.filter(tab => !tab.authOnly || isAuthenticated).map(tab => {
            const active = isAppNavItemActive(tab, pathname);
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => navigate(tab.id === 'office' ? (consumeAppReturnPath() ?? tab.path) : tab.path)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-mono tracking-widest uppercase transition-colors border ${
                  active
                    ? 'bg-black text-[#FAF7EF] border-black'
                    : 'text-[#5F594F] border-transparent hover:text-black hover:bg-[#EEE8DC]'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {tab.id === 'org' ? (userOrg?.name ?? 'ORG') : tab.label}
              </button>
            );
          })}

          <div className="relative" ref={moreRef}>
            <button
              onClick={() => setMoreOpen(open => !open)}
              className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-mono tracking-widest uppercase transition-colors border ${
                hasActiveMore || moreOpen
                  ? 'bg-black text-[#FAF7EF] border-black'
                  : 'text-[#5F594F] border-transparent hover:text-black hover:bg-[#EEE8DC]'
              }`}
            >
              MORE
              <ChevronDown className={`w-2.5 h-2.5 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
              {commsCount > 0 && !moreOpen && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center text-[9px] font-bold bg-black text-white rounded-full px-1 border border-[#FAF7EF]">
                  {commsCount > 99 ? '99+' : commsCount}
                </span>
              )}
            </button>
            {moreOpen && createPortal(
              <div ref={morePanelRef} className="fixed w-52 bg-[#FFFCF5] border border-[#D8D1C3] rounded-lg shadow-xl py-1 z-[9999]" style={{ top: morePos.top, right: morePos.right }}>
                {moreItems.filter(item => !item.authOnly || isAuthenticated).sort((a, b) => b.label.length - a.label.length).map(item => {
                  const active = isAppNavItemActive(item, pathname);
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => { navigate(item.path); setMoreOpen(false); }}
                      className={`flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors ${
                        active ? 'bg-black text-[#FAF7EF]' : 'text-[#5F594F] hover:bg-[#EEE8DC] hover:text-black'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="text-xs font-mono tracking-widest uppercase">{item.label}</span>
                      {item.id === 'comms' && commsCount > 0 && (
                        <span className="ml-auto min-w-[16px] h-4 flex items-center justify-center text-[9px] font-bold bg-black text-white rounded-full px-1">
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

          <div className="ml-2 pl-2 flex items-center gap-2 border-l border-[#D8D1C3]">
            <PabloNavButton />
            {isAuthenticated && isTutorialDone() && <HummingbirdNavButton />}
            {isAuthenticated && <NotificationBell />}
            <button
              onClick={() => navigate('/alpha')}
              title="Tester Program — apply for alpha access"
              className="p-1.5 text-[#8B8376] hover:text-black transition-colors rounded-md hover:bg-[#EEE8DC]"
            >
              <FlaskConical className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setShowFeedback(true)}
              title="Report an issue"
              className="p-1.5 text-[#8B8376] hover:text-black transition-colors rounded-md hover:bg-[#EEE8DC]"
            >
              <Bug className="w-3.5 h-3.5" />
            </button>
            {isLoading ? (
              <div className="w-7 h-7 rounded-md bg-[#EEE8DC] animate-pulse" />
            ) : isAuthenticated && user ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate('/profile')}
                  className="flex items-center gap-2 hover:opacity-70 transition-opacity"
                  title="My account"
                >
                  {resolveAvatarUrl(user.profileImageUrl) ? (
                    <img
                      src={resolveAvatarUrl(user.profileImageUrl)}
                      alt={user.firstName ?? 'User'}
                      className="w-7 h-7 rounded-md object-cover border border-[#D8D1C3]"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-md flex items-center justify-center font-mono text-sm bg-[#EEE8DC] border border-[#D8D1C3] text-black">
                      {(user.firstName?.[0] ?? user.email?.[0] ?? '?').toUpperCase()}
                    </div>
                  )}
                  <div className="hidden sm:flex flex-col items-end gap-1">
                    <p className="text-xs font-mono text-black leading-none">
                      {user.firstName ?? (streamerMode ? 'STREAMER' : user.email?.split('@')[0]) ?? 'USER'}
                    </p>
                    {roleBadge && (
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-widest uppercase border border-black ${roleBadge.cls}`}>
                        {roleBadge.label}
                      </span>
                    )}
                  </div>
                </button>
                <button
                  onClick={logout}
                  title={t('nav.logout')}
                  className="p-1.5 text-[#8B8376] hover:text-black transition-colors rounded-md hover:bg-[#EEE8DC]"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => login()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono tracking-widest uppercase text-black border border-[#CFC6B7] bg-[#FFFCF5] hover:bg-[#EEE8DC] transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                {t('nav.login')}
              </button>
            )}
          </div>
        </nav>
      </div>

      {currentModule && shouldShowModuleSubnav(currentModule.id, currentModule.subs.length, pathname) && (
        <div className="flex items-center gap-1 px-4 py-1.5 border-t border-[#E5DED1] bg-[#FFFCF5] overflow-x-auto scrollbar-hide">
          <span className="font-mono text-xs text-[#8B8376] tracking-widest uppercase mr-2 shrink-0">
            {boomerMode ? t(`nav.${currentModule.id}`, currentModule.label) : t(`codenames.${currentModule.id}`, currentModule.codename)}
          </span>
          {currentModule.subs.map(sub => {
            const isSubActive = pathname === sub.path;
            const Icon = sub.icon;
            return (
              <button
                key={sub.id}
                onClick={() => navigate(sub.path)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono tracking-widest uppercase transition-colors shrink-0 border ${
                  isSubActive
                    ? 'bg-black text-[#FAF7EF] border-black'
                    : 'text-[#777064] hover:text-black hover:bg-[#EEE8DC] border-transparent'
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
            className="ml-auto p-1 rounded text-[#8B8376] hover:text-black hover:bg-[#EEE8DC] transition-colors shrink-0"
          >
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      )}

      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
    </header>
  );
}
