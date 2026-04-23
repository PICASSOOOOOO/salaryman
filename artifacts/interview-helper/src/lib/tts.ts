import { apiFetch } from './api-client';
import { acquireVoicePriority } from './audio-bus';

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

async function fetchAudioWithRetry(sentence: string, signal: AbortSignal, endpoint = 'api/tts', character?: string): Promise<ArrayBuffer> {
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
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(character ? { text: sentence, character } : { text: sentence }),
        signal,
      });
      if (!res.ok) {
        if (res.status === 502) {
          throw Object.assign(new Error('TTS server unavailable'), { noRetry: true });
        }
        throw new Error(`TTS request failed: ${res.status}`);
      }
      return await res.arrayBuffer();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      if ((err as any)?.noRetry) throw err;
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

async function ensureResumed(ctx: AudioContext): Promise<void> {
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
}

async function decodeBuffer(arrayBuf: ArrayBuffer): Promise<AudioBuffer> {
  const ctx = getAudioCtx();
  await ensureResumed(ctx);
  return ctx.decodeAudioData(arrayBuf);
}

function speakWithBrowserTTS(text: string, onEnd: () => void): { cancel: () => void } {
  if (!('speechSynthesis' in window)) {
    onEnd();
    return { cancel: () => {} };
  }
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = 0.9;
  utt.pitch = 0.85;
  utt.volume = 1;
  utt.onend = onEnd;
  utt.onerror = () => onEnd();
  window.speechSynthesis.speak(utt);
  return {
    cancel() {
      window.speechSynthesis.cancel();
    },
  };
}

interface TTSHandle {
  cancel: () => void;
}

export function speakWithTTS(
  text: string,
  onEnd: () => void,
  onError?: (err: Error) => void,
  opts?: { endpoint?: string; character?: string },
): TTSHandle {
  const abortController = new AbortController();
  const signal = abortController.signal;
  let currentSource: AudioBufferSourceNode | null = null;
  let browserFallback: { cancel: () => void } | null = null;
  // Claim global voice priority so background music ducks while we speak.
  // Released on cancel OR when the underlying onEnd fires.
  const releaseVoicePriority = acquireVoicePriority();
  let priorityReleased = false;
  function releasePriorityOnce() { if (!priorityReleased) { priorityReleased = true; releaseVoicePriority(); } }
  const wrappedOnEnd = () => { releasePriorityOnce(); onEnd(); };
  // Re-bind onEnd so all downstream paths (browser fallback, sentence loop)
  // also release the priority lock.
  const _origOnEnd = onEnd;
  void _origOnEnd; // keep for clarity; we use wrappedOnEnd from here on
  onEnd = wrappedOnEnd;
  const ttsEndpoint = opts?.endpoint ?? 'api/tts';
  const character = opts?.character;

  const clean = cleanText(text);
  const sentences = splitSentences(clean);

  async function playSentences() {
    const ctx = getAudioCtx();
    await ensureResumed(ctx);

    type PrefetchResult =
      | { ok: true; buffer: AudioBuffer }
      | { ok: false; err: unknown };

    async function fetchAndDecode(sentence: string): Promise<PrefetchResult> {
      try {
        const arrayBuf = await fetchAudioWithRetry(sentence, signal, ttsEndpoint, character);
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
        console.warn('Server TTS failed, falling back to browser voice:', err);
        browserFallback = speakWithBrowserTTS(clean, onEnd);
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
    console.warn('Server TTS playback error, falling back to browser voice:', err);
    browserFallback = speakWithBrowserTTS(clean, onEnd);
  });

  return {
    cancel() {
      abortController.abort();
      if (currentSource) {
        try { currentSource.stop(); } catch {}
        currentSource = null;
      }
      if (browserFallback) {
        browserFallback.cancel();
        browserFallback = null;
      }
      releasePriorityOnce();
    },
  };
}

export function speakGameTTS(
  text: string,
  onEnd: () => void,
  onError?: (err: Error) => void,
  character?: string,
): TTSHandle {
  return speakWithTTS(text, onEnd, onError, { endpoint: "api/game-tts", character });
}

// Roster of major characters → TTS character keys (matches CHARACTER_VOICES in
// artifacts/api-server/src/routes/openai/index.ts). Used by gameplay code to
// route an NPC's spoken line to that character's distinct ElevenLabs voice.
export const NPC_VOICES: Record<string, string> = {
  "PABLO": "PABLO",
  "JEAN CLAW": "JEAN_CLAW",
  "RICK": "RICK",
  "MARCUS VELL": "MARCUS_VELL",
  "LILA CRANE": "LILA_CRANE",
  "OFFICER VOSS": "OFFICER_VOSS",
  "OFFICER DECLAN VOSS": "OFFICER_VOSS",
  "VELLA RUNE": "VELLA_RUNE",
  "MAEVE GARRIN": "MAEVE_GARRIN",
  "DR. ELARA KERN": "DR_ELARA_KERN",
  "DR ELARA KERN": "DR_ELARA_KERN",
  "ELARA KERN": "DR_ELARA_KERN",
  "SILAS GRAHN": "SILAS_GRAHN",
  "ORINA FELL": "ORINA_FELL",
  "MARSH KETTER": "MARSH_KETTER",
  "KENJI": "KENJI",
  "VIKTOR": "VIKTOR",
  "PENNY": "PENNY",
  "ANDRÉ": "ANDRE",
  "ANDRE": "ANDRE",
  "GLORIA": "GLORIA",
  "TERRENCE": "TERRENCE",
  "VANESSA": "VANESSA",
  "ISAAC": "ISAAC",
  "ROSETTA": "ROSETTA",
  "DEVONTE": "DEVONTE",
};

// Resolve a free-text NPC display name to a CHARACTER_VOICES key, or undefined
// if the speaker has no dedicated voice (in which case the default voice is used).
export function resolveNpcVoiceKey(displayName: string | null | undefined): string | undefined {
  if (!displayName) return undefined;
  const norm = displayName.trim().toUpperCase();
  if (NPC_VOICES[norm]) return NPC_VOICES[norm];
  // Try matching the first word (e.g. "PABLO!" → "PABLO")
  const head = norm.replace(/[^A-ZÀ-Ÿ ]+/g, "").split(/\s+/)[0];
  if (head && NPC_VOICES[head]) return NPC_VOICES[head];
  return undefined;
}
