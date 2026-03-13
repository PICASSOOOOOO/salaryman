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

export function useScreenScan() {
  const [scanStatus, setScanStatus] = useState<'idle' | 'capturing' | 'analyzing' | 'done' | 'error'>('idle');
  const [answer, setAnswer] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const scanScreen = useCallback(async () => {
    setScanStatus('capturing');
    setAnswer('');
    abortRef.current?.abort();

    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({ video: { frameRate: 1 }, audio: false });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await new Promise<void>((resolve) => { video.onloadedmetadata = () => resolve(); });
      await video.play();

      await new Promise(r => setTimeout(r, 300));

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')!.drawImage(video, 0, 0);
      stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());

      const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];

      setScanStatus('analyzing');
      abortRef.current = new AbortController();

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
      if (e.name === 'NotAllowedError') {
        setScanStatus('idle');
      } else if (e.name !== 'AbortError') {
        setScanStatus('error');
      }
    } finally {
      abortRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setScanStatus('idle');
    setAnswer('');
  }, []);

  return {
    scanStatus,
    answer,
    scanScreen,
    reset,
    isCapturing: scanStatus === 'capturing',
    isAnalyzing: scanStatus === 'analyzing',
  };
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
