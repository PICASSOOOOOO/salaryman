import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, X, Sparkles } from "lucide-react";
import { PicassoLogo } from "@/components/PicassoLogo";
import { apiFetch } from "@/lib/api-client";
import { speakWithTTS } from "@/lib/tts";

const TUTORIAL_KEY = "pablo-terminal-tutorial-seen-v1";

const TUTORIAL_PHRASES: { keyword: string; example: string }[] = [
  { keyword: "open",     example: "Open my calendar" },
  { keyword: "take me",  example: "Take me to the bot office" },
  { keyword: "show",     example: "Show me my job offers" },
  { keyword: "go to",    example: "Go to the dashboard" },
  { keyword: "access",   example: "Access my contacts" },
  { keyword: "search",   example: "Search for invoices" },
  { keyword: "what",     example: "What does the lab do?" },
];

const TUTORIAL_GREETING =
  "Welcome. I'm Pablo. Tap the nebula and just speak. Say things like open my calendar, take me to the bot office, or what does the lab do, and I'll handle the rest.";

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

function Nebula({ status }: { status: Status }) {
  // Always breathing — speed and intensity vary by state, but motion never stops.
  const breath =
    status === "speaking" ? 0.9 :
    status === "listening" ? 1.4 :
    status === "thinking" ? 2.2 :
    3.6;
  const swirlOuter =
    status === "thinking" ? 14 :
    status === "listening" ? 7 :
    status === "speaking" ? 5 :
    18;
  const swirlInner = swirlOuter * 1.5;
  const haloScale =
    status === "speaking" ? [1, 1.08, 1] :
    status === "listening" ? [1, 1.06, 1] :
    status === "thinking" ? [1, 1.04, 1] :
    [1, 1.045, 1];
  const coreScale =
    status === "listening" ? [1, 1.18, 1] :
    status === "speaking" ? [1, 1.12, 1] :
    status === "thinking" ? [1, 1.08, 1] :
    [1, 1.075, 1];

  return (
    <div className="relative" style={{ width: 360, height: 360 }}>
      {/* Soft outer breath */}
      <motion.div
        className="absolute inset-0 rounded-full"
        animate={{ scale: haloScale, opacity: [0.55, 0.95, 0.55] }}
        transition={{ duration: breath * 1.2, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background: `radial-gradient(circle at 50% 50%, rgba(168,85,247,0.45) 0%, rgba(56,189,248,0.22) 35%, rgba(0,0,0,0) 70%)`,
          filter: "blur(22px)",
        }}
      />
      {/* Outer swirling gradient — always rotating */}
      <motion.div
        className="absolute inset-6 rounded-full"
        animate={{ rotate: 360 }}
        transition={{ duration: swirlOuter, repeat: Infinity, ease: "linear" }}
        style={{
          background: `conic-gradient(from 0deg, rgba(168,85,247,0.7), rgba(244,114,182,0.5), rgba(56,189,248,0.7), rgba(34,211,238,0.4), rgba(168,85,247,0.7))`,
          filter: "blur(14px)",
          opacity: 0.9,
        }}
      />
      {/* Counter-rotating mid layer with breath */}
      <motion.div
        className="absolute inset-14 rounded-full"
        animate={{ rotate: -360, scale: [1, 1.04, 1] }}
        transition={{
          rotate: { duration: swirlInner, repeat: Infinity, ease: "linear" },
          scale: { duration: breath, repeat: Infinity, ease: "easeInOut" },
        }}
        style={{
          background: `conic-gradient(from 180deg, rgba(34,211,238,0.65), rgba(168,85,247,0.8), rgba(244,114,182,0.55), rgba(34,211,238,0.65))`,
          filter: "blur(10px)",
          opacity: 0.75,
        }}
      />
      {/* Third drifting layer for liveliness */}
      <motion.div
        className="absolute inset-10 rounded-full"
        animate={{ rotate: 360 }}
        transition={{ duration: swirlOuter * 2.3, repeat: Infinity, ease: "linear" }}
        style={{
          background: `conic-gradient(from 90deg, rgba(244,114,182,0.0), rgba(168,85,247,0.35), rgba(34,211,238,0.0), rgba(244,114,182,0.35), rgba(34,211,238,0.0))`,
          filter: "blur(18px)",
          opacity: 0.7,
          mixBlendMode: "screen" as const,
        }}
      />
      {/* Hot core — always breathing */}
      <motion.div
        className="absolute rounded-full"
        animate={{ scale: coreScale, opacity: [0.85, 1, 0.85] }}
        transition={{ duration: breath, repeat: Infinity, ease: "easeInOut" }}
        style={{
          left: "38%", top: "38%", width: "24%", height: "24%",
          background: `radial-gradient(circle, rgba(255,255,255,0.95) 0%, ${STATUS_COLOR[status]} 35%, rgba(168,85,247,0.5) 70%, rgba(0,0,0,0) 100%)`,
          filter: "blur(2px)",
          boxShadow: `0 0 60px ${STATUS_COLOR[status]}, 0 0 120px ${STATUS_COLOR[status]}`,
        }}
      />
      {/* Orbiting particles — always in motion */}
      {[...Array(8)].map((_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const r = 140 + (i % 2 === 0 ? 0 : 18);
        const dur = 10 + (i % 3) * 2;
        return (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              left: "50%", top: "50%", width: 4, height: 4, marginLeft: -2, marginTop: -2,
              background: STATUS_COLOR[status],
              boxShadow: `0 0 10px ${STATUS_COLOR[status]}`,
            }}
            animate={{
              x: Array.from({ length: 33 }, (_, k) => Math.cos(angle + (k / 32) * Math.PI * 2) * r),
              y: Array.from({ length: 33 }, (_, k) => Math.sin(angle + (k / 32) * Math.PI * 2) * r),
              opacity: [0.35, 1, 0.35],
              scale: [0.8, 1.2, 0.8],
            }}
            transition={{ duration: dur, repeat: Infinity, ease: "linear", delay: i * 0.15 }}
          />
        );
      })}
    </div>
  );
}

