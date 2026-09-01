import { apiFetch } from './api-client';
import { acquireVoicePriority } from './audio-bus';
import { channelGain } from './audio-settings';
import { getPreferredSpeakerId, supportsSinkId } from '../hooks/use-audio-devices';

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

// iOS (all browsers there are WebKit) silences WebAudio output with the
// physical ringer/mute switch and is generally flaky for programmatic
// WebAudio playback, while an HTMLAudioElement plays through the media
// channel and ignores the mute switch. This is the same reason audio
// libraries (e.g. howler.js) fall back to HTML5 <audio> on iOS. So on
// iOS we route TTS through an <audio> element instead of WebAudio.
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ masquerades as desktop Safari ("MacIntel"); detect via touch.
  return (
    (navigator.platform === 'MacIntel' || /Macintosh/.test(ua)) &&
    (navigator.maxTouchPoints ?? 0) > 1
  );
}

// iOS Safari audio unlock. iOS keeps AudioContext suspended AND blocks
// HTMLAudioElement.play() until a user gesture has triggered audio at least
// once on the page. The fix is well-known: inside a tap/touch handler,
// resume() the context, play a tiny silent buffer through WebAudio, and
// play() a primed silent HTMLAudioElement. After this, all subsequent
// playback (even fired from setTimeout/useEffect) works normally for the
// rest of the page lifetime. Idempotent + safe to call multiple times.
let audioUnlocked = false;
let unlockInFlight: Promise<boolean> | null = null;
export function isAudioUnlocked(): boolean { return audioUnlocked; }
export function unlockAudio(): Promise<boolean> {
  if (audioUnlocked) return Promise.resolve(true);
  if (unlockInFlight) return unlockInFlight;
  unlockInFlight = (async () => {
    try {
      const ctx = getAudioCtx();
      if (ctx.state === 'suspended') {
        try { await ctx.resume(); } catch { /* ignore — try anyway */ }
      }
      // Web Audio context is running if the browser allowed the resume.
      const ctxRunning = ctx.state === 'running';
      // Silent 1-frame buffer through WebAudio.
      try {
        const buf = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
      } catch { /* non-fatal */ }
      // Prime an HTMLAudioElement too (the setSinkId path uses one). Use a
      // tiny inline silent wav so iOS treats *that* element type as unlocked.
      // Do NOT swallow the NotAllowedError — let it reach our outer catch so
      // we can return false when autoplay is genuinely blocked.
      let htmlAudioOk = false;
      try {
        const SILENT_WAV =
          'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';
        const a = new Audio(SILENT_WAV);
        a.muted = true;
        a.volume = 0;
        await a.play();
        a.pause();
        htmlAudioOk = true;
      } catch { /* autoplay blocked — htmlAudioOk stays false */ }
      // (No SpeechSynthesis priming. The whole app uses ElevenLabs voices
      // via /api/tts — we never fall back to the browser's robotic
      // SpeechSynthesis voices, per product mandate.)
      const ok = ctxRunning || htmlAudioOk;
      if (ok) audioUnlocked = true;
      return ok;
    } catch {
      return false;
    } finally {
      unlockInFlight = null;
    }
  })();
  return unlockInFlight;
}

// Auto-unlock on the FIRST user gesture anywhere in the document. Cheap
// and one-shot — after success the listeners detach themselves. Safe to
// call from app init even before the user has interacted.
let autoArmed = false;
const unlockWaiters: Array<() => void> = [];
export function armAudioAutoUnlock(): void {
  if (autoArmed || typeof window === 'undefined') return;
  autoArmed = true;
  const events: Array<keyof DocumentEventMap> = ['pointerdown', 'touchstart', 'mousedown', 'keydown'];
  const handler = () => {
    void unlockAudio().then((ok) => {
      if (ok) {
        for (const ev of events) document.removeEventListener(ev, handler, true);
        // Drain anyone waiting for unlock — they get to play their audio now.
        const queue = unlockWaiters.splice(0, unlockWaiters.length);
        for (const cb of queue) { try { cb(); } catch { /* noop */ } }
      }
    });
  };
  for (const ev of events) document.addEventListener(ev, handler, { capture: true, passive: true });
}

