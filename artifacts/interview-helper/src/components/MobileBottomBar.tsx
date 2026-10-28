import { useLocation } from 'wouter';
import { useCallback, useState, useLayoutEffect } from 'react';
import { ArrowLeft, X, Menu, MoreHorizontal, LogIn } from 'lucide-react';
import { MODULES, getModuleForPath } from '../lib/modules';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/use-auth';
import { usePlan } from '@/hooks/use-plan';
import { useCommsSummary } from '../hooks/use-comms-summary';
import { useFeatureLabel } from '../hooks/use-feature-label';
import {
  PRIMARY_NAV_ITEMS,
  isAppNavItemActive,
  canGoBackInApp,
  getAppBackPath,
  consumeAppReturnPath,
  rememberAppReturnPath,
  shouldShowGlobalSignIn,
  shouldShowModuleSubnav,
} from '@/lib/app-navigation';
import { getBoomerAppLabel } from '@/lib/vocabulary';
import { WorkspaceMenuOverlay } from './WorkspaceMenuOverlay';

export function MobileModuleNav() {
  const [location, navigate] = useLocation();
  const { isAuthenticated, logout } = useAuth();
  const { isOwner } = usePlan();
  const { total: commsCount } = useCommsSummary();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const closeMenu = useCallback(() => setDropdownOpen(false), []);
  const navigateMenu = useCallback((path: string) => {
    navigate(path);
    setDropdownOpen(false);
  }, [navigate]);
  const signOutFromMenu = useCallback(() => {
    void logout();
    setDropdownOpen(false);
  }, [logout]);

  const pathname = location.split('?')[0];
  const isHome = pathname === "/";
  // Pablo's signed-out screen has its own "Start work" action. Keep the
  // shared sign-in action off that route so the two headers don't show
  // duplicate login controls.
  const showAnonymousSignIn = shouldShowGlobalSignIn(pathname, isAuthenticated);
  const goBack = () => {
    if (canGoBackInApp()) window.history.back();
    else navigate(consumeAppReturnPath() ?? getAppBackPath(isAuthenticated), { replace: true });
  };

  // The shared chrome is visible on public pages, but its workspace destinations
  // are not. Before sign-in, showing links that immediately bounce or expose
  // protected product areas makes the shell look broken and leaks navigation
  // structure. Pablo owns the public entry point; the rest of the workspace
  // becomes available after authentication.
  const visibleTabs = isAuthenticated
    ? PRIMARY_NAV_ITEMS.filter(tab => !tab.authOnly || isAuthenticated)
    : [];
  return (
    <>
      {/* One stable top bar: back, brand, and menu. Account actions live in the menu. */}
      <div
        className="mobile-app-nav-top fixed top-0 left-0 right-0 border-b border-[#E5E5E5] flex items-center justify-between px-2 z-50"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingLeft: 'calc(0.5rem + env(safe-area-inset-left, 0px))',
          paddingRight: 'calc(0.5rem + env(safe-area-inset-right, 0px))',
          minHeight: 'calc(3.5rem + env(safe-area-inset-top, 0px))',
        }}
      >
        <div className="flex items-center gap-1 overflow-hidden pr-2 min-w-0">
          <button
            type="button"
            onClick={goBack}
            aria-label="Go back"
            title="Go back"
            className="w-8 h-8 shrink-0 flex items-center justify-center text-gray-600 hover:bg-gray-200 rounded-md"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 rounded-sm px-1 py-1 text-left min-w-0 shrink"
            aria-label="SALARYMAN home"
          >
            <img
              src={`${import.meta.env.BASE_URL}icon-192.png`}
              alt=""
              className="h-5 w-5 shrink-0 rounded"
            />
            <span className="font-bold text-[10px] sm:text-xs uppercase tracking-widest text-black truncate">SALARYMAN</span>
          </button>
        </div>
        <div className="mobile-header-actions flex items-center shrink-0">
          {isAuthenticated ? (
            <button
              type="button"
              onClick={() => setDropdownOpen(open => !open)}
              className={`mobile-menu-trigger${dropdownOpen ? ' is-open' : ''}`}
              aria-expanded={dropdownOpen}
              aria-controls="workspace-navigation-menu"
              aria-label={dropdownOpen ? 'Close menu' : 'Open menu'}
              title={dropdownOpen ? 'Close menu' : 'Open menu'}
            >
              {dropdownOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              <span>MENU</span>
            </button>
          ) : showAnonymousSignIn ? (
            <button
              type="button"
              onClick={() => navigate(`/sign-in?returnTo=${encodeURIComponent(pathname)}`)}
              className="mobile-menu-trigger"
              aria-label="Sign in"
              title="Sign in"
            >
              <LogIn className="w-4 h-4" aria-hidden="true" />
              <span>SIGN IN</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Desktop keeps the same destination model, but uses the available
          horizontal space instead of placing a phone-sized bar over the
          bottom of the page. The mobile and desktop variants share the same
          active-route logic and overflow menu state. */}
      <div
        className="desktop-app-nav fixed top-0 left-0 right-0 z-50 items-center gap-4 border-b border-[#D8D1C3] bg-[#FAF7EF]"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
        }}
      >
        <button
          type="button"
          onClick={goBack}
          aria-label="Go back"
          title="Go back"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex min-w-0 shrink-0 items-center gap-2 rounded-sm px-1 py-1 text-left"
          aria-label="SALARYMAN home"
        >
          <img
            src={`${import.meta.env.BASE_URL}icon-192.png`}
            alt=""
            className="h-6 w-6 shrink-0 rounded"
          />
          <span className="truncate text-xs font-bold uppercase tracking-[0.18em] text-slate-900">SALARYMAN</span>
        </button>
        <nav className="flex min-w-0 flex-1 items-center justify-end gap-1" aria-label="Main navigation">
          {visibleTabs.map(tab => {
            const active = isAppNavItemActive(tab, pathname);
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setDropdownOpen(false);
                  navigate(tab.path);
                }}
                 aria-label={getBoomerAppLabel(tab.id, tab.boomerLabel ?? tab.label)}
                 title={getBoomerAppLabel(tab.id, tab.boomerLabel ?? tab.label)}
                className={`flex min-h-10 items-center gap-2 rounded-md px-3 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                  active
                    ? 'bg-[#EAF8EF] text-[#0B6B3A]'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                 <span className="desktop-primary-label whitespace-nowrap">{getBoomerAppLabel(tab.id, tab.boomerLabel ?? tab.label)}</span>
                {tab.id === 'comms' && commsCount > 0 && (
                  <span className="flex min-w-[17px] items-center justify-center rounded-full bg-[#D9534F] px-1 text-[9px] leading-[17px] text-white">
                    {commsCount > 99 ? '99+' : commsCount}
                  </span>
                )}
              </button>
            );
          })}
          {isAuthenticated ? (
            <button
              type="button"
              onClick={() => setDropdownOpen(open => !open)}
              className={`flex min-h-10 items-center gap-2 rounded-md px-3 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                dropdownOpen
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
              }`}
              aria-expanded={dropdownOpen}
              aria-controls="workspace-navigation-menu"
              aria-label="Features"
              title="Features"
            >
              <MoreHorizontal className="h-4 w-4" />
              <span className="desktop-primary-label whitespace-nowrap">MENU</span>
            </button>
          ) : showAnonymousSignIn ? (
            <button
              type="button"
              onClick={() => navigate(`/sign-in?returnTo=${encodeURIComponent(pathname)}`)}
              className="flex min-h-10 items-center rounded-md px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
              aria-label="Sign in"
              title="Sign in"
            >
              SIGN IN
            </button>
          ) : null}
        </nav>
      </div>

      {pathname === '/pablo' && (
        <div
          className="pablo-control-rail fixed left-0 right-0 z-[55] flex items-center justify-end border-b border-[#D8D1C3] bg-[#FAF7EF]"
          aria-label="Pablo controls"
          style={{
            top: 'calc(3.5rem + env(safe-area-inset-top, 0px))',
            minHeight: '3rem',
            backgroundColor: '#FAF7EF',
            paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))',
            paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))',
          }}
        >
          <div id="pablo-controls-rail" className="flex min-w-0 items-center justify-end gap-1.5" />
        </div>
      )}

      {/* Bottom Bar for Primary Navigation */}
      <div
        className="mobile-app-nav-bottom fixed bottom-0 left-0 right-0 border-t border-[#E5E5E5] z-50 bg-[#FAFAF7]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-center justify-around px-1 h-14">
          {visibleTabs.map(tab => {
            const active = isAppNavItemActive(tab, pathname);
            const Icon = tab.icon;
            const isDesktop = tab.id === 'office';
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setDropdownOpen(false);
                  navigate(tab.path);
                }}
                className={`relative flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${
                  active ? (isDesktop ? 'salaryman-active-icon' : 'text-black') : 'text-gray-400'
                }`}
              >
                <Icon className="w-5 h-5" />
                 <span className="text-[8px] font-bold uppercase tracking-wider">{getBoomerAppLabel(tab.id, tab.boomerLabel ?? tab.label)}</span>
                {tab.id === 'comms' && commsCount > 0 && (
                  <span className="absolute top-1 right-2 min-w-[14px] h-[14px] flex items-center justify-center text-[8px] font-bold bg-[#D9534F] text-white rounded-full shadow-sm">
                    {commsCount > 99 ? '99+' : commsCount}
                  </span>
                )}
              </button>
            );
          })}

          {isAuthenticated && (
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${
                dropdownOpen ? 'text-black' : 'text-gray-400'
              }`}
              aria-expanded={dropdownOpen}
              aria-controls="workspace-navigation-menu"
              aria-label={dropdownOpen ? 'Close menu' : 'Open menu'}
              title={dropdownOpen ? 'Close menu' : 'Open menu'}
            >
              <MoreHorizontal className="w-5 h-5" />
              <span className="text-[8px] font-bold uppercase tracking-wider">MENU</span>
            </button>
          )}
        </div>
      </div>

      <WorkspaceMenuOverlay
        open={isAuthenticated && dropdownOpen}
        pathname={pathname}
        canAccessStaff={isOwner}
        onClose={closeMenu}
        onNavigate={navigateMenu}
        onSignOut={signOutFromMenu}
      />

    </>
  );
}

