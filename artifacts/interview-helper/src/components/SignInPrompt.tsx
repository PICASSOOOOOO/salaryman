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
  const signInPrimary = () => login(returnTo);

  if (inline) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '3rem 1.5rem', textAlign: 'center',
      }}>
        <div style={{ fontFamily: fontFor(boomer), color: 'rgba(56,189,248,0.5)', fontSize: '0.85rem', letterSpacing: '0.1em', marginBottom: '8px' }}>
          {boomer ? 'SIGN IN REQUIRED' : 'ACCESS RESTRICTED'}
        </div>
        <div style={{ fontFamily: fontFor(boomer), fontSize: '0.6rem', color: 'rgba(56,189,248,0.3)', letterSpacing: '0.08em', marginBottom: '20px', maxWidth: 320, lineHeight: 1.6 }}>
          {context || (boomer ? 'Sign in to access this feature.' : 'Authentication required to access this module.')}
        </div>
        <button
          onClick={signInPrimary}
          style={{
            fontFamily: fontFor(boomer), fontSize: '0.7rem', color: '#38bdf8',
            border: '1px solid rgba(56,189,248,0.4)', padding: '8px 24px',
            background: 'rgba(56,189,248,0.06)', cursor: 'pointer', letterSpacing: '0.12em',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(56,189,248,0.12)'; e.currentTarget.style.borderColor = 'rgba(56,189,248,0.6)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(56,189,248,0.06)'; e.currentTarget.style.borderColor = 'rgba(56,189,248,0.4)'; }}
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
        background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#0a0a0b', border: '1px solid rgba(56,189,248,0.2)',
          padding: '2.5rem 2rem', maxWidth: 380, width: '90%', textAlign: 'center',
          boxShadow: '0 0 40px rgba(56,189,248,0.05)',
        }}
      >
        <div style={{
          fontFamily: fontForVT(boomer), fontSize: '1.6rem', color: '#38bdf8',
          letterSpacing: '0.2em', marginBottom: '6px',
          textShadow: '0 0 15px rgba(56,189,248,0.3)',
        }}>
          {boomer ? 'SIGN IN' : 'AUTHENTICATE'}
        </div>

        <div style={{
          width: '60px', height: '1px', margin: '0 auto 16px',
          background: 'linear-gradient(90deg, transparent, rgba(56,189,248,0.3), transparent)',
        }} />

        <div style={{
          fontFamily: fontFor(boomer), fontSize: '0.65rem',
          color: 'rgba(56,189,248,0.4)', letterSpacing: '0.08em',
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
            fontFamily: fontFor(boomer), fontSize: '0.75rem', color: '#38bdf8',
            border: '1px solid rgba(56,189,248,0.5)', padding: '10px 32px',
            background: 'rgba(56,189,248,0.08)', cursor: 'pointer', letterSpacing: '0.15em',
            width: '100%', transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(56,189,248,0.15)'; e.currentTarget.style.borderColor = 'rgba(56,189,248,0.7)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(56,189,248,0.08)'; e.currentTarget.style.borderColor = 'rgba(56,189,248,0.5)'; }}
        >
          SIGN IN
        </button>


        {onDismiss && (
          <button
            onClick={onDismiss}
            style={{
              fontFamily: fontFor(boomer), fontSize: '0.55rem',
              color: 'rgba(56,189,248,0.25)', background: 'none', border: 'none',
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
    <div style={{ minHeight: '100vh', background: '#09090b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <SignInPrompt inline context={context} returnTo={returnTo} />
    </div>
  );
}
