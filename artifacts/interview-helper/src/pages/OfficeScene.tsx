import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { speakWithTTS } from "@/lib/tts";
import { useArtAsset } from "@/lib/art";
// Tutorial completion is now driven exclusively by the Pablo passcode gate
// in PabloTerminal — walking past the office terminal must NOT mark the
// onboarding done, otherwise users bypass the storyteller.

/**
 * Office cold-open. The second tutorial beat after the bathroom.
 *
 * Sequence:
 *   1) Player walks into a small one-person office (auto). Pablo introduces
 *      the bot cryo-tubes lining the left wall.
 *   2) Tap the cryo-tubes to thaw out the starter bots — Jean Claw activates.
 *   3) The pink terminal kiosk in the back-right glows. Tap it for Pablo's
 *      handoff line and the wipe transition into /world/play.
 *
 * All art is the Nano Banana Pro background; interactive overlays use
 * positioned divs so the click targets stay reliable on top of the image.
 */

type Step = "enter" | "tubes" | "tubes_done" | "terminal" | "exit";

const PABLO_LINES: Record<Step, string | null> = {
  enter: "Welcome to your office. Cozy, right? Three cryo-tubes on your left — your starter crew.",
  tubes: "Tap the tubes to thaw them. Jean Claw first — he's the office manager. Don't ask about the claw.",
  tubes_done: "Crew's awake. Now hit the pink terminal in the back. That's your way out into the world.",
  terminal: null,
  exit: null,
};

const HANDOFF = "Be safe. Have fun. Don't die.";

