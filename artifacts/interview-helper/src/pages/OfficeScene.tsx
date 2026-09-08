import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { speakWithTTS } from "@/lib/tts";
import { useArtAsset } from "@/lib/art";

/**
 * Office cold-open. The second tutorial beat after the bathroom.
 *
 * Empty-office policy: the player owns NOTHING yet — no bots, no crew,
 * no signed leases. The room is the entry-tier APARTMENT-OFFICE shown
 * on the realty page, and it's quiet. Pablo points at the pink terminal
 * in the back and tells the player to step through it into the world,
 * where they can buy a building, sign a bot, etc.
 *
 * All art is the Nano Banana Pro property still that the realty page
 * uses for `property_apartment_office`, so the cutscene visually
 * matches the storefront the player just (or will) browse.
 */

type Step = "enter" | "terminal" | "exit";

const PABLO_LINES: Record<Step, string | null> = {
  enter:
    "Welcome to your starter office — three desks, two terminals, kettle's on. No crew yet, no bots — that's why we're here.",
  terminal: "Step through the pink terminal in the back. That's your way out into the city.",
  exit: null,
};

const HANDOFF = "Be safe. Have fun. Don't die.";

export default function OfficeScene() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>("enter");
  const [terminalArmed, setTerminalArmed] = useState(false);
  // Use the SAME art the realty page uses for the entry-tier office, so
  // the cutscene matches the storefront 1:1.
  const officeArt = useArtAsset("property_apartment_office", 4000, { retryOnFail: true });

  const spokenRef = useRef<Set<Step>>(new Set());
  const ttsHandleRef = useRef<{ cancel: () => void } | null>(null);

  // Pablo line per step (once each).
  useEffect(() => {
    const line = PABLO_LINES[step];
    if (!line || spokenRef.current.has(step)) return;
    spokenRef.current.add(step);
    ttsHandleRef.current?.cancel();
    ttsHandleRef.current = speakWithTTS(line, () => {}, () => {});
  }, [step]);

  useEffect(() => () => { ttsHandleRef.current?.cancel(); }, []);

  // Auto-advance enter -> terminal after a beat, then arm the kiosk.
  useEffect(() => {
    if (step !== "enter") return;
    const t = setTimeout(() => {
      setStep("terminal");
      setTerminalArmed(true);
    }, 2400);
    return () => clearTimeout(t);
  }, [step]);

  const handoff = () => {
    if (step !== "terminal") return;
    setStep("exit");
    ttsHandleRef.current?.cancel();
    ttsHandleRef.current = speakWithTTS(HANDOFF, () => {}, () => {});
    setTimeout(() => navigate("/office"), 1500);
  };

  const skip = () => {
    navigate("/office");
  };

  const officeUrl = officeArt;

  return (
    <div className="fixed inset-0 z-40 bg-[#06070b] text-pink-100 overflow-hidden select-none" style={{ fontFamily: "var(--font-sans)" }}>
      {/* Pro-baked background — same Nano Banana still as the realty card
          for `property_apartment_office`. Slow Ken-Burns drift so the
          empty room feels alive without adding fake occupants. */}
      {officeUrl && (
        <motion.img
          src={officeUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1.12 }}
          transition={{ opacity: { duration: 0.8 }, scale: { duration: 22, ease: "linear" } }}
        />
      )}

      {/* Ambient scene lighting while the art is still composing. */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "radial-gradient(ellipse at 18% 70%, rgba(34,211,238,0.10), transparent 55%), radial-gradient(ellipse at 82% 30%, rgba(236,72,153,0.14), transparent 55%)",
      }} />

      {/* CSS fallback room while the Nano Banana still composes. */}
      {!officeUrl && (
        <>
          <div className="absolute inset-x-0 bottom-0 h-2/5" style={{
            background: "repeating-linear-gradient(0deg, #14171f 0 32px, #11141b 32px 64px)",
          }} />
          <div className="absolute inset-x-0 top-0 h-3/5" style={{
            background: "linear-gradient(180deg, #1a1f2c 0%, #11141b 100%)",
          }} />
          <div className="absolute inset-0 flex items-center justify-center text-pink-300/40 text-[10px] tracking-[0.4em]">
            COMPOSING SCENE…
          </div>
        </>
      )}

      {/* Pink terminal kiosk back-right — the ONLY interactive object in
          the room. No bot pods, no crew, no fake activity. */}
      <button
        type="button"
        disabled={!terminalArmed}
        onClick={handoff}
        className={`absolute ${terminalArmed ? "cursor-pointer" : "cursor-default"}`}
        style={{ left: "76%", top: "32%", width: "16%", height: "42%" }}
        data-testid="office-terminal"
      >
        <div className={`w-full h-full rounded-md relative overflow-hidden border-2 ${
          terminalArmed ? "border-pink-300 shadow-[0_0_36px_rgba(236,72,153,0.7)] animate-pulse" : "border-transparent"
        } bg-transparent`} />
        {terminalArmed && (
          <div className="absolute -bottom-9 left-1/2 -translate-x-1/2 px-3 py-1 rounded border border-pink-300 bg-pink-500/30 text-pink-50 text-[11px] tracking-widest animate-pulse whitespace-nowrap">
            TAP — ENTER WORLD ▸
          </div>
        )}
      </button>

      {/* HUD */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between text-[10px] tracking-[0.3em] text-pink-300/80">
        <div>SALARYMAN · YOUR OFFICE · STARTER · 不動産 #001</div>
        <div className="flex items-center gap-2">
          <button
            onClick={skip}
            className="px-2 py-1 rounded border border-pink-500/30 bg-pink-500/5 text-pink-300/60 hover:bg-pink-500/15 transition"
            data-testid="office-skip"
          >
            SKIP ▸
          </button>
          {/* Always-available bail-out back to the Pablo terminal. */}
          <button
            onClick={() => navigate("/pablo")}
            className="px-2 py-1 rounded border border-cyan-400/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20 transition"
            data-testid="office-exit"
            title="Back to Pablo terminal"
          >
            ✕ EXIT
          </button>
        </div>
      </div>

      {/* Subtitle */}
      <AnimatePresence mode="wait">
        {(PABLO_LINES[step] || step === "exit") && (
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4 }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 max-w-md w-[90%] text-center"
          >
            <div className="inline-block px-4 py-2 rounded-md border border-pink-400/40 bg-black/70 backdrop-blur text-pink-100 text-sm leading-snug">
              <span className="text-pink-300 mr-2">PABLO:</span>
              {step === "exit" ? HANDOFF : PABLO_LINES[step]}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Wipe-out transition into the live office */}
      <AnimatePresence>
        {step === "exit" && (
          <motion.div
            className="absolute inset-0 z-50 bg-black"
            initial={{ clipPath: "circle(0% at 84% 50%)" }}
            animate={{ clipPath: "circle(150% at 84% 50%)" }}
            transition={{ duration: 1.2, ease: "easeInOut", delay: 0.3 }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
