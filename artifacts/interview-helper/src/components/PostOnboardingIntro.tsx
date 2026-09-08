import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { speakWithTTS, type TTSHandle } from '@/lib/tts';
import {
  resumeAudioContext,
  sfxElevatorChime,
  sfxDoorSlide,
  startOfficeAmbient,
  stopOfficeAmbient,
} from '@/soundEngine';
import { getMusicEnabled } from '@/lib/audio-settings';
import { formatSpeechName } from '@/lib/speech-name';

/**
 * PostOnboardingIntro — the cinematic that plays AFTER Pablo's intake +
 * registry stamping but BEFORE the player drops into the live app. This is the
 * player's FIRST arrival at Shadow Tower, staged as a single short, scripted
 * cutscene with pristine sound design:
 *
 *   ARRIVAL — the entry doors open and PABLO gives the player one clear
 *             instruction: report to reception. Work training begins there.
 *
 * When the greeting finishes (or the player taps SKIP / Esc), onComplete fires
 * and the parent hands the player straight into their office. The real story
 * dialogue happens later in the actual game, not here.
 *
 * Pablo's lines use the SAME default TTS voice as his other cutscenes — his
 * voice is never altered here, only reused.
 */

interface Props {
  playerName: string;
  onComplete: () => void;
}

const FONT_ST: React.CSSProperties = { fontFamily: "'Inter', sans-serif" };

// Minimum on-screen time per spoken line, so the cinematic still paces well
// even if TTS is slow, fast, or unavailable (we never want lines to flash by).
const MIN_LINE_MS = 2900;

