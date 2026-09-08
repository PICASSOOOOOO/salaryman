/**
 * BotBirthSequence — full-screen "decant" cinematic that plays after a player
 * purchases / activates a marketplace bot. The bot is a replicant: it leaves
 * its life capsule, drops to the floor with amniotic gunk, picks itself up,
 * walks (off-screen) into the decontamination shower, and emerges in uniform
 * to report for duty.
 *
 * Pure CSS / div art — no external assets required. Designed to read on top
 * of the Akira pink / cyan-on-grime aesthetic. Silhouette-only nudity (frosted
 * glass + steam) keeps the cleansing stage tasteful.
 *
 * Usage:
 *   <BotBirthSequence
 *     botName="TERRENCE"
 *     specialty="Music Producer"
 *     onComplete={() => navigate("/bots")}
 *   />
 *
 * Stages run on a single setTimeout-driven state machine so a slow tab
 * cannot leave the player stranded — there is always a CLEAR button after
 * the final stage and an ESC-to-skip shortcut.
 */

import { useEffect, useRef, useState } from "react";

type Stage =
  | "germination"   // 0 — capsule full, bot suspended in fluid
  | "decant"        // 1 — capsule cracks, fluid drains, bot falls
  | "reboot"        // 2 — bot stirs on the floor, gunk dripping
  | "cleansing"     // 3 — frosted shower silhouette
  | "onboarding"    // 4 — bot walks back in uniform, salutes
  | "ready";        // 5 — final card with CLEAR button

const STAGE_MS: Record<Stage, number> = {
  germination: 2400,
  decant:      2400,
  reboot:      2400,
  cleansing:   2600,
  onboarding:  2600,
  ready:       0,
};

const ORDER: Stage[] = ["germination", "decant", "reboot", "cleansing", "onboarding", "ready"];

// Org serial designation. Every organization carries ONE serial, assigned by
// registration order: Picasso (the founding org) = A-001, the next = A-002, and
// so on. The bots decanted here are Picasso Pixel Agents, so they wear A-001.
// The named PRIMES (Pablo, Jean Claw, Rick) are exempt — they carry no serial.
const PRIME_NAMES = new Set(["PABLO", "JEAN CLAW", "RICK"]);
function defaultSerial(botName: string): string | null {
  return PRIME_NAMES.has((botName ?? "").trim().toUpperCase()) ? null : "A-001";
}

interface Props {
  botName: string;
  /** Optional one-line specialty / role shown on the dossier card. */
  specialty?: string;
  /** Optional bot category (used to colour-shift the uniform / capsule trim). */
  category?: string;
  /**
   * Org serial designation shown on the dossier (e.g. "A-001"). Pass `null`
   * for Primes (no serial). Omit to derive it from the bot name.
   */
  serial?: string | null;
  /** Called when the user dismisses the cinematic (CLEAR or skip). */
  onComplete: () => void;
}

