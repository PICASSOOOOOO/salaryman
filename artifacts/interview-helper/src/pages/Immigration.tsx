import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@workspace/replit-auth-web';
import { PabloOnboarding, type OnboardingAnswers } from '@/components/PabloOnboarding';
import { PostOnboardingIntro } from '@/components/PostOnboardingIntro';
import { WakeUpScene } from '@/components/WakeUpScene';
import { isTutorialDone, markTutorialDone, getSalarymanName, setSalarymanOfficeTier } from '@/lib/tutorial-progress';
import { useIsMobile } from '@/hooks/use-mobile';
import { PabloNebula3D } from '@/components/PabloNebula3D';

const SAVE_KEY = 'sm_save';

interface HousingChargeResult {
  alreadyCharged: boolean;
  tierId?: string;
  tierLabel?: string;
  deskLabel?: string;
  capsuleLabel?: string;
  deskRent: number;
  capsuleRent: number;
  totalRent: number;
  paid: number;
  remainingBalance: number;
  addedToDebt: number;
  currentDebt: number;
  taxCollectorIncoming: boolean;
}

function readSave(): Record<string, unknown> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function writeSave(merged: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(merged));
  } catch {
    // Quota / private mode — non-fatal. WorldPlay will reconcile from server state.
  }
}

function persistRegistry(answers: OnboardingAnswers): void {
  const prior = readSave();
  const isBiz = answers.bizPath === 'business';
  writeSave({
    ...prior,
    name: answers.playerName,
    pabloOnboardingDone: true,
    perception: answers.perception ?? 5,
    hasBusiness: isBiz,
    bizType: isBiz ? answers.businessType : 'unemployed',
    company: isBiz ? answers.companyName : null,
    industry: isBiz ? answers.industry : null,
    officeTier: answers.officeTier,
    declaredMonthlyIncome: answers.declaredMonthlyIncome ?? 0,
    employeeCount: isBiz ? (answers.employeeCount ?? 0) : 0,
    employeeMonthlySalary: isBiz ? (answers.employeeMonthlySalary ?? 0) : 0,
  });
}

function persistHousing(out: HousingChargeResult): void {
  const prior = readSave();
  writeSave({
    ...prior,
    savings: out.alreadyCharged ? prior.savings ?? 0 : out.remainingBalance,
    housingChargedAt: Date.now(),
  });
}

// Phases:
//   wakeup    — short "wake up at your desk, late for work" opening scene.
//               Show-don't-tell replacement for the old Pablo monologue;
//               hands off to the registry intake on CLOCK IN.
//   intake    — Pablo's onboarding modal collects answers
//   stamping  — registry stamps + housing fees teletype
//   intro     — post-stamp interactive controls tutorial (move → walk to
//               the computer → press E to enter the terminal). Replaces the
//               old immediate jump into the app, which dropped users
//               straight onto a terminal screen with no transition.
//   done      — handing off to the live app via navigate('/')
type Phase = 'wakeup' | 'intake' | 'stamping' | 'intro' | 'done';

interface StampLine {
  text: string;
  color?: string;
  emphasis?: boolean;
}

