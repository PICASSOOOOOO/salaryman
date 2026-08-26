/**
 * TerminalBootAnimation — a brief, creative boot-up overlay shown when the
 * player opens a terminal. Four visual variants, each tuned to where the
 * player is "physically" booting from in the game world:
 *
 *   - "office":   sit-down at a desk + monitor powers on
 *   - "mobile":   pull device from pocket + screen wakes
 *   - "kiosk":    stand at a public kiosk + coin-slot warm-up
 *   - "payphone": lift handset + dial tone
 *
 * Pure CSS / SVG, no images, no third-party deps beyond framer-motion which
 * the project already uses. Auto-completes after a short duration (~1.6s)
 * and calls `onComplete` so the parent can reveal the actual terminal UI.
 *
 * The animation is deliberately short — it's flavour, not a loading gate.
 * Players can press ESC or click anywhere to skip it instantly.
 */
import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

export type TerminalBootVariant = "office" | "mobile" | "kiosk" | "payphone";

interface Props {
  variant: TerminalBootVariant | null;
  onComplete: () => void;
  /** Total duration in ms before auto-complete. Defaults to 1600. */
  durationMs?: number;
}

const VARIANT_META: Record<TerminalBootVariant, {
  label: string;
  caption: string;
  accent: string;
  glow: string;
}> = {
  office:   { label: "DESK TERMINAL · MX-75",   caption: "Sit down. Monitor on. Welcome back.", accent: "#38bdf8", glow: "rgba(56,189,248,0.4)" },
  mobile:   { label: "POCKET TERMINAL · MX-75", caption: "Device drawn. Signal locked. PABLO online.", accent: "#a78bfa", glow: "rgba(167,139,250,0.4)" },
  kiosk:    { label: "PUBLIC KIOSK · CITY NET",  caption: "Free access. Surveillance enabled. Continue?", accent: "#facc15", glow: "rgba(250,204,21,0.4)" },
  payphone: { label: "PAY PHONE · TTC LINE",     caption: "Handset lifted. Dial tone steady.",  accent: "#34d399", glow: "rgba(52,211,153,0.4)" },
};

// Players can disable the boot flourish in Settings → Terminal. When off we skip
// straight to the terminal UI (treated as an instant "skip"), gating every
// caller from one place without changing their call sites.
function bootAnimationEnabled(): boolean {
  try {
    const raw = localStorage.getItem('sm_game_settings_v1');
    if (!raw) return true;
    const p = JSON.parse(raw) as { terminalBoot?: unknown };
    return p.terminalBoot !== false;
  } catch { return true; }
}

