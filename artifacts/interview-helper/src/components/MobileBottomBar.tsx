import { useLocation } from 'wouter';
import { useState, useEffect, useRef } from 'react';
import { Globe, User, Building2, ChevronDown, Terminal, Phone, Bot, Code2, Briefcase, Layers, Megaphone, BarChart2 } from 'lucide-react';
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
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono tracking-widest uppercase transition-colors shrink-0 ${
                isActive
                  ? 'bg-sky-500/15 text-sky-400 border border-sky-500/25'
                  : 'text-zinc-500 border border-white/[0.06] hover:text-zinc-300'
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
  { id: 'office', path: '/bots/office', label: 'OFFICE', icon: Building2, authOnly: true },
  { id: 'explore', path: '/world', label: 'EXPLORE', icon: Globe },
];

const DROPDOWN_ITEMS = [
  { id: 'console', path: '/console', label: 'CONSOLE', icon: Code2 },
  { id: 'business', path: '/business', label: 'BUSINESS', icon: Briefcase },
  { id: 'creative', path: '/creative/darkroom', label: 'CREATIVE', icon: Layers },
  { id: 'marketing', path: '/marketing/campaigns', label: 'MARKETING', icon: Megaphone },
  { id: 'intel', path: '/intel/reports', label: 'INTEL', icon: BarChart2 },
  { id: 'profile', path: '/profile', label: 'PROFILE', icon: User, authOnly: true },
];

export function MobileModuleNav() {
  const [location, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
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
    if (tab.id === 'office') return pathname === '/bots/office';
    if (tab.id === 'bots') return (pathname.startsWith('/bots') && pathname !== '/bots/office') || pathname === '/bots';
    if (tab.id === 'phone') return pathname.startsWith('/phone');
    if (tab.id === 'explore') return pathname.startsWith('/world');
    return false;
  };

  const isDropdownItemActive = (item: typeof DROPDOWN_ITEMS[0]) => {
    if (item.id === 'console') return pathname === '/console' || pathname.startsWith('/console/');
    if (item.id === 'profile') return pathname.startsWith('/profile');
    return pathname.startsWith('/' + item.id);
  };

  const activeDropdownItem = DROPDOWN_ITEMS.find(d => isDropdownItemActive(d));

  const visibleTabs = PRIMARY_TABS.filter(tab => !tab.authOnly || isAuthenticated);

  return (
    <div className="sm:hidden bg-[#0a0a0b]/98 backdrop-blur-md border-b border-white/[0.08]">
      <div className="flex items-center px-1 h-12">
        {visibleTabs.map(tab => {
          const active = isTabActive(tab);
          const Icon = tab.icon;
          const isOffice = tab.id === 'office';
          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.path)}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-md transition-colors touch-manipulation ${
                active
                  ? isOffice ? 'text-amber-400' : 'text-sky-400'
                  : 'text-zinc-600 active:text-zinc-400'
              }`}
            >
              <Icon className={`w-5 h-5 ${active ? (isOffice ? 'text-amber-400' : 'text-sky-400') : ''}`} />
              <span className={`text-[10px] font-mono tracking-wider uppercase leading-none ${active ? (isOffice ? 'text-amber-400' : 'text-sky-400') : ''}`}>
                {tab.label}
              </span>
            </button>
          );
        })}

        <div className="relative flex-1" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(prev => !prev)}
            className={`flex flex-col items-center justify-center gap-0.5 w-full py-1 rounded-md transition-colors touch-manipulation ${
              activeDropdownItem
                ? 'text-sky-400'
                : 'text-zinc-600 active:text-zinc-400'
            }`}
          >
            {activeDropdownItem ? (
              <>
                <activeDropdownItem.icon className="w-5 h-5 text-sky-400" />
                <span className="text-[10px] font-mono tracking-wider uppercase leading-none text-sky-400 flex items-center gap-0.5">
                  {activeDropdownItem.label}
                  <ChevronDown className={`w-2.5 h-2.5 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                </span>
              </>
            ) : (
              <>
                <ChevronDown className={`w-5 h-5 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                <span className="text-[10px] font-mono tracking-wider uppercase leading-none">
                  MORE
                </span>
              </>
            )}
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-[#111113] border border-white/[0.1] rounded-lg shadow-2xl shadow-black/60 py-1 z-[100]">
              {DROPDOWN_ITEMS
                .filter(item => !item.authOnly || isAuthenticated)
                .map(item => {
                  const active = isDropdownItemActive(item);
                  const Icon = item.icon;
                  const label = item.id === 'profile' && !isAuthenticated ? 'LOGIN' : item.label;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        navigate(item.path);
                        setDropdownOpen(false);
                      }}
                      className={`flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors touch-manipulation ${
                        active
                          ? 'bg-sky-500/10 text-sky-400'
                          : 'text-zinc-400 active:bg-white/5'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-sky-400' : 'text-zinc-600'}`} />
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
