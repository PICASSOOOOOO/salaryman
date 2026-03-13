import { Terminal, Users, Presentation, LogIn, LogOut, Eye, EyeOff, LayoutDashboard, Zap, Radio } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAuth } from '@workspace/replit-auth-web';
import { useAppMode } from '../hooks/use-app-mode';
import { usePlan } from '../hooks/use-plan';
import { useEffect, useRef, useState } from 'react';

function BlinkingClock() {
  const [display, setDisplay] = useState('');
  const colonRef = useRef(true);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      colonRef.current = !colonRef.current;
      setDisplay(`${h}${colonRef.current ? ':' : ' '}${m}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="display-text text-sm crt-text opacity-60 tabular-nums w-12 inline-block">
      {display}
    </span>
  );
}

export function NavBar() {
  const [location, navigate] = useLocation();
  const { user, isLoading, isAuthenticated, login, logout } = useAuth();
  const { config, toggleMode, isDiscreet } = useAppMode();
  const { isPro } = usePlan();

  const NAV = [
    { path: '/', label: config.navLabel, icon: Terminal, pro: false },
    { path: '/presenter', label: 'PRESENTER', icon: Presentation, pro: true },
    { path: '/contacts', label: 'CONTACTS', icon: Users, pro: true },
    { path: '/dashboard', label: 'WORKSPACE', icon: LayoutDashboard, pro: true },
  ];

  return (
    <header
      className="shrink-0 z-20 relative"
      style={{
        background: 'rgba(0, 10, 0, 0.97)',
        borderBottom: '1px solid rgba(0,255,65,0.25)',
        boxShadow: '0 2px 20px rgba(0,255,65,0.08), inset 0 -1px 0 rgba(0,255,65,0.1)',
      }}
    >
      {/* Top strip — device info bar */}
      <div
        className="flex items-center justify-between px-4 py-0.5"
        style={{
          borderBottom: '1px solid rgba(0,255,65,0.1)',
          background: 'rgba(0,255,65,0.02)',
        }}
      >
        <div className="flex items-center gap-3">
          <span className="display-text text-xs" style={{ color: 'rgba(0,255,65,0.35)', letterSpacing: '0.12em' }}>
            PABLO CORP.
          </span>
          <span style={{ color: 'rgba(0,255,65,0.15)', fontSize: '0.65rem' }}>◆</span>
          <span className="display-text text-xs" style={{ color: 'rgba(0,255,65,0.25)', letterSpacing: '0.1em' }}>
            FIELD UNIT v1.0
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="status-dot" style={{ width: '5px', height: '5px' }} />
            <span className="display-text text-xs" style={{ color: 'rgba(0,255,65,0.35)', letterSpacing: '0.08em' }}>
              {isPro ? 'PRO ACCESS' : 'FREE TIER'}
            </span>
          </span>
          <BlinkingClock />
        </div>
      </div>

      {/* Main nav row */}
      <div className="flex items-center justify-between px-4 h-11">

        {/* Brand / Logo */}
        <div
          className="flex items-center gap-2 group/logo cursor-pointer"
          onClick={() => navigate('/')}
        >
          <div
            className="flex items-center justify-center"
            style={{
              width: '28px',
              height: '28px',
              border: '1px solid rgba(0,255,65,0.5)',
              background: 'rgba(0,255,65,0.08)',
              boxShadow: '0 0 8px rgba(0,255,65,0.15)',
            }}
          >
            <Radio className="w-3.5 h-3.5" style={{ color: '#00ff41' }} />
          </div>
          <div>
            <h1
              className="display-text leading-none"
              style={{
                fontSize: '1.25rem',
                color: '#00ff41',
                textShadow: '0 0 10px rgba(0,255,65,0.7), 0 0 20px rgba(0,255,65,0.3)',
                letterSpacing: '0.12em',
              }}
            >
              {config.name}
            </h1>
            <p
              className="display-text leading-none mt-0.5"
              style={{ fontSize: '0.65rem', color: 'rgba(0,255,65,0.4)', letterSpacing: '0.1em' }}
            >
              {config.sub}
            </p>
          </div>

          <button
            onClick={e => { e.stopPropagation(); toggleMode(); }}
            title={isDiscreet ? 'Show real name' : 'Discreet mode'}
            className="p-1 transition-all opacity-0 group-hover/logo:opacity-100"
            style={{ color: 'rgba(0,255,65,0.3)' }}
          >
            {isDiscreet
              ? <Eye className="w-3 h-3" />
              : <EyeOff className="w-3 h-3" />
            }
          </button>
        </div>

        {/* Nav Items */}
        <nav className="flex items-center gap-0.5">
          {NAV.map(({ path, label, icon: Icon, pro }) => {
            const active = location === path || (path !== '/' && location.startsWith(path));
            const locked = pro && !isPro;
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className="flex items-center gap-1.5 px-3 py-2 transition-all"
                style={{
                  fontFamily: "'Share Tech Mono', monospace",
                  fontSize: '0.65rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: active
                    ? '#00ff41'
                    : locked
                      ? 'rgba(0,255,65,0.25)'
                      : 'rgba(0,255,65,0.5)',
                  background: active ? 'rgba(0,255,65,0.1)' : 'transparent',
                  border: active ? '1px solid rgba(0,255,65,0.35)' : '1px solid transparent',
                  textShadow: active ? '0 0 8px rgba(0,255,65,0.5)' : 'none',
                  boxShadow: active ? '0 0 10px rgba(0,255,65,0.1)' : 'none',
                }}
                onMouseEnter={e => {
                  if (!active) {
                    (e.currentTarget as HTMLButtonElement).style.color = 'rgba(0,255,65,0.8)';
                    (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,255,65,0.05)';
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    (e.currentTarget as HTMLButtonElement).style.color = locked ? 'rgba(0,255,65,0.25)' : 'rgba(0,255,65,0.5)';
                    (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  }
                }}
              >
                <Icon className="w-3 h-3" />
                {label}
                {locked && (
                  <span
                    style={{
                      fontSize: '0.55rem',
                      fontFamily: "'VT323', monospace",
                      color: 'rgba(0,255,65,0.4)',
                      border: '1px solid rgba(0,255,65,0.2)',
                      padding: '0 3px',
                      letterSpacing: '0.1em',
                    }}
                  >
                    PRO
                  </span>
                )}
              </button>
            );
          })}

          {!isPro && (
            <button
              onClick={() => navigate('/upgrade')}
              className="flex items-center gap-1.5 px-3 py-2 ml-1 transition-all"
              style={{
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: '0.65rem',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: '#00ff41',
                border: '1px solid rgba(0,255,65,0.5)',
                background: 'rgba(0,255,65,0.1)',
                boxShadow: '0 0 10px rgba(0,255,65,0.1)',
                textShadow: '0 0 8px rgba(0,255,65,0.5)',
              }}
            >
              <Zap className="w-3 h-3" />
              UPGRADE
            </button>
          )}

          {/* Auth */}
          <div
            className="ml-2 pl-2 flex items-center gap-2"
            style={{ borderLeft: '1px solid rgba(0,255,65,0.15)' }}
          >
            {isLoading ? (
              <div
                className="w-7 h-7 animate-pulse"
                style={{ background: 'rgba(0,255,65,0.1)', border: '1px solid rgba(0,255,65,0.2)' }}
              />
            ) : isAuthenticated && user ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate('/profile')}
                  className="flex items-center gap-2 transition-opacity hover:opacity-80"
                  title="My account"
                >
                  {user.profileImageUrl ? (
                    <img
                      src={user.profileImageUrl}
                      alt={user.firstName ?? 'User'}
                      className="w-7 h-7 object-cover"
                      style={{ border: '1px solid rgba(0,255,65,0.4)' }}
                    />
                  ) : (
                    <div
                      className="w-7 h-7 flex items-center justify-center display-text text-sm"
                      style={{
                        border: '1px solid rgba(0,255,65,0.4)',
                        background: 'rgba(0,255,65,0.08)',
                        color: '#00ff41',
                        textShadow: '0 0 8px rgba(0,255,65,0.5)',
                      }}
                    >
                      {(user.firstName?.[0] ?? user.email?.[0] ?? '?').toUpperCase()}
                    </div>
                  )}
                  <div className="hidden sm:block text-right">
                    <p
                      className="leading-none"
                      style={{ fontSize: '0.7rem', color: 'rgba(0,255,65,0.8)', fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.05em' }}
                    >
                      {user.firstName ?? user.email?.split('@')[0] ?? 'USER'}
                    </p>
                    {user.email && (
                      <p
                        className="leading-none mt-0.5"
                        style={{ fontSize: '0.6rem', color: 'rgba(0,255,65,0.35)', fontFamily: "'Share Tech Mono', monospace" }}
                      >
                        {user.email}
                      </p>
                    )}
                  </div>
                </button>
                <button
                  onClick={logout}
                  title="Disconnect"
                  className="flex items-center gap-1 px-2 py-1.5 transition-all"
                  style={{ color: 'rgba(0,255,65,0.3)', fontFamily: "'Share Tech Mono', monospace", fontSize: '0.65rem' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,50,50,0.8)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(0,255,65,0.3)'; }}
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={login}
                className="flex items-center gap-1.5 px-3 py-1.5 transition-all"
                style={{
                  fontFamily: "'Share Tech Mono', monospace",
                  fontSize: '0.65rem',
                  letterSpacing: '0.1em',
                  color: '#00ff41',
                  border: '1px solid rgba(0,255,65,0.4)',
                  background: 'rgba(0,255,65,0.08)',
                  textTransform: 'uppercase',
                }}
              >
                <LogIn className="w-3.5 h-3.5" />
                CONNECT
              </button>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
