import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PabloNebula3D } from "@/components/PabloNebula3D";
import { speakWithTTS } from "@/lib/tts";

// A reusable cinematic intro overlay built around the Pablo nebula. It is the
// "draw the user in" moment used both at the start of the onboarding tutorial
// and (later) for the terminal-kiosk handoff. Lifecycle:
//
//   1. Fade in over a black field with the nebula at low intensity.
//   2. Speak the line(s) using ElevenLabs (Pablo's voice).
//   3. When voice finishes (or skipped), trigger a wipe-out and call onDone().
//
// The component is fully self-contained — no parent state needed.

type Status = "idle" | "speaking";

interface PabloIntroOverlayProps {
  // Lines spoken by Pablo, in order. Each is a separate TTS call so cancel works.
  lines: string[];
  // Called once the wipe completes and the overlay should unmount.
  onDone: () => void;
  // Optional skip label for the user to bail out.
  skipLabel?: string;
  // Optional hold time (ms) after speech ends before wiping. Default 600ms.
  holdAfterSpeechMs?: number;
}

export function PabloIntroOverlay({
  lines,
  onDone,
  skipLabel = "SKIP",
  holdAfterSpeechMs = 600,
}: PabloIntroOverlayProps) {
  const [status, setStatus] = useState<Status>("speaking");
  const [currentLineIdx, setCurrentLineIdx] = useState(0);
  const [wiping, setWiping] = useState(false);
  const cancelRef = useRef<{ cancel: () => void } | null>(null);
  const finishedRef = useRef(false);

  // Speak the current line; advance on end.
  useEffect(() => {
    if (wiping || finishedRef.current) return;
    if (currentLineIdx >= lines.length) {
      // All lines done — hold briefly, then wipe.
      const t = setTimeout(() => triggerWipe(), holdAfterSpeechMs);
      return () => clearTimeout(t);
    }
    setStatus("speaking");
    const handle = speakWithTTS(
      lines[currentLineIdx],
      () => {
        setCurrentLineIdx((i) => i + 1);
      },
      () => {
        setCurrentLineIdx((i) => i + 1);
      },
    );
    cancelRef.current = handle;
    return () => {
      try { handle.cancel(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLineIdx, lines.length, wiping]);

  function triggerWipe() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    try { cancelRef.current?.cancel(); } catch {}
    setWiping(true);
    // Wipe lasts ~700ms (matches AnimatePresence exit duration below).
    setTimeout(() => onDone(), 750);
  }

  function handleSkip() {
    triggerWipe();
  }

  const currentLine = lines[currentLineIdx] ?? "";

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
          {/* Nebula at center */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-[min(72vmin,640px)] h-[min(72vmin,640px)]">
              <PabloNebula3D status={status} size={640} />
            </div>
          </div>

          {/* Spoken line subtitle */}
          <div className="absolute left-1/2 -translate-x-1/2 bottom-[18vh] max-w-[80vw] text-center px-4">
            <motion.p
              key={currentLineIdx}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="text-pink-200 text-sm sm:text-base md:text-lg"
              style={{ fontFamily: "'Share Tech Mono', monospace", letterSpacing: "0.04em", lineHeight: 1.6, textShadow: "0 0 16px rgba(236,72,153,0.4)" }}
            >
              {currentLine}
            </motion.p>
          </div>

          {/* Skip control */}
          <button
            onClick={handleSkip}
            className="absolute top-4 right-4 px-3 py-1.5 rounded-md border border-pink-500/30 bg-pink-500/10 text-pink-300 text-[10px] font-bold tracking-widest hover:bg-pink-500/20 transition-colors"
            style={{ fontFamily: "'Share Tech Mono', monospace" }}
          >
            {skipLabel} ▸
          </button>
        </motion.div>
      )}

      {/* Wipe transition layer */}
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
