import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PixelOffice } from './PixelOffice';
import { speakWithTTS, type TTSHandle } from '@/lib/tts';
import {
  resumeAudioContext,
  sfxElevatorChime,
  sfxDoorSlide,
  sfxWakeAlarm,
  startOfficeAmbient,
  stopOfficeAmbient,
} from '@/soundEngine';

/**
 * PostOnboardingIntro — the cinematic that plays AFTER Pablo's intake +
 * registry stamping but BEFORE the player drops into the live app. This is the
 * player's FIRST arrival at their office, so it's staged as two short, scripted
 * cutscenes with pristine sound design:
 *
 *   1. ELEVATOR   — the lift chimes, the doors slide open, and PABLO — an
 *                   elderly Japanese man shrouded in shadow and mystery — is
 *                   waiting in the doorway. He gives the player a brief tour of
 *                   the floor in his own voice. Brief but impactful.
 *   2. TIME SKIP  — "3 MONTHS LATER" fades through.
 *   3. ASLEEP     — they find the player slumped asleep at the desk, monitor
 *                   still glowing. A soft wake cue, Pablo's shadow speaks once,
 *                   and the player stirs.
 *   4. CONTROLS   — INTERACTIVE pixel-office with a grouped legend of the FULL
 *                   live keyset (move/run, interact, attack/advance, map,
 *                   quests, chat, items, voice, radio, Pablo terminal). The
 *                   hands-on beat: drive the character (WASD / arrows), walk to
 *                   the desk computer and press E (or tap the prompt) to enter
 *                   the terminal.
 *   5. POWER-ON   — short flash so the trigger feels physical, then onComplete
 *                   fires and the parent navigates to the actual app.
 *
 * Pablo's lines use the SAME default TTS voice as his other cutscenes — his
 * voice is never altered here, only reused. Skip is always available (Esc /
 * SKIP button).
 */

type Beat = 'elevator' | 'time_skip' | 'asleep' | 'controls' | 'power_on';

interface Props {
  playerName: string;
  /** Drives the desk subtitle copy. */
  bizPath: 'business' | 'unemployed';
  onComplete: () => void;
}

const FONT_VT: React.CSSProperties = { fontFamily: "'VT323', monospace" };
const FONT_ST: React.CSSProperties = { fontFamily: "'Share Tech Mono', monospace" };

// Minimum on-screen time per spoken line, so the cinematic still paces well
// even if TTS is slow, fast, or unavailable (we never want lines to flash by).
const MIN_LINE_MS = 2900;

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

// A labelled row in the controls legend (e.g. "MOVE: …"). Groups related keys
// so the full keyset reads quickly instead of as one overwhelming list.
function LegendGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 12px' }}>
      <span style={{ ...FONT_ST, fontSize: 9, letterSpacing: '.2em', color: 'rgba(125,211,252,.45)', minWidth: 58 }}>
        {title}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 14px' }}>
        {children}
      </div>
    </div>
  );
}

// A single key (or cluster of keys) plus its action label.
function LegendItem({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span style={{ ...FONT_ST, fontSize: 10.5, letterSpacing: '.06em', color: '#cfe9ff', display: 'inline-flex', alignItems: 'center' }}>
      {keys.map((k, i) => (
        <span key={i} style={{ ...keyCap, fontSize: k.length > 1 ? 8.5 : 10.5, minWidth: k.length > 1 ? 24 : 16 }}>{k}</span>
      ))}
      <span style={{ marginLeft: 6, color: 'rgba(125,211,252,.78)' }}>{label}</span>
    </span>
  );
}

