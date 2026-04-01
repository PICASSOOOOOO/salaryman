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
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      const source = audioCtx.createMediaStreamSource(stream);

      const pcmChunks: Float32Array[] = [];
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      let speechDetected = false;
      let silentFrames = 0;
      let recording = true;
      const SILENCE_THRESHOLD = 0.01;
      const SILENCE_FRAMES_NEEDED = Math.ceil(silenceTimeoutMs / (4096 / audioCtx.sampleRate * 1000));
      const MIN_RECORD_MS = 2000;
      const recordingStartTime = Date.now();
      let frameCount = 0;

      processor.onaudioprocess = (e) => {
        if (!recording) return;
        const input = e.inputBuffer.getChannelData(0);
        pcmChunks.push(new Float32Array(input));

        let sum = 0;
        for (let i = 0; i < input.length; i++) {
          sum += input[i] * input[i];
        }
        const rms = Math.sqrt(sum / input.length);
        frameCount++;
        const elapsed = Date.now() - recordingStartTime;

        if (frameCount % 10 === 0) {
          console.log(`[Conv] PCM rms=${rms.toFixed(4)}, speechDetected=${speechDetected}, silentFrames=${silentFrames}/${SILENCE_FRAMES_NEEDED}, elapsed=${Math.round(elapsed/1000)}s, chunks=${pcmChunks.length}`);
        }

        if (rms > SILENCE_THRESHOLD) {
          speechDetected = true;
          silentFrames = 0;
        } else if (speechDetected && elapsed > MIN_RECORD_MS) {
          silentFrames++;
          if (silentFrames >= SILENCE_FRAMES_NEEDED) {
            console.log('[Conv] Silence detected after speech, stopping');
            recording = false;
            stopAndProcess();
          }
        }
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);

      const stopAndProcess = () => {
        recording = false;
        processor.disconnect();
        source.disconnect();
        stream.getTracks().forEach(t => t.stop());
        micStreamRef.current = null;
        try { audioCtx.close(); } catch {}
        audioCtxRef.current = null;
        mediaRecorderRef.current = null;

        if (!isConvModeRef.current || !activeRef.current) {
          console.log('[Conv] onstop: conv mode inactive, skipping');
          return;
        }

        if (pcmChunks.length === 0) {
          console.log('[Conv] No PCM data, restarting listener');
          scheduleRestart(500, () => startListening());
          return;
        }

        const totalSamples = pcmChunks.reduce((a, c) => a + c.length, 0);
        console.log(`[Conv] Building WAV from ${pcmChunks.length} PCM chunks, ${totalSamples} samples`);

        const targetRate = 16000;
        const ratio = audioCtx.sampleRate / targetRate;
        const resampledLength = Math.floor(totalSamples / ratio);
        const wavBuf = new ArrayBuffer(44 + resampledLength * 2);
        const view = new DataView(wavBuf);
        const writeStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
        writeStr(0, 'RIFF');
        view.setUint32(4, 36 + resampledLength * 2, true);
        writeStr(8, 'WAVE');
        writeStr(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, targetRate, true);
        view.setUint32(28, targetRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeStr(36, 'data');
        view.setUint32(40, resampledLength * 2, true);

        let srcIdx = 0;
        let chunkIdx = 0;
        let chunkOffset = 0;
        for (let i = 0; i < resampledLength; i++) {
          const srcPos = Math.floor(i * ratio);
          while (srcIdx < srcPos) {
            chunkOffset++;
            if (chunkOffset >= pcmChunks[chunkIdx].length) {
              chunkIdx++;
              chunkOffset = 0;
            }
            srcIdx++;
          }
          if (chunkIdx < pcmChunks.length && chunkOffset < pcmChunks[chunkIdx].length) {
            const s = Math.max(-1, Math.min(1, pcmChunks[chunkIdx][chunkOffset]));
            view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
          }
        }

        const wavBlob = new Blob([wavBuf], { type: 'audio/wav' });
        console.log(`[Conv] WAV blob: ${wavBlob.size} bytes, duration=${(resampledLength/targetRate).toFixed(1)}s`);

        setConvState('processing');
        console.log('[Conv] Transcribing WAV...');

        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1];
          if (!base64) {
            console.error('[Conv] Failed to encode WAV');
            scheduleRestart(500, () => startListening());
            return;
          }

          fetch(`${import.meta.env.BASE_URL}api/transcribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio: base64, mimeType: 'audio/wav' }),
          })
            .then(resp => resp.json())
            .then(async (data: { text?: string }) => {
              const transcript = data?.text?.trim() || '';
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
        reader.readAsDataURL(wavBlob);
      };

      mediaRecorderRef.current = { stop: stopAndProcess, state: 'recording' } as unknown as MediaRecorder;

      setConvState('listening');
      console.log(`[Conv] PCM recording started, sampleRate=${audioCtx.sampleRate}, silenceTimeout=${silenceTimeoutMs}ms`);

      silenceTimerRef.current = setTimeout(() => {
        silenceTimerRef.current = null;
        console.log('[Conv] Max recording timeout (10s), stopping');
        if (recording) stopAndProcess();
      }, 10000);

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
