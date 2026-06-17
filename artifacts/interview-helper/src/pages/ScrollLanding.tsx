/**
 * ScrollLanding — the public, scroll-driven gameplay-trailer front door at "/".
 *
 * Instead of stills, this plays a real GAMEPLAY TRAILER (office → city → the
 * world of SALARYMAN) scrubbed by the page scroll: scroll position maps to
 * video currentTime, so scroll velocity becomes the perceived playback speed.
 * Pablo narrates continuously over the top — a separate baked VO mp3 is played
 * straight through on the visitor's first interaction, honoring the app's master
 * mute. Captions (loaded from trailer-captions.json, with a fallback set) are
 * synced to the audio clock while narrating, or to scroll position when muted.
 *
 * If the video can't load we fall back to an on-brand neon-noir wash so the
 * page never reads as broken. Under reduce-motion we skip scrubbing and show
 * the wash instead. Reaching the end of the scroll arms the terminal power
 * button, which plays the original power-on → "enter the screen" transition
 * and routes into /pablo (the sign-in funnel).
 *
 * NOTE: the life_* art-kit/pipeline is intentionally left intact server-side;
 * this page simply no longer renders those stills.
 */

import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  motion,
  useScroll,
  useTransform,
  useMotionValueEvent,
  useReducedMotion,
} from "framer-motion";
import { resumeAudioContext } from "@/soundEngine";
import { getAudioSettings } from "@/lib/audio-settings";

// ── Asset URLs (served as static public assets, BASE_URL-prefixed). ──────────
const BASE = import.meta.env.BASE_URL ?? "/";
const TRAILER_SRC = `${BASE}brand/landing/trailer.mp4`;
const CAPTIONS_SRC = `${BASE}brand/landing/trailer-captions.json`;
// Pablo VO is served as its own mp3 so the audio and video tracks are decoupled.
const AUDIO_SRC = `${BASE}brand/landing/trailer-vo.mp3`;

// How tall the scroll track is — longer = a slower, more cinematic scrub.
const SCROLL_VH = 600;

interface Caption {
  text: string;
  start: number;
  end: number;
}
interface CaptionFile {
  durationSec: number;
  captions: Caption[];
}

// Fallback narration (kept in sync with landing-trailer.ts LANDING_NARRATION)
// so captions + SEO copy still work even before the captions JSON loads.
const FALLBACK_CAPTIONS: Caption[] = [
  "Minx City runs on work.",
  "Every morning, thousands show up — competing for jobs, clients, a way up.",
  "Salaryman. That is what they call the ones who grind for something better.",
  "There are desks here. Businesses to build. Real money to make.",
  "The city does not hand you anything. You earn every coin.",
  "Some make it. Most do not. The difference is hunger.",
  "If you are ready — your shift starts now.",
].map((text, i) => ({ text, start: i * 4, end: i * 4 + 3.5 }));

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

/** On-brand neon-noir wash — shown while the video buffers or if it fails. */
function NeonNoirFallback({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#06070b]">
      <motion.div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 38% 42%, rgba(244,114,182,0.22), transparent 60%), " +
            "radial-gradient(ellipse 60% 50% at 66% 58%, rgba(34,211,238,0.18), transparent 62%), " +
            "linear-gradient(160deg, #0a0c14 0%, #06070b 55%, #11071a 100%)",
        }}
        animate={reduceMotion ? undefined : { opacity: [0.55, 0.95, 0.55] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
      />
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          background:
            "repeating-linear-gradient(0deg, rgba(255,255,255,0.5) 0px, rgba(255,255,255,0.5) 1px, transparent 1px, transparent 4px)",
        }}
      />
    </div>
  );
}

type Phase = "scroll" | "booting" | "entering";

