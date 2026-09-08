// In-browser audio conversion: any browser-decodable file -> MP3
// Uses Web Audio API to decode + lamejs to encode.
//
// NOTE: AIFF and other formats the browser cannot decode will throw.
// In that case the original file should be saved as-is.

import lamejs from "@breezystack/lamejs";

let _ctx: AudioContext | null = null;
function getCtx(): AudioContext {
  if (!_ctx) {
    const Ctor: typeof AudioContext =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    _ctx = new Ctor();
  }
  if (_ctx.state === "suspended") _ctx.resume().catch(() => {});
  return _ctx;
}

export type ConvertProgress = (frac: number) => void;

export async function decodeAudioFile(file: File | Blob): Promise<AudioBuffer> {
  const buf = await file.arrayBuffer();
  const ctx = getCtx();
  // decodeAudioData mutates the buffer in some implementations; pass a copy.
  return await ctx.decodeAudioData(buf.slice(0));
}

/**
 * Convert an AudioBuffer to an MP3 Blob using lamejs.
 * Quality: VBR-style CBR @ 192 kbps stereo / 128 kbps mono.
 */
export function audioBufferToMp3Blob(buffer: AudioBuffer, onProgress?: ConvertProgress): Blob {
  const channels = Math.min(buffer.numberOfChannels, 2);
  const sampleRate = buffer.sampleRate;
  const kbps = channels === 2 ? 192 : 128;

  const encoder = new lamejs.Mp3Encoder(channels, sampleRate, kbps);
  const left = floatToInt16(buffer.getChannelData(0));
  const right = channels === 2 ? floatToInt16(buffer.getChannelData(1)) : null;

  const blockSize = 1152;
  const mp3Chunks: BlobPart[] = [];
  const total = left.length;

  for (let i = 0; i < total; i += blockSize) {
    const lChunk = left.subarray(i, i + blockSize) as unknown as Int16Array;
    const rChunk = right ? (right.subarray(i, i + blockSize) as unknown as Int16Array) : null;
    const mp3buf: Uint8Array = rChunk
      ? (encoder.encodeBuffer(lChunk as any, rChunk as any) as unknown as Uint8Array)
      : (encoder.encodeBuffer(lChunk as any) as unknown as Uint8Array);
    if (mp3buf.length > 0) mp3Chunks.push(new Uint8Array(mp3buf));
    if (onProgress && (i & 0x3FFF) === 0) {
      onProgress(Math.min(0.99, i / total));
    }
  }
  const flush = encoder.flush() as unknown as Uint8Array;
  if (flush.length > 0) mp3Chunks.push(new Uint8Array(flush));
  onProgress?.(1);
  return new Blob(mp3Chunks, { type: "audio/mpeg" });
}

function floatToInt16(f32: Float32Array): Int16Array {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return out;
}

export async function convertFileToMp3(file: File, onProgress?: ConvertProgress): Promise<File> {
  const audioBuffer = await decodeAudioFile(file);
  const mp3Blob = audioBufferToMp3Blob(audioBuffer, onProgress);
  const newName = file.name.replace(/\.[^.]+$/, "") + ".mp3";
  return new File([mp3Blob], newName, { type: "audio/mpeg" });
}

export function canBrowserDecode(mime: string | null | undefined): boolean {
  if (!mime) return true;
  // Web Audio decodes broadly; AIFF is the main pain point in Chromium.
  return !/aiff|x-aiff/i.test(mime);
}
