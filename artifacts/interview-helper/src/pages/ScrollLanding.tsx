/**
 * ScrollLanding — the public, wordless, scroll-driven front door at "/".
 *
 * A single salaryman's life told in pure imagery: birth → childhood → school →
 * first job → the working prime → burnout → death → an empty (available)
 * position → a dormant retro terminal. Powering the terminal on plays an
 * "enter the screen" transition and routes into /pablo (the sign-in funnel).
 *
 * VISUALLY 100% TEXT-FREE — every word on this page lives in `sr-only`
 * semantic headings / alt text so the story is crawlable for SEO without ever
 * appearing on screen. Meaning is carried by the art alone.
 *
 * Art comes from the pluggable art pipeline (useArtAsset → /api/art/asset/:key),
 * which renders via the Unreal node where configured and falls back to Nano
 * Banana otherwise. While a frame is still baking we show a dark, softly
 * breathing placeholder so the scroll never looks broken.
 */

import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  motion,
  useScroll,
  useTransform,
  useMotionValueEvent,
  useReducedMotion,
  type MotionValue,
} from "framer-motion";
import { useArtAsset } from "@/lib/art";
import {
  startOfficeAmbient,
  stopOfficeAmbient,
  resumeAudioContext,
  isOfficeAmbientRunning,
} from "@/soundEngine";
import { getAudioSettings } from "@/lib/audio-settings";

// ── The life, in order. Each stage = one full-viewport frame. ────────────────
// `heading` / `alt` are SEO-only (rendered visually-hidden); nothing here is
// drawn as on-screen text.
interface Stage {
  key: string;       // art-kit key (server SALARYMAN_ART_KIT)
  heading: string;   // sr-only section heading
  alt: string;       // sr-only descriptive alt text
}

const STAGES: Stage[] = [
  {
    key: "life_birth",
    heading: "Birth",
    alt: "A newborn cradled in a hospital delivery room beneath the neon city — the first breath of a life.",
  },
  {
    key: "life_childhood",
    heading: "Childhood",
    alt: "A small child plays alone on the floor of a dim apartment, the city glowing through the window.",
  },
  {
    key: "life_school",
    heading: "Education",
    alt: "A lone student studies late into the night in an empty classroom, preparing for a life of work.",
  },
  {
    key: "life_first_job",
    heading: "The First Job",
    alt: "A young salaryman in a new suit stands at the edge of a vast corporate office floor for the first time.",
  },
  {
    key: "life_work_prime",
    heading: "The Working Years",
    alt: "A salaryman in his prime, fully absorbed in the grind at his desk in a dense office bullpen.",
  },
  {
    key: "life_burnout",
    heading: "The Long Erosion",
    alt: "An aging, grey-haired worker alone at his desk in the dead of night, worn down by the years.",
  },
  {
    key: "life_death",
    heading: "The End",
    alt: "An empty office chair and a dark monitor — a life that ended at the desk.",
  },
  {
    key: "life_position_open",
    heading: "An Available Position",
    alt: "The same desk, cleaned and reset, a single spotlight on the open seat — a position waiting to be filled.",
  },
  {
    key: "life_terminal",
    heading: "Begin Your Shift",
    alt: "A dormant retro terminal on the empty desk, waiting to be switched on.",
  },
];

const TOTAL = STAGES.length;

/** A short, safe power-on blip. Gesture-triggered, so autoplay policy allows it. */
function playPowerOn() {
  try {
    const Ctx =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.35);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.65);
    osc.onended = () => {
      try {
        ctx.close();
      } catch {
        /* ignore */
      }
    };
  } catch {
    /* audio is best-effort; never block the transition */
  }
}

/** One full-viewport life frame whose opacity (and gentle Ken-Burns drift) is
 *  driven by the page scroll progress. */
