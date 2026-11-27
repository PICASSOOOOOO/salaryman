import { useLocation } from 'wouter';
import { useLayoutEffect } from 'react';
import { AppBrand } from './AppBrand';
import { StartWorkMenu } from './StartWorkMenu';
import { getModuleForPath } from '../lib/modules';
import { useTranslation } from 'react-i18next';
import { useFeatureLabel } from '../hooks/use-feature-label';
import { shouldShowModuleSubnav } from '@/lib/app-navigation';
import './AppHeader.css';

export function MobileModuleNav() {
  const [location, navigate] = useLocation();
  const pathname = location.split('?')[0];
  return (
    <>
      <div
        className="mobile-app-nav-top fixed top-0 left-0 right-0 border-b border-[#E5E5E5] flex items-center justify-between gap-3 px-3 z-50"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingLeft: 'calc(0.75rem + env(safe-area-inset-left, 0px))',
          paddingRight: 'calc(0.75rem + env(safe-area-inset-right, 0px))',
          minHeight: 'calc(3.5rem + env(safe-area-inset-top, 0px))',
        }}
      >
        <AppBrand />
        <StartWorkMenu />
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
          const organizationAlias = sub.id === 'org' && (pathname === '/org' || pathname.startsWith('/org/'));
          const isActive = pathname === sub.path || pathname.startsWith(sub.path + '/') || organizationAlias;
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