// Resolve immediately if audio is already unlocked, otherwise resolve the
// next time the user taps anywhere (via the global auto-unlock listeners).
// Use this to defer audio playback that was scheduled before the user has
// interacted with the page (e.g. an auto-greeting that fires from a useEffect
// on mount). Returns a cancel function so callers can clean up if their
// component unmounts before the user interacts.
export function whenAudioUnlocked(cb: () => void): () => void {
  if (audioUnlocked) {
    cb();
    return () => {};
  }
  unlockWaiters.push(cb);
  return () => {
    const idx = unlockWaiters.indexOf(cb);
    if (idx >= 0) unlockWaiters.splice(idx, 1);
  };
}

async function decodeBuffer(arrayBuf: ArrayBuffer): Promise<AudioBuffer> {
  const ctx = getAudioCtx();
  await ensureResumed(ctx);
  return ctx.decodeAudioData(arrayBuf);
}

export interface TTSHandle {
  cancel: () => void;
}

export function speakWithTTS(
  text: string,
  onEnd: () => void,
  onError?: (err: Error) => void,
  opts?: { endpoint?: string; character?: string; volume?: number },
): TTSHandle {
  const abortController = new AbortController();
  const signal = abortController.signal;
  let currentSource: AudioBufferSourceNode | null = null;
  // Claim global voice priority so background music ducks while we speak.
  // Released on cancel OR when the underlying onEnd fires.
  const releaseVoicePriority = acquireVoicePriority();
  let priorityReleased = false;
  function releasePriorityOnce() { if (!priorityReleased) { priorityReleased = true; releaseVoicePriority(); } }
  // Re-bind onEnd so every downstream completion path (sentence loop,
  // ElevenLabs fetch / playback errors, outer catch) also releases the
  // global voice-priority lock that ducks background music.
  //
  // CRITICAL: capture the original parameter into a const BEFORE
  // reassigning, otherwise the wrapper's closure resolves `onEnd` to
  // its own new value (the wrapper itself) and we infinitely recurse
  // — that was the source of the "Maximum call stack size exceeded"
  // overlay seen during intake submission.
  const originalOnEnd = onEnd;
  onEnd = () => { releasePriorityOnce(); originalOnEnd(); };
  const ttsEndpoint = opts?.endpoint ?? 'api/tts';
  const character = opts?.character;
  // Explicit volumes are already effective gains for callers such as Shadow
  // Radio. Ordinary Pablo/advisor speech uses the shared VOICE channel, so
  // COMMS and the settings page control the actual playback level.
  const volume = Math.max(0, Math.min(1, opts?.volume ?? channelGain("voice")));

  const clean = cleanText(text);
  const sentences = splitSentences(clean);

  // Live HTMLAudioElement when routing to a specific speaker (setSinkId).
  let currentEl: HTMLAudioElement | null = null;
  let currentObjUrl: string | null = null;

  async function playSentences() {
    // Decide playback path ONCE per call. If the user has chosen a specific
    // speaker AND the browser supports setSinkId, route through an
    // HTMLAudioElement (the only API that lets you pin output to a device).
    // Otherwise use the existing WebAudio path (lower latency, works on
    // every browser including Safari/iOS).
    const speakerId = getPreferredSpeakerId();
    const useSinkId = !!speakerId && supportsSinkId();
    // Route through an <audio> element when pinning a speaker (setSinkId) OR
    // on iOS, where WebAudio output is silenced by the ringer switch.
    const useElement = useSinkId || isIOS();

    type PrefetchResult =
      | { ok: true; arrayBuf: ArrayBuffer; decoded: AudioBuffer | null }
      | { ok: false; err: unknown };

    async function fetchAndMaybeDecode(sentence: string): Promise<PrefetchResult> {
      try {
        const arrayBuf = await fetchAudioWithRetry(sentence, signal, ttsEndpoint, character);
        if (signal.aborted) return { ok: false, err: new DOMException('Aborted', 'AbortError') };
        if (useElement) {
          // No decode needed — HTMLAudioElement plays the encoded mp3 directly.
          return { ok: true, arrayBuf, decoded: null };
        }
        // decodeAudioData detaches the buffer, so clone first if we ever need both.
        const decoded = await decodeBuffer(arrayBuf.slice(0));
        return { ok: true, arrayBuf, decoded };
      } catch (err) {
        return { ok: false, err };
      }
    }

    async function playViaElement(arrayBuf: ArrayBuffer): Promise<void> {
      // Build a fresh element per sentence — setSinkId may be async and we
      // want the cleanest possible lifecycle in case the user swaps device
      // mid-play (the next sentence will pick the latest preference).
      const blob = new Blob([arrayBuf], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      const el = new Audio();
      el.src = url;
      el.preload = 'auto';
      el.volume = volume;
      currentEl = el;
      currentObjUrl = url;

      // Only pin the output device when the user actually chose a speaker and
      // the browser supports it. On iOS we use this element path purely to
      // dodge the WebAudio mute-switch issue — there is no setSinkId there.
      if (speakerId && supportsSinkId()) {
        try {
          // setSinkId may reject if the chosen device disappeared.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (el as any).setSinkId(speakerId);
        } catch (err) {
          console.warn('[TTS] setSinkId failed, falling back to default speaker:', err);
        }
      }

      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          el.onended = null;
          el.onerror = null;
          if (currentObjUrl === url) currentObjUrl = null;
          if (currentEl === el) currentEl = null;
          try { URL.revokeObjectURL(url); } catch {}
        };
        el.onended = () => { cleanup(); resolve(); };
        el.onerror = () => { cleanup(); reject(new Error('audio element error')); };
        el.play().catch((err) => { cleanup(); reject(err); });
      });
    }

    async function playViaWebAudio(buffer: AudioBuffer): Promise<void> {
      const ctx = getAudioCtx();
      await ensureResumed(ctx);
      await new Promise<void>((resolve) => {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.value = volume;
        source.connect(gain);
        gain.connect(ctx.destination);
        currentSource = source;
        source.onended = () => {
          currentSource = null;
          resolve();
        };
        source.start();
      });
    }

    let nextBufferPromise: Promise<PrefetchResult> | null =
      sentences.length > 0 ? fetchAndMaybeDecode(sentences[0]) : null;

    for (let i = 0; i < sentences.length; i++) {
      if (signal.aborted) return;

      const result = await nextBufferPromise!;

      if (signal.aborted) return;

      if (!result.ok) {
        const err = result.err;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // No fallback — the app is ElevenLabs-only. Surface the error and
        // end the handle so callers can retry / move on.
        console.warn('ElevenLabs TTS fetch failed:', err);
        if (onError) onError(err instanceof Error ? err : new Error(String(err)));
        onEnd();
        return;
      }

      if (i + 1 < sentences.length) {
        nextBufferPromise = fetchAndMaybeDecode(sentences[i + 1]);
      } else {
        nextBufferPromise = null;
      }

      if (signal.aborted) return;

      try {
        if (useElement) {
          await playViaElement(result.arrayBuf);
        } else if (result.decoded) {
          await playViaWebAudio(result.decoded);
        }
      } catch (err) {
        if (signal.aborted) return;
        // No fallback — ElevenLabs-only. End cleanly so callers move on.
        console.warn('ElevenLabs playback error:', err);
        if (onError) onError(err instanceof Error ? err : new Error(String(err)));
        onEnd();
        return;
      }

      if (signal.aborted) return;
      await new Promise<void>(resolve => setTimeout(resolve, 50));
    }

    if (!signal.aborted) {
      onEnd();
    }
  }

  playSentences().catch(err => {
    if (signal.aborted) return;
    // No fallback — ElevenLabs-only.
    console.warn('ElevenLabs TTS error:', err);
    if (onError) onError(err instanceof Error ? err : new Error(String(err)));
    onEnd();
  });

  return {
    cancel() {
      abortController.abort();
      if (currentSource) {
        try { currentSource.stop(); } catch {}
        currentSource = null;
      }
      if (currentEl) {
        try { currentEl.pause(); } catch {}
        try { currentEl.removeAttribute('src'); currentEl.load(); } catch {}
        currentEl = null;
      }
      if (currentObjUrl) {
        try { URL.revokeObjectURL(currentObjUrl); } catch {}
        currentObjUrl = null;
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
  volume?: number,
): TTSHandle {
  return speakWithTTS(text, onEnd, onError, { endpoint: "api/game-tts", character, volume });
}

// Roster of major characters → TTS character keys (matches CHARACTER_VOICES in
// artifacts/api-server/src/routes/openai/index.ts). Used by gameplay code to
// route an NPC's spoken line to that character's distinct ElevenLabs voice.
//
// Keep this in lock-step with the server roster — when the server gains a
// voice, add the display-name → key mapping here so resolveNpcVoiceKey()
// will route the line correctly. Single-word bot names auto-resolve via the
// server's normalization, so we only need to enumerate aliases (titles,
// accents, multi-word names, etc.) explicitly.
export const NPC_VOICES: Record<string, string> = {
  // Headline
  "PABLO": "PABLO",
  "MILA": "MILA",

  // Major NPCs (Minx City storyline)
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

  // Bots — language / writing / coaching
  "KENJI": "KENJI",
  "ROSETTA": "ROSETTA",
  "DEVONTE": "DEVONTE",
  "ELEANOR": "ELEANOR",
  "ISAAC": "ISAAC",
  "EDITH": "EDITH",
  "BENJAMIN": "BENJAMIN",
  "PATRICK": "PATRICK",
  "RACHEL": "RACHEL",
  "NATASHA": "NATASHA",
  "DEEPA": "DEEPA",

  // Bots — finance / legal / corporate
  "PENNY": "PENNY",
  "VIKTOR": "VIKTOR",
  "LINDA": "LINDA",
  "DARCY": "DARCY",
  "SIMON": "SIMON",
  "CONSTANCE": "CONSTANCE",
  "IRENE": "IRENE",
  "RANDALL": "RANDALL",
  "CHARLES": "CHARLES",
  "CASSANDRA": "CASSANDRA",
  "HELENA": "HELENA",

  // Bots — hospitality / lifestyle / culinary
  "ANDRÉ": "ANDRE",
  "ANDRE": "ANDRE",
  "ANTOINE": "ANTOINE",
  "MARCEL": "MARCEL",
  "CAMILLE": "CAMILLE",
  "GLORIA": "GLORIA",
  "STELLA": "STELLA",
  "CHIARA": "CHIARA",
  "GIOVANNI": "GIOVANNI",
  "LORENZO": "LORENZO",
  "VICENTE": "VICENTE",
  "CARLO": "CARLO",
  "DIEGO": "DIEGO",
  "VALENTINA": "VALENTINA",
  "SCARLETT": "SCARLETT",
  "ROXANNE": "ROXANNE",
  "SELENA": "SELENA",
  "PEARL": "PEARL",
  "DOMINIQUE": "DOMINIQUE",
  "GEORGIA": "GEORGIA",
  "GRETA": "GRETA",
  "INGRID": "INGRID",
  "MELANIE": "MELANIE",
  "MIMI": "MIMI",

  // Bots — trades / blue collar / muscle
  "REX": "REX",
  "FRANK": "FRANK",
  "TONY": "TONY",
  "HANK": "HANK",
  "WALTER": "WALTER",
  "RAYMOND": "RAYMOND",
  "CURTIS": "CURTIS",
  "SHERMAN": "SHERMAN",
  "PRESTON": "PRESTON",
  "IVAN": "IVAN",
  "NIKOLAI": "NIKOLAI",

  // Bots — youth / casual / influencer
  "SHANE": "SHANE",
  "RILEY": "RILEY",
  "QUINN": "QUINN",
  "SYDNEY": "SYDNEY",
  "CHRIS": "CHRIS",
  "ARCHIE": "ARCHIE",
  "CONNOR": "CONNOR",
  "BRYCE": "BRYCE",
  "SPENCER": "SPENCER",
  "DEREK": "DEREK",
  "PAIGE": "PAIGE",
  "CLARA": "CLARA",
  "DIANA": "DIANA",
  "PRIYA": "PRIYA",
  "SERENA": "SERENA",
  "VIVIAN": "VIVIAN",
  "SAM": "SAM",
  "REGINA": "REGINA",

  // Bots — media / music / video
  "TERRENCE": "TERRENCE",
  "VANESSA": "VANESSA",
};

// Curated voice palette for the HEMINGWAY writer & TERRENCE music studio.
// Users pick one of these to "perform" their lyrics / chapter aloud.
// The `key` matches a CHARACTER_VOICES entry on the server.
export type WriterVoiceOption = {
  key: string;
  label: string;
  description: string;
  category: 'signature' | 'narrator' | 'singer' | 'character';
  tag?: string;
};

const WRITER_VOICE_KEY = 'sm_writer_voice_v1';
export function loadWriterVoice(): string {
  try { return localStorage.getItem(WRITER_VOICE_KEY) || 'PABLO'; } catch { return 'PABLO'; }
}
export function saveWriterVoice(key: string): void {
  try { localStorage.setItem(WRITER_VOICE_KEY, key); } catch {}
}

export const WRITER_VOICES: WriterVoiceOption[] = [
  // Signature
  { key: 'PABLO',     label: 'PABLO',     description: 'The icon. Default voice.',                category: 'signature' },
  { key: 'TERRENCE',  label: 'TERRENCE',  description: 'Punchy music producer.',                  category: 'signature' },
  { key: 'JEAN_CLAW', label: 'JEAN CLAW', description: 'Refined French underboss.',               category: 'signature' },

  // Narrators — for prose, audiobook chapters
  { key: 'ELEANOR',   label: 'ELEANOR',   description: 'Refined British editor — literary.',       category: 'narrator' },
  { key: 'BENJAMIN',  label: 'BENJAMIN',  description: 'Composed essayist — measured cadence.',    category: 'narrator' },
  { key: 'NATASHA',   label: 'NATASHA',   description: 'Audiobook director with steel.',           category: 'narrator' },
  { key: 'EDITH',     label: 'EDITH',     description: 'Elder-stateswoman editor.',                category: 'narrator' },
  { key: 'CHARLES',   label: 'CHARLES',   description: 'British corporate counsel — sober.',       category: 'narrator' },

  // Singers / performers — for lyrics
  { key: 'SELENA',    label: 'SELENA',    description: 'Emotional songstress.',                    category: 'singer' },
  { key: 'VALENTINA', label: 'VALENTINA', description: 'Sultry concierge — late-night vocal.',     category: 'singer' },
  { key: 'SCARLETT',  label: 'SCARLETT',  description: 'Magnetic publicist — pop-forward.',        category: 'singer' },
  { key: 'PATRICK',   label: 'PATRICK',   description: 'Shouty motivator — hype tracks.',          category: 'singer' },
  { key: 'ISAAC',     label: 'ISAAC',     description: 'Wry copywriter — half-spoken bars.',       category: 'singer' },

  // Character / accent
  { key: 'GIOVANNI',  label: 'GIOVANNI',  description: 'Italian café owner — warm accent.',        category: 'character' },
  { key: 'NIKOLAI',   label: 'NIKOLAI',   description: 'Heavy Russian-flavoured ops.',             category: 'character' },
  { key: 'CONNOR',    label: 'CONNOR',    description: 'Irish folk-craft — story-songs.',          category: 'character' },
  { key: 'SHANE',     label: 'SHANE',     description: 'Aussie skater — casual delivery.',         category: 'character' },
  { key: 'MIMI',      label: 'MIMI',      description: 'Scandinavian — bright, airy.',             category: 'character' },
];

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
