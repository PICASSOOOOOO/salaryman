import { Terminal, Users, Presentation } from 'lucide-react';
import { useLocation } from 'wouter';

const NAV = [
  { path: '/', label: 'DevDocs', icon: Terminal },
  { path: '/presenter', label: 'Presenter', icon: Presentation },
  { path: '/contacts', label: 'Contacts', icon: Users },
];

export function NavBar() {
  const [location, navigate] = useLocation();

  return (
    <header className="h-14 border-b border-border flex items-center justify-between px-5 shrink-0 bg-background/60 backdrop-blur-xl z-20 relative">
      <div className="flex items-center gap-3 text-foreground cursor-pointer" onClick={() => navigate('/')}>
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
          <Terminal className="w-3.5 h-3.5 text-white" />
        </div>
        <div>
          <h1 className="font-bold tracking-tight leading-none text-sm">DevDocs</h1>
          <p className="text-[9px] text-muted-foreground font-mono mt-0.5">v3.1.2 — reference</p>
        </div>
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
      </nav>
    </header>
  );
}
