import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, X, Sparkles, Send, Keyboard, MessageCircle, GraduationCap } from "lucide-react";
import { PicassoLogo } from "@/components/PicassoLogo";
import { HummingBirdAttachStrip } from "@/components/HummingBirdAttachStrip";
import { apiFetch } from "@/lib/api-client";
import { speakWithTTS } from "@/lib/tts";
import { useAuth } from "@workspace/replit-auth-web";
import { lazy, Suspense as ReactSuspense, Component as ReactComponent, type ReactNode as RNode } from "react";
const PabloNebula3D = lazy(() =>
  import("@/components/PabloNebula3D")
    .then(m => ({ default: m.PabloNebula3D }))
    .catch(err => {
      console.warn("[PabloTerminal] 3D bundle failed to load, using 2D fallback:", err);
      return { default: (props: { status: NebulaStatusLite; size: number }) => <NebulaOrb2D {...props} /> };
    })
);

type NebulaStatusLite = "idle" | "listening" | "thinking" | "speaking";

const ORB_COLORS: Record<NebulaStatusLite, { core: string; halo: string; ring: string }> = {
  idle:      { core: "#a78bfa", halo: "#7c3aed", ring: "#4c1d95" },
  listening: { core: "#67e8f9", halo: "#06b6d4", ring: "#155e75" },
  thinking:  { core: "#fbbf24", halo: "#f59e0b", ring: "#78350f" },
  speaking:  { core: "#f0abfc", halo: "#d946ef", ring: "#86198f" },
};

// Pure-CSS animated orb. No WebGL, no chunk loading. Only used as a safety net.
function NebulaOrb2D({ status, size }: { status: NebulaStatusLite; size: number }) {
  const c = ORB_COLORS[status] ?? ORB_COLORS.idle;
  const speed = status === "listening" ? "1.4s" : status === "speaking" ? "1.8s" : status === "thinking" ? "2.2s" : "3.5s";
  return (
    <div style={{ width: size, height: size, position: "relative" }} aria-label="Pablo nebula">
      <div style={{
        position: "absolute", inset: 0, borderRadius: "50%",
        background: `radial-gradient(circle at 50% 50%, ${c.core} 0%, ${c.halo} 28%, ${c.ring} 55%, transparent 78%)`,
        filter: "blur(2px)", animation: `pablo-orb-pulse ${speed} ease-in-out infinite`,
      }} />
      <div style={{
        position: "absolute", inset: "12%", borderRadius: "50%",
        background: `radial-gradient(circle at 45% 45%, #fff 0%, ${c.core} 35%, transparent 70%)`,
        opacity: 0.85, mixBlendMode: "screen",
      }} />
      <div style={{
        position: "absolute", inset: "32%", borderRadius: "50%", background: "#fff",
        boxShadow: `0 0 ${size * 0.15}px ${c.core}`, opacity: 0.9,
      }} />
      <style>{`@keyframes pablo-orb-pulse { 0%,100% { transform: scale(1); opacity: 0.85; } 50% { transform: scale(1.05); opacity: 1; } }`}</style>
    </div>
  );
}

