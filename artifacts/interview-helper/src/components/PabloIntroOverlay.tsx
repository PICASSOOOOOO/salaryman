import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PabloNebula3D, type NebulaStatus } from "@/components/PabloNebula3D";
import { AudioDeviceSelector } from "@/components/AudioDeviceSelector";
import { speakWithTTS, unlockAudio, isAudioUnlocked } from "@/lib/tts";

/**
 * Pablo intro / kiosk overlay.
 *
 * Behaviour rules forced by playtest feedback:
 *   1. ONE intro per session. Once it has played (or been skipped) the user
 *      cannot loop it by re-navigating — `sessionStorage.pablo_intro_seen`
 *      is set on completion and the overlay short-circuits to onDone() if
 *      that flag is present.
 *   2. SLOW it down. Lines are gated by both audio-end AND a per-line
 *      minimum dwell time so the words don't blink past unread when TTS is
 *      flaky.
 *   3. TYPE FALLBACK. If audio doesn't start within `audioStuckMs`, or
 *      audio outright fails, surface a text input letting the user type to
 *      Pablo. The line is delivered to `onUserText` (caller decides what to
 *      do — usually post to the Pablo chat endpoint).
 */

// One canonical key so unrelated overlays can't fight over the same flag.
const SESSION_FLAG_KEY = "pablo_intro_seen";

interface PabloIntroOverlayProps {
  /** Lines spoken by Pablo, in order. Each is a separate TTS call so cancel works. */
  lines: string[];
  /** Called once the wipe completes and the overlay should unmount. */
  onDone: () => void;
  /** Optional skip label for the user to bail out. */
  skipLabel?: string;
  /** Hold time (ms) after speech ends before wiping. Default 1500ms (was 600). */
  holdAfterSpeechMs?: number;
  /** Minimum on-screen time per line, regardless of TTS speed. Default 2200ms. */
  minLineDwellMs?: number;
  /** How long to wait for TTS to start before showing the type fallback. Default 6000ms. */
  audioStuckMs?: number;
  /** Text typed by the user when they fall back to typing. */
  onUserText?: (text: string) => void;
  /** Disable the once-per-session guard (for tests / kiosk mode). */
  alwaysShow?: boolean;
}

type Status = "idle" | "speaking" | "stuck";

/**
 * Sizes the nebula to the available viewport so it never overflows on mobile
 * (where 640px was 2× the wrapper width on a 390-wide phone) and stays
 * generously sized on desktop. We listen for resize so rotating a tablet or
 * resizing the browser keeps the orb proportional.
 */