export default function BotBirthSequence({ botName, specialty, category, serial, onComplete }: Props) {
  const resolvedSerial = serial === undefined ? defaultSerial(botName) : serial;
  const [stage, setStage] = useState<Stage>("germination");
  const startedAt = useRef<number>(Date.now());

  // Drive the stage machine. Each stage advances after its dwell time.
  useEffect(() => {
    if (stage === "ready") return;
    const t = setTimeout(() => {
      const i = ORDER.indexOf(stage);
      setStage(ORDER[Math.min(i + 1, ORDER.length - 1)]);
    }, STAGE_MS[stage]);
    return () => clearTimeout(t);
  }, [stage]);

  // ESC skips straight to the ready card.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setStage("ready");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const accent = uniformAccent(category);
  const elapsed = (s: Stage) => ORDER.indexOf(stage) >= ORDER.indexOf(s);

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center"
      style={{
        background:
          "radial-gradient(ellipse at center, #1a0510 0%, #050008 60%, #000 100%)",
        animation: "bbs-fade-in 320ms ease-out",
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`${botName} replicant decant in progress`}
    >
      {/* Ambient light from the decant chamber. */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "radial-gradient(circle at 50% 100%, rgba(236,72,153,0.16), transparent 55%)",
      }} />

      {/* Pixel terminal HUD top */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between font-mono text-[10px] tracking-[0.4em] text-pink-300/80">
        <span>◤ MINX BIO-SYNTH FACILITY ◢</span>
        <span className="text-cyan-300/80">UNIT // {botName.toUpperCase()}</span>
        <span>{elapsedLabel(startedAt.current)}</span>
      </div>

      {/* Stage marker rail */}
      <div className="absolute top-12 left-1/2 -translate-x-1/2 flex items-center gap-2 font-mono text-[9px] tracking-[0.3em] text-pink-200/60">
        {ORDER.slice(0, 5).map((s) => (
          <span key={s} className={elapsed(s) ? "text-cyan-300" : "text-zinc-700"}>
            {elapsed(s) ? "■" : "□"} {s.toUpperCase()}
          </span>
        ))}
      </div>

      {/* Skip */}
      <button
        type="button"
        onClick={() => setStage("ready")}
        className="absolute top-4 right-4 mt-6 font-mono text-[10px] tracking-[0.3em] text-zinc-500 hover:text-pink-300"
        aria-label="Skip cinematic"
      >SKIP ▸</button>

      {/* Main stage stage */}
      <div className="relative w-[min(720px,92vw)] aspect-[4/3] flex items-end justify-center">
        {/* Floor reflection grid */}
        <div className="absolute inset-x-0 bottom-0 h-1/3 pointer-events-none" style={{
          background:
            "linear-gradient(180deg, transparent 0%, rgba(236,72,153,0.18) 60%, rgba(236,72,153,0.32) 100%)",
        }} />
        <div className="absolute inset-x-0 bottom-0 h-1/3 pointer-events-none" style={{
          background:
            "repeating-linear-gradient(90deg, rgba(6,182,212,0.18) 0 1px, transparent 1px 36px)," +
            "repeating-linear-gradient(0deg, rgba(6,182,212,0.10) 0 1px, transparent 1px 28px)",
          maskImage: "linear-gradient(180deg, transparent 0%, black 70%)",
          WebkitMaskImage: "linear-gradient(180deg, transparent 0%, black 70%)",
        }} />

        {stage === "germination" && <Capsule full botName={botName} accent={accent} />}
        {stage === "decant"      && <Capsule cracking botName={botName} accent={accent} />}
        {stage === "reboot"      && <FloorBot accent={accent} />}
        {stage === "cleansing"   && <ShowerBooth />}
        {stage === "onboarding"  && <UniformBot botName={botName} accent={accent} />}
        {stage === "ready"       && <DossierCard botName={botName} specialty={specialty} serial={resolvedSerial} accent={accent} onClose={onComplete} />}
      </div>

      {/* Subtitle band */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 font-mono text-[11px] tracking-[0.4em] text-pink-200">
        {subtitleFor(stage, botName)}
      </div>

      <style>{KEYFRAMES_CSS}</style>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function elapsedLabel(start: number): string {
  const ms = Date.now() - start;
  return `T+${(ms / 1000).toFixed(1).padStart(4, "0")}s`;
}

function uniformAccent(category?: string): string {
  switch ((category || "").toLowerCase()) {
    case "music":        return "#ec4899";
    case "finance":      return "#06b6d4";
    case "writing":      return "#a78bfa";
    case "hospitality":  return "#fbbf24";
    case "trades":       return "#fb923c";
    default:             return "#22d3ee";
  }
}

function subtitleFor(stage: Stage, name: string): string {
  switch (stage) {
    case "germination": return `▾ INCUBATION COMPLETE — DECANT IN PROGRESS`;
    case "decant":      return `▾ STASIS FLUID PURGED — REPLICANT RELEASED`;
    case "reboot":      return `▾ MEMORY GRAFT… OK   //   IDENTITY: ${name.toUpperCase()}`;
    case "cleansing":   return `▾ DECONTAMINATION CYCLE — STEAM @ 64°C`;
    case "onboarding":  return `▾ UNIFORM CALIBRATED — ${name.toUpperCase()} REPORTING FOR DUTY`;
    case "ready":       return `▾ DEPLOYED. CLICK CLEAR TO RETURN.`;
  }
}

// ─── Stage components ──────────────────────────────────────────────────────

function Capsule({ full = false, cracking = false, botName, accent }: { full?: boolean; cracking?: boolean; botName: string; accent: string }) {
  return (
    <div className="relative w-[260px] h-[420px] mx-auto" style={{ animation: cracking ? "bbs-shake 380ms ease-in-out 2" : undefined }}>
      {/* Capsule mounting plinth */}
      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-[300px] h-6 rounded-md"
           style={{ background: "linear-gradient(180deg, #2b2b30 0%, #050507 100%)", boxShadow: "inset 0 2px 0 #444, 0 12px 28px rgba(0,0,0,0.6)" }} />
      {/* Tube body — glass */}
      <div className="absolute inset-0 rounded-[120px] overflow-hidden border-2"
           style={{
             borderColor: "#2a2a30",
             background: "linear-gradient(180deg, rgba(40,40,50,0.4) 0%, rgba(20,20,28,0.6) 100%)",
             boxShadow: "inset 0 0 60px rgba(0,0,0,0.6), 0 0 40px rgba(236,72,153,0.18)",
           }}>
        {/* Amniotic fluid */}
        <div
          className="absolute inset-x-0 bottom-0"
          style={{
            height: cracking ? "0%" : "92%",
            transition: "height 1800ms cubic-bezier(.4,0,.2,1)",
            background:
              `linear-gradient(180deg, rgba(236,72,153,0.55) 0%, rgba(168,85,247,0.55) 50%, rgba(6,182,212,0.55) 100%)`,
            filter: "blur(0.4px)",
          }}
        >
          {/* Bubble columns */}
          {Array.from({ length: 14 }).map((_, i) => (
            <span key={i} className="absolute rounded-full bg-white/40"
                  style={{
                    left: `${(i * 7 + 4) % 96}%`,
                    bottom: 0,
                    width: 4 + (i % 3) * 2,
                    height: 4 + (i % 3) * 2,
                    animation: `bbs-bubble ${2.4 + (i % 5) * 0.4}s linear ${i * 0.15}s infinite`,
                  }} />
          ))}
          {/* Suspended bot silhouette */}
          {full && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                 style={{ animation: "bbs-float 4.2s ease-in-out infinite" }}>
              <BotSilhouette pose="floating" accent={accent} />
            </div>
          )}
        </div>
        {/* Glass highlight */}
        <div className="absolute inset-y-0 left-3 w-[3px] rounded-full bg-white/25 blur-[1px]" />
        <div className="absolute inset-y-0 right-3 w-[2px] rounded-full bg-white/12 blur-[1px]" />
        {/* Crack overlay */}
        {cracking && (
          <svg viewBox="0 0 260 420" className="absolute inset-0 w-full h-full" style={{ animation: "bbs-fade-in 280ms ease-out" }}>
            <path d="M30,90 L120,160 L80,260 L160,310 L120,400" fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.85" />
            <path d="M210,80 L150,170 L220,250 L160,330 L210,410" fill="none" stroke="#fff" strokeWidth="1.2" opacity="0.7" />
          </svg>
        )}
      </div>
      {/* Top cap with vital LED */}
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-[200px] h-10 rounded-t-[80px] flex items-center justify-center gap-2"
           style={{ background: "linear-gradient(180deg,#1a1a1f,#050507)", borderBottom: "2px solid #2a2a30" }}>
        <span className="w-2 h-2 rounded-full" style={{ background: accent, boxShadow: `0 0 10px ${accent}`, animation: "bbs-pulse 1.4s ease-in-out infinite" }} />
        <span className="font-mono text-[9px] tracking-[0.4em] text-pink-200/70">CAPSULE-{botName.slice(0, 3).toUpperCase()}-01</span>
      </div>
      {/* Bottom drain */}
      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-[140px] h-3 rounded-b-md"
           style={{ background: "linear-gradient(180deg,#1a1a1f,#050507)" }} />
      {/* Drain puddle when cracking */}
      {cracking && (
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-[300px] h-6 rounded-[50%] blur-[2px]"
             style={{ background: "radial-gradient(ellipse, rgba(236,72,153,0.6) 0%, rgba(236,72,153,0.0) 70%)", animation: "bbs-fade-in 700ms ease-out" }} />
      )}
    </div>
  );
}

function FloorBot({ accent }: { accent: string }) {
  return (
    <div className="relative w-full h-full flex items-end justify-center pb-4">
      {/* Gunk puddle */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[340px] h-10 rounded-[50%]"
           style={{
             background: "radial-gradient(ellipse, rgba(236,72,153,0.55) 0%, rgba(168,85,247,0.4) 40%, transparent 75%)",
             filter: "blur(2px)",
             animation: "bbs-fade-in 600ms ease-out",
           }} />
      {/* Drips */}
      {Array.from({ length: 8 }).map((_, i) => (
        <span key={i} className="absolute rounded-full"
              style={{
                bottom: 14 + (i % 3) * 4,
                left: `calc(50% + ${(i - 4) * 22}px)`,
                width: 3 + (i % 2),
                height: 3 + (i % 2),
                background: i % 2 ? "#ec4899" : "#a78bfa",
                opacity: 0.7,
                animation: `bbs-drip 2.4s ease-in ${i * 0.18}s infinite`,
              }} />
      ))}
      {/* Bot crawling up */}
      <div className="relative" style={{ animation: "bbs-rise 2.4s ease-out forwards" }}>
        <BotSilhouette pose="kneeling" accent={accent} dripping />
      </div>
    </div>
  );
}

function ShowerBooth() {
  return (
    <div className="relative w-[420px] h-[420px] mx-auto flex items-end justify-center pb-2">
      {/* Tile back wall */}
      <div className="absolute inset-x-10 top-0 bottom-10 rounded-md overflow-hidden"
           style={{
             background: "linear-gradient(180deg, #14141a 0%, #0a0a10 100%)",
             border: "2px solid #2a2a30",
           }}>
        {/* Tiles */}
        <div className="absolute inset-0 opacity-60" style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 36px)," +
            "repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 36px)",
        }} />
        {/* Shower head */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-3 rounded-b-md bg-zinc-700" />
        <div className="absolute top-5 left-1/2 -translate-x-1/2 w-14 h-2 rounded-md bg-zinc-600" />
        {/* Water streaks */}
        {Array.from({ length: 22 }).map((_, i) => (
          <span key={i} className="absolute bg-cyan-200/60"
                style={{
                  top: 8,
                  left: `calc(50% - 28px + ${(i % 11) * 5}px)`,
                  width: 1,
                  height: 60 + (i % 4) * 40,
                  animation: `bbs-rain ${0.8 + (i % 5) * 0.2}s linear ${i * 0.06}s infinite`,
                  opacity: 0.6,
                }} />
        ))}
        {/* Frosted glass overlay (the tasteful part) */}
        <div className="absolute inset-0" style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.10) 100%)",
          backdropFilter: "blur(6px)",
        }} />
        {/* Steam plumes */}
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className="absolute rounded-full bg-white/15 blur-2xl"
                style={{
                  bottom: -20 + (i % 3) * 18,
                  left: `${10 + i * 14}%`,
                  width: 90 + (i % 3) * 30,
                  height: 90 + (i % 3) * 30,
                  animation: `bbs-steam ${4 + i}s ease-in-out infinite`,
                }} />
        ))}
        {/* Bot silhouette behind frosted glass */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 opacity-70" style={{ filter: "blur(4px)" }}>
          <BotSilhouette pose="standing" accent="#000" />
        </div>
        {/* CYCLE label */}
        <div className="absolute top-2 left-2 font-mono text-[8px] tracking-[0.3em] text-cyan-300/70">DECON · CYCLE 01</div>
      </div>
      {/* Floor drain */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-24 h-3 rounded-full bg-zinc-800 border border-zinc-700" />
    </div>
  );
}