class NebulaErrorBoundary extends ReactComponent<{ children: RNode; fallback: RNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.warn("[PabloTerminal] Nebula crashed, using 2D fallback:", err); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

const ONBOARD_KEY = "pablo-terminal-onboarded-v2";

const TUTORIAL_PHRASES: { keyword: string; example: string }[] = [
  { keyword: "navigate",  example: "Open my voicemail" },
  { keyword: "navigate",  example: "Take me to the game" },
  { keyword: "navigate",  example: "Pull up payroll" },
  { keyword: "navigate",  example: "Show my calendar" },
  { keyword: "privacy",   example: "Pablo, privacy" },
  { keyword: "privacy",   example: "What do you know about me?" },
  { keyword: "control",   example: "Open my API keys" },
  { keyword: "control",   example: "Platform settings" },
  { keyword: "session",   example: "Log me out" },
  { keyword: "search",    example: "Search for invoices" },
  { keyword: "ask",       example: "What does the Bot Factory do?" },
];

const INTRO_GREETING =
  "Salaryman. I'm Pablo. Built my empire the long way — now I run yours. Every page, every tab, every door opens when I say so. Want me to show you how to command me, switch to text, or do we get straight to work?";

const TUTORIAL_FOLLOWUP =
  "Simple. Tap the nebula and speak. Say 'open' or 'take me to' and the destination — voicemail, payroll, the game, anything. Say 'Pablo, privacy' for your data, 'API keys' for integrations, or 'log me out' to end the session. I take you to the exact tab. No menus.";

type Mode = "voice" | "text";

function detectIntroChoice(text: string): "tutorial" | "text" | "voice" | null {
  const t = text.toLowerCase();
  if (/\b(tutorial|teach|show me how|how do i|guide|help)\b/.test(t)) return "tutorial";
  if (/\b(text|type|keyboard|chat|write|message)\b/.test(t)) return "text";
  if (/\b(speak|talk|voice|keep|continue|just|yes|sure|go|start|ready)\b/.test(t)) return "voice";
  return null;
}

// Detect explicit "switch the modality" requests during normal conversation.
// Voice is the default — only flip when the user clearly asks.
function detectModeSwitch(text: string): "text" | "voice" | null {
  const t = text.toLowerCase().trim();
  // Going to text
  if (/\b(let'?s|let us|switch to|go to|use|change to|make it|prefer)\s+(text|typing|type|keyboard|chat|writing)\b/.test(t)) return "text";
  if (/^(text mode|type mode|keyboard mode|switch to text|go to text|use text|let'?s text|i'?ll type|let me type|i want to type)\b/.test(t)) return "text";
  // Going back to voice
  if (/\b(let'?s|let us|switch to|go to|use|change to|back to)\s+(voice|talking|speaking|talk|speak)\b/.test(t)) return "voice";
  if (/^(voice mode|speak mode|switch to voice|go to voice|use voice|let'?s talk|let me talk|i want to talk|talk to me)\b/.test(t)) return "voice";
  return null;
}

type Status = "idle" | "listening" | "thinking" | "speaking";

const STATUS_LABEL: Record<Status, string> = {
  idle: "TAP TO SPEAK",
  listening: "LISTENING…",
  thinking: "THINKING…",
  speaking: "SPEAKING",
};

const STATUS_COLOR: Record<Status, string> = {
  idle: "rgb(125, 211, 252)",
  listening: "rgb(74, 222, 128)",
  thinking: "rgb(250, 204, 21)",
  speaking: "rgb(244, 114, 182)",
};

function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  if (typeof MediaRecorder === "undefined") return "";
  for (const mt of candidates) {
    try { if (MediaRecorder.isTypeSupported(mt)) return mt; } catch {}
  }
  return "";
}

async function transcribe(blob: Blob): Promise<string> {
  const fd = new FormData();
  fd.append("audio", blob, `audio.${blob.type.includes("mp4") ? "mp4" : "webm"}`);
  const res = await apiFetch("api/transcribe", { method: "POST", body: fd });
  if (!res.ok) throw new Error(`transcribe ${res.status}`);
  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}

function useNebulaSize() {
  const [size, setSize] = useState(() =>
    typeof window === "undefined"
      ? 320
      : Math.min(340, Math.max(180, Math.floor(Math.min(window.innerWidth, window.innerHeight) * 0.48)))
  );
  useEffect(() => {
    const onResize = () => {
      setSize(Math.min(340, Math.max(180, Math.floor(Math.min(window.innerWidth, window.innerHeight) * 0.48))));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

function Nebula({ status, size = 360 }: { status: Status; size?: number }) {
  // Detailed Jarvis-style core: rings, ticks, segmented arcs, scan line, hex core, data nodes.
  const breath =
    status === "speaking" ? 0.9 :
    status === "listening" ? 1.3 :
    status === "thinking" ? 2.0 :
    3.4;
  const ringDur =
    status === "thinking" ? 8 :
    status === "listening" ? 5 :
    status === "speaking" ? 4 :
    14;
  const color = STATUS_COLOR[status];
  const dim = `${color}aa`;
  const faint = `${color}55`;

  // SVG geometry in a 200×200 viewBox; rendered at any size.
  const cx = 100;
  const cy = 100;
  const rOuter = 96;
  const rInnerRing = 78;
  const rMidRing = 62;
  const rCore = 22;
  const tickCount = 60;
  const longTickEvery = 5;
  const segArcs = [
    { r: 88, gap: 18, from: 0, dur: ringDur, dir: 1 },
    { r: 72, gap: 28, from: 45, dur: ringDur * 0.7, dir: -1 },
    { r: 56, gap: 14, from: 90, dur: ringDur * 1.4, dir: 1 },
  ];
  const dataNodes = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 12;
    return { x: cx + Math.cos(a) * 88, y: cy + Math.sin(a) * 88, delay: i * 0.18 };
  });

  // Build dashed segmented arc as stroke-dasharray
  const dashFor = (r: number, gap: number) => {
    const circ = 2 * Math.PI * r;
    const seg = circ / 8;
    return `${seg - gap} ${gap}`;
  };

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Outer breathing halo (subtle, behind structure) */}
      <motion.div
        className="absolute inset-0 rounded-full"
        animate={{ scale: [1, 1.05, 1], opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: breath * 1.4, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background: `radial-gradient(circle at 50% 50%, ${faint} 0%, transparent 65%)`,
          filter: "blur(18px)",
        }}
      />

      <svg
        viewBox="0 0 200 200"
        className="absolute inset-0 w-full h-full"
        style={{ overflow: "visible" }}
      >
        <defs>
          <radialGradient id="pablo-core-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="40%" stopColor={color} stopOpacity="0.95" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="pablo-scan" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0" />
            <stop offset="50%" stopColor={color} stopOpacity="0.85" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <filter id="pablo-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer ring */}
        <circle cx={cx} cy={cy} r={rOuter} fill="none" stroke={dim} strokeWidth="0.6" opacity="0.55" />
        <circle cx={cx} cy={cy} r={rOuter - 4} fill="none" stroke={dim} strokeWidth="0.3" opacity="0.35" />

        {/* Tick marks around outer ring */}
        <g opacity="0.7">
          {Array.from({ length: tickCount }, (_, i) => {
            const a = (i / tickCount) * Math.PI * 2 - Math.PI / 2;
            const long = i % longTickEvery === 0;
            const inner = long ? rOuter - 7 : rOuter - 3.5;
            const outer = rOuter;
            return (
              <line
                key={i}
                x1={cx + Math.cos(a) * inner}
                y1={cy + Math.sin(a) * inner}
                x2={cx + Math.cos(a) * outer}
                y2={cy + Math.sin(a) * outer}
                stroke={color}
                strokeOpacity={long ? 0.85 : 0.4}
                strokeWidth={long ? 0.8 : 0.4}
              />
            );
          })}
        </g>

        {/* Inner concentric rings */}
        <circle cx={cx} cy={cy} r={rInnerRing} fill="none" stroke={dim} strokeWidth="0.5" opacity="0.5" />
        <circle cx={cx} cy={cy} r={rMidRing} fill="none" stroke={dim} strokeWidth="0.4" opacity="0.4" />

        {/* Segmented rotating arcs */}
        {segArcs.map((s, i) => (
          <motion.g
            key={i}
            style={{ transformOrigin: `${cx}px ${cy}px` }}
            animate={{ rotate: s.dir * 360 }}
            transition={{ duration: s.dur, repeat: Infinity, ease: "linear" }}
          >
            <circle
              cx={cx}
              cy={cy}
              r={s.r}
              fill="none"
              stroke={color}
              strokeOpacity={0.85}
              strokeWidth={1.1}
              strokeDasharray={dashFor(s.r, s.gap)}
              strokeLinecap="round"
              transform={`rotate(${s.from} ${cx} ${cy})`}
              filter="url(#pablo-glow)"
            />
          </motion.g>
        ))}

        {/* Crosshair reticle */}
        <g opacity="0.45" stroke={color} strokeWidth="0.4">
          <line x1={cx - rInnerRing} y1={cy} x2={cx - rMidRing - 4} y2={cy} />
          <line x1={cx + rMidRing + 4} y1={cy} x2={cx + rInnerRing} y2={cy} />
          <line x1={cx} y1={cy - rInnerRing} x2={cx} y2={cy - rMidRing - 4} />
          <line x1={cx} y1={cy + rMidRing + 4} x2={cx} y2={cy + rInnerRing} />
        </g>

        {/* Data nodes pulsing on outer ring */}
        {dataNodes.map((n, i) => (
          <motion.circle
            key={i}
            cx={n.x}
            cy={n.y}
            r={1.6}
            fill={color}
            animate={{ opacity: [0.3, 1, 0.3], r: [1.4, 2.6, 1.4] }}
            transition={{ duration: breath * 1.3, repeat: Infinity, delay: n.delay, ease: "easeInOut" }}
            filter="url(#pablo-glow)"
          />
        ))}

        {/* Hexagonal mid frame — counter rotating */}
        <motion.g
          style={{ transformOrigin: `${cx}px ${cy}px` }}
          animate={{ rotate: -360 }}
          transition={{ duration: ringDur * 2.1, repeat: Infinity, ease: "linear" }}
        >
          <polygon
            points={Array.from({ length: 6 }, (_, i) => {
              const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
              return `${cx + Math.cos(a) * 40},${cy + Math.sin(a) * 40}`;
            }).join(" ")}
            fill="none"
            stroke={color}
            strokeOpacity={0.55}
            strokeWidth={0.6}
          />
          <polygon
            points={Array.from({ length: 6 }, (_, i) => {
              const a = (i / 6) * Math.PI * 2;
              return `${cx + Math.cos(a) * 32},${cy + Math.sin(a) * 32}`;
            }).join(" ")}
            fill="none"
            stroke={color}
            strokeOpacity={0.4}
            strokeWidth={0.5}
          />
        </motion.g>

        {/* Vertical scan line sweeping across */}
        <motion.rect
          x={cx - 1}
          y={cy - rInnerRing}
          width={2}
          height={rInnerRing * 2}
          fill="url(#pablo-scan)"
          style={{ transformOrigin: `${cx}px ${cy}px` }}
          animate={{ rotate: 360 }}
          transition={{ duration: ringDur * 0.9, repeat: Infinity, ease: "linear" }}
          opacity={0.7}
        />

        {/* Pulsing core */}
        <motion.circle
          cx={cx}
          cy={cy}
          r={rCore}
          fill="url(#pablo-core-grad)"
          animate={{ r: [rCore * 0.92, rCore * 1.08, rCore * 0.92], opacity: [0.85, 1, 0.85] }}
          transition={{ duration: breath, repeat: Infinity, ease: "easeInOut" }}
          filter="url(#pablo-glow)"
        />
        <motion.circle
          cx={cx}
          cy={cy}
          r={5}
          fill="#ffffff"
          animate={{ opacity: [0.85, 1, 0.85], r: [4.5, 6.2, 4.5] }}
          transition={{ duration: breath * 0.7, repeat: Infinity, ease: "easeInOut" }}
        />
      </svg>
    </div>
  );
}

export default function PabloTerminal() {
  const { isAuthenticated, isLoading } = useAuth();
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Send straight to the login flow with returnTo=/pablo so we come back here.
      window.location.href = `/api/login?returnTo=${encodeURIComponent("/pablo")}`;
    }
  }, [isLoading, isAuthenticated]);
  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black text-zinc-500 font-mono text-xs tracking-[0.3em]">
        BOOTING…
      </div>
    );
  }
  if (!isAuthenticated) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black text-zinc-500 font-mono text-xs tracking-[0.3em]">
        REDIRECTING TO LOGIN…
      </div>
    );
  }
  return <PabloTerminalAuthed />;
}