function LifeFrame({
  stage,
  index,
  progress,
  reduceMotion,
}: {
  stage: Stage;
  index: number;
  progress: MotionValue<number>;
  reduceMotion: boolean;
}) {
  // Keep retrying on `failed` (with capped backoff) so a frame whose art
  // backend was momentarily unavailable recovers on its own instead of
  // staying blank — the server self-heals a failed asset on poll.
  const url = useArtAsset(stage.key, 4000, { retryOnFail: true });
  const center = TOTAL > 1 ? index / (TOTAL - 1) : 0;
  const span = TOTAL > 1 ? 1 / (TOTAL - 1) : 1;

  // Per-frame placement for the on-brand fallback glow, so each life stage has
  // its own subtly different neon-noir wash (a sense of progression) rather
  // than every blank frame looking identical.
  const t = TOTAL > 1 ? index / (TOTAL - 1) : 0;
  const pinkX = 30 + t * 40;
  const pinkY = 38 + Math.sin(t * Math.PI) * 16;
  const cyanX = 70 - t * 40;
  const cyanY = 60 - Math.sin(t * Math.PI) * 12;

  // Crossfade with neighbours: full opacity at this frame's center, fading to
  // zero one slot away in each direction (clamped at the ends).
  const opacity = useTransform(
    progress,
    [center - span, center, center + span],
    [0, 1, 0],
  );
  // Subtle cinematic drift while the frame is the active one.
  const scale = useTransform(
    progress,
    [center - span, center, center + span],
    reduceMotion ? [1, 1, 1] : [1.08, 1.0, 1.08],
  );

  return (
    <motion.div
      aria-hidden="true"
      style={{ opacity }}
      className="absolute inset-0 flex items-center justify-center"
    >
      {url ? (
        <motion.div
          style={{
            scale,
            backgroundImage: `url(${url})`,
          }}
          className="absolute inset-0 bg-cover bg-center"
        />
      ) : (
        // On-brand neon-noir fallback so a frame that hasn't baked yet — or
        // whose art backend is temporarily unavailable — reads as an intentional
        // cinematic wash, never a dead black screen.
        <div className="absolute inset-0 overflow-hidden bg-[#06070b]">
          <motion.div
            className="absolute inset-0"
            style={{
              background:
                `radial-gradient(ellipse 70% 55% at ${pinkX}% ${pinkY}%, rgba(244,114,182,0.22), transparent 60%), ` +
                `radial-gradient(ellipse 60% 50% at ${cyanX}% ${cyanY}%, rgba(34,211,238,0.18), transparent 62%), ` +
                "linear-gradient(160deg, #0a0c14 0%, #06070b 55%, #11071a 100%)",
            }}
            animate={reduceMotion ? undefined : { opacity: [0.55, 0.95, 0.55] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
          />
          {/* Faint CRT scanline texture for a noir, "signal warming up" feel. */}
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              background:
                "repeating-linear-gradient(0deg, rgba(255,255,255,0.5) 0px, rgba(255,255,255,0.5) 1px, transparent 1px, transparent 4px)",
            }}
          />
        </div>
      )}
      {/* Vignette + bottom gradient for depth, consistent across frames. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 55%, rgba(3,4,8,0.65) 100%), linear-gradient(to bottom, rgba(3,4,8,0.35), transparent 35%, transparent 65%, rgba(3,4,8,0.55))",
        }}
      />
    </motion.div>
  );
}

/** A small, wordless power-button glyph (icon only — no text). */
function PowerGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-8 w-8"
    >
      <path d="M12 3v9" />
      <path d="M6.3 7.3a8 8 0 1 0 11.4 0" />
    </svg>
  );
}

type Phase = "scroll" | "booting" | "entering";

export default function ScrollLanding() {
  const [, navigate] = useLocation();
  const reduceMotion = !!useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  const [terminalReady, setTerminalReady] = useState(false);
  const [phase, setPhase] = useState<Phase>("scroll");

  // The terminal becomes interactive only once the visitor has reached the end
  // of the story (the final, dormant-terminal frame is on screen).
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    setTerminalReady(v > 0.9);
  });

  // Power-on → "enter the screen" → /pablo. Idempotent: ignore re-taps.
  const powerOn = () => {
    if (phase !== "scroll") return;
    playPowerOn();
    setPhase("booting");
  };

  useEffect(() => {
    if (phase === "booting") {
      const t = setTimeout(() => setPhase("entering"), reduceMotion ? 350 : 1100);
      return () => clearTimeout(t);
    }
    if (phase === "entering") {
      const t = setTimeout(() => navigate("/pablo"), reduceMotion ? 200 : 850);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [phase, reduceMotion, navigate]);

  // ── Ambient scroll audio ──────────────────────────────────────────────────
  // A soft procedural ambient bed (the game's existing office-ambient
  // soundscape) fades in after the visitor's first interaction — required by
  // browser autoplay policy — and loops gently while they scroll the story. It
  // routes through the app's central audio chokepoint, so it honors the user's
  // master mute and ambiance toggle automatically. Cleaned up on navigate-away.
  // Skipped entirely under reduce-motion.
  useEffect(() => {
    if (reduceMotion) return undefined;
    let armed = true;
    let startedByUs = false;
    const events: (keyof WindowEventMap)[] = [
      "pointerdown",
      "touchstart",
      "keydown",
      "wheel",
      "scroll",
    ];
    const removeListeners = () => {
      for (const e of events) window.removeEventListener(e, onFirstGesture);
    };
    function onFirstGesture() {
      if (!armed) return;
      armed = false;
      removeListeners();
      const s = getAudioSettings();
      // Respect the user's audio preferences — don't even spin up the context.
      if (s.muted || !s.ambianceEnabled) return;
      try {
        resumeAudioContext();
        if (!isOfficeAmbientRunning()) {
          startOfficeAmbient();
          startedByUs = true;
        }
      } catch {
        /* audio is best-effort; never block the page */
      }
    }
    for (const e of events) {
      window.addEventListener(e, onFirstGesture, { passive: true });
    }
    return () => {
      armed = false;
      removeListeners();
      // Only stop the bed if WE started it (don't kill audio owned elsewhere).
      if (startedByUs) stopOfficeAmbient();
    };
  }, [reduceMotion]);

  // Power button pulse driven by readiness.
  const controlOpacity = useTransform(scrollYProgress, [0.86, 0.93], [0, 1]);
  // Scroll-affordance chevron fades out the moment the visitor starts to descend.
  // Hoisted to the top level so the hook count is stable regardless of motion pref.
  const chevronOpacity = useTransform(scrollYProgress, [0, 0.06], [1, 0]);

  return (
    <div className="relative w-full bg-[#06070b]">
      {/* ── SEO / accessibility: the whole story in words, visually hidden. ── */}
      <div className="sr-only">
        <h1>SALARYMAN — A Life of Work, by Picasso AI</h1>
        <p>
          SALARYMAN is the AI-powered business operating system by Picasso AI.
          This is the story of one corporate life, from birth to the desk that
          outlived him — and the position now open for you.
        </p>
        <ol>
          {STAGES.map((s) => (
            <li key={s.key}>
              <h2>{s.heading}</h2>
              <p>{s.alt}</p>
            </li>
          ))}
        </ol>
        <p>
          An available position awaits. Power on the terminal to begin your
          shift and meet Pablo, your host inside SALARYMAN.
        </p>
      </div>

      {/* ── The scroll cinematic. Tall scroll track + sticky viewport. ── */}
      <div
        ref={containerRef}
        style={{ height: `${TOTAL * 100}vh` }}
        className="relative w-full"
      >
        <div className="sticky top-0 h-screen w-full overflow-hidden">
          {STAGES.map((stage, i) => (
            <LifeFrame
              key={stage.key}
              stage={stage}
              index={i}
              progress={scrollYProgress}
              reduceMotion={reduceMotion}
            />
          ))}

          {/* Scroll affordance — a wordless bouncing chevron, fades out as the
              visitor begins to descend. */}
          {!reduceMotion && (
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 text-cyan-300/70"
              style={{ opacity: chevronOpacity }}
            >
              <motion.svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-7 w-7"
                animate={{ y: [0, 8, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              >
                <path d="m6 9 6 6 6-6" />
              </motion.svg>
            </motion.div>
          )}

          {/* ── The interactive power button on the final terminal frame. ── */}
          <motion.div
            style={{ opacity: controlOpacity }}
            className="absolute inset-x-0 bottom-[14%] flex justify-center"
          >
            <motion.button
              type="button"
              aria-label="Power on the terminal and begin"
              onClick={powerOn}
              disabled={!terminalReady || phase !== "scroll"}
              whileHover={terminalReady ? { scale: 1.08 } : undefined}
              whileTap={terminalReady ? { scale: 0.94 } : undefined}
              animate={
                terminalReady && phase === "scroll" && !reduceMotion
                  ? {
                      boxShadow: [
                        "0 0 18px 2px rgba(244,114,182,0.45), 0 0 40px 8px rgba(34,211,238,0.25)",
                        "0 0 30px 6px rgba(244,114,182,0.75), 0 0 70px 16px rgba(34,211,238,0.45)",
                        "0 0 18px 2px rgba(244,114,182,0.45), 0 0 40px 8px rgba(34,211,238,0.25)",
                      ],
                    }
                  : undefined
              }
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              className="flex h-16 w-16 items-center justify-center rounded-full border border-pink-400/60 bg-black/50 text-cyan-200 backdrop-blur-sm transition-colors hover:text-white disabled:cursor-default"
              style={{
                pointerEvents: terminalReady && phase === "scroll" ? "auto" : "none",
              }}
            >
              <PowerGlyph />
            </motion.button>
          </motion.div>
        </div>
      </div>

      {/* ── "Enter the screen" transition overlay. ── */}
      {phase !== "scroll" && (
        <motion.div
          aria-hidden="true"
          className="fixed inset-0 z-[60] overflow-hidden bg-black"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
        >
          {/* Boot: terminal screen flickers awake with scanlines + a swelling
              nebula glow. */}
          <motion.div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md"
            initial={{ width: "62vmin", height: "40vmin", opacity: 0.2 }}
            animate={
              phase === "booting"
                ? { opacity: [0.2, 0.5, 0.35, 0.8, 0.6, 1] }
                : { width: "240vmax", height: "240vmax", opacity: 1 }
            }
            transition={
              phase === "booting"
                ? { duration: 1.0, times: [0, 0.2, 0.4, 0.6, 0.8, 1] }
                : { duration: reduceMotion ? 0.2 : 0.8, ease: "easeIn" }
            }
            style={{
              background:
                "radial-gradient(circle at 50% 50%, rgba(244,114,182,0.9), rgba(34,211,238,0.5) 40%, rgba(6,7,11,0.9) 75%)",
              boxShadow: "0 0 80px 20px rgba(244,114,182,0.4)",
            }}
          />
          {/* Scanline sweep over the booting screen. */}
          {phase === "booting" && !reduceMotion && (
            <motion.div
              className="absolute inset-0"
              style={{
                background:
                  "repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 3px)",
              }}
              animate={{ opacity: [0.2, 0.6, 0.2] }}
              transition={{ duration: 0.4, repeat: Infinity }}
            />
          )}
          {/* Final white flash as we cross into the funnel. */}
          {phase === "entering" && (
            <motion.div
              className="absolute inset-0 bg-white"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.85, 0] }}
              transition={{ duration: reduceMotion ? 0.2 : 0.8, times: [0, 0.7, 1] }}
            />
          )}
        </motion.div>
      )}
    </div>
  );
}
