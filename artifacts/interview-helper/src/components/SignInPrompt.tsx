import { useAuth } from '@/hooks/use-auth';
import { useBoomerMode } from '@/hooks/use-mobile';

const FONT = "var(--font-sans)";
const FONT_VT = "var(--font-sans)";

function fontFor(boomer: boolean) {
  return boomer ? undefined : FONT;
}
function fontForVT(boomer: boolean) {
  return boomer ? undefined : FONT_VT;
}

interface SignInPromptProps {
  context?: string;
  onDismiss?: () => void;
  inline?: boolean;
  // Where to land the user after sign-in completes.
  returnTo?: string;
}

export function SignInPrompt({ context, onDismiss, inline, returnTo }: SignInPromptProps) {
  const { login } = useAuth();
  const [boomer] = useBoomerMode();
  const currentPath = `${window.location.pathname}${window.location.search}`;
  const signInPrimary = () => login(returnTo ?? currentPath);

  if (inline) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '3rem 1.5rem', textAlign: 'center',
      }}>
        <div style={{ fontFamily: fontFor(boomer), color: '#000', fontSize: '0.85rem', fontWeight: 800, letterSpacing: '0.1em', marginBottom: '8px' }}>
          SIGN IN REQUIRED
        </div>
        <div style={{ fontFamily: fontFor(boomer), fontSize: '0.7rem', color: 'rgba(0,0,0,0.58)', letterSpacing: '0.04em', marginBottom: '20px', maxWidth: 320, lineHeight: 1.6 }}>
          {context || (boomer ? 'Sign in to access this feature.' : 'Authentication required to access this module.')}
        </div>
        <button
          onClick={signInPrimary}
          style={{
            fontFamily: fontFor(boomer), fontSize: '0.7rem', color: '#FAFAF7',
            border: '1px solid #000', padding: '9px 24px',
            background: '#000', cursor: 'pointer', letterSpacing: '0.12em',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#2A2A2A'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#000'; }}
        >
          SIGN IN
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: 'rgba(250,250,247,0.94)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#FFFCF5', border: '1px solid #000',
          padding: '2.5rem 2rem', maxWidth: 380, width: '90%', textAlign: 'center',
          boxShadow: '6px 6px 0 #000',
        }}
      >
        <div style={{
          fontFamily: fontForVT(boomer), fontSize: '1.35rem', color: '#000',
          fontWeight: 800,
          letterSpacing: '0.2em', marginBottom: '6px',
        }}>
          SIGN IN
        </div>

        <div style={{
          width: '60px', height: '1px', margin: '0 auto 16px',
          background: '#000',
        }} />

        <div style={{
          fontFamily: fontFor(boomer), fontSize: '0.65rem',
          color: 'rgba(0,0,0,0.58)', letterSpacing: '0.06em',
          lineHeight: 1.7, marginBottom: '24px',
        }}>
          {context || (boomer
            ? 'Sign in to access all features.'
            : 'Salaryman credentials required. All modules locked until authenticated.'
          )}
        </div>

        <button
          onClick={signInPrimary}
          style={{
            fontFamily: fontFor(boomer), fontSize: '0.75rem', color: '#FAFAF7',
            border: '1px solid #000', padding: '10px 32px',
            background: '#000', cursor: 'pointer', letterSpacing: '0.15em',
            width: '100%', transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#2A2A2A'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#000'; }}
        >
          SIGN IN
        </button>


        {onDismiss && (
          <button
            onClick={onDismiss}
            style={{
              fontFamily: fontFor(boomer), fontSize: '0.55rem',
              color: 'rgba(0,0,0,0.5)', background: 'none', border: 'none',
              cursor: 'pointer', marginTop: '16px', letterSpacing: '0.1em',
              display: 'block', width: '100%',
            }}
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
    <div style={{ minHeight: '100vh', background: '#FAFAF7', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <SignInPrompt inline context={context} returnTo={returnTo} />
    </div>
  );
}
