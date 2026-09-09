import { ChevronDown, Eye, EyeOff, Globe, LogIn, LogOut, Terminal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { useAppMode } from '../hooks/use-app-mode';
import { getDefaultBoomerMode } from '../hooks/use-mobile';
import { resolveAvatarUrl } from '@/lib/avatar';
import { useStreamerMode } from '@/hooks/use-streamer-mode';
import { HISTORIC_MODULES, type HistoricModule } from '../lib/historic-navigation';

export function NavBar() {
  const [location, navigate] = useLocation();
  const { user, isLoading, isAuthenticated, login, logout } = useAuth();
  const { config, toggleMode, isDiscreet } = useAppMode();
  const streamerMode = useStreamerMode();
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'sm_boomer') setBoomerMode(event.newValue === '1');
    };
    window.addEventListener('storage', onStorage);
    const id = setInterval(() => {
      try {
        setBoomerMode(localStorage.getItem('sm_boomer') === '1');
      } catch {}
    }, 2000);
    return () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(id);
    };
  }, []);

  const pathname = location.split('?')[0];

  const isModuleActive = (module: HistoricModule) => {
    if (module.id === 'pablo') return pathname === '/pablo' || pathname.startsWith('/pablo/');
    if (module.id === 'console') return pathname === '/console' || pathname.startsWith('/console/');
    return pathname === module.path || pathname.startsWith(`${module.path}/`);
  };

  const handleModuleClick = (module: HistoricModule) => {
    if (module.subs.length === 0) {
      navigate(module.defaultPath);
      setActiveModuleId(null);
      return;
    }
    setActiveModuleId(activeModuleId === module.id ? null : module.id);
  };

  const expandedModule = HISTORIC_MODULES.find(module => module.id === activeModuleId) ?? null;

  return (
    <header className="app-header desktop-app-nav flex flex-col shrink-0 border-b border-[#D8D1C3] bg-[#FAF7EF]">
      <div className="hidden sm:flex items-center justify-between px-4 py-0.5 border-b border-[#E5DED1] bg-[#FFFCF5]">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-[#6C665C] tracking-widest uppercase">
            {boomerMode ? 'SALARYMAN' : 'PABLO CORP'}
          </span>
          <span className="text-[#B9B1A2] text-[9px]">◆</span>
          <span className="font-mono text-[10px] text-[#8B8376] tracking-widest">
            {typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : 'dev'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-black" />
            <span className="font-mono text-[10px] text-[#6C665C] tracking-wide">
              {boomerMode ? 'FREE FOREVER' : 'ALL FEATURES FREE'}
            </span>
          </span>
          {!location.startsWith('/world') && (
            <button
              onClick={() => {
                const next = !boomerMode;
                setBoomerMode(next);
                try {
                  localStorage.setItem('sm_boomer', next ? '1' : '0');
                } catch {}
              }}
              className={`font-mono text-[10px] tracking-wide px-1.5 py-0.5 rounded border transition-colors ${
                boomerMode
                  ? 'text-black border-black bg-[#F4EFE5]'
                  : 'text-[#6C665C] border-[#CFC6B7] hover:text-black'
              }`}
              title={boomerMode ? 'Boomer Mode ON — click to disable' : 'Boomer Mode: simpler labels'}
            >
              {boomerMode ? 'BOOMER MODE ✓' : 'BOOMER MODE'}
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between px-4 h-11">
        <div
          className="flex items-center gap-2.5 cursor-pointer group/logo shrink-0"
          onClick={() => navigate('/pablo')}
        >
          <div className="w-7 h-7 rounded-md bg-black border border-black flex items-center justify-center">
            <Terminal className="w-3.5 h-3.5 text-[#FAF7EF]" />
          </div>
          <div>
            <h1 className="font-mono text-sm font-normal text-black tracking-widest leading-none">
              {config.name}
            </h1>
            <p className="font-mono text-[9px] text-[#8B8376] tracking-widest leading-none mt-0.5">
              {config.sub}
            </p>
          </div>
          <button
            onClick={event => {
              event.stopPropagation();
              toggleMode();
            }}
            title={isDiscreet ? 'Show real name' : 'Discreet mode'}
            className="p-1 text-[#8B8376] hover:text-black transition-colors"
          >
            {isDiscreet ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          </button>
        </div>

        <nav className="hidden sm:flex items-center gap-0.5 shrink-0">
          {HISTORIC_MODULES.map(module => {
            const active = isModuleActive(module);
            const expanded = activeModuleId === module.id;
            const Icon = module.icon;
            return (
              <button
                key={module.id}
                onClick={() => handleModuleClick(module)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-mono tracking-widest uppercase transition-colors border ${
                  active || expanded
                    ? 'bg-black text-[#FAF7EF] border-black'
                    : 'text-[#5F594F] hover:text-black hover:bg-[#EEE8DC] border-transparent'
                }`}
              >
                <Icon className="w-3 h-3 shrink-0" />
                {boomerMode ? module.label : module.codename}
                {module.subs.length > 0 && (
                  <ChevronDown className={`w-2.5 h-2.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                )}
              </button>
            );
          })}

          <button
            onClick={() => navigate('/world')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-mono tracking-widest uppercase transition-colors text-black border border-[#CFC6B7] hover:bg-[#EEE8DC]"
          >
            <Globe className="w-3 h-3" />
            EXPLORE
          </button>

          <div className="ml-2 pl-2 flex items-center gap-2 border-l border-[#D8D1C3]">
            {isLoading ? (
              <div className="w-7 h-7 rounded-md bg-[#EEE8DC] animate-pulse" />
            ) : isAuthenticated && user ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate('/profile')}
                  className="flex items-center gap-2 hover:opacity-70 transition-opacity"
                  title="My account"
                >
                  {resolveAvatarUrl(user.profileImageUrl) ? (
                    <img
                      src={resolveAvatarUrl(user.profileImageUrl)}
                      alt={user.firstName ?? 'User'}
                      className="w-7 h-7 rounded-md object-cover border border-[#D8D1C3]"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-md flex items-center justify-center font-mono text-sm bg-[#EEE8DC] border border-[#D8D1C3] text-black">
                      {(user.firstName?.[0] ?? user.email?.[0] ?? '?').toUpperCase()}
                    </div>
                  )}
                  <div className="hidden sm:block text-right">
                    <p className="text-[11px] font-mono text-black leading-none">
                      {user.firstName ?? (streamerMode ? 'STREAMER' : user.email?.split('@')[0]) ?? 'USER'}
                    </p>
                    {user.email && (
                      <p className="text-[9px] font-mono text-[#8B8376] leading-none mt-0.5">
                        {streamerMode ? '••••••••' : user.email}
                      </p>
                    )}
                  </div>
                </button>
                <button
                  onClick={logout}
                  title="Sign out"
                  className="p-1.5 text-[#8B8376] hover:text-black transition-colors rounded-md hover:bg-[#EEE8DC]"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => login()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-mono tracking-widest uppercase text-black border border-[#CFC6B7] bg-[#FFFCF5] hover:bg-[#EEE8DC] transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                LOG IN
              </button>
            )}
          </div>
        </nav>
      </div>

      {expandedModule && expandedModule.subs.length > 0 && (
        <div className="hidden sm:flex items-center gap-1 px-4 py-1.5 border-t border-[#E5DED1] bg-[#FFFCF5] overflow-x-auto scrollbar-hide">
          <span className="font-mono text-[9px] text-[#8B8376] tracking-widest uppercase mr-2 shrink-0">
            {boomerMode ? expandedModule.label : expandedModule.codename}
          </span>
          {expandedModule.subs.map(sub => {
            const isSubActive = pathname === sub.path;
            const Icon = sub.icon;
            return (
              <button
                key={sub.id}
                onClick={() => {
                  navigate(sub.path);
                  setActiveModuleId(null);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono tracking-widest uppercase transition-colors shrink-0 border ${
                  isSubActive
                    ? 'bg-black text-[#FAF7EF] border-black'
                    : 'text-[#6C665C] hover:text-black hover:bg-[#EEE8DC] border-transparent'
                }`}
              >
                <Icon className="w-3 h-3 shrink-0" />
                {boomerMode ? sub.boomerLabel : sub.codename}
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
}