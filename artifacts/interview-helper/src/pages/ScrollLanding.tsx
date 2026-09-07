/**
 * ScrollLanding — the public, scroll-driven gameplay front door at "/".
 *
 * The trailer is the product preview: scroll advances the real gameplay video,
 * scrolling up rewinds it, and the final power button enters the actual console.
 * The page is intentionally gameplay-led; the Pablo experience remains available
 * as a secondary route in the small front-door nav.
 */

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import { Link, useLocation } from "wouter";
import "./ScrollLanding.css";

const BASE = import.meta.env.BASE_URL;
const VIDEO_SRC = `${BASE}brand/other/salaryman-trailer.mp4`;
const POSTER_SRC = `${BASE}brand/other/salaryman-trailer-poster.jpg`;
const SCROLL_VH = 620;

interface Scene {
  eyebrow: string;
  title: string;
  detail: string;
}

const SCENES: Scene[] = [
  {
    eyebrow: "The morning shift",
    title: "Start with a desk. Leave with a direction.",
    detail: "Every day opens with choices that change the shape of your work.",
  },
  {
    eyebrow: "A living city",
    title: "Your business is bigger than its office.",
    detail: "Meet the people, places, and opportunities moving through the city.",
  },
  {
    eyebrow: "Work in motion",
    title: "Turn momentum into something of your own.",
    detail: "Build a career, trade your time, and make a place in the world.",
  },
  {
    eyebrow: "Your next move",
    title: "The world is ready when you are.",
    detail: "Power on the console to begin your shift.",
  },
];

/** A quiet power glyph; the final action is recognizable without relying on text. */
function PowerGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="salary-landing__power-glyph"
      aria-hidden="true"
    >
      <path d="M12 3v9" />
      <path d="M6.3 7.3a8 8 0 1 0 11.4 0" />
    </svg>
  );
}

function LeafMark() {
  return (
    <svg
      viewBox="0 0 28 28"
      fill="none"
      className="salary-landing__leaf-mark"
      aria-hidden="true"
    >
      <path
        d="M23.7 4.8C15.4 4.1 7.1 6.1 5.3 12.4c-1.1 3.9 1.4 7.9 5.4 8.5 6.6.9 11.8-5.6 13-16.1Z"
        fill="currentColor"
      />
      <path d="M4.6 23.8c3.6-6.8 8.2-10.7 15-14.2" stroke="currentColor" />
    </svg>
  );
}

/** Warm daylight fallback keeps the door usable when the video cannot load. */
function DaylightFallback() {
  return (
    <div className="salary-landing__fallback" aria-hidden="true">
      <img
        src={POSTER_SRC}
        alt=""
        className="salary-landing__fallback-poster"
      />
      <div className="salary-landing__fallback-wash" />
      <div className="salary-landing__fallback-sun" />
    </div>
  );
}

type Phase = "scroll" | "booting" | "entering";

