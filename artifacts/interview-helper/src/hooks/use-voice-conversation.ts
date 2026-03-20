import { useState, useRef, useCallback, useEffect } from 'react';

export type ConvState = 'idle' | 'listening' | 'processing' | 'speaking';

interface UseVoiceConversationOptions {
  onSend: (transcript: string) => Promise<string>;
  onResponseReceived?: (text: string) => void;
  silenceTimeoutMs?: number;
}

function getSpeechRecognitionCtor() {
  const W = window as unknown as Record<string, unknown>;
  return (W.SpeechRecognition ?? W.webkitSpeechRecognition) as (new () => SpeechRecognitionLike) | undefined;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}

let cachedVoice: SpeechSynthesisVoice | null = null;
function resolveVoice(): void {
  const voices = window.speechSynthesis.getVoices();
  const en = voices.filter(v => v.lang.startsWith('en'));
  const natural = en.filter(v => /natural|premium|enhanced/i.test(v.name));
  cachedVoice = natural.find(v => /male|guy|david|james|daniel/i.test(v.name))
    || natural[0]
    || en.find(v => /male|guy|david|james|daniel/i.test(v.name))
    || en[0]
    || null;
}
if (typeof window !== 'undefined') {
  resolveVoice();
  window.speechSynthesis.addEventListener('voiceschanged', resolveVoice);
}

function speakText(text: string, onEnd: () => void): void {
  const clean = text.replace(/[#*`_~\[\]()>]/g, '').replace(/\n{2,}/g, '. ').replace(/\n/g, ' ');
  const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map(s => s.trim()).filter(Boolean) || [clean];

  window.speechSynthesis.cancel();

  const speakNext = (idx: number) => {
    if (idx >= sentences.length) { onEnd(); return; }
    const u = new SpeechSynthesisUtterance(sentences[idx]);
    u.lang = 'en-US';
    u.rate = 0.85;
    u.pitch = 1.0;
    if (cachedVoice) u.voice = cachedVoice;
    u.onend = () => setTimeout(() => speakNext(idx + 1), 180);
    u.onerror = onEnd;
    window.speechSynthesis.speak(u);
  };
  speakNext(0);
}

let sharedAudioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext {
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  return sharedAudioCtx;
}

function playReadyChime(): void {
  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  } catch {
  }
}

export function useVoiceConversation({
  onSend,
  onResponseReceived,
  silenceTimeoutMs = 3000,
}: UseVoiceConversationOptions) {
  const [convState, setConvState] = useState<ConvState>('idle');
  const [isConvMode, setIsConvMode] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef('');
  const activeRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isConvModeRef = useRef(false);
  const pendingTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    isConvModeRef.current = isConvMode;
  }, [isConvMode]);

  const clearAllTimers = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    for (const t of pendingTimersRef.current) clearTimeout(t);
    pendingTimersRef.current.clear();
  }, []);

  const scheduleRestart = useCallback((delayMs: number, fn: () => void) => {
    const id = setTimeout(() => {
      pendingTimersRef.current.delete(id);
      fn();
    }, delayMs);
    pendingTimersRef.current.add(id);
  }, []);

  const stopListening = useCallback(() => {
    clearAllTimers();
    if (recRef.current) {
      try { recRef.current.stop(); } catch {}
      recRef.current = null;
    }
  }, [clearAllTimers]);

  const startListening = useCallback(() => {
    if (!isConvModeRef.current || !activeRef.current) return;
    if (recRef.current) return;

    const SRCtor = getSpeechRecognitionCtor();
    if (!SRCtor) return;

    transcriptRef.current = '';

    const rec = new SRCtor();
    recRef.current = rec;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onresult = (ev) => {
      const full = Array.from(ev.results).map(r => r[0].transcript).join('');
      transcriptRef.current = full;
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        silenceTimerRef.current = null;
        if (recRef.current && isConvModeRef.current) {
          try { recRef.current.stop(); } catch {}
        }
      }, silenceTimeoutMs);
    };

    rec.onend = async () => {
      if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
      recRef.current = null;
      const transcript = transcriptRef.current.trim();

      if (!isConvModeRef.current || !activeRef.current) return;

      const STOP_PHRASES = ['goodbye pablo', 'bye pablo', 'stop conversation', 'end conversation', 'stop pablo'];
      if (STOP_PHRASES.some(p => transcript.toLowerCase().includes(p))) {
        stopListening();
        setIsConvMode(false);
        activeRef.current = false;
        isConvModeRef.current = false;
        setConvState('idle');
        return;
      }

      if (!transcript) {
        if (isConvModeRef.current && activeRef.current) {
          scheduleRestart(400, () => startListening());
        }
        return;
      }

      setConvState('processing');
      try {
        const response = await onSend(transcript);
        if (!isConvModeRef.current || !activeRef.current) return;
        if (response) {
          onResponseReceived?.(response);
          setConvState('speaking');
          speakText(response, () => {
            if (!isConvModeRef.current || !activeRef.current) {
              setConvState('idle');
              return;
            }
            playReadyChime();
            setConvState('listening');
            scheduleRestart(300, () => startListening());
          });
        } else {
          setConvState('listening');
          scheduleRestart(400, () => startListening());
        }
      } catch {
        if (isConvModeRef.current && activeRef.current) {
          setConvState('listening');
          scheduleRestart(1000, () => startListening());
        } else {
          setConvState('idle');
        }
      }
    };

    rec.onerror = (ev) => {
      if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
      recRef.current = null;
      if (ev.error === 'not-allowed' || ev.error === 'permission-denied') {
        setPermissionDenied(true);
        setIsConvMode(false);
        activeRef.current = false;
        isConvModeRef.current = false;
        setConvState('idle');
        return;
      }
      if (isConvModeRef.current && activeRef.current) {
        scheduleRestart(500, () => startListening());
      }
    };

    setConvState('listening');
    rec.start();
  }, [onSend, onResponseReceived, silenceTimeoutMs, stopListening, scheduleRestart]);

  const startConversation = useCallback(() => {
    const SRCtor = getSpeechRecognitionCtor();
    if (!SRCtor) return;
    setPermissionDenied(false);
    setIsConvMode(true);
    activeRef.current = true;
    isConvModeRef.current = true;
    window.speechSynthesis.cancel();
    playReadyChime();
    setConvState('listening');
    scheduleRestart(200, () => startListening());
  }, [startListening, scheduleRestart]);

  const stopConversation = useCallback(() => {
    activeRef.current = false;
    isConvModeRef.current = false;
    setIsConvMode(false);
    stopListening();
    window.speechSynthesis.cancel();
    setConvState('idle');
  }, [stopListening]);

  useEffect(() => {
    return () => {
      activeRef.current = false;
      isConvModeRef.current = false;
      clearAllTimers();
      if (recRef.current) { try { recRef.current.stop(); } catch {} recRef.current = null; }
      window.speechSynthesis.cancel();
    };
  }, [clearAllTimers]);

  const isSupported = !!getSpeechRecognitionCtor();

  return {
    convState,
    isConvMode,
    isSupported,
    permissionDenied,
    startConversation,
    stopConversation,
  };
}
