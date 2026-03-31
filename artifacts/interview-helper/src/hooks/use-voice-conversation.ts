import { useState, useRef, useCallback, useEffect } from 'react';
import { speakWithTTS } from '../lib/tts';

export type ConvState = 'idle' | 'listening' | 'processing' | 'speaking';

interface UseVoiceConversationOptions {
  onSend: (transcript: string) => Promise<string>;
  onResponseReceived?: (text: string) => void;
  silenceTimeoutMs?: number;
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

async function convertToWav(inputBlob: Blob): Promise<Blob> {
  try {
    const arrayBuf = await inputBlob.arrayBuffer();
    const actx = new AudioContext({ sampleRate: 16000 });
    const decoded = await actx.decodeAudioData(arrayBuf);
    const offline = new OfflineAudioContext(1, decoded.length, 16000);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start();
    const rendered = await offline.startRendering();
    actx.close();
    const pcm = rendered.getChannelData(0);
    const wavBuf = new ArrayBuffer(44 + pcm.length * 2);
    const view = new DataView(wavBuf);
    const writeStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + pcm.length * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true);
    view.setUint32(28, 32000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++) {
      const s = Math.max(-1, Math.min(1, pcm[i]));
      view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return new Blob([wavBuf], { type: 'audio/wav' });
  } catch (e) {
    console.warn('WAV conversion failed, using original:', e);
    return inputBlob;
  }
}

async function transcribeAudio(chunks: Blob[], mimeType: string): Promise<string> {
  const rawBlob = new Blob(chunks, { type: mimeType });
  const finalBlob = await convertToWav(rawBlob);
  const finalMime = finalBlob.type === 'audio/wav' ? 'audio/wav' : mimeType;

  const reader = new FileReader();
  const base64 = await new Promise<string>((resolve, reject) => {
    reader.onloadend = () => {
      const result = reader.result as string;
      const b64 = result.split(',')[1];
      if (b64) resolve(b64);
      else reject(new Error('Failed to encode audio'));
    };
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsDataURL(finalBlob);
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const resp = await fetch(`${import.meta.env.BASE_URL}api/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: base64, mimeType: finalMime }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!resp.ok) throw new Error(`Server error ${resp.status}`);
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

  const activeRef = useRef(false);
  const isConvModeRef = useRef(false);
  const pendingTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const ttsHandleRef = useRef<{ cancel: () => void } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const hasAudioRef = useRef(false);

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
    if (mediaRecorderRef.current?.state === 'recording') {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    mediaRecorderRef.current = null;
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    analyserRef.current = null;
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch {}
      audioCtxRef.current = null;
    }
  }, []);

  const stopListening = useCallback(() => {
    clearAllTimers();
    cleanupMic();
  }, [clearAllTimers, cleanupMic]);

  const startListening = useCallback(async () => {
    if (!isConvModeRef.current || !activeRef.current) return;
    if (mediaRecorderRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!isConvModeRef.current || !activeRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      micStreamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      hasAudioRef.current = false;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      const dataArr = new Uint8Array(analyser.frequencyBinCount);
      let speechDetected = false;
      let silentFrames = 0;
      const SILENCE_THRESHOLD = 8;
      const SILENCE_FRAMES_NEEDED = Math.ceil((silenceTimeoutMs / 1000) * 30);

      const checkAudioLevel = () => {
        if (!analyserRef.current || !mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') return;
        analyserRef.current.getByteFrequencyData(dataArr);
        const avg = dataArr.reduce((a, b) => a + b, 0) / dataArr.length;

        if (avg > SILENCE_THRESHOLD) {
          speechDetected = true;
          hasAudioRef.current = true;
          silentFrames = 0;
        } else if (speechDetected) {
          silentFrames++;
          if (silentFrames >= SILENCE_FRAMES_NEEDED) {
            if (mediaRecorderRef.current?.state === 'recording') {
              mediaRecorderRef.current.stop();
            }
            return;
          }
        }
        requestAnimationFrame(checkAudioLevel);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        micStreamRef.current = null;
        analyserRef.current = null;
        try { audioCtx.close(); } catch {}
        audioCtxRef.current = null;
        mediaRecorderRef.current = null;

        if (!isConvModeRef.current || !activeRef.current) return;

        const chunks = audioChunksRef.current;
        if (chunks.length === 0 || !hasAudioRef.current) {
          scheduleRestart(500, () => startListening());
          return;
        }

        setConvState('processing');
        transcribeAudio(chunks, mimeType)
          .then(async (transcript) => {
            if (!isConvModeRef.current || !activeRef.current) return;
            if (!transcript) {
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

            try {
              const response = await onSend(transcript);
              if (!isConvModeRef.current || !activeRef.current) return;
              if (response) {
                onResponseReceived?.(response);
                setConvState('speaking');
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
            } catch {
              if (isConvModeRef.current && activeRef.current) {
                setConvState('listening');
                scheduleRestart(1000, () => startListening());
              } else {
                setConvState('idle');
              }
            }
          })
          .catch(() => {
            if (isConvModeRef.current && activeRef.current) {
              setConvState('listening');
              scheduleRestart(1000, () => startListening());
            }
          });
      };

      setConvState('listening');
      recorder.start(1000);
      requestAnimationFrame(checkAudioLevel);

      silenceTimerRef.current = setTimeout(() => {
        silenceTimerRef.current = null;
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }, 30000);

    } catch (err: any) {
      console.error('Conv mode getUserMedia error:', err);
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setPermissionDenied(true);
        setIsConvMode(false);
        activeRef.current = false;
        isConvModeRef.current = false;
        setConvState('idle');
      } else if (isConvModeRef.current && activeRef.current) {
        scheduleRestart(1000, () => startListening());
      }
    }
  }, [onSend, onResponseReceived, silenceTimeoutMs, cleanupMic, scheduleRestart]);

  const startConversation = useCallback(() => {
    setPermissionDenied(false);
    setIsConvMode(true);
    activeRef.current = true;
    isConvModeRef.current = true;
    cancelTTS();
    playReadyChime();
    setConvState('listening');
    scheduleRestart(200, () => startListening());
  }, [startListening, scheduleRestart, cancelTTS]);

  const stopConversation = useCallback(() => {
    activeRef.current = false;
    isConvModeRef.current = false;
    setIsConvMode(false);
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

  const isSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  return {
    convState,
    isConvMode,
    isSupported,
    permissionDenied,
    startConversation,
    stopConversation,
  };
}