export function PostOnboardingIntro({ playerName, bizPath, onComplete }: Props) {
  const [beat, setBeat] = useState<Beat>('elevator');
  const [doorsOpen, setDoorsOpen] = useState(false);
  const [lineIdx, setLineIdx] = useState(0);
  const [awake, setAwake] = useState(false);
  const completedRef = useRef(false);
  const ttsRef = useRef<TTSHandle | null>(null);
  const advTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const first = (playerName || 'NEWCOMER').split(' ')[0];

  // Pablo's spoken lines per dialogue beat. Brief but impactful.
  const LINES: Partial<Record<Beat, string[]>> = {
    elevator: [
      `Ah. ${first}. You came.`,
      `This whole floor is yours now — desks here, the terminal at the back. Learn it fast. The city is not kind to the slow.`,
    ],
    asleep: [
      `...Three months. And still at this desk. Asleep.`,
      `Good. The tired ones last. On your feet — there's work.`,
    ],
  };

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
      try { startOfficeAmbient(); } catch { /* ignore */ }
    }, 650);
    return () => clearTimeout(t);
  }, []);

  // Stop the ambient bed if we ever unmount without finishing (e.g. route
  // change under us).
  useEffect(() => () => { try { stopOfficeAmbient(); } catch { /* ignore */ } }, []);

  // Dialogue driver — speaks the current line for the current beat, then
  // advances (next line, or next beat) after max(TTS-duration, MIN_LINE_MS).
  // Elevator lines wait until the doors are open so Pablo isn't talking to a
  // closed lift.
  useEffect(() => {
    const lines = LINES[beat];
    if (!lines) return undefined;
    if (beat === 'elevator' && !doorsOpen) return undefined;
    if (lineIdx >= lines.length) return undefined;

    // Second "asleep" line is the wake — stir the player + soft alarm.
    if (beat === 'asleep' && lineIdx === 1 && !awake) {
      setAwake(true);
      try { sfxWakeAlarm(); } catch { /* ignore */ }
    }

    const start = performance.now();
    const advance = () => {
      const ls = LINES[beat]!;
      if (lineIdx + 1 < ls.length) {
        setLineIdx((i) => i + 1);
      } else if (beat === 'elevator') {
        setBeat('time_skip');
      } else if (beat === 'asleep') {
        setBeat('controls');
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
    ttsRef.current = speakWithTTS(lines[lineIdx], done, () => done());

    return () => {
      if (advTimerRef.current) clearTimeout(advTimerRef.current);
      ttsRef.current?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat, lineIdx, doorsOpen]);

  // Auto-advance the non-dialogue beats.
  useEffect(() => {
    if (beat === 'time_skip') {
      const t = setTimeout(() => { setLineIdx(0); setAwake(false); setBeat('asleep'); }, 2600);
      return () => clearTimeout(t);
    }
    if (beat === 'power_on') {
      const t = setTimeout(finish, 700);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [beat, finish]);

  // Escape skips the whole cutscene. During the interactive 'controls' beat we
  // DON'T intercept movement keys (WASD / arrows) or E — those belong to the
  // playable PixelOffice, which has its own listeners. Capture-phase only for
  // Escape so we beat any global listeners without stealing tutorial input.
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

  const deskSubtitle =
    bizPath === 'business'
      ? `The desk is yours — but it doesn't run itself.`
      : `Still hunting. The terminal's where the leads come from.`;

  const currentLine = LINES[beat]?.[lineIdx] ?? null;

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
          position: 'absolute', top: 14, right: 14, zIndex: 1200,
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
        {beat === 'elevator' && (
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
        )}

        {/* ───────────────────────── 3 MONTHS LATER ─────────────────────────── */}
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

        {/* ───────────────────────── ASLEEP AT THE DESK ─────────────────────── */}
        {beat === 'asleep' && (
          <motion.div
            key="asleep"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            style={{ position: 'absolute', inset: 0 }}
            data-testid="post-onboarding-asleep"
          >
            <AsleepScene awake={awake} subtitle={deskSubtitle} />
          </motion.div>
        )}

        {/* ───────────────────────── CONTROLS TUTORIAL ──────────────────────── */}
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
            <div style={{ ...FONT_ST, maxWidth: 520, textAlign: 'center', fontSize: 12, lineHeight: 1.7, color: 'rgba(125,211,252,.7)', letterSpacing: '.05em', padding: '0 1rem', marginBottom: 12 }}>
              {deskSubtitle}
            </div>

            <div style={{ transform: 'scale(min(1, calc(100vw / 800)))', transformOrigin: 'center' }}>
              <PixelOffice
                scale={2}
                playable={beat === 'controls'}
                onEnterTerminal={() => setBeat('power_on')}
              />
            </div>

            {beat === 'controls' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.5 }}
                style={{
                  marginTop: 18,
                  maxWidth: 560, width: '92%',
                  display: 'flex', flexDirection: 'column', gap: 9,
                  padding: '12px 16px',
                  border: '1px solid rgba(56,189,248,.4)',
                  background: 'rgba(56,189,248,.06)',
                  ...FONT_ST, color: '#7dd3fc',
                }}
                data-testid="post-onboarding-controls-legend"
              >
                <div style={{ fontSize: 9, letterSpacing: '.34em', color: 'rgba(125,211,252,.55)', textAlign: 'center' }}>
                  YOUR CONTROLS
                </div>

                {/* MOVE + RUN — the things they do constantly. */}
                <LegendGroup title="MOVE">
                  <LegendItem keys={['W', 'A', 'S', 'D']} label="WALK" />
                  <LegendItem keys={['↑', '↓', '←', '→']} label="OR ARROWS" />
                  <LegendItem keys={['Shift']} label="RUN" />
                </LegendGroup>

                {/* ACT — interact + the one combat / advance key. */}
                <LegendGroup title="ACT">
                  <LegendItem keys={['E']} label="INTERACT / ENTER" />
                  <LegendItem keys={['Space']} label="ATTACK / ADVANCE" />
                </LegendGroup>

                {/* SCREENS — the quick-toggle HUD panels. */}
                <LegendGroup title="SCREENS">
                  <LegendItem keys={['M']} label="MAP" />
                  <LegendItem keys={['Q']} label="QUESTS" />
                  <LegendItem keys={['C']} label="CHAT" />
                  <LegendItem keys={['I']} label="ITEMS" />
                </LegendGroup>

                {/* COMMS — voice, radio, and the Pablo terminal. */}
                <LegendGroup title="COMMS">
                  <LegendItem keys={['V']} label="VOICE" />
                  <LegendItem keys={['R']} label="RADIO" />
                  <LegendItem keys={['P']} label="PABLO TERMINAL" />
                </LegendGroup>

                <div style={{ fontSize: 10, letterSpacing: '.1em', color: 'rgba(125,211,252,.85)', textAlign: 'center', marginTop: 2 }}>
                  NOW — WALK TO THE&nbsp;💻 AND PRESS&nbsp;<span style={keyCap}>E</span>&nbsp;TO BOOT YOUR TERMINAL.
                </div>
                <div style={{ fontSize: 8.5, letterSpacing: '.1em', color: 'rgba(125,211,252,.4)', textAlign: 'center' }}>
                  ON A PHONE: TAP TO MOVE · ON-SCREEN BUTTONS HANDLE THE REST.
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pablo subtitle — shown during the elevator + asleep dialogue beats. */}
      <AnimatePresence mode="wait">
        {currentLine && (
          <motion.div
            key={`${beat}-${lineIdx}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4 }}
            style={{
              position: 'absolute', bottom: 38, left: '50%', transform: 'translateX(-50%)',
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

      {/* Power-on flash — sells the monitor coming alive, then we hand off. */}
      <AnimatePresence>
        {beat === 'power_on' && (
          <motion.div
            key="flash"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.9, 0.2] }}
            transition={{ duration: 0.65, times: [0, 0.35, 1] }}
            style={{
              position: 'absolute', inset: 0, zIndex: 1150,
              background: 'radial-gradient(circle at 50% 60%, rgba(125,211,252,.85), rgba(56,189,248,.25) 35%, rgba(0,0,0,.0) 70%)',
              pointerEvents: 'none',
            }}
          />
        )}
      </AnimatePresence>

      {/* Subtle scanlines so it locks into the same CRT vibe as the rest of the
          immigration desk. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1000,
          backgroundImage: 'repeating-linear-gradient(0deg, rgba(56,189,248,.06) 0 1px, transparent 1px 3px)',
          mixBlendMode: 'overlay', opacity: 0.55,
        }}
      />
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
        ▲ FLOOR 01 · YOUR OFFICE
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

/**
 * Player slumped asleep at their desk, three months in. Dark room, a single
 * monitor casting cool light, "Zzz" drifting up. On `awake`, the figure lifts
 * and the room warms slightly.
 */
function AsleepScene({ awake, subtitle }: { awake: boolean; subtitle: string }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, #04060c 0%, #020307 100%)', overflow: 'hidden' }}>
      {/* Monitor light wash across the desk + sleeper. */}
      <motion.div
        animate={{ opacity: awake ? 0.85 : 0.55 }}
        transition={{ duration: 0.8 }}
        style={{ position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse 40% 38% at 58% 56%, rgba(80,170,235,.30), transparent 62%)' }}
      />

      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg viewBox="0 0 320 200" width="min(72vw, 560px)" aria-hidden="true">
          {/* Desk. */}
          <rect x="20" y="132" width="280" height="12" rx="2" fill="#0b0f18" />
          <rect x="34" y="144" width="10" height="48" fill="#0a0d15" />
          <rect x="276" y="144" width="10" height="48" fill="#0a0d15" />
          {/* Monitor (right of desk), glowing. */}
          <rect x="206" y="78" width="74" height="50" rx="3" fill="#06222e" stroke="rgba(120,200,235,.6)" strokeWidth="1.5" />
          <rect x="212" y="84" width="62" height="38" rx="2" fill="rgba(90,185,225,.35)" />
          <rect x="238" y="128" width="10" height="10" fill="#0a0d15" />
          <rect x="226" y="138" width="34" height="4" rx="2" fill="#0a0d15" />
          {/* Sleeper — head down on folded arms when asleep; lifts when awake. */}
          <motion.g
            animate={{ y: awake ? -18 : 0, rotate: awake ? 0 : 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            style={{ transformOrigin: '120px 132px' }}
            fill="#05070d"
          >
            {/* Chair back. */}
            <rect x="78" y="96" width="14" height="60" rx="4" />
            {/* Hunched back / torso. */}
            <path d={awake
              ? 'M92 134 C90 96 110 84 132 86 L150 100 C150 118 142 134 142 134 Z'
              : 'M92 134 C88 110 108 100 140 112 L168 130 L96 134 Z'} />
            {/* Head — resting on the desk when asleep, raised when awake. */}
            <ellipse cx={awake ? 134 : 150} cy={awake ? 92 : 120} rx="15" ry="14" />
            {/* Forearms on the desk. */}
            <rect x="96" y="120" width="86" height="12" rx="5" />
          </motion.g>
        </svg>
      </div>

      {/* Zzz — only while asleep. */}
      <AnimatePresence>
        {!awake && (
          <motion.div
            key="zzz"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: 'absolute', top: '34%', left: '58%', ...FONT_VT, color: 'rgba(186,230,253,.6)' }}
          >
            {['Z', 'z', 'z'].map((z, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: [0, 1, 0], y: -18 }}
                transition={{ duration: 2.4, delay: i * 0.5, repeat: Infinity, repeatDelay: 0.6 }}
                style={{ display: 'inline-block', fontSize: 18 + i * 8, marginLeft: i * 4 }}
              >
                {z}
              </motion.span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quiet framing line up top. */}
      <div style={{ position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)',
        ...FONT_ST, fontSize: 11, letterSpacing: '.3em', color: 'rgba(56,189,248,.4)', textAlign: 'center', width: '90%' }}>
        ▌ {subtitle}
      </div>
    </div>
  );
}

export default PostOnboardingIntro;