export default function Immigration() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [, navigate] = useLocation();
  const completedRef = useRef(false);
  const [phase, setPhase] = useState<Phase>('wakeup');
  const [answers, setAnswers] = useState<OnboardingAnswers | null>(null);
  const [stampLines, setStampLines] = useState<StampLine[]>([]);
  const [showContinue, setShowContinue] = useState(false);

  // Gate: anonymous users go back to the bold landing (where "Play Free"
  // takes them through sign-in). Already-cleared users skip this entirely.
  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      navigate('/landing', { replace: true });
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
    return (full || 'SALARYMAN').toUpperCase();
  }, [user]);

  // PabloOnboarding completion → kick off the original "fees assessed,
  // city entered" sequence that used to fire inside WorldPlay's modal:
  // file the registry, charge first-month rent on desk + capsule, push
  // any shortfall to debt, dispatch tax collectors. We mirror it here as
  // teletype stamps so the user sees the exact same business onboarding,
  // then navigate home only after the fee receipt is on screen.
  const handleComplete = (a: OnboardingAnswers) => {
    if (completedRef.current) return;
    completedRef.current = true;
    persistRegistry(a);
    // Mirror tier into a small dedicated key so /office can reflect the
    // user's choice without parsing the whole sm_save blob.
    setSalarymanOfficeTier(a.officeTier);
    markTutorialDone();
    setAnswers(a);
    setPhase('stamping');
  };

  // Drive the stamping sequence in its own effect so the lines render in
  // order at human-readable cadence and the charge call lands midway —
  // exactly the rhythm the original modal used (filed → assessed → paid).
  // Cancellation is checked at every awaitable boundary (before AND after
  // each push, before AND after the network fetch) so React StrictMode's
  // double-mount or a user-initiated unmount can never leave a charge
  // request in flight or commit state into an unmounted tree.
  useEffect(() => {
    if (phase !== 'stamping' || !answers) return;
    let cancelled = false;
    const lines: StampLine[] = [];
    // push returns false when the effect has been cancelled, so the caller
    // can short-circuit cleanly without leaning on global flags after each
    // step. This is the architect-flagged hardening.
    const push = async (line: StampLine, delay = 700): Promise<boolean> => {
      if (cancelled) return false;
      lines.push(line);
      setStampLines([...lines]);
      await new Promise(r => setTimeout(r, delay));
      return !cancelled;
    };

    (async () => {
      const isBiz = answers.bizPath === 'business';
      if (!await push({ text: '> CONNECTION ESTABLISHED — PABLO CORP REGISTRY' })) return;
      if (!await push({
        text: isBiz
          ? `> SUBJECT: ${answers.playerName} — FILING UNDER ${answers.companyName.toUpperCase()} (${answers.businessType.toUpperCase()})`
          : `> SUBJECT: ${answers.playerName} — FILING AS UNEMPLOYED`,
      })) return;
      if (isBiz) {
        if (!await push({ text: `> INDUSTRY: ${answers.industry}` })) return;
        if (!await push({ text: `> CONTACT: ${answers.contactEmail || 'ON RECORD'}` })) return;
        const ec = answers.employeeCount ?? 0;
        const es = answers.employeeMonthlySalary ?? 0;
        if (ec > 0) {
          if (!await push({ text: `> HEADCOUNT: ${ec} ON PAYROLL @ ƒ${es.toLocaleString()}/MO EACH` })) return;
          if (!await push({ text: `> PROJECTED PAYROLL BURN: ƒ${(ec * es).toLocaleString()} / MO`, color: 'rgba(248,113,113,.85)' })) return;
        } else {
          if (!await push({ text: `> HEADCOUNT: SOLO OPERATOR — NO PAYROLL` })) return;
        }
      }
      const dms = answers.declaredMonthlyIncome ?? 0;
      if (dms > 0) {
        if (!await push({ text: `> DECLARED MONTHLY INCOME: ƒ${dms.toLocaleString()}` })) return;
      } else {
        if (!await push({ text: `> DECLARED MONTHLY INCOME: ƒ0 — FLAGGED FOR REVIEW`, color: 'rgba(250,204,21,.85)' })) return;
      }
      if (!await push({ text: '> REGISTRY ACCEPTED.', color: 'rgba(74,222,128,.85)' })) return;
      if (!await push({ text: '> ATMOSPHERE: TOXIC GAS SEAL ACTIVE — NO WALK-IN ENTRY. CLEARANCE BY PAPERWORK ONLY.', color: 'rgba(250,204,21,.85)' })) return;
      if (!await push({ text: '> ASSESSING MANDATORY ENTRY FEES...', color: 'rgba(250,204,21,.85)' }, 900)) return;

      // Bail before opening a network connection if the effect is gone —
      // prevents StrictMode double-invocation from issuing a duplicate
      // charge request (the server is idempotent, but the request still
      // costs a round-trip and shouldn't fire from a dead effect).
      if (cancelled) return;

      // Charge on the server. Brand-new arrivals walk in with ƒ0 starting
      // balance — server clamps anyway, so the worst case is full shortfall
      // → debt → tax-collector dispatch. Endpoint is idempotent so a refresh
      // here can never double-bill.
      const prior = readSave();
      const startingBalance = Math.max(0, Math.floor(Number(prior.savings ?? 0)));
      let out: HousingChargeResult | null = null;
      try {
        const r = await fetch('/api/onboard-housing/charge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ startingBalance, officeTier: answers.officeTier }),
        });
        if (r.ok) out = await r.json() as HousingChargeResult;
      } catch {
        out = null;
      }
      if (cancelled) return;

      if (!out) {
        if (!await push({
          text: '> FEE LEDGER UNREACHABLE — DEFERRED. ENTRY GRANTED PROVISIONALLY.',
          color: 'rgba(250,204,21,.85)',
        })) return;
      } else {
        persistHousing(out);
        const tierLabel = out.tierLabel ?? 'DESK + CAPSULE';
        const deskLabel = out.deskLabel ?? 'DESK TERMINAL';
        const capsuleLabel = out.capsuleLabel ?? 'SLEEPING CAPSULE';
        if (!await push({ text: `> OFFICE TIER — ${tierLabel}`, color: 'rgba(125,211,252,.9)' })) return;
        if (!await push({ text: `> ${deskLabel} — ƒ${out.deskRent.toLocaleString()} / MO` })) return;
        if (!await push({ text: `> ${capsuleLabel} — ƒ${out.capsuleRent.toLocaleString()} / MO` })) return;
        if (!await push({ text: `> TOTAL DUE — ƒ${out.totalRent.toLocaleString()}` })) return;

        if (out.alreadyCharged) {
          if (!await push({
            text: '> RECORD SHOWS PRIOR ASSESSMENT — NO ADDITIONAL CHARGE.',
            color: 'rgba(125,211,252,.9)',
          })) return;
        } else if (out.addedToDebt > 0) {
          if (!await push({ text: `> STARTING BALANCE — ƒ${startingBalance.toLocaleString()}` })) return;
          if (!await push({ text: `> PAID — ƒ${out.paid.toLocaleString()}` })) return;
          if (!await push({
            text: `> SHORTFALL — ƒ${out.addedToDebt.toLocaleString()} ROLLED INTO DEBT LEDGER`,
            color: 'rgba(248,113,113,.9)',
          })) return;
          if (!await push({
            text: '> TAX COLLECTORS DISPATCHED. THEY KNOW YOUR FACE NOW.',
            color: 'rgba(248,113,113,.95)',
            emphasis: true,
          })) return;
        } else {
          if (!await push({
            text: `> PAID IN FULL — ƒ${out.paid.toLocaleString()}. REMAINING — ƒ${out.remainingBalance.toLocaleString()}`,
            color: 'rgba(74,222,128,.85)',
          })) return;
        }
      }

      if (!await push({ text: '' }, 200)) return;
      if (!await push({
        text: `> ENTRY STAMPED. WELCOME TO MINX CITY, ${answers.playerName}.`,
        color: '#7dd3fc',
        emphasis: true,
      }, 900)) return;
      if (cancelled) return;
      setShowContinue(true);
    })();

    return () => { cancelled = true; };
  }, [phase, answers]);

  // After the stamping receipt's CONTINUE button, hand the user to the
  // post-onboarding cinematic instead of dropping them straight onto a
  // live terminal. The cinematic finishes by calling handleIntroComplete
  // below, which is the actual navigate-to-app step.
  const finishImmigration = () => {
    if (phase === 'done' || phase === 'intro') return;
    setPhase('intro');
  };

  const handleIntroComplete = () => {
    if (phase === 'done') return;
    setPhase('done');
    markTutorialDone();
    // Straight into the player's office once the controls tutorial ends. That
    // hands-on beat literally has the user "enter the terminal," so dropping
    // them into their own pixel office is the natural, no-detour next screen —
    // no jarring jump into a film right after they expected to sit down.
    // (The Rebellion manifesto film is still reachable from Home for anyone
    // who wants the lore; it's just no longer a mandatory wall in onboarding.)
    navigate('/office', { replace: true });
    // Hard-reload fallback if the SPA navigate doesn't take. Use the artifact
    // base so we land inside this app, not at host root.
    setTimeout(() => {
      const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') + '/';
      window.location.href = `${base}office`;
    }, 400);
  };

  if (isLoading || !isAuthenticated || (isTutorialDone() && (phase === 'wakeup' || phase === 'intake'))) {
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
      <ImmigrationBackdrop phase={phase} />
      {phase === 'wakeup' && (
        <WakeUpScene
          playerName={charName}
          onContinue={() => setPhase('intake')}
        />
      )}
      {phase === 'intake' && (
        <PabloOnboarding
          charName={charName}
          charClass="ARRIVAL"
          onComplete={handleComplete}
        />
      )}
      {phase === 'stamping' && (
        <StampingPanel
          lines={stampLines}
          showContinue={showContinue}
          onContinue={finishImmigration}
        />
      )}
      {phase === 'intro' && answers && (
        <PostOnboardingIntro
          playerName={answers.playerName}
          bizPath={answers.bizPath}
          onComplete={handleIntroComplete}
        />
      )}
    </div>
  );
}

