import { useLocation } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { resolveAvatarUrl } from '@/lib/avatar';
import {
  canGoBackInApp,
  getAppBackPath,
  consumeAppReturnPath,
} from '@/lib/app-navigation';

export function MobileModuleNav() {
  const [location, navigate] = useLocation();
  const { isAuthenticated, user, login } = useAuth();

  const goBack = () => {
    if (canGoBackInApp()) window.history.back();
    else navigate(consumeAppReturnPath() ?? getAppBackPath(isAuthenticated), { replace: true });
  };

  return (
    <div className="mobile-app-nav-top fixed top-0 left-0 right-0 h-12 flex items-center justify-between px-4 z-50 bg-[#FAFAF7]">
      <div className="flex items-center gap-4">
        <button onClick={goBack} className="flex items-center justify-center text-black" aria-label="Go back">
          <ArrowLeft strokeWidth={1.5} className="w-5 h-5" />
        </button>
        <div className="font-sans font-bold text-xs uppercase tracking-widest text-black">SALARYMAN</div>
      </div>
      <div className="flex items-center">
        {isAuthenticated ? (
          <button onClick={() => navigate('/profile')} className="flex items-center justify-center w-7 h-7 rounded-full bg-black text-[#FAFAF7] overflow-hidden">
            {resolveAvatarUrl(user?.profileImageUrl) ? (
              <img src={resolveAvatarUrl(user?.profileImageUrl)} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-[10px] font-bold">{(user?.firstName?.[0] ?? user?.email?.[0] ?? '?').toUpperCase()}</span>
            )}
          </button>
        ) : (
          <button onClick={() => login()} className="text-[10px] font-bold uppercase tracking-widest text-black">
            LOGIN
          </button>
        )}
      </div>
    </div>
  );
}

export function MobileSubNav() {
  return null;
}

export function MobileBottomBar() {
  return null;
}
