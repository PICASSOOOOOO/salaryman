import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Mic, X, Keyboard, Send, MicOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/lib/api-client";
import { speakWithTTS } from "@/lib/tts";
import { useAuth } from "@workspace/replit-auth-web";

type Status = "idle" | "listening" | "thinking" | "speaking";
type Mode = "voice" | "text";

const STATUS_COLOR: Record<Status, string> = {
  idle: "#a78bfa",
  listening: "#22d3ee",
  thinking: "#fbbf24",
  speaking: "#e879f9",
};

const STATUS_LABEL: Record<Status, string> = {
  idle: "TAP TO SPEAK",
  listening: "LISTENING…",
  thinking: "THINKING…",
  speaking: "SPEAKING",
};

const DISMISS_KEY = "pablo-dock-dismissed";

function pickMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
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

function MiniOrb({ status, size = 56 }: { status: Status; size?: number }) {
  const c = STATUS_COLOR[status];
  const speed = status === "listening" ? "1.4s" : status === "speaking" ? "1.8s" : status === "thinking" ? "2.2s" : "3.5s";
  return (
    <div style={{ width: size, height: size, position: "relative", pointerEvents: "none" }}>
      <div style={{
        position: "absolute", inset: 0, borderRadius: "50%",
        background: `radial-gradient(circle at 50% 50%, ${c} 0%, ${c}aa 30%, ${c}33 60%, transparent 80%)`,
        filter: "blur(2px)", animation: `pablo-dock-pulse ${speed} ease-in-out infinite`,
      }} />
      <div style={{
        position: "absolute", inset: "22%", borderRadius: "50%",
        background: `radial-gradient(circle at 45% 45%, #fff 0%, ${c} 50%, transparent 80%)`,
        opacity: 0.95, mixBlendMode: "screen",
      }} />
      <style>{`@keyframes pablo-dock-pulse { 0%,100% { transform: scale(1); opacity: 0.85; } 50% { transform: scale(1.08); opacity: 1; } }`}</style>
    </div>
  );
}

