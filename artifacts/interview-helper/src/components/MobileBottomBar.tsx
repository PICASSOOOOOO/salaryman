import { useLocation } from 'wouter';
import { useState, useEffect, useRef } from 'react';
import { MODULES, getModuleForPath } from '../lib/modules';
import { getDefaultBoomerMode } from '../hooks/use-mobile';

export function MobileSubNav() {
  const [location, navigate] = useLocation();
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());
  const scrollRef = useRef<HTMLDivElement>(null);

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
          return (
            <button
              key={sub.id}
              onClick={() => navigate(sub.path)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-mono tracking-widest uppercase transition-colors shrink-0 ${
                isActive
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                  : 'text-zinc-500 border border-white/[0.06] hover:text-zinc-300'
              }`}
            >
              <Icon className="w-3 h-3 shrink-0" />
              {boomerMode ? sub.boomerLabel : sub.codename}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function MobileModuleNav() {
  const [location, navigate] = useLocation();
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'sm_boomer') setBoomerMode(e.newValue === '1'); };
    window.addEventListener('storage', onStorage);
    const id = setInterval(() => { try { setBoomerMode(localStorage.getItem('sm_boomer') === '1'); } catch {} }, 2000);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(id); };
  }, []);

  const pathname = location.split('?')[0];

  const isModuleActive = (mod: typeof MODULES[0]) => {
    if (mod.id === 'pablo') return pathname === '/';
    if (mod.id === 'console') return pathname === '/console' || pathname.startsWith('/console/');
    return pathname.startsWith(mod.path + '/') || pathname === mod.path;
  };

  return (
    <div className="sm:hidden bg-[#0a0a0b] border-b border-white/[0.06] overflow-hidden">
      <div
        className="flex items-center gap-1 px-3 py-2 overflow-x-auto scrollbar-hide"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {MODULES.filter(mod => mod.id !== 'phone').map(mod => {
          const active = isModuleActive(mod);
          const Icon = mod.icon;
          const label = boomerMode ? mod.label : mod.codename.split(' ')[0];
          return (
            <button
              key={mod.id}
              onClick={() => navigate(mod.defaultPath)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-mono tracking-widest uppercase transition-colors shrink-0 ${
                active
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
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

export function MobileBottomBar() {
  return null;
}
