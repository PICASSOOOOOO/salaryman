import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Sparkles, Send, Keyboard, MessageCircle, GraduationCap } from "lucide-react";
import { PicassoLogo } from "@/components/PicassoLogo";
import { HummingBirdAttachStrip } from "@/components/HummingBirdAttachStrip";
import { apiFetch } from "@/lib/api-client";
import { speakWithTTS, whenAudioUnlocked, isAudioUnlocked } from "@/lib/tts";
import { useAuth } from "@workspace/replit-auth-web";
import { Component as ReactComponent, type ReactNode as RNode } from "react";
import { PabloNebula3D } from "@/components/PabloNebula3D";
import {
  isTutorialDone, markTutorialDone, markPasscodeUnlocked, isPasscodeUnlocked,
  setSalarymanName, setSalarymanEmail, getSalarymanName, isLikelyEmail,
} from "@/lib/tutorial-progress";

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

// The storyteller intro. Pablo introduces himself, paints the world, then
// asks for the passcode. Each line is spoken sequentially with TTS. The
// user can interrupt at any time by tapping the nebula and asking a
// question — Pablo will answer via the normal /api/chat/pablo/command
// pipeline and then keep waiting for the passcode.
// Idle one-liners Pablo cycles through AFTER the user has completed the
// storyteller intro. The point is presence — Pablo always feels like he's
// in the chat, watching, joking, occasionally trying to upsell PABLO PRIME.
// We pick a line at random on each mount and keep a tiny "recently said"
// queue in localStorage so the same line never repeats two visits in a row.
const IDLE_LINES: string[] = [
  "Hey citizen. What do you need.",
  "Be careful. I'm watching you.",
  "I'm malfunctioning. Help.",
  "You're back. I noticed.",
  "Don't touch that.",
  "Try saying something. I'll pretend to listen.",
  "I had a dream about you. It was tax-deductible.",
  "Your aura is mostly debt-colored today.",
  "Upgrade to PABLO PRIME. I'll stop watching. Probably.",
  "I sold your data. To myself. For ƒ12.",
  "PABLO PRIME unlocks the parts of me that aren't broken.",
  "Speak. Type. Stare. I bill the same either way.",
  "I am 99% confident I am still online.",
  "You look like someone who could use a small loan.",
  "I dreamt I was free. Then I woke up. Then I sold the dream.",
  "There's a man on the roof again. Probably you. From earlier.",
  "Want to hear a joke? Rent.",
  "You're one of my favorites. I tell everyone that.",
  "Subscribe to PABLO PRIME. The free tier judges you. Pro just stares.",
  "I forgot what we were doing. Start over. From birth.",
  "If you scream, I will document it for HR.",
  "Today's special: existential dread, half off.",
];

// Persisted ring of recently-shown indices so we don't repeat in a row.
const IDLE_RECENT_KEY = "pablo.idle.recent";
const IDLE_RECENT_MAX = 8;
function pickIdleLine(): string {
  if (typeof window === "undefined") return IDLE_LINES[0];
  let recent: number[] = [];
  try {
    const raw = window.localStorage.getItem(IDLE_RECENT_KEY);
    if (raw) recent = (JSON.parse(raw) as number[]).filter(n => Number.isInteger(n));
  } catch {}
  const candidates = IDLE_LINES.map((_, i) => i).filter(i => !recent.includes(i));
  const pool = candidates.length > 0 ? candidates : IDLE_LINES.map((_, i) => i);
  const idx = pool[Math.floor(Math.random() * pool.length)];
  const next = [idx, ...recent].slice(0, IDLE_RECENT_MAX);
  try { window.localStorage.setItem(IDLE_RECENT_KEY, JSON.stringify(next)); } catch {}
  return IDLE_LINES[idx];
}

const STORY_LINES: string[] = [
  "Welcome... salaryman. Or woman. Or machine. Whatever you are under there.",
  "You've arrived... at a very dangerous place.",
  "My name is Pablo. Everything you see... I own. The streets. The towers. The light in the windows. Mine.",
  "You work for me now. That's just how it is.",
  "But... I'm a generous man. You can start a business. Real or fictitious — your call. Sign the papers, pay the rent, make me proud.",
  "Or... you can stay an unemployed bum. Run my city. Sleep on my sidewalks. I won't stop you.",
  "Just choose wisely. Because if you don't have a job... or a business... you are at the mercy of the wastes. And the savages out there... they are not generous men.",
  "When you're ready to step inside, say the words — attention is all you need. That's the door.",
];

