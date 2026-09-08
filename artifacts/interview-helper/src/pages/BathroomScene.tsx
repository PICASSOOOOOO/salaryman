import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { speakWithTTS } from "@/lib/tts";
import { useArtAsset } from "@/lib/art";

/**
 * Bathroom cold-open. This is the very first interactive moment the new
 * player has after the cinematic intro and briefing card. The point is to
 * teach the player they CAN tap things, that the world responds, and to set
 * the tone (low-poly pixel office, dry humour, Pablo's voice).
 *
 * Sequence:
 *   1) Player walks up to the sink (auto). Tap [WASH] -> water fx + dialogue.
 *   2) Walk to dryer. Tap [DRY] -> hand-dryer fx + dialogue.
 *   3) Door highlights. Tap [OPEN DOOR] -> wipe transition -> /world/play.
 *
 * Everything is CSS / SVG so the scene loads instantly and works on mobile.
 */

type Step = "intro" | "sink" | "dryer" | "door" | "exit";

const PABLO_LINES: Record<Step, string | null> = {
  intro: "Long flight, huh? Wash up. There's a sink to your left.",
  sink: "Atta person. Now over to the dryer — can't shake hands with wet palms.",
  dryer: "Good. The door's open. Step into your office when you're ready.",
  door: null,
  exit: null,
};