export default function OfficeScene() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>("enter");
  const [tubesActivated, setTubesActivated] = useState<[boolean, boolean, boolean]>([false, false, false]);
  const [terminalArmed, setTerminalArmed] = useState(false);
  const officeArt = useArtAsset("scene_office");
  const tubeArt = useArtAsset("prop_bot_tube");
  const terminalArt = useArtAsset("prop_terminal_kiosk");
  const deskArt = useArtAsset("prop_desk");
  const cabinetArt = useArtAsset("prop_filing_cabinet");

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

  // Auto-advance enter -> tubes after a beat.
  useEffect(() => {
    if (step !== "enter") return;
    const t = setTimeout(() => setStep("tubes"), 1900);
    return () => clearTimeout(t);
  }, [step]);

  // When all 3 tubes are activated, advance to tubes_done, then arm terminal.
  useEffect(() => {
    if (step !== "tubes") return;
    if (!tubesActivated.every(Boolean)) return;
    setStep("tubes_done");
    const t = setTimeout(() => {
      setStep("terminal");
      setTerminalArmed(true);
    }, 2400);
    return () => clearTimeout(t);
  }, [tubesActivated, step]);

  const activateTube = (i: 0 | 1 | 2) => {
    if (step !== "tubes") return;
    setTubesActivated((prev) => {
      const next = [...prev] as [boolean, boolean, boolean];
      next[i] = true;
      return next;
    });
  };

  const handoff = () => {
    if (step !== "terminal") return;
    setStep("exit");
    ttsHandleRef.current?.cancel();
    ttsHandleRef.current = speakWithTTS(HANDOFF, () => {}, () => {});
    setTimeout(() => navigate("/world/play"), 1500);
  };

  const skip = () => {
    navigate("/world/play");
  };

  const officeUrl = officeArt;
  // Once the scene background is loaded, the props are baked into the painting
  // already — the per-prop sprites would just stack a second copy on top, so we
  // hide them and use the click targets purely as invisible hotspots + glow.
  const showPropArt = !officeUrl;
  const tubeUrl = showPropArt ? tubeArt : null;
  const terminalUrl = showPropArt ? terminalArt : null;
  const deskUrl = showPropArt ? deskArt : null;
  const cabinetUrl = showPropArt ? cabinetArt : null;

  return (
    <div className="fixed inset-0 z-40 bg-[#06070b] text-pink-100 overflow-hidden select-none" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
      {/* Pro-baked background */}
      {officeUrl && (
        <motion.img
          src={officeUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.92 }}
          transition={{ duration: 0.8 }}
        />
      )}

      {/* Soft cyan condensation light from the cryo-tubes */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "radial-gradient(ellipse at 18% 55%, rgba(34,211,238,0.16), transparent 55%), radial-gradient(ellipse at 82% 60%, rgba(236,72,153,0.18), transparent 55%)",
      }} />

      {/* CSS fallback room when art hasn't loaded yet */}
      {!officeUrl && (
        <>
          <div className="absolute inset-x-0 bottom-0 h-2/5" style={{
            background: "repeating-linear-gradient(0deg, #14171f 0 32px, #11141b 32px 64px)",
          }} />
          <div className="absolute inset-x-0 top-0 h-3/5" style={{
            background: "linear-gradient(180deg, #1a1f2c 0%, #11141b 100%)",
          }} />
        </>
      )}

      {/* Three cryo-tubes on the left wall */}
      {([0, 1, 2] as const).map((i) => {
        const active = tubesActivated[i];
        const left = `${5 + i * 9}%`;
        const enabled = step === "tubes";
        return (
          <button
            key={i}
            type="button"
            disabled={!enabled || active}
            onClick={() => activateTube(i)}
            className={`absolute ${enabled && !active ? "cursor-pointer" : "cursor-default"}`}
            style={{ left, top: "28%", width: "8%", height: "44%" }}
            data-testid={`office-cryo-tube-${i}`}
          >
            <div className={`w-full h-full rounded-t-[40%] rounded-b-md relative overflow-hidden border-2 ${
              active ? "border-cyan-300 shadow-[0_0_28px_rgba(34,211,238,0.55)]"
                     : enabled ? "border-pink-400/70 shadow-[0_0_18px_rgba(236,72,153,0.45)] animate-pulse"
                               : "border-transparent"
            } bg-transparent`}>
              {tubeUrl && (
                <img src={tubeUrl} alt="" className="w-full h-full object-contain"
                     style={{ filter: active ? "brightness(1.25) saturate(1.2)" : "brightness(0.85)" }} />
              )}
              {!tubeUrl && !officeUrl && (
                <div className="absolute inset-x-2 top-3 bottom-3 rounded-t-full rounded-b bg-gradient-to-b from-cyan-300/20 via-cyan-400/15 to-cyan-200/30" />
              )}
              {active && (
                <motion.div
                  className="absolute inset-0 bg-cyan-300/25"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 0.6, 0.2] }}
                  transition={{ duration: 1.2 }}
                />
              )}
            </div>
            {enabled && !active && (
              <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded border border-pink-400/60 bg-pink-500/15 text-pink-100 text-[10px] tracking-widest whitespace-nowrap">
                THAW
              </div>
            )}
            {active && (
              <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded border border-cyan-300/70 bg-cyan-400/15 text-cyan-100 text-[10px] tracking-widest whitespace-nowrap">
                {i === 0 ? "JEAN CLAW" : i === 1 ? "BOT-02" : "BOT-03"}
              </div>
            )}
          </button>
        );
      })}

      {/* Desk in the middle (decorative; only shown if Pro art loaded) */}
      {deskUrl && (
        <div className="absolute pointer-events-none" style={{ left: "38%", top: "55%", width: "22%", height: "22%" }}>
          <img src={deskUrl} alt="" className="w-full h-full object-contain opacity-0" />
        </div>
      )}

      {/* Filing cabinet (decorative) */}
      {cabinetUrl && (
        <div className="absolute pointer-events-none" style={{ left: "62%", top: "50%", width: "8%", height: "22%" }}>
          <img src={cabinetUrl} alt="" className="w-full h-full object-contain opacity-0" />
        </div>
      )}

      {/* Pink terminal kiosk back-right */}
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
        } bg-transparent`}>
          {terminalUrl && (
            <img src={terminalUrl} alt="" className="w-full h-full object-contain"
                 style={{ filter: terminalArmed ? "brightness(1.15) saturate(1.25)" : "brightness(0.7)" }} />
          )}
          {!terminalUrl && !officeUrl && (
            <div className="absolute inset-3 rounded bg-gradient-to-b from-pink-500/40 via-fuchsia-500/30 to-pink-400/40" />
          )}
        </div>
        {terminalArmed && (
          <div className="absolute -bottom-9 left-1/2 -translate-x-1/2 px-3 py-1 rounded border border-pink-300 bg-pink-500/30 text-pink-50 text-[11px] tracking-widest animate-pulse whitespace-nowrap">
            TAP — ENTER WORLD ▸
          </div>
        )}
      </button>

      {/* HUD */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between text-[10px] tracking-[0.3em] text-pink-300/80">
        <div>SALARYMAN · YOUR OFFICE · FLOOR 12</div>
        <button
          onClick={skip}
          className="px-2 py-1 rounded border border-pink-500/30 bg-pink-500/5 text-pink-300/60 hover:bg-pink-500/15 transition"
          data-testid="office-skip"
        >
          SKIP ▸
        </button>
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

      {/* Wipe-out transition into /world/play */}
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
