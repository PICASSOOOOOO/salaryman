import { apiFetch } from '@/lib/api-client';
import { useState, useRef, useCallback, useEffect } from 'react';

export type InterviewMode = 'hint' | 'solution' | 'explain' | 'complexity' | 'say_it';
export type SolverStatus = 'idle' | 'thinking' | 'streaming' | 'done' | 'error';
export type ListenStatus = 'idle' | 'recording' | 'transcribing' | 'done' | 'error';

const BASE_URL = import.meta.env.BASE_URL;

async function streamSSE(
  url: string,
  body: object,
  signal: AbortSignal,
  onChunk: (content: string) => void,
  onDone: () => void,
  onError: (msg: string) => void
) {
  const resolvedUrl = url.startsWith('/api/') ? `${BASE_URL}${url.slice(1)}` : url;
  const res = await apiFetch(resolvedUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) throw new Error(`HTTP_${res.status}`);

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
  const [lastScanMode, setLastScanMode] = useState<'bullets' | 'chat'>('bullets');
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

  const analyzeFrame = useCallback(async (base64: string, responseMode: 'bullets' | 'chat' = 'bullets') => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setAnswer('');
    setLastScanMode(responseMode);
    setScanStatus('analyzing');
    try {
      await streamSSE(
        '/api/interview/scan',
        { image: base64, responseMode },
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
    if (base64) await analyzeFrame(base64, 'bullets');
  }, [openStream, captureFrame, analyzeFrame]);

  const scanChat = useCallback(async () => {
    setScanStatus('connecting');
    const needStream = !streamRef.current;
    if (needStream) {
      const ok = await openStream();
      if (!ok) { setScanStatus('idle'); return; }
    }
    setScanStatus('ready');
    const base64 = captureFrame();
    if (base64) await analyzeFrame(base64, 'chat');
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
    lastScanMode,
    intervalSecs,
    setIntervalSecs,
    scanOnce,
    scanChat,
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

function charDelay(ch: string, prev: string, fast = false): number {
  if (fast) {
    if (ch === '\n') return 120 + Math.random() * 180;
    if (ch === ' ') return 35 + Math.random() * 55;
    return 28 + Math.random() * 50;
  }
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

  const start = useCallback(async (text: string, speed: 'code' | 'chat' = 'code') => {
    const fast = speed === 'chat';
    cancelRef.current = false;
    setDisplayedText('');
    setIsDone(false);
    setIsTyping(true);

    let typed = '';
    let charsSinceBreak = 0;
    // Chat: short burst of rapid typing before brief pause; code: long thoughtful pauses
    const breakEvery = fast ? [35, 25] : [20, 15];
    const breakPause = fast ? [150, 250] : [500, 900];
    const typoRate = fast ? 0.02 : 0.04;

    for (let i = 0; i < text.length; i++) {
      if (cancelRef.current) break;

      const ch = text[i];
      const prev = i > 0 ? text[i - 1] : '';

      // Thinking pause
      charsSinceBreak++;
      if (charsSinceBreak > breakEvery[0] + Math.random() * breakEvery[1] && ch !== '\n') {
        charsSinceBreak = 0;
        await sleep(breakPause[0] + Math.random() * breakPause[1]);
        if (cancelRef.current) break;
      }

      // Occasional typo
      const isLower = ch >= 'a' && ch <= 'z';
      if (isLower && Math.random() < typoRate) {
        const nearby = NEARBY_KEYS[ch] ?? 'x';
        const wrongChar = nearby[Math.floor(Math.random() * nearby.length)];
        const mistakeLen = 1;

        typed += wrongChar;
        setDisplayedText(typed);
        await sleep(fast ? 40 : 70 + Math.random() * 60);
        if (cancelRef.current) break;

        await sleep(fast ? 100 : 180 + Math.random() * 150);

        typed = typed.slice(0, -1);
        setDisplayedText(typed);
        await sleep(fast ? 35 : 80 + Math.random() * 60);
        if (cancelRef.current) break;
        await sleep(fast ? 25 : 60 + Math.random() * 80);
      }

      typed += ch;
      setDisplayedText(typed);
      await sleep(charDelay(ch, prev, fast));
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

// ── Advisor Chat ─────────────────────────────────────────────────────────────

export interface ActionCard {
  type: string;
  to: string;
  tab?: string;
  label: string;
  description?: string;
  autoFill?: Record<string, unknown>;
}

export interface AgentInfo {
  provider: 'claude' | 'gpt';
  model: string;
  agentName: string;
  agentShort: string;
  requestType: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  action?: ActionCard;
  agent?: AgentInfo;
}

const CHAT_STORAGE_KEY = 'devdocs_chat_history';
const MEMORY_STORAGE_KEY = 'devdocs_business_memory';
const MAX_STORED_MESSAGES = 40;

function loadChatHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveChatHistory(msgs: ChatMessage[]) {
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(msgs.slice(-MAX_STORED_MESSAGES)));
  } catch {}
}

function loadBusinessMemoryLocal(): string {
  return localStorage.getItem(MEMORY_STORAGE_KEY) ?? '';
}

async function fetchBusinessMemory(): Promise<string> {
  try {
    const res = await apiFetch('/api/tools/memory');
    if (!res.ok) return loadBusinessMemoryLocal();
    const data = await res.json();
    return data.memory ?? loadBusinessMemoryLocal();
  } catch {
    return loadBusinessMemoryLocal();
  }
}

async function saveBusinessMemory(mem: string) {
  try { localStorage.setItem(MEMORY_STORAGE_KEY, mem); } catch {}
  try {
    await apiFetch('/api/tools/memory', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memory: mem }),
    });
  } catch {}
}

function parseAction(text: string): { clean: string; action?: ActionCard } {
  const match = text.match(/<action>([\s\S]*?)<\/action>/);
  if (!match) return { clean: text };
  try {
    const action = JSON.parse(match[1]) as ActionCard;
    const clean = text.replace(/<action>[\s\S]*?<\/action>/, '').trim();
    return { clean, action };
  } catch {
    return { clean: text.replace(/<action>[\s\S]*?<\/action>/, '').trim() };
  }
}

async function extractBusinessContext(
  messages: ChatMessage[],
  existingContext: string
): Promise<string> {
  try {
    const res = await apiFetch('/api/interview/extract-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: messages.slice(-12).map(m => ({ role: m.role, content: m.content })),
        existingContext,
      }),
    });
    const data = await res.json();
    return data.context ?? existingContext;
  } catch {
    return existingContext;
  }
}