function UniformBot({ botName, accent }: { botName: string; accent: string }) {
  return (
    <div className="relative w-full h-full flex items-end justify-center pb-6">
      {/* Spotlight */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[420px] h-[420px] rounded-[50%] pointer-events-none"
           style={{ background: `radial-gradient(circle at 50% 100%, ${accent}33 0%, transparent 60%)` }} />
      <div className="relative" style={{ animation: "bbs-walk-in 1.6s cubic-bezier(.2,.7,.2,1) forwards" }}>
        <BotSilhouette pose="salute" accent={accent} uniform botName={botName} />
      </div>
    </div>
  );
}

function DossierCard({ botName, specialty, serial, accent, onClose }: { botName: string; specialty?: string; serial?: string | null; accent: string; onClose: () => void }) {
  return (
    <div className="relative w-full h-full flex items-center justify-center" style={{ animation: "bbs-fade-in 320ms ease-out" }}>
      <div className="relative w-[440px] rounded-md p-6 font-mono"
           style={{
             background: "linear-gradient(180deg, #0a0a12, #050507)",
             border: `1px solid ${accent}66`,
             boxShadow: `0 0 40px ${accent}33`,
           }}>
        <div className="text-[9px] tracking-[0.4em] text-pink-200/70 mb-2">▾ DEPLOYMENT MANIFEST</div>
        <div className="text-2xl tracking-[0.3em] text-white" style={{ textShadow: `0 0 18px ${accent}` }}>{botName.toUpperCase()}</div>
        {specialty && <div className="text-[11px] tracking-[0.25em] mt-1" style={{ color: accent }}>{specialty.toUpperCase()}</div>}
        <div className="my-4 grid grid-cols-2 gap-2 text-[10px] tracking-[0.2em] text-zinc-400">
          <div>SERIAL // {serial ?? "PRIME · NONE"}</div>
          <div>BUILD // 2026.04</div>
          <div>FLUID // PURGED ✓</div>
          <div>UNIFORM // ISSUED ✓</div>
          <div>MEMORY // GRAFTED ✓</div>
          <div>STATUS // ON DUTY</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full mt-2 py-2 text-[11px] tracking-[0.4em] hover:bg-pink-500/20 transition"
          style={{ border: `1px solid ${accent}`, color: accent }}
        >▸ CLEAR — RETURN TO TERMINAL</button>
      </div>
    </div>
  );
}

// ─── The replicant silhouette (CSS-only humanoid) ──────────────────────────
// Stylised, neutral humanoid figure. No anatomy beyond head / torso / limbs;
// the cleansing stage uses heavy frosted-glass blur on top.

function BotSilhouette({
  pose,
  accent,
  dripping = false,
  uniform = false,
  botName,
}: {
  pose: "floating" | "kneeling" | "standing" | "salute";
  accent: string;
  dripping?: boolean;
  uniform?: boolean;
  botName?: string;
}) {
  const skin = uniform ? "#3b3b46" : "#2a1f24";
  const fabric = uniform ? "#0e0e14" : skin;

  const armRot =
    pose === "salute"   ? "-110deg" :
    pose === "floating" ? "-25deg"  :
    pose === "kneeling" ? "20deg"   : "0deg";
  const torsoTilt =
    pose === "kneeling" ? "8deg" :
    pose === "floating" ? "-3deg" : "0deg";
  const legBend =
    pose === "kneeling" ? "65deg" :
    pose === "floating" ? "10deg" : "0deg";

  return (
    <div className="relative" style={{ width: 120, height: 220, transform: `rotate(${torsoTilt})` }}>
      {/* Head */}
      <div className="absolute left-1/2 -translate-x-1/2 top-0 rounded-full"
           style={{ width: 36, height: 40, background: skin, boxShadow: `inset -4px -6px 0 rgba(0,0,0,0.35), 0 0 12px ${accent}55` }} />
      {/* Hair / cap */}
      {uniform && (
        <div className="absolute left-1/2 -translate-x-1/2 -top-1 rounded-t-full"
             style={{ width: 38, height: 16, background: accent, boxShadow: `0 0 14px ${accent}` }} />
      )}
      {/* Torso */}
      <div className="absolute left-1/2 -translate-x-1/2 top-[40px] rounded-md"
           style={{
             width: 60, height: 84,
             background: fabric,
             borderTop: uniform ? `2px solid ${accent}` : undefined,
             boxShadow: "inset -6px -8px 0 rgba(0,0,0,0.3)",
           }}>
        {uniform && (
          <>
            {/* Lapel stripe */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-[44px] h-[2px]" style={{ background: accent }} />
            {/* Name tag */}
            {botName && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-1 py-[1px] rounded-sm font-mono text-[6px] tracking-[0.2em] text-black"
                   style={{ background: accent }}>
                {botName.slice(0, 8).toUpperCase()}
              </div>
            )}
          </>
        )}
      </div>
      {/* Left arm */}
      <div className="absolute left-[12px] top-[46px] origin-top rounded-md"
           style={{ width: 14, height: 70, background: fabric, transform: `rotate(${armRot})`, transformOrigin: "50% 8px" }} />
      {/* Right arm (always relaxed) */}
      <div className="absolute right-[12px] top-[46px] origin-top rounded-md"
           style={{ width: 14, height: 70, background: fabric }} />
      {/* Legs */}
      <div className="absolute left-[36px] top-[124px] origin-top rounded-md"
           style={{ width: 18, height: 90, background: fabric, transform: `rotate(-${legBend})`, transformOrigin: "50% 0%" }} />
      <div className="absolute right-[36px] top-[124px] origin-top rounded-md"
           style={{ width: 18, height: 90, background: fabric, transform: `rotate(${legBend})`, transformOrigin: "50% 0%" }} />
      {/* Drip overlay */}
      {dripping && Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className="absolute rounded-full"
              style={{
                top: 30 + i * 24,
                left: `${30 + (i % 3) * 20}%`,
                width: 3, height: 8,
                background: i % 2 ? "#ec4899" : "#a78bfa",
                opacity: 0.7,
                animation: `bbs-drip 2.6s ease-in ${i * 0.2}s infinite`,
              }} />
      ))}
    </div>
  );
}

