export type SamplerSlice = {
  startSec: number;
  endSec: number;
};

function validateRange(startSec: number, endSec: number, maxSlices: number) {
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec - startSec < 0.01) {
    throw new Error("Choose a sample range longer than 0.01 seconds.");
  }
  if (!Number.isInteger(maxSlices) || maxSlices < 2 || maxSlices > 16) {
    throw new Error("Slice count must be between 2 and 16.");
  }
}

export function createRegionSlices(startSec: number, endSec: number, count: number): SamplerSlice[] {
  validateRange(startSec, endSec, count);
  const sliceDuration = (endSec - startSec) / count;
  return Array.from({ length: count }, (_, index) => ({
    startSec: startSec + sliceDuration * index,
    endSec: index === count - 1 ? endSec : startSec + sliceDuration * (index + 1),
  }));
}

export function findTransientSlices(
  channels: readonly Float32Array[],
  sampleRate: number,
  startSec: number,
  endSec: number,
  maxSlices: number,
  sensitivity: number,
): SamplerSlice[] {
  validateRange(startSec, endSec, maxSlices);
  if (!channels.length || !Number.isFinite(sampleRate) || sampleRate <= 0
    || !Number.isFinite(sensitivity) || sensitivity < 0 || sensitivity > 100) {
    throw new Error("Transient analysis needs valid audio and sensitivity.");
  }

  const frameCount = Math.min(...channels.map(channel => channel.length));
  const firstFrame = Math.max(0, Math.floor(startSec * sampleRate));
  const lastFrame = Math.min(frameCount, Math.floor(endSec * sampleRate));
  if (lastFrame - firstFrame < 2) return [];

  const duration = (lastFrame - firstFrame) / sampleRate;
  const bucketCount = Math.min(12_000, Math.max(1, Math.ceil(duration * 200)));
  const framesPerBucket = Math.max(1, Math.ceil((lastFrame - firstFrame) / bucketCount));
  const envelope: number[] = [];
  for (let bucketStart = firstFrame; bucketStart < lastFrame; bucketStart += framesPerBucket) {
    const bucketEnd = Math.min(lastFrame, bucketStart + framesPerBucket);
    let peak = 0;
    for (const channel of channels) {
      for (let frame = bucketStart; frame < bucketEnd; frame += 1) {
        peak = Math.max(peak, Math.abs(channel[frame] ?? 0));
      }
    }
    envelope.push(peak);
  }

  const peak = Math.max(0, ...envelope);
  if (peak <= 0) return [];
  const threshold = peak * (0.08 + (sensitivity / 100) * 0.72);
  const minSpacingSec = Math.max(0.06, duration / (maxSlices * 2));
  const candidates: { startSec: number; level: number }[] = [];

  for (let index = 1; index < envelope.length - 1; index += 1) {
    const level = envelope[index];
    if (level < threshold || level < envelope[index - 1] || level <= envelope[index + 1]) continue;
    let onsetIndex = index;
    while (onsetIndex > 0 && envelope[onsetIndex - 1] > level * 0.12) onsetIndex -= 1;
    const candidateSec = startSec + (onsetIndex * framesPerBucket) / sampleRate;
    if (candidateSec <= startSec + 0.005) continue;
    candidates.push({ startSec: candidateSec, level });
  }

  const selected: typeof candidates = [];
  for (const candidate of candidates.sort((left, right) => right.level - left.level)) {
    if (selected.every(item => Math.abs(item.startSec - candidate.startSec) >= minSpacingSec)) {
      selected.push(candidate);
      if (selected.length >= maxSlices - 1) break;
    }
  }
  const boundaries = [startSec, ...selected.map(item => item.startSec).sort((a, b) => a - b), endSec];
  return boundaries.slice(0, -1).flatMap((sliceStart, index) => {
    const sliceEnd = boundaries[index + 1];
    return sliceEnd - sliceStart >= 0.01 ? [{ startSec: sliceStart, endSec: sliceEnd }] : [];
  });
}
