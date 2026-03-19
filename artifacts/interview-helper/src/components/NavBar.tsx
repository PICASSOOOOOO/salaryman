import { Terminal, Users, LogIn, LogOut, Eye, EyeOff, LayoutDashboard, Zap, Globe, Clock, Briefcase, Code2, Archive, Layers, BarChart2, CalendarDays } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAuth } from '@workspace/replit-auth-web';
import { useAppMode } from '../hooks/use-app-mode';
import { usePlan } from '../hooks/use-plan';
import { useEffect, useState } from 'react';
import { PABLO_PRODUCTS } from '../lib/product-names';
import { getDefaultBoomerMode, useIsMobile } from '../hooks/use-mobile';

export function NavBar() {
  const [location, navigate] = useLocation();
  const { user, isLoading, isAuthenticated, login, logout } = useAuth();
  const { config, toggleMode, isDiscreet } = useAppMode();
  const { isPro, isTrial, trialDaysLeft, trialHoursLeft } = usePlan();
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());
  const isMobile = useIsMobile();

  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'sm_boomer') setBoomerMode(e.newValue === '1'); };
    window.addEventListener('storage', onStorage);
    const id = setInterval(() => { try { setBoomerMode(localStorage.getItem('sm_boomer') === '1'); } catch {} }, 2000);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(id); };
  }, []);

  const NAV = [
    { path: '/', label: boomerMode ? 'PABLO' : config.navLabel, icon: Terminal, pro: false, mobileShow: true },
    { path: '/console', label: boomerMode ? 'CONSOLE' : PABLO_PRODUCTS.CONSOLE.short, icon: Code2, pro: true, mobileShow: false },
    { path: '/contacts', label: boomerMode ? 'CONTACTS' : PABLO_PRODUCTS.CONTACTS.short, icon: Users, pro: true, mobileShow: false },
    { path: '/hiring', label: boomerMode ? 'HIRING' : PABLO_PRODUCTS.HIRING.short, icon: Briefcase, pro: true, mobileShow: false },
    { path: '/documents', label: boomerMode ? 'DOCUMENTS' : PABLO_PRODUCTS.PRINTER.short, icon: Archive, pro: true, mobileShow: false },
    { path: '/calendar', label: boomerMode ? 'CALENDAR' : PABLO_PRODUCTS.CALENDAR.short, icon: CalendarDays, pro: true, mobileShow: false },
    { path: '/dashboard', label: boomerMode ? 'DASHBOARD' : PABLO_PRODUCTS.WORKSPACE.short, icon: LayoutDashboard, pro: true, mobileShow: false },
    { path: '/studio', label: boomerMode ? 'STUDIO' : PABLO_PRODUCTS.STUDIO.short, icon: Layers, pro: true, mobileShow: false },
    { path: '/reporting', label: boomerMode ? 'REPORTS' : PABLO_PRODUCTS.REPORTING.short, icon: BarChart2, pro: true, mobileShow: false },
  ];

  return (
    <header className="app-header shrink-0 bg-[#0a0a0b] border-b border-white/[0.06]">

      {/* Top strip — plan / trial info */}
      <div className="flex items-center justify-between px-4 py-0.5 border-b border-white/[0.04] bg-white/[0.01]">
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
            <span className={`w-1.5 h-1.5 rounded-full ${isTrial ? 'bg-amber-500' : 'bg-emerald-500'}`} />
            {isTrial ? (
              <span className="font-mono text-[10px] text-amber-500/80 tracking-wide flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />
                TRIAL · {trialDaysLeft > 1 ? `${trialDaysLeft}D LEFT` : `${trialHoursLeft}H LEFT`}
              </span>
            ) : (
              <span className="font-mono text-[10px] text-zinc-600 tracking-wide">
                {isPro ? (boomerMode ? 'PRO PLAN' : PABLO_PRODUCTS.PRO_TIER.name) : (boomerMode ? 'FREE PLAN' : PABLO_PRODUCTS.FREE_TIER.name)}
              </span>
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
              {boomerMode ? 'BOOMER ✓' : 'BOOMER'}
            </button>
          )}
        </div>
      </div>

      {/* Main nav row */}
      <div className="flex items-center justify-between px-4 h-11 overflow-x-auto scrollbar-hide">

        {/* Brand / Logo */}
        <div
          className="flex items-center gap-2.5 cursor-pointer group/logo shrink-0"
          onClick={() => navigate('/')}
        >
          <div className="w-7 h-7 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Terminal className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div>
            <h1 className="font-['Share_Tech_Mono',monospace] text-sm font-normal text-zinc-100 tracking-widest leading-none">
              {config.name}
            </h1>
            <p className="font-mono text-[9px] text-zinc-600 tracking-widest leading-none mt-0.5">
              {config.sub}
            </p>
          </div>
          <button
            onClick={e => { e.stopPropagation(); toggleMode(); }}
            title={isDiscreet ? 'Show real name' : 'Discreet mode'}
            className="p-1 text-zinc-700 hover:text-zinc-400 transition-colors"
          >
            {isDiscreet ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          </button>
        </div>

        {/* Nav Items */}
        <nav className="flex items-center gap-0.5 shrink-0">
          {NAV.map(({ path, label, icon: Icon, pro, mobileShow }) => {
            const active = location === path || (path !== '/' && location.startsWith(path));
            const locked = pro && !isPro;
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={`${mobileShow ? 'flex' : 'hidden sm:flex'} items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-mono tracking-widest uppercase transition-colors ${
                  active
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : locked
                      ? 'text-zinc-700 border border-transparent'
                      : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/4 border border-transparent'
                }`}
              >
                <Icon className="w-3 h-3 shrink-0" />
                {label}
                {locked && (
                  <span className="text-[9px] font-mono text-zinc-700 border border-zinc-800 px-1 py-px rounded">
                    {boomerMode ? 'PRO' : PABLO_PRODUCTS.PRO_TIER.short}
                  </span>
                )}
              </button>
            );
          })}

          <button
            onClick={e => { if (isMobile || window.innerWidth < 768) { e.preventDefault(); return; } navigate('/world'); }}
            aria-disabled={isMobile ? true : undefined}
            title={isMobile ? 'Desktop only' : undefined}
            disabled={isMobile}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-mono tracking-widest uppercase transition-colors flex-col ${
              isMobile
                ? 'text-zinc-700 border border-zinc-800/50 opacity-50 cursor-default'
                : 'text-emerald-500/70 border border-emerald-500/20 hover:bg-emerald-500/8 hover:text-emerald-400'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Globe className="w-3 h-3" />
              EXPLORE
            </span>
            {isMobile && (
              <span className="text-[8px] tracking-wide opacity-70 leading-none">
                DESKTOP ONLY
              </span>
            )}
          </button>

          {isTrial ? (
            <button
              onClick={() => navigate('/upgrade')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 ml-2 rounded-md text-[11px] font-mono tracking-widest uppercase text-amber-400 border border-amber-500/30 bg-amber-500/6 hover:bg-amber-500/12 transition-colors"
              style={{ animation: trialDaysLeft <= 2 ? 'smfade 1.2s steps(1) infinite alternate' : 'none' }}
            >
              <Clock className="w-3 h-3" />
              {trialDaysLeft > 1 ? `${trialDaysLeft}D TRIAL` : `${trialHoursLeft}H LEFT`} · UPGRADE
            </button>
          ) : !isPro && (
            <button
              onClick={() => navigate('/upgrade')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 ml-2 rounded-md text-[11px] font-mono tracking-widest uppercase text-emerald-400 border border-emerald-500/30 bg-emerald-500/8 hover:bg-emerald-500/15 transition-colors"
            >
              <Zap className="w-3 h-3" />
              UPGRADE
            </button>
          )}

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
      </div>
    </header>
  );
}
