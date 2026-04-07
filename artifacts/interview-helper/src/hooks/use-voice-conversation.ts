import { useState, useRef, useCallback, useEffect } from 'react';
import { speakWithTTS } from '../lib/tts';

export type ConvState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

interface UseVoiceConversationOptions {
  onSend: (transcript: string) => Promise<string>;
  onResponseReceived?: (text: string) => void;
  silenceTimeoutMs?: number;
}

const isIOS = typeof navigator !== 'undefined' && (
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
);
const isSafari = typeof navigator !== 'undefined' &&
  /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
const isMobile = typeof navigator !== 'undefined' &&
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

let sharedAudioCtx: AudioContext | null = null;
function getOrCreateAudioCtx(): AudioContext {
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    const Ctor = window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedAudioCtx = new Ctor();
  }
  return sharedAudioCtx;
}

async function warmAudioCtx(): Promise<AudioContext> {
  const ctx = getOrCreateAudioCtx();
  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch {}
  }
  if (ctx.state === 'suspended' && isIOS) {
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
    try { await ctx.resume(); } catch {}
  }
  return ctx;
}

function playReadyChime(): void {
  try {
    const ctx = getOrCreateAudioCtx();
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
  } catch {}
}

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = isIOS || isSafari
    ? ['audio/mp4', 'audio/aac', 'audio/webm;codecs=opus', 'audio/webm', 'audio/wav']
    : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/wav'];
  for (const mt of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mt)) return mt;
    } catch {}
  }
  return '';
}