export default function PabloTerminal() {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<Status>("idle");
  const [transcript, setTranscript] = useState<string>("");
  const [reply, setReply] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [history, setHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [showTutorial, setShowTutorial] = useState<boolean>(() => {
    try { return localStorage.getItem(TUTORIAL_KEY) !== "1"; } catch { return false; }
  });
  const tutorialGreetedRef = useRef(false);
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

  const dismissTutorial = useCallback(() => {
    setShowTutorial(false);
    try { localStorage.setItem(TUTORIAL_KEY, "1"); } catch {}
    ttsRef.current?.cancel();
    setStatus("idle");
    autoListenRef.current = true;
  }, []);

  // Auto-speak greeting once on first visit, then auto-start listening.
  useEffect(() => {
    if (!showTutorial || tutorialGreetedRef.current) return;
    tutorialGreetedRef.current = true;
    setStatus("speaking");
    setReply(TUTORIAL_GREETING);
    ttsRef.current?.cancel();
    const onEnd = () => {
      ttsRef.current = null;
      setStatus("idle");
      autoListenRef.current = true;
    };
    ttsRef.current = speakWithTTS(TUTORIAL_GREETING, onEnd, onEnd);
  }, [showTutorial]);

  const speak = useCallback((text: string) => new Promise<void>((resolve) => {
    setStatus("speaking");
    ttsRef.current?.cancel();
    ttsRef.current = speakWithTTS(text, () => { ttsRef.current = null; resolve(); }, () => { ttsRef.current = null; resolve(); });
  }), []);

  const sendToPablo = useCallback(async (text: string) => {
    setStatus("thinking");
    setReply("");
    try {
      const res = await apiFetch("api/chat/pablo/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text, history: history.slice(-10) }),
      });
      if (!res.ok) throw new Error(`pablo ${res.status}`);
      const data = (await res.json()) as { say: string; navigate: string | null };
      setReply(data.say);
      setHistory((h) => [...h, { role: "user", content: text }, { role: "assistant", content: data.say }]);
      await speak(data.say);
      if (data.navigate) {
        // Small breath after the spoken confirmation, then route.
        setTimeout(() => navigate(data.navigate as string), 300);
      } else {
        setStatus("idle");
        // Auto-resume listening so the conversation flows hands-free.
        autoListenRef.current = true;
      }
    } catch (err) {
      console.error("[Pablo] command failed:", err);
      setError("Pablo couldn't reach the server.");
      setStatus("idle");
      autoListenRef.current = true;
    }
  }, [history, navigate, speak]);

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
    if (showTutorial) dismissTutorial();
    if (status === "idle") startListening();
    else stopAll();
  }, [status, startListening, stopAll, showTutorial, dismissTutorial]);

  // Hands-free conversation loop: whenever we land on idle and a hop is
  // queued, start listening again automatically.
  useEffect(() => {
    if (status !== "idle") return;
    if (!autoListenRef.current) return;
    autoListenRef.current = false;
    const t = setTimeout(() => { startListening(); }, 350);
    return () => clearTimeout(t);
  }, [status, startListening]);

  // On first mount: if there's no tutorial to play, start listening right away.
  useEffect(() => {
    if (autoStartedRef.current) return;
    autoStartedRef.current = true;
    if (!showTutorial) autoListenRef.current = true;
  }, [showTutorial]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center"
      style={{ background: "radial-gradient(circle at 50% 40%, #0a0a14 0%, #000 70%)" }}
    >
      {/* Minimal top header — logo only */}
      <header className="w-full flex items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2.5 group">
          <PicassoLogo size={22} gap={2} glow />
          <span className="font-mono text-[11px] tracking-[0.25em] text-zinc-500 group-hover:text-zinc-300 transition-colors">
            SALARYMAN
          </span>
        </Link>
        <Link
          href="/"
          className="text-zinc-600 hover:text-zinc-300 transition-colors"
          aria-label="Exit terminal"
          data-testid="pablo-terminal-exit"
        >
          <X className="w-4 h-4" />
        </Link>
      </header>

      {/* Centered nebula */}
      <div className="flex-1 flex flex-col items-center justify-center w-full select-none">
        <button
          onClick={onOrbClick}
          className="relative outline-none focus:ring-2 focus:ring-purple-500/40 rounded-full"
          aria-label={STATUS_LABEL[status]}
          data-testid="pablo-orb"
        >
          <Nebula status={status} />
        </button>

        <div className="mt-8 flex items-center gap-2 text-[11px] font-mono tracking-[0.2em]" style={{ color: STATUS_COLOR[status] }}>
          {status === "listening" ? <Mic className="w-3 h-3" /> : status === "idle" ? <MicOff className="w-3 h-3" /> : null}
          <span>{STATUS_LABEL[status]}</span>
        </div>

        <AnimatePresence mode="wait">
          {transcript && (
            <motion.div
              key={`t-${transcript}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 0.7, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-6 max-w-xl px-6 text-center text-sm text-zinc-500 italic"
            >
              "{transcript}"
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {reply && (
            <motion.div
              key={`r-${reply}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-3 max-w-xl px-6 text-center text-base text-zinc-200 leading-relaxed"
            >
              {reply}
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <div className="mt-4 text-xs font-mono text-red-400/80">{error}</div>
        )}
      </div>

      <footer className="pb-6 text-[9px] font-mono tracking-[0.3em] text-zinc-700">
        PABLO · VOICE TERMINAL
      </footer>

      {/* First-visit tutorial overlay */}
      <AnimatePresence>
        {showTutorial && (
          <motion.div
            key="tutorial"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0 z-10 flex items-center justify-center px-6 pointer-events-none"
            style={{ background: "radial-gradient(circle at 50% 50%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.85) 70%)" }}
          >
            <motion.div
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.5, ease: "easeOut" }}
              className="pointer-events-auto max-w-md w-full bg-zinc-950/85 backdrop-blur-xl border border-zinc-800 rounded-2xl p-6 shadow-2xl"
              data-testid="pablo-tutorial"
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-300">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="text-[10px] font-mono tracking-[0.25em] text-purple-300/80 mb-1">FIRST TIME?</div>
                  <h2 className="text-base font-semibold text-zinc-100 leading-tight">Just speak. Pablo opens it for you.</h2>
                </div>
              </div>

              <p className="text-sm text-zinc-400 mb-4 leading-relaxed">
                Tap the nebula and say what you want — open a page, ask a question, or have Pablo show you something. He listens, then acts.
              </p>

              <div className="space-y-2 mb-5">
                <div className="text-[10px] font-mono tracking-[0.2em] text-zinc-500 mb-2">TRY SAYING</div>
                {TUTORIAL_PHRASES.map((p) => (
                  <div key={p.example} className="flex items-center gap-3 text-sm">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-purple-400/70 w-16 shrink-0">{p.keyword}</span>
                    <span className="text-zinc-300">"{p.example}"</span>
                  </div>
                ))}
              </div>

              <button
                onClick={dismissTutorial}
                className="w-full py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-mono tracking-wider uppercase transition-colors"
                data-testid="pablo-tutorial-dismiss"
              >
                Got it — let's go
              </button>
              <button
                onClick={dismissTutorial}
                className="w-full mt-2 py-1.5 text-[11px] font-mono tracking-wider uppercase text-zinc-500 hover:text-zinc-300 transition-colors"
                data-testid="pablo-tutorial-skip"
              >
                Skip
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