export default function ScrollLanding() {
  const [, navigate] = useLocation();
  const reduceMotion = !!useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef(0);
  const durationRef = useRef(0);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  const [terminalReady, setTerminalReady] = useState(false);
  const [phase, setPhase] = useState<Phase>("scroll");
  const [videoFailed, setVideoFailed] = useState(false);
  const [sceneIndex, setSceneIndex] = useState(0);

  useEffect(() => {
    if (reduceMotion || videoFailed) return undefined;
    const watchdog = window.setTimeout(() => {
      if (durationRef.current <= 0) setVideoFailed(true);
    }, 6000);
    return () => window.clearTimeout(watchdog);
  }, [reduceMotion, videoFailed]);

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    progressRef.current = value;
    setTerminalReady(value > 0.9);
    const nextScene = Math.min(SCENES.length - 1, Math.floor(value * SCENES.length));
    setSceneIndex((current) => (current === nextScene ? current : nextScene));
  });

  useEffect(() => {
    if (reduceMotion || videoFailed) return undefined;
    let raf = 0;
    const tick = () => {
      const video = videoRef.current;
      const duration = durationRef.current;
      if (video && duration > 0) {
        const target = Math.min(progressRef.current, 0.999) * duration;
        const next = video.currentTime + (target - video.currentTime) * 0.12;
        if (Math.abs(target - video.currentTime) > 0.01) {
          try {
            video.currentTime = next;
          } catch {
            /* Seeking can briefly throw mid-load; the next frame retries. */
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduceMotion, videoFailed]);

  const powerOn = () => {
    if (phase !== "scroll") return;
    setPhase("booting");
  };

  useEffect(() => {
    if (phase === "booting") {
      const timer = window.setTimeout(
        () => setPhase("entering"),
        reduceMotion ? 350 : 1100,
      );
      return () => window.clearTimeout(timer);
    }
    if (phase === "entering") {
      const timer = window.setTimeout(
        () => navigate("/console"),
        reduceMotion ? 200 : 850,
      );
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [phase, reduceMotion, navigate]);

  const controlOpacity = useTransform(scrollYProgress, [0.86, 0.93], [0, 1]);
  const chevronOpacity = useTransform(scrollYProgress, [0, 0.06], [1, 0]);
  const progressWidth = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);
  const scene = SCENES[sceneIndex];

  return (
    <main className="salary-landing">
      <div className="sr-only">
        <h1>SALARYMAN — A playable business world</h1>
        <p>
          SALARYMAN is an AI-powered business operating system and living city
          by Picasso AI. Watch real gameplay move from the office into the city,
          then enter the world through the console.
        </p>
        <ol>
          {SCENES.map((item) => (
            <li key={item.eyebrow}>
              {item.title} {item.detail}
            </li>
          ))}
        </ol>
        <p>
          A world of work is waiting. Power on the console to begin your shift.
          Learn more about Pablo at the secondary Pablo experience.
        </p>
      </div>

      <div
        ref={containerRef}
        style={{ height: `${SCROLL_VH}vh` }}
        className="salary-landing__track"
      >
        <div className="salary-landing__viewport">
          <div className="salary-landing__progress-rail" aria-hidden="true">
            <motion.div
              className="salary-landing__progress"
              style={{ width: progressWidth }}
            />
          </div>

          {!videoFailed &&
            (reduceMotion ? (
              <img
                src={POSTER_SRC}
                alt="A glimpse of the SALARYMAN business world"
                className="salary-landing__media"
                onError={() => setVideoFailed(true)}
                data-testid="img-gameplay-poster"
              />
            ) : (
              <video
                ref={videoRef}
                src={VIDEO_SRC}
                poster={POSTER_SRC}
                muted
                playsInline
                preload="metadata"
                aria-label="SALARYMAN gameplay trailer"
                className="salary-landing__media"
                onLoadedMetadata={(event) => {
                  durationRef.current = event.currentTarget.duration || 0;
                }}
                onError={() => setVideoFailed(true)}
                data-testid="video-gameplay-trailer"
              />
            ))}

          {videoFailed && <DaylightFallback />}

          <div className="salary-landing__daylight" aria-hidden="true" />
          <div className="salary-landing__grain" aria-hidden="true" />

          <header className="salary-landing__header">
            <Link
              href="/"
              className="salary-landing__wordmark"
              aria-label="SALARYMAN home"
              data-testid="link-home-salaryman"
            >
              <span className="salary-landing__brand-mark">
                <LeafMark />
              </span>
              <span>
                <strong>SALARYMAN</strong>
                <small>Picasso AI / playable business world</small>
              </span>
            </Link>
            <nav className="salary-landing__nav" aria-label="Secondary navigation">
              <span className="salary-landing__nav-status">
                <span className="salary-landing__status-dot" aria-hidden="true" />
                Live world
              </span>
              <Link
                href="/pablo"
                className="salary-landing__pablo-link"
                data-testid="link-pablo-secondary"
              >
                Meet Pablo <span aria-hidden="true">↗</span>
              </Link>
            </nav>
          </header>

          <section className="salary-landing__intro" aria-labelledby="landing-title">
            <p className="salary-landing__kicker">
              <span>01</span> A world you can work in
            </p>
            <h2 id="landing-title">
              Make a living.
              <br />
              <em>Build a life.</em>
            </h2>
            <p className="salary-landing__intro-copy">
              Step into a living business world where every shift, deal, and
              decision leaves a mark.
            </p>
            <div className="salary-landing__scroll-hint" aria-hidden="true">
              <span>Scroll to tour</span>
              <span className="salary-landing__scroll-line" />
            </div>
          </section>

          <div className="salary-landing__world-label" aria-hidden="true">
            <span>Real gameplay</span>
            <span className="salary-landing__world-line" />
            <span>01 / 04</span>
          </div>

          <motion.section
            key={scene.eyebrow}
            className="salary-landing__scene"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.35 }}
            aria-live="polite"
            data-testid={`status-gameplay-scene-${sceneIndex}`}
          >
            <p className="salary-landing__scene-eyebrow">
              <span className="salary-landing__leaf-dot" aria-hidden="true" />
              {scene.eyebrow}
            </p>
            <h3>{scene.title}</h3>
            <p>{scene.detail}</p>
          </motion.section>

          {!reduceMotion && (
            <motion.div
              aria-hidden="true"
              className="salary-landing__chevron"
              style={{ opacity: chevronOpacity }}
            >
              <span>Keep moving</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </motion.div>
          )}

          <motion.div
            style={{ opacity: controlOpacity }}
            className="salary-landing__enter"
          >
            <div className="salary-landing__enter-copy">
              <span className="salary-landing__enter-index">04 / 04</span>
              <strong>Take your place in the city.</strong>
              <span>Power on the console when you are ready.</span>
            </div>
            <motion.button
              type="button"
              aria-label="Power on the console and begin"
              onClick={powerOn}
              disabled={!terminalReady || phase !== "scroll"}
              whileHover={terminalReady ? { scale: 1.04 } : undefined}
              whileTap={terminalReady ? { scale: 0.96 } : undefined}
              className="salary-landing__power-button"
              data-testid="button-enter-console"
            >
              <PowerGlyph />
              <span>Enter world</span>
            </motion.button>
          </motion.div>
        </div>
      </div>

      {phase !== "scroll" && (
        <motion.div
          aria-hidden="true"
          className="salary-landing__transition"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
        >
          <motion.div
            className="salary-landing__transition-sun"
            initial={{ width: "62vmin", height: "40vmin", opacity: 0.2 }}
            animate={
              phase === "booting"
                ? { opacity: [0.2, 0.55, 0.35, 0.85, 0.65, 1] }
                : { width: "240vmax", height: "240vmax", opacity: 1 }
            }
            transition={
              phase === "booting"
                ? { duration: 1, times: [0, 0.2, 0.4, 0.6, 0.8, 1] }
                : { duration: reduceMotion ? 0.2 : 0.8, ease: "easeIn" }
            }
          />
          {phase === "entering" && (
            <motion.div
              className="salary-landing__transition-flash"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.85, 0] }}
              transition={{
                duration: reduceMotion ? 0.2 : 0.8,
                times: [0, 0.7, 1],
              }}
            />
          )}
        </motion.div>
      )}
    </main>
  );
}