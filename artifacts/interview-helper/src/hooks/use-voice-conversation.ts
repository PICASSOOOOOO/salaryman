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

  const reader = new FileReader();
  const base64 = await new Promise<string>((resolve, reject) => {
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
      body: JSON.stringify({ audio: base64, mimeType }),
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

  const ensureMicStream = useCallback(async (): Promise<MediaStream> => {
    if (micStreamRef.current) {
      const tracks = micStreamRef.current.getAudioTracks();
      if (tracks.length > 0 && tracks[0].readyState === 'live') {
        return micStreamRef.current;
      }
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }

    let constraints: MediaStreamConstraints = { audio: true };
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput' && d.deviceId);
      console.log(`[Conv] Available mics: ${audioInputs.map(d => `"${d.label}" (${d.deviceId.slice(0,8)})`).join(', ')}`);
      const realMic = audioInputs.find(d =>
        d.label && !d.label.toLowerCase().includes('virtual')
      );
      if (realMic) {
        constraints = { audio: { deviceId: { exact: realMic.deviceId } } };
        console.log(`[Conv] Preferring non-virtual mic: "${realMic.label}"`);
      }
    } catch {}

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    micStreamRef.current = stream;
    console.log(`[Conv] Got mic stream, device: ${stream.getAudioTracks()[0]?.label}`);
    return stream;
  }, []);

  const startListening = useCallback(async () => {
    if (!isConvModeRef.current || !activeRef.current) return;
    if (mediaRecorderRef.current) return;

    try {
      const stream = await ensureMicStream();
      if (!isConvModeRef.current || !activeRef.current) return;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        mediaRecorderRef.current = null;

        if (!isConvModeRef.current || !activeRef.current) {
          console.log('[Conv] onstop: conv mode inactive, skipping');
          return;
        }

        const chunks = audioChunksRef.current;
        const totalSize = chunks.reduce((a, b) => a + b.size, 0);
        console.log(`[Conv] onstop: ${chunks.length} chunks, totalSize=${totalSize}`);
        if (chunks.length === 0) {
          console.log('[Conv] No chunks, restarting listener');
          scheduleRestart(500, () => startListening());
          return;
        }

        setConvState('processing');

        const rawBlob = new Blob(chunks, { type: mimeType });
        let wavBlob: Blob;
        let sendMime = mimeType;
        try {
          console.log('[Conv] Converting WebM to WAV client-side...');
          const arrayBuf = await rawBlob.arrayBuffer();
          const actx = new AudioContext({ sampleRate: 16000 });
          const decoded = await actx.decodeAudioData(arrayBuf);
          const offline = new OfflineAudioContext(1, decoded.length, 16000);
          const bufSrc = offline.createBufferSource();
          bufSrc.buffer = decoded;
          bufSrc.connect(offline.destination);
          bufSrc.start();
          const rendered = await offline.startRendering();
          actx.close();
          const pcm = rendered.getChannelData(0);

          let sumSq = 0;
          for (let i = 0; i < pcm.length; i++) sumSq += pcm[i] * pcm[i];
          const rms = Math.sqrt(sumSq / pcm.length);
          console.log(`[Conv] WAV conversion: ${pcm.length} samples, rms=${rms.toFixed(4)}, duration=${(pcm.length/16000).toFixed(1)}s`);

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
          wavBlob = new Blob([wavBuf], { type: 'audio/wav' });
          sendMime = 'audio/wav';
          console.log(`[Conv] WAV blob: ${wavBlob.size} bytes`);
        } catch (e) {
          console.warn('[Conv] WAV conversion failed, sending raw WebM:', e);
          wavBlob = rawBlob;
        }

        const reader2 = new FileReader();
        const base64 = await new Promise<string>((resolve, reject) => {
          reader2.onloadend = () => {
            const result = reader2.result as string;
            const b64 = result.split(',')[1];
            if (b64) resolve(b64);
            else reject(new Error('Failed to encode'));
          };
          reader2.onerror = () => reject(new Error('FileReader error'));
          reader2.readAsDataURL(wavBlob);
        });

        console.log(`[Conv] Sending ${sendMime} (${Math.round(base64.length/1024)}KB) for transcription...`);

        fetch(`${import.meta.env.BASE_URL}api/transcribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio: base64, mimeType: sendMime }),
          signal: AbortSignal.timeout(30000),
        })
          .then(resp => resp.ok ? resp.json() : Promise.reject(new Error(`Server ${resp.status}`)))
          .then((data: { text?: string }) => data?.text?.trim() || '')
          .then(async (transcript) => {
            console.log(`[Conv] Transcription: "${transcript}"`);
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

            try {
              console.log(`[Conv] Sending to advisor: "${transcript.slice(0, 50)}..."`);
              const response = await onSend(transcript);
              console.log(`[Conv] Advisor response: "${(response || '').slice(0, 80)}..." (${(response || '').length} chars)`);
              if (!isConvModeRef.current || !activeRef.current) return;
              if (response) {
                onResponseReceived?.(response);
                setConvState('speaking');
                console.log('[Conv] Starting TTS...');
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
      console.log(`[Conv] Recording started, mimeType=${mimeType}`);

      silenceTimerRef.current = setTimeout(() => {
        silenceTimerRef.current = null;
        console.log('[Conv] Recording timeout (8s), stopping');
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }, 8000);

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
  }, [onSend, onResponseReceived, silenceTimeoutMs, cleanupMic, scheduleRestart, ensureMicStream]);

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
