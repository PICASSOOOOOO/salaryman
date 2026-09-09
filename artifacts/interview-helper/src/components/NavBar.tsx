import { LogIn, LogOut, ChevronDown, ExternalLink, ArrowLeft, Search, Menu } from 'lucide-react';
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
import { MODULES, getModuleForPath } from '../lib/modules';
import { LanguageSelector } from './LanguageSelector';
import { CurrencySelector } from './CurrencySelector';
import { NotificationBell } from './NotificationBell';
import { TowerLocationBadge } from './TowerLocationBadge';
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
  const { config } = useAppMode();
  const streamerMode = useStreamerMode();
  const { isOwner } = usePlan();
  const { isApprovedTester, isApprovedDev, isAdmin } = useAlpha();
  const roleBadge = isAdmin || isApprovedDev
    ? { label: 'ADMIN', cls: 'bg-black text-[#00FF41]' }
    : isApprovedTester
      ? { label: 'MOD', cls: 'bg-black text-white' }
      : null;
  const { total: commsCount } = useCommsSummary();
  const { org: userOrg } = useOrg();
  const { label: featureLabel } = useFeatureLabel();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const morePanelRef = useRef<HTMLDivElement>(null);
  const [morePos, setMorePos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const { t } = useTranslation();

  const pathname = location.split('?')[0];
  const currentModule = getModuleForPath(pathname);
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
    return t(`labels.${sub.id}`, sub.boomerLabel);
  };

  return (
    <header className="desktop-app-nav flex flex-col border-b border-[#D8D1C3] bg-[#FAF7EF] shrink-0 z-50">
      {/* Old-version identity strip, translated to the cream browser system. */}
      <div className="flex items-center justify-between px-4 h-12">
        <div className="flex items-center gap-6">
          <div
            className="flex items-center gap-2 cursor-pointer group"
            onClick={() => navigate(getAppHomePath(isAuthenticated))}
          >
            <div className="w-6 h-6 bg-black text-[#FAFAF7] flex items-center justify-center rounded">
              <PicassoLogo size={16} gap={1} />
            </div>
            <span className="font-bold text-sm tracking-tight text-black">{config.name.toUpperCase()}</span>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#6C665C]">
            <span>Business operating system</span>
            <span className="text-[#B9B1A2]">◆</span>
            <button onClick={() => navigate('/pledge')} className="hover:text-black">Pledge store</button>
            <button onClick={() => navigate('/feedback')} className="hover:text-black">Feedback</button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isAuthenticated && <TowerLocationBadge />}

          <div className="flex items-center gap-2 pl-3 border-l border-gray-200">
            {isAuthenticated && <NotificationBell />}

            {isLoading ? (
              <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse" />
            ) : isAuthenticated && user ? (
              <div className="flex items-center gap-3">
                <button onClick={() => navigate('/profile')} className="flex items-center gap-2 text-left group">
                  <div className="flex flex-col items-end">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-black group-hover:text-gray-600 transition-colors">
                      {user.firstName ?? (streamerMode ? 'STREAMER' : user.email?.split('@')[0]) ?? 'USER'}
                    </span>
                    {roleBadge && (
                      <span className={`text-[9px] font-bold px-1 rounded ${roleBadge.cls}`}>
                        {roleBadge.label}
                      </span>
                    )}
                  </div>
                  {resolveAvatarUrl(user.profileImageUrl) ? (
                    <img src={resolveAvatarUrl(user.profileImageUrl)} alt="Avatar" className="w-8 h-8 rounded-md object-cover border border-gray-200" />
                  ) : (
                    <div className="w-8 h-8 rounded-md bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 border border-gray-200">
                      {(user.firstName?.[0] ?? user.email?.[0] ?? '?').toUpperCase()}
                    </div>
                  )}
                </button>
                <button onClick={logout} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button onClick={() => login()} className="flex items-center gap-2 bg-black text-white px-4 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider hover:bg-gray-800 transition-colors">
                <LogIn className="w-3.5 h-3.5" />
                START WORK
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Old-version primary destination row. */}
      <div className="flex h-10 items-center border-t border-[#E5DED1] bg-[#F4EFE5] px-4">
        <button
          onClick={goBack}
          className="mr-2 flex h-7 w-7 items-center justify-center rounded text-[#777064] transition-colors hover:bg-[#E8E1D4] hover:text-black"
          aria-label="Back"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <nav className="flex items-center gap-1">
          {visiblePrimary.filter(tab => !tab.authOnly || isAuthenticated).map(tab => {
            const active = isAppNavItemActive(tab, pathname);
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => navigate(tab.id === 'office' ? (consumeAppReturnPath() ?? tab.path) : tab.path)}
                className={`relative flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] transition-colors ${
                  active
                    ? 'border-black bg-black text-[#FAF7EF]'
                    : 'border-transparent text-[#5F594F] hover:border-[#CFC6B7] hover:bg-[#FFFCF5] hover:text-black'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.id === 'org' ? (userOrg?.name ?? 'ORG') : tab.label}
              </button>
            );
          })}

          <div className="relative" ref={moreRef}>
            <button
              onClick={() => setMoreOpen(open => !open)}
              className={`flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] transition-colors ${
                hasActiveMore || moreOpen
                  ? 'border-black bg-black text-[#FAF7EF]'
                  : 'border-transparent text-[#5F594F] hover:border-[#CFC6B7] hover:bg-[#FFFCF5] hover:text-black'
              }`}
            >
              MORE
              <ChevronDown className={`h-2.5 w-2.5 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
              {commsCount > 0 && !moreOpen && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-black px-1 text-[8px] text-white">
                  {commsCount > 99 ? '99+' : commsCount}
                </span>
              )}
            </button>
            {moreOpen && createPortal(
              <div ref={morePanelRef} className="fixed z-[9999] w-52 rounded-lg border border-[#D8D1C3] bg-[#FFFCF5] py-1 shadow-xl" style={{ top: morePos.top, right: morePos.right }}>
                {moreItems.filter(item => !item.authOnly || isAuthenticated).map(item => {
                  const active = isAppNavItemActive(item, pathname);
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => { navigate(item.path); setMoreOpen(false); }}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] transition-colors ${
                        active ? 'bg-black text-[#FAF7EF]' : 'text-[#5F594F] hover:bg-[#F0EADF] hover:text-black'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                      {item.id === 'comms' && commsCount > 0 && (
                        <span className="ml-auto rounded-full bg-black px-1.5 py-0.5 text-[8px] text-white">
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
        </nav>
      </div>

      {/* Secondary Bar (Subnav) */}
      {currentModule && shouldShowModuleSubnav(currentModule.id, currentModule.subs.length, pathname) && (
        <div className="flex items-center px-4 h-10 border-t border-[#E5E5E5] overflow-x-auto hide-scrollbar">
          <div className="flex items-center gap-1 font-medium">
            {currentModule.subs.map(sub => {
              const isSubActive = pathname === sub.path || pathname.startsWith(sub.path + '/');
              const Icon = sub.icon;
              return (
                <button
                  key={sub.id}
                  onClick={() => navigate(sub.path)}
                  className={`flex items-center gap-2 px-3 py-1.5 text-[10px] uppercase tracking-widest rounded-md transition-colors whitespace-nowrap ${
                    isSubActive ? 'bg-white shadow-sm border border-gray-200 text-black font-bold' : 'text-gray-500 hover:text-black hover:bg-gray-100'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isSubActive ? 'salaryman-active-icon' : ''}`} />
                  {getSubLabel(sub)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
}