export function TerminalBootAnimation({ variant, onComplete, durationMs = 1600 }: Props) {
  const completedRef = useRef(false);
  const bootOn = bootAnimationEnabled();
  useEffect(() => {
    if (!variant) return;
    if (!bootOn) { onComplete(); return; }
    completedRef.current = false;
    const t = setTimeout(() => { if (!completedRef.current) { completedRef.current = true; onComplete(); } }, durationMs);
    // Capture phase + stopPropagation so the skip key consumes the event
    // before WorldPlay's global Escape handler can close the underlying
    // terminal overlay (PABLO). This keeps "skip" a strict animation skip.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === " " || e.key === "Enter") {
        if (!completedRef.current) {
          completedRef.current = true;
          e.stopPropagation();
          e.preventDefault();
          onComplete();
        }
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => { clearTimeout(t); window.removeEventListener("keydown", onKey, { capture: true } as EventListenerOptions); };
  }, [variant, durationMs, onComplete, bootOn]);

  return (
    <AnimatePresence>
      {variant && bootOn && (
        <motion.div
          key={variant}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={() => { if (!completedRef.current) { completedRef.current = true; onComplete(); } }}
          style={{
            position: "fixed", inset: 0, zIndex: 9000,
            background: "radial-gradient(circle at center, #08111c 0%, #000 75%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden", cursor: "pointer",
            fontFamily: "var(--font-sans)",
          }}
          aria-label="Terminal boot animation. Tap or press ESC to skip."
        >
          <BootScene variant={variant} />
          <BootChrome variant={variant} />
          <SkipHint />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── per-variant scene ─────────────────────────────────────────────────── */

function BootScene({ variant }: { variant: TerminalBootVariant }) {
  switch (variant) {
    case "office":   return <OfficeScene />;
    case "mobile":   return <MobileScene />;
    case "kiosk":    return <KioskScene />;
    case "payphone": return <PayphoneScene />;
  }
}

/** Office: desk + monitor swings up, screen powers on. */
function OfficeScene() {
  return (
    <div style={{ position: "relative", width: 360, height: 280 }}>
      {/* desk */}
      <div style={{ position: "absolute", bottom: 0, left: -40, right: -40, height: 24, background: "linear-gradient(180deg,#1f2937,#0b1220)", borderTop: "2px solid #38bdf8", boxShadow: "0 -8px 24px rgba(56,189,248,0.18)" }} />
      {/* monitor stand */}
      <div style={{ position: "absolute", bottom: 24, left: "50%", width: 14, height: 26, background: "#1e293b", transform: "translateX(-50%)" }} />
      {/* monitor swings up */}
      <motion.div
        initial={{ rotateX: -85, opacity: 0 }}
        animate={{ rotateX: 0, opacity: 1 }}
        transition={{ duration: 0.55, ease: "easeOut" }}
        style={{ position: "absolute", bottom: 50, left: "50%", width: 280, height: 200, transform: "translateX(-50%)", transformOrigin: "50% 100%", background: "#0a0f1a", border: "3px solid #1e293b", borderRadius: 6, overflow: "hidden" }}
      >
        <BootScreen accent="#38bdf8" lines={[
          "MX-75 BIOS · v7.4",
          "POST OK · 16384 KB",
          "MOUNTING /home/u",
          "PABLO CORE READY",
        ]} />
      </motion.div>
      {/* chair edge */}
      <div style={{ position: "absolute", bottom: -8, left: "50%", width: 90, height: 14, transform: "translateX(-50%)", background: "linear-gradient(180deg,#0b1220,#000)", borderRadius: "50% 50% 4px 4px", opacity: 0.7 }} />
    </div>
  );
}

/** Mobile: device draws up from bottom, screen wakes. */
function MobileScene() {
  return (
    <motion.div
      initial={{ y: 380, rotate: -8, opacity: 0 }}
      animate={{ y: 0, rotate: 0, opacity: 1 }}
      transition={{ duration: 0.55, ease: "easeOut" }}
      style={{ position: "relative", width: 180, height: 320 }}
    >
      <div style={{ position: "absolute", inset: 0, background: "#111827", borderRadius: 26, border: "3px solid #1e293b", boxShadow: "0 0 60px rgba(167,139,250,0.35), inset 0 0 12px rgba(0,0,0,0.6)" }}>
        <div style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", width: 60, height: 6, background: "#0a0f1a", borderRadius: 3 }} />
        <div style={{ position: "absolute", top: 24, left: 8, right: 8, bottom: 24, borderRadius: 14, overflow: "hidden", background: "#000" }}>
          <BootScreen accent="#a78bfa" lines={[
            "MX-75 mobile",
            "tower lock · OK",
            "PABLO online",
          ]} />
        </div>
        <div style={{ position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)", width: 36, height: 4, background: "#1e293b", borderRadius: 2 }} />
      </div>
    </motion.div>
  );
}

/** Public kiosk: tall standing terminal, coin-slot blinks, screen warms. */
function KioskScene() {
  return (
    <div style={{ position: "relative", width: 280, height: 380 }}>
      {/* base */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 40, background: "linear-gradient(180deg,#1f2937,#0b1220)", borderRadius: "0 0 8px 8px" }} />
      {/* body */}
      <div style={{ position: "absolute", bottom: 30, left: 20, right: 20, top: 0, background: "linear-gradient(180deg,#0b1220,#1f2937)", border: "2px solid #facc15", borderRadius: 10, boxShadow: "0 0 40px rgba(250,204,21,0.25)" }}>
        {/* screen */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          style={{ position: "absolute", top: 18, left: 14, right: 14, height: 200, background: "#000", border: "1px solid #facc15", borderRadius: 4, overflow: "hidden" }}
        >
          <BootScreen accent="#facc15" lines={[
            "CITY NET · KIOSK 14",
            "Free tier · 60 min/day",
            "PABLO online",
          ]} />
        </motion.div>
        {/* coin slot */}
        <motion.div
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 0.7, repeat: Infinity }}
          style={{ position: "absolute", top: 232, left: "50%", transform: "translateX(-50%)", width: 60, height: 4, background: "#facc15", borderRadius: 2 }}
        />
        {/* keypad */}
        <div style={{ position: "absolute", bottom: 16, left: 14, right: 14, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 4 }}>
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} style={{ height: 22, background: "#1e293b", border: "1px solid #facc15", borderRadius: 3, opacity: 0.6 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Payphone: handset lifts off cradle and the dial tone display powers on. */
function PayphoneScene() {
  return (
    <div style={{ position: "relative", width: 240, height: 360 }}>
      {/* booth body */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,#064e3b,#022c22)", border: "3px solid #34d399", borderRadius: 8, boxShadow: "0 0 40px rgba(52,211,153,0.3)" }}>
        {/* status display */}
        <div style={{ position: "absolute", top: 24, left: 30, right: 30, height: 90, background: "#000", border: "2px solid #34d399", borderRadius: 4, overflow: "hidden" }}>
          <BootScreen accent="#34d399" lines={[
            "TTC LINE",
            "DIAL TONE",
          ]} compact />
        </div>
        {/* cradle */}
        <div style={{ position: "absolute", top: 130, left: 30, right: 30, height: 14, background: "#022c22", border: "1px solid #34d399", borderRadius: 3 }} />
        {/* handset */}
        <motion.div
          initial={{ y: 0, rotate: 0 }}
          animate={{ y: -50, rotate: -25 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{ position: "absolute", top: 132, left: 38, width: 160, height: 22, background: "#0a0f1a", border: "1.5px solid #34d399", borderRadius: 11, transformOrigin: "0% 50%" }}
        >
          <div style={{ position: "absolute", left: 4, top: 4, width: 14, height: 14, background: "#34d399", borderRadius: "50%", opacity: 0.8 }} />
          <div style={{ position: "absolute", right: 4, top: 4, width: 14, height: 14, background: "#34d399", borderRadius: "50%", opacity: 0.8 }} />
        </motion.div>
        {/* keypad */}
        <div style={{ position: "absolute", bottom: 60, left: 30, right: 30, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 4 }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} style={{ height: 22, background: "#022c22", border: "1px solid #34d399", borderRadius: 3, color: "#34d399", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, "*", 0, "#"][i]}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── shared bits ────────────────────────────────────────────────────────── */

function BootScreen({ accent, lines, compact = false }: { accent: string; lines: string[]; compact?: boolean }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: "#000", overflow: "hidden" }}>
      {/* boot lines */}
      <div style={{ position: "absolute", inset: 0, padding: compact ? 6 : 10, color: accent, fontSize: compact ? 9 : 11, lineHeight: 1.4, fontFamily: "var(--font-sans)" }}>
        {lines.map((l, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.35 + i * 0.13, duration: 0.18 }}
          >
            ▸ {l}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function BootChrome({ variant }: { variant: TerminalBootVariant }) {
  const m = VARIANT_META[variant];
  return (
    <div style={{ position: "absolute", top: 24, left: 0, right: 0, textAlign: "center", color: m.accent, letterSpacing: "0.3em", fontSize: 11, opacity: 0.85 }}>
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 0.9, y: 0 }} transition={{ delay: 0.1, duration: 0.3 }}>
        ▌ {m.label}
      </motion.div>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 0.6 }} transition={{ delay: 0.55, duration: 0.3 }}
        style={{ marginTop: 6, fontSize: 9, letterSpacing: "0.15em", color: "#94a3b8" }}
      >
        {m.caption}
      </motion.div>
    </div>
  );
}

function SkipHint() {
  return (
    <div style={{ position: "absolute", bottom: 20, left: 0, right: 0, textAlign: "center", color: "#475569", fontSize: 9, letterSpacing: "0.2em" }}>
      TAP / ESC TO SKIP
    </div>
  );
}