function ResponsiveNebula({ status }: { status: NebulaStatus }) {
  const compute = () => {
    if (typeof window === "undefined") return 480;
    const minSide = Math.min(window.innerWidth, window.innerHeight);
    // Leave room for the bottom caption + input + safe-area on mobile (~40%
    // of vertical space) and a comfortable margin on desktop.
    return Math.floor(minSide * 0.78);
  };
  const [size, setSize] = useState(compute);
  useEffect(() => {
    const onResize = () => setSize(compute());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return <PabloNebula3D status={status} size={size} />;
}

export function PabloIntroOverlay({
  lines,
  onDone,
  skipLabel = "SKIP",
  holdAfterSpeechMs = 1500,
  minLineDwellMs = 2200,
  audioStuckMs = 6000,
  onUserText,
  alwaysShow = false,
}: PabloIntroOverlayProps) {
  // Bail immediately if the user has already seen the intro this session.
  // Done synchronously in render via a ref so the overlay never paints.
  const skipRef = useRef<boolean | null>(null);
  if (skipRef.current === null) {
    skipRef.current = !alwaysShow && typeof window !== "undefined" && sessionStorage.getItem(SESSION_FLAG_KEY) === "1";
  }
  const skipImmediately = skipRef.current;
  useEffect(() => {
    if (skipImmediately) onDone();
  }, [skipImmediately, onDone]);

  const [status, setStatus] = useState<Status>("speaking");
  const [currentLineIdx, setCurrentLineIdx] = useState(0);
  const [wiping, setWiping] = useState(false);
  const [showTypeFallback, setShowTypeFallback] = useState(false);
  const [typedText, setTypedText] = useState("");
  // iOS Safari blocks ALL audio until a user gesture has occurred. We render
  // a "TAP TO BEGIN" scrim until either the global auto-unlock has fired
  // (the user tapped somewhere to navigate here) or the user explicitly
  // taps the scrim. Without this, the intro audio is silently muted on
  // iPhone — which the user reads as "Pablo doesn't speak".
  const [needsGesture, setNeedsGesture] = useState<boolean>(() => !isAudioUnlocked());
  const cancelRef = useRef<{ cancel: () => void } | null>(null);
  const finishedRef = useRef(false);
  const lineStartRef = useRef<number>(Date.now());
  const audioStartedRef = useRef(false);

  // Mark intro as seen the moment the overlay actually mounts and starts
  // doing work. We don't want a flaky reload to re-trigger it.
  useEffect(() => {
    if (skipImmediately) return;
    try { sessionStorage.setItem(SESSION_FLAG_KEY, "1"); } catch { /* private mode */ }
  }, [skipImmediately]);

  // Speak the current line; advance only after BOTH audio-end AND the
  // minimum dwell time. This keeps the pacing legible even when TTS is
  // missing or returns instantly via the browser fallback.
  useEffect(() => {
    if (skipImmediately || wiping || finishedRef.current) return;
    // Don't try to speak before the user has unlocked audio. iOS will silently
    // mute the call and we'd burn through the script with no sound. The scrim
    // owns the user gesture; once it's dismissed this effect runs again.
    if (needsGesture) return;
    if (currentLineIdx >= lines.length) {
      const t = setTimeout(() => triggerWipe(), holdAfterSpeechMs);
      return () => clearTimeout(t);
    }

    setStatus("speaking");
    audioStartedRef.current = false;
    lineStartRef.current = Date.now();

    let audioDone = false;
    let dwellMet = false;
    function tryAdvance() {
      if (audioDone && dwellMet && !finishedRef.current) {
        setCurrentLineIdx((i) => i + 1);
      }
    }

    const dwellTimer = setTimeout(() => { dwellMet = true; tryAdvance(); }, minLineDwellMs);
    const stuckTimer = setTimeout(() => {
      // If audio still hasn't kicked in by audioStuckMs, surface the type
      // fallback and flag the nebula as "stuck" (uses the thinking palette).
      if (!audioStartedRef.current) {
        setStatus("stuck");
        setShowTypeFallback(true);
      }
    }, audioStuckMs);

    const handle = speakWithTTS(
      lines[currentLineIdx],
      () => { audioStartedRef.current = true; audioDone = true; tryAdvance(); },
      () => { audioStartedRef.current = true; audioDone = true; tryAdvance(); },
    );
    // Best-effort flag: if speakWithTTS resolved synchronously to playback,
    // we won't get a hook to detect "started" before "ended" — that's fine,
    // the stuck-timer just won't fire because audioDone landed first.
    cancelRef.current = handle;

    return () => {
      clearTimeout(dwellTimer);
      clearTimeout(stuckTimer);
      try { handle.cancel(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLineIdx, lines.length, wiping, skipImmediately]);

  function triggerWipe() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    try { cancelRef.current?.cancel(); } catch {}
    setWiping(true);
    setTimeout(() => onDone(), 750);
  }

  function handleSkip() {
    triggerWipe();
  }

  function submitText() {
    const t = typedText.trim();
    if (!t) return;
    setTypedText("");
    onUserText?.(t);
    // Typing implies the user is engaged — push past whatever line is stuck.
    setShowTypeFallback(false);
    setCurrentLineIdx((i) => Math.min(i + 1, lines.length));
  }

  if (skipImmediately) return null;

  const currentLine = lines[currentLineIdx] ?? "";
  const nebulaStatus: NebulaStatus = status === "stuck" ? "thinking" : "speaking";

  return (
    <AnimatePresence>
      {!wiping && (
        <motion.div
          key="pablo-intro-overlay"
          className="fixed inset-0 z-[9999] bg-black overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Nebula is sized to the viewport so it never overflows on mobile
              (where the previous hardcoded 640px was 2× the wrapper) and
              never gets boxed-in on desktop. The shader self-renders at the
              size we pass it. */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <ResponsiveNebula status={nebulaStatus} />
          </div>

          {/*
            Bottom cluster (caption + input + audio selector). The stack is
            ~180px tall on desktop and ~140px on mobile; positioning it at a
            fixed 18vh meant it crowded the edge on phones and clipped on
            short laptop screens. Using bottom-aligned flex with safe-area
            padding keeps the gap honest at every viewport. We also cap the
            cluster width per breakpoint so the input isn't ridiculously wide
            on big screens.
          */}
          <div
            className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 sm:gap-4 px-4"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }}
          >
            <div className="w-full max-w-[34rem] text-center">
              <motion.p
                key={currentLineIdx}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="text-pink-200 text-xs sm:text-base md:text-lg"
                style={{ fontFamily: "'Share Tech Mono', monospace", letterSpacing: "0.04em", lineHeight: 1.6, textShadow: "0 0 16px rgba(236,72,153,0.4)" }}
              >
                {currentLine}
              </motion.p>
            </div>

            {/* The text input is ALWAYS visible — typing to Pablo is not a
                fallback, it's a first-class option for users who can't or
                don't want to use audio. The `showTypeFallback` state still
                tints the nebula `thinking` when audio stalls, but the input
                itself never hides. */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 w-full max-w-md"
            >
              <input
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitText(); }}
                placeholder="Type to Pablo…"
                className="flex-1 min-w-0 px-3 py-2 rounded bg-black/60 border border-pink-500/40 text-pink-100 text-sm outline-none focus:border-pink-400"
                style={{ fontFamily: "'Share Tech Mono', monospace" }}
              />
              <button
                onClick={submitText}
                className="shrink-0 px-3 py-2 rounded border border-pink-500/40 text-pink-200 text-[10px] tracking-widest hover:bg-pink-500/20"
                style={{ fontFamily: "'Share Tech Mono', monospace" }}
              >SEND</button>
            </motion.div>

            {/* Audio device picker — shown right under the input so users can
                pick the right mic/speaker if Pablo can't hear them or if his
                voice is coming out of the wrong device. Hidden on phones to
                keep the bottom edge breathing — mobile users overwhelmingly
                use the system default and the picker UI eats vertical space. */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="hidden sm:flex justify-center"
            >
              <AudioDeviceSelector />
            </motion.div>
          </div>

          <button
            onClick={handleSkip}
            className="absolute top-4 right-4 px-3 py-1.5 rounded-md border border-pink-500/30 bg-pink-500/10 text-pink-300 text-[10px] font-bold tracking-widest hover:bg-pink-500/20 transition-colors"
            style={{ fontFamily: "'Share Tech Mono', monospace" }}
          >
            {skipLabel} ▸
          </button>

          {/* iOS / mobile audio gate. Renders on top of the overlay until
              the user taps once — the tap unlocks audio playback for the
              rest of the page lifetime. Tapping anywhere on the scrim
              counts; we also call unlockAudio() defensively so even
              browsers that don't strictly need the gesture get primed. */}
          {needsGesture && (
            <button
              type="button"
              onClick={async () => {
                await unlockAudio();
                setNeedsGesture(false);
              }}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm cursor-pointer"
              aria-label="Tap to begin"
            >
              <div className="w-16 h-16 rounded-full border-2 border-pink-400/70 flex items-center justify-center mb-4 animate-pulse">
                <div className="w-3 h-3 rounded-full bg-pink-400" />
              </div>
              <div
                className="text-pink-200 text-sm tracking-[0.4em] uppercase"
                style={{ fontFamily: "'Share Tech Mono', monospace", textShadow: "0 0 12px rgba(236,72,153,0.5)" }}
              >
                Tap To Begin
              </div>
              <div
                className="mt-3 text-pink-400/60 text-[10px] tracking-widest uppercase"
                style={{ fontFamily: "'Share Tech Mono', monospace" }}
              >
                Pablo wants to talk
              </div>
            </button>
          )}
        </motion.div>
      )}

      {wiping && (
        <motion.div
          key="pablo-intro-wipe"
          className="fixed inset-0 z-[10000] bg-black"
          initial={{ clipPath: "circle(150% at 50% 50%)" }}
          animate={{ clipPath: "circle(0% at 50% 50%)" }}
          transition={{ duration: 0.7, ease: "easeInOut" }}
        />
      )}
    </AnimatePresence>
  );
}
