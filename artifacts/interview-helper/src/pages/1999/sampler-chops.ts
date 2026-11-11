export type SamplerSlice = {
  startSec: number;
  endSec: number;
};

export type DetectedRootNote = {
  frequencyHz: number;
  midiNote: number;
  pitchClass: number;
  confidence: number;
};

const ROOT_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function detectRootNote(
  channels: readonly Float32Array[],
  sampleRate: number,
  startSec = 0,
  endSec?: number,
): DetectedRootNote | null {
  if (!channels.length || !Number.isFinite(sampleRate) || sampleRate < 4000
    || !Number.isFinite(startSec) || startSec < 0
    || (endSec !== undefined && (!Number.isFinite(endSec) || endSec <= startSec))) {
    throw new Error("Root-note analysis needs a valid sample range.");
  }

  const frameCount = Math.min(...channels.map(channel => channel.length));
  const firstFrame = Math.min(frameCount, Math.floor(startSec * sampleRate));
  const requestedEnd = endSec === undefined ? frameCount : Math.floor(endSec * sampleRate);
  const lastFrame = Math.min(frameCount, requestedEnd);
  if (lastFrame - firstFrame < sampleRate * 0.08) return null;

  // Analyze at most 1.5 seconds and 12 kHz; this keeps work bounded for long files.
  const stride = Math.max(1, Math.ceil(sampleRate / 12_000));
  const maxSamples = Math.ceil((lastFrame - firstFrame) / stride);
  const sampleCount = Math.min(maxSamples, Math.floor(1.5 * sampleRate / stride));
  const selectedChannel = channels.reduce((bestIndex, channel, index) => {
    const best = channels[bestIndex];
    const length = Math.min(sampleCount, Math.ceil((lastFrame - firstFrame) / stride));
    let bestEnergy = 0;
    let energy = 0;
    for (let offset = 0; offset < length; offset += 1) {
      const frame = firstFrame + offset * stride;
      bestEnergy += (best[frame] ?? 0) ** 2;
      energy += (channel[frame] ?? 0) ** 2;
    }
    return energy > bestEnergy ? index : bestIndex;
  }, 0);
  const channel = channels[selectedChannel];
  const samples = new Float32Array(sampleCount);
  let mean = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const value = channel[firstFrame + index * stride] ?? 0;
    samples[index] = value;
    mean += value;
  }
  mean /= sampleCount;

  let energy = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] -= mean;
    energy += samples[index] * samples[index];
  }
  const rms = Math.sqrt(energy / sampleCount);
  if (rms < 0.003 || sampleCount < 256) return null;

  const analysisRate = sampleRate / stride;
  const minLag = Math.max(2, Math.floor(analysisRate / 1000));
  const maxLag = Math.min(Math.floor(analysisRate / 55), Math.floor(sampleCount / 2));
  if (maxLag <= minLag) return null;

  const differences = new Float64Array(maxLag + 1);
  const normalized = new Float64Array(maxLag + 1);
  let cumulativeDifference = 0;
  for (let lag = 1; lag <= maxLag; lag += 1) {
    let difference = 0;
    const compareLength = sampleCount - maxLag;
    for (let index = 0; index < compareLength; index += 1) {
      const delta = samples[index] - samples[index + lag];
      difference += delta * delta;
    }
    differences[lag] = difference;
    cumulativeDifference += difference;
    normalized[lag] = cumulativeDifference === 0 ? 1 : difference * lag / cumulativeDifference;
  }

  let chosenLag = -1;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    if (normalized[lag] < 0.16) {
      while (lag < maxLag && normalized[lag + 1] < normalized[lag]) lag += 1;
      chosenLag = lag;
      break;
    }
  }
  if (chosenLag < 0) {
    let best = 1;
    for (let lag = minLag; lag <= maxLag; lag += 1) {
      if (normalized[lag] < best) {
        best = normalized[lag];
        chosenLag = lag;
      }
    }
    if (chosenLag < 0 || normalized[chosenLag] > 0.3) return null;
  }

  const left = normalized[Math.max(minLag, chosenLag - 1)];
  const center = normalized[chosenLag];
  const right = normalized[Math.min(maxLag, chosenLag + 1)];
  const curvature = left - (2 * center) + right;
  const correction = curvature === 0 ? 0 : 0.5 * (left - right) / curvature;
  const refinedLag = chosenLag + Math.max(-0.5, Math.min(0.5, correction));
  const frequencyHz = analysisRate / refinedLag;
  if (!Number.isFinite(frequencyHz) || frequencyHz < 55 || frequencyHz > 1000) return null;

  const midiNote = Math.round(69 + 12 * Math.log2(frequencyHz / 440));
  return {
    frequencyHz,
    midiNote,
    pitchClass: ((midiNote % 12) + 12) % 12,
    confidence: Math.max(0, Math.min(1, 1 - normalized[chosenLag])),
  };
}

export function noteNameForMidi(midiNote: number): string {
  const note = Math.round(midiNote);
  return `${ROOT_NOTE_NAMES[((note % 12) + 12) % 12]}${Math.floor(note / 12) - 1}`;
}

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