export default function ScrollLanding() {
  const [, navigate] = useLocation();
  const reduceMotion = !!useReducedMotion();

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  const [terminalReady, setTerminalReady] = useState(false);
  const [phase, setPhase] = useState<Phase>("scroll");
  const [videoFailed, setVideoFailed] = useState(false);
  const [captions, setCaptions] = useState<Caption[]>(FALLBACK_CAPTIONS);
  const [durationSec, setDurationSec] = useState(0);
  const [activeLine, setActiveLine] = useState<string | null>(null);

  // Latest scroll progress (0..1), kept in a ref for the rAF caption loop.
  const progressRef = useRef(0);
  // Whether Pablo's narration audio is actively playing (vs. muted fallback).
  const narratingRef = useRef(false);

  // Watchdog: a trailer that never errors but never loads (slow CDN, stalled
  // connection) would otherwise leave the cover depending on a frame that never
  // arrives. Fall back to the neon wash after 6s if no duration reported.
  useEffect(() => {
    if (reduceMotion || videoFailed) return undefined;
    const id = window.setTimeout(() => {
      const vid = videoRef.current;
      if (!vid || !(vid.duration > 0)) setVideoFailed(true);
    }, 6000);
    return () => window.clearTimeout(id);
  }, [reduceMotion, videoFailed]);

  // ── Load caption timings (best-effort; falls back to even distribution). ──
  useEffect(() => {
    let alive = true;
    fetch(CAPTIONS_SRC, { credentials: "omit" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: CaptionFile) => {
        if (!alive || !Array.isArray(data?.captions) || data.captions.length === 0) return;
        setCaptions(data.captions);
        if (data.durationSec) setDurationSec(data.durationSec);
      })
      .catch(() => {
        /* keep FALLBACK_CAPTIONS */
      });
    return () => {
      alive = false;
    };
  }, []);

  // ── Scrub the muted video by scroll position. ──
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    progressRef.current = v;
    setTerminalReady(v > 0.9);
    const vid = videoRef.current;
    if (vid && !videoFailed && !reduceMotion) {
      const dur = vid.duration;
      if (Number.isFinite(dur) && dur > 0) {
        const t = Math.min(dur - 0.05, Math.max(0, v * dur));
        // Only seek on a meaningful delta to avoid thrashing the decoder.
        if (Math.abs((vid.currentTime || 0) - t) > 0.03) {
          try {
            vid.currentTime = t;
          } catch {
            /* seeking can throw mid-load; ignore */
          }
        }
      }
    }
  });

  // ── Caption sync loop ──
  // While Pablo's narration is playing, captions follow the audio clock; when
  // it isn't (muted fallback / reduce-motion) they follow the scroll position
  // mapped onto the trailer timeline. One rAF loop handles both.
  useEffect(() => {
    let raf = 0;
    const totalForFallback =
      durationSec ||
      (captions.length
        ? Math.max(captions[captions.length - 1].end, captions.length)
        : 1);
    const tick = () => {
      let time: number;
      const audio = audioRef.current;
      if (narratingRef.current && audio && !audio.paused) {
        time = audio.currentTime;
      } else {
        time = progressRef.current * totalForFallback;
      }
      let line: string | null = null;
      for (const c of captions) {
        if (time >= c.start && time < c.end) {
          line = c.text;
          break;
        }
      }
      setActiveLine((prev) => (prev === line ? prev : line));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [captions, durationSec]);

  // ── Pablo narration: continuous audio started on first interaction. ──
  // Honors the app's master mute. Skipped under reduce-motion.
  useEffect(() => {
    if (reduceMotion) return undefined;
    let armed = true;
    const events: (keyof WindowEventMap)[] = [
      "pointerdown",
      "touchstart",
      "keydown",
      "wheel",
      "scroll",
    ];
    const remove = () => {
      for (const e of events) window.removeEventListener(e, onFirstGesture);
    };
    function onFirstGesture() {
      if (!armed) return;
      armed = false;
      remove();
      const s = getAudioSettings();
      if (s.muted) return; // captions still show via scroll clock; no audio
      const audio = audioRef.current;
      if (!audio) return;
      try {
        resumeAudioContext();
        audio.volume = 0.9;
        audio.muted = false;
        const p = audio.play();
        if (p && typeof p.then === "function") {
          p.then(() => {
            narratingRef.current = true;
          }).catch(() => {
            narratingRef.current = false;
          });
        } else {
          narratingRef.current = true;
        }
      } catch {
        narratingRef.current = false;
      }
    }
    for (const e of events) {
      window.addEventListener(e, onFirstGesture, { passive: true });
    }
    return () => {
      armed = false;
      remove();
      const audio = audioRef.current;
      if (audio) {
        try {
          audio.pause();
          audio.currentTime = 0;
        } catch {
          /* ignore */
        }
      }
      narratingRef.current = false;
    };
  }, [reduceMotion]);

  // ── Power-on → "enter the screen" → /pablo. Idempotent. ──
  const powerOn = () => {
    if (phase !== "scroll") return;
    playPowerOn();
    // Let Pablo's voice bow out as we cross into the funnel.
    const audio = audioRef.current;
    if (audio) {
      try {
        audio.pause();
      } catch {
        /* ignore */
      }
    }
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

  // Control + affordance opacities (hooks kept at top level for stable count).
  const controlOpacity = useTransform(scrollYProgress, [0.86, 0.93], [0, 1]);
  const chevronOpacity = useTransform(scrollYProgress, [0, 0.06], [1, 0]);

  return (
    <div className="relative w-full bg-[#06070b]">
      {/* Continuous Pablo voice-over (separate from the scrubbed video). */}
      <audio ref={audioRef} src={AUDIO_SRC} preload="auto" muted playsInline />

      {/* ── SEO / accessibility: the pitch in words, visually hidden. ── */}
      <div className="sr-only">
<<<<<<< HEAD
        <h1>SALARYMAN — Begin Your Shift, by Picasso AI</h1>
        <p>
          SALARYMAN is the AI-powered business operating system and living city
          by Picasso AI. Watch real gameplay — corporate offices, neon-noir
          streets, and the world you'll work in — narrated by Pablo, your host
          inside SALARYMAN.
=======
        <h1>SALARYMAN — Come Find Work. Compete. Survive.</h1>
        <p>
          Minx City runs on work. SALARYMAN is the AI-powered competitive city
          simulation where you grind for income, build businesses, and fight for
          your place in a living neon-noir world. Thousands show up every morning.
          Most do not make it. If you are ready, your shift starts now.
>>>>>>> fe1eca8f (Replace landing page cinematic with scroll-driven Pablo trailer)
        </p>
        <ol>
          {captions.map((c, i) => (
            <li key={i}>{c.text}</li>
          ))}
        </ol>
        <p>
          An available position awaits. Power on the terminal to begin your
          shift and meet Pablo.
        </p>
      </div>

<<<<<<< HEAD
=======
      {/* Continuous Pablo narration — separate VO mp3, not the video track.
          Starts muted (autoplay-safe) and is unmuted/played on first interaction. */}
      <audio ref={audioRef} src={AUDIO_SRC} preload="auto" muted playsInline />

>>>>>>> fe1eca8f (Replace landing page cinematic with scroll-driven Pablo trailer)
      {/* ── The scroll cinematic: tall scroll track + sticky viewport. ── */}
      <div
        ref={containerRef}
        style={{ height: `${SCROLL_VH}vh` }}
        className="relative w-full"
      >
        <div className="sticky top-0 h-screen w-full overflow-hidden bg-[#06070b]">
          {/* The scrubbed gameplay trailer (or neon wash under reduce-motion/failure). */}
          {videoFailed || reduceMotion ? (
            <NeonNoirFallback reduceMotion={reduceMotion} />
          ) : (
            <video
              ref={videoRef}
              src={TRAILER_SRC}
              muted
              playsInline
              preload="auto"
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover"
              onLoadedMetadata={(e) => {
<<<<<<< HEAD
                const d = e.currentTarget.duration;
                if (Number.isFinite(d) && d > 0) {
=======
                const vid = e.currentTarget;
                const d = vid.duration;
                if (Number.isFinite(d) && d > 0) {
                  // Prefer real video duration for fallback caption mapping if
                  // the captions JSON didn't carry one.
>>>>>>> fe1eca8f (Replace landing page cinematic with scroll-driven Pablo trailer)
                  setDurationSec((prev) => prev || d);
                  // Seek to wherever the scroll currently sits so the very first
                  // paint shows the correct frame (we never call play()).
                  try {
                    vid.currentTime = Math.min(
                      d - 0.05,
                      Math.max(0.04, progressRef.current * d),
                    );
                  } catch {
                    /* seeking can throw mid-load; ignore */
                  }
                }
              }}
              onError={() => setVideoFailed(true)}
            />
          )}

          {/* Vignette + bottom gradient for depth and caption legibility. */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at center, transparent 52%, rgba(3,4,8,0.6) 100%), linear-gradient(to bottom, rgba(3,4,8,0.4), transparent 30%, transparent 58%, rgba(3,4,8,0.78))",
            }}
          />

          {/* ── Pablo's caption line. ── */}
          <div className="pointer-events-none absolute inset-x-0 bottom-[24%] flex justify-center px-6">
            {activeLine && (
              <motion.p
                key={activeLine}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="max-w-2xl text-center text-lg font-medium leading-snug text-cyan-50 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] sm:text-2xl"
              >
                {activeLine}
              </motion.p>
            )}
          </div>

          {/* Scroll affordance — a wordless bouncing chevron, fades on descent. */}
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

          {/* ── The interactive power button on the final terminal beat. ── */}
          <motion.div
            style={{ opacity: controlOpacity }}
            className="absolute inset-x-0 bottom-[10%] flex justify-center"
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

      {/* ── "Enter the screen" transition overlay (unchanged). ── */}
      {phase !== "scroll" && (
        <motion.div
          aria-hidden="true"
          className="fixed inset-0 z-[60] overflow-hidden bg-black"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
        >
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
