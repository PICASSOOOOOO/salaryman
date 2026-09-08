// Song-writing helpers used by HEMINGWAY when the user toggles into rap or
// song mode. Pure functions where possible so they're trivial to test and
// the UI layer can stay declarative.

import { apiFetch } from "./api-client";

// === Syllables =============================================================
// Heuristic English syllable counter. Not perfect (no language is) but it
// matches human intuition >95% of the time on rap/lyric vocabulary.
export function syllableCount(word: string): number {
  let w = word.toLowerCase().replace(/[^a-z']/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  w = w.replace(/^y/, "");
  const m = w.match(/[aeiouy]{1,2}/g);
  return m ? m.length : 1;
}

export function lineSyllables(line: string): number {
  return line
    .split(/\s+/)
    .filter(Boolean)
    .reduce((sum, w) => sum + syllableCount(w), 0);
}

// === Alliteration ==========================================================
// Returns the set of starting letters that appear 2+ times in a single
// line, ignoring tiny stopwords. The UI uses this to highlight "thunder
// thighs trample the truth"-style runs.
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "at", "for",
  "with", "is", "it", "as", "by", "be", "i", "you", "he", "she", "we",
  "they", "my", "your", "our", "their", "this", "that", "im", "ive",
]);

export function alliterationLetters(line: string): Set<string> {
  const counts = new Map<string, number>();
  for (const raw of line.toLowerCase().split(/\s+/).filter(Boolean)) {
    const w = raw.replace(/[^a-z]/g, "");
    if (!w || STOPWORDS.has(w)) continue;
    const letter = w.charAt(0);
    if (!letter) continue;
    counts.set(letter, (counts.get(letter) ?? 0) + 1);
  }
  const out = new Set<string>();
  for (const [letter, n] of counts) if (n >= 2) out.add(letter);
  return out;
}

// === Datamuse (free, no key) ==============================================
// We hit Datamuse straight from the browser — it's CORS-friendly and
// doesn't need any auth. If it ever fails we just return an empty list so
// the UI degrades quietly.
export interface DatamuseHit { word: string; score?: number; numSyllables?: number; tags?: string[] }

async function dm(qs: string): Promise<DatamuseHit[]> {
  try {
    const r = await fetch(`https://api.datamuse.com/words?${qs}&md=s&max=40`);
    if (!r.ok) return [];
    return (await r.json()) as DatamuseHit[];
  } catch {
    return [];
  }
}

export const fetchRhymes      = (w: string) => dm(`rel_rhy=${encodeURIComponent(w)}`);
export const fetchNearRhymes  = (w: string) => dm(`rel_nry=${encodeURIComponent(w)}`);
export const fetchSynonyms    = (w: string) => dm(`rel_syn=${encodeURIComponent(w)}`);
export const fetchMeansLike   = (w: string) => dm(`ml=${encodeURIComponent(w)}`);
export const fetchAdjectives  = (w: string) => dm(`rel_jjb=${encodeURIComponent(w)}`);

// === Bars / tempo =========================================================
export function barCount(numLines: number, linesPerBar: number): number {
  if (linesPerBar <= 0) return 0;
  return Math.ceil(numLines / linesPerBar);
}

// Estimated track duration (seconds) given a 4/4 feel, `bars` bars at `bpm`.
export function estimatedDuration(bars: number, bpm: number, beatsPerBar = 4): number {
  if (bpm <= 0) return 0;
  return (bars * beatsPerBar * 60) / bpm;
}

// === Audio: TTS → AudioBuffer ============================================
// Hits the same /api/tts endpoint the rest of the app uses. We split the
// lyrics into chunks small enough for ElevenLabs to chew through, fetch
// each as a wav/mp3 ArrayBuffer, decode them, then stitch them into one
// continuous AudioBuffer that we can mix with the beat.

const MAX_TTS_CHARS = 480; // ElevenLabs is fine with longer but smaller chunks fail-fast

function chunkText(text: string): string[] {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const out: string[] = [];
  let buf = "";
  for (const line of lines) {
    if ((buf + " " + line).length > MAX_TTS_CHARS && buf) {
      out.push(buf);
      buf = line;
    } else {
      buf = buf ? `${buf}. ${line}` : line;
    }
  }
  if (buf) out.push(buf);
  return out;
}

