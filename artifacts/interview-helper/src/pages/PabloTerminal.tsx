import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Sparkles, Send, Keyboard, MessageCircle, GraduationCap } from "lucide-react";
import { PicassoLogo } from "@/components/PicassoLogo";
import { HummingBirdAttachStrip } from "@/components/HummingBirdAttachStrip";
import { apiFetch } from "@/lib/api-client";
import { speakWithTTS, whenAudioUnlocked } from "@/lib/tts";
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
  // Arrival
  "Welcome... salaryman. Or woman. Or machine. Whatever you are under there.",
  "You've arrived at a very dangerous place. Don't act surprised. You knew.",
  // Who Pablo is
  "My name is Pablo. Everything you see — I own. The streets. The towers. The light in the windows. Mine.",
  "The city is called Minx City. The game is called SALARYMAN — and that game is the only life you've got in here.",
  "Minx City runs on real time. One real hour out there is one full day in here. Sleep through it and you'll wake up broke.",
  // The economy — currency, gold, the rule, money-is-everything
  "In Minx City, money is how everything works. Doors open for ƒ. Mouths shut for ƒ. Friends arrive for ƒ. Enemies leave for ƒ. There is no other lever.",
  "We don't use dollars in here. We use ƒ. Lowercase f, with a tail. Say 'florin' if you have to say it out loud.",
  "One U.S. dollar buys one thousand ƒ. One thousand ƒ buys five thousandths of an ounce of gold. The gold is real. The vault is real. I built it.",
  "I'm dropping a starting balance into your account the moment you walk through that door. Don't get excited — it's quarantined. You can look at it. You can't spend it.",
  "Only ƒ you EARN spends. Earn it by doing the work, closing the deals, surviving the day. That's the rule. That's the only rule that matters.",
  // The two paths
  "There are two ways to live in my city. You can take a job — clock in, clock out, keep your head down, take my paycheck on Friday.",
  "Or you start a business. Real one or fictitious one, I don't care. Sign the papers. Pay the rent. Make me proud. Make yourself rich.",
  "Or — and this is the third option I don't recommend — you can be a bum. Sleep on my sidewalks. Beg in my plazas. I won't stop you. Neither will what comes for you.",
  // PABLO PRIME / TAX
  "Use my AI and you're using my pipes. PABLO PRIME is a hundred forty-five a month, paid up front. That covers your daily juice.",
  "Burn through it and the meter starts running at four times market. We call that the PABLO TAX. Pay it in ƒ. Pay it in gold. Pay it in card. Pay it in Bitcoin. I take everything.",
  // The rebellion — the threat outside the walls
  "Now hear this. Beyond the wall there are the Outlanders. The wastes are theirs. They are strong. They are organized. They are not impressed by you.",
  "And inside the wall — the rebellion. Quiet, well-funded, patient. They want my city. They tell people the gold isn't real, the rules are a cage, the Florin is a leash.",
  "Let them talk. The city, the businesses, the towers — all of it answers to ƒ. Money is the floor under your feet in Minx City. The rebels stand on the same floor. They just pretend not to.",
  "Pick your side carefully. Or pick neither and just get rich. The smart ones do that.",
  // Death and consequences
  "You can die in here. You can be robbed. You can lose your business in a bad week. The world doesn't reset for you. It moves on.",
  "But if you're sharp — if you build something — you'll outlast everyone who started the same day as you. That's the whole point.",
  // The door — Pablo refuses to spell it out. Two riddle lines.
  "Now. The door. It has a passcode. I am NOT going to give it to you. Pay ATTENTION — that's the only hint you get.",
  "Three words. The title of the paper my engineers tore apart in '17 to build me. Every model in this city was raised on it. Type it into the door. Whisper it to the air. The door knows.",
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
  // ADDITIONALLY gated by localStorage: once the speech has played for this
  // browser at all (even partially), it never replays. New tabs and cold
  // reloads skip straight to the static passcode prompt. We use
  // localStorage (not sessionStorage) because mobile users were reporting
  // the intro looping every time they reopened the tab.
  const STORY_PLAYED_KEY = "pablo.story_played_v2";
  const [showIntro, setShowIntro] = useState<boolean>(() => !isTutorialDone());
  const [storyIdx, setStoryIdx] = useState(0);
  // Door state — flipped to true on a wrong passcode attempt so the door
  // shakes + flashes red. Auto-clears next keystroke.
  const [doorWrong, setDoorWrong] = useState(false);
  // Simon-says puzzle that runs AFTER the passcode is accepted but BEFORE
  // the salaryman story. Pablo flashes a 4-step pattern across 4 colored
  // pads; the user must tap them in order. Wrong → reset + new pattern.
  // Three fails in a row → Pablo waves them through.
  const [showPuzzle, setShowPuzzle] = useState(false);
  const [puzzleSeq, setPuzzleSeq] = useState<number[]>([]);
  const [puzzlePlaybackIdx, setPuzzlePlaybackIdx] = useState<number>(-1);
  const [puzzleUserIdx, setPuzzleUserIdx] = useState<number>(0);
  const [puzzleAcceptingInput, setPuzzleAcceptingInput] = useState(false);
  const [puzzleStatus, setPuzzleStatus] = useState<"watch" | "your-turn" | "wrong" | "right">("watch");
  const puzzleFailsRef = useRef(0);
  const puzzleSolvedRef = useRef(false);
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
  // Pre-seed the "already greeted" flag from localStorage so reloads and
  // new tabs don't restart the storyteller from line 0. The flag is set
  // the moment the first line begins; once it's there, future mounts in
  // ANY tab skip straight to "say the passcode" without re-running the
  // speech. Mobile users were reporting the intro replaying every time
  // they reopened the page; localStorage fixes that for good.
  const introGreetedRef = useRef<boolean>(
    typeof window !== "undefined" && window.localStorage.getItem(STORY_PLAYED_KEY) === "1"
  );
  // Audio unlocks itself the moment the user touches anything (handled by
  // the global armAudioAutoUnlock listener wired in App.tsx). Pablo's voice
  // is on by default and stays on; no manual unlock affordance needed.
  // External handle to cancel the storyteller mid-flight. Flipped to true
  // when the user asks a free-form question during the intro — the script
  // stops marching forward and Pablo's answer becomes the visible line so
  // the conversation actually sticks. Without this the storyteller would
  // overwrite the LLM reply with the next scripted line a second later.
  const storyCancelledRef = useRef<boolean>(false);
  // Counts how many times the user has interrupted the storyteller with a
  // free-form question. Pablo brushes off the first three; the fourth
  // forces him to stop and let the user chat normally.
  const storyInterruptsRef = useRef<number>(0);
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

  // Run Pablo's salaryman intake script (post-puzzle): a few lines of voice
  // narration, then collect name → email → OAuth.
  const beginSalarymanStory = useCallback(() => {
    interviewPhaseRef.current = 'story';
    bumpInterview();
    ttsRef.current?.cancel();
    setStatus("speaking");

    let cancelled = false;
    const speakIdx = (i: number) => {
      if (cancelled) return;
      if (i >= SALARYMAN_STORY.length) {
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
    void cancelled;
  }, [askNameNow, askEmailNow, bumpInterview]);

  // Play back the Simon-says pattern visually + set the user's turn.
  const playPuzzleSequence = useCallback((seq: number[]) => {
    setPuzzleStatus("watch");
    setPuzzleAcceptingInput(false);
    setPuzzlePlaybackIdx(-1);
    let i = 0;
    const tick = () => {
      if (i >= seq.length) {
        setPuzzlePlaybackIdx(-1);
        setPuzzleStatus("your-turn");
        setPuzzleUserIdx(0);
        setPuzzleAcceptingInput(true);
        return;
      }
      setPuzzlePlaybackIdx(seq[i]);
      window.setTimeout(() => {
        setPuzzlePlaybackIdx(-1);
        window.setTimeout(() => { i += 1; tick(); }, 220);
      }, 520);
    };
    // Brief pause before first flash so the user can settle.
    window.setTimeout(tick, 700);
  }, []);

  // Kick off the puzzle: speak instruction, generate a 4-step sequence, play it.
  const startPuzzle = useCallback(() => {
    const seq = Array.from({ length: 4 }, () => Math.floor(Math.random() * 4));
    setPuzzleSeq(seq);
    setShowPuzzle(true);
    const intro = "One more thing. Watch the pattern. Tap it back. Don't blink.";
    setReply(intro);
    setStatus("speaking");
    ttsRef.current?.cancel();
    ttsRef.current = speakWithTTS(intro, () => {
      ttsRef.current = null;
      setStatus("idle");
      playPuzzleSequence(seq);
    }, () => {
      ttsRef.current = null;
      setStatus("idle");
      playPuzzleSequence(seq);
    });
  }, [playPuzzleSequence]);

  const unlockAndEnter = useCallback(() => {
    if (puzzleSolvedRef.current || showPuzzle) return; // already moved past door
    awaitingPasscodeRef.current = false;
    persistOnboarded();
    markPasscodeUnlocked();
    setShowIntro(false);
    ttsRef.current?.cancel();
    cleanup();
    setStatus("speaking");
    // Brief acknowledgement, then the puzzle.
    const ack = "Good. The door knows you. Now prove you can hold a thought.";
    setReply(ack);
    ttsRef.current = speakWithTTS(ack, () => {
      ttsRef.current = null;
      startPuzzle();
    }, () => {
      ttsRef.current = null;
      startPuzzle();
    });
  }, [persistOnboarded, cleanup, startPuzzle, showPuzzle]);

  // Door form submit. The door has two jobs:
  //   1. If the text matches the passcode, unlock and enter the city.
  //   2. Otherwise, treat it as a question for Pablo and let him respond.
  //      Previously the door silently shook red on every non-passcode input
  //      — which read to users as "Pablo doesn't respond", because they
  //      had typed a real question and got nothing back. We still flash the
  //      red shake briefly as a hint that the literal *passcode* didn't
  //      match, but we hand the text to sendToPablo so the conversation
  //      keeps moving (he'll brush off mid-story, or chat freely once the
  //      story is done — exactly the same behaviour as the voice path).
  const attemptDoor = useCallback(() => {
    const text = textInput.trim();
    if (!text) return;
    setTextInput("");
    if (detectPasscode(text)) {
      setDoorWrong(false);
      unlockAndEnter();
      return;
    }
    setDoorWrong(true);
    window.setTimeout(() => setDoorWrong(false), 700);
    setTranscript(text);
    void sendToPablo(text);
  }, [textInput, unlockAndEnter]);

  // Puzzle pad tap handler — validates one step at a time. Wrong step
  // re-rolls a fresh sequence; three failures and Pablo waves the user
  // through anyway because nobody likes being trapped at the door.
  const onPuzzlePadTap = useCallback((pad: number) => {
    if (!puzzleAcceptingInput || puzzleSolvedRef.current) return;
    const expected = puzzleSeq[puzzleUserIdx];
    if (pad !== expected) {
      // Wrong.
      setPuzzleAcceptingInput(false);
      setPuzzleStatus("wrong");
      puzzleFailsRef.current += 1;
      if (puzzleFailsRef.current >= 3) {
        // Mercy. Open the door.
        const line = "Fine. Get in. Try not to die.";
        setReply(line);
        setStatus("speaking");
        ttsRef.current?.cancel();
        const after = () => {
          ttsRef.current = null;
          puzzleSolvedRef.current = true;
          setShowPuzzle(false);
          beginSalarymanStory();
        };
        ttsRef.current = speakWithTTS(line, after, after);
        return;
      }
      const line = "No. Watch it again.";
      setReply(line);
      setStatus("speaking");
      ttsRef.current?.cancel();
      const after = () => {
        ttsRef.current = null;
        setStatus("idle");
        // Re-roll a fresh sequence so users can't memorise a bad pattern.
        const seq = Array.from({ length: 4 }, () => Math.floor(Math.random() * 4));
        setPuzzleSeq(seq);
        playPuzzleSequence(seq);
      };
      ttsRef.current = speakWithTTS(line, after, after);
      return;
    }
    // Right step.
    const nextIdx = puzzleUserIdx + 1;
    setPuzzleUserIdx(nextIdx);
    if (nextIdx >= puzzleSeq.length) {
      // Solved!
      puzzleSolvedRef.current = true;
      setPuzzleAcceptingInput(false);
      setPuzzleStatus("right");
      const line = "Sharp. Door's open. Step inside.";
      setReply(line);
      setStatus("speaking");
      ttsRef.current?.cancel();
      const after = () => {
        ttsRef.current = null;
        setShowPuzzle(false);
        beginSalarymanStory();
      };
      // small celebratory delay so the green flash registers
      window.setTimeout(() => {
        ttsRef.current = speakWithTTS(line, after, after);
      }, 450);
    }
  }, [puzzleAcceptingInput, puzzleSeq, puzzleUserIdx, playPuzzleSequence, beginSalarymanStory]);

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
    try { window.localStorage.setItem(STORY_PLAYED_KEY, "1"); } catch {}
    let cancelled = false;

    const speakIdx = (i: number) => {
      // External cancel — user asked Pablo a free-form question and we
      // don't want the script to overwrite his reply with the next line.
      if (storyCancelledRef.current) return;
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

    // Mid-storyteller interrupt. Pablo is MOTIVATED to deliver his intro —
    // it's the entire onboarding for his city. So if the user pipes up
    // during the script with anything that isn't the passcode, he brushes
    // them off and keeps going. Three brush-offs and he relents and lets
    // them chat freely; until then, the script wins.
    if (showIntro && !storyCancelledRef.current) {
      const brushOffs = [
        "Quiet. I'm setting the scene. Questions when I'm done.",
        "Let me finish. You'll want to hear this.",
        "Hush. The story is the gift. Take it.",
      ];
      const n = ++storyInterruptsRef.current;
      if (n <= brushOffs.length) {
        const line = brushOffs[n - 1];
        setReply(line);
        setStatus("speaking");
        ttsRef.current?.cancel();
        // Speak the brush-off, then DON'T advance the storyteller — the
        // existing safety timer / TTS-end handler will pick up the next
        // scripted line on its own breath. We do not return early; we
        // skip the LLM call so the user's question doesn't get answered.
        ttsRef.current = speakWithTTS(
          line,
          () => { ttsRef.current = null; setStatus("speaking"); },
          () => { ttsRef.current = null; setStatus("speaking"); },
        );
        return;
      }
      // User has pushed three times — Pablo gives in. Cancel the script,
      // open up free-form chat, but keep the passcode card visible so
      // they can still enter when ready.
      storyCancelledRef.current = true;
      try { ttsRef.current?.cancel(); } catch {}
      ttsRef.current = null;
      awaitingPasscodeRef.current = true;
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
        {/* Salaryman logo is the loop — always back to the landing page.
            Landing's "Get Started" returns the user to the nebula, which
            is the entire intro flow. World access is unlocked only at the
            END of onboarding, never as a side-effect of clicking a logo
            before the user has even signed in. */}
        <Link
          href="/landing"
          className="flex items-center gap-2 sm:gap-2.5 group min-w-0"
          data-testid="link-logo-loop"
        >
          <PicassoLogo size={20} gap={2} glow />
          <span className="font-mono text-[10px] sm:text-[11px] tracking-[0.2em] sm:tracking-[0.25em] text-zinc-500 group-hover:text-zinc-300 transition-colors truncate">
            SALARYMAN
          </span>
        </Link>
        <div className="flex items-center gap-3">
          {/* Mode toggle and audio attach strip belong to the post-intro
              terminal experience. During the storyteller intro the user
              should be focused on Pablo's monologue and the sealed door —
              showing a TEXT/VOICE button or an audio attach icon up here
              breaks the cinematic, and tapping the attach icon was
              surfacing an unrelated picker mid-story. We hide both until
              the intro is dismissed (passcode unlocked / story cancelled). */}
          {!showIntro && (
            <>
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
            </>
          )}
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
          {/* Caption: the line Pablo is speaking right now. The colour
              palette escalates as the story moves through its chapters
              (arrival → identity → economy → paths → tax → death → door)
              so the visual mood tracks the words. Each new line crossfades
              in. A thin progress bar at the bottom shows where we are
              without an mechanical "X / N" counter cluttering the header. */}
          {(() => {
            // Chapter palette — tuned to the story beats above. Each colour
            // run matches a thematic block of STORY_LINES; the rebellion
            // chapter gets its own bruised-violet to feel like a warning.
            const palettes = [
              { border: "rgba(168,85,247,0.45)",  glow: "rgba(168,85,247,0.25)", label: "rgb(216,180,254)", bar: "#a855f7" }, //  0-1   arrival     purple
              { border: "rgba(34,211,238,0.5)",   glow: "rgba(34,211,238,0.28)", label: "rgb(165,243,252)", bar: "#22d3ee" }, //  2-4   identity    cyan
              { border: "rgba(250,204,21,0.5)",   glow: "rgba(250,204,21,0.28)", label: "rgb(254,240,138)", bar: "#facc15" }, //  5-9   economy     amber
              { border: "rgba(52,211,153,0.5)",   glow: "rgba(52,211,153,0.28)", label: "rgb(167,243,208)", bar: "#34d399" }, // 10-12  paths       emerald
              { border: "rgba(251,146,60,0.55)",  glow: "rgba(251,146,60,0.32)", label: "rgb(254,215,170)", bar: "#fb923c" }, // 13-14  tax         orange
              { border: "rgba(192,132,252,0.6)",  glow: "rgba(192,132,252,0.4)", label: "rgb(233,213,255)", bar: "#c084fc" }, // 15-18  rebellion   violet
              { border: "rgba(248,113,113,0.55)", glow: "rgba(248,113,113,0.32)", label: "rgb(254,202,202)", bar: "#f87171" }, // 19-20  death       red
              { border: "rgba(236,72,153,0.6)",   glow: "rgba(236,72,153,0.4)",  label: "rgb(251,207,232)", bar: "#ec4899" }, // 21-22  door        pink
            ];
            const chapterIdx =
              storyIdx <= 1  ? 0 :
              storyIdx <= 4  ? 1 :
              storyIdx <= 9  ? 2 :
              storyIdx <= 12 ? 3 :
              storyIdx <= 14 ? 4 :
              storyIdx <= 18 ? 5 :
              storyIdx <= 20 ? 6 : 7;
            const p = palettes[chapterIdx];
            const progressPct = Math.min(100, ((storyIdx + 1) / STORY_LINES.length) * 100);
            const lineText = reply || STORY_LINES[storyIdx];
            const isSpeaking = status === "speaking";
            return (
              <div
                className="pointer-events-auto w-full max-w-2xl rounded-lg bg-black/75 backdrop-blur px-3 py-2.5 sm:px-4 sm:py-3 transition-[border-color,box-shadow] duration-700 relative overflow-hidden"
                style={{ borderWidth: 1, borderStyle: "solid", borderColor: p.border, boxShadow: `0 0 32px ${p.glow}` }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-[9px] font-mono tracking-[0.3em] transition-colors duration-700"
                      style={{ color: p.label }}
                    >
                      PABLO
                    </span>
                    {isSpeaking && (
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
                        style={{ backgroundColor: p.bar, boxShadow: `0 0 6px ${p.bar}` }}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                </div>
                <motion.p
                  key={`${storyIdx}-${lineText.slice(0, 24)}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, ease: "easeOut" }}
                  className="text-zinc-100 text-sm sm:text-lg leading-snug sm:leading-relaxed"
                  style={{ textShadow: `0 0 14px ${p.glow}` }}
                >
                  {lineText}
                </motion.p>
                {/* Story progress bar */}
                <div className="absolute left-0 right-0 bottom-0 h-[2px] bg-zinc-900/80">
                  <div
                    className="h-full transition-[width,background-color] duration-700 ease-out"
                    style={{ width: `${progressPct}%`, backgroundColor: p.bar, boxShadow: `0 0 8px ${p.bar}` }}
                  />
                </div>
              </div>
            );
          })()}

          {/* The DOOR. Visually striking sealed terminal with a riddle hint
              and an input the user must figure out. No literal passcode is
              shown. Wrong attempts shake + flash red; correct attempts
              ignite the door and call unlockAndEnter. */}
          <div
            className="pointer-events-auto w-full max-w-2xl rounded-lg border-2 backdrop-blur px-3 py-3 sm:px-4 sm:py-4 relative overflow-hidden"
            style={{
              borderColor: doorWrong ? "rgba(248,113,113,0.85)" : "rgba(236,72,153,0.55)",
              background: "linear-gradient(180deg, rgba(20,4,18,0.85) 0%, rgba(8,2,12,0.85) 100%)",
              boxShadow: doorWrong
                ? "0 0 32px rgba(248,113,113,0.55), inset 0 0 24px rgba(248,113,113,0.25)"
                : "0 0 32px rgba(236,72,153,0.35), inset 0 0 18px rgba(236,72,153,0.18)",
              animation: doorWrong ? "pablo-door-shake 0.45s ease" : undefined,
            }}
          >
            {/* Decorative scan line + door rivets */}
            <div className="absolute inset-x-0 top-0 h-[2px]" style={{ background: "linear-gradient(90deg, transparent, rgba(236,72,153,0.9), transparent)" }} />
            <div className="absolute left-2 top-2 w-1.5 h-1.5 rounded-full" style={{ background: "rgba(236,72,153,0.6)", boxShadow: "0 0 6px rgba(236,72,153,0.8)" }} />
            <div className="absolute right-2 top-2 w-1.5 h-1.5 rounded-full" style={{ background: "rgba(236,72,153,0.6)", boxShadow: "0 0 6px rgba(236,72,153,0.8)" }} />
            <div className="absolute left-2 bottom-2 w-1.5 h-1.5 rounded-full" style={{ background: "rgba(236,72,153,0.4)" }} />
            <div className="absolute right-2 bottom-2 w-1.5 h-1.5 rounded-full" style={{ background: "rgba(236,72,153,0.4)" }} />

            <div className="flex items-center justify-between mb-1.5">
              <div className="text-pink-400 text-[9px] font-mono tracking-[0.35em]">◆ DOOR · SEALED</div>
              <div className="text-pink-300/60 text-[9px] font-mono tracking-[0.3em]">PASSCODE REQ.</div>
            </div>
            <div className="text-pink-200/90 text-[11px] sm:text-xs font-mono leading-snug mb-2.5 italic">
              "Three words. The title of the paper that taught the machines."
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); attemptDoor(); }}
              className="flex items-stretch gap-2"
            >
              <input
                type="text"
                value={textInput}
                onChange={(e) => { setTextInput(e.target.value); if (doorWrong) setDoorWrong(false); }}
                placeholder="type the passcode — or just talk to Pablo…"
                className="flex-1 bg-black/60 border border-pink-500/40 focus:border-pink-400 rounded px-3 py-2.5 text-sm sm:text-base text-pink-100 placeholder:text-pink-400/40 outline-none transition-colors"
                style={{ fontFamily: "'Share Tech Mono', monospace", letterSpacing: "0.06em" }}
                data-testid="pablo-intro-text-input"
                autoFocus
              />
              <button
                type="submit"
                disabled={!textInput.trim() || status === "thinking"}
                data-testid="pablo-passcode-enter"
                className="shrink-0 px-4 sm:px-5 rounded bg-pink-500 hover:bg-pink-400 disabled:opacity-30 text-black font-bold text-xs sm:text-sm tracking-[0.25em] transition-colors"
                style={{ boxShadow: "0 0 18px rgba(236,72,153,0.5)" }}
                aria-label="Try passcode"
              >
                TRY ▸
              </button>
            </form>
            <div className="text-pink-300/50 text-[9px] sm:text-[10px] font-mono mt-2 tracking-wider">
              {doorWrong ? "✕ DOOR REJECTED. THINK." : "type or speak it · ↵"}
            </div>
            <style>{`@keyframes pablo-door-shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)} 40%{transform:translateX(5px)} 60%{transform:translateX(-3px)} 80%{transform:translateX(2px)} }`}</style>
          </div>

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

      {/* Simon-says puzzle — runs after the door opens, before the salaryman
          intake. Four colored pads in a 2x2 grid. Pablo flashes a 4-step
          pattern; the user repeats it. Wrong → reroll, three fails → mercy. */}
      {showPuzzle && (() => {
        const PADS = [
          { name: "PINK",   base: "#831843", on: "#fb7185", glow: "#f472b6" },
          { name: "CYAN",   base: "#155e75", on: "#67e8f9", glow: "#22d3ee" },
          { name: "AMBER",  base: "#78350f", on: "#fbbf24", glow: "#facc15" },
          { name: "VIOLET", base: "#581c87", on: "#c084fc", glow: "#a855f7" },
        ];
        const headerText =
          puzzleStatus === "watch"     ? "◇ WATCH" :
          puzzleStatus === "your-turn" ? "◆ YOUR TURN" :
          puzzleStatus === "wrong"     ? "✕ WRONG" :
                                         "✓ DOOR OPEN";
        const headerColor =
          puzzleStatus === "wrong" ? "#f87171" :
          puzzleStatus === "right" ? "#34d399" :
                                     "#f0abfc";
        return (
          <div className="absolute inset-0 z-30 flex items-center justify-center p-4 pointer-events-auto" style={{ background: "rgba(0,0,0,0.78)", backdropFilter: "blur(6px)" }} data-testid="pablo-puzzle-overlay">
            <div
              className="rounded-2xl border-2 p-4 sm:p-6 max-w-md w-full"
              style={{
                borderColor: puzzleStatus === "wrong" ? "rgba(248,113,113,0.7)" : puzzleStatus === "right" ? "rgba(52,211,153,0.7)" : "rgba(236,72,153,0.55)",
                background: "linear-gradient(180deg, rgba(20,4,18,0.95) 0%, rgba(8,2,12,0.95) 100%)",
                boxShadow: "0 0 48px rgba(236,72,153,0.35)",
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] font-mono tracking-[0.35em]" style={{ color: headerColor }}>{headerText}</div>
                <div className="text-pink-300/50 text-[9px] font-mono tracking-[0.3em]">
                  {puzzleStatus === "your-turn" ? `${puzzleUserIdx} / ${puzzleSeq.length}` : `PATTERN · ${puzzleSeq.length}`}
                </div>
              </div>
              <div className="text-pink-100/90 text-xs sm:text-sm font-mono leading-snug mb-4 italic">
                {puzzleStatus === "watch"     && "Pablo is showing you the pattern. Memorise it."}
                {puzzleStatus === "your-turn" && "Tap the pads in the same order. Don't blink."}
                {puzzleStatus === "wrong"     && "Wrong pad. Watch again."}
                {puzzleStatus === "right"     && "Pattern complete. The door is opening."}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {PADS.map((pad, idx) => {
                  const lit = puzzlePlaybackIdx === idx || (puzzleStatus === "right");
                  return (
                    <button
                      key={pad.name}
                      type="button"
                      disabled={!puzzleAcceptingInput}
                      onClick={() => onPuzzlePadTap(idx)}
                      data-testid={`pablo-puzzle-pad-${idx}`}
                      aria-label={`${pad.name} pad`}
                      className="aspect-square rounded-xl transition-all duration-150 active:scale-95 disabled:cursor-default"
                      style={{
                        background: lit ? pad.on : pad.base,
                        boxShadow: lit
                          ? `0 0 36px ${pad.glow}, inset 0 0 24px rgba(255,255,255,0.4)`
                          : `inset 0 0 12px rgba(0,0,0,0.6)`,
                        opacity: puzzleAcceptingInput || lit ? 1 : 0.6,
                        border: `1px solid ${lit ? pad.on : "rgba(255,255,255,0.05)"}`,
                      }}
                    />
                  );
                })}
              </div>
              <div className="mt-3 text-pink-300/40 text-[9px] font-mono tracking-wider text-center">
                {puzzleStatus === "your-turn" ? "TAP IN ORDER" : "—"}
              </div>
            </div>
          </div>
        );
      })()}

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
