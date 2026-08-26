import { useEffect, useState } from 'react';
import { useAuth } from '@workspace/replit-auth-web';
import { useBoomerMode } from '@/hooks/use-mobile';

interface AuthProviders {
  replit: boolean;
  discord: boolean;
  github: boolean;
}

// Asks the server which login methods are usable for the current host so we can
// hide buttons that would just dead-end (e.g. GitHub on a host with no OAuth
// App). Defaults to all-enabled until the fetch resolves so a slow/failed probe
// never strands a user with zero sign-in options.
function useAuthProviders(): AuthProviders {
  const [providers, setProviders] = useState<AuthProviders>({
    replit: true,
    discord: true,
    github: true,
  });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/providers', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<Partial<AuthProviders>>;
      })
      .then((data) => {
        if (cancelled) return;
        setProviders({
          replit: data.replit !== false,
          discord: !!data.discord,
          github: !!data.github,
        });
      })
      .catch(() => {
        /* keep optimistic defaults so sign-in is never fully hidden */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return providers;
}

const FONT = "var(--font-sans)";
const FONT_VT = "var(--font-sans)";

function fontFor(boomer: boolean) {
  return boomer ? undefined : FONT;
}
function fontForVT(boomer: boolean) {
  return boomer ? undefined : FONT_VT;
}

const DISCORD_BLURPLE = '#5865F2';
const GITHUB_FG = '#e6edf3';

function DiscordIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 127.14 96.36" fill="currentColor" aria-hidden="true">
      <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z" />
    </svg>
  );
}

function GithubIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

interface SignInPromptProps {
  context?: string;
  onDismiss?: () => void;
  inline?: boolean;
  // Where to land the user AFTER a successful sign-in. When set, every sign-in
  // method (primary / Discord / GitHub) carries it as the OAuth returnTo so the
  // user comes back to this exact page instead of the app base. The Console
  // passes "/console" so powering on the terminal -> sign in -> back to the
  // terminal, never bounced to the nebula front door.
  returnTo?: string;
}

export function SignInPrompt({ context, onDismiss, inline, returnTo }: SignInPromptProps) {
  const { login, loginWithDiscord, loginWithGithub } = useAuth();
  const [boomer] = useBoomerMode();
  const providers = useAuthProviders();
  const signInPrimary = () => login(returnTo);
  const signInDiscord = () => loginWithDiscord(returnTo);
  const signInGithub = () => loginWithGithub(returnTo);

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
        {providers.discord && (
          <button
            onClick={signInDiscord}
            style={{
              fontFamily: fontFor(boomer), fontSize: '0.7rem', color: DISCORD_BLURPLE,
              border: `1px solid ${DISCORD_BLURPLE}66`, padding: '8px 20px', marginTop: '10px',
              background: `${DISCORD_BLURPLE}14`, cursor: 'pointer', letterSpacing: '0.1em',
              transition: 'all 0.2s', display: 'inline-flex', alignItems: 'center', gap: '8px',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = `${DISCORD_BLURPLE}29`; e.currentTarget.style.borderColor = `${DISCORD_BLURPLE}99`; }}
            onMouseLeave={e => { e.currentTarget.style.background = `${DISCORD_BLURPLE}14`; e.currentTarget.style.borderColor = `${DISCORD_BLURPLE}66`; }}
          >
            <DiscordIcon /> CONTINUE WITH DISCORD
          </button>
        )}
        {providers.github && (
          <button
            onClick={signInGithub}
            style={{
              fontFamily: fontFor(boomer), fontSize: '0.7rem', color: GITHUB_FG,
              border: `1px solid ${GITHUB_FG}44`, padding: '8px 20px', marginTop: '10px',
              background: `${GITHUB_FG}0f`, cursor: 'pointer', letterSpacing: '0.1em',
              transition: 'all 0.2s', display: 'inline-flex', alignItems: 'center', gap: '8px',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = `${GITHUB_FG}1f`; e.currentTarget.style.borderColor = `${GITHUB_FG}88`; }}
            onMouseLeave={e => { e.currentTarget.style.background = `${GITHUB_FG}0f`; e.currentTarget.style.borderColor = `${GITHUB_FG}44`; }}
          >
            <GithubIcon /> CONTINUE WITH GITHUB
          </button>
        )}
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

        {providers.discord && (
          <button
            onClick={signInDiscord}
            style={{
              fontFamily: fontFor(boomer), fontSize: '0.72rem', color: '#fff',
              border: `1px solid ${DISCORD_BLURPLE}`, padding: '10px 32px', marginTop: '10px',
              background: DISCORD_BLURPLE, cursor: 'pointer', letterSpacing: '0.12em',
              width: '100%', transition: 'all 0.2s',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#4752c4'; e.currentTarget.style.borderColor = '#4752c4'; }}
            onMouseLeave={e => { e.currentTarget.style.background = DISCORD_BLURPLE; e.currentTarget.style.borderColor = DISCORD_BLURPLE; }}
          >
            <DiscordIcon size={16} /> CONTINUE WITH DISCORD
          </button>
        )}

        {providers.github && (
          <button
            onClick={signInGithub}
            style={{
              fontFamily: fontFor(boomer), fontSize: '0.72rem', color: GITHUB_FG,
              border: '1px solid #30363d', padding: '10px 32px', marginTop: '10px',
              background: '#161b22', cursor: 'pointer', letterSpacing: '0.12em',
              width: '100%', transition: 'all 0.2s',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#21262d'; e.currentTarget.style.borderColor = '#8b949e'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#161b22'; e.currentTarget.style.borderColor = '#30363d'; }}
          >
            <GithubIcon size={16} /> CONTINUE WITH GITHUB
          </button>
        )}

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