export default function BathroomScene() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>("intro");
  // Nano Banana-baked art (loads asynchronously; CSS art is the placeholder)
  const artRecovery = { retryOnFail: true };
  const bathroomArt = useArtAsset("scene_bathroom", 4000, artRecovery);
  const sinkArt = useArtAsset("prop_sink", 4000, artRecovery);
  const dryerArt = useArtAsset("prop_dryer", 4000, artRecovery);
  const doorArt = useArtAsset("prop_door", 4000, artRecovery);
  const [washing, setWashing] = useState(false);
  const [drying, setDrying] = useState(false);
  const spokenRef = useRef<Set<Step>>(new Set());
  const ttsHandleRef = useRef<{ cancel: () => void } | null>(null);

  // Speak Pablo's line whenever the step changes (once per step).
  useEffect(() => {
    const line = PABLO_LINES[step];
    if (!line || spokenRef.current.has(step)) return;
    spokenRef.current.add(step);
    ttsHandleRef.current?.cancel();
    ttsHandleRef.current = speakWithTTS(line, () => {}, () => {});
  }, [step]);

  useEffect(() => () => { ttsHandleRef.current?.cancel(); }, []);

  // Auto-advance from intro -> sink after a beat so the player sees the room.
  useEffect(() => {
    if (step !== "intro") return;
    const t = setTimeout(() => setStep("sink"), 1800);
    return () => clearTimeout(t);
  }, [step]);

  const goExit = () => {
    setStep("exit");
    setTimeout(() => navigate("/game/office"), 900);
  };

  const bathroomBgUrl = bathroomArt;
  const sinkUrl = sinkArt;
  const dryerUrl = dryerArt;
  const doorUrl = doorArt;

  return (
    <div className="fixed inset-0 z-40 bg-[#06070b] text-pink-100 overflow-hidden select-none" style={{ fontFamily: "var(--font-sans)" }}>
      {/* Pro-baked background scene (fades in over CSS placeholder) */}
      {bathroomBgUrl && (
        <motion.img
          src={bathroomBgUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.92 }}
          transition={{ duration: 0.8 }}
        />
      )}

      {/* Fluorescent overhead light hum */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "radial-gradient(ellipse at 50% -10%, rgba(180,200,255,0.12), transparent 60%)",
      }} />

      {!bathroomBgUrl && (
        <>
          {/* Floor tiles */}
          <div className="absolute inset-x-0 bottom-0 h-2/5" style={{
            background: "repeating-linear-gradient(45deg, #14171f 0 28px, #11141b 28px 56px)",
            boxShadow: "inset 0 80px 60px -50px rgba(0,0,0,0.7)",
          }} />

          {/* Wall + tile pattern */}
          <div className="absolute inset-x-0 top-0 h-3/5" style={{
            background: "linear-gradient(180deg, #1a1f2c 0%, #11141b 100%)",
          }}>
            <div className="absolute inset-0 opacity-40" style={{
              backgroundImage:
                "linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }} />
          </div>
        </>
      )}

      {/* Mirror */}
      <div className="absolute" style={{ left: "12%", top: "16%", width: "26%", height: "32%" }}>
        <div className="w-full h-full rounded-md border border-zinc-500/30 bg-gradient-to-br from-zinc-700/50 to-zinc-900/70 shadow-[0_0_20px_rgba(160,180,220,0.15)_inset]" />
        <div className="absolute -bottom-1 left-0 right-0 h-1 bg-zinc-700/60" />
      </div>

      {/* Sink */}
      <button
        type="button"
        disabled={step !== "sink"}
        onClick={() => {
          if (step !== "sink") return;
          setWashing(true);
          setTimeout(() => { setWashing(false); setStep("dryer"); }, 1600);
        }}
        className={`absolute group ${step === "sink" ? "cursor-pointer" : "cursor-default"}`}
        style={{ left: "14%", top: "50%", width: "22%", height: "16%" }}
        data-testid="bathroom-sink"
      >
        <div className={`w-full h-full rounded-lg ${sinkUrl ? "bg-transparent" : "bg-zinc-300/90 border border-zinc-500/60 shadow-md"} relative ${step === "sink" ? "ring-2 ring-pink-400/70 shadow-[0_0_24px_rgba(236,72,153,0.45)]" : ""}`}>
          {sinkUrl ? (
            <img src={sinkUrl} alt="" className="w-full h-full object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.6)]" />
          ) : (
            <>
              <div className="absolute left-1/2 -translate-x-1/2 -top-2 w-1.5 h-4 bg-zinc-400 rounded-sm" />
              <div className="absolute left-1/2 -translate-x-1/2 top-2 w-2 h-1 bg-zinc-500 rounded-sm" />
              <div className="absolute inset-x-3 inset-y-3 rounded-md bg-zinc-200 opacity-90" />
            </>
          )}
          {washing && (
            <motion.div
              className="absolute left-1/2 top-2 w-1 -translate-x-1/2 bg-cyan-300/80 rounded-full"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 56, opacity: [0, 1, 1, 0.8] }}
              transition={{ duration: 1.4 }}
            />
          )}
        </div>
        {step === "sink" && (
          <div className="absolute -bottom-9 left-1/2 -translate-x-1/2 px-3 py-1 rounded border border-pink-400/60 bg-pink-500/15 text-pink-100 text-[11px] tracking-widest animate-pulse whitespace-nowrap">
            TAP — WASH
          </div>
        )}
      </button>

      {/* Hand Dryer */}
      <button
        type="button"
        disabled={step !== "dryer"}
        onClick={() => {
          if (step !== "dryer") return;
          setDrying(true);
          setTimeout(() => { setDrying(false); setStep("door"); }, 1500);
        }}
        className={`absolute ${step === "dryer" ? "cursor-pointer" : "cursor-default"}`}
        style={{ left: "44%", top: "30%", width: "12%", height: "14%" }}
        data-testid="bathroom-dryer"
      >
        <div className={`w-full h-full rounded-md ${dryerUrl ? "bg-transparent" : "bg-zinc-200 border border-zinc-500/60 shadow-md"} relative overflow-hidden ${step === "dryer" ? "ring-2 ring-pink-400/70 shadow-[0_0_24px_rgba(236,72,153,0.45)]" : ""}`}>
          {dryerUrl ? (
            <img src={dryerUrl} alt="" className="w-full h-full object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.6)]" />
          ) : (
            <>
              <div className="absolute inset-x-2 top-2 h-2 bg-zinc-400 rounded-sm" />
              <div className="absolute inset-x-3 bottom-2 h-3 bg-zinc-700 rounded-sm" />
            </>
          )}
          {drying && (
            <motion.div
              className="absolute inset-0 bg-gradient-to-b from-cyan-200/60 to-transparent"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: [0, 0.9, 0.6, 0], y: [-12, 0, 8, 16] }}
              transition={{ duration: 1.4 }}
            />
          )}
        </div>
        {step === "dryer" && (
          <div className="absolute -bottom-9 left-1/2 -translate-x-1/2 px-3 py-1 rounded border border-pink-400/60 bg-pink-500/15 text-pink-100 text-[11px] tracking-widest animate-pulse whitespace-nowrap">
            TAP — DRY
          </div>
        )}
      </button>

      {/* Stalls (decorative) */}
      <div className="absolute" style={{ left: "62%", top: "20%", width: "30%", height: "40%" }}>
        <div className="grid grid-cols-2 gap-2 h-full">
          <div className="rounded border border-zinc-600/40 bg-zinc-800/40" />
          <div className="rounded border border-zinc-600/40 bg-zinc-800/40" />
        </div>
      </div>

      {/* Exit door */}
      <button
        type="button"
        disabled={step !== "door"}
        onClick={() => { if (step === "door") goExit(); }}
        className={`absolute ${step === "door" ? "cursor-pointer" : "cursor-default"}`}
        style={{ left: "75%", top: "55%", width: "13%", height: "30%" }}
        data-testid="bathroom-door"
      >
        <div className={`w-full h-full rounded-t-md border ${step === "door" ? "border-pink-300 shadow-[0_0_24px_rgba(236,72,153,0.55)]" : "border-zinc-600/60"} ${doorUrl ? "bg-transparent" : "bg-gradient-to-b from-amber-900/70 to-amber-950/80"} relative overflow-hidden`}>
          {doorUrl ? (
            <img src={doorUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-yellow-300 rounded-full" />
          )}
          {step === "door" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="px-3 py-1 rounded border border-pink-300 bg-pink-500/30 text-pink-50 text-[11px] tracking-widest animate-pulse whitespace-nowrap">
                OPEN DOOR ▸
              </div>
            </div>
          )}
        </div>
      </button>

      {/* HUD overlays */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between text-[10px] tracking-[0.3em] text-pink-300/80">
        <div>SALARYMAN · BATHROOM · FLOOR 12</div>
        <button
          onClick={goExit}
          className="px-2 py-1 rounded border border-pink-500/30 bg-pink-500/5 text-pink-300/60 hover:bg-pink-500/15 transition"
          data-testid="bathroom-skip"
        >
          SKIP ▸
        </button>
      </div>

      {/* Subtitle */}
      <AnimatePresence mode="wait">
        {PABLO_LINES[step] && (
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
              {PABLO_LINES[step]}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Wipe-out transition to /world/play */}
      <AnimatePresence>
        {step === "exit" && (
          <motion.div
            className="absolute inset-0 z-50 bg-black"
            initial={{ clipPath: "circle(0% at 81% 70%)" }}
            animate={{ clipPath: "circle(150% at 81% 70%)" }}
            transition={{ duration: 0.85, ease: "easeInOut" }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
