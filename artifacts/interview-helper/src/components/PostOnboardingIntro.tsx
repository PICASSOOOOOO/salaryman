import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PixelOffice } from './PixelOffice';

/**
 * PostOnboardingIntro — the cinematic that plays AFTER Pablo's intake +
 * registry stamping but BEFORE the player drops into the live app.
 *
 * Beats (in order):
 *   1. WELCOME card        — "Welcome, NAME." / fades up over the dark.
 *   2. TIME-SKIP card      — "3 MONTHS LATER…" / fades through.
 *   3. CONTROLS tutorial   — INTERACTIVE pixel-office. The player actually
 *                            drives the character: WASD / arrows to move,
 *                            walk up to the desk computer, press E (or tap
 *                            the prompt) to use it. This is the hands-on
 *                            "learn the controls" beat — move, use the
 *                            computer, enter the terminal — instead of a
 *                            passive "press a key" cutscene.
 *   4. POWER-ON pulse      — short flash so the trigger feels physical,
 *                            then onComplete fires and the parent
 *                            navigates to the actual app.
 *
 * No door-opening, no Pablo voice-over. Just a quiet welcome → time
 * skip → "now move yourself to the terminal" → activate the screen.
 *
 * The component is self-contained and accepts only the data it needs to
 * personalize copy. Skip is always available (Esc / SKIP button) so a
 * returning user, or anyone who's seen this before, can shortcut through.
 */

type Beat = 'welcome' | 'time_skip' | 'controls' | 'power_on';

interface Props {
  playerName: string;
  /** Drives the desk subtitle copy. */
  bizPath: 'business' | 'unemployed';
  onComplete: () => void;
}

const FONT_VT: React.CSSProperties = { fontFamily: "'VT323', monospace" };
const FONT_ST: React.CSSProperties = { fontFamily: "'Share Tech Mono', monospace" };

// Little keyboard-cap chip used in the controls legend.
const keyCap: React.CSSProperties = {
  display: 'inline-block',
  minWidth: 16,
  padding: '0 5px',
  margin: '0 2px',
  border: '1px solid rgba(125,211,252,.8)',
  borderRadius: 2,
  color: '#fff',
  textAlign: 'center',
};

