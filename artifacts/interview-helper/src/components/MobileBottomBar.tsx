import { useLocation } from 'wouter';
import { useState, useEffect, useRef } from 'react';
import { Globe, User, Building2 } from 'lucide-react';
import { MODULES, getModuleForPath } from '../lib/modules';
import { getDefaultBoomerMode } from '../hooks/use-mobile';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@workspace/replit-auth-web';

export function MobileSubNav() {
  const [location, navigate] = useLocation();
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());
  const scrollRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'sm_boomer') setBoomerMode(e.newValue === '1'); };
    window.addEventListener('storage', onStorage);
    const id = setInterval(() => { try { setBoomerMode(localStorage.getItem('sm_boomer') === '1'); } catch {} }, 2000);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(id); };
  }, []);

  const pathname = location.split('?')[0];
  const currentModule = getModuleForPath(pathname);

  if (!currentModule || currentModule.subs.length === 0) return null;

  return (
    <div className="sm:hidden bg-[#0a0a0b] border-b border-white/[0.06] overflow-hidden">
      <div
        ref={scrollRef}
        className="flex items-center gap-1.5 px-3 py-2 overflow-x-auto scrollbar-hide"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {currentModule.subs.map(sub => {
          const isActive = pathname === sub.path || pathname.startsWith(sub.path + '/');
          const Icon = sub.icon;
          const label = boomerMode
            ? t(`labels.${sub.id}`, sub.boomerLabel)
            : t(`codenames.${sub.id}`, sub.codename);
          return (
            <button
              key={sub.id}
              onClick={() => navigate(sub.path)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-mono tracking-widest uppercase transition-colors shrink-0 ${
                isActive
                  ? 'bg-sky-500/15 text-sky-400 border border-sky-500/25'
                  : 'text-zinc-500 border border-white/[0.06] hover:text-zinc-300'
              }`}
            >
              <Icon className="w-3 h-3 shrink-0" />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const BOTTOM_NAV_MODULES = ['pablo', 'phone', 'bots', 'console', 'business'];

export function MobileModuleNav() {
  const [location, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());
  const { t } = useTranslation();

  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'sm_boomer') setBoomerMode(e.newValue === '1'); };
    window.addEventListener('storage', onStorage);
    const id = setInterval(() => { try { setBoomerMode(localStorage.getItem('sm_boomer') === '1'); } catch {} }, 2000);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(id); };
  }, []);

  const pathname = location.split('?')[0];

  if (pathname.startsWith('/world')) return null;

  const isModuleActive = (mod: typeof MODULES[0]) => {
    if (mod.id === 'pablo') return pathname === '/';
    if (mod.id === 'console') return pathname === '/console' || pathname.startsWith('/console/');
    return pathname.startsWith(mod.path + '/') || pathname === mod.path;
  };

  const bottomModules = MODULES.filter(m => BOTTOM_NAV_MODULES.includes(m.id));

  return (
    <div className="sm:hidden bg-[#0a0a0b]/98 backdrop-blur-md border-b border-white/[0.08]">
      <div className="flex items-center justify-around px-1 h-11">
        {bottomModules.map(mod => {
          const active = isModuleActive(mod);
          const Icon = mod.icon;
          const label = boomerMode
            ? t(`nav.${mod.id}`, mod.label)
            : mod.label;
          return (
            <button
              key={mod.id}
              onClick={() => navigate(mod.defaultPath)}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-md transition-colors touch-manipulation ${
                active
                  ? 'text-sky-400'
                  : 'text-zinc-600 active:text-zinc-400'
              }`}
            >
              <Icon className={`w-4 h-4 ${active ? 'text-sky-400' : ''}`} />
              <span className={`text-[7px] font-mono tracking-wider uppercase leading-none ${active ? 'text-sky-400' : ''}`}>
                {label.length > 8 ? label.slice(0, 7) : label}
              </span>
            </button>
          );
        })}
        {isAuthenticated && (
          <button
            onClick={() => navigate('/bots/office')}
            className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-md transition-colors touch-manipulation ${
              pathname === '/bots/office'
                ? 'text-amber-400'
                : 'text-zinc-600 active:text-zinc-400'
            }`}
          >
            <Building2 className={`w-4 h-4 ${pathname === '/bots/office' ? 'text-amber-400' : ''}`} />
            <span className={`text-[7px] font-mono tracking-wider uppercase leading-none ${pathname === '/bots/office' ? 'text-amber-400' : ''}`}>
              OFFICE
            </span>
          </button>
        )}
        <button
          onClick={() => navigate('/world')}
          className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-md transition-colors touch-manipulation ${
            pathname.startsWith('/world')
              ? 'text-sky-400'
              : 'text-zinc-600 active:text-zinc-400'
          }`}
        >
          <Globe className={`w-4 h-4 ${pathname.startsWith('/world') ? 'text-sky-400' : ''}`} />
          <span className={`text-[7px] font-mono tracking-wider uppercase leading-none ${pathname.startsWith('/world') ? 'text-sky-400' : ''}`}>
            EXPLORE
          </span>
        </button>
        <button
          onClick={() => navigate('/profile')}
          className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-md transition-colors touch-manipulation ${
            pathname.startsWith('/profile')
              ? 'text-sky-400'
              : 'text-zinc-600 active:text-zinc-400'
          }`}
        >
          <User className={`w-4 h-4 ${pathname.startsWith('/profile') ? 'text-sky-400' : ''}`} />
          <span className={`text-[7px] font-mono tracking-wider uppercase leading-none ${pathname.startsWith('/profile') ? 'text-sky-400' : ''}`}>
            {isAuthenticated ? 'PROFILE' : 'LOGIN'}
          </span>
        </button>
      </div>
    </div>
  );
}

export function MobileBottomBar() {
  return null;
}
