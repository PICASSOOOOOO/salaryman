import { useLocation } from 'wouter';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { User, Building2, ChevronDown, Terminal, Phone, Bot, Code2, Briefcase, Layers, Megaphone, MessageSquare } from 'lucide-react';
import { MODULES, getModuleForPath } from '../lib/modules';
import { getDefaultBoomerMode } from '../hooks/use-mobile';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@workspace/replit-auth-web';
import { usePlan } from '../hooks/use-plan';
import { useCommsSummary } from '../hooks/use-comms-summary';
import { useOrg } from '../hooks/use-org';

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
  // OFFICE drops you INTO the one playable office (the premium pixel
  // diorama). It has on-screen D-pad touch controls, so the old reason
  // for diverting mobile to a passive CCTV feed no longer applies.
  { id: 'office', path: '/office', label: 'OFFICE', icon: Building2, authOnly: true },
];

const DROPDOWN_ITEMS = [
  { id: 'comms', path: '/comms', label: 'COMMS', icon: MessageSquare, authOnly: true },
  { id: 'my-office', path: '/my-office', label: 'MY OFFICE', icon: Building2, authOnly: true, accent: 'emerald' as const },
  // OFFICE CAM removed from MORE: the OFFICE primary tab now opens the
  // single playable office (/office) directly.
  { id: 'console', path: '/console', label: 'CONSOLE', icon: Code2 },
  { id: 'business', path: '/business', label: 'BUSINESS', icon: Briefcase },
  { id: 'creative', path: '/creative/music', label: 'CREATIVE', icon: Layers },
  { id: 'marketing', path: '/marketing/campaigns', label: 'MARKETING', icon: Megaphone },
  { id: 'profile', path: '/profile', label: 'PROFILE', icon: User, authOnly: true },
];

export function MobileModuleNav() {
  const [location, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const { isOwner: planIsOwner, features: planFeatures, loading: planLoading } = usePlan();
  const { total: commsCount } = useCommsSummary();
  const { org: userOrg } = useOrg();
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownPanelRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
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
      const t = e.target as Node;
      if (dropdownRef.current?.contains(t)) return;
      if (dropdownPanelRef.current?.contains(t)) return;
      setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  // Portal the dropdown to <body> so it overlays everything, escaping the mobile
  // nav's sticky/z-index stacking context. Anchor it under the MORE trigger.
  useEffect(() => {
    if (!dropdownOpen) return;
    const place = () => {
      const r = dropdownRef.current?.getBoundingClientRect();
      if (r) setDropdownPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [dropdownOpen]);

  const pathname = location.split('?')[0];

  const isTabActive = (tab: typeof PRIMARY_TABS[0]) => {
    if (tab.id === 'pablo') return pathname === '/';
    if (tab.id === 'office') return pathname === '/office' || pathname === '/office/surveillance' || pathname === '/bots/office';
    if (tab.id === 'bots') return (pathname.startsWith('/bots') && pathname !== '/bots/office') || pathname === '/bots';
    if (tab.id === 'phone') return pathname.startsWith('/phone');
    return false;
  };

  const isDropdownItemActive = (item: typeof DROPDOWN_ITEMS[0]) => {
    if (item.id === 'console') return pathname === '/console' || pathname.startsWith('/console/');
    if (item.id === 'profile') return pathname.startsWith('/profile');
    // Office Cam dropdown is now redundant with the OFFICE primary
    // tab (both go to /office/surveillance), so it stays hidden.
    if (item.id === 'office-cam') return false;
    return pathname.startsWith('/' + item.id);
  };

  const hasActiveDropdownItem = DROPDOWN_ITEMS.some(d => isDropdownItemActive(d));

  // Phone is a paid feature (PABLO bundle), but we now show the tab to
  // EVERYONE so prospects can discover it. PhoneGate enforces actual
  // access at the route level and renders the paywall/upgrade screen
  // for users without phone_system.
  void planLoading; void planIsOwner; void planFeatures;
  const visibleTabs = PRIMARY_TABS
    .filter(tab => !tab.authOnly || isAuthenticated);

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
            className={`relative flex flex-col items-center justify-center gap-0.5 w-full py-1 rounded-md transition-colors touch-manipulation ${
              hasActiveDropdownItem || dropdownOpen
                ? 'text-sky-400'
                : 'text-zinc-600 active:text-zinc-400'
            }`}
          >
            <ChevronDown className={`w-5 h-5 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            <span className="text-[10px] font-mono tracking-wider uppercase leading-none">
              MORE
            </span>
            {isAuthenticated && commsCount > 0 && !dropdownOpen && (
              <span className="absolute top-0 right-2 min-w-[16px] h-4 flex items-center justify-center text-[9px] font-bold bg-red-500 text-white rounded-full px-1 border border-[#0a0a0b]">
                {commsCount > 99 ? '99+' : commsCount}
              </span>
            )}
          </button>

          {dropdownOpen && createPortal(
            <div
              ref={dropdownPanelRef}
              className="fixed w-52 bg-[#111113] border border-white/[0.1] rounded-lg shadow-2xl shadow-black/60 py-1"
              style={{ top: dropdownPos.top, right: dropdownPos.right, zIndex: 9999 }}
            >
              {DROPDOWN_ITEMS
                .filter(item => !item.authOnly || isAuthenticated)
                // Ordered by label length — most letters at top, fewest at bottom.
                .slice()
                .sort((a, b) => b.label.length - a.label.length)
                .map(item => {
                  const active = isDropdownItemActive(item);
                  const Icon = item.icon;
                  const label = item.id === 'profile' && !isAuthenticated
                    ? 'LOGIN'
                    : item.id === 'my-office' && userOrg?.name ? userOrg.name : item.label;
                  const isRed = (item as { accent?: string }).accent === 'red';
                  let cls = 'text-zinc-400 active:bg-white/5';
                  let iconCls = 'text-zinc-600';
                  if (active) {
                    if (isRed) { cls = 'bg-red-500/10 text-red-300'; iconCls = 'text-red-300'; }
                    else { cls = 'bg-sky-500/10 text-sky-400'; iconCls = 'text-sky-400'; }
                  } else if (isRed) {
                    cls = 'text-red-300/85 active:bg-red-950/40'; iconCls = 'text-red-400/80';
                  }
                  const showCommsBadge = item.id === 'comms' && commsCount > 0;
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
                      {showCommsBadge && (
                        <span className="ml-auto min-w-[16px] h-4 flex items-center justify-center text-[9px] font-bold bg-red-500 text-white rounded-full px-1">
                          {commsCount > 99 ? '99+' : commsCount}
                        </span>
                      )}
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
            </div>,
            document.body
          )}
        </div>
      </div>
    </div>
  );
}

export function MobileBottomBar() {
  return null;
}
