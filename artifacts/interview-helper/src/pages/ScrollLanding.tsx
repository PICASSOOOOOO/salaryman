/**
 * ScrollLanding — the public, scroll-driven gameplay-trailer front door at "/".
 *
 * Instead of stills, this plays a real GAMEPLAY TRAILER (office → city → the
 * world of SALARYMAN) scrubbed by the page scroll: scrolling down advances the
 * footage, scrolling up rewinds it, and scroll velocity controls how fast the
 * footage moves (fast scroll = fast playback, holding still = the footage eases
 * and holds). Pablo narrates what SALARYMAN is over the top as a continuous
 * voice-over (started on the visitor's first interaction, honoring the site's
 * mute rules), with on-screen captions as a muted/scrubbing fallback.
 *
 * The trailer ends on the existing "dormant terminal → power on" beat: a glowing
 * power button appears near the end of the scroll and, on tap, plays an "enter
 * the screen" transition and routes into /pablo (the sign-in funnel).
 *
 * Graceful by design: if the video can't load we fall back to an on-brand
 * neon-noir wash (never a dead black screen); under reduce-motion we show a
 * static poster instead of scrubbing. The full story still lives in `sr-only`
 * semantic content + captions so the page stays crawlable and accessible.
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
import { getAudioSettings } from "@/lib/audio-settings";

// ── Asset URLs (served as static public assets, BASE_URL-prefixed). ──────────
const BASE = import.meta.env.BASE_URL;
const VIDEO_SRC = `${BASE}brand/other/salaryman-trailer.mp4`;
const POSTER_SRC = `${BASE}brand/other/salaryman-trailer-poster.jpg`;
const VO_SRC = `${BASE}brand/other/salaryman-trailer-vo.mp3`;

// ── Pablo's narration, as timed caption cues (muted/scrubbing fallback). ─────
// `at` = seconds into the voice-over track where the line begins. The active
// caption is the last cue whose `at` is <= the audio's currentTime.
interface Cue {
  at: number;
  text: string;
}
const CUES: Cue[] = [
  { at: 0, text: "Welcome. You're looking at SALARYMAN." },
  { at: 3.5, text: "My city." },
  { at: 5, text: "Out there, every soul works a job, runs a business, earns their keep." },
  { at: 11, text: "The offices never close. The streets never sleep." },
  { at: 16, text: "Some build empires. Some burn out at the desk." },
  { at: 22, text: "There's a position open now — yours, if you want it." },
  { at: 29, text: "But know the terms: in here, you work, or you don't last." },
  { at: 36, text: "Power on the terminal. Let's see what you're made of." },
];

// How tall the scroll track is — longer = a slower, more cinematic scrub.
const SCROLL_VH = 620;

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
function NeonFallback({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#06070b]">
      <motion.div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 38% 42%, rgba(244,114,182,0.22), transparent 60%), " +
            "radial-gradient(ellipse 60% 50% at 66% 60%, rgba(34,211,238,0.18), transparent 62%), " +
            "linear-gradient(160deg, #0a0c14 0%, #06070b 55%, #11071a 100%)",
        }}
        animate={reduceMotion ? undefined : { opacity: [0.6, 0.95, 0.6] }}
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
  // Wall-clock origin for captions, set on the visitor's first gesture. Captions
  // run off this even when the voice-over is muted or autoplay-blocked, and snap
  // to the real audio clock whenever the VO is actually playing.
  const captionStartRef = useRef<number | null>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  const [terminalReady, setTerminalReady] = useState(false);
  const [phase, setPhase] = useState<Phase>("scroll");
  const [videoFailed, setVideoFailed] = useState(false);
  const [captionIdx, setCaptionIdx] = useState(-1);

  // Watchdog: a trailer that never errors but never loads (slow CDN, stalled
  // connection, or a cold cache after navigating back onto the page) would
  // otherwise leave the cover depending on a frame that never arrives. If the
  // video hasn't reported a usable duration within a few seconds, fall back to
  // the on-brand neon wash — which needs no media at all — so the front door is
  // always advanceable. The poster covers the gap until then.
  useEffect(() => {
    if (reduceMotion || videoFailed) return undefined;
    const id = window.setTimeout(() => {
      if (durationRef.current <= 0) setVideoFailed(true);
    }, 6000);
    return () => window.clearTimeout(id);
  }, [reduceMotion, videoFailed]);

  // Scroll → video scrub. We never .play() the video; instead we ease its
  // currentTime toward the scroll-derived target every frame. The lerp gives
  // the "velocity" feel for free: a fast scroll yanks the target far ahead so
  // the footage races to catch up, holding still lets it ease to rest.
  const progressRef = useRef(0);
  const durationRef = useRef(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    progressRef.current = v;
    setTerminalReady(v > 0.9);
  });

  useEffect(() => {
    if (reduceMotion || videoFailed) return undefined;
    let raf = 0;
    const tick = () => {
      const vid = videoRef.current;
      const dur = durationRef.current;
      if (vid && dur > 0) {
        const target = Math.min(progressRef.current, 0.999) * dur;
        const cur = vid.currentTime;
        const next = cur + (target - cur) * 0.12; // smoothing / inertia
        if (Math.abs(target - cur) > 0.01) {
          try {
            vid.currentTime = next;
          } catch {
            /* seeking can briefly throw mid-load; ignore */
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduceMotion, videoFailed]);

  // ── Pablo voice-over ───────────────────────────────────────────────────────
  // The narration is a continuous audio track (NOT the scrubbed video's audio,
  // which would be unusable when seeking). It starts on the visitor's first
  // interaction — required by browser autoplay policy — and honors the site's
  // master mute. Captions track the audio's clock so muted/scrubbing visitors
  // still get the words. Cleaned up on navigate-away.
  useEffect(() => {
    let armed = true;
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
      // Start the caption clock regardless of audio — captions must run when
      // the VO is muted or its autoplay is blocked.
      if (captionStartRef.current == null) {
        captionStartRef.current =
          typeof performance !== "undefined" ? performance.now() : Date.now();
      }
      const s = getAudioSettings();
      if (s.muted) return; // captions still show via the wall clock; no audio
      const a = audioRef.current;
      if (!a) return;
      try {
        a.volume = 0.9;
        const p = a.play();
        if (p && typeof p.catch === "function") {
          // Autoplay blocked — captions keep running on the wall clock.
          p.catch(() => {});
        }
      } catch {
        /* best-effort; captions cover the muted/blocked case */
      }
    }
    for (const e of events) {
      window.addEventListener(e, onFirstGesture, { passive: true });
    }
    return () => {
      armed = false;
      removeListeners();
      const a = audioRef.current;
      if (a) {
        try {
          a.pause();
          a.currentTime = 0;
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  // Drive captions off a single clock that starts on the first gesture. When the
  // voice-over is actually playing we use its real currentTime (tight sync); when
  // it's muted or autoplay-blocked we fall back to elapsed wall-clock time so the
  // words still appear. Runs only during the scroll phase.
  useEffect(() => {
    if (phase !== "scroll") return undefined;
    const pick = (t: number) => {
      let idx = -1;
      for (let i = 0; i < CUES.length; i++) {
        if (t >= CUES[i].at) idx = i;
        else break;
      }
      setCaptionIdx(idx);
    };
    const id = window.setInterval(() => {
      const start = captionStartRef.current;
      if (start == null) return; // not started until first gesture
      const a = audioRef.current;
      const playing = !!a && !a.paused && !a.muted && a.currentTime > 0.05;
      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const t = playing ? a!.currentTime : (now - start) / 1000;
      pick(t);
    }, 200);
    return () => window.clearInterval(id);
  }, [phase]);

  // Power-on → "enter the screen" → /pablo. Idempotent: ignore re-taps.
  const powerOn = () => {
    if (phase !== "scroll") return;
    playPowerOn();
    const a = audioRef.current;
    if (a) {
      try {
        a.pause();
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

  // The real poster frame (on the <video>/<img>) covers the loading gap, so the
  // on-brand wash is reserved strictly for an actual load failure — never a
  // dead black screen, never hiding a frame that's about to appear.
  const showFallback = videoFailed;
  const caption = captionIdx >= 0 ? CUES[captionIdx]?.text : "";

  return (
    <div className="relative w-full bg-[#06070b]">
      {/* Continuous Pablo voice-over (separate from the scrubbed video). */}
      <audio ref={audioRef} src={VO_SRC} preload="auto" />

      {/* ── SEO / accessibility: the pitch in words, visually hidden. ── */}
      <div className="sr-only">
        <h1>SALARYMAN — Begin Your Shift, by Picasso AI</h1>
        <p>
          SALARYMAN is the AI-powered business operating system and living city
          by Picasso AI. Watch real gameplay — corporate offices, neon-noir
          streets, and the world you'll work in — narrated by Pablo, your host
          inside SALARYMAN.
        </p>
        <ol>
          {CUES.map((c) => (
            <li key={c.at}>{c.text}</li>
          ))}
        </ol>
        <p>
          An available position awaits. Power on the terminal to begin your
          shift and meet Pablo.
        </p>
      </div>

      {/* ── The scroll cinematic. Tall scroll track + sticky viewport. ── */}
      <div
        ref={containerRef}
        style={{ height: `${SCROLL_VH}vh` }}
        className="relative w-full"
      >
        <div className="sticky top-0 h-screen w-full overflow-hidden bg-[#06070b]">
          {/* The scrubbed gameplay trailer (or static poster under reduce-motion). */}
          {!videoFailed &&
            (reduceMotion ? (
              <img
                src={POSTER_SRC}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 h-full w-full object-cover"
                onError={() => setVideoFailed(true)}
              />
            ) : (
              <video
                ref={videoRef}
                src={VIDEO_SRC}
                poster={POSTER_SRC}
                muted
                playsInline
                preload="auto"
                aria-hidden="true"
                className="absolute inset-0 h-full w-full object-cover"
                onLoadedMetadata={(e) => {
                  durationRef.current = e.currentTarget.duration || 0;
                }}
                onError={() => setVideoFailed(true)}
              />
            ))}

          {/* On-brand wash beneath/over while buffering or on failure. */}
          {showFallback && <NeonFallback reduceMotion={reduceMotion} />}

          {/* Vignette + bottom gradient for depth and caption legibility. */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at center, transparent 52%, rgba(3,4,8,0.6) 100%), linear-gradient(to bottom, rgba(3,4,8,0.4), transparent 30%, transparent 58%, rgba(3,4,8,0.78))",
            }}
          />

          {/* ── Pablo's narration captions (muted/scrubbing fallback). ── */}
          {caption && phase === "scroll" && (
            <motion.div
              key={captionIdx}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="pointer-events-none absolute inset-x-0 bottom-[26%] flex justify-center px-6"
            >
              <p className="max-w-2xl text-center text-base font-light leading-relaxed text-cyan-50/90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] sm:text-lg">
                {caption}
              </p>
            </motion.div>
          )}

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
