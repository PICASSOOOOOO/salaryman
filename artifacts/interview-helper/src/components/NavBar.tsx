import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';

export function NavBar({ previewMode = false }: { previewMode?: boolean } = {}) {
  const [location, navigate] = useLocation();
  const { isAuthenticated, login, logout } = useAuth();
  const pathname = location.split('?')[0];

  const go = (path: string) => {
    if (!previewMode) navigate(path);
  };

  const directLinks = [
    { label: 'WORK', path: '/business' },
    { label: 'CALLL', path: '/phone' },
    { label: 'DESKTOP', path: '/desktop' },
  ];

  return (
    <header className="app-header desktop-app-nav relative z-50 shrink-0 bg-[#FAFAF7]">
      <div className="flex h-14 items-center justify-between gap-4 px-6 max-w-7xl mx-auto">
        <button
          type="button"
          onClick={() => go('/')}
          className="flex shrink-0 items-center gap-3 text-black"
          aria-label="SALARYMAN home"
        >
          <span className="font-sans font-bold text-sm tracking-[0.2em] uppercase">SALARYMAN</span>
        </button>

        <nav className="hidden items-center gap-6 sm:flex text-black" aria-label="Main navigation">
          {directLinks.map(item => {
            const active = pathname === item.path || pathname.startsWith(`${item.path}/`);
            return (
              <button
                type="button"
                key={item.path}
                onClick={() => go(item.path)}
                className={`font-sans font-bold text-[11px] tracking-widest uppercase transition-opacity ${
                  active ? 'opacity-100' : 'opacity-40 hover:opacity-100'
                }`}
              >
                {item.label}
              </button>
            );
          })}

          <div className="w-px h-3 bg-black/10 mx-2" />

          {isAuthenticated ? (
            <>
              <button
                type="button"
                onClick={() => go('/profile')}
                className="font-sans font-bold text-[11px] tracking-widest uppercase opacity-40 hover:opacity-100"
              >
                ACCOUNT
              </button>
              <button
                type="button"
                onClick={() => !previewMode && logout()}
                className="font-sans font-bold text-[11px] tracking-widest uppercase opacity-40 hover:opacity-100"
              >
                LOG OUT
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => !previewMode && login()}
              className="font-sans font-bold text-[11px] tracking-widest uppercase opacity-40 hover:opacity-100"
            >
              LOG IN
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}