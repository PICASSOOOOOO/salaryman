import { useLocation } from 'wouter';
import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, X, Menu, MoreHorizontal } from 'lucide-react';
import { MODULES, getModuleForPath } from '../lib/modules';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/use-auth';
import { useCommsSummary } from '../hooks/use-comms-summary';
import { useFeatureLabel } from '../hooks/use-feature-label';
import { MiniNebula } from './MiniNebula';
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

export function MobileModuleNav() {
  const [location, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const { total: commsCount } = useCommsSummary();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    if (!dropdownOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDropdownOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [dropdownOpen]);

  const pathname = location.split('?')[0];
  const isHome = pathname === "/";
  const goBack = () => {
    if (canGoBackInApp()) window.history.back();
    else navigate(consumeAppReturnPath() ?? getAppBackPath(isAuthenticated), { replace: true });
  };

  const visibleTabs = PRIMARY_NAV_ITEMS.filter(tab => !tab.authOnly || isAuthenticated);
  const dropdownItems = [...PRIMARY_NAV_ITEMS, ...MORE_NAV_ITEMS]
    .filter(item => !item.authOnly || isAuthenticated)
    .filter((item, index, items) => items.findIndex(candidate => candidate.id === item.id) === index);

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
          <button
            type="button"
            onClick={() => setDropdownOpen(open => !open)}
            className={`mobile-menu-trigger${dropdownOpen ? ' is-open' : ''}`}
            aria-expanded={dropdownOpen}
            aria-controls="mobile-features-menu"
            aria-label={dropdownOpen ? 'Close menu' : 'Open menu'}
            title={dropdownOpen ? 'Close menu' : 'Open menu'}
          >
            {dropdownOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            <span>MENU</span>
          </button>
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
                aria-label={tab.label}
                title={tab.label}
                className={`flex min-h-10 items-center gap-2 rounded-md px-3 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                  active
                    ? 'bg-[#EAF8EF] text-[#0B6B3A]'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="desktop-primary-label whitespace-nowrap">{tab.label}</span>
                {tab.id === 'comms' && commsCount > 0 && (
                  <span className="flex min-w-[17px] items-center justify-center rounded-full bg-[#D9534F] px-1 text-[9px] leading-[17px] text-white">
                    {commsCount > 99 ? '99+' : commsCount}
                  </span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setDropdownOpen(open => !open)}
            className={`flex min-h-10 items-center gap-2 rounded-md px-3 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
              dropdownOpen
                ? 'bg-slate-900 text-white'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
            }`}
            aria-expanded={dropdownOpen}
            aria-controls="mobile-features-menu"
            aria-label="Features"
            title="Features"
          >
            <MoreHorizontal className="h-4 w-4" />
            <span className="desktop-primary-label whitespace-nowrap">FEATURES</span>
          </button>
        </nav>
      </div>

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
                <span className="text-[8px] font-bold uppercase tracking-wider">{tab.label}</span>
                {tab.id === 'comms' && commsCount > 0 && (
                  <span className="absolute top-1 right-2 min-w-[14px] h-[14px] flex items-center justify-center text-[8px] font-bold bg-[#00FF41] text-black rounded-full shadow-sm">
                    {commsCount > 99 ? '99+' : commsCount}
                  </span>
                )}
              </button>
            );
          })}

          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${
              dropdownOpen ? 'text-black' : 'text-gray-400'
            }`}
          >
            <MoreHorizontal className="w-5 h-5" />
            <span className="text-[8px] font-bold uppercase tracking-wider">FEATURES</span>
          </button>
        </div>
      </div>

      {/* More Overflow Menu Overlay */}
      {dropdownOpen && createPortal(
        <div
          className="fixed inset-0 bg-black/20 z-[9999] flex flex-col justify-end"
          role="presentation"
          onPointerDown={() => setDropdownOpen(false)}
        >
          <div
            id="mobile-features-menu"
            className="max-h-[min(82svh,42rem)] overflow-y-auto bg-white rounded-t-xl pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-2 px-4 shadow-xl"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-100">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Menu</span>
              <button onClick={() => setDropdownOpen(false)} className="p-2"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div
              role="button"
              tabIndex={0}
              onClick={() => { navigate('/pablo'); setDropdownOpen(false); }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  navigate('/pablo');
                  setDropdownOpen(false);
                }
              }}
              className="mb-2 flex cursor-pointer items-center gap-3 rounded-lg bg-black p-3 text-[#FAF7EF]"
              aria-label="Open Pablo nebula"
            >
              <MiniNebula size={38} status="idle" title="Open Pablo nebula" interactive={false} />
              <span className="min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-[0.16em]">PABLO PRIME</span>
                <span className="mt-0.5 block text-[9px] uppercase tracking-wider text-[#D8CBE6]">HIGH-RES NEBULA</span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {dropdownItems.map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => { navigate(item.path); setDropdownOpen(false); }}
                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg text-black hover:bg-gray-100"
                  >
                    <Icon className="w-5 h-5 text-gray-500" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body
      )}

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
