import { LogIn, LogOut, Eye, EyeOff, Globe, ChevronDown, Zap, Bug, ExternalLink, User, Bell } from 'lucide-react';
import { PicassoLogo } from './PicassoLogo';
import { useLocation } from 'wouter';
import { useAuth } from '@workspace/replit-auth-web';
import { useAppMode } from '../hooks/use-app-mode';
import { usePlan } from '../hooks/use-plan';
import { useNotifications } from '../hooks/use-notifications';
import { useOrg } from '../hooks/use-org';
import { useEffect, useState, useRef } from 'react';
import { PABLO_PRODUCTS } from '../lib/product-names';
import { getDefaultBoomerMode, useIsMobile } from '../hooks/use-mobile';
import { MODULES, getModuleForPath } from '../lib/modules';
import { FeedbackModal } from './FeedbackModal';
import { LanguageSelector } from './LanguageSelector';
import { useTranslation } from 'react-i18next';

export function NavBar() {
  const [location, navigate] = useLocation();
  const { user, isLoading, isAuthenticated, login, logout } = useAuth();
  const { config, toggleMode, isDiscreet } = useAppMode();
  const { isPro, isOwner, features } = usePlan();
  const { notifications, unreadCount, markRead } = useNotifications();
  const { org: userOrg } = useOrg();
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());
  const isMobile = useIsMobile();
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'sm_boomer') setBoomerMode(e.newValue === '1'); };
    window.addEventListener('storage', onStorage);
    const id = setInterval(() => { try { setBoomerMode(localStorage.getItem('sm_boomer') === '1'); } catch {} }, 2000);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(id); };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (notifRef.current && !notifRef.current.contains(target)) {
        const bellBtn = (target as Element)?.closest?.('[title="Notifications"]');
        if (!bellBtn) setShowNotifications(false);
      }
    };
    if (showNotifications) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showNotifications]);

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
    if (mod.id === 'pablo') return boomerMode ? t('nav.pablo') : (isDiscreet ? t('discreet.navLabel') : t('nav.pablo'));
    if (boomerMode) {
      return t(`nav.${mod.id}`, mod.label);
    }
    return t(`codenames.${mod.id}`, mod.codename);
  };

  const getSubLabel = (sub: typeof MODULES[0]['subs'][0]) => {
    if (boomerMode) {
      return t(`labels.${sub.id}`, sub.boomerLabel);
    }
    return t(`codenames.${sub.id}`, sub.codename);
  };

  const expandedModule = MODULES.find(m => m.id === activeModuleId) ?? null;

  return (
    <header className="app-header shrink-0 bg-[#0a0a0b] border-b border-white/[0.06]">

      {/* Top strip — plan / trial info (hidden on mobile) */}
      <div className="hidden sm:flex items-center justify-between px-4 py-0.5 border-b border-white/[0.04] bg-white/[0.01]">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-zinc-600 tracking-widest uppercase">
            {boomerMode ? t('nav.salarymanLabel') : t('nav.pabloCorpLabel')}
          </span>
          <span className="text-zinc-700 text-[9px]">◆</span>
          <span className="font-mono text-[9px] text-sky-400/70 border border-sky-500/25 bg-sky-500/8 px-1.5 py-0.5 rounded tracking-widest uppercase">
            ALPHA {__BUILD_VERSION__}
          </span>
          <button
            onClick={() => navigate('/investors')}
            className="font-mono text-[9px] text-zinc-600 tracking-widest uppercase hover:text-sky-400/70 transition-colors"
          >
            {t('nav.investors')}
          </button>
          <button
            onClick={() => navigate('/feedback')}
            className="font-mono text-[9px] text-zinc-700 tracking-widest uppercase hover:text-sky-400/70 transition-colors"
          >
            Feedback
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            {isPro || features.size > 0 ? (
              <button onClick={() => navigate('/pricing')} className="flex items-center gap-1.5 hover:opacity-80 transition-opacity">
                <Zap className="w-2.5 h-2.5 text-amber-500" />
                <span className="font-mono text-[10px] text-amber-400 tracking-wide">
                  {isOwner
                    ? t('nav.corpAdmin')
                    : (boomerMode
                        ? `${features.size} ${t('nav.active')}`
                        : `${features.size} ${t('nav.module', { count: features.size })}${features.size !== 1 ? 'S' : ''}`)}
                </span>
              </button>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                <button
                  onClick={() => navigate('/pricing')}
                  className="font-mono text-[10px] text-red-400 tracking-wide hover:text-red-300 transition-colors"
                >
                  {boomerMode ? 'PRICING' : t('nav.upgradeLabelCodename')}
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
              title={boomerMode ? t('nav.boomerModeTooltipOn') : t('nav.boomerModeTooltipOff')}
            >
              {boomerMode ? t('nav.boomerModeOn') : t('nav.boomerModeOff')}
            </button>
          )}
          <LanguageSelector />
        </div>
      </div>

      {/* Main nav row */}
      <div className="flex items-center justify-between px-4 h-11">

        {/* Brand / Logo */}
        <div
          className="flex items-center gap-2.5 cursor-pointer group/logo shrink-0"
          onClick={() => navigate('/')}
        >
          <div className="w-7 h-7 rounded-md flex items-center justify-center">
            <PicassoLogo size={22} gap={2} glow />
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
            title={isDiscreet ? t('nav.discreetShow') : t('nav.discreetHide')}
            className="p-1 text-zinc-700 hover:text-zinc-400 transition-colors"
          >
            {isDiscreet ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          </button>
          {isMobile && (
            <span className="font-mono text-[8px] text-sky-500/60 border border-sky-500/20 px-1.5 py-0.5 rounded tracking-widest uppercase">
              ALPHA {__BUILD_VERSION__}
            </span>
          )}
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
                    ? 'bg-sky-500/10 text-sky-300 border border-sky-500/20'
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
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-mono tracking-widest uppercase transition-colors text-sky-400/70 border border-sky-500/20 hover:bg-sky-500/8 hover:text-sky-300"
          >
            <Globe className="w-3 h-3" />
            {t('nav.explore')}
          </button>

          {/* Auth */}
          <div className="ml-2 pl-2 flex items-center gap-2 border-l border-white/[0.06]">
            {/* Notification bell — desktop */}
            {isAuthenticated && (
              <button
                onClick={() => setShowNotifications(prev => !prev)}
                title="Notifications"
                className="relative p-1.5 text-zinc-600 hover:text-sky-400 transition-colors rounded-md hover:bg-sky-500/8"
              >
                <Bell className="w-3.5 h-3.5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center text-[9px] font-bold bg-red-500 text-white rounded-full px-1 border border-[#0a0a0b]">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
            )}
            {/* Bug report button */}
            <button
              onClick={() => setShowFeedback(true)}
              title="Report an issue"
              className="p-1.5 text-zinc-600 hover:text-sky-400 transition-colors rounded-md hover:bg-sky-500/8"
            >
              <Bug className="w-3.5 h-3.5" />
            </button>
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
                    <div className="w-7 h-7 rounded-md flex items-center justify-center font-mono text-sm bg-sky-500/10 border border-sky-500/20 text-sky-300">
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
                  title={t('nav.logout')}
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
                {t('nav.login')}
              </button>
            )}
          </div>
        </nav>

        {/* Mobile: show only auth + language selector */}
        <div className="flex sm:hidden items-center gap-2">
          {/* Notification bell — mobile */}
          {isAuthenticated && (
            <button
              onClick={() => setShowNotifications(prev => !prev)}
              title="Notifications"
              className="relative p-1.5 text-zinc-600 hover:text-sky-400 transition-colors rounded-md"
            >
              <Bell className="w-3.5 h-3.5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center text-[9px] font-bold bg-red-500 text-white rounded-full px-1 border border-[#0a0a0b]">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
          )}
          {/* Bug report button — mobile */}
          <button
            onClick={() => setShowFeedback(true)}
            title="Report an issue"
            className="p-1.5 text-zinc-600 hover:text-sky-400 transition-colors rounded-md"
          >
            <Bug className="w-3.5 h-3.5" />
          </button>
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
              title={boomerMode ? t('nav.boomerModeTooltipOn') : t('nav.boomerModeTooltipOff')}
            >
              {boomerMode ? t('nav.boomerModeOn') : t('nav.boomerModeOff')}
            </button>
          )}
          <LanguageSelector compact />
          {isLoading ? null : isAuthenticated && user ? (
            <button
              onClick={() => navigate('/profile')}
              className="hover:opacity-80 transition-opacity"
            >
              {user.profileImageUrl ? (
                <img src={user.profileImageUrl} alt={user.firstName ?? 'User'} className="w-7 h-7 rounded-md object-cover border border-white/10" />
              ) : (
                <div className="w-7 h-7 rounded-md flex items-center justify-center font-mono text-sm bg-sky-500/10 border border-sky-500/20 text-sky-300">
                  {(user.firstName?.[0] ?? user.email?.[0] ?? '?').toUpperCase()}
                </div>
              )}
            </button>
          ) : (
            <button onClick={login} className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono tracking-widest uppercase text-zinc-300 border border-white/10 bg-white/4">
              <LogIn className="w-3 h-3" />
              {t('nav.login')}
            </button>
          )}
        </div>
      </div>

      {/* Sub-nav row — shown when a module with subs is expanded (desktop only) */}
      {expandedModule && expandedModule.subs.length > 0 && (
        <div className="hidden sm:flex items-center gap-1 px-4 py-1.5 border-t border-white/[0.04] bg-white/[0.01] overflow-x-auto scrollbar-hide">
          <span className="font-mono text-[9px] text-zinc-700 tracking-widest uppercase mr-2 shrink-0">
            {boomerMode ? t(`nav.${expandedModule.id}`, expandedModule.label) : t(`codenames.${expandedModule.id}`, expandedModule.codename)}
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
                    ? 'bg-sky-500/10 text-sky-300 border border-sky-500/20'
                    : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/4 border border-transparent'
                }`}
              >
                <Icon className="w-3 h-3 shrink-0" />
                {getSubLabel(sub)}
              </button>
            );
          })}
          <button
            onClick={() => {
              const base = import.meta.env.BASE_URL ?? '/';
              window.open(`${base}${pathname.replace(/^\//, '')}`, '_blank', 'noopener');
            }}
            title="OPEN IN NEW TAB"
            className="ml-auto p-1 rounded text-zinc-600 hover:text-sky-400 hover:bg-white/4 transition-colors shrink-0"
          >
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      )}

      {showNotifications && isAuthenticated && (
        <div ref={notifRef} className="absolute right-2 sm:right-4 top-[60px] w-[calc(100vw-16px)] sm:w-80 max-h-96 bg-[#111113] border border-white/10 rounded-lg shadow-2xl z-[999] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
            <span className="text-[11px] font-mono tracking-widest text-zinc-400 uppercase">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markRead()}
                className="text-[10px] font-mono text-sky-500 hover:text-sky-400 transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-zinc-600 text-[11px] font-mono">
                No notifications
              </div>
            ) : (
              notifications.slice(0, 30).map(n => (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.read) markRead([n.id]);
                    if (n.link) { navigate(n.link); setShowNotifications(false); }
                  }}
                  className={`w-full text-left px-3 py-2.5 border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors ${!n.read ? 'bg-sky-500/[0.04]' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className={`text-[11px] font-mono leading-tight truncate ${!n.read ? 'text-zinc-200' : 'text-zinc-500'}`}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-[10px] text-zinc-600 mt-0.5 line-clamp-2 leading-tight">
                          {n.body}
                        </p>
                      )}
                      <p className="text-[9px] text-zinc-700 mt-1 font-mono">
                        {new Date(n.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
    </header>
  );
}
