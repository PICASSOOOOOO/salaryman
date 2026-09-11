import { useLocation } from 'wouter';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { User, ChevronDown, ArrowLeft, WalletCards, X, Languages, Coins, Menu, MoreHorizontal, Settings, Briefcase, Download } from 'lucide-react';
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

export function MobileModuleNav() {
  const [location, navigate] = useLocation();
  const { isAuthenticated, user, login } = useAuth();
  const { total: commsCount } = useCommsSummary();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);

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
  const dropdownItems = MORE_NAV_ITEMS.filter(item => !item.authOnly || isAuthenticated);

  return (
    <>
      {/* Top Bar for Context (Logo, Back, Account) */}
      <div
        className="mobile-app-nav-top fixed top-0 left-0 right-0 border-b border-[#E5E5E5] flex items-center justify-between px-2 z-50"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)', minHeight: 'calc(3.5rem + env(safe-area-inset-top, 0px))' }}
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
        <div className="flex items-center gap-1.5 shrink-0">
          {isAuthenticated && <NotificationBell />}
          {isAuthenticated ? (
            <button onClick={() => setSummaryOpen(true)} className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-200 overflow-hidden">
              {resolveAvatarUrl(user?.profileImageUrl) ? (
                <img src={resolveAvatarUrl(user?.profileImageUrl)} alt="User" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gray-200 text-gray-500 flex items-center justify-center text-[10px] font-bold">
                  {(user?.firstName?.[0] ?? user?.email?.[0] ?? '?').toUpperCase()}
                </div>
              )}
            </button>
          ) : (
            <button onClick={() => login()} className="text-[10px] font-bold uppercase bg-black text-[#FAFAF7] px-3 py-1.5 rounded">
              LOG IN
            </button>
          )}
        </div>
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
            className="bg-white rounded-t-xl pb-[calc(env(safe-area-inset-bottom,0px)+4rem)] pt-2 px-4 shadow-xl"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-100">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Features</span>
              <button onClick={() => setDropdownOpen(false)} className="p-2"><X className="w-5 h-5 text-gray-400" /></button>
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

      {/* Account Summary Modal Placeholder */}
      {summaryOpen && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40" onClick={() => setSummaryOpen(false)}>
           <div className="bg-white p-6 rounded-xl w-[90%] max-w-sm" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-2">
                <h3 className="font-bold uppercase text-xs tracking-widest">Account Summary</h3>
                <button onClick={() => setSummaryOpen(false)}><X className="w-4 h-4 text-gray-400" /></button>
              </div>
              <div className="flex flex-col gap-2">
                 <button onClick={() => { setSummaryOpen(false); navigate('/profile'); }} className="p-3 bg-gray-50 font-bold text-[10px] tracking-widest uppercase rounded flex items-center gap-2"><User className="w-4 h-4" /> Profile</button>
                 <button onClick={() => { setSummaryOpen(false); navigate('/settings'); }} className="p-3 bg-gray-50 font-bold text-[10px] tracking-widest uppercase rounded flex items-center gap-2"><Settings className="w-4 h-4" /> Settings</button>
                 <button onClick={() => { setSummaryOpen(false); navigate('/business'); }} className="p-3 bg-gray-50 font-bold text-[10px] tracking-widest uppercase rounded flex items-center gap-2"><Briefcase className="w-4 h-4" /> Company</button>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center gap-2 text-xs"><Languages className="w-4 h-4" /><LanguageSelector /></div>
                <div className="flex items-center gap-2 text-xs"><Coins className="w-4 h-4" /><CurrencySelector /></div>
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

  useEffect(() => {
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
