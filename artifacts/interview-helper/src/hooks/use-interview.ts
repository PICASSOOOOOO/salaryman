import { useState, useRef, useCallback } from 'react';

export type InterviewMode = 'hint' | 'solution' | 'explain' | 'complexity' | 'say_it';
export type SolverStatus = 'idle' | 'thinking' | 'streaming' | 'done' | 'error';
export type ListenStatus = 'idle' | 'recording' | 'transcribing' | 'done' | 'error';

async function streamSSE(
  url: string,
  body: object,
  signal: AbortSignal,
  onChunk: (content: string) => void,
  onDone: () => void,
  onError: (msg: string) => void
) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  if (!reader) throw new Error('No stream');

  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim().startsWith('data:')) continue;
      const jsonStr = line.replace(/^data:\s*/, '').trim();
      if (!jsonStr || jsonStr === '[DONE]') continue;
      try {
        const data = JSON.parse(jsonStr);
        if (data.error) onError(data.error);
        if (data.content) onChunk(data.content);
        if (data.done) onDone();
      } catch {}
    }
  }
}

export function useInterviewSolver() {
  const [response, setResponse] = useState('');
  const [status, setStatus] = useState<SolverStatus>('idle');
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus('done');
  }, []);

  const reset = useCallback(() => {
    cancel();
    setResponse('');
    setStatus('idle');
  }, [cancel]);

  const solve = useCallback(async (question: string, language: string, mode: InterviewMode) => {
    if (!question.trim()) return;
    cancel();
    setResponse('');
    setStatus('thinking');
    abortRef.current = new AbortController();
    try {
      await streamSSE(
        '/api/interview/solve',
        { question, language, mode },
        abortRef.current.signal,
        (c) => { setResponse(prev => prev + c); setStatus('streaming'); },
        () => setStatus('done'),
        () => setStatus('error')
      );
      setStatus(prev => prev === 'error' ? 'error' : 'done');
    } catch (e: any) {
      if (e.name !== 'AbortError') setStatus('error');
    } finally {
      abortRef.current = null;
    }
  }, [cancel]);

  return {
    response, status, solve, cancel, reset,
    isStreaming: status === 'thinking' || status === 'streaming'
  };
}

export function useVoiceListen() {
  const [listenStatus, setListenStatus] = useState<ListenStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const [answer, setAnswer] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const base64 = await blobToBase64(blob);

        setListenStatus('transcribing');
        setAnswer('');
        setTranscript('');

        abortRef.current = new AbortController();
        try {
          await streamSSE(
            '/api/interview/listen',
            { audio: base64 },
            abortRef.current.signal,
            (c) => { setAnswer(prev => prev + c); },
            () => setListenStatus('done'),
            () => setListenStatus('error')
          );
          // also pull transcript from a header if we get it
          setListenStatus('done');
        } catch (e: any) {
          if (e.name !== 'AbortError') setListenStatus('error');
        } finally {
          abortRef.current = null;
        }
      };

      recorder.start();
      setListenStatus('recording');
      setAnswer('');
      setTranscript('');
    } catch {
      setListenStatus('error');
    }
  }, []);

  const stopListening = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    mediaRecorderRef.current?.stop();
    setListenStatus('idle');
    setAnswer('');
    setTranscript('');
  }, []);

  return {
    listenStatus,
    transcript,
    answer,
    startListening,
    stopListening,
    reset,
    isRecording: listenStatus === 'recording',
    isProcessing: listenStatus === 'transcribing',
  };
}

export type ScanStatus = 'idle' | 'connecting' | 'ready' | 'analyzing' | 'done' | 'error';

