import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@workspace/replit-auth-web";
import { PabloIntroOverlay } from "@/components/PabloIntroOverlay";
import { markTutorialDone } from "@/lib/tutorial-progress";
import { useArtAsset } from "@/lib/art";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Stage 1: cinematic nebula intro with Pablo's welcome.
// Stage 2: property carousel — Pablo walks the player through the five
//          starter real-estate templates so the economy is set up as a
//          first-class system from minute one.
// Stage 3: short "set up your office" briefing card, then routes the user
//          into the world.
//
// The tutorial flag is set the moment the user first reaches the carousel
// stage — that way even if they navigate away mid-flow, they don't get
// re-funneled here.

interface PropertyTemplate {
  artKey: string;
  name: string;
  pitch: string; // Pablo's one-liner about this place
  startingPrice: number;
  badge: string;
}

const TEMPLATES: PropertyTemplate[] = [
  {
    artKey: "property_loft",
    name: "STARTER LOFT",
    pitch: "One window, one chair, one terminal. Cheap rent, zero excuses.",
    startingPrice: 25,
    badge: "ENTRY",
  },
  {
    artKey: "property_kiosk",
    name: "STREET KIOSK",
    pitch: "Sidewalk-level. Walk-ins all day. Good if you've got something to sell.",
    startingPrice: 40,
    badge: "RETAIL",
  },
  {
    artKey: "property_corner_office",
    name: "CORNER OFFICE",
    pitch: "Glass on two sides. People notice. That's the whole point.",
    startingPrice: 280,
    badge: "EXEC",
  },
  {
    artKey: "property_warehouse",
    name: "OPS WAREHOUSE",
    pitch: "Forklift-friendly. Run real operations, ship real volume.",
    startingPrice: 420,
    badge: "OPS",
  },
  {
    artKey: "property_penthouse",
    name: "PENTHOUSE",
    pitch: "The address you don't print on your card. They already know.",
    startingPrice: 1200,
    badge: "ELITE",
  },
];