async function transcribeAudio(chunks: Blob[], mimeType: string): Promise<string> {
  const rawBlob = new Blob(chunks, { type: mimeType || 'audio/webm' });

  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const b64 = result.split(',')[1];
      if (b64) resolve(b64);
      else reject(new Error('Failed to encode audio'));
    };
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsDataURL(rawBlob);
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const resp = await fetch(`${import.meta.env.BASE_URL}api/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: base64, mimeType: mimeType || 'audio/webm' }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      throw new Error(`Server ${resp.status}: ${errBody.slice(0, 200)}`);
    }
    const data = await resp.json() as { text?: string };
    return data?.text?.trim() || '';
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export function useVoiceConversation({
  onSend,
  onResponseReceived,
  silenceTimeoutMs = 8000,
}: UseVoiceConversationOptions) {
  const [convState, setConvState] = useState<ConvState>('idle');
  const [isConvMode, setIsConvMode] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const activeRef = useRef(false);
  const isConvModeRef = useRef(false);
  const pendingTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const ttsHandleRef = useRef<{ cancel: () => void } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);

  useEffect(() => {
    isConvModeRef.current = isConvMode;
  }, [isConvMode]);

  const cancelTTS = useCallback(() => {
    if (ttsHandleRef.current) {
      ttsHandleRef.current.cancel();
      ttsHandleRef.current = null;
    }
  }, []);

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

  const cleanupMic = useCallback(() => {
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state === 'recording') {
        try { mediaRecorderRef.current.stop(); } catch {}
      }
      mediaRecorderRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
  }, []);

  const stopListening = useCallback(() => {
    clearAllTimers();
    cleanupMic();
  }, [clearAllTimers, cleanupMic]);

  const getMicStream = useCallback(async (): Promise<MediaStream> => {
    if (micStreamRef.current) {
      const existingTrack = micStreamRef.current.getAudioTracks()[0];
      if (existingTrack && existingTrack.readyState === 'live') {
        return micStreamRef.current;
      }
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }

    let constraints: MediaStreamConstraints = {
      audio: isMobile
        ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        : true,
    };

    if (!isMobile) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(d => d.kind === 'audioinput' && d.deviceId && d.label);
        if (audioInputs.length > 0) {
          const label = (d: MediaDeviceInfo) => d.label.toLowerCase();
          const isVirtual = (d: MediaDeviceInfo) => label(d).includes('virtual');
          const isBluetooth = (d: MediaDeviceInfo) => label(d).includes('airpod') || label(d).includes('bluetooth') || label(d).includes('beats') || label(d).includes('jabra') || label(d).includes('sony wh') || label(d).includes('bose');
          const isAux = (d: MediaDeviceInfo) => label(d).includes('headset') || label(d).includes('headphone') || label(d).includes('earphone') || label(d).includes('aux') || label(d).includes('wired');
          const realDevices = audioInputs.filter(d => !isVirtual(d));
          const preferred = realDevices.find(d => isBluetooth(d)) || realDevices.find(d => isAux(d)) || realDevices[0];
          if (preferred) {
            constraints = { audio: { deviceId: { exact: preferred.deviceId } } };
          }
        }
      } catch {}
    }

    console.log('[Conv] Requesting mic with constraints:', JSON.stringify(constraints));
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    micStreamRef.current = stream;
    const track = stream.getAudioTracks()[0];
    console.log(`[Conv] Got mic stream: "${track?.label}", readyState=${track?.readyState}`);
    return stream;
  }, []);

  const startListening = useCallback(async () => {
    if (!isConvModeRef.current || !activeRef.current) return;
    if (mediaRecorderRef.current) return;

    try {
      console.log('[Conv] startListening: getting mic...');
      const stream = await getMicStream();
      if (!isConvModeRef.current || !activeRef.current) return;

      const mimeType = pickMimeType();
      console.log(`[Conv] Selected MIME type: "${mimeType}" (iOS=${isIOS}, Safari=${isSafari})`);

      if (!mimeType) {
        console.error('[Conv] No supported MediaRecorder MIME type');
        setErrorMsg('Voice recording not supported on this browser');
        setConvState('error');
        return;
      }

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, { mimeType });
      } catch (mrErr) {
        console.error('[Conv] MediaRecorder creation failed:', mrErr);
        try {
          recorder = new MediaRecorder(stream);
          console.log(`[Conv] Fallback MediaRecorder, mimeType=${recorder.mimeType}`);
        } catch (mrErr2) {
          console.error('[Conv] Fallback MediaRecorder also failed:', mrErr2);
          setErrorMsg('Cannot create audio recorder');
          setConvState('error');
          return;
        }
      }

      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      const actualMime = recorder.mimeType || mimeType;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onerror = (e: any) => {
        console.error('[Conv] MediaRecorder error:', e?.error || e);
        mediaRecorderRef.current = null;
        if (isConvModeRef.current && activeRef.current) {
          scheduleRestart(1000, () => startListening());
        }
      };

      recorder.onstop = async () => {
        mediaRecorderRef.current = null;

        if (!isConvModeRef.current || !activeRef.current) {
          console.log('[Conv] onstop: conv mode inactive, skipping');
          return;
        }

        const chunks = [...audioChunksRef.current];
        const totalSize = chunks.reduce((a, b) => a + b.size, 0);
        console.log(`[Conv] onstop: ${chunks.length} chunks, totalSize=${totalSize}, mime=${actualMime}`);

        if (chunks.length === 0 || totalSize < 100) {
          console.log('[Conv] No meaningful audio, restarting listener');
          retryCountRef.current++;
          if (retryCountRef.current > 5) {
            setErrorMsg('Microphone not capturing audio — check mic permissions');
            setConvState('error');
            return;
          }
          scheduleRestart(500, () => startListening());
          return;
        }

        retryCountRef.current = 0;
        setConvState('processing');
        console.log('[Conv] Sending audio for transcription...');

        try {
          const transcript = await transcribeAudio(chunks, actualMime);
          console.log(`[Conv] Transcript: "${transcript}"`);
          if (!isConvModeRef.current || !activeRef.current) return;

          if (!transcript) {
            console.log('[Conv] Empty transcript, restarting listener');
            setConvState('listening');
            scheduleRestart(400, () => startListening());
            return;
          }

          const STOP_PHRASES = ['goodbye pablo', 'bye pablo', 'stop conversation', 'end conversation', 'stop pablo'];
          if (STOP_PHRASES.some(p => transcript.toLowerCase().includes(p))) {
            cleanupMic();
            setIsConvMode(false);
            activeRef.current = false;
            isConvModeRef.current = false;
            setConvState('idle');
            return;
          }

          console.log(`[Conv] Sending to advisor: "${transcript.slice(0, 50)}..."`);
          const response = await onSend(transcript);
          console.log(`[Conv] Response: "${(response || '').slice(0, 80)}..." (${(response || '').length} chars)`);
          if (!isConvModeRef.current || !activeRef.current) return;

          if (response) {
            onResponseReceived?.(response);
            setConvState('speaking');
            console.log('[Conv] Starting TTS...');
            await warmAudioCtx();
            ttsHandleRef.current = speakWithTTS(response, () => {
              ttsHandleRef.current = null;
              if (!isConvModeRef.current || !activeRef.current) {
                setConvState('idle');
                return;
              }
              playReadyChime();
              setConvState('listening');
              scheduleRestart(300, () => startListening());
            }, () => {
              ttsHandleRef.current = null;
              if (!isConvModeRef.current || !activeRef.current) {
                setConvState('idle');
                return;
              }
              setConvState('listening');
              scheduleRestart(1000, () => startListening());
            });
          } else {
            setConvState('listening');
            scheduleRestart(400, () => startListening());
          }
        } catch (err: any) {
          console.error('[Conv] Processing error:', err);
          if (isConvModeRef.current && activeRef.current) {
            setConvState('listening');
            scheduleRestart(1000, () => startListening());
          } else {
            setConvState('idle');
          }
        }
      };

      setConvState('listening');
      setErrorMsg(null);

      const timeslice = isIOS ? 500 : 1000;
      recorder.start(timeslice);
      console.log(`[Conv] Recording started, mimeType=${actualMime}, timeslice=${timeslice}ms`);

      silenceTimerRef.current = setTimeout(() => {
        silenceTimerRef.current = null;
        console.log('[Conv] Recording timeout, stopping');
        if (mediaRecorderRef.current?.state === 'recording') {
          try { mediaRecorderRef.current.stop(); } catch {}
        }
      }, silenceTimeoutMs);

    } catch (err: any) {
      console.error('[Conv] startListening error:', err?.name, err?.message, err);

      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setPermissionDenied(true);
        setErrorMsg('Microphone access denied — enable it in browser settings');
        setIsConvMode(false);
        activeRef.current = false;
        isConvModeRef.current = false;
        setConvState('error');
      } else if (err?.name === 'NotFoundError') {
        setErrorMsg('No microphone found on this device');
        setIsConvMode(false);
        activeRef.current = false;
        isConvModeRef.current = false;
        setConvState('error');
      } else if (err?.name === 'NotReadableError' || err?.name === 'AbortError') {
        setErrorMsg('Microphone is in use by another app');
        if (isConvModeRef.current && activeRef.current) {
          scheduleRestart(2000, () => startListening());
        }
      } else if (isConvModeRef.current && activeRef.current) {
        setErrorMsg(`Mic error: ${err?.message || 'unknown'}`);
        scheduleRestart(1500, () => {
          setErrorMsg(null);
          startListening();
        });
      }
    }
  }, [onSend, onResponseReceived, silenceTimeoutMs, cleanupMic, scheduleRestart, getMicStream]);

  const startConversation = useCallback(async () => {
    console.log('[Conv] === startConversation called ===');
    setPermissionDenied(false);
    setErrorMsg(null);
    retryCountRef.current = 0;

    try {
      await warmAudioCtx();
      console.log('[Conv] AudioContext warmed up');
    } catch (e) {
      console.warn('[Conv] AudioContext warm-up failed (continuing):', e);
    }

    setIsConvMode(true);
    activeRef.current = true;
    isConvModeRef.current = true;
    cancelTTS();
    playReadyChime();
    setConvState('listening');

    scheduleRestart(300, () => startListening());
  }, [startListening, scheduleRestart, cancelTTS]);

  const stopConversation = useCallback(() => {
    console.log('[Conv] === stopConversation called ===');
    activeRef.current = false;
    isConvModeRef.current = false;
    setIsConvMode(false);
    setErrorMsg(null);
    stopListening();
    cancelTTS();
    setConvState('idle');
  }, [stopListening, cancelTTS]);

  useEffect(() => {
    return () => {
      activeRef.current = false;
      isConvModeRef.current = false;
      clearAllTimers();
      cleanupMic();
      if (ttsHandleRef.current) { ttsHandleRef.current.cancel(); ttsHandleRef.current = null; }
    };
  }, [clearAllTimers, cleanupMic]);

  const isSupported = typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined';

  return {
    convState,
    isConvMode,
    isSupported,
    permissionDenied,
    errorMsg,
    startConversation,
    stopConversation,
  };
}