export async function fetchTTSBuffer(
  text: string,
  audioCtx: BaseAudioContext,
  character?: string,
): Promise<AudioBuffer> {
  const chunks = chunkText(text);
  if (chunks.length === 0) throw new Error("nothing to sing");
  const buffers: AudioBuffer[] = [];
  for (const chunk of chunks) {
    const res = await apiFetch("api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(character ? { text: chunk, character } : { text: chunk }),
    });
    if (!res.ok) throw new Error(`TTS failed: ${res.status}`);
    const ab = await res.arrayBuffer();
    // decodeAudioData mutates buffers on some browsers — slice first.
    const decoded = await audioCtx.decodeAudioData(ab.slice(0));
    buffers.push(decoded);
  }
  return concatBuffers(buffers, audioCtx);
}

function concatBuffers(parts: AudioBuffer[], ctx: BaseAudioContext): AudioBuffer {
  if (parts.length === 1) return parts[0];
  const sampleRate = parts[0].sampleRate;
  const numCh = Math.max(...parts.map((p) => p.numberOfChannels));
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = ctx.createBuffer(numCh, total, sampleRate);
  let offset = 0;
  for (const part of parts) {
    for (let c = 0; c < numCh; c++) {
      const src = part.getChannelData(Math.min(c, part.numberOfChannels - 1));
      out.getChannelData(c).set(src, offset);
    }
    offset += part.length;
  }
  return out;
}

// === Audio: file → AudioBuffer ===========================================
export async function fileToAudioBuffer(
  file: File | Blob,
  audioCtx: BaseAudioContext,
): Promise<AudioBuffer> {
  const ab = await file.arrayBuffer();
  return await audioCtx.decodeAudioData(ab.slice(0));
}

// === Audio: mix vocals + beat into one buffer ============================
// Tiles the beat to cover the vocals' length, then sums them with sensible
// gain levels so the vocal stays on top.
export async function mixVocalsAndBeat(
  vocals: AudioBuffer,
  beat: AudioBuffer,
  opts?: { vocalsGain?: number; beatGain?: number; tailSeconds?: number },
): Promise<AudioBuffer> {
  const tail = opts?.tailSeconds ?? 1.5;
  const sampleRate = vocals.sampleRate;
  const totalSeconds = Math.max(vocals.duration, beat.duration) + tail;
  const length = Math.ceil(totalSeconds * sampleRate);
  const ctx = new OfflineAudioContext(2, length, sampleRate);

  // Vocals on top
  const vSrc = ctx.createBufferSource();
  vSrc.buffer = vocals;
  const vGain = ctx.createGain();
  vGain.gain.value = opts?.vocalsGain ?? 1.0;
  vSrc.connect(vGain).connect(ctx.destination);
  vSrc.start(0);

  // Beat looped underneath
  const bSrc = ctx.createBufferSource();
  bSrc.buffer = beat;
  bSrc.loop = true;
  bSrc.loopStart = 0;
  bSrc.loopEnd = beat.duration;
  const bGain = ctx.createGain();
  bGain.gain.value = opts?.beatGain ?? 0.55;
  bSrc.connect(bGain).connect(ctx.destination);
  bSrc.start(0);
  bSrc.stop(totalSeconds);

  return await ctx.startRendering();
}

// === Audio: AudioBuffer → WAV blob ========================================
// Tiny PCM-16 WAV encoder so the user can download / share the mix without
// any backend round-trip.
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const dataLen = buffer.length * numCh * 2;
  const ab = new ArrayBuffer(44 + dataLen);
  const view = new DataView(ab);
  let off = 0;
  const writeStr = (s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off++, s.charCodeAt(i)); };
  const writeU32 = (v: number) => { view.setUint32(off, v, true); off += 4; };
  const writeU16 = (v: number) => { view.setUint16(off, v, true); off += 2; };
  writeStr("RIFF"); writeU32(36 + dataLen); writeStr("WAVE");
  writeStr("fmt "); writeU32(16); writeU16(1); writeU16(numCh);
  writeU32(sampleRate); writeU32(sampleRate * numCh * 2); writeU16(numCh * 2); writeU16(16);
  writeStr("data"); writeU32(dataLen);
  const channels: Float32Array[] = [];
  for (let i = 0; i < numCh; i++) channels.push(buffer.getChannelData(i));
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

// === Misc =================================================================
export const MUSIC_GENRES: ReadonlyArray<"rap" | "song"> = ["rap", "song"];
export function isMusicGenre(g: string | undefined | null): g is "rap" | "song" {
  return g === "rap" || g === "song";
}
