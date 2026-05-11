import { useLocation } from 'wouter';
import { useState, useEffect, useRef } from 'react';
import { User, Building2, ChevronDown, Terminal, Phone, Bot, Code2, Briefcase, Layers, Megaphone, BarChart2, Globe } from 'lucide-react';
import { MODULES, getModuleForPath } from '../lib/modules';
import { getDefaultBoomerMode } from '../hooks/use-mobile';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@workspace/replit-auth-web';
import { usePlan } from '../hooks/use-plan';

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
    <div className="sm:hidden bg-[#0a0a0b]/95 backdrop-blur-md border-b border-white/[0.04] overflow-hidden relative" style={{ zIndex: 40 }}>
      <div
        ref={scrollRef}
        className="flex items-center gap-1 px-2 py-1 overflow-x-auto scrollbar-hide"
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
              className={`flex items-center gap-1 px-3 py-2 rounded-full text-[10px] font-mono tracking-wider uppercase transition-colors shrink-0 touch-manipulation ${
                isActive
                  ? 'bg-sky-500/15 text-sky-400'
                  : 'text-zinc-500 active:text-zinc-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const PRIMARY_TABS = [
  { id: 'pablo', path: '/', label: 'PABLO', icon: Terminal },
  { id: 'phone', path: '/phone/dialer', label: 'PHONE', icon: Phone },
  { id: 'bots', path: '/bots', label: 'BOTS', icon: Bot },
  // Mobile users go straight to the CCTV-style /office/surveillance —
  // it's the clean, non-game-locked, list-of-bots view. The canvas-
  // based /bots/office is desktop-only territory because the canvas
  // pan/zoom controls are clumsy on a phone screen.
  { id: 'office', path: '/office/surveillance', label: 'OFFICE', icon: Building2, authOnly: true },
];

const DROPDOWN_ITEMS = [
  { id: 'world', path: '/world', label: 'GET TO WORK', icon: Globe, accent: 'red' as const },
  // OFFICE CAM removed from MORE: the OFFICE primary tab now opens
  // /office/surveillance directly.
  { id: 'console', path: '/console', label: 'CONSOLE', icon: Code2 },
  { id: 'business', path: '/business', label: 'BUSINESS', icon: Briefcase },
  { id: 'creative', path: '/creative/music', label: 'CREATIVE', icon: Layers },
  { id: 'marketing', path: '/marketing/campaigns', label: 'MARKETING', icon: Megaphone },
  { id: 'intel', path: '/intel/reports', label: 'INTEL', icon: BarChart2 },
  { id: 'profile', path: '/profile', label: 'PROFILE', icon: User, authOnly: true },
];

export function MobileModuleNav() {
  const [location, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const { isOwner: planIsOwner, features: planFeatures, loading: planLoading } = usePlan();
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'sm_boomer') setBoomerMode(e.newValue === '1'); };
    window.addEventListener('storage', onStorage);
    const id = setInterval(() => { try { setBoomerMode(localStorage.getItem('sm_boomer') === '1'); } catch {} }, 2000);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(id); };
  }, []);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  const pathname = location.split('?')[0];

  const isTabActive = (tab: typeof PRIMARY_TABS[0]) => {
    if (tab.id === 'pablo') return pathname === '/';
    if (tab.id === 'office') return pathname === '/office/surveillance' || pathname === '/bots/office';
    if (tab.id === 'bots') return (pathname.startsWith('/bots') && pathname !== '/bots/office') || pathname === '/bots';
    if (tab.id === 'phone') return pathname.startsWith('/phone');
    return false;
  };

  const isDropdownItemActive = (item: typeof DROPDOWN_ITEMS[0]) => {
    if (item.id === 'console') return pathname === '/console' || pathname.startsWith('/console/');
    if (item.id === 'profile') return pathname.startsWith('/profile');
    if (item.id === 'world') return pathname === '/world' || pathname.startsWith('/world/');
    // Office Cam dropdown is now redundant with the OFFICE primary
    // tab (both go to /office/surveillance), so it stays hidden.
    if (item.id === 'office-cam') return false;
    return pathname.startsWith('/' + item.id);
  };

  const hasActiveDropdownItem = DROPDOWN_ITEMS.some(d => isDropdownItemActive(d));

  // Phone is a paid feature (PABLO bundle). Hide for non-paid users
  // so they don't bounce off /phone* and see an upgrade screen. While
  // the plan is still loading we keep PHONE visible; otherwise paid
  // users see the tab disappear then reappear on cold load
  // (architect-flagged flicker). PhoneGate enforces actual access.
  const hasPhone = planLoading || planIsOwner || planFeatures.has('phone_system');
  const visibleTabs = PRIMARY_TABS
    .filter(tab => !tab.authOnly || isAuthenticated)
    .filter(tab => tab.id !== 'phone' || hasPhone);

  return (
    <div className="sm:hidden bg-[#0a0a0b]/98 backdrop-blur-md border-b border-white/[0.08] relative" style={{ zIndex: 60 }}>
      <div className="flex items-center px-1 h-12">
        {visibleTabs.map(tab => {
          const active = isTabActive(tab);
          const Icon = tab.icon;
          const isOffice = tab.id === 'office';
          const activeColor = isOffice ? 'text-emerald-400' : 'text-sky-400';
          if (isOffice) {
            return (
              <button
                key={tab.id}
                onClick={() => navigate(tab.path)}
                className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-md transition-colors touch-manipulation relative ${
                  active ? 'text-emerald-400' : 'text-emerald-500 active:text-emerald-400'
                }`}
                style={{ textShadow: '0 0 8px rgba(52,211,153,0.5)' }}
              >
                <div className="absolute inset-x-2 inset-y-0 rounded-md bg-emerald-400/8 border border-emerald-400/20" />
                <Icon className="w-5 h-5 relative z-10 drop-shadow-[0_0_6px_rgba(52,211,153,0.4)]" />
                <span className="text-[10px] font-mono tracking-wider uppercase leading-none relative z-10">
                  {tab.label}
                </span>
              </button>
            );
          }
          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.path)}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-md transition-colors touch-manipulation ${
                active ? activeColor : 'text-zinc-600 active:text-zinc-400'
              }`}
            >
              <Icon className={`w-5 h-5 ${active ? activeColor : ''}`} />
              <span className={`text-[10px] font-mono tracking-wider uppercase leading-none ${active ? activeColor : ''}`}>
                {tab.label}
              </span>
            </button>
          );
        })}

        <div className="relative flex-1" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(prev => !prev)}
            className={`flex flex-col items-center justify-center gap-0.5 w-full py-1 rounded-md transition-colors touch-manipulation ${
              hasActiveDropdownItem || dropdownOpen
                ? 'text-sky-400'
                : 'text-zinc-600 active:text-zinc-400'
            }`}
          >
            <ChevronDown className={`w-5 h-5 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            <span className="text-[10px] font-mono tracking-wider uppercase leading-none">
              MORE
            </span>
          </button>

          {dropdownOpen && (
            <div
              className="absolute right-0 top-full mt-1 w-52 bg-[#111113] border border-white/[0.1] rounded-lg shadow-2xl shadow-black/60 py-1"
              style={{ zIndex: 200 }}
            >
              {DROPDOWN_ITEMS
                .filter(item => !item.authOnly || isAuthenticated)
                .map(item => {
                  const active = isDropdownItemActive(item);
                  const Icon = item.icon;
                  const label = item.id === 'profile' && !isAuthenticated ? 'LOGIN' : item.label;
                  const isRed = item.accent === 'red';
                  let cls = 'text-zinc-400 active:bg-white/5';
                  let iconCls = 'text-zinc-600';
                  if (active) {
                    if (isRed) { cls = 'bg-red-500/10 text-red-300'; iconCls = 'text-red-300'; }
                    else { cls = 'bg-sky-500/10 text-sky-400'; iconCls = 'text-sky-400'; }
                  } else if (isRed) {
                    cls = 'text-red-300/85 active:bg-red-950/40'; iconCls = 'text-red-400/80';
                  }
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        navigate(item.path);
                        setDropdownOpen(false);
                      }}
                      className={`flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors touch-manipulation ${cls}`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${iconCls}`} />
                      <span className="text-xs font-mono tracking-widest uppercase">{label}</span>
                    </button>
                  );
                })}
              {!isAuthenticated && (
                <button
                  onClick={() => {
                    navigate('/profile');
                    setDropdownOpen(false);
                  }}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors touch-manipulation text-zinc-400 active:bg-white/5"
                >
                  <User className="w-4 h-4 shrink-0 text-zinc-600" />
                  <span className="text-xs font-mono tracking-widest uppercase">LOGIN</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function MobileBottomBar() {
  return null;
}