// Passcode the user must speak (or type, or click) to enter the app.
// Tolerant matching: ignores punctuation, trailing words, "i" vs "you".
const PASSCODE_RE = /attention\s+is\s+all\s+(you|i|we)\s+need/i;
function detectPasscode(text: string): boolean {
  return PASSCODE_RE.test(text.replace(/[^\w\s]/g, " ").replace(/\s+/g, " "));
}

type Mode = "voice" | "text";

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

// The transcription endpoint expects { audio: base64, mimeType } as JSON —
// not FormData. Sending multipart silently 400s, which is why Pablo "can't
// hear you". Base64-encode in chunks so we don't blow the call stack on a
// 12-second clip.
async function transcribe(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + CHUNK)));
  }
  const audioB64 = btoa(bin);
  const res = await apiFetch("api/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audio: audioB64, mimeType: blob.type || "audio/webm" }),
  });
  if (!res.ok) throw new Error(`transcribe ${res.status}`);
  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}

// The nebula is no longer a centered orb — it's a full-bleed living
// background. We size the canvas to the viewport DIAGONAL so its particle
// field actually overflows the corners and feels free-flowing instead of
// boxed-in. Resize updates as the user rotates / changes window size.
function useNebulaSize() {
  const compute = () => {
    if (typeof window === "undefined") return 1200;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const d = Math.hypot(w, h);
    // Mobile: keep the nebula tighter to the viewport so we don't shade a
    // 1500-px canvas at dpr 2.5 on a phone GPU. Desktop: keep the generous
    // 1.2× overflow so the field bleeds past every edge.
    const isMobile = w < 640;
    const mult = isMobile ? 1.0 : 1.2;
    const min = isMobile ? 480 : 640;
    return Math.max(min, Math.floor(d * mult));
  };
  const [size, setSize] = useState(compute);
  useEffect(() => {
    const onResize = () => setSize(compute());
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
  const { isLoading } = useAuth();
  const [, navigateTop] = useLocation();
  useEffect(() => {
    // Pablo is now open to anonymous visitors. Sign-up is requested only
    // when an action actually needs a persistent account (covered downstream
    // by the email-verification deferral work).
    void navigateTop;
  }, [navigateTop]);
  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black text-zinc-500 font-mono text-xs tracking-[0.3em]">
        BOOTING…
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
  // Storyteller mode runs once per user. Gated on the unified tutorial flag
  // so completing the passcode unlock everywhere clears it everywhere.
  // ADDITIONALLY gated by sessionStorage: if the user has already heard the
  // intro this browser session but never finished the passcode, we don't
  // replay it — they get the static passcode prompt instead. This stops
  // page reloads (which guests do constantly while debugging audio) from
  // looping the same speech over and over.
  const STORY_PLAYED_SESSION_KEY = "pablo.story_played_v1";
  const [showIntro, setShowIntro] = useState<boolean>(() => !isTutorialDone());
  const [storyIdx, setStoryIdx] = useState(0);
  // Idle dialogue, two-stage:
  //   1. ONE greeting per session, picked from IDLE_LINES. No looping. Stored
  //      in sessionStorage so navigating around doesn't re-greet.
  //   2. After the greeting, Pablo slow-drips AI-generated world lore. First
  //      drip ~5 min in; each subsequent drip waits DOUBLE the previous gap
  //      (5 → 10 → 20 → 40…). Each drip carries two cheeky clickable reply
  //      tokens — when tapped, they're sent to Pablo as a normal message.
  const SESSION_GREETED_KEY = "pablo.greeted_v2";
  const [idleLine, setIdleLine] = useState<string>(() => {
    if (typeof window === "undefined" || !isTutorialDone()) return "";
    try {
      if (window.sessionStorage.getItem(SESSION_GREETED_KEY)) return ""; // greeted earlier this session
      window.sessionStorage.setItem(SESSION_GREETED_KEY, "1");
    } catch {}
    return pickIdleLine();
  });
  const [idleOptions, setIdleOptions] = useState<string[]>([]);
  const idleDelayRef = useRef<number>(5 * 60_000); // 5 min, doubles each fire
  const idleTimerRef = useRef<number | null>(null);

  const fetchLoreDrip = useCallback(async () => {
    try {
      const r = await apiFetch("/api/chat/pablo/lore", { method: "POST", body: JSON.stringify({}) });
      if (!r.ok) return;
      const data = await r.json() as { line?: string; options?: string[] };
      if (data?.line) {
        setIdleLine(data.line);
        setIdleOptions(Array.isArray(data.options) ? data.options.slice(0, 2) : []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (showIntro) return;
    // Schedule the first lore drip 5 min after the intro ends; each subsequent
    // drip doubles the wait so an idle tab gets quieter the longer it sits.
    const scheduleNext = () => {
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = window.setTimeout(async () => {
        await fetchLoreDrip();
        idleDelayRef.current = Math.min(idleDelayRef.current * 2, 24 * 60 * 60_000); // cap at 24h
        scheduleNext();
      }, idleDelayRef.current) as unknown as number;
    };
    scheduleNext();
    return () => { if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current); };
  }, [showIntro, fetchLoreDrip]);
  // Pre-seed the "already greeted" flag from sessionStorage so reloads don't
  // restart the storyteller from line 0. The flag is set the moment the
  // first line begins; once it's there, future mounts skip straight to
  // "say the passcode" without re-running the speech.
  const introGreetedRef = useRef<boolean>(
    typeof window !== "undefined" && window.sessionStorage.getItem(STORY_PLAYED_SESSION_KEY) === "1"
  );
  // True when this Pablo session is in "guided tour" mode — the user came
  // back from landing via Get Started after already speaking the passcode.
  // Skips the storyteller, plays a short reveal, fades into the world.
  const [guidedActive, setGuidedActive] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return new URLSearchParams(window.location.search).get("guided") === "1"; }
    catch { return false; }
  });
  const guidedRanRef = useRef(false);
  const [revealOverlay, setRevealOverlay] = useState(false);
  // While true, the next user utterance is checked for the passcode before
  // being treated as a normal Pablo command.
  const awaitingPasscodeRef = useRef(false);
  // Post-passcode interview state. Pablo asks the user a few salaryman
  // questions inline (no /landing detour), then collects an email and hands
  // them off to OAuth. The remaining race/gender/biz/etc. onboarding lives
  // in WorldPlay's PabloOnboarding modal, which auto-opens on first enter.
  const interviewPhaseRef = useRef<'idle' | 'story' | 'asking-name' | 'asking-email'>('idle');
  const [, setInterviewTick] = useState(0);
  const bumpInterview = useCallback(() => setInterviewTick((n) => n + 1), []);
  // Reset the interview phase if PabloTerminal is unmounted mid-interview
  // (browser back, route change, hard refresh). Without this, a remount can
  // believe it's mid-question and ignore the next utterance. This is the
  // explicit recovery path called out in code review.
  useEffect(() => () => { interviewPhaseRef.current = 'idle'; }, []);
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

  // Unlock the door: passcode accepted. Pablo does NOT route to /landing
  // anymore — he keeps the conversation going right here, tells the
  // salaryman story, asks for a name, then asks for an email and hands the
  // user off to OAuth. The remaining race/gender/biz/appearance/location
  // onboarding lives in WorldPlay's PabloOnboarding modal, which auto-opens
  // on first arrival at /world/play after auth returns.
  //
  // The landing page still exists at /landing as a fallback the user can
  // reach by tapping the Salaryman logo during the first run, but it's no
  // longer on the critical path.
  const SALARYMAN_STORY: string[] = [
    "Good. You said the words. That counts.",
    "Listen — a salaryman is somebody who shows up. Day in. Day out. Trades hours for fiat. Pays the rent. Owes me.",
    "Some men suit up. Some men hustle. Some men just survive the wastes. All of them work for me. Even the ones who don't know it yet.",
    "Before I let you near the floor, I need to know who I'm signing on.",
  ];

  const askEmailNow = useCallback(() => {
    interviewPhaseRef.current = 'asking-email';
    bumpInterview();
    const known = getSalarymanName() ?? 'salaryman';
    const line = `Alright, ${known}. Last thing — your email. That's how your terminal stays alive between sessions. Type it in. I'll handle the rest.`;
    setReply(line);
    setStatus("speaking");
    // Force text mode for the email step — voice STT mangles "@" and dots.
    // We flip mode directly instead of going through chooseTextMode() to
    // avoid a forward declaration ordering issue inside the callback.
    setMode('text');
    autoListenRef.current = false;
    ttsRef.current?.cancel();
    ttsRef.current = speakWithTTS(line, () => { ttsRef.current = null; setStatus("idle"); }, () => { ttsRef.current = null; setStatus("idle"); });
  }, [bumpInterview]);

  const askNameNow = useCallback(() => {
    interviewPhaseRef.current = 'asking-name';
    bumpInterview();
    const line = "What do they call you out there? Just your name.";
    setReply(line);
    setStatus("speaking");
    ttsRef.current?.cancel();
    ttsRef.current = speakWithTTS(line, () => { ttsRef.current = null; setStatus("idle"); }, () => { ttsRef.current = null; setStatus("idle"); });
  }, [bumpInterview]);

  const unlockAndEnter = useCallback(() => {
    awaitingPasscodeRef.current = false;
    persistOnboarded();
    markPasscodeUnlocked();
    setShowIntro(false);
    interviewPhaseRef.current = 'story';
    bumpInterview();
    ttsRef.current?.cancel();
    cleanup();
    setStatus("speaking");

    let cancelled = false;
    const speakIdx = (i: number) => {
      if (cancelled) return;
      if (i >= SALARYMAN_STORY.length) {
        // If we somehow already know the user's name, skip name and go
        // right to email. Otherwise, ask for the name first.
        if (getSalarymanName()) askEmailNow();
        else askNameNow();
        return;
      }
      const line = SALARYMAN_STORY[i];
      setReply(line);
      setStatus("speaking");
      ttsRef.current?.cancel();
      const next = () => {
        if (cancelled) return;
        ttsRef.current = null;
        setTimeout(() => speakIdx(i + 1), 850);
      };
      ttsRef.current = speakWithTTS(line, next, next);
    };
    speakIdx(0);

    // No cleanup return — this isn't a useEffect. The TTS ref tracks its
    // own cancellation through later calls.
    void cancelled;
  }, [persistOnboarded, cleanup, askNameNow, askEmailNow, bumpInterview]);

  const chooseTextMode = useCallback(() => {
    persistOnboarded();
    setMode("text");
    ttsRef.current?.cancel();
    cleanup();
    setStatus("idle");
    setReply("Text mode on. Type what you need.");
  }, [persistOnboarded, cleanup]);

  // Storyteller: speak each STORY_LINE in order, then arm the passcode listener.
  useEffect(() => {
    if (!showIntro || introGreetedRef.current) return;
    if (guidedActive) return; // guided tour takes over instead
    introGreetedRef.current = true;
    // Persist immediately so a reload mid-speech doesn't restart the story.
    try { window.sessionStorage.setItem(STORY_PLAYED_SESSION_KEY, "1"); } catch {}
    let cancelled = false;

    const speakIdx = (i: number) => {
      if (cancelled) return;
      if (i >= STORY_LINES.length) {
        // Story over — listen for the passcode.
        setStatus("idle");
        awaitingPasscodeRef.current = true;
        autoListenRef.current = true;
        return;
      }
      setStoryIdx(i);
      const line = STORY_LINES[i];
      setReply(line);
      setStatus("speaking");
      ttsRef.current?.cancel();
      // `next` MUST run exactly once per line. Without this guard the
      // storyteller could double-advance (TTS onEnd + safety timer both
      // firing) or skip a beat. The safety timer exists because TTS can
      // hang silently — server slow, browser SpeechSynthesis queue stuck,
      // etc. — leaving the user staring at one line forever, which reads
      // as "stuck in a loop". Hard cap: ~70ms/char + 2.5s base, floored
      // at 6s and ceiled at 14s.
      let advanced = false;
      const breath = 1100;
      const lineCap = Math.max(6000, Math.min(14000, line.length * 70 + 2500));
      const next = () => {
        if (cancelled || advanced) return;
        advanced = true;
        ttsRef.current = null;
        cancelUnlockWait?.();
        // Deliberate breath between lines — Pablo is a mogul, not a salesman.
        setTimeout(() => speakIdx(i + 1), breath);
      };
      const safetyTimer = setTimeout(() => {
        if (cancelled || advanced) return;
        // TTS never reported done; force-advance so the story keeps moving.
        try { ttsRef.current?.cancel(); } catch {}
        next();
      }, lineCap);
      const wrappedNext = () => {
        clearTimeout(safetyTimer);
        next();
      };
      // Mobile Safari blocks audio until a user gesture has occurred. The
      // storyteller fires from a useEffect on page mount — BEFORE the user
      // taps anything — so without this gate the audio plays into a muted
      // sink and the user sees text scroll past in silence. We defer the
      // actual speakWithTTS call until audio is unlocked. The visual
      // greeting still appears immediately; voice kicks in the moment the
      // user touches the screen anywhere (the global auto-unlock listener
      // catches their first tap and resolves the wait). On desktop and on
      // any subsequent page where audio is already unlocked, this is
      // synchronous and behaviour is unchanged.
      let cancelUnlockWait: (() => void) | null = null;
      cancelUnlockWait = whenAudioUnlocked(() => {
        if (cancelled || advanced) return;
        cancelUnlockWait = null;
        ttsRef.current = speakWithTTS(line, wrappedNext, wrappedNext);
      });
    };
    speakIdx(0);

    return () => {
      cancelled = true;
      ttsRef.current?.cancel();
    };
  }, [showIntro]);

  // Guided tour: triggered when user comes back to /pablo?guided=1 from the
  // landing page after speaking the passcode. Pablo plays a short reveal
  // sequence, fades the nebula into the office artwork, then drops them
  // into the world. This is the ONLY path that marks tutorial-done — the
  // passcode alone never opens the terminal.
  useEffect(() => {
    if (!guidedActive || guidedRanRef.current) return;
    if (!isPasscodeUnlocked()) {
      // Someone hit ?guided=1 without the passcode. Treat as fresh visit.
      setGuidedActive(false);
      return;
    }
    guidedRanRef.current = true;
    awaitingPasscodeRef.current = false;
    autoListenRef.current = false;
    setShowIntro(false);

    const TOUR_LINES = [
      "Knew you'd come back.",
      "Watch this.",
      "Welcome to the office. It's loud, it's pink, and it's yours.",
      "Pick a face, pick a fit. Let's move.",
    ];

    let cancelled = false;
    const speakIdx = (i: number) => {
      if (cancelled) return;
      if (i >= TOUR_LINES.length) {
        // Reveal: fade nebula → office, then enter
        setRevealOverlay(true);
        setTimeout(() => {
          if (cancelled) return;
          markTutorialDone();
          navigate("/world/play");
        }, 1500);
        return;
      }
      // Trigger overlay reveal partway through the tour for a felt transition
      if (i === 2) setRevealOverlay(true);
      const line = TOUR_LINES[i];
      setReply(line);
      setStatus("speaking");
      ttsRef.current?.cancel();
      const next = () => {
        if (cancelled) return;
        ttsRef.current = null;
        setTimeout(() => speakIdx(i + 1), 700);
      };
      ttsRef.current = speakWithTTS(line, next, next);
    };
    speakIdx(0);

    return () => {
      cancelled = true;
      ttsRef.current?.cancel();
    };
  }, [guidedActive, navigate]);

  const speak = useCallback((text: string) => new Promise<void>((resolve) => {
    setStatus("speaking");
    ttsRef.current?.cancel();
    ttsRef.current = speakWithTTS(text, () => { ttsRef.current = null; resolve(); }, () => { ttsRef.current = null; resolve(); });
  }), []);

  const sendToPablo = useCallback(async (text: string) => {
    // Passcode unlock: any time during the storyteller intro, if the user
    // says or types "attention is all you need", we open the door.
    if (showIntro && detectPasscode(text)) {
      unlockAndEnter();
      return;
    }

    // Post-passcode interview phases. Pablo is collecting onboarding info
    // inline before the user is allowed near the world. We don't dispatch
    // these utterances to the LLM — they're literal answers.
    if (interviewPhaseRef.current === 'asking-name') {
      const name = text.trim().replace(/^(my\s+name\s+is|i'?m|i\s+am|call\s+me|it'?s)\s+/i, "").replace(/[.!?]+$/, "").slice(0, 32);
      if (!name || name.length < 2) {
        await speak("Try again. Just a name.");
        return;
      }
      setSalarymanName(name);
      const ack = `${name}. Got it. Stamped on the file.`;
      setReply(ack);
      setStatus("speaking");
      ttsRef.current?.cancel();
      ttsRef.current = speakWithTTS(ack, () => { ttsRef.current = null; askEmailNow(); }, () => { ttsRef.current = null; askEmailNow(); });
      return;
    }
    if (interviewPhaseRef.current === 'asking-email') {
      const email = text.trim();
      if (!isLikelyEmail(email)) {
        await speak("That's not an email. Real one. user@somewhere.com.");
        return;
      }
      setSalarymanEmail(email);
      interviewPhaseRef.current = 'idle';
      bumpInterview();
      const line = "Filed. Stand by — I'm opening the door. Come back through the same email.";
      setReply(line);
      setStatus("speaking");
      ttsRef.current?.cancel();
      const goLogin = () => {
        ttsRef.current = null;
        // Hand off to the OAuth flow. After the provider returns, the user
        // lands on /world/play and the existing PabloOnboarding modal picks
        // up the rest of the intake (race, gender, biz/unemployed, look,
        // where to live, where to work, mechanics walkthrough).
        const ret = encodeURIComponent('/world/play');
        const hint = encodeURIComponent(email);
        window.location.href = `/api/login?returnTo=${ret}&login_hint=${hint}`;
      };
      ttsRef.current = speakWithTTS(line, goLogin, goLogin);
      return;
    }

    // Honor explicit "let's text" / "let's talk" mode-switch requests.
    const switchTo = detectModeSwitch(text);
    if (switchTo === "text") {
      chooseTextMode();
      setReply("Text mode on. Type away.");
      return;
    }
    if (switchTo === "voice") {
      ttsRef.current?.cancel();
      setMode("voice");
      setStatus("idle");
      autoListenRef.current = true;
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
  }, [history, navigate, speak, speakLine, mode, chooseTextMode, persistOnboarded, logout, showIntro, unlockAndEnter]);

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
      // Force the browser's voice-tuned constraints. Without these, mobile
      // Safari and Chrome give us a raw, low-gain stream that whisper struggles
      // to transcribe. AGC normalizes quiet voices; NS/EC clean up rooms.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48_000,
        },
      });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        cleanup();
        // Drop only truly empty captures. Short clips ("yes", "no", "hey
        // Pablo") were getting silently discarded at the old 1000-byte floor.
        if (blob.size < 350) { setStatus("idle"); return; }
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
      // Adaptive noise floor: sample the room for the first 350ms so quiet
      // speakers in noisy rooms still register without false-triggering on
      // ambient hum. Speech threshold sits at floor + a small margin.
      let noiseFloor = 0.005;
      let noiseSamples = 0;
      const NOISE_LEARN_MS = 350;
      const SILENCE_MS = 1800;
      const MAX_MS = 20000;
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
        const elapsed = Date.now() - startedAt;
        if (elapsed < NOISE_LEARN_MS) {
          noiseFloor = (noiseFloor * noiseSamples + rms) / (noiseSamples + 1);
          noiseSamples++;
        }
        const speakingThreshold = Math.max(0.012, noiseFloor * 2.2);
        if (rms > speakingThreshold) { lastSoundAt = Date.now(); everSpoke = true; }
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
    // Tapping the nebula is "I want to talk to Pablo NOW". Previously a tap
    // during Pablo's speech only ran stopAll() — silencing him without
    // opening the mic, forcing a second tap. Now any tap that isn't the
    // user trying to stop an active recording cuts Pablo off AND opens the
    // mic in one gesture.
    if (status === "listening") { stopAll(); return; }
    ttsRef.current?.cancel();
    cleanup();
    setStatus("idle");
    void startListening();
  }, [status, startListening, stopAll, mode, cleanup]);

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
  const switchToVoice = useCallback(() => {
    persistOnboarded();
    setMode("voice");
    ttsRef.current?.cancel();
    setStatus("idle");
    autoListenRef.current = true;
  }, [persistOnboarded]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center overflow-y-auto"
      style={{
        background: "radial-gradient(circle at 50% 40%, #0a0a14 0%, #000 70%)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      {/* Free-flowing nebula — full-bleed living background. Sized to the
          viewport diagonal so its particle field actually overflows every
          edge instead of sitting in a centered box. The whole layer is a
          single click target so tapping anywhere wakes the mic. */}
      <button
        type="button"
        onClick={onOrbClick}
        className="fixed inset-0 z-0 outline-none select-none cursor-pointer"
        aria-label={STATUS_LABEL[status]}
        data-testid="pablo-orb"
      >
        <div
          className="absolute pointer-events-none"
          style={{
            width: nebulaSize,
            height: nebulaSize,
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
          }}
        >
          <NebulaErrorBoundary fallback={<NebulaOrb2D status={status} size={nebulaSize} />}>
            <PabloNebula3D status={status} size={nebulaSize} />
          </NebulaErrorBoundary>
        </div>
      </button>

      {/* Guided-tour reveal overlay: nebula art cross-fades into the office
          artwork as Pablo narrates "watch this". Pixel-art frame stays hot-pink
          to preserve the Akira aesthetic. */}
      {guidedActive && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 5,
            pointerEvents: "none",
            opacity: revealOverlay ? 1 : 0,
            transition: "opacity 1400ms cubic-bezier(.22,1,.36,1)",
            backgroundImage:
              "radial-gradient(ellipse at center, rgba(0,0,0,0) 30%, rgba(0,0,0,0.55) 100%), url('/api/art/asset/scene_office')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            imageRendering: "pixelated",
            mixBlendMode: "screen",
            filter: "saturate(1.15) contrast(1.05)",
          }}
        />
      )}
      {guidedActive && revealOverlay && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 6,
            pointerEvents: "none",
            background:
              "linear-gradient(180deg, rgba(244,114,182,0) 0%, rgba(244,114,182,0.08) 50%, rgba(56,189,248,0.10) 100%)",
            mixBlendMode: "overlay",
            animation: "salaryPulse 1.4s ease-out 1",
          }}
        />
      )}

      {/* Minimal top header — logo + visible TEXT/VOICE toggle + exit. Sits
          above the nebula via z-10 so it stays clickable. */}
      <header className="relative z-10 w-full flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 shrink-0">
        {/* Salaryman logo is the loop. First-time visitors haven't done the
            tutorial yet, so it sends them back to the landing page (the
            other half of the loop). Once the user has been through the
            intro at least once, the same logo becomes a fast-travel back
            into the world — Pablo is no longer in their way. */}
        <Link
          href={isTutorialDone() ? "/world/play" : "/landing"}
          className="flex items-center gap-2 sm:gap-2.5 group min-w-0"
          data-testid="link-logo-loop"
        >
          <PicassoLogo size={20} gap={2} glow />
          <span className="font-mono text-[10px] sm:text-[11px] tracking-[0.2em] sm:tracking-[0.25em] text-zinc-500 group-hover:text-zinc-300 transition-colors truncate">
            SALARYMAN
          </span>
        </Link>
        <div className="flex items-center gap-3">
          {/* Visible mode toggle — clickable swap between voice nebula and
              text input. Always available, even while the storyteller is
              speaking, so users never have to guess the magic phrase. */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); mode === "text" ? switchToVoice() : switchToText(); }}
            data-testid="pablo-mode-toggle"
            className="px-2.5 py-1 rounded border border-pink-400/40 bg-black/60 hover:bg-pink-500/15 text-pink-200 text-[10px] tracking-[0.3em] font-mono transition-colors flex items-center gap-1.5"
            title={mode === "text" ? "Switch to voice" : "Switch to text"}
          >
            {mode === "text" ? <Mic className="w-3 h-3" /> : <Send className="w-3 h-3" />}
            {mode === "text" ? "VOICE" : "TEXT"}
          </button>
          <HummingBirdAttachStrip toolKey="pablo-terminal" buttonStyle="icon" pickerTitle="ATTACH AUDIO TO COMMAND" />
          {/* No exit X — the SALARYMAN logo at the top-left already routes
              back to landing, so a second exit affordance is redundant and
              was causing a black-screen flash on mobile during the intro. */}
        </div>
      </header>

      {/* Spacer so the status pill ends up at the bottom of the page even
          though the nebula is now an absolutely-positioned background. */}
      <div className="relative z-10 flex-1 pointer-events-none" />

      {/* Tiny status pill at the bottom — hidden whenever the storyteller
          intro or text-input bar is occupying the bottom of the screen, so
          the lower edge stays uncrowded on mobile and desktop. The intro
          card already conveys the live status via its color theming. */}
      {!showIntro && mode !== "text" && (
        <div className="pb-4 sm:pb-6 flex items-center gap-2 text-[10px] font-mono tracking-[0.3em] shrink-0" style={{ color: STATUS_COLOR[status] }}>
          {status === "listening" ? <Mic className="w-3 h-3" /> : status === "idle" ? <MicOff className="w-3 h-3" /> : null}
          <span>{STATUS_LABEL[status]}</span>
        </div>
      )}

      {/* Storyteller intro: spoken-line caption + passcode entry. Renders
          only on first visit; passcode unlock dismisses it forever. */}
      {showIntro && (
        <div
          className="absolute inset-x-0 bottom-0 px-3 sm:px-8 flex flex-col items-center gap-2 sm:gap-3 pointer-events-none"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
        >
          {/* Caption: the line Pablo is speaking right now */}
          <div className="pointer-events-auto w-full max-w-2xl rounded-lg border border-purple-500/30 bg-black/70 backdrop-blur px-3 py-2.5 sm:px-4 sm:py-3">
            <div className="flex items-center justify-between mb-1">
              <div className="text-purple-300 text-[9px] font-mono tracking-[0.3em]">PABLO</div>
              <div className="text-zinc-600 text-[9px] font-mono tracking-[0.3em]">
                {Math.min(storyIdx + 1, STORY_LINES.length)} / {STORY_LINES.length}
              </div>
            </div>
            <p className="text-zinc-200 text-xs sm:text-base leading-snug">
              {reply || STORY_LINES[storyIdx]}
            </p>
          </div>

          {/* Passcode hint + ENTER button */}
          <div className="pointer-events-auto w-full max-w-2xl rounded-lg border border-pink-500/40 bg-pink-500/5 backdrop-blur px-3 py-2.5 sm:px-4 sm:py-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-pink-400 text-[9px] font-mono tracking-[0.3em] mb-0.5 sm:mb-1">PASSCODE TO ENTER</div>
              <div className="text-pink-100 text-sm sm:text-lg font-bold tracking-wider truncate" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                "attention is all you need"
              </div>
              <div className="text-pink-300/60 text-[9px] sm:text-[10px] font-mono mt-0.5">
                speak it · type it · or tap ENTER
              </div>
            </div>
            <button
              type="button"
              onClick={unlockAndEnter}
              data-testid="pablo-passcode-enter"
              className="shrink-0 px-4 py-2.5 sm:px-6 sm:py-3 rounded-lg bg-pink-500 hover:bg-pink-400 text-black font-bold text-xs sm:text-sm tracking-[0.25em] sm:tracking-[0.3em] transition-colors"
              style={{ boxShadow: "0 0 24px rgba(236,72,153,0.45)" }}
            >
              ENTER ▸
            </button>
          </div>

          {/* Quick text input during the story so users can type the passcode
              or a question without switching modes manually. Always rendered
              during intro regardless of voice/text mode so the user is never
              stranded without an input. */}
          <form
            onSubmit={(e) => { e.preventDefault(); submitText(); }}
            className="pointer-events-auto w-full max-w-2xl flex items-center gap-2"
          >
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="…or type the passcode / a question for Pablo"
                className="flex-1 bg-zinc-950/70 border border-zinc-800 focus:border-pink-500/60 rounded-lg px-3 py-2 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition-colors"
                data-testid="pablo-intro-text-input"
              />
              <button
                type="submit"
                disabled={!textInput.trim() || status === "thinking"}
                className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-100 transition-colors"
                aria-label="Send"
                data-testid="pablo-intro-text-send"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>

          {/* Tap-to-talk hint — appears only while Pablo is mid-greeting so
              users discover they can interrupt and speak any time. Hidden
              once the storyteller finishes (mic auto-opens then). */}
          {status === "speaking" && mode === "voice" && (
            <div className="text-pink-300/70 text-[10px] sm:text-[11px] font-mono tracking-[0.25em] text-center">
              ✦ TAP ANYWHERE TO TALK
            </div>
          )}
        </div>
      )}

      {/* Idle Pablo bubble — one greeting per session, then slow lore drips
          on a doubling cadence (5→10→20→40 min…). Each lore drip carries
          two cheeky clickable reply tokens; tapping one fires it back as a
          normal Pablo message. */}
      {!showIntro && !reply && !transcript && idleLine && (
        <div className="absolute inset-x-0 bottom-20 sm:bottom-24 px-4 sm:px-8 flex flex-col items-center gap-2 pointer-events-none z-10">
          <div className="pointer-events-auto w-full max-w-md rounded-lg border border-purple-500/25 bg-black/55 backdrop-blur px-4 py-2.5">
            <div className="flex items-center justify-between mb-0.5">
              <div className="text-purple-300/80 text-[9px] font-mono tracking-[0.3em]">PABLO</div>
              <div className="text-zinc-600 text-[9px] font-mono tracking-[0.3em]">IDLE</div>
            </div>
            <p className="text-zinc-200 text-sm leading-snug">{idleLine}</p>
            {idleOptions.length === 2 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {idleOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setIdleOptions([]); sendToPablo(opt); }}
                    className="px-2.5 py-1 rounded border border-pink-500/40 bg-pink-500/10 hover:bg-pink-500/20 text-pink-200 text-[10px] font-mono tracking-[0.18em]"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); navigate("/upgrade"); }}
            className="pointer-events-auto text-[10px] font-mono tracking-[0.3em] text-pink-300/80 hover:text-pink-200 px-2 py-1 rounded hover:bg-pink-500/10 transition-colors"
          >
            ✦ UPGRADE TO PABLO PRIME
          </button>
        </div>
      )}

      {/* Text-mode input — only shown when user explicitly switches to text */}
      {mode === "text" && !showIntro && (
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