export function useAdvisorChat() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadChatHistory());
  const [businessMemory, setBusinessMemory] = useState<string>(() => loadBusinessMemoryLocal());
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentAgent, setCurrentAgent] = useState<AgentInfo | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchBusinessMemory().then(mem => {
      if (mem) setBusinessMemory(mem);
    });
  }, []);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;

    const userMsg: ChatMessage = { role: 'user', content: text.trim() };
    const history = [...messages, userMsg];
    const withPlaceholder: ChatMessage[] = [...history, { role: 'assistant', content: '' }];
    setMessages(withPlaceholder);
    saveChatHistory(withPlaceholder);
    setIsStreaming(true);
    setCurrentAgent(null);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    let fullText = '';
    let detectedAgent: AgentInfo | null = null;

    const advisorUrl = `${import.meta.env.BASE_URL}api/interview/advisor`;

    const friendlyError = (raw: string): string => {
      if (raw.includes('HTTP_401') || raw.includes('HTTP_403')) return 'AI service is not configured — contact support';
      if (raw.includes('HTTP_429')) return 'rate limit reached — please wait a moment and try again';
      if (raw.includes('HTTP_5')) return 'AI service is temporarily unavailable — please try again shortly';
      if (raw === 'Failed to get response') return 'AI service is temporarily unavailable — please try again shortly';
      if (raw === 'No stream') return 'connection dropped — please try again';
      return 'connection error — please try again';
    };

    const handleError = (reason: string) => {
      const errMsg: ChatMessage = { role: 'assistant', content: `⚠️ ${friendlyError(reason)}` };
      const finalHistory = [...history, errMsg];
      setMessages(finalHistory);
      saveChatHistory(finalHistory);
      setIsStreaming(false);
    };

    try {
      const res = await apiFetch(advisorUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history.map(m => ({ role: m.role, content: m.content })),
          businessMemory,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok) throw new Error(`HTTP_${res.status}`);

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
            if (data.agent) {
              detectedAgent = data.agent as AgentInfo;
              setCurrentAgent(detectedAgent);
            }
            if (data.content) {
              fullText += data.content;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: fullText, agent: detectedAgent ?? undefined };
                return updated;
              });
            }
            if (data.done) {
              const { clean, action } = parseAction(fullText);
              const finalMsg: ChatMessage = { role: 'assistant', content: clean, action, agent: detectedAgent ?? undefined };
              const finalHistory = [...history, finalMsg];
              setMessages(finalHistory);
              saveChatHistory(finalHistory);
              setIsStreaming(false);

              const currentMem = loadBusinessMemoryLocal();
              extractBusinessContext(finalHistory, currentMem).then(newMem => {
                if (newMem !== currentMem) {
                  setBusinessMemory(newMem);
                  saveBusinessMemory(newMem);
                }
              });
            }
            if (data.error) {
              handleError(data.error);
            }
          } catch {}
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setIsStreaming(false);
      } else {
        handleError(err instanceof Error ? err.message : 'unknown error');
      }
    }
  }, [messages, isStreaming, businessMemory]);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const sendVoice = useCallback(async (transcript: string): Promise<string> => {
    if (!transcript.trim()) return '';
    const userMsg: ChatMessage = { role: 'user', content: transcript.trim() };
    setIsStreaming(true);

    const snapshotHistory = [...messagesRef.current, userMsg];
    setMessages([...snapshotHistory, { role: 'assistant', content: '' }]);

    const advisorUrl = `${import.meta.env.BASE_URL}api/interview/advisor`;
    let fullText = '';
    let detectedAgent: AgentInfo | null = null;

    try {
      const res = await apiFetch(advisorUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: snapshotHistory.map(m => ({ role: m.role, content: m.content })),
          businessMemory,
        }),
      });
      if (!res.ok) throw new Error(`HTTP_${res.status}`);
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
            if (data.agent) detectedAgent = data.agent as AgentInfo;
            if (data.content) {
              fullText += data.content;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: fullText, agent: detectedAgent ?? undefined };
                return updated;
              });
            }
            if (data.done) {
              const { clean, action } = parseAction(fullText);
              const finalMsg: ChatMessage = { role: 'assistant', content: clean, action, agent: detectedAgent ?? undefined };
              const finalHistory = [...snapshotHistory, finalMsg];
              setMessages(finalHistory);
              saveChatHistory(finalHistory);
              fullText = clean;
            }
          } catch {}
        }
      }
    } catch {
      const errMsg: ChatMessage = { role: 'assistant', content: 'Connection error — please try again' };
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = errMsg;
        return updated;
      });
      fullText = '';
    }
    setIsStreaming(false);
    return fullText;
  }, [businessMemory]);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    saveChatHistory([]);
    setIsStreaming(false);
    setCurrentAgent(null);
  }, []);

  const clearMemory = useCallback(() => {
    setBusinessMemory('');
    saveBusinessMemory('');
  }, []);

  const updateMemory = useCallback((mem: string) => {
    setBusinessMemory(mem);
    saveBusinessMemory(mem);
  }, []);

  return { messages, businessMemory, isStreaming, currentAgent, send, sendVoice, clear, clearMemory, updateMemory };
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
