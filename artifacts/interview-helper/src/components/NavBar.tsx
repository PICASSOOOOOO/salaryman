import { Terminal, Users, Presentation, LogIn, LogOut, Eye, EyeOff } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAuth } from '@workspace/replit-auth-web';
import { useAppMode } from '../hooks/use-app-mode';

export function NavBar() {
  const [location, navigate] = useLocation();
  const { user, isLoading, isAuthenticated, login, logout } = useAuth();
  const { mode, config, toggleMode, isDiscreet } = useAppMode();

  const NAV = [
    { path: '/', label: config.navLabel, icon: Terminal },
    { path: '/presenter', label: 'Presenter', icon: Presentation },
    { path: '/contacts', label: 'Contacts', icon: Users },
  ];

  return (
    <header className="h-14 border-b border-border flex items-center justify-between px-5 shrink-0 bg-background/60 backdrop-blur-xl z-20 relative">
      <div className="flex items-center gap-2 group/logo">
        <div
          className="flex items-center gap-3 text-foreground cursor-pointer"
          onClick={() => navigate('/')}
        >
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
            <Terminal className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <h1 className="font-bold tracking-tight leading-none text-sm">{config.name}</h1>
            <p className="text-[9px] text-muted-foreground font-mono mt-0.5">{config.sub}</p>
          </div>
        </div>

        <button
          onClick={toggleMode}
          title={isDiscreet ? 'Show real name' : 'Discreet mode'}
          className="p-1 rounded text-muted-foreground/30 hover:text-muted-foreground hover:bg-secondary/60 transition-all opacity-0 group-hover/logo:opacity-100 focus:opacity-100"
        >
          {isDiscreet
            ? <Eye className="w-3 h-3" />
            : <EyeOff className="w-3 h-3" />
          }
        </button>
      </div>

      <nav className="flex items-center gap-1">
        {NAV.map(({ path, label, icon: Icon }) => {
          const active = location === path || (path !== '/' && location.startsWith(path));
          return (
            <button key={path} onClick={() => navigate(path)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
                ${active
                  ? 'bg-primary/20 text-primary border border-primary/25'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}>
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          );
        })}

        <div className="ml-2 pl-2 border-l border-border flex items-center gap-2">
          {isLoading ? (
            <div className="w-7 h-7 rounded-full bg-muted animate-pulse" />
          ) : isAuthenticated && user ? (
            <div className="flex items-center gap-2">
              {user.profileImageUrl ? (
                <img src={user.profileImageUrl} alt={user.firstName ?? 'User'}
                  className="w-7 h-7 rounded-full border border-border object-cover" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary">
                  {(user.firstName?.[0] ?? user.email?.[0] ?? '?').toUpperCase()}
                </div>
              )}
              <div className="hidden sm:block text-right">
                <p className="text-xs font-medium text-foreground leading-none">
                  {user.firstName ?? user.email?.split('@')[0] ?? 'User'}
                </p>
                {user.email && (
                  <p className="text-[10px] text-muted-foreground leading-none mt-0.5">{user.email}</p>
                )}
              </div>
              <button onClick={logout}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Sign out">
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button onClick={login}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary/10 text-primary border border-primary/25 hover:bg-primary/20 transition-colors">
              <LogIn className="w-3.5 h-3.5" />
              Sign in
            </button>
          )}
        </div>
      </nav>
    </header>
  );
}