// ─── Keyframes (single string injected once per mount) ──────────────────────

const KEYFRAMES_CSS = `
@keyframes bbs-fade-in   { from { opacity: 0 } to { opacity: 1 } }
@keyframes bbs-pulse     { 0%,100% { opacity: 0.55 } 50% { opacity: 1 } }
@keyframes bbs-float     { 0%,100% { transform: translate(-50%, -50%) translateY(0) } 50% { transform: translate(-50%, -50%) translateY(-8px) } }
@keyframes bbs-bubble    { 0% { transform: translateY(0) scale(1); opacity: 0.0 }
                           15% { opacity: 0.9 }
                           100% { transform: translateY(-360px) scale(0.6); opacity: 0 } }
@keyframes bbs-shake     { 0%,100% { transform: translateX(0) } 25% { transform: translateX(-4px) rotate(-0.6deg) } 75% { transform: translateX(4px) rotate(0.6deg) } }
@keyframes bbs-drip      { 0% { transform: translateY(-6px); opacity: 0 } 25% { opacity: 0.9 } 100% { transform: translateY(40px); opacity: 0 } }
@keyframes bbs-rise      { 0% { transform: translateY(60px) scale(0.92); opacity: 0 } 60% { opacity: 1 } 100% { transform: translateY(0) scale(1); opacity: 1 } }
@keyframes bbs-rain      { 0% { transform: translateY(-20px); opacity: 0 } 30% { opacity: 0.8 } 100% { transform: translateY(220px); opacity: 0 } }
@keyframes bbs-steam     { 0%,100% { transform: translate(0,0) scale(1); opacity: 0.5 }
                           50% { transform: translate(-10px,-30px) scale(1.15); opacity: 0.7 } }
@keyframes bbs-walk-in   { 0% { transform: translateX(-160px); opacity: 0 } 60% { opacity: 1 } 100% { transform: translateX(0); opacity: 1 } }
`;
