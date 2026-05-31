import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useArtAsset } from '@/lib/art';

/**
 * WakeUpScene — the opening of the onboarding. Instead of a wall of Pablo
 * monologue, the new arrival simply WAKES UP, slumped at their desk, late
 * for work. Show-don't-tell:
 *
 *   1. asleep   — the painted "asleep at the desk" plate, alarm blaring,
 *                 a single low-text prompt: PRESS ANY KEY / TAP TO WAKE UP.
 *   2. awake    — they jolt upright. One line: "You overslept. Again." +
 *                 the time. A single CTA: CLOCK IN ▸ — hands off to the
 *                 guided setup (the registry intake).
 *
 * Minimal text, art-driven, fully skippable. The component is presentational
 * and only needs an onContinue callback; the parent (Immigration) advances
 * the phase.
 */

const FONT_VT: React.CSSProperties = { fontFamily: "'VT323', monospace" };
const FONT_ST: React.CSSProperties = { fontFamily: "'Share Tech Mono', monospace" };

type Beat = 'asleep' | 'awake';

interface Props {
  /** Best-known display name; first word is used in the awake line. */
  playerName: string;
  onContinue: () => void;
}

export function WakeUpScene({ playerName, onContinue }: Props) {
  const [beat, setBeat] = useState<Beat>('asleep');
  const artUrl = useArtAsset('scene_wakeup');
  const continuedRef = useRef(false);

  const wake = useCallback(() => {
    setBeat((b) => (b === 'asleep' ? 'awake' : b));
  }, []);

  const finish = useCallback(() => {
    if (continuedRef.current) return;
    continuedRef.current = true;
    onContinue();
  }, [onContinue]);

  // Keyboard: any key wakes during 'asleep'; Escape skips the whole scene.
  // Capture phase so we win over any global listeners higher in the tree.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        finish();
        return;
      }
      if (beat === 'asleep') {
        e.stopPropagation();
        e.preventDefault();
        wake();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true } as EventListenerOptions);
  }, [beat, wake, finish]);

  const firstName = (playerName || 'SALARYMAN').split(' ')[0];

  return (
    <div
      data-testid="wakeup-scene"
      onClick={beat === 'asleep' ? wake : undefined}
      style={{
        position: 'absolute', inset: 0, zIndex: 460,
        background: '#03060c',
        color: '#7dd3fc',
        overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: beat === 'asleep' ? 'pointer' : 'default',
        ...FONT_ST,
      }}
    >
      {/* Skip — always available. */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); finish(); }}
        data-testid="wakeup-skip"
        style={{
          position: 'absolute', top: 14, right: 14, zIndex: 20,
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

      {/* Painted backdrop — the desk you fell asleep at. Falls back to a
          flat void while the asset is still baking so the scene never
          flashes empty. Dims slightly once awake so the foreground copy
          reads cleanly. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0,
          backgroundImage: artUrl ? `url(${artUrl})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: beat === 'asleep' ? 'saturate(.9)' : 'saturate(.8) brightness(.55)',
          transition: 'filter .8s ease',
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0,
          background: beat === 'asleep'
            ? 'radial-gradient(ellipse at 50% 70%, rgba(3,6,12,.15) 0%, rgba(3,6,12,.72) 85%)'
            : 'radial-gradient(ellipse at 50% 60%, rgba(3,6,12,.45) 0%, rgba(3,6,12,.9) 90%)',
          transition: 'background .8s ease',
        }}
      />

      <AnimatePresence mode="wait">
        {beat === 'asleep' && (
          <motion.div
            key="asleep"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            style={{ position: 'relative', zIndex: 10, textAlign: 'center', padding: '0 1rem' }}
          >
            {/* Blaring alarm — jiggles to sell the noise. */}
            <motion.div
              animate={{ rotate: [-8, 8, -8], y: [0, -2, 0] }}
              transition={{ duration: 0.35, repeat: Infinity, ease: 'easeInOut' }}
              style={{ fontSize: 'clamp(40px, 8vw, 72px)', filter: 'drop-shadow(0 0 12px rgba(248,113,113,.6))' }}
            >
              ⏰
            </motion.div>
            <div style={{ ...FONT_ST, marginTop: 18, fontSize: 11, letterSpacing: '.4em', color: 'rgba(248,113,113,.8)' }}>
              ▌ 07:58 · ALARM
            </div>
            <motion.div
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.3, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                marginTop: 26, display: 'inline-block',
                padding: '8px 18px',
                border: '1px solid rgba(56,189,248,.55)',
                background: 'rgba(56,189,248,.08)',
                letterSpacing: '.3em', fontSize: 12, color: '#7dd3fc',
                ...FONT_ST,
              }}
              data-testid="wakeup-prompt"
            >
              PRESS ANY KEY OR TAP TO WAKE UP
            </motion.div>
          </motion.div>
        )}

        {beat === 'awake' && (
          <motion.div
            key="awake"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            style={{ position: 'relative', zIndex: 10, textAlign: 'center', padding: '0 1rem', maxWidth: 560 }}
          >
            <div style={{ ...FONT_ST, fontSize: 11, letterSpacing: '.4em', color: 'rgba(248,113,113,.85)', marginBottom: 14 }}>
              ▌ 08:00 · YOU'RE LATE
            </div>
            <div style={{ ...FONT_VT, fontSize: 'clamp(30px, 6vw, 56px)', color: '#7dd3fc', letterSpacing: '.04em', lineHeight: 1.15 }}>
              You overslept. Again.
            </div>
            <div style={{ ...FONT_ST, marginTop: 16, fontSize: 12.5, lineHeight: 1.7, color: 'rgba(125,211,252,.7)', letterSpacing: '.04em' }}>
              First day on the books, {firstName}. Pablo Corp is already calling. Clock in before you lose the desk.
            </div>
            <motion.button
              type="button"
              onClick={finish}
              data-testid="wakeup-clock-in"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.4 }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              style={{
                marginTop: 28,
                padding: '10px 26px',
                border: '1px solid rgba(56,189,248,.75)',
                background: 'rgba(56,189,248,.12)',
                color: '#7dd3fc',
                letterSpacing: '.22em', fontSize: 14,
                cursor: 'pointer',
                ...FONT_VT,
              }}
            >
              CLOCK IN ▸
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CRT scanlines to match the rest of the immigration desk. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 15,
          backgroundImage: 'repeating-linear-gradient(0deg, rgba(56,189,248,.06) 0 1px, transparent 1px 3px)',
          mixBlendMode: 'overlay', opacity: 0.5,
        }}
      />
    </div>
  );
}

export default WakeUpScene;
