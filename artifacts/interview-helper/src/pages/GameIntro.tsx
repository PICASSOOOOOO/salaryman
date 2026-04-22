import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useAuth } from "@workspace/replit-auth-web";
import { PabloIntroOverlay } from "@/components/PabloIntroOverlay";
import { markTutorialDone } from "@/lib/tutorial-progress";

// Stage 1: cinematic nebula intro with Pablo's welcome.
// Stage 2: short "set up your office" pre-game card with the next steps,
//          then routes the user into the world. (The bathroom/office/bots
//          interactive scenes plug into this same page in subsequent slices.)
//
// The tutorial flag is set the moment the user first reaches stage 2 — that
// way even if they navigate away mid-flow, they don't get re-funneled here.

export default function GameIntro() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const [stage, setStage] = useState<"intro" | "brief">("intro");

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
          setStage("brief");
        }}
      />
    );
  }

  // Stage 2: the briefing card — bridge between the cinematic and the world.
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