export default function GameIntro() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const [stage, setStage] = useState<"intro" | "properties" | "brief">("intro");

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      window.location.href = `/api/login?returnTo=${encodeURIComponent("/game/intro")}`;
    }
  }, [isLoading, isAuthenticated]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black text-zinc-500 font-mono text-xs tracking-[0.3em]">
        BOOTING…
      </div>
    );
  }

  if (stage === "intro") {
    return (
      <PabloIntroOverlay
        lines={[
          "Welcome to your server city.",
          "I'm Pablo. I run point on this office — your phones, your contacts, your books, your bots. All of it.",
          "First thing's first. Let's get you a place to work. Walk with me.",
        ]}
        onDone={() => {
          markTutorialDone();
          setStage("properties");
        }}
      />
    );
  }

  if (stage === "properties") {
    return <PropertyCarousel onDone={() => setStage("brief")} />;
  }

  // Stage 3: the briefing card — bridge between the cinematic and the world.
  return (
    <motion.div
      className="min-h-screen w-full bg-black flex items-center justify-center p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <div className="max-w-md w-full rounded-2xl border border-pink-500/30 bg-pink-500/5 p-6 space-y-4">
        <div className="text-pink-300 text-xs font-bold tracking-widest" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
          PABLO · ONBOARDING
        </div>
        <h1 className="text-pink-100 text-xl sm:text-2xl font-bold leading-tight" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
          Step into your server city.
        </h1>
        <p className="text-pink-200/80 text-sm leading-relaxed">
          You'll start in the bathroom. Wash up, dry off, and walk into your
          office. Look for the cryo-tubes — that's where your bots sleep until
          you wake them. When you're ready, find the terminal. That's where
          the real work happens.
        </p>
        <ul className="text-pink-300/80 text-xs space-y-1 pl-4 list-disc" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
          <li>Use pinch / scroll to zoom in close.</li>
          <li>Tap or click objects to interact.</li>
          <li>Walk to the terminal to enter Pablo.</li>
        </ul>
        <div className="flex gap-2 pt-2">
          <button
            onClick={() => navigate("/game/bathroom")}
            className="flex-1 px-4 py-2 rounded-md border border-pink-400/50 bg-pink-500/20 text-pink-100 text-sm font-bold hover:bg-pink-500/30 transition-colors"
            style={{ fontFamily: "'Share Tech Mono', monospace" }}
          >
            BEGIN ▸
          </button>
          <button
            onClick={() => navigate("/pablo")}
            className="px-4 py-2 rounded-md border border-pink-500/30 bg-pink-500/5 text-pink-300/70 text-xs hover:bg-pink-500/15 transition-colors"
            style={{ fontFamily: "'Share Tech Mono', monospace" }}
            title="Skip straight to the terminal"
          >
            TERMINAL
          </button>
        </div>
        <p className="text-pink-400/40 text-[10px] text-center pt-2" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
          Be safe. Have fun. Don't die.
        </p>
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* Stage 2 — the carousel                                                     */
/* -------------------------------------------------------------------------- */

function PropertyCarousel({ onDone }: { onDone: () => void }) {
  const [, navigate] = useLocation();
  const [idx, setIdx] = useState(0);
  const t = TEMPLATES[idx];
  const url = useArtAsset(t.artKey);

  const prev = () => setIdx(i => (i - 1 + TEMPLATES.length) % TEMPLATES.length);
  const next = () => setIdx(i => (i + 1) % TEMPLATES.length);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "Enter" || e.key === " ") onDone();
      else if (e.key === "Escape") onDone();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  return (
    <motion.div
      className="min-h-screen w-full bg-black text-pink-100 flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      data-testid="intro-property-carousel"
    >
      <header className="px-6 pt-4 pb-2 flex items-center justify-between border-b border-pink-500/20">
        <div className="text-pink-300 text-[10px] tracking-[0.4em]" style={{ fontFamily: "'VT323', monospace" }}>
          PABLO · REAL ESTATE TOUR
        </div>
        <div className="text-pink-300/70 text-[10px] tracking-[0.4em]">
          {idx + 1} / {TEMPLATES.length}
        </div>
        <button
          type="button"
          onClick={onDone}
          className="text-pink-300/70 text-[10px] tracking-[0.4em] hover:text-pink-100"
          data-testid="intro-carousel-skip"
        >
          SKIP ▸
        </button>
      </header>

      <div className="flex-1 grid lg:grid-cols-[1fr_360px] gap-6 px-4 sm:px-10 py-6 items-stretch">
        {/* Big property reveal */}
        <div className="relative rounded-2xl border-2 border-pink-500/40 bg-gradient-to-b from-pink-950/40 to-black overflow-hidden flex items-center justify-center"
          style={{ boxShadow: "0 0 32px rgba(236,72,153,0.25)", minHeight: 320 }}>
          <button
            type="button"
            onClick={prev}
            aria-label="Previous"
            data-testid="intro-carousel-prev"
            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full border border-pink-400/60 bg-black/70 hover:bg-pink-500/30 flex items-center justify-center text-pink-100"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Next"
            data-testid="intro-carousel-next"
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full border border-pink-400/60 bg-black/70 hover:bg-pink-500/30 flex items-center justify-center text-pink-100"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <AnimatePresence mode="wait">
            <motion.div
              key={t.artKey}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.35 }}
              className="w-full h-full flex items-center justify-center p-4"
            >
              {url ? (
                <img
                  src={url}
                  alt={t.name}
                  className="max-w-full max-h-[60vh] object-contain rounded-lg"
                  style={{ imageRendering: "pixelated", boxShadow: "0 0 24px rgba(236,72,153,0.35)" }}
                  draggable={false}
                />
              ) : (
                <div className="text-pink-500/60 text-xs tracking-[0.4em]">▌ COMPOSING ▌</div>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="absolute top-3 left-3 px-2 py-0.5 rounded bg-black/80 border border-cyan-400/60 text-cyan-200 text-[10px] tracking-[0.3em]">
            {t.badge}
          </div>
          <div className="absolute top-3 right-3 px-2 py-0.5 rounded bg-black/80 border border-pink-400/60 text-pink-200 text-[11px] tracking-[0.2em]">
            FROM {t.startingPrice}F
          </div>

          {/* Dot strip */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
            {TEMPLATES.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIdx(i)}
                aria-label={`Show property ${i + 1}`}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === idx ? "bg-pink-300 scale-125" : "bg-pink-500/30 hover:bg-pink-400/60"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Pablo's pitch panel */}
        <aside className="rounded-2xl border-2 border-pink-500/40 bg-black/80 p-5 flex flex-col">
          <div className="text-pink-300 text-[10px] tracking-[0.4em] mb-2" style={{ fontFamily: "'VT323', monospace" }}>
            ▌ ON THIS LOT
          </div>
          <h2 className="text-pink-100 text-2xl tracking-[0.2em] mb-3" style={{ fontFamily: "'VT323', monospace" }}>
            {t.name}
          </h2>
          <div className="rounded border border-pink-400/30 bg-pink-500/[0.06] p-3 mb-4">
            <div className="text-pink-400 text-[10px] tracking-[0.3em] mb-1">PABLO</div>
            <p className="text-pink-100/90 text-sm leading-snug italic">"{t.pitch}"</p>
          </div>

          <div className="mt-auto space-y-2">
            <button
              type="button"
              onClick={onDone}
              data-testid="intro-carousel-continue"
              className="w-full px-4 py-3 rounded-md border-2 border-pink-400/60 bg-pink-500/20 hover:bg-pink-500/35 text-pink-100 text-sm tracking-[0.4em]"
              style={{ fontFamily: "'Share Tech Mono', monospace" }}
            >
              GOT IT — KEEP GOING ▸
            </button>
            <button
              type="button"
              onClick={() => { onDone(); setTimeout(() => navigate("/store/realty"), 50); }}
              className="w-full px-4 py-2 rounded-md border border-cyan-400/40 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-100 text-[11px] tracking-[0.3em]"
              data-testid="intro-carousel-realty"
            >
              SEE THE REALTY OFFICE ▸
            </button>
            <p className="text-pink-400/50 text-[10px] text-center pt-1 tracking-widest">
              ◂ → ARROWS · SPACE TO CONTINUE
            </p>
          </div>
        </aside>
      </div>
    </motion.div>
  );
}