function StampingPanel({
  lines, showContinue, onContinue,
}: {
  lines: StampLine[];
  showContinue: boolean;
  onContinue: () => void;
}) {
  const VT: React.CSSProperties = { fontFamily: "'VT323',monospace" };
  const ST: React.CSSProperties = { fontFamily: "'Share Tech Mono',monospace" };
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lines.length]);

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 440, padding: '2.8rem 1rem 2.2rem',
    }}>
      <div style={{
        width: 520, maxWidth: 'min(92vw, 520px)', maxHeight: 'calc(100vh - 5rem)',
        display: 'flex', flexDirection: 'column',
        background: 'rgba(0,5,0,.99)',
        border: '1px solid rgba(56,189,248,.5)',
        boxShadow: '0 0 60px rgba(56,189,248,.1)',
      }}>
        <div style={{
          padding: '.55rem .85rem',
          borderBottom: '1px solid rgba(56,189,248,.2)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ ...VT, fontSize: '1.3rem', color: '#38bdf8', letterSpacing: '.18em' }}>
              PABLO CORP — STAMPING
            </div>
            <div style={{ ...ST, fontSize: '.48rem', color: 'rgba(56,189,248,.3)', letterSpacing: '.1em' }}>
              FEE LEDGER · TAX COLLECTOR DISPATCHER · DEED OF ENTRY
            </div>
          </div>
          <div style={{
            width: 32, height: 32,
            border: '1px solid rgba(56,189,248,.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            ...VT, fontSize: '1.2rem', color: '#38bdf8',
          }}>P</div>
        </div>

        <div
          ref={scrollRef}
          style={{
            flex: 1, overflow: 'auto', padding: '.95rem 1.1rem',
            ...ST, fontSize: '.68rem', lineHeight: 1.85,
            color: 'rgba(125,211,252,.7)', letterSpacing: '.06em',
            background: 'linear-gradient(180deg, rgba(56,189,248,.02), transparent)',
          }}
        >
          {lines.map((line, i) => (
            <div
              key={i}
              data-testid="immigration-stamp-line"
              style={{
                color: line.color ?? 'rgba(125,211,252,.8)',
                fontWeight: line.emphasis ? 'bold' : 'normal',
                textShadow: line.emphasis ? '0 0 8px rgba(125,211,252,.45)' : undefined,
                marginBottom: line.text === '' ? '.3rem' : 0,
              }}
            >
              {line.text || '\u00A0'}
            </div>
          ))}
          {!showContinue && (
            <div
              aria-hidden
              style={{ color: 'rgba(56,189,248,.45)', marginTop: '.25rem' }}
            >
              <span style={{ display: 'inline-block', animation: 'cursor-blink 1s step-end infinite' }}>▌</span>
            </div>
          )}
          <style>{`@keyframes cursor-blink { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }`}</style>
        </div>

        <div style={{
          padding: '.7rem .9rem',
          borderTop: '1px solid rgba(56,189,248,.2)',
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '.6rem',
        }}>
          <button
            type="button"
            onClick={onContinue}
            disabled={!showContinue}
            data-testid="immigration-enter-city"
            style={{
              padding: '.55rem 1.1rem',
              border: `1px solid ${showContinue ? 'rgba(56,189,248,.7)' : 'rgba(56,189,248,.2)'}`,
              background: showContinue ? 'rgba(56,189,248,.12)' : 'transparent',
              color: showContinue ? '#7dd3fc' : 'rgba(56,189,248,.3)',
              ...VT, fontSize: '1rem', letterSpacing: '.18em',
              cursor: showContinue ? 'pointer' : 'not-allowed',
              transition: 'background .2s, color .2s, border-color .2s',
            }}
          >
            ENTER CITY ▸
          </button>
        </div>
      </div>
    </div>
  );
}

