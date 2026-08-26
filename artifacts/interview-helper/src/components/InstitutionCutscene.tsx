import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, X } from "lucide-react";

/**
 * InstitutionCutscene — first-person, medium-shot framing for any major
 * institution in the game (bank, hospital, court, gov, etc.). Renders a
 * full-bleed scene with a stylized backdrop, an NPC card on the left, and
 * dialogue beats the player advances by tapping or pressing space/enter.
 *
 * Designed to be reusable: pass an institution name, a backdrop key, and a
 * sequence of speaker/line beats. Callers control persistence (e.g. setting
 * a localStorage key) via onClose.
 */

export type CutsceneBeat = {
  speaker: string;
  line: string;
};

type Backdrop = "bank" | "hospital" | "court" | "gov" | "stockmarket" | "default";

const BACKDROPS: Record<Backdrop, { gradient: string; accent: string; vignette: string; floor: string }> = {
  bank: {
    gradient: "from-emerald-950 via-zinc-950 to-black",
    accent: "rgba(16,185,129,0.25)",
    vignette: "rgba(6,78,59,0.35)",
    floor: "from-emerald-900/30 to-transparent",
  },
  hospital: {
    gradient: "from-cyan-950 via-zinc-950 to-black",
    accent: "rgba(34,211,238,0.22)",
    vignette: "rgba(8,145,178,0.3)",
    floor: "from-cyan-900/30 to-transparent",
  },
  court: {
    gradient: "from-amber-950 via-zinc-950 to-black",
    accent: "rgba(245,158,11,0.22)",
    vignette: "rgba(120,53,15,0.35)",
    floor: "from-amber-900/30 to-transparent",
  },
  gov: {
    gradient: "from-rose-950 via-zinc-950 to-black",
    accent: "rgba(244,63,94,0.2)",
    vignette: "rgba(136,19,55,0.3)",
    floor: "from-rose-900/30 to-transparent",
  },
  stockmarket: {
    gradient: "from-fuchsia-950 via-zinc-950 to-black",
    accent: "rgba(217,70,239,0.22)",
    vignette: "rgba(112,26,117,0.3)",
    floor: "from-fuchsia-900/30 to-transparent",
  },
  default: {
    gradient: "from-zinc-900 via-zinc-950 to-black",
    accent: "rgba(255,255,255,0.12)",
    vignette: "rgba(0,0,0,0.5)",
    floor: "from-white/10 to-transparent",
  },
};

export default function InstitutionCutscene({
  institution,
  backdrop = "default",
  beats,
  onClose,
}: {
  institution: string;
  backdrop?: Backdrop;
  beats: CutsceneBeat[];
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const bd = BACKDROPS[backdrop] ?? BACKDROPS.default;
  const beat = beats[idx];

  const advance = () => {
    if (idx < beats.length - 1) setIdx(idx + 1);
    else onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] cursor-pointer"
        onClick={advance}
        data-testid="institution-cutscene"
      >
        {/* Backdrop — gradient + vignette + horizon line for medium-shot depth */}
        <div className={`absolute inset-0 bg-gradient-to-b ${bd.gradient}`} />
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at 50% 35%, ${bd.accent} 0%, transparent 55%), radial-gradient(circle at 50% 100%, ${bd.vignette} 0%, transparent 70%)`,
          }}
        />
        {/* Horizon / desk line — sells the medium shot POV */}
        <div className="absolute inset-x-0 top-[55%] h-px bg-white/10" />
        <div className={`absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t ${bd.floor}`} />

        {/* Top status bar */}
        <div className="absolute top-0 inset-x-0 flex items-center justify-between px-4 sm:px-8 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
          <div className="text-[9px] sm:text-[10px] font-mono tracking-[0.4em] text-white/60">
            ▶ INSIDE · {institution}
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="text-[10px] font-mono tracking-[0.3em] text-white/60 hover:text-white border border-white/15 rounded px-2 py-1 flex items-center gap-1"
          >
            SKIP <X className="w-3 h-3" />
          </button>
        </div>

        {/* NPC silhouette card — medium shot, head-and-shoulders */}
        <div className="absolute inset-0 flex items-end sm:items-center justify-center px-4 sm:px-12 pb-40 sm:pb-32 pointer-events-none">
          <motion.div
            key={beat?.speaker ?? "x"}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="hidden sm:flex w-44 h-56 rounded-t-full bg-gradient-to-b from-white/15 to-white/[0.04] border border-white/15 items-end justify-center"
            style={{ boxShadow: `0 0 40px 0 ${bd.accent}` }}
          >
            <div className="w-32 h-28 rounded-t-full bg-black/50 border-t border-white/10" />
          </motion.div>
        </div>

        {/* Dialogue panel — bottom for mobile, classic VN style */}
        <div className="absolute inset-x-0 bottom-0 px-3 sm:px-8 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="max-w-3xl mx-auto rounded-xl border border-white/15 bg-black/75 backdrop-blur p-4 sm:p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] sm:text-[11px] font-mono tracking-[0.4em] text-white/70">
                {beat?.speaker}
              </p>
              <p className="text-[9px] font-mono tracking-[0.3em] text-white/40">
                {idx + 1} / {beats.length}
              </p>
            </div>
            <p className="text-base sm:text-lg leading-relaxed text-white/95 font-light">
              {beat?.line}
            </p>
            <div className="mt-3 flex items-center justify-end text-[10px] font-mono tracking-[0.3em] text-white/50">
              TAP / SPACE / ENTER <ChevronRight className="w-3 h-3 ml-1 animate-pulse" />
            </div>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