export function PabloDock() {
  const { isAuthenticated, logout } = useAuth();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });
  const [status, setStatus] = useState<Status>("idle");
  const [mode, setMode] = useState<Mode>("voice");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [textInput, setTextInput] = useState("");
  const [history, setHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const ttsRef = useRef<{ cancel: () => void } | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
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

  // Auto-cleanup when dock closes.
  useEffect(() => {
    if (!open) {
      cleanup();
      ttsRef.current?.cancel();
      setStatus("idle");
    }
  }, [open, cleanup]);

  const speak = useCallback((text: string) => new Promise<void>((resolve) => {
    setStatus("speaking");
    ttsRef.current?.cancel();
    ttsRef.current = speakWithTTS(text, () => { ttsRef.current = null; resolve(); }, () => { ttsRef.current = null; resolve(); });
  }), []);

  const sendToPablo = useCallback(async (text: string) => {
    setStatus("thinking");
    setReply("");
    setError("");
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
      if (mode === "voice") await speak(data.say);
      const action = data.action;
      if (action?.kind === "navigate") {
        setTimeout(() => { navigate(action.path); setOpen(false); }, 300);
      } else if (action?.kind === "logout") {
        setHistory([]); setReply(""); setTranscript("");
        setTimeout(() => { try { logout(); } catch { window.location.href = "/"; } }, 400);
      } else if (action?.kind === "search") {
        setTimeout(() => { navigate(`/?q=${encodeURIComponent(action.query)}`); setOpen(false); }, 300);
      } else if (action?.kind === "external") {
        try { window.open(action.url, "_blank", "noopener"); } catch {}
        setStatus("idle");
      } else {
        setStatus("idle");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[PabloDock] command failed:", msg);
      setError(`Pablo hit a snag.`);
      setStatus("idle");
    }
  }, [history, navigate, speak, mode, logout]);

  const startListening = useCallback(async () => {
    setError(""); setReply(""); setTranscript("");
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
          console.error("[PabloDock] transcribe failed:", err);
          setError("Couldn't hear that.");
          setStatus("idle");
        }
      };

      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
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
        for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
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
      console.error("[PabloDock] mic error:", err);
      setError("Microphone access required.");
      setStatus("idle");
    }
  }, [cleanup, sendToPablo]);

  const stopAll = useCallback(() => {
    ttsRef.current?.cancel();
    cleanup();
    setStatus("idle");
  }, [cleanup]);

  const onMicClick = useCallback(() => {
    if (mode === "text") return;
    if (status === "idle") startListening();
    else stopAll();
  }, [mode, status, startListening, stopAll]);

  const submitText = useCallback(() => {
    const t = textInput.trim();
    if (!t) return;
    setTextInput("");
    setTranscript(t);
    void sendToPablo(t);
  }, [textInput, sendToPablo]);

  const onDockTap = useCallback(() => {
    setOpen(true);
  }, []);

  const dismiss = useCallback(() => {
    setOpen(false);
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch {}
  }, []);

  if (!isAuthenticated || dismissed) return null;

  return (
    <>
      {/* Collapsed floating orb */}
      <AnimatePresence>
        {!open && (
          <motion.button
            key="dock-orb"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            onClick={onDockTap}
            aria-label="Summon Pablo"
            data-testid="pablo-dock-orb"
            className="fixed z-[60] outline-none focus:ring-2 focus:ring-purple-500/40 rounded-full"
            style={{
              right: "calc(env(safe-area-inset-right, 0px) + 16px)",
              bottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)",
              width: 56,
              height: 56,
              padding: 0,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              filter: "drop-shadow(0 4px 16px rgba(124,58,237,0.5))",
            }}
          >
            <MiniOrb status="idle" size={56} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Expanded panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="dock-panel"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed z-[60] flex flex-col"
            role="dialog"
            aria-label="Pablo command panel"
            style={{
              right: "calc(env(safe-area-inset-right, 0px) + 16px)",
              bottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)",
              width: "min(360px, calc(100vw - 32px))",
              maxHeight: "min(520px, calc(100vh - 120px))",
              borderRadius: 18,
              background: "linear-gradient(180deg, rgba(15,15,25,0.97) 0%, rgba(8,8,15,0.97) 100%)",
              border: `1px solid ${STATUS_COLOR[status]}55`,
              boxShadow: `0 20px 60px rgba(0,0,0,0.6), 0 0 30px ${STATUS_COLOR[status]}22`,
              backdropFilter: "blur(12px)",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/60 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <div style={{ width: 22, height: 22, flexShrink: 0 }}>
                  <MiniOrb status={status} size={22} />
                </div>
                <span className="font-mono text-[10px] tracking-[0.2em] text-zinc-400 truncate">
                  PABLO · {STATUS_LABEL[status]}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => { setMode(mode === "voice" ? "text" : "voice"); stopAll(); }}
                  className="p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
                  aria-label={mode === "voice" ? "Switch to text" : "Switch to voice"}
                  data-testid="pablo-dock-mode-toggle"
                >
                  {mode === "voice" ? <Keyboard className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
                  aria-label="Close"
                  data-testid="pablo-dock-close"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col items-center gap-4 min-h-0">
              <button
                onClick={onMicClick}
                disabled={mode === "text"}
                className="rounded-full outline-none focus:ring-2 focus:ring-purple-500/40 disabled:opacity-50"
                aria-label={STATUS_LABEL[status]}
                data-testid="pablo-dock-mic"
                style={{ background: "transparent", border: "none", padding: 0, cursor: mode === "text" ? "default" : "pointer" }}
              >
                <MiniOrb status={status} size={88} />
              </button>

              {/* Transcript / reply */}
              <div className="w-full text-center min-h-[40px]">
                {transcript && (
                  <p className="text-[11px] font-mono text-zinc-500 mb-1 break-words">
                    <span className="text-zinc-600">YOU · </span>{transcript}
                  </p>
                )}
                {reply && (
                  <p className="text-xs text-zinc-200 leading-relaxed break-words">{reply}</p>
                )}
                {error && (
                  <p className="text-[11px] font-mono text-rose-400 mt-1">{error}</p>
                )}
                {!transcript && !reply && !error && (
                  <p className="text-[11px] font-mono text-zinc-600 tracking-wider">
                    {mode === "voice" ? "TAP THE ORB AND SPEAK" : "TYPE A COMMAND BELOW"}
                  </p>
                )}
              </div>
            </div>

            {/* Text input footer (always present, but only used in text mode) */}
            {mode === "text" && (
              <div className="px-3 py-2 border-t border-zinc-800/60 flex items-center gap-2 shrink-0">
                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") submitText(); }}
                  placeholder="Tell Pablo what to do…"
                  className="flex-1 bg-zinc-900/60 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-purple-500/40"
                  data-testid="pablo-dock-text-input"
                />
                <button
                  onClick={submitText}
                  disabled={!textInput.trim()}
                  className="p-1.5 rounded text-purple-300 hover:text-purple-100 hover:bg-zinc-800/60 disabled:opacity-30 transition-colors"
                  aria-label="Send"
                  data-testid="pablo-dock-text-send"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Hide-for-session link */}
            <div className="px-3 pb-2 flex justify-center shrink-0">
              <button
                onClick={dismiss}
                className="text-[9px] font-mono tracking-[0.15em] text-zinc-700 hover:text-zinc-500 transition-colors"
                data-testid="pablo-dock-dismiss"
              >
                HIDE FOR THIS SESSION
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default PabloDock;