export function useScreenScan() {
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [answer, setAnswer] = useState('');
  const [autoPilot, setAutoPilot] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [intervalSecs, setIntervalSecs] = useState(15);

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.82).split(',')[1];
  }, []);

  const analyzeFrame = useCallback(async (base64: string) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setAnswer('');
    setScanStatus('analyzing');
    try {
      await streamSSE(
        '/api/interview/scan',
        { image: base64 },
        abortRef.current.signal,
        (c) => setAnswer(prev => prev + c),
        () => setScanStatus('done'),
        () => setScanStatus('error')
      );
      setScanStatus('done');
    } catch (e: any) {
      if (e.name !== 'AbortError') setScanStatus('error');
    } finally {
      abortRef.current = null;
    }
  }, []);

  const startCountdown = useCallback((secs: number) => {
    setCountdown(secs);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(countdownRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const stopStream = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    abortRef.current?.abort();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    videoRef.current = null;
    setAutoPilot(false);
    setCountdown(0);
    setScanStatus('idle');
    setAnswer('');
  }, []);

  const openStream = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({ video: { frameRate: 1 }, audio: false });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await new Promise<void>(res => { video.onloadedmetadata = () => res(); });
      await video.play();
      await new Promise(r => setTimeout(r, 400));
      streamRef.current = stream;
      videoRef.current = video;
      stream.getTracks().forEach((t: MediaStreamTrack) => {
        t.onended = () => stopStream();
      });
      return true;
    } catch (e: any) {
      if (e.name !== 'NotAllowedError') setScanStatus('error');
      return false;
    }
  }, [stopStream]);

  const scanOnce = useCallback(async () => {
    setScanStatus('connecting');
    const needStream = !streamRef.current;
    if (needStream) {
      const ok = await openStream();
      if (!ok) { setScanStatus('idle'); return; }
    }
    setScanStatus('ready');
    const base64 = captureFrame();
    if (base64) await analyzeFrame(base64);
  }, [openStream, captureFrame, analyzeFrame]);

  const startAutoPilot = useCallback(async (secs?: number) => {
    const period = secs ?? intervalSecs;
    setScanStatus('connecting');
    const ok = await openStream();
    if (!ok) { setScanStatus('idle'); return; }

    setAutoPilot(true);
    const base64 = captureFrame();
    if (base64) await analyzeFrame(base64);

    startCountdown(period);
    intervalRef.current = setInterval(async () => {
      const frame = captureFrame();
      if (frame) await analyzeFrame(frame);
      startCountdown(period);
    }, period * 1000);
  }, [openStream, captureFrame, analyzeFrame, startCountdown, intervalSecs]);

  const reset = useCallback(() => {
    stopStream();
  }, [stopStream]);

  return {
    scanStatus,
    answer,
    autoPilot,
    countdown,
    intervalSecs,
    setIntervalSecs,
    scanOnce,
    startAutoPilot,
    stopStream,
    reset,
    isConnecting: scanStatus === 'connecting',
    isAnalyzing: scanStatus === 'analyzing',
    isReady: scanStatus === 'ready' || scanStatus === 'done',
  };
}

const NEARBY_KEYS: Record<string, string> = {
  a:'sq', b:'vn', c:'xv', d:'sf', e:'wr', f:'dg', g:'fh', h:'gj', i:'uo', j:'hk',
  k:'jl', l:'kp', m:'nj', n:'bm', o:'ip', p:'ol', q:'wa', r:'et', s:'ad', t:'ry',
  u:'yi', v:'cb', w:'qe', x:'zc', y:'tu', z:'ax',
};

function charDelay(ch: string, prev: string): number {
  if (ch === '\n') return 350 + Math.random() * 500;
  if (ch === ' ') return 80 + Math.random() * 120;
  if ('({['.includes(prev)) return 100 + Math.random() * 150;
  if (':'.includes(prev)) return 200 + Math.random() * 300;
  return 55 + Math.random() * 100;
}

export function useTypingSimulator() {
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const cancelRef = useRef(false);
  const pauseRef = useRef(0);

  const sleep = (ms: number) => new Promise<void>(resolve => {
    const id = setTimeout(resolve, ms);
    pauseRef.current = id as unknown as number;
  });

  const start = useCallback(async (text: string) => {
    cancelRef.current = false;
    setDisplayedText('');
    setIsDone(false);
    setIsTyping(true);

    let typed = '';
    let charsSinceBreak = 0;

    for (let i = 0; i < text.length; i++) {
      if (cancelRef.current) break;

      const ch = text[i];
      const prev = i > 0 ? text[i - 1] : '';

      // Random "thinking pause" every 20–35 chars
      charsSinceBreak++;
      if (charsSinceBreak > 20 + Math.random() * 15 && ch !== '\n') {
        charsSinceBreak = 0;
        await sleep(500 + Math.random() * 900);
        if (cancelRef.current) break;
      }

      // Occasional typo on lowercase letters (~4% chance)
      const isLower = ch >= 'a' && ch <= 'z';
      if (isLower && Math.random() < 0.04) {
        const nearby = NEARBY_KEYS[ch] ?? 'x';
        const wrongChar = nearby[Math.floor(Math.random() * nearby.length)];
        const mistakeLen = 1 + Math.floor(Math.random() * 2);

        // Type the wrong chars
        for (let m = 0; m < mistakeLen; m++) {
          typed += wrongChar;
          setDisplayedText(typed);
          await sleep(70 + Math.random() * 60);
          if (cancelRef.current) break;
        }

        // Pause — "wait, that's wrong"
        await sleep(180 + Math.random() * 150);

        // Backspace them
        for (let m = 0; m < mistakeLen; m++) {
          typed = typed.slice(0, -1);
          setDisplayedText(typed);
          await sleep(80 + Math.random() * 60);
          if (cancelRef.current) break;
        }
        if (cancelRef.current) break;
        await sleep(60 + Math.random() * 80);
      }

      typed += ch;
      setDisplayedText(typed);
      await sleep(charDelay(ch, prev));
    }

    if (!cancelRef.current) setIsDone(true);
    setIsTyping(false);
  }, []);

  const stop = useCallback(() => {
    cancelRef.current = true;
    clearTimeout(pauseRef.current);
    setIsTyping(false);
  }, []);

  const reset = useCallback(() => {
    stop();
    setDisplayedText('');
    setIsDone(false);
  }, [stop]);

  return { displayedText, isTyping, isDone, start, stop, reset };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