export function MobileSubNav() {
  const [location, navigate] = useLocation();
  const pathname = location.split('?')[0];
  const currentModule = getModuleForPath(pathname);
  const { label: featureLabel } = useFeatureLabel();
  const { t } = useTranslation();

  useLayoutEffect(() => {
    if (currentModule && shouldShowModuleSubnav(currentModule.id, currentModule.subs.length, pathname)) {
      document.body.classList.add('has-subnav');
    } else {
      document.body.classList.remove('has-subnav');
    }
    return () => document.body.classList.remove('has-subnav');
  }, [currentModule, pathname]);

  if (!currentModule || !shouldShowModuleSubnav(currentModule.id, currentModule.subs.length, pathname)) return null;

  return (
    <div
      className="mobile-app-subnav fixed left-0 right-0 h-10 border-b border-[#E5E5E5] z-40 overflow-x-auto hide-scrollbar flex items-center px-2"
      style={{ top: 'calc(3.5rem + env(safe-area-inset-top, 0px))' }}
    >
      <div className="flex items-center gap-1">
        {currentModule.subs.map(sub => {
          const isActive = pathname === sub.path || pathname.startsWith(sub.path + '/');
          const Icon = sub.icon;
          const label = sub.id === 'classroom' ? featureLabel.toUpperCase() : t(`labels.${sub.id}`, sub.boomerLabel);
          return (
            <button
              key={sub.id}
              onClick={() => navigate(sub.path)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest rounded-md whitespace-nowrap transition-colors ${
                isActive ? 'bg-white border border-gray-200 text-black shadow-sm' : 'text-gray-500 hover:text-black'
              }`}
            >
              <Icon className={`w-3 h-3 ${isActive ? 'salaryman-active-icon' : ''}`} />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function MobileBottomBar() {
  return null;
}