export function PostOnboardingIntro({ playerName, onComplete }: Props) {
  const [doorsOpen, setDoorsOpen] = useState(false);
  const [lineIdx, setLineIdx] = useState(0);
  const completedRef = useRef(false);
  const ttsRef = useRef<TTSHandle | null>(null);
  const advTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const first = formatSpeechName((playerName || 'NEWCOMER').split(/\s+/)[0]);

  // Pablo's spoken elevator greeting. Brief but impactful.
  const LINES: string[] = [
    `Ah. ${first}. You made it to Shadow Tower.`,
    `Report to the receptionist in the lobby. They will get you ready for work.`,
  ];

  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    if (advTimerRef.current) clearTimeout(advTimerRef.current);
    ttsRef.current?.cancel();
    ttsRef.current = null;
    try { stopOfficeAmbient(); } catch { /* audio may be unavailable */ }
    onComplete();
  }, [onComplete]);

  // Resume audio + ring the elevator the moment the cinematic mounts, then
  // slide the doors open and bring up the warm office ambient bed.
  useEffect(() => {
    try { resumeAudioContext(); } catch { /* ignore */ }
    try { sfxElevatorChime(); } catch { /* ignore */ }
    const t = setTimeout(() => {
      setDoorsOpen(true);
      try { sfxDoorSlide(); } catch { /* ignore */ }
      if (!getMusicEnabled()) {
        try { startOfficeAmbient(); } catch { /* ignore */ }
      }
    }, 650);
    return () => clearTimeout(t);
  }, []);

  // Stop the ambient bed if we ever unmount without finishing (e.g. route
  // change under us).
  useEffect(() => () => { try { stopOfficeAmbient(); } catch { /* ignore */ } }, []);

  // Dialogue driver — speaks the current line, then advances (next line, or
  // finishes the cutscene) after max(TTS-duration, MIN_LINE_MS). Lines wait
  // until the doors are open so Pablo isn't talking to a closed lift.
  useEffect(() => {
    if (!doorsOpen) return undefined;
    if (lineIdx >= LINES.length) return undefined;

    const start = performance.now();
    const advance = () => {
      if (lineIdx + 1 < LINES.length) {
        setLineIdx((i) => i + 1);
      } else {
        finish();
      }
    };
    // Idempotent per-line: speakWithTTS calls BOTH onError and onEnd on a
    // failure path, so `done` MUST collapse to a single advance — otherwise a
    // failed/unavailable TTS line schedules two timers and double-advances
    // (skipping a line or overshooting `lineIdx` and stalling the cinematic).
    let advanced = false;
    const done = () => {
      if (advanced) return;
      advanced = true;
      const elapsed = performance.now() - start;
      advTimerRef.current = setTimeout(advance, Math.max(0, MIN_LINE_MS - elapsed));
    };
    ttsRef.current?.cancel();
    ttsRef.current = speakWithTTS(LINES[lineIdx], done, () => done());

    return () => {
      if (advTimerRef.current) clearTimeout(advTimerRef.current);
      ttsRef.current?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineIdx, doorsOpen]);

  // Escape skips the whole cutscene. Capture-phase only for Escape so we beat
  // any global listeners.
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
  }, [finish]);

  const currentLine = LINES[lineIdx] ?? null;

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
      {/* Skip — always available. Sits inside the top safe area on notched phones. */}
      <button
        type="button"
        onClick={finish}
        data-testid="post-onboarding-skip"
        style={{
          position: 'absolute',
          top: 'calc(14px + env(safe-area-inset-top, 0px))',
          right: 'calc(14px + env(safe-area-inset-right, 0px))',
          zIndex: 1200,
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
        {/* ───────────────────────── ELEVATOR ARRIVAL ───────────────────────── */}
        <motion.div
          key="elevator"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          style={{ position: 'absolute', inset: 0 }}
          data-testid="post-onboarding-elevator"
        >
          <ElevatorScene doorsOpen={doorsOpen} />
        </motion.div>
      </AnimatePresence>

      {/* Pablo subtitle — shown during the elevator greeting. Kept above the
          bottom safe area so the notch / home indicator never clips it. */}
      <AnimatePresence mode="wait">
        {currentLine && (
          <motion.div
            key={`elevator-${lineIdx}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4 }}
            style={{
              position: 'absolute',
              bottom: 'calc(38px + env(safe-area-inset-bottom, 0px))',
              left: '50%', transform: 'translateX(-50%)',
              maxWidth: 560, width: '90%', textAlign: 'center', zIndex: 1100,
            }}
            data-testid="post-onboarding-subtitle"
          >
            <div style={{
              display: 'inline-block', padding: '10px 16px',
              border: '1px solid rgba(56,189,248,.4)',
              background: 'rgba(0,0,0,.72)', backdropFilter: 'blur(4px)',
              color: '#dbeafe', fontSize: 14, lineHeight: 1.5, ...FONT_ST,
            }}>
              <span style={{ color: '#7dd3fc', marginRight: 8, letterSpacing: '.12em' }}>PABLO:</span>
              {currentLine}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * The elevator car: two dark door panels that part to reveal a warm, dim office
 * floor with Pablo — an elderly Japanese man — standing in the doorway, kept in
 * shadow. The car interior frames the whole shot.
 */
function ElevatorScene({ doorsOpen }: { doorsOpen: boolean }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#020308', overflow: 'hidden' }}>
      {/* The office beyond — only meaningful once the doors part. Warm light
          spill + faint desk silhouettes so the "floor" reads without art. */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        <div style={{
          position: 'absolute', inset: 0,
          background:
            'radial-gradient(ellipse 60% 70% at 50% 55%, rgba(245,200,140,.22), transparent 60%),' +
            'radial-gradient(ellipse at 18% 40%, rgba(34,211,238,.10), transparent 55%),' +
            'radial-gradient(ellipse at 82% 35%, rgba(236,72,153,.10), transparent 55%),' +
            'linear-gradient(180deg, #0a0c14 0%, #06080e 100%)',
        }} />
        {/* Distant desk silhouettes. */}
        <div aria-hidden="true" style={{ position: 'absolute', bottom: '18%', left: 0, right: 0, height: '22%', opacity: 0.5,
          background: 'repeating-linear-gradient(90deg, transparent 0 7%, rgba(0,0,0,.55) 7% 9%, transparent 9% 16%)' }} />
        {/* PABLO — elderly man, shrouded. Sits in the doorway light. */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: doorsOpen ? 1 : 0, y: doorsOpen ? 0 : 8 }}
          transition={{ duration: 1.1, delay: doorsOpen ? 0.5 : 0 }}
          style={{ position: 'absolute', bottom: '6%', left: '50%', transform: 'translateX(-50%)', height: '74%', filter: 'drop-shadow(0 0 10px rgba(120,170,255,.35))' }}
        >
          <PabloSilhouette />
        </motion.div>
      </div>

      {/* Elevator door panels — slide apart. */}
      <motion.div
        animate={{ x: doorsOpen ? '-105%' : '0%' }}
        transition={{ duration: 1.25, ease: [0.22, 0.61, 0.36, 1] }}
        style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '50%', zIndex: 5, ...doorPanelStyle('right') }}
      />
      <motion.div
        animate={{ x: doorsOpen ? '105%' : '0%' }}
        transition={{ duration: 1.25, ease: [0.22, 0.61, 0.36, 1] }}
        style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: '50%', zIndex: 5, ...doorPanelStyle('left') }}
      />

      {/* Car frame + ceiling light strip, so the shot reads as "inside a lift". */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 6, pointerEvents: 'none',
        boxShadow: 'inset 0 0 0 10px #0b0e16, inset 0 0 80px 30px rgba(0,0,0,.7)' }} />
      <div aria-hidden="true" style={{ position: 'absolute', top: 0, left: '12%', right: '12%', height: 4, zIndex: 7,
        background: 'linear-gradient(90deg, transparent, rgba(186,230,253,.65), transparent)', filter: 'blur(1px)' }} />

      {/* Floor indicator. */}
      <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 8,
        ...FONT_ST, fontSize: 11, letterSpacing: '.4em', color: 'rgba(186,230,253,.6)' }}>
        SHADOW TOWER · LOBBY
      </div>
    </div>
  );
}

function doorPanelStyle(seam: 'left' | 'right'): React.CSSProperties {
  return {
    background:
      'linear-gradient(90deg, #0d1018 0%, #161b26 45%, #11151f 100%)',
    borderRight: seam === 'right' ? '2px solid rgba(0,0,0,.8)' : undefined,
    borderLeft: seam === 'left' ? '2px solid rgba(0,0,0,.8)' : undefined,
    backgroundImage:
      'linear-gradient(90deg, rgba(255,255,255,.04) 0 1px, transparent 1px), ' +
      'linear-gradient(90deg, #0d1018, #161b26 45%, #11151f)',
    backgroundSize: '14px 100%, 100% 100%',
  };
}

/**
 * Pablo as an elderly Japanese man "shrouded in shadow and mystery" — a near
 * black silhouette: a long overcoat, a low hat brim, a slight elderly stoop,
 * and a single faint glint where his glasses catch the doorway light.
 */
function PabloSilhouette() {
  return (
    <svg viewBox="0 0 160 320" height="100%" style={{ display: 'block' }} aria-hidden="true">
      {/* Backlight halo so he reads as standing IN the doorway light. */}
      <defs>
        <radialGradient id="pablo-halo" cx="50%" cy="34%" r="55%">
          <stop offset="0%" stopColor="rgba(245,210,150,.30)" />
          <stop offset="100%" stopColor="rgba(245,210,150,0)" />
        </radialGradient>
      </defs>
      <ellipse cx="80" cy="120" rx="78" ry="150" fill="url(#pablo-halo)" />
      <g fill="#04060b">
        {/* Long coat, slightly hunched (head carried forward). */}
        <path d="M58 96 C40 104 36 150 38 320 L122 320 C124 150 120 104 102 96 C96 110 64 110 58 96 Z" />
        {/* Shoulders / collar. */}
        <path d="M58 96 C66 86 94 86 102 96 L96 108 C90 100 70 100 64 108 Z" />
        {/* Neck. */}
        <rect x="72" y="74" width="16" height="20" rx="3" />
        {/* Head, carried slightly forward. */}
        <ellipse cx="83" cy="60" rx="17" ry="19" />
        {/* Hat crown + low brim — the mystery. */}
        <ellipse cx="83" cy="40" rx="17" ry="13" />
        <ellipse cx="83" cy="46" rx="31" ry="7" />
      </g>
      {/* Faint glasses glint. */}
      <g opacity="0.7">
        <rect x="74" y="58" width="8" height="2" rx="1" fill="rgba(186,230,253,.85)" />
        <rect x="86" y="58" width="8" height="2" rx="1" fill="rgba(186,230,253,.85)" />
      </g>
    </svg>
  );
}

export default PostOnboardingIntro;