function PabloTerminalAuthed() {
  const [, navigate] = useLocation();
  const { logout } = useAuth();
  const nebulaSize = useNebulaSize();
  const [status, setStatus] = useState<Status>("idle");
  const [transcript, setTranscript] = useState<string>("");
  const [reply, setReply] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [history, setHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [mode, setMode] = useState<Mode>("voice");
  const [textInput, setTextInput] = useState("");
  const [showIntro, setShowIntro] = useState<boolean>(() => {
    try { return localStorage.getItem(ONBOARD_KEY) !== "1"; } catch { return false; }
  });
  const [showTutorialCard, setShowTutorialCard] = useState(false);
  const introGreetedRef = useRef(false);
  const awaitingIntroChoiceRef = useRef(false);
  const autoListenRef = useRef(false);
  const autoStartedRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const ttsRef = useRef<{ cancel: () => void } | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try { recorderRef.current.stop(); } catch {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch {}
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    recorderRef.current = null;
  }, []);

  useEffect(() => () => { cleanup(); ttsRef.current?.cancel(); }, [cleanup]);

  const persistOnboarded = useCallback(() => {
    try { localStorage.setItem(ONBOARD_KEY, "1"); } catch {}
  }, []);

  const speakLine = useCallback((text: string, after?: () => void) => {
    setStatus("speaking");
    setReply(text);
    ttsRef.current?.cancel();
    const done = () => {
      ttsRef.current = null;
      setStatus("idle");
      after?.();
    };
    ttsRef.current = speakWithTTS(text, done, done);
  }, []);

  const chooseTutorial = useCallback(() => {
    awaitingIntroChoiceRef.current = false;
    persistOnboarded();
    setShowIntro(false);
    setMode("voice");
    setShowTutorialCard(true);
    speakLine(TUTORIAL_FOLLOWUP, () => { autoListenRef.current = true; });
  }, [persistOnboarded, speakLine]);

  const chooseTextMode = useCallback(() => {
    awaitingIntroChoiceRef.current = false;
    persistOnboarded();
    setShowIntro(false);
    setShowTutorialCard(false);
    setMode("text");
    ttsRef.current?.cancel();
    cleanup();
    setStatus("idle");
    setReply("Text mode on. Type what you need.");
  }, [persistOnboarded, cleanup]);

  const chooseKeepTalking = useCallback(() => {
    awaitingIntroChoiceRef.current = false;
    persistOnboarded();
    setShowIntro(false);
    setShowTutorialCard(false);
    setMode("voice");
    ttsRef.current?.cancel();
    setStatus("idle");
    autoListenRef.current = true;
  }, [persistOnboarded]);

  // Auto-speak intro on first visit and queue listening for the user's answer.
  useEffect(() => {
    if (!showIntro || introGreetedRef.current) return;
    introGreetedRef.current = true;
    setStatus("speaking");
    setReply(INTRO_GREETING);
    ttsRef.current?.cancel();
    const done = () => {
      ttsRef.current = null;
      setStatus("idle");
      awaitingIntroChoiceRef.current = true;
      autoListenRef.current = true;
    };
    ttsRef.current = speakWithTTS(INTRO_GREETING, done, done);
  }, [showIntro]);

  const speak = useCallback((text: string) => new Promise<void>((resolve) => {
    setStatus("speaking");
    ttsRef.current?.cancel();
    ttsRef.current = speakWithTTS(text, () => { ttsRef.current = null; resolve(); }, () => { ttsRef.current = null; resolve(); });
  }), []);

  const sendToPablo = useCallback(async (text: string) => {
    // Intercept the user's first answer to the intro question.
    if (awaitingIntroChoiceRef.current) {
      const choice = detectIntroChoice(text);
      if (choice === "tutorial") { chooseTutorial(); return; }
      if (choice === "text")     { chooseTextMode(); return; }
      if (choice === "voice")    { chooseKeepTalking(); return; }
      // Fall through: treat as a real request.
      awaitingIntroChoiceRef.current = false;
      persistOnboarded();
      setShowIntro(false);
    }

    // Honor explicit "let's text" / "let's talk" mode-switch requests.
    const switchTo = detectModeSwitch(text);
    if (switchTo === "text") {
      chooseTextMode();
      setReply("Text mode on. Type away.");
      return;
    }
    if (switchTo === "voice") {
      chooseKeepTalking();
      speakLine("Voice on. Talk to me.");
      return;
    }

    setStatus("thinking");
    setReply("");
    try {
      const res = await apiFetch("api/chat/pablo/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text, history: history.slice(-10) }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`pablo ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
      }
      type PabloAction =
        | { kind: "navigate"; path: string }
        | { kind: "logout" }
        | { kind: "search"; query: string }
        | { kind: "external"; url: string };
      const data = (await res.json()) as { say: string; action: PabloAction | null };
      setReply(data.say);
      setHistory((h) => [...h, { role: "user", content: text }, { role: "assistant", content: data.say }]);
      if (mode === "voice") {
        await speak(data.say);
      }
      const action = data.action;
      if (action?.kind === "navigate") {
        setTimeout(() => navigate(action.path), 300);
      } else if (action?.kind === "logout") {
        // Reset Pablo's loop: wipe onboarding + history so next session starts fresh.
        try { localStorage.removeItem(ONBOARD_KEY); } catch {}
        setHistory([]);
        setReply("");
        setTranscript("");
        setTimeout(() => { try { logout(); } catch { window.location.href = "/"; } }, 400);
      } else if (action?.kind === "search") {
        setTimeout(() => navigate(`/?q=${encodeURIComponent(action.query)}`), 300);
      } else if (action?.kind === "external") {
        try { window.open(action.url, "_blank", "noopener"); } catch {}
        setStatus("idle");
        if (mode === "voice") autoListenRef.current = true;
      } else {
        setStatus("idle");
        if (mode === "voice") autoListenRef.current = true;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Pablo] command failed:", msg);
      setError(`Pablo hit a snag: ${msg}`);
      setStatus("idle");
      if (mode === "voice") autoListenRef.current = true;
    }
  }, [history, navigate, speak, speakLine, mode, chooseTutorial, chooseTextMode, chooseKeepTalking, persistOnboarded, logout]);

  const submitText = useCallback(() => {
    const t = textInput.trim();
    if (!t) return;
    setTextInput("");
    setTranscript(t);
    void sendToPablo(t);
  }, [textInput, sendToPablo]);

  const startListening = useCallback(async () => {
    setError("");
    setReply("");
    setTranscript("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        cleanup();
        if (blob.size < 1000) { setStatus("idle"); return; }
        try {
          setStatus("thinking");
          const text = await transcribe(blob);
          if (!text) { setStatus("idle"); return; }
          setTranscript(text);
          await sendToPablo(text);
        } catch (err) {
          console.error("[Pablo] transcribe failed:", err);
          setError("Couldn't hear that.");
          setStatus("idle");
        }
      };

      // VAD: stop on ~1.4s of silence after some speech
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      let lastSoundAt = Date.now();
      let everSpoke = false;
      const SILENCE_MS = 1400;
      const MAX_MS = 12000;
      const startedAt = Date.now();
      const loop = () => {
        if (!analyserRef.current) return;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        if (rms > 0.025) { lastSoundAt = Date.now(); everSpoke = true; }
        const now = Date.now();
        if ((everSpoke && now - lastSoundAt > SILENCE_MS) || now - startedAt > MAX_MS) {
          if (recorderRef.current?.state === "recording") {
            try { recorderRef.current.stop(); } catch {}
          }
          return;
        }
        rafRef.current = requestAnimationFrame(loop);
      };

      recorder.start();
      setStatus("listening");
      rafRef.current = requestAnimationFrame(loop);
    } catch (err) {
      console.error("[Pablo] mic error:", err);
      setError("Microphone access required.");
      setStatus("idle");
    }
  }, [cleanup, sendToPablo]);

  const stopAll = useCallback(() => {
    ttsRef.current?.cancel();
    cleanup();
    setStatus("idle");
  }, [cleanup]);

  const onOrbClick = useCallback(() => {
    if (mode === "text") return;
    if (status === "idle") startListening();
    else stopAll();
  }, [status, startListening, stopAll, mode]);

  // Hands-free conversation loop: whenever we land on idle and a hop is
  // queued, start listening again automatically (voice mode only).
  useEffect(() => {
    if (mode !== "voice") return;
    if (status !== "idle") return;
    if (!autoListenRef.current) return;
    autoListenRef.current = false;
    const t = setTimeout(() => { startListening(); }, 350);
    return () => clearTimeout(t);
  }, [status, startListening, mode]);

  // On first mount: if there's no intro to play, start listening right away.
  useEffect(() => {
    if (autoStartedRef.current) return;
    autoStartedRef.current = true;
    if (!showIntro && mode === "voice") autoListenRef.current = true;
  }, [showIntro, mode]);

  const switchToText = useCallback(() => chooseTextMode(), [chooseTextMode]);
  const switchToVoice = useCallback(() => chooseKeepTalking(), [chooseKeepTalking]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center overflow-y-auto"
      style={{
        background: "radial-gradient(circle at 50% 40%, #0a0a14 0%, #000 70%)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      {/* Minimal top header — logo + mode toggle + exit */}
      <header className="w-full flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 shrink-0">
        <Link href="/" className="flex items-center gap-2 sm:gap-2.5 group min-w-0">
          <PicassoLogo size={20} gap={2} glow />
          <span className="font-mono text-[10px] sm:text-[11px] tracking-[0.2em] sm:tracking-[0.25em] text-zinc-500 group-hover:text-zinc-300 transition-colors truncate">
            SALARYMAN
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <HummingBirdAttachStrip toolKey="pablo-terminal" buttonStyle="icon" pickerTitle="ATTACH AUDIO TO COMMAND" />
          <Link
            href="/"
            className="text-zinc-600 hover:text-zinc-300 active:text-zinc-200 transition-colors p-1 -m-1 shrink-0"
            aria-label="Exit terminal"
            data-testid="pablo-terminal-exit"
          >
            <X className="w-5 h-5 sm:w-4 sm:h-4" />
          </Link>
        </div>
      </header>

      {/* Pure nebula — fills the page. No commentary. Just tap and speak. */}
      <div className="flex-1 flex items-center justify-center w-full select-none">
        <button
          onClick={onOrbClick}
          className="relative outline-none focus:ring-2 focus:ring-purple-500/40 rounded-full"
          aria-label={STATUS_LABEL[status]}
          data-testid="pablo-orb"
        >
          <div style={{ width: nebulaSize, height: nebulaSize }}>
            <NebulaErrorBoundary fallback={<NebulaOrb2D status={status} size={nebulaSize} />}>
              <ReactSuspense fallback={<NebulaOrb2D status={status} size={nebulaSize} />}>
                <PabloNebula3D status={status} size={nebulaSize} />
              </ReactSuspense>
            </NebulaErrorBoundary>
          </div>
        </button>
      </div>

      {/* Tiny status pill at the bottom — only thing on the page besides the nebula */}
      <div className="pb-6 sm:pb-8 flex items-center gap-2 text-[10px] font-mono tracking-[0.3em] shrink-0" style={{ color: STATUS_COLOR[status] }}>
        {status === "listening" ? <Mic className="w-3 h-3" /> : status === "idle" ? <MicOff className="w-3 h-3" /> : null}
        <span>{STATUS_LABEL[status]}</span>
      </div>

      {/* Text-mode input — only shown when user explicitly switches to text */}
      {mode === "text" && (
        <form
          onSubmit={(e) => { e.preventDefault(); submitText(); }}
          className="absolute bottom-12 left-1/2 -translate-x-1/2 w-full max-w-xl px-4 flex items-center gap-2"
          data-testid="pablo-text-form"
        >
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Type a command…"
            className="flex-1 bg-zinc-950/70 border border-zinc-800 focus:border-purple-500/60 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition-colors"
            autoFocus
            data-testid="pablo-text-input"
          />
          <button
            type="submit"
            disabled={!textInput.trim() || status === "thinking"}
            className="px-3 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white transition-colors"
            aria-label="Send"
            data-testid="pablo-text-send"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      )}

      {/* Silent error indicator — tiny, doesn't interrupt the nebula */}
      {error && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[9px] font-mono text-red-400/60 tracking-wider">{error}</div>
      )}
    </div>
  );
}