export function PostOnboardingIntro({ playerName, bizPath, onComplete }: Props) {
  const [beat, setBeat] = useState<Beat>('welcome');
  const completedRef = useRef(false);

  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }, [onComplete]);

  // Auto-advance the cinematic beats. The desk beat is interactive — it
  // waits for a click or E keypress instead of timing out, because the
  // whole point is "the player turns the terminal on."
  useEffect(() => {
    if (beat === 'welcome') {
      const t = setTimeout(() => setBeat('time_skip'), 2600);
      return () => clearTimeout(t);
    }
    if (beat === 'time_skip') {
      const t = setTimeout(() => setBeat('controls'), 2600);
      return () => clearTimeout(t);
    }
    if (beat === 'power_on') {
      // Brief white-out to sell the monitor coming on, then hand off.
      const t = setTimeout(finish, 700);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [beat, finish]);

  // Keyboard handling — Escape skips the whole cutscene. During the
  // interactive 'controls' beat we DON'T intercept movement keys (WASD /
  // arrows) or E — those belong to the playable PixelOffice, which has its
  // own listeners. Capture-phase only for Escape so we beat any global
  // listeners further up the tree without stealing the tutorial's input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        finish();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true } as EventListenerOptions);
  }, [beat, finish]);

  const deskSubtitle =
    bizPath === 'business'
      ? `Three months in. The desk is yours — but it doesn't run itself.`
      : `Three months hunting. The terminal's still where the leads come from.`;

  return (
    <div
      data-testid="post-onboarding-intro"
      style={{
        position: 'fixed', inset: 0, zIndex: 950,
        background: '#03060c',
        color: '#7dd3fc',
        overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        ...FONT_ST,
      }}
    >
      {/* Skip — always available. */}
      <button
        type="button"
        onClick={finish}
        data-testid="post-onboarding-skip"
        style={{
          position: 'absolute', top: 14, right: 14, zIndex: 1000,
          padding: '4px 10px',
          background: 'rgba(56,189,248,.06)',
          border: '1px solid rgba(56,189,248,.3)',
          color: 'rgba(56,189,248,.7)',
          letterSpacing: '.18em', fontSize: 10,
          cursor: 'pointer',
          ...FONT_ST,
        }}
      >
        SKIP ▸
      </button>

      <AnimatePresence mode="wait">
        {beat === 'welcome' && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            style={{ textAlign: 'center', padding: '0 1rem' }}
          >
            <div style={{ ...FONT_ST, fontSize: 11, letterSpacing: '.4em', color: 'rgba(56,189,248,.45)', marginBottom: 18 }}>
              ▌ MINX CITY — INTAKE COMPLETE
            </div>
            <div style={{ ...FONT_VT, fontSize: 'clamp(36px, 7vw, 64px)', color: '#7dd3fc', letterSpacing: '.06em' }}>
              Welcome, {playerName.split(' ')[0]}.
            </div>
          </motion.div>
        )}

        {beat === 'time_skip' && (
          <motion.div
            key="time_skip"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            style={{ textAlign: 'center', padding: '0 1rem' }}
          >
            <motion.div
              initial={{ letterSpacing: '0.05em', opacity: 0 }}
              animate={{ letterSpacing: '0.5em', opacity: 1 }}
              transition={{ duration: 1.6, ease: 'easeOut' }}
              style={{ ...FONT_VT, fontSize: 'clamp(28px, 5.5vw, 50px)', color: 'rgba(125,211,252,.85)' }}
            >
              3 MONTHS LATER
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} transition={{ delay: 0.7, duration: 0.6 }}
              style={{ ...FONT_ST, marginTop: 18, fontSize: 11, letterSpacing: '.3em', color: 'rgba(56,189,248,.4)' }}
            >
              ▌ TIME PASSES.
            </motion.div>
          </motion.div>
        )}

        {(beat === 'controls' || beat === 'power_on') && (
          <motion.div
            key="controls"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              padding: '1rem',
            }}
            data-testid="post-onboarding-controls"
          >
            {/* Short framing line. */}
            <div style={{ ...FONT_ST, maxWidth: 520, textAlign: 'center', fontSize: 12, lineHeight: 1.7, color: 'rgba(125,211,252,.7)', letterSpacing: '.05em', padding: '0 1rem', marginBottom: 12 }}>
              {deskSubtitle}
            </div>

            {/* Interactive office — the player drives the character. Walking
                up to the desk computer and pressing E (or tapping the prompt
                PixelOffice renders) fires onEnterTerminal → power_on. */}
            <div style={{ transform: 'scale(min(1, calc(100vw / 800)))', transformOrigin: 'center' }}>
              <PixelOffice
                scale={2}
                playable={beat === 'controls'}
                onEnterTerminal={() => setBeat('power_on')}
              />
            </div>

            {/* Controls legend — the only on-screen text. Hidden during the
                power-on flash so it doesn't fight the wipe. */}
            {beat === 'controls' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.5 }}
                style={{
                  marginTop: 22,
                  display: 'flex', flexWrap: 'wrap', gap: 14,
                  alignItems: 'center', justifyContent: 'center',
                  padding: '10px 18px',
                  border: '1px solid rgba(56,189,248,.4)',
                  background: 'rgba(56,189,248,.06)',
                  ...FONT_ST, fontSize: 11, letterSpacing: '.14em', color: '#7dd3fc',
                }}
                data-testid="post-onboarding-controls-legend"
              >
                <span>
                  <span style={keyCap}>W</span><span style={keyCap}>A</span><span style={keyCap}>S</span><span style={keyCap}>D</span>
                  &nbsp;MOVE
                </span>
                <span style={{ opacity: 0.4 }}>·</span>
                <span>WALK TO THE&nbsp;💻</span>
                <span style={{ opacity: 0.4 }}>·</span>
                <span><span style={keyCap}>E</span>&nbsp;ENTER TERMINAL</span>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Power-on flash — sits on top of the desk scene during the
          'power_on' beat to sell the monitor coming alive, then we
          unmount and the parent takes over. */}
      <AnimatePresence>
        {beat === 'power_on' && (
          <motion.div
            key="flash"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.9, 0.2] }}
            transition={{ duration: 0.65, times: [0, 0.35, 1] }}
            style={{
              position: 'absolute', inset: 0, zIndex: 1100,
              background: 'radial-gradient(circle at 50% 60%, rgba(125,211,252,.85), rgba(56,189,248,.25) 35%, rgba(0,0,0,.0) 70%)',
              pointerEvents: 'none',
            }}
          />
        )}
      </AnimatePresence>

      {/* Subtle scanlines so it locks into the same CRT vibe as the rest
          of the immigration desk. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'repeating-linear-gradient(0deg, rgba(56,189,248,.06) 0 1px, transparent 1px 3px)',
          mixBlendMode: 'overlay', opacity: 0.55,
        }}
      />
    </div>
  );
}

export default PostOnboardingIntro;
