import { useAuth } from '@/hooks/use-auth';

interface SignInPromptProps {
  context?: string;
  onDismiss?: () => void;
  inline?: boolean;
  // Where to land the user after sign-in completes.
  returnTo?: string;
}

export function SignInPrompt({ context, onDismiss, inline, returnTo }: SignInPromptProps) {
  const { login } = useAuth();
  const currentPath = `${window.location.pathname}${window.location.search}`;
  const signInPrimary = () => login(returnTo ?? currentPath);

  if (inline) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="font-sans text-xs tracking-widest text-black/40 mb-2 uppercase">
          ACCESS RESTRICTED
        </div>
        <div className="font-sans text-sm text-black/60 mb-8 max-w-[320px] leading-relaxed">
          {context || 'Authentication required to access this area.'}
        </div>
        <button
          onClick={signInPrimary}
          className="font-sans text-xs font-bold tracking-widest uppercase bg-black text-white px-8 py-3 hover:bg-black/80 transition-colors"
        >
          SIGN IN
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={onDismiss}
      className="fixed inset-0 z-[99999] bg-black/10 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-[#FAFAF7] border border-black/10 p-10 max-w-[380px] w-full text-center shadow-2xl flex flex-col items-center"
      >
        <div className="font-sans font-bold text-xl tracking-widest uppercase mb-6">
          AUTHENTICATE
        </div>

        <div className="w-12 h-px bg-black/20 mb-6" />

        <div className="font-sans text-sm text-black/60 mb-8 leading-relaxed">
          {context || 'Credentials required. Area locked until authenticated.'}
        </div>

        <button
          onClick={signInPrimary}
          className="w-full font-sans text-xs font-bold tracking-widest uppercase bg-black text-white px-8 py-4 hover:bg-black/80 transition-colors mb-4"
        >
          SIGN IN
        </button>

        {onDismiss && (
          <button
            onClick={onDismiss}
            className="w-full font-sans text-[10px] tracking-widest uppercase text-black/40 hover:text-black transition-colors py-2"
          >
            DISMISS
          </button>
        )}
      </div>
    </div>
  );
}

export function SignInPage({ context, returnTo }: { context?: string; returnTo?: string }) {
  return (
    <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
      <SignInPrompt inline context={context} returnTo={returnTo} />
    </div>
  );
}