function ImmigrationBackdrop({ phase }: { phase: Phase }) {
  const VT: React.CSSProperties = { fontFamily: "'VT323',monospace" };
  const ST: React.CSSProperties = { fontFamily: "'Share Tech Mono',monospace" };
  const stageLabel = phase === 'stamping' ? 'STAMPING IN PROGRESS' : 'INTAKE OPEN';
  const isMobile = useIsMobile();
  return (
    <>
      {/* Pablo nebula energy guiding the intake / parsing flow */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 0, opacity: 0.5, pointerEvents: 'none' }}>
        <PabloNebula3D
          status={phase === 'stamping' ? 'thinking' : 'listening'}
          size={typeof window !== 'undefined' ? Math.max(window.innerWidth, window.innerHeight) : 1200}
        />
      </div>
      <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none', background: 'radial-gradient(ellipse at center, rgba(3,6,12,.35) 0%, rgba(3,6,12,.78) 80%)' }} />

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
        padding: isMobile ? '.4rem .6rem' : '.6rem 1.1rem',
        borderBottom: '1px solid rgba(56,189,248,.25)',
        background: 'linear-gradient(180deg, rgba(56,189,248,.06), transparent)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        zIndex: 10,
      }}>
        <div style={{
          ...VT, fontSize: isMobile ? '.78rem' : '1.05rem', color: '#7dd3fc', letterSpacing: isMobile ? '.18em' : '.32em',
          textShadow: '0 0 10px rgba(56,189,248,.45)',
        }}>
          {isMobile ? 'MINX · BORDER' : '━━ MINX CITY · BORDER CONTROL ━━'}
        </div>
        <div style={{
          ...ST, fontSize: isMobile ? '.42rem' : '.55rem', color: 'rgba(56,189,248,.5)', letterSpacing: '.18em',
        }}>
          {isMobile ? 'OFC: PABLO' : 'LANE 03 · OFFICER: PABLO'}
        </div>
      </div>

      {/* Left column — instructions / signage (hidden on mobile) */}
      {!isMobile && (
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
        <div style={{ opacity: phase === 'intake' ? 1 : .4 }}>01 · STATE YOUR NAME</div>
        <div style={{ opacity: phase === 'intake' ? 1 : .4 }}>02 · DECLARE CONTACT EMAIL</div>
        <div style={{ opacity: phase === 'intake' ? 1 : .4 }}>03 · DECLARE INTENT</div>
        <div style={{ opacity: phase === 'intake' ? 1 : .4 }}>04 · FILE COMPANY (IF ANY)</div>
        <div style={{ opacity: phase === 'stamping' || phase === 'done' ? 1 : .4, color: 'rgba(125,211,252,.85)' }}>
          05 · ASSESS ENTRY FEES
        </div>
        <div style={{ opacity: phase === 'stamping' || phase === 'done' ? 1 : .4, color: 'rgba(125,211,252,.85)' }}>
          06 · STAMP &amp; ENTER
        </div>
        <div style={{ marginTop: '.7rem', color: 'rgba(56,189,248,.4)' }}>
          CITY SEALED UNDER GAS.<br/>
          NO ENTRY WITHOUT FILING.<br/>
          MISREPRESENTATION = DEPORTATION.
        </div>
      </div>
      )}

      {/* Right column — pulsing badge (hidden on mobile) */}
      {!isMobile && (
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
      )}

      {/* Bottom stripe — disclaimer */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: isMobile ? '.35rem .6rem' : '.45rem 1.1rem',
        borderTop: '1px solid rgba(56,189,248,.18)',
        background: 'linear-gradient(0deg, rgba(56,189,248,.04), transparent)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        ...ST, fontSize: isMobile ? '.42rem' : '.5rem', color: 'rgba(56,189,248,.45)', letterSpacing: '.14em',
        zIndex: 10,
      }}>
        <div>{isMobile ? 'FILING MANDATORY' : 'FILING IS MANDATORY · CITY ACCESS DENIED UNTIL CLEARED'}</div>
        <div style={{ animation: 'stamp-flicker 3.2s linear infinite' }}>
          ● {stageLabel}
        </div>
      </div>
    </>
  );
}
