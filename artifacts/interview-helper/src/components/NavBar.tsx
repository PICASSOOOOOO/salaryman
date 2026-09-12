import {
  ChevronDown,
  Download,
  Globe,
  LogIn,
  LogOut,
  Menu,
  Phone,
  Sparkles,
  User,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { HISTORIC_MODULES } from '@/lib/historic-navigation';
import { FeedbackLauncher } from './FeedbackLauncher';

const MENU_MODULES = HISTORIC_MODULES.filter(
  module => module.id !== 'pablo' && module.id !== 'phone',
);

export function NavBar({ previewMode = false }: { previewMode?: boolean } = {}) {
  const [location, navigate] = useLocation();
  const { isAuthenticated, login, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(previewMode);
  const pathname = location.split('?')[0];

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  const go = (path: string) => {
    if (!previewMode) navigate(path);
    setMenuOpen(false);
  };

  const directLinks = [
    { label: 'PABLO AI', path: '/pablo', icon: Sparkles },
    {
      label: 'CALLL HOME',
      path: '/phone',
      icon: Phone,
      logoSrc: `${import.meta.env.BASE_URL}brand/callhome/calll-home-logo-2.png`,
    },
    { label: 'APP DOWNLOAD', path: '/desktop', icon: Download },
  ];

  return (
    <header className="app-header desktop-app-nav relative z-50 shrink-0 border-b border-[#D8D1C3] bg-[#FAF7EF]">
      <div className="flex h-14 items-center justify-between gap-3 px-3 sm:px-4">
        <button
          type="button"
          onClick={() => go('/')}
          className="flex shrink-0 items-center gap-2.5"
          aria-label="SALARYMAN home"
        >
          <img
            src={`${import.meta.env.BASE_URL}icon-192.png`}
            alt=""
            className="h-7 w-7 rounded-md"
          />
          <span className="font-mono text-sm tracking-[0.2em] text-black">SALARYMAN</span>
          <span className="border border-black px-1.5 py-0.5 font-mono text-[8px] tracking-[0.12em] text-black">
            ALPHA {typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : 'DEV'}
          </span>
        </button>

        <nav className="hidden items-center gap-1 sm:flex" aria-label="Main navigation">
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen(open => !open)}
              className={`flex items-center gap-1.5 rounded-md border px-3 py-2 font-mono text-[11px] tracking-widest ${
                menuOpen
                  ? 'border-black bg-black text-[#FAF7EF]'
                  : 'border-[#CFC6B7] bg-[#FFFCF5] text-black hover:bg-[#EEE8DC]'
              }`}
              aria-expanded={menuOpen}
            >
              <Menu className="h-3.5 w-3.5" />
              MORE
              <ChevronDown className={`h-3 w-3 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
            </button>

            {menuOpen && (
              <div className="absolute left-0 top-[calc(100%+0.5rem)] w-[min(720px,calc(100vw-2rem))] border border-black bg-[#FFFCF5] p-3 shadow-[6px_6px_0_#000]">
                <div className="grid gap-4 md:grid-cols-2">
                  {MENU_MODULES.map(module => {
                    const ModuleIcon = module.icon;
                    return (
                      <section key={module.id}>
                        <button
                          type="button"
                          onClick={() => go(module.defaultPath)}
                          className="flex w-full items-center gap-2 border-b border-[#D8D1C3] pb-2 text-left font-mono text-[11px] tracking-widest text-black hover:opacity-60"
                        >
                          <ModuleIcon className="h-3.5 w-3.5" />
                          {module.label}
                        </button>
                        <div className="mt-1 grid grid-cols-2 gap-1">
                          {module.subs.map(sub => {
                            const SubIcon = sub.icon;
                            return (
                              <button
                                type="button"
                                key={sub.id}
                                onClick={() => go(sub.path)}
                                className="flex items-center gap-1.5 rounded px-2 py-1.5 text-left font-mono text-[9px] tracking-wide text-[#5F594F] hover:bg-[#EEE8DC] hover:text-black"
                              >
                                <SubIcon className="h-3 w-3 shrink-0" />
                                {sub.boomerLabel}
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#D8D1C3] pt-3">
                  <button
                    type="button"
                    onClick={() => go('/world')}
                    className="flex items-center gap-1.5 border border-[#CFC6B7] px-2.5 py-1.5 font-mono text-[10px] tracking-widest hover:bg-[#EEE8DC]"
                  >
                    <Globe className="h-3 w-3" />
                    EXPLORE
                  </button>
                  {isAuthenticated ? (
                    <>
                      <button
                        type="button"
                        onClick={() => go('/profile')}
                        className="flex items-center gap-1.5 border border-[#CFC6B7] px-2.5 py-1.5 font-mono text-[10px] tracking-widest hover:bg-[#EEE8DC]"
                      >
                        <User className="h-3 w-3" />
                        ACCOUNT
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!previewMode) logout();
                          setMenuOpen(false);
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 font-mono text-[10px] tracking-widest text-[#6C665C] hover:text-black"
                      >
                        <LogOut className="h-3 w-3" />
                        LOG OUT
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (!previewMode) login();
                        setMenuOpen(false);
                      }}
                      className="flex items-center gap-1.5 border border-[#CFC6B7] px-2.5 py-1.5 font-mono text-[10px] tracking-widest hover:bg-[#EEE8DC]"
                    >
                      <LogIn className="h-3 w-3" />
                      LOG IN
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {directLinks.map(item => {
            const Icon = item.icon;
            const active = pathname === item.path || pathname.startsWith(`${item.path}/`);
            return (
              <button
                type="button"
                key={item.path}
                onClick={() => go(item.path)}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-2 font-mono text-[11px] tracking-widest ${
                  active
                    ? 'border-black bg-black text-[#FAF7EF]'
                    : 'border-[#CFC6B7] bg-[#FFFCF5] text-black hover:bg-[#EEE8DC]'
                }`}
              >
                {item.logoSrc ? (
                  <img
                    src={item.logoSrc}
                    alt=""
                    className="h-5 w-[4.25rem] object-contain object-left invert"
                  />
                ) : (
                  <Icon className="h-3.5 w-3.5" />
                )}
                {item.label}
              </button>
            );
          })}
          {isAuthenticated && <FeedbackLauncher />}
        </nav>
      </div>
    </header>
  );
}