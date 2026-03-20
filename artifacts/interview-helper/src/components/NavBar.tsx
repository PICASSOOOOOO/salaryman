import { Terminal, LogIn, LogOut, Eye, EyeOff, Globe, ChevronDown, Zap } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAuth } from '@workspace/replit-auth-web';
import { useAppMode } from '../hooks/use-app-mode';
import { usePlan } from '../hooks/use-plan';
import { useEffect, useState } from 'react';
import { PABLO_PRODUCTS } from '../lib/product-names';
import { getDefaultBoomerMode, useIsMobile } from '../hooks/use-mobile';
import { MODULES, getModuleForPath } from '../lib/modules';

export function NavBar() {
  const [location, navigate] = useLocation();
  const { user, isLoading, isAuthenticated, login, logout } = useAuth();
  const { config, toggleMode, isDiscreet } = useAppMode();
  const { isPro, isOwner, features } = usePlan();
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());
  const isMobile = useIsMobile();
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'sm_boomer') setBoomerMode(e.newValue === '1'); };
    window.addEventListener('storage', onStorage);
    const id = setInterval(() => { try { setBoomerMode(localStorage.getItem('sm_boomer') === '1'); } catch {} }, 2000);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(id); };
  }, []);

  const pathname = location.split('?')[0];
  const currentModule = getModuleForPath(pathname);

  const isModuleActive = (mod: typeof MODULES[0]) => {
    if (mod.id === 'pablo') return pathname === '/';
    if (mod.id === 'console') return pathname === '/console' || pathname.startsWith('/console/');
    return pathname.startsWith(mod.path + '/') || pathname === mod.path;
  };

  const handleModuleClick = (mod: typeof MODULES[0]) => {
    if (mod.subs.length === 0) {
      navigate(mod.defaultPath);
      setActiveModuleId(null);
      return;
    }
    if (activeModuleId === mod.id) {
      setActiveModuleId(null);
    } else {
      setActiveModuleId(mod.id);
    }
  };

  const getModuleLabel = (mod: typeof MODULES[0]) => {
    if (mod.id === 'pablo') return boomerMode ? 'PABLO' : config.navLabel;
    return boomerMode ? mod.label : mod.codename;
  };

  const getSubLabel = (sub: typeof MODULES[0]['subs'][0]) => {
    return boomerMode ? sub.boomerLabel : sub.codename;
  };

  const expandedModule = MODULES.find(m => m.id === activeModuleId) ?? null;

  return (
    <header className="app-header shrink-0 bg-[#0a0a0b] border-b border-white/[0.06]">

      {/* Top strip — plan / trial info (hidden on mobile) */}
      <div className="hidden sm:flex items-center justify-between px-4 py-0.5 border-b border-white/[0.04] bg-white/[0.01]">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-zinc-600 tracking-widest uppercase">
            {boomerMode ? 'SALARYMAN' : 'PABLO CORP'}
          </span>
          <span className="text-zinc-700 text-[9px]">◆</span>
          <span className="font-mono text-[10px] text-zinc-700 tracking-widest">
            {typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : 'dev'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            {isPro || features.size > 0 ? (
              <>
                <Zap className="w-2.5 h-2.5 text-amber-500" />
                <span className="font-mono text-[10px] text-amber-400 tracking-wide">
                  {isOwner
                    ? 'CORP ADMIN'
                    : (boomerMode ? `${features.size} ACTIVE` : `${features.size} MODULE${features.size !== 1 ? 'S' : ''}`)}
                </span>
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <button
                  onClick={() => navigate('/upgrade')}
                  className="font-mono text-[10px] text-zinc-600 tracking-wide hover:text-amber-400 transition-colors"
                >
                  {boomerMode ? 'FREE PLAN — UPGRADE' : 'STANDARD EMPLOYEE — ACTIVATE EXEC CARD'}
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
              className={`font-mono text-[10px] tracking-wide px-1.5 py-0.5 rounded border transition-colors ${
                boomerMode
                  ? 'text-amber-400 border-amber-500/30 bg-amber-500/8'
                  : 'text-zinc-600 border-zinc-700/50 hover:text-zinc-400'
              }`}
              title={boomerMode ? 'Boomer Mode ON — click to disable' : 'Boomer Mode: simpler labels'}
            >
              {boomerMode ? 'BOOMER MODE ✓' : 'BOOMER MODE'}
            </button>
          )}
        </div>
      </div>

      {/* Main nav row */}
      <div className="flex items-center justify-between px-4 h-11">

        {/* Brand / Logo */}
        <div
          className="flex items-center gap-2.5 cursor-pointer group/logo shrink-0"
          onClick={() => navigate('/')}
        >
          <div className="w-7 h-7 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Terminal className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          {!isMobile && (
            <div>
              <h1 className="font-['Share_Tech_Mono',monospace] text-sm font-normal text-zinc-100 tracking-widest leading-none">
                {config.name}
              </h1>
              <p className="font-mono text-[9px] text-zinc-600 tracking-widest leading-none mt-0.5">
                {config.sub}
              </p>
            </div>
          )}
          <button
            onClick={e => { e.stopPropagation(); toggleMode(); }}
            title={isDiscreet ? 'Show real name' : 'Discreet mode'}
            className="p-1 text-zinc-700 hover:text-zinc-400 transition-colors"
          >
            {isDiscreet ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          </button>
        </div>

        {/* Module Tabs — hidden on mobile (shown in bottom bar instead) */}
        <nav className="hidden sm:flex items-center gap-0.5 shrink-0">
          {MODULES.map(mod => {
            const active = isModuleActive(mod);
            const expanded = activeModuleId === mod.id;
            const Icon = mod.icon;
            return (
              <button
                key={mod.id}
                onClick={() => handleModuleClick(mod)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-mono tracking-widest uppercase transition-colors ${
                  active || expanded
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/4 border border-transparent'
                }`}
              >
                <Icon className="w-3 h-3 shrink-0" />
                {getModuleLabel(mod)}
                {mod.subs.length > 0 && (
                  <ChevronDown className={`w-2.5 h-2.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                )}
              </button>
            );
          })}

          {/* EXPLORE button — desktop only */}
          <button
            onClick={() => navigate('/world')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-mono tracking-widest uppercase transition-colors text-emerald-500/70 border border-emerald-500/20 hover:bg-emerald-500/8 hover:text-emerald-400"
          >
            <Globe className="w-3 h-3" />
            EXPLORE
          </button>

          {/* Auth */}
          <div className="ml-2 pl-2 flex items-center gap-2 border-l border-white/[0.06]">
            {isLoading ? (
              <div className="w-7 h-7 rounded-md bg-white/4 animate-pulse" />
            ) : isAuthenticated && user ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate('/profile')}
                  className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                  title="My account"
                >
                  {user.profileImageUrl ? (
                    <img
                      src={user.profileImageUrl}
                      alt={user.firstName ?? 'User'}
                      className="w-7 h-7 rounded-md object-cover border border-white/10"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-md flex items-center justify-center font-mono text-sm bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                      {(user.firstName?.[0] ?? user.email?.[0] ?? '?').toUpperCase()}
                    </div>
                  )}
                  <div className="hidden sm:block text-right">
                    <p className="text-[11px] font-mono text-zinc-300 leading-none">
                      {user.firstName ?? user.email?.split('@')[0] ?? 'USER'}
                    </p>
                    {user.email && (
                      <p className="text-[9px] font-mono text-zinc-600 leading-none mt-0.5">
                        {user.email}
                      </p>
                    )}
                  </div>
                </button>
                <button
                  onClick={logout}
                  title="Sign out"
                  className="p-1.5 text-zinc-600 hover:text-red-400 transition-colors rounded-md hover:bg-red-500/8"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={login}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-mono tracking-widest uppercase text-zinc-300 border border-white/10 bg-white/4 hover:bg-white/8 transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                LOG IN
              </button>
            )}
          </div>
        </nav>

        {/* Mobile: show only auth */}
        <div className="flex sm:hidden items-center gap-2">
          {isLoading ? null : isAuthenticated && user ? (
            <button
              onClick={() => navigate('/profile')}
              className="hover:opacity-80 transition-opacity"
            >
              {user.profileImageUrl ? (
                <img src={user.profileImageUrl} alt={user.firstName ?? 'User'} className="w-7 h-7 rounded-md object-cover border border-white/10" />
              ) : (
                <div className="w-7 h-7 rounded-md flex items-center justify-center font-mono text-sm bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  {(user.firstName?.[0] ?? user.email?.[0] ?? '?').toUpperCase()}
                </div>
              )}
            </button>
          ) : (
            <button onClick={login} className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono tracking-widest uppercase text-zinc-300 border border-white/10 bg-white/4">
              <LogIn className="w-3 h-3" />
              LOG IN
            </button>
          )}
        </div>
      </div>

      {/* Sub-nav row — shown when a module with subs is expanded (desktop only) */}
      {expandedModule && expandedModule.subs.length > 0 && (
        <div className="hidden sm:flex items-center gap-1 px-4 py-1.5 border-t border-white/[0.04] bg-white/[0.01] overflow-x-auto scrollbar-hide">
          <span className="font-mono text-[9px] text-zinc-700 tracking-widest uppercase mr-2 shrink-0">
            {boomerMode ? expandedModule.label : expandedModule.codename}
          </span>
          {expandedModule.subs.map(sub => {
            const isSubActive = pathname === sub.path;
            const Icon = sub.icon;
            return (
              <button
                key={sub.id}
                onClick={() => { navigate(sub.path); setActiveModuleId(null); }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono tracking-widest uppercase transition-colors shrink-0 ${
                  isSubActive
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/4 border border-transparent'
                }`}
              >
                <Icon className="w-3 h-3 shrink-0" />
                {getSubLabel(sub)}
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
}
