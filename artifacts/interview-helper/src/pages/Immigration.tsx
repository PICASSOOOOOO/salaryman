import { useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@workspace/replit-auth-web';
import { PabloOnboarding, type OnboardingAnswers } from '@/components/PabloOnboarding';
import { isTutorialDone, markTutorialDone, getSalarymanName } from '@/lib/tutorial-progress';

const SAVE_KEY = 'sm_save';

function persistImmigrationToSave(answers: OnboardingAnswers): void {
  if (typeof window === 'undefined') return;
  let prior: Record<string, unknown> = {};
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') prior = parsed as Record<string, unknown>;
    }
  } catch {
    prior = {};
  }
  const isBiz = answers.bizPath === 'business';
  const merged = {
    ...prior,
    name: answers.playerName,
    pabloOnboardingDone: true,
    perception: answers.perception ?? 5,
    hasBusiness: isBiz,
    bizType: isBiz ? answers.businessType : 'unemployed',
    company: isBiz ? answers.companyName : null,
    industry: isBiz ? answers.industry : null,
  };
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(merged));
  } catch {
    // Quota or private mode — non-fatal. WorldPlay will re-collect if needed.
  }
}

export default function Immigration() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [, navigate] = useLocation();
  const completedRef = useRef(false);

  // Gate: anonymous users go back to the terminal so Pablo can take their
  // name + email + sign-in. Already-cleared users skip this entirely.
  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      navigate('/pablo', { replace: true });
      return;
    }
    if (isTutorialDone()) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  const charName = useMemo<string>(() => {
    const fromTerminal = (getSalarymanName() ?? '').trim();
    if (fromTerminal) return fromTerminal.toUpperCase();
    const first = (user?.firstName ?? '').trim();
    const last = (user?.lastName ?? '').trim();
    const full = [first, last].filter(Boolean).join(' ');
    return (full || 'OPERATIVE').toUpperCase();
  }, [user]);

  const handleComplete = (answers: OnboardingAnswers) => {
    if (completedRef.current) return;
    completedRef.current = true;
    persistImmigrationToSave(answers);
    markTutorialDone();
    navigate('/', { replace: true });
  };

  if (isLoading || !isAuthenticated || isTutorialDone()) {
    return (
      <div style={{
        minHeight: '100vh', width: '100vw',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#04060a', color: 'rgba(56,189,248,.55)',
        fontFamily: "'Share Tech Mono',monospace", fontSize: '.7rem', letterSpacing: '.2em',
      }}>
        &gt; CONNECTING TO IMMIGRATION DESK...
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'radial-gradient(ellipse at center, rgba(20,12,30,.55) 0%, #03060c 75%)',
      overflow: 'hidden',
    }}>
      <ImmigrationBackdrop />
      <PabloOnboarding
        charName={charName}
        charClass="ARRIVAL"
        onComplete={handleComplete}
      />
    </div>
  );
}

function ImmigrationBackdrop() {
  const VT: React.CSSProperties = { fontFamily: "'VT323',monospace" };
  const ST: React.CSSProperties = { fontFamily: "'Share Tech Mono',monospace" };
  return (
    <>
      <style>{`
        @keyframes scanline-immig {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
        @keyframes badge-pulse {
          0%, 100% { box-shadow: 0 0 8px rgba(56,189,248,.25); }
          50% { box-shadow: 0 0 22px rgba(56,189,248,.55); }
        }
        @keyframes stamp-flicker {
          0%, 92%, 100% { opacity: .5; }
          93%, 96% { opacity: .15; }
        }
      `}</style>

      {/* CRT scanline sweep */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'linear-gradient(rgba(56,189,248,.05), transparent)',
        height: '4px',
        animation: 'scanline-immig 6s linear infinite',
        zIndex: 5,
      }} />

      {/* Top stripe — "BORDER CONTROL" */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        padding: '.6rem 1.1rem',
        borderBottom: '1px solid rgba(56,189,248,.25)',
        background: 'linear-gradient(180deg, rgba(56,189,248,.06), transparent)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        zIndex: 10,
      }}>
        <div style={{
          ...VT, fontSize: '1.05rem', color: '#7dd3fc', letterSpacing: '.32em',
          textShadow: '0 0 10px rgba(56,189,248,.45)',
        }}>
          ━━ MINX CITY · BORDER CONTROL ━━
        </div>
        <div style={{
          ...ST, fontSize: '.55rem', color: 'rgba(56,189,248,.5)', letterSpacing: '.18em',
        }}>
          LANE 03 · OFFICER: PABLO
        </div>
      </div>

      {/* Left column — instructions / signage */}
      <div style={{
        position: 'absolute', top: '4rem', left: '1.1rem',
        width: 240, maxWidth: '32vw',
        ...ST, fontSize: '.55rem', color: 'rgba(125,211,252,.5)',
        letterSpacing: '.1em', lineHeight: 1.9,
        zIndex: 6,
      }}>
        <div style={{ color: 'rgba(56,189,248,.85)', marginBottom: '.4rem', letterSpacing: '.22em' }}>
          &gt; ENTRY PROCEDURE
        </div>
        <div>01 · STATE YOUR NAME</div>
        <div>02 · DECLARE CONTACT EMAIL</div>
        <div>03 · DECLARE INTENT</div>
        <div>04 · FILE COMPANY (IF ANY)</div>
        <div style={{ marginTop: '.7rem', color: 'rgba(56,189,248,.4)' }}>
          NO ENTRY WITHOUT FILING.<br/>
          MISREPRESENTATION = DEPORTATION.
        </div>
      </div>

      {/* Right column — pulsing badge */}
      <div style={{
        position: 'absolute', top: '4rem', right: '1.1rem',
        width: 200, maxWidth: '30vw',
        ...ST, fontSize: '.55rem', color: 'rgba(125,211,252,.5)',
        letterSpacing: '.1em', textAlign: 'right', lineHeight: 1.9,
        zIndex: 6,
      }}>
        <div style={{
          display: 'inline-block', padding: '.5rem .75rem',
          border: '1px solid rgba(56,189,248,.5)',
          background: 'rgba(56,189,248,.05)',
          animation: 'badge-pulse 2.4s ease-in-out infinite',
          marginBottom: '.5rem',
        }}>
          <div style={{ ...VT, fontSize: '.95rem', color: '#7dd3fc', letterSpacing: '.18em' }}>
            PABLO CORP
          </div>
          <div style={{ fontSize: '.5rem', color: 'rgba(56,189,248,.6)', letterSpacing: '.14em' }}>
            REGISTRY · OFFICIAL
          </div>
        </div>
        <div style={{ color: 'rgba(56,189,248,.4)' }}>
          ALL ARRIVALS PROCESSED.<br/>
          NO EXCEPTIONS.
        </div>
      </div>

      {/* Bottom stripe — disclaimer */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '.45rem 1.1rem',
        borderTop: '1px solid rgba(56,189,248,.18)',
        background: 'linear-gradient(0deg, rgba(56,189,248,.04), transparent)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        ...ST, fontSize: '.5rem', color: 'rgba(56,189,248,.45)', letterSpacing: '.16em',
        zIndex: 10,
      }}>
        <div>FILING IS MANDATORY · CITY ACCESS DENIED UNTIL CLEARED</div>
        <div style={{ animation: 'stamp-flicker 3.2s linear infinite' }}>
          ● PROCESSING
        </div>
      </div>
    </>
  );
}
