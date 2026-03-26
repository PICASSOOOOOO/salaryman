import { apiFetch } from './api-client';

function cleanText(text: string): string {
  return text
    .replace(/[#*`_~\[\]()>]/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .trim();
}

function splitSentences(text: string): string[] {
  return (
    text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)
      ?.map(s => s.trim())
      .filter(Boolean) ?? [text]
  );
}

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 800;

async function fetchAudioWithRetry(sentence: string, signal: AbortSignal): Promise<ArrayBuffer> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (attempt > 0) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, RETRY_DELAY_MS * attempt);
        signal.addEventListener(
          'abort',
          () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); },
          { once: true },
        );
      });
    }
    try {
      const res = await apiFetch('api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sentence }),
        signal,
      });
      if (!res.ok) throw new Error(`TTS request failed: ${res.status}`);
      return await res.arrayBuffer();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      lastError = err;
      console.warn(`TTS attempt ${attempt + 1} failed:`, err);
    }
  }
  throw lastError;
}

let sharedCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext {
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    )();
  }
  return sharedCtx;
}

async function decodeBuffer(arrayBuf: ArrayBuffer): Promise<AudioBuffer> {
  return getAudioCtx().decodeAudioData(arrayBuf);
}

interface TTSHandle {
  cancel: () => void;
}

export function speakWithTTS(
  text: string,
  onEnd: () => void,
  onError?: (err: Error) => void,
): TTSHandle {
  const abortController = new AbortController();
  const signal = abortController.signal;
  let currentSource: AudioBufferSourceNode | null = null;

  const clean = cleanText(text);
  const sentences = splitSentences(clean);

  async function playSentences() {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    type PrefetchResult =
      | { ok: true; buffer: AudioBuffer }
      | { ok: false; err: unknown };

    async function fetchAndDecode(sentence: string): Promise<PrefetchResult> {
      try {
        const arrayBuf = await fetchAudioWithRetry(sentence, signal);
        if (signal.aborted) return { ok: false, err: new DOMException('Aborted', 'AbortError') };
        const buffer = await decodeBuffer(arrayBuf);
        return { ok: true, buffer };
      } catch (err) {
        return { ok: false, err };
      }
    }

    let nextBufferPromise: Promise<PrefetchResult> | null =
      sentences.length > 0 ? fetchAndDecode(sentences[0]) : null;

    for (let i = 0; i < sentences.length; i++) {
      if (signal.aborted) return;

      const result = await nextBufferPromise!;

      if (signal.aborted) return;

      if (!result.ok) {
        const err = result.err;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const error = err instanceof Error ? err : new Error(String(err));
        console.error('TTS failed after retries:', error);
        onError?.(error);
        return;
      }

      if (i + 1 < sentences.length) {
        nextBufferPromise = fetchAndDecode(sentences[i + 1]);
      } else {
        nextBufferPromise = null;
      }

      if (signal.aborted) return;

      await new Promise<void>((resolve) => {
        const source = ctx.createBufferSource();
        source.buffer = result.buffer;
        source.connect(ctx.destination);
        currentSource = source;
        source.onended = () => {
          currentSource = null;
          resolve();
        };
        source.start();
      });

      if (signal.aborted) return;
      await new Promise<void>(resolve => setTimeout(resolve, 50));
    }

    if (!signal.aborted) {
      onEnd();
    }
  }

  playSentences().catch(err => {
    if (signal.aborted) return;
    const error = err instanceof Error ? err : new Error(String(err));
    console.error('TTS playback error:', error);
    onError?.(error);
  });

  return {
    cancel() {
      abortController.abort();
      if (currentSource) {
        try { currentSource.stop(); } catch {}
        currentSource = null;
      }
    },
  };
}
