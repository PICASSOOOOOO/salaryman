import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, FileAudio, FileJson, Mic, Play, Plus, Radio, RefreshCw, Save, Square, Volume2, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/hooks/use-auth";
import { useMusicPlayer } from "@/contexts/MusicPlayerContext";
import Fm1EmulatorPanel, { type EmulatorPatchSave } from "@/components/Fm1EmulatorPanel";
import MinimoogEmulatorPanel from "@/components/MinimoogEmulatorPanel";
import { createRegionSlices, detectRootNote, findTransientSlices, noteNameForMidi } from "./sampler-chops";
import "./1999.css";
import "./EmulatorPanels.css";

type MachineId = "op1" | "sp404mkii" | "mpc_sample" | "korg_ms2000r" | "korg_m1" | "boss_ce2" | "fm1" | "smk37" | "minimoog";
type EmulatorMachine = "fm1" | "smk37";
type SoundEngineState = { tone: number; decayMs: number };
type ProjectKey = "C" | "C#" | "D" | "D#" | "E" | "F" | "F#" | "G" | "G#" | "A" | "A#" | "B";
type TimeSignature = "3/4" | "4/4" | "6/8";
type SamplerPad = {
  audioTrackId: number | null;
  startSec: number;
  endSec: number;
  tune: number;
  speed: number;
  level: number;
  tone: number;
  echo: number;
  rootKey: number | null;
};
type EmulatorState = {
  firmwareIds: Partial<Record<EmulatorMachine, string>>;
  patchSaves?: Partial<Record<EmulatorMachine, EmulatorPatchSave>>;
};
type ProjectTrack = {
  id: string;
  name: string;
  kind: "instrument" | "recording";
  machineId: MachineId;
  steps: number[];
  audioTrackId: number | null;
  overdubTrackIds?: number[];
  loopBars?: 1 | 2 | 4;
  loopBpm?: number;
  loopTimeSignature?: TimeSignature;
  muted: boolean;
  volume: number;
  soundState: SoundEngineState;
  samplerPads?: SamplerPad[];
  padPatterns?: number[][];
};
type Project = { schemaVersion: 1; name: string; bpm: number; key: ProjectKey; timeSignature: TimeSignature; tracks: ProjectTrack[]; emulatorState: EmulatorState };
type VaultEntry = { id: number; title: string; content: string; entryType: string; tags: string[]; folder: string; updatedAt: string };
type SaveState = "loading" | "saved" | "saving" | "unsaved" | "guest" | "error" | "conflict";
type MidiOutputPort = {
  id: string;
  name?: string;
  state?: string;
  send: (data: number[], timestamp?: number) => void;
};
type MidiInputMessage = { data: Uint8Array };
type MidiInputPort = {
  id: string;
  name?: string;
  state?: string;
  onmidimessage: ((event: MidiInputMessage) => void) | null;
};
type MidiAccessPort = {
  outputs: Map<string, MidiOutputPort>;
  inputs: Map<string, MidiInputPort>;
  onstatechange: ((event?: unknown) => void) | null;
};
type MidiNavigator = Navigator & {
  requestMIDIAccess?: (options?: { sysex?: boolean }) => Promise<MidiAccessPort>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const machines: { id: MachineId; name: string; descriptor: string }[] = [
  { id: "op1", name: "OP-1", descriptor: "Portable sketch instrument" },
  { id: "sp404mkii", name: "SP-404MKII", descriptor: "Sampler and performance lane" },
  { id: "mpc_sample", name: "MPC Sample", descriptor: "Beat and sample lane" },
  { id: "korg_ms2000r", name: "KORG MS2000R", descriptor: "Synth lane" },
  { id: "korg_m1", name: "KORG M1", descriptor: "Keyboard and texture lane" },
  { id: "boss_ce2", name: "BOSS CE-2", descriptor: "Effect lane" },
  { id: "fm1", name: "FM-1", descriptor: "FM tone lane" },
  { id: "smk37", name: "SMK37", descriptor: "Keyboard sketch lane" },
  { id: "minimoog", name: "Minimoog Model D", descriptor: "Three-oscillator analog-style synth" },
];
function usesSamplerPads(machineId: MachineId | undefined): boolean {
  return machineId === "mpc_sample" || machineId === "sp404mkii";
}
const projectKeys: ProjectKey[] = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const timeSignatures: TimeSignature[] = ["3/4", "4/4", "6/8"];
const MIDI_INPUT_SETTINGS_KEY = "salaryman.1999-midi-input.v1";
const DEFAULT_MIDI_PAD_NOTES = Array.from({ length: 16 }, (_, index) => 36 + index);

function loadMidiInputSettings(): { inputId: string; padNotes: number[] } {
  const fallback = { inputId: "", padNotes: [...DEFAULT_MIDI_PAD_NOTES] };
  if (typeof window === "undefined") return fallback;
  try {
    const value = JSON.parse(window.localStorage.getItem(MIDI_INPUT_SETTINGS_KEY) || "null") as {
      inputId?: unknown;
      padNotes?: unknown;
    } | null;
    const padNotes = value?.padNotes;
    if (!Array.isArray(padNotes) || padNotes.length !== 16
      || !padNotes.every(note => Number.isInteger(note) && Number(note) >= -1 && Number(note) <= 127)) {
      return { ...fallback, inputId: typeof value?.inputId === "string" ? value.inputId.slice(0, 256) : "" };
    }
    return {
      inputId: typeof value?.inputId === "string" ? value.inputId.slice(0, 256) : "",
      padNotes: padNotes.map(Number),
    };
  } catch {
    return fallback;
  }
}

function createEmptySamplerPads(): SamplerPad[] {
  return Array.from({ length: 16 }, () => ({
    audioTrackId: null, startSec: 0, endSec: 0, tune: 0, speed: 1, level: 100, tone: 100, echo: 0, rootKey: null,
  }));
}

function beatsPerBar(timeSignature: TimeSignature): number {
  const [numerator, denominator] = timeSignature.split("/").map(Number);
  return numerator * 4 / denominator;
}

const freshProject = (): Project => ({
  schemaVersion: 1,
  name: "Untitled session",
  bpm: 92,
  key: "C",
  timeSignature: "4/4",
  emulatorState: { firmwareIds: {}, patchSaves: {} },
  tracks: [
    { id: "trk-1", name: "Pulse", kind: "instrument", machineId: "op1", steps: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], audioTrackId: null, muted: false, volume: 72, soundState: { tone: 72, decayMs: 240 } },
    { id: "trk-2", name: "Low end", kind: "instrument", machineId: "fm1", steps: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], audioTrackId: null, muted: false, volume: 66, soundState: { tone: 48, decayMs: 420 } },
    { id: "trk-3", name: "Air", kind: "instrument", machineId: "korg_m1", steps: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0], audioTrackId: null, muted: false, volume: 54, soundState: { tone: 82, decayMs: 560 } },
  ],
});

function isSoundEngineState(value: unknown): value is SoundEngineState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Partial<SoundEngineState>;
  return Number.isInteger(state.tone) && Number(state.tone) >= 0 && Number(state.tone) <= 100
    && Number.isInteger(state.decayMs) && Number(state.decayMs) >= 80 && Number(state.decayMs) <= 800;
}

function isSamplerPad(value: unknown): value is SamplerPad {
  if (!isRecord(value)) return false;
  return (value.audioTrackId === null || (Number.isInteger(value.audioTrackId) && Number(value.audioTrackId) > 0))
    && Number.isFinite(value.startSec) && Number(value.startSec) >= 0
    && Number.isFinite(value.endSec) && Number(value.endSec) >= 0
    && Number.isInteger(value.tune) && Number(value.tune) >= -24 && Number(value.tune) <= 24
    && Number.isFinite(value.speed) && Number(value.speed) >= 0.25 && Number(value.speed) <= 4
    && Number.isInteger(value.level) && Number(value.level) >= 0 && Number(value.level) <= 100
    && Number.isInteger(value.tone) && Number(value.tone) >= 0 && Number(value.tone) <= 100
    && Number.isInteger(value.echo) && Number(value.echo) >= 0 && Number(value.echo) <= 100
    && (value.rootKey === null || (Number.isInteger(value.rootKey) && Number(value.rootKey) >= 0 && Number(value.rootKey) <= 11));
}

function isEmulatorState(value: unknown): value is EmulatorState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Partial<EmulatorState>;
  const firmwareIds = state.firmwareIds;
  if (!firmwareIds || typeof firmwareIds !== "object" || Array.isArray(firmwareIds)) return false;
  const firmwareValid = Object.entries(firmwareIds).every(([machineId, firmwareId]) => (
    (machineId === "fm1" || machineId === "smk37")
    && typeof firmwareId === "string"
    && firmwareId.length <= 120
    && !/[\u0000-\u001f]/.test(firmwareId)
  ));
  if (!firmwareValid) return false;
  if (state.patchSaves === undefined) return true;
  if (!state.patchSaves || typeof state.patchSaves !== "object" || Array.isArray(state.patchSaves)) return false;
  return Object.entries(state.patchSaves).every(([machineId, save]) => (
    (machineId === "fm1" || machineId === "smk37")
    && !!save
    && typeof save.objectPath === "string"
    && /^\/objects\/1999-emulator-saves\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(save.objectPath)
    && typeof save.filename === "string"
    && save.filename.length > 0
    && save.filename.length <= 120
    && /\.fm1save$/i.test(save.filename)
    && !/[\u0000-\u001f]/.test(save.filename)
    && Number.isInteger(save.sizeBytes)
    && save.sizeBytes >= 1
    && save.sizeBytes <= 16 * 1024 * 1024
  ));
}

function defaultSoundState(machineId: MachineId): SoundEngineState {
  if (machineId === "fm1") return { tone: 48, decayMs: 420 };
  if (machineId === "mpc_sample" || machineId === "sp404mkii") return { tone: 62, decayMs: 180 };
  if (machineId === "minimoog") return { tone: 68, decayMs: 420 };
  if (machineId === "korg_m1") return { tone: 82, decayMs: 560 };
  return { tone: 72, decayMs: 260 };
}

function parseProject(content: string): Project | null {
  if (content.length > 256 * 1024) return null;
  try {
    const value: unknown = JSON.parse(content);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const candidate = value as Partial<Project>;
    if (candidate.schemaVersion !== 1
      || typeof candidate.name !== "string" || !candidate.name.trim() || candidate.name.length > 80
      || !Number.isInteger(candidate.bpm) || Number(candidate.bpm) < 40 || Number(candidate.bpm) > 240
      || (candidate.key !== undefined && !projectKeys.includes(candidate.key))
      || (candidate.timeSignature !== undefined && !timeSignatures.includes(candidate.timeSignature))
      || !Array.isArray(candidate.tracks) || candidate.tracks.length > 8) return null;
    const validTracks = candidate.tracks.every((track) => {
      if (!track || typeof track !== "object") return false;
      const item = track as ProjectTrack & { soundState?: SoundEngineState };
      return typeof item.id === "string" && item.id.length > 0 && item.id.length <= 80
        && typeof item.name === "string" && !!item.name.trim() && item.name.length <= 80
        && (item.kind === "instrument" || item.kind === "recording")
        && machines.some(machine => machine.id === item.machineId)
        && Array.isArray(item.steps) && item.steps.length === 16
        && item.steps.every(step => Number.isInteger(step) && step >= 0 && step <= 127)
        && (item.audioTrackId === null || (Number.isInteger(item.audioTrackId) && Number(item.audioTrackId) > 0))
        && (item.overdubTrackIds === undefined || (
          item.kind === "recording"
          && item.audioTrackId !== null
          && Array.isArray(item.overdubTrackIds)
          && item.overdubTrackIds.length <= 49
          && item.overdubTrackIds.every(id => Number.isInteger(id) && id > 0 && id !== item.audioTrackId)
          && new Set(item.overdubTrackIds).size === item.overdubTrackIds.length
        ))
        && ((item.loopBars === undefined && item.loopBpm === undefined) || (
          item.kind === "recording"
          && item.audioTrackId !== null
          && (item.loopBars === 1 || item.loopBars === 2 || item.loopBars === 4)
          && Number.isInteger(item.loopBpm) && Number(item.loopBpm) >= 40 && Number(item.loopBpm) <= 240
          && (item.loopTimeSignature === undefined || timeSignatures.includes(item.loopTimeSignature))
        ))
        && typeof item.muted === "boolean"
        && Number.isFinite(item.volume) && item.volume >= 0 && item.volume <= 100
        && (item.samplerPads === undefined || (Array.isArray(item.samplerPads) && item.samplerPads.length === 16 && item.samplerPads.every(isSamplerPad)))
        && (item.padPatterns === undefined || (
          item.padPatterns.length === 16
          && item.padPatterns.every(pattern => Array.isArray(pattern) && pattern.length === 16
            && pattern.every(step => Number.isInteger(step) && step >= 0 && step <= 127))
        ))
        && (item.soundState === undefined || isSoundEngineState(item.soundState));
    });
    if (!validTracks) return null;
    if (candidate.emulatorState !== undefined && !isEmulatorState(candidate.emulatorState)) return null;
    const tracks = candidate.tracks.map((track) => {
      const item = track as ProjectTrack & { soundState?: SoundEngineState };
      return {
        ...item,
        soundState: item.soundState ?? defaultSoundState(item.machineId),
        ...(usesSamplerPads(item.machineId) ? {
          samplerPads: item.samplerPads ?? createEmptySamplerPads(),
          padPatterns: item.padPatterns ?? Array.from({ length: 16 }, () => Array(16).fill(0)),
        } : {}),
      };
    });
    return {
      ...(candidate as Project),
      key: candidate.key ?? "C",
      timeSignature: candidate.timeSignature ?? "4/4",
      tracks,
      emulatorState: candidate.emulatorState ?? { firmwareIds: {}, patchSaves: {} },
    };
  } catch { return null; }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function recordingAudioTrackIds(track: ProjectTrack): number[] {
  if (track.kind !== "recording" || track.audioTrackId === null) return [];
  return [track.audioTrackId, ...(track.overdubTrackIds ?? [])];
}

async function loadAudioBuffer(
  context: AudioContext,
  audioTrackId: number,
  cache: Map<number, AudioBuffer>,
): Promise<AudioBuffer> {
  const cached = cache.get(audioTrackId);
  if (cached) return cached;
  const response = await apiFetch(`/api/music/stream/${audioTrackId}`);
  if (!response.ok) throw new Error(`Sample audio could not be loaded (${response.status}).`);
  const buffer = await context.decodeAudioData(await response.arrayBuffer());
  cache.set(audioTrackId, buffer);
  return buffer;
}

function recordingPlaybackRate(track: ProjectTrack, projectBpm: number, projectMeter: TimeSignature): number {
  if (track.kind !== "recording" || !track.loopBpm) return 1;
  const recordedBeats = beatsPerBar(track.loopTimeSignature ?? "4/4");
  const sessionBeats = beatsPerBar(projectMeter);
  return (projectBpm * recordedBeats) / (track.loopBpm * sessionBeats);
}

function safeFilename(value: string) {
  return value.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "1999-project";
}

function baseFrequencyForMachine(machineId: MachineId) {
  return machineId === "mpc_sample" || machineId === "sp404mkii" ? 82
    : machineId === "fm1" ? 110
      : machineId === "minimoog" ? 130.81
      : machineId === "korg_m1" ? 261.63
        : machineId === "korg_ms2000r" ? 146.83
          : machineId === "smk37" ? 196 : 164.81;
}

function keySemitone(key: ProjectKey): number {
  return projectKeys.indexOf(key);
}

function scaleFrequencyForMachine(machineId: MachineId, stepIndex: number, key: ProjectKey): number {
  const majorScale = [0, 2, 4, 5, 7, 9, 11];
  const baseMidi = Math.round(69 + 12 * Math.log2(baseFrequencyForMachine(machineId) / 440));
  const octave = Math.floor(baseMidi / 12) * 12;
  let rootMidi = octave + keySemitone(key);
  if (rootMidi - baseMidi > 6) rootMidi -= 12;
  if (baseMidi - rootMidi > 6) rootMidi += 12;
  return 440 * Math.pow(2, (rootMidi + majorScale[stepIndex % majorScale.length] - 69) / 12);
}

function scheduleSynthVoice(context: BaseAudioContext, track: ProjectTrack, stepIndex: number, atTime: number, key: ProjectKey) {
  const wave: Record<MachineId, OscillatorType> = {
    op1: "triangle",
    sp404mkii: "square",
    mpc_sample: "sine",
    korg_ms2000r: "sawtooth",
    korg_m1: "triangle",
    boss_ce2: "sine",
    fm1: "sine",
    smk37: "sawtooth",
    minimoog: "sawtooth",
  };
  const oscillator = context.createOscillator();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  oscillator.type = wave[track.machineId];
  oscillator.frequency.setValueAtTime(scaleFrequencyForMachine(track.machineId, stepIndex, key), atTime);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(180 * Math.pow(40, track.soundState.tone / 100), atTime);
  filter.Q.setValueAtTime(0.8, atTime);
  const decaySeconds = Math.max(0.08, Math.min(0.8, track.soundState.decayMs / 1000));
  gain.gain.setValueAtTime(0.0001, atTime);
  gain.gain.linearRampToValueAtTime(Math.max(0.0001, (track.volume / 100) * 0.18), atTime + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, atTime + decaySeconds);
  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  oscillator.start(atTime);
  oscillator.stop(atTime + decaySeconds + 0.03);
}

function scheduleSamplerPad(
  context: BaseAudioContext,
  track: ProjectTrack,
  pad: SamplerPad,
  buffer: AudioBuffer,
  atTime: number,
  key: ProjectKey,
  velocity = 127,
) {
  const startSec = Math.min(buffer.duration, Math.max(0, pad.startSec));
  const requestedEnd = pad.endSec > startSec ? pad.endSec : buffer.duration;
  const endSec = Math.min(buffer.duration, Math.max(startSec, requestedEnd));
  if (endSec - startSec < 0.01) return;

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const output = context.createGain();
  const pitchOffset = pad.tune + (pad.rootKey === null ? 0 : keySemitone(key) - pad.rootKey);
  source.buffer = buffer;
  source.playbackRate.value = Math.max(0.25, Math.min(4, pad.speed * Math.pow(2, pitchOffset / 12)));
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(180 * Math.pow(100, pad.tone / 100), atTime);
  filter.Q.setValueAtTime(0.8, atTime);
  output.gain.setValueAtTime((track.volume / 100) * (pad.level / 100) * (velocity / 127) * 0.35, atTime);
  source.connect(filter);
  filter.connect(output);
  if (pad.echo > 0) {
    const delay = context.createDelay(1);
    const feedback = context.createGain();
    const wet = context.createGain();
    delay.delayTime.setValueAtTime(0.18, atTime);
    feedback.gain.setValueAtTime(Math.min(0.35, pad.echo / 300), atTime);
    wet.gain.setValueAtTime((pad.echo / 100) * 0.35, atTime);
    filter.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(output);
  }
  output.connect(context.destination);
  source.start(atTime, startSec, endSec - startSec);
  return source;
}

function scheduleMidiNote(
  output: MidiOutputPort,
  track: ProjectTrack,
  trackIndex: number,
  stepIndex: number,
  context: AudioContext,
  atTime: number,
  key: ProjectKey,
) {
  const channel = trackIndex % 16;
  const note = Math.max(0, Math.min(127, Math.round(69 + 12 * Math.log2(scaleFrequencyForMachine(track.machineId, stepIndex, key) / 440))));
  const velocity = Math.max(1, Math.min(127, Math.round(track.volume * 1.27)));
  const timestamp = performance.now() + Math.max(0, (atTime - context.currentTime) * 1000);
  output.send([0x90 + channel, note, velocity], timestamp);
  output.send([0x80 + channel, note, 0], timestamp + Math.max(80, Math.min(800, track.soundState.decayMs)));
}

function sendMidiAllNotesOff(output: MidiOutputPort) {
  const timestamp = performance.now();
  for (let channel = 0; channel < 16; channel += 1) {
    output.send([0xb0 + channel, 123, 0], timestamp);
  }
}

async function renderWav(project: Project): Promise<Blob> {
  const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass || !window.OfflineAudioContext) throw new Error("WAV rendering is not supported in this browser.");
  const sampleRate = 22050;
  const loopSeconds = (60 / project.bpm) * beatsPerBar(project.timeSignature) * 4;
  const clipBuffers = new Map<number, AudioBuffer>();
  const decoder = new AudioContextClass();
  try {
    for (const track of project.tracks) {
      if (track.muted) continue;
      const ids = track.kind === "recording"
        ? recordingAudioTrackIds(track)
        : usesSamplerPads(track.machineId)
          ? (track.samplerPads ?? []).flatMap(pad => pad.audioTrackId === null ? [] : [pad.audioTrackId])
          : [];
      for (const audioTrackId of ids) {
        if (clipBuffers.has(audioTrackId)) continue;
        const response = await apiFetch(`/api/music/stream/${audioTrackId}`);
        if (!response.ok) throw new Error(`Saved take could not be loaded (${response.status}).`);
        clipBuffers.set(audioTrackId, await decoder.decodeAudioData(await response.arrayBuffer()));
      }
    }
  } finally {
    await decoder.close().catch(() => undefined);
  }
  const clipDurationsAtSessionTempo = project.tracks.flatMap(track => (
    track.muted || track.kind !== "recording" ? [] : recordingAudioTrackIds(track).map(audioTrackId => {
      const audio = clipBuffers.get(audioTrackId);
      return audio ? audio.duration / recordingPlaybackRate(track, project.bpm, project.timeSignature) : 0;
    })
  ));
  const samplerDurations = project.tracks.flatMap(track => (
    track.muted || !usesSamplerPads(track.machineId) ? [] : (track.samplerPads ?? []).flatMap(pad => {
      if (pad.audioTrackId === null) return [];
      const audio = clipBuffers.get(pad.audioTrackId);
      if (!audio) return [];
      const pitchOffset = pad.tune + (pad.rootKey === null ? 0 : keySemitone(project.key) - pad.rootKey);
      const rate = Math.max(0.25, Math.min(4, pad.speed * Math.pow(2, pitchOffset / 12)));
      return [audio.duration / rate + (pad.echo > 0 ? 2.5 : 0)];
    })
  ));
  const samplerTail = Math.max(0, ...samplerDurations);
  const seconds = Math.min(90, Math.max(loopSeconds + samplerTail, ...clipDurationsAtSessionTempo));
  const context = new OfflineAudioContext(1, Math.ceil(seconds * sampleRate), sampleRate);
  project.tracks.forEach(track => {
    if (track.muted) return;
    if (track.kind === "recording" && track.audioTrackId !== null) {
      const gain = context.createGain();
      gain.gain.value = track.volume / 100;
      gain.connect(context.destination);
      recordingAudioTrackIds(track).forEach(audioTrackId => {
        const audio = clipBuffers.get(audioTrackId);
        if (!audio) return;
        const source = context.createBufferSource();
        source.buffer = audio;
        source.loop = true;
        source.playbackRate.value = recordingPlaybackRate(track, project.bpm, project.timeSignature);
        source.connect(gain);
        source.start(0);
      });
      return;
    }
    for (let bar = 0; bar < 4; bar += 1) {
      const stepTime = (stepIndex: number) => (60 / project.bpm) * beatsPerBar(project.timeSignature) * (bar + stepIndex / 16);
      if (usesSamplerPads(track.machineId)) {
        (track.padPatterns ?? []).forEach((steps, padIndex) => {
          const pad = track.samplerPads?.[padIndex];
          const buffer = pad?.audioTrackId === null ? undefined : clipBuffers.get(pad?.audioTrackId ?? -1);
          if (!pad || !buffer) return;
          steps.forEach((active, stepIndex) => {
            if (active) scheduleSamplerPad(context, track, pad, buffer, stepTime(stepIndex), project.key);
          });
        });
      } else {
        track.steps.forEach((active, stepIndex) => {
          if (active) scheduleSynthVoice(context, track, stepIndex, stepTime(stepIndex), project.key);
        });
      }
    }
  });
  const rendered = await context.startRendering();
  const data = rendered.getChannelData(0);
  const buffer = new ArrayBuffer(44 + data.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => { for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i)); };
  write(0, "RIFF"); view.setUint32(4, 36 + data.length * 2, true); write(8, "WAVE"); write(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, "data"); view.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i += 1) view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 0x7fff, true);
  return new Blob([buffer], { type: "audio/wav" });
}

export default function Salaryman1999() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { tracks: libraryTracks, refresh } = useMusicPlayer();
  const [project, setProject] = useState<Project>(freshProject);
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [loadError, setLoadError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState("trk-1");
  const [isRecording, setIsRecording] = useState(false);
  const [isUploadingTake, setIsUploadingTake] = useState(false);
  const [loopBars, setLoopBars] = useState<1 | 2 | 4>(1);
  const [selectedLibraryTakeId, setSelectedLibraryTakeId] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewLoadingTrackId, setPreviewLoadingTrackId] = useState<string | null>(null);
  const [previewingTrackId, setPreviewingTrackId] = useState<string | null>(null);
  const [samplerPreviewPadIndex, setSamplerPreviewPadIndex] = useState<number | null>(null);
  const [selectedPadIndex, setSelectedPadIndex] = useState(0);
  const [samplerSliceMode, setSamplerSliceMode] = useState<"regions" | "transient">("regions");
  const [samplerSliceCount, setSamplerSliceCount] = useState<4 | 8 | 16>(8);
  const [samplerSliceSensitivity, setSamplerSliceSensitivity] = useState(55);
  const [isChoppingSample, setIsChoppingSample] = useState(false);
  const [isDetectingRootNote, setIsDetectingRootNote] = useState(false);
  const [rootNoteStatus, setRootNoteStatus] = useState("");
  const samplerFileInputRef = useRef<HTMLInputElement | null>(null);
  const [playhead, setPlayhead] = useState(-1);
  const [recordingLabel, setRecordingLabel] = useState("Microphone ready");
  const [wavBusy, setWavBusy] = useState(false);
  const [vaultMixBusy, setVaultMixBusy] = useState(false);
  const [midiOutputs, setMidiOutputs] = useState<MidiOutputPort[]>([]);
  const [midiInputs, setMidiInputs] = useState<MidiInputPort[]>([]);
  const [selectedMidiOutputId, setSelectedMidiOutputId] = useState("");
  const [selectedMidiInputId, setSelectedMidiInputId] = useState(() => loadMidiInputSettings().inputId);
  const [midiPadNotes, setMidiPadNotes] = useState(() => loadMidiInputSettings().padNotes);
  const [learningMidiPadIndex, setLearningMidiPadIndex] = useState<number | null>(null);
  const [midiConnected, setMidiConnected] = useState(false);
  const [midiStatus, setMidiStatus] = useState("MIDI output is not connected.");
  const [midiInputStatus, setMidiInputStatus] = useState("Connect MIDI to enable sampler input.");
  const dirtyRef = useRef(false);
  const skipDirtyRef = useRef(true);
  const projectRef = useRef(project);
  const activeRef = useRef<{ id: number | null; updatedAt: string | null }>({ id: null, updatedAt: null });
  const savingRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recordingStartRef = useRef(0);
  const recordingStartTimerRef = useRef<number | null>(null);
  const recordingStopTimerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const clipBufferCacheRef = useRef<Map<number, AudioBuffer>>(new Map());
  const playbackSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const playbackSourcesByTrackRef = useRef<Map<string, AudioBufferSourceNode[]>>(new Map());
  const playbackGainsRef = useRef<Map<string, GainNode>>(new Map());
  const lanePreviewSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const lanePreviewGainRef = useRef<GainNode | null>(null);
  const lanePreviewGenerationRef = useRef(0);
  const samplerPreviewSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const samplerPreviewGenerationRef = useRef(0);
  const samplerMidiVoicesRef = useRef<AudioBufferSourceNode[]>([]);
  const schedulerRef = useRef<number | null>(null);
  const playingRef = useRef(false);
  const nextStepTimeRef = useRef(0);
  const playStepRef = useRef(0);
  const midiAccessRef = useRef<MidiAccessPort | null>(null);
  const selectedMidiOutputRef = useRef("");
  const selectedMidiInputRef = useRef(selectedMidiInputId);
  const midiErrorRef = useRef(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(MIDI_INPUT_SETTINGS_KEY, JSON.stringify({
        inputId: selectedMidiInputId,
        padNotes: midiPadNotes,
      }));
    } catch {
      // MIDI device preferences are best-effort and remain local to this browser.
    }
  }, [midiPadNotes, selectedMidiInputId]);

  const refreshEntries = useCallback(async () => {
    if (!isAuthenticated) {
      setEntries([]);
      return;
    }
    const response = await apiFetch("/api/vault/entries?folder=%2F1999");
    const data = await response.json().catch(() => ({})) as { entries?: VaultEntry[]; error?: string };
    if (!response.ok) throw new Error(data.error || `Project list unavailable (${response.status})`);
    setEntries(Array.isArray(data.entries) ? data.entries.filter(entry => entry.entryType === "1999_project" && !!parseProject(entry.content)) : []);
  }, [isAuthenticated]);

  useEffect(() => {
    let mounted = true;
    if (authLoading) return () => { mounted = false; };
    const load = async () => {
      if (!isAuthenticated) {
        setEntries([]);
        setActiveId(null);
        setUpdatedAt(null);
        activeRef.current = { id: null, updatedAt: null };
        const guestProject = freshProject();
        skipDirtyRef.current = true;
        projectRef.current = guestProject;
        setProject(guestProject);
        setSelectedTrackId(guestProject.tracks[0].id);
        dirtyRef.current = false;
        setConflict(false);
        setLoadError("");
        setSaveState("guest");
        return;
      }
      setSaveState("loading");
      try {
        let guestDraft: Project | null = null;
        try {
          const draft = window.sessionStorage.getItem("salaryman.1999.pending-save.v1");
          if (draft) {
            guestDraft = parseProject(draft);
            window.sessionStorage.removeItem("salaryman.1999.pending-save.v1");
          }
        } catch {
          // Session storage can be unavailable in private browsing.
        }
        if (guestDraft) {
          skipDirtyRef.current = true;
          projectRef.current = guestDraft;
          setProject(guestDraft);
          setSelectedTrackId(guestDraft.tracks[0]?.id ?? "");
          activeRef.current = { id: null, updatedAt: null };
          setActiveId(null);
          setUpdatedAt(null);
          dirtyRef.current = true;
          setSaveState("unsaved");
          return;
        }
        const response = await apiFetch("/api/vault/entries?folder=%2F1999");
        const data = await response.json().catch(() => ({})) as { entries?: VaultEntry[]; error?: string };
        if (!response.ok) throw new Error(data.error || `Project list unavailable (${response.status})`);
        if (!mounted) return;
        const validEntries = Array.isArray(data.entries) ? data.entries.filter(entry => entry.entryType === "1999_project" && !!parseProject(entry.content)) : [];
        setEntries(validEntries);
        const latest = validEntries[0];
        const latestProject = latest ? parseProject(latest.content) : null;
        if (latest && latestProject) {
          skipDirtyRef.current = true;
          projectRef.current = latestProject;
          setProject(latestProject);
          activeRef.current = { id: latest.id, updatedAt: latest.updatedAt };
          setActiveId(latest.id);
          setUpdatedAt(latest.updatedAt);
          setSelectedTrackId(latestProject.tracks[0]?.id ?? "");
          dirtyRef.current = false;
        }
        setSaveState("saved");
      } catch (error) {
        if (!mounted) return;
        setLoadError(error instanceof Error ? error.message : "Projects could not be loaded.");
        setSaveState("error");
      }
    };
    void load();
    return () => { mounted = false; };
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    projectRef.current = project;
    if (skipDirtyRef.current) {
      skipDirtyRef.current = false;
      return;
    }
    dirtyRef.current = true;
    if (isAuthenticated) {
      if (!conflict && saveState !== "loading") setSaveState("unsaved");
    } else {
      setSaveState("guest");
    }
  }, [isAuthenticated, project]);

  const requestSignInToSave = useCallback((draft?: Project) => {
    if (draft) {
      try {
        window.sessionStorage.setItem("salaryman.1999.pending-save.v1", JSON.stringify(draft));
      } catch {
        setLoadError("Allow session storage or export the project before signing in to save it.");
      }
    }
    window.location.assign(`/sign-in?returnTo=${encodeURIComponent("/1999")}`);
  }, []);

  const saveProject = useCallback(async (snapshot: Project, createAsNew = false): Promise<boolean> => {
    if (!isAuthenticated) {
      requestSignInToSave(snapshot);
      return false;
    }
    if (savingRef.current || (conflict && !createAsNew)) return false;
    savingRef.current = true;
    setSaveState("saving");
    const current = activeRef.current;
    const normalizedSnapshot: Project = {
      ...snapshot,
      name: snapshot.name.trim().slice(0, 80) || "Untitled session",
      tracks: snapshot.tracks.map((track, index) => ({
        ...track,
        name: track.name.trim().slice(0, 80) || `Track ${index + 1}`,
      })),
    };
    const snapshotJson = JSON.stringify(normalizedSnapshot);
    if (JSON.stringify(projectRef.current) === JSON.stringify(snapshot) && snapshotJson !== JSON.stringify(snapshot)) {
      skipDirtyRef.current = true;
      projectRef.current = normalizedSnapshot;
      setProject(normalizedSnapshot);
    }
    let saveAgain = false;
    try {
      const fields = {
        title: normalizedSnapshot.name,
        content: snapshotJson,
        entryType: "1999_project",
        tags: ["1999", "audio"],
        folder: "/1999",
        frontmatter: { schemaVersion: 1 },
      };
      const response = createAsNew || !current.id
        ? await apiFetch("/api/vault/entries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields) })
        : await apiFetch(`/api/vault/entries/${current.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...fields, expectedUpdatedAt: current.updatedAt }),
        });
      const data = await response.json().catch(() => ({})) as { entry?: VaultEntry; error?: string };
      if (response.status === 409) {
        setConflict(true);
        setSaveState("conflict");
        return false;
      }
      if (!response.ok || !data.entry) throw new Error(data.error || `Could not save project (${response.status})`);
      activeRef.current = { id: data.entry.id, updatedAt: data.entry.updatedAt };
      setActiveId(data.entry.id);
      setUpdatedAt(data.entry.updatedAt);
      setConflict(false);
      setLoadError("");
      await refreshEntries();
      saveAgain = JSON.stringify(projectRef.current) !== snapshotJson;
      dirtyRef.current = saveAgain;
      setSaveState(saveAgain ? "unsaved" : "saved");
      return true;
    } catch (error) {
      setSaveState("error");
      setLoadError(error instanceof Error ? error.message : "Project save failed.");
      return false;
    } finally {
      savingRef.current = false;
      if (saveAgain) window.setTimeout(() => { void saveProject(projectRef.current); }, 50);
    }
  }, [conflict, isAuthenticated, refreshEntries, requestSignInToSave]);

  useEffect(() => {
    if (!isAuthenticated || !dirtyRef.current || conflict || saveState !== "unsaved") return;
    const timer = window.setTimeout(() => { void saveProject(projectRef.current); }, 850);
    return () => window.clearTimeout(timer);
  }, [isAuthenticated, project, conflict, saveState, saveProject]);

  useEffect(() => () => {
    if (recordingStartTimerRef.current !== null) window.clearTimeout(recordingStartTimerRef.current);
    if (recordingStopTimerRef.current !== null) window.clearTimeout(recordingStopTimerRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    streamRef.current?.getTracks().forEach(track => track.stop());
    playbackSourcesRef.current.forEach(source => { try { source.stop(); } catch { /* Already stopped. */ } });
    playbackSourcesRef.current = [];
    playbackSourcesByTrackRef.current.clear();
    playbackGainsRef.current.clear();
    lanePreviewGenerationRef.current += 1;
    lanePreviewSourcesRef.current.forEach(source => {
      source.onended = null;
      try { source.stop(); } catch { /* Already stopped. */ }
    });
    lanePreviewSourcesRef.current = [];
    lanePreviewGainRef.current?.disconnect();
    lanePreviewGainRef.current = null;
    samplerPreviewSourcesRef.current.forEach(source => {
      source.onended = null;
      try { source.stop(); } catch { /* Already stopped. */ }
    });
    samplerPreviewSourcesRef.current = [];
    samplerMidiVoicesRef.current.forEach(source => {
      source.onended = null;
      try { source.stop(); } catch { /* Already stopped. */ }
    });
    samplerMidiVoicesRef.current = [];
    if (schedulerRef.current !== null) window.clearInterval(schedulerRef.current);
    playingRef.current = false;
    if (midiAccessRef.current) {
      midiAccessRef.current.onstatechange = null;
      midiAccessRef.current.inputs.forEach(input => { input.onmidimessage = null; });
    }
    const midiOutput = midiAccessRef.current?.outputs.get(selectedMidiOutputRef.current);
    if (midiOutput) {
      try { sendMidiAllNotesOff(midiOutput); } catch { /* The device may already be disconnected. */ }
    }
    void audioContextRef.current?.close().catch(() => undefined);
  }, []);

  const selectedTrack = useMemo(() => project.tracks.find(track => track.id === selectedTrackId) ?? project.tracks[0], [project.tracks, selectedTrackId]);
  const isLoopPreviewActive = previewLoadingTrackId !== null || previewingTrackId !== null || samplerPreviewPadIndex !== null;
  const selectedSamplerPad = usesSamplerPads(selectedTrack?.machineId)
    ? selectedTrack.samplerPads?.[selectedPadIndex]
    : undefined;
  const availableSamplerSamples = useMemo(() => libraryTracks.filter(track => (
    typeof track.mimeType === "string" && track.mimeType.toLowerCase().startsWith("audio/")
    && typeof track.objectPath === "string" && track.objectPath.startsWith("/objects/")
  )), [libraryTracks]);
  const selectedSamplerSample = availableSamplerSamples.find(sample => sample.id === selectedSamplerPad?.audioTrackId);
  const emptySamplerPadIndices = useMemo(() => {
    if (!usesSamplerPads(selectedTrack?.machineId)) return [];
    return (selectedTrack.samplerPads ?? createEmptySamplerPads()).flatMap((pad, index) => {
      const hasPattern = (selectedTrack.padPatterns?.[index] ?? []).some(Boolean);
      return index !== selectedPadIndex && pad.audioTrackId === null && !hasPattern ? [index] : [];
    });
  }, [selectedPadIndex, selectedTrack]);
  const selectedLoopBars = selectedTrack?.kind === "recording" ? selectedTrack.loopBars : undefined;
  const captureBarsForSelection = selectedLoopBars ?? loopBars;
  const selectedMachineSteps = usesSamplerPads(selectedTrack?.machineId)
    ? selectedTrack.padPatterns?.[selectedPadIndex] ?? selectedTrack.steps
    : selectedTrack?.steps ?? [];
  useEffect(() => {
    setSelectedLibraryTakeId("");
  }, [selectedTrackId]);
  useEffect(() => {
    setSelectedPadIndex(0);
  }, [selectedTrackId]);
  useEffect(() => {
    setRootNoteStatus("");
  }, [selectedTrackId, selectedPadIndex, selectedSamplerPad?.audioTrackId]);
  const availableLibraryTakes = useMemo(() => {
    if (selectedTrack?.kind !== "recording" || selectedTrack.audioTrackId === null) return [];
    const bars = selectedTrack.loopBars ?? loopBars;
    const bpm = selectedTrack.loopBpm ?? project.bpm;
    const loopDurationSec = (60 / bpm) * 4 * bars;
    const matchingDurations = new Set([Math.floor(loopDurationSec), Math.round(loopDurationSec)]);
    const linkedTrackIds = new Set(recordingAudioTrackIds(selectedTrack));
    return libraryTracks.filter(track => (
      typeof track.mimeType === "string"
      && track.mimeType.toLowerCase().startsWith("audio/")
      && typeof track.objectPath === "string"
      && track.objectPath.startsWith("/objects/")
      && Number.isInteger(track.durationSec)
      && track.durationSec > 0
      && matchingDurations.has(track.durationSec)
      && !linkedTrackIds.has(track.id)
    ));
  }, [libraryTracks, loopBars, project.bpm, selectedTrack]);
  useEffect(() => {
    const context = audioContextRef.current;
    if (!context) return;
    project.tracks.forEach(track => {
      const gain = playbackGainsRef.current.get(track.id);
      if (gain) gain.gain.setTargetAtTime(track.muted ? 0 : track.volume / 100, context.currentTime, 0.02);
      playbackSourcesByTrackRef.current.get(track.id)?.forEach(source => {
        source.playbackRate.setTargetAtTime(recordingPlaybackRate(track, project.bpm, project.timeSignature), context.currentTime, 0.02);
      });
    });
    const lanePreviewTrack = project.tracks.find(track => track.id === previewingTrackId && track.kind === "recording");
    if (lanePreviewTrack && lanePreviewGainRef.current) {
      lanePreviewGainRef.current.gain.setTargetAtTime(lanePreviewTrack.muted ? 0 : lanePreviewTrack.volume / 100, context.currentTime, 0.02);
      lanePreviewSourcesRef.current.forEach(source => {
        source.playbackRate.setTargetAtTime(recordingPlaybackRate(lanePreviewTrack, project.bpm, project.timeSignature), context.currentTime, 0.02);
      });
    }
  }, [previewingTrackId, project.bpm, project.tracks]);
  const updateProject = (updater: (current: Project) => Project) => setProject(current => updater(current));
  const updateTrack = (id: string, updater: (track: ProjectTrack) => ProjectTrack) => updateProject(current => ({
    ...current, tracks: current.tracks.map(track => track.id === id ? updater(track) : track),
  }));
  const updateSamplerPad = (trackId: string, padIndex: number, updater: (pad: SamplerPad) => SamplerPad) => {
    updateTrack(trackId, track => {
      const pads = track.samplerPads ?? createEmptySamplerPads();
      return {
        ...track,
        samplerPads: pads.map((pad, index) => index === padIndex ? updater(pad) : pad),
        padPatterns: track.padPatterns ?? Array.from({ length: 16 }, () => Array(16).fill(0)),
      };
    });
  };
  const removeOverdubLayer = (trackId: string, audioTrackId: number) => {
    if (playingRef.current || isLoopPreviewActive || isRecording || isUploadingTake) return;
    const target = projectRef.current.tracks.find(track => track.id === trackId && track.kind === "recording");
    if (!target?.overdubTrackIds?.includes(audioTrackId)) return;
    if (!window.confirm("Remove this overdub from the loop? The take will remain in your music library.")) return;
    updateTrack(trackId, track => track.kind === "recording"
      ? { ...track, overdubTrackIds: (track.overdubTrackIds ?? []).filter(id => id !== audioTrackId) }
      : track);
  };
  const addLibraryTakeToLoop = () => {
    if (playingRef.current || isLoopPreviewActive || isRecording || isUploadingTake) return;
    const audioTrackId = Number(selectedLibraryTakeId);
    const libraryTake = availableLibraryTakes.find(track => track.id === audioTrackId);
    const target = projectRef.current.tracks.find(track => (
      track.id === selectedTrackId && track.kind === "recording" && track.audioTrackId !== null
    ));
    if (!libraryTake || !target || recordingAudioTrackIds(target).includes(audioTrackId)) return;
    const bars = target.loopBars ?? loopBars;
    const bpm = target.loopBpm ?? projectRef.current.bpm;
    updateTrack(target.id, track => track.kind === "recording" && track.audioTrackId !== null
      ? {
        ...track,
        loopBars: track.loopBars ?? bars,
        loopBpm: track.loopBpm ?? bpm,
        overdubTrackIds: recordingAudioTrackIds(track).includes(audioTrackId)
          ? track.overdubTrackIds ?? []
          : [...(track.overdubTrackIds ?? []), audioTrackId],
      }
      : track);
    setSelectedLibraryTakeId("");
  };
  const stopSamplerPreview = () => {
    samplerPreviewGenerationRef.current += 1;
    samplerPreviewSourcesRef.current.forEach(source => {
      source.onended = null;
      try { source.stop(); } catch { /* Already stopped. */ }
    });
    samplerPreviewSourcesRef.current = [];
    setSamplerPreviewPadIndex(null);
  };
  const stopLoopPreview = () => {
    stopSamplerPreview();
    lanePreviewGenerationRef.current += 1;
    lanePreviewSourcesRef.current.forEach(source => {
      source.onended = null;
      try { source.stop(); } catch { /* Already stopped. */ }
    });
    lanePreviewSourcesRef.current = [];
    lanePreviewGainRef.current?.disconnect();
    lanePreviewGainRef.current = null;
    setPreviewLoadingTrackId(null);
    setPreviewingTrackId(null);
  };
  const toggleLoopPreview = async (track: ProjectTrack) => {
    if (playingRef.current || isRecording || isUploadingTake) return;
    if (previewLoadingTrackId === track.id || previewingTrackId === track.id) {
      stopLoopPreview();
      return;
    }
    stopLoopPreview();
    const generation = lanePreviewGenerationRef.current;
    setLoadError("");
    setPreviewLoadingTrackId(track.id);
    try {
      const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) throw new Error("Loop preview is not supported in this browser.");
      const context = audioContextRef.current ?? new AudioContextClass();
      audioContextRef.current = context;
      await context.resume();
      const audioTrackIds = recordingAudioTrackIds(track);
      if (!audioTrackIds.length) throw new Error("This loop has no audio takes to preview.");
      const buffers = await Promise.all(audioTrackIds.map(async audioTrackId => {
        const cached = clipBufferCacheRef.current.get(audioTrackId);
        if (cached) return cached;
        const response = await apiFetch(`/api/music/stream/${audioTrackId}`);
        if (!response.ok) throw new Error(`Loop audio could not be loaded (${response.status}).`);
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        clipBufferCacheRef.current.set(audioTrackId, buffer);
        return buffer;
      }));
      if (generation !== lanePreviewGenerationRef.current) return;

      const gain = context.createGain();
      gain.gain.value = track.muted ? 0 : track.volume / 100;
      gain.connect(context.destination);
      let remaining = buffers.length;
      const sources = buffers.map(buffer => {
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = false;
        source.playbackRate.value = recordingPlaybackRate(track, projectRef.current.bpm, projectRef.current.timeSignature);
        source.connect(gain);
        source.onended = () => {
          if (generation !== lanePreviewGenerationRef.current) return;
          remaining -= 1;
          if (remaining === 0) {
            lanePreviewSourcesRef.current = [];
            lanePreviewGainRef.current?.disconnect();
            lanePreviewGainRef.current = null;
            setPreviewingTrackId(null);
          }
        };
        return source;
      });
      lanePreviewSourcesRef.current = sources;
      lanePreviewGainRef.current = gain;
      setPreviewLoadingTrackId(null);
      setPreviewingTrackId(track.id);
      const startsAt = context.currentTime + 0.04;
      sources.forEach(source => source.start(startsAt));
    } catch (error) {
      if (generation !== lanePreviewGenerationRef.current) return;
      stopLoopPreview();
      setLoadError(error instanceof Error ? error.message : "Loop preview could not start.");
    }
  };
  const refreshMidiOutputs = (access: MidiAccessPort) => {
    const outputs = Array.from(access.outputs.values()).filter(output => output.state !== "disconnected");
    setMidiOutputs(outputs);
    const selected = outputs.some(output => output.id === selectedMidiOutputRef.current)
      ? selectedMidiOutputRef.current
      : outputs[0]?.id ?? "";
    selectedMidiOutputRef.current = selected;
    setSelectedMidiOutputId(selected);
    setMidiStatus(outputs.length
      ? `${outputs.length} MIDI output${outputs.length === 1 ? "" : "s"} available.`
      : "MIDI is connected, but no output devices were found.");
  };
  const refreshMidiInputs = (access: MidiAccessPort) => {
    const inputs = Array.from(access.inputs.values()).filter(input => input.state !== "disconnected");
    setMidiInputs(inputs);
    const selected = inputs.some(input => input.id === selectedMidiInputRef.current)
      ? selectedMidiInputRef.current
      : inputs[0]?.id ?? "";
    selectedMidiInputRef.current = selected;
    setSelectedMidiInputId(selected);
    setMidiInputStatus(inputs.length
      ? selected
        ? `Ready for pad notes from ${inputs.find(input => input.id === selected)?.name || "selected MIDI input"}.`
        : "Choose a MIDI input."
      : "MIDI is connected, but no input devices were found.");
  };
  const connectMidi = async () => {
    const requestMIDIAccess = (navigator as MidiNavigator).requestMIDIAccess;
    if (!requestMIDIAccess) {
      setMidiStatus("Web MIDI is unavailable here. Use a current Chrome or Edge browser over HTTPS.");
      setMidiInputStatus("Web MIDI input is unavailable here. Use a current Chrome or Edge browser over HTTPS.");
      return;
    }
    try {
      const access = await requestMIDIAccess.call(navigator, { sysex: false });
      midiAccessRef.current = access;
      access.onstatechange = () => {
        refreshMidiOutputs(access);
        refreshMidiInputs(access);
      };
      setMidiConnected(true);
      midiErrorRef.current = false;
      refreshMidiOutputs(access);
      refreshMidiInputs(access);
    } catch (error) {
      setMidiConnected(false);
      setMidiStatus(error instanceof Error
        ? `MIDI permission or device access failed: ${error.message}`
        : "MIDI permission or device access failed.");
      setMidiInputStatus(error instanceof Error
        ? `MIDI input permission failed: ${error.message}`
        : "MIDI input permission failed.");
    }
  };
  const chooseMidiOutput = (outputId: string) => {
    selectedMidiOutputRef.current = outputId;
    setSelectedMidiOutputId(outputId);
    midiErrorRef.current = false;
    const output = midiOutputs.find(candidate => candidate.id === outputId);
    setMidiStatus(output ? `Ready to send notes to ${output.name || "selected MIDI output"}.` : "Choose a MIDI output.");
  };
  const chooseMidiInput = (inputId: string) => {
    selectedMidiInputRef.current = inputId;
    setSelectedMidiInputId(inputId);
    setLearningMidiPadIndex(null);
    const input = midiInputs.find(candidate => candidate.id === inputId);
    setMidiInputStatus(input
      ? `Ready for pad notes from ${input.name || "selected MIDI input"}.`
      : "Choose a MIDI input.");
  };
  const resetMidiPadNotes = () => {
    setMidiPadNotes([...DEFAULT_MIDI_PAD_NOTES]);
    setLearningMidiPadIndex(null);
    setMidiInputStatus("Restored default mapping: MIDI notes 36–51 to pads 01–16.");
  };
  const uploadAudioToLibrary = async (file: File, durationSec: number) => {
    if (!isAuthenticated) throw new Error("Sign in to add audio to your SALARYMAN music library.");
    const request = await apiFetch("/api/storage/uploads/request-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
    });
    const signed = await request.json().catch(() => ({})) as { uploadURL?: string; objectPath?: string; error?: string };
    if (!request.ok || !signed.uploadURL || !signed.objectPath) {
      throw new Error(signed.error || "Could not prepare the private audio upload.");
    }
    const uploaded = await fetch(signed.uploadURL, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!uploaded.ok) throw new Error(`Audio upload failed (${uploaded.status}).`);

    const title = file.name.replace(/\.[^.]+$/, "").slice(0, 256);
    const saved = await apiFetch("/api/music/tracks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        artist: "SALARYMAN 1999",
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        durationSec,
        objectPath: signed.objectPath,
        source: "upload",
      }),
    });
    const result = await saved.json().catch(() => ({})) as { track?: { id: number }; error?: string };
    if (!saved.ok || !result.track?.id) throw new Error(result.error || "The audio file uploaded but could not be added to your library.");
    await refresh();
    return result.track.id;
  };
  const uploadSamplerSample = async (file: File) => {
    if (!isAuthenticated) {
      requestSignInToSave();
      return;
    }
    const trackId = selectedTrackId;
    const padIndex = selectedPadIndex;
    const track = projectRef.current.tracks.find(candidate => candidate.id === trackId);
    if (!file || !usesSamplerPads(track?.machineId)) return;
    if (file.size < 1 || file.size > 100 * 1024 * 1024) {
      setLoadError("Choose an audio file smaller than 100 MB.");
      return;
    }
    setIsUploadingTake(true);
    setLoadError("");
    setRecordingLabel("Importing sample");
    try {
      const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) throw new Error("Sample import is not supported in this browser.");
      const context = audioContextRef.current ?? new AudioContextClass();
      audioContextRef.current = context;
      await context.resume();
      const buffer = await context.decodeAudioData(await file.arrayBuffer());
      const audioTrackId = await uploadAudioToLibrary(file, Math.max(1, Math.ceil(buffer.duration)));
      clipBufferCacheRef.current.set(audioTrackId, buffer);
      updateSamplerPad(trackId, padIndex, pad => ({
        ...pad, audioTrackId, startSec: 0, endSec: 0, rootKey: null,
      }));
      setRecordingLabel(`Sample added to pad ${String(padIndex + 1).padStart(2, "0")}.`);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "The sample could not be imported.");
      setRecordingLabel("Sample import failed.");
    } finally {
      setIsUploadingTake(false);
      if (samplerFileInputRef.current) samplerFileInputRef.current.value = "";
    }
  };
  const chopSamplerSample = async () => {
    const trackId = selectedTrackId;
    const padIndex = selectedPadIndex;
    const track = projectRef.current.tracks.find(candidate => candidate.id === trackId);
    const sourcePad = usesSamplerPads(track?.machineId) ? track?.samplerPads?.[padIndex] : undefined;
    if (!track || !usesSamplerPads(track.machineId) || !sourcePad?.audioTrackId) return;

    const freeIndices = (track.samplerPads ?? createEmptySamplerPads()).flatMap((pad, index) => (
      index !== padIndex && pad.audioTrackId === null && !(track.padPatterns?.[index] ?? []).some(Boolean) ? [index] : []
    ));
    if (freeIndices.length < samplerSliceCount - 1) {
      setLoadError(`Need ${samplerSliceCount - 1} empty pads; ${freeIndices.length} available.`);
      return;
    }

    setIsChoppingSample(true);
    setLoadError("");
    try {
      const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) throw new Error("Sample slicing is not supported in this browser.");
      const context = audioContextRef.current ?? new AudioContextClass();
      audioContextRef.current = context;
      await context.resume();
      const buffer = await loadAudioBuffer(context, sourcePad.audioTrackId, clipBufferCacheRef.current);
      const startSec = Math.min(buffer.duration, Math.max(0, sourcePad.startSec));
      const endSec = Math.min(buffer.duration, sourcePad.endSec > startSec ? sourcePad.endSec : buffer.duration);
      const slices = samplerSliceMode === "regions"
        ? createRegionSlices(startSec, endSec, samplerSliceCount)
        : findTransientSlices(
          Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel)),
          buffer.sampleRate,
          startSec,
          endSec,
          samplerSliceCount,
          samplerSliceSensitivity,
        );
      if (slices.length < 2) throw new Error("No clear transients found. Try Regions mode or lower sensitivity.");

      const latestTrack = projectRef.current.tracks.find(candidate => candidate.id === trackId);
      const latestSource = usesSamplerPads(latestTrack?.machineId) ? latestTrack?.samplerPads?.[padIndex] : undefined;
      if (latestSource?.audioTrackId !== sourcePad.audioTrackId) {
        throw new Error("The selected sample changed. Select it again and retry.");
      }
      const latestFreeIndices = (latestTrack?.samplerPads ?? createEmptySamplerPads()).flatMap((pad, index) => (
        index !== padIndex && pad.audioTrackId === null && !(latestTrack?.padPatterns?.[index] ?? []).some(Boolean) ? [index] : []
      ));
      if (latestFreeIndices.length < slices.length - 1) {
        throw new Error("There are not enough empty pads for these slices.");
      }
      const targets = [padIndex, ...latestFreeIndices.slice(0, slices.length - 1)];
      if (!window.confirm(
        `Create ${slices.length} slices? PAD ${String(padIndex + 1).padStart(2, "0")} becomes slice 1; remaining slices use empty pads. The original audio stays in your library.`,
      )) return;

      updateTrack(trackId, current => {
        if (!usesSamplerPads(current.machineId) || current.samplerPads?.[padIndex]?.audioTrackId !== sourcePad.audioTrackId) return current;
        const pads = current.samplerPads ?? createEmptySamplerPads();
        return {
          ...current,
          samplerPads: pads.map((pad, index) => {
            const sliceIndex = targets.indexOf(index);
            return sliceIndex < 0 ? pad : {
              ...sourcePad,
              audioTrackId: sourcePad.audioTrackId,
              startSec: slices[sliceIndex].startSec,
              endSec: slices[sliceIndex].endSec,
            };
          }),
        };
      });
      setSelectedPadIndex(padIndex);
      setRecordingLabel(`${slices.length} slices assigned from PAD ${String(padIndex + 1).padStart(2, "0")}.`);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "The sample could not be sliced.");
      setRecordingLabel("Sample slicing failed.");
    } finally {
      setIsChoppingSample(false);
    }
  };
  const detectSamplerRootNote = async () => {
    const trackId = selectedTrackId;
    const padIndex = selectedPadIndex;
    const track = projectRef.current.tracks.find(candidate => candidate.id === trackId);
    const sourcePad = usesSamplerPads(track?.machineId) ? track?.samplerPads?.[padIndex] : undefined;
    if (!track || !usesSamplerPads(track.machineId) || !sourcePad?.audioTrackId) return;

    setIsDetectingRootNote(true);
    setRootNoteStatus("ANALYZING");
    setLoadError("");
    try {
      const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) throw new Error("Root-note analysis is not supported in this browser.");
      const context = audioContextRef.current ?? new AudioContextClass();
      audioContextRef.current = context;
      await context.resume();
      const buffer = await loadAudioBuffer(context, sourcePad.audioTrackId, clipBufferCacheRef.current);
      const endSec = sourcePad.endSec > sourcePad.startSec ? sourcePad.endSec : buffer.duration;
      const result = detectRootNote(
        Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel)),
        buffer.sampleRate,
        sourcePad.startSec,
        endSec,
      );
      if (!result) {
        setRootNoteStatus("NO CLEAR PITCH · SET MANUALLY");
        return;
      }
      const currentTrack = projectRef.current.tracks.find(candidate => candidate.id === trackId);
      const currentPad = usesSamplerPads(currentTrack?.machineId) ? currentTrack?.samplerPads?.[padIndex] : undefined;
      if (currentPad?.audioTrackId !== sourcePad.audioTrackId) {
        throw new Error("The selected sample changed. Select it again and retry.");
      }
      updateSamplerPad(trackId, padIndex, pad => ({ ...pad, rootKey: result.pitchClass }));
      setRootNoteStatus(`DETECTED ${noteNameForMidi(result.midiNote)} · ${result.frequencyHz.toFixed(1)} HZ`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Root-note analysis failed.";
      setRootNoteStatus("DETECTION FAILED");
      setLoadError(message);
    } finally {
      setIsDetectingRootNote(false);
    }
  };
  const previewSamplerPad = async (padIndex: number) => {
    const track = projectRef.current.tracks.find(candidate => candidate.id === selectedTrackId);
    setSelectedPadIndex(padIndex);
    if (!track || playingRef.current || isRecording || isUploadingTake || !usesSamplerPads(track.machineId)) return;
    stopLoopPreview();
    const generation = samplerPreviewGenerationRef.current;
    const pad = track.samplerPads?.[padIndex];
    if (!pad?.audioTrackId) return;
    setSamplerPreviewPadIndex(padIndex);
    try {
      const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) throw new Error("Sampler preview is not supported in this browser.");
      const context = audioContextRef.current ?? new AudioContextClass();
      audioContextRef.current = context;
      await context.resume();
      const buffer = await loadAudioBuffer(context, pad.audioTrackId, clipBufferCacheRef.current);
      if (generation !== samplerPreviewGenerationRef.current) return;
      const source = scheduleSamplerPad(context, track, pad, buffer, context.currentTime + 0.02, projectRef.current.key);
      if (!source) return;
      source.onended = () => {
        if (generation !== samplerPreviewGenerationRef.current) return;
        samplerPreviewSourcesRef.current = samplerPreviewSourcesRef.current.filter(item => item !== source);
        setSamplerPreviewPadIndex(null);
      };
      samplerPreviewSourcesRef.current = [source];
    } catch (error) {
      if (generation === samplerPreviewGenerationRef.current) {
        setSamplerPreviewPadIndex(null);
        setLoadError(error instanceof Error ? error.message : "Sampler preview could not start.");
      }
    }
  };
  const triggerMidiSamplerPad = useCallback(async (padIndex: number, velocity: number) => {
    const track = projectRef.current.tracks.find(candidate => candidate.id === selectedTrackId);
    if (track?.kind !== "instrument" || !usesSamplerPads(track.machineId)) {
      setMidiInputStatus("Select an MPC Sample or SP-404MKII lane to use MIDI pad input.");
      return;
    }
    if (isRecording || isUploadingTake) {
      setMidiInputStatus("Stop recording or sample import before playing MIDI pads.");
      return;
    }
    setSelectedPadIndex(padIndex);
    if (track.muted) {
      setMidiInputStatus(`PAD ${String(padIndex + 1).padStart(2, "0")} is muted with its lane.`);
      return;
    }
    const pad = track.samplerPads?.[padIndex];
    if (!pad?.audioTrackId) {
      setMidiInputStatus(`PAD ${String(padIndex + 1).padStart(2, "0")} has no sample.`);
      return;
    }
    try {
      const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) throw new Error("Sampler playback is not supported in this browser.");
      const context = audioContextRef.current ?? new AudioContextClass();
      audioContextRef.current = context;
      await context.resume();
      const buffer = await loadAudioBuffer(context, pad.audioTrackId, clipBufferCacheRef.current);
      const currentTrack = projectRef.current.tracks.find(candidate => candidate.id === track.id);
      const currentPad = currentTrack?.samplerPads?.[padIndex];
      if (!currentTrack || !usesSamplerPads(currentTrack.machineId) || currentPad?.audioTrackId !== pad.audioTrackId) return;
      const source = scheduleSamplerPad(
        context,
        currentTrack,
        currentPad,
        buffer,
        context.currentTime + 0.01,
        projectRef.current.key,
        velocity,
      );
      if (!source) {
        setMidiInputStatus(`PAD ${String(padIndex + 1).padStart(2, "0")} has an invalid sample trim.`);
        return;
      }
      samplerMidiVoicesRef.current.push(source);
      if (playingRef.current) playbackSourcesRef.current.push(source);
      source.onended = () => {
        samplerMidiVoicesRef.current = samplerMidiVoicesRef.current.filter(item => item !== source);
        playbackSourcesRef.current = playbackSourcesRef.current.filter(item => item !== source);
      };
      setMidiInputStatus(`PAD ${String(padIndex + 1).padStart(2, "0")} · velocity ${velocity}.`);
    } catch (error) {
      setMidiInputStatus(error instanceof Error ? error.message : "MIDI pad sample could not play.");
    }
  }, [isRecording, isUploadingTake, selectedTrackId]);

  useEffect(() => {
    const input = midiConnected ? midiAccessRef.current?.inputs.get(selectedMidiInputId) : undefined;
    if (!input) return;
    const handleMidiMessage = (event: MidiInputMessage) => {
      const [statusByte, note, velocity] = event.data;
      if (!Number.isInteger(statusByte) || !Number.isInteger(note) || !Number.isInteger(velocity)) return;
      if ((statusByte & 0xf0) !== 0x90 || velocity === 0) return;
      if (learningMidiPadIndex !== null) {
        const learnedPadIndex = learningMidiPadIndex;
        setMidiPadNotes(current => current.map((existing, index) => (
          index === learnedPadIndex ? note : existing === note ? -1 : existing
        )));
        setLearningMidiPadIndex(null);
        setMidiInputStatus(`PAD ${String(learnedPadIndex + 1).padStart(2, "0")} learned MIDI note ${note}.`);
        void triggerMidiSamplerPad(learnedPadIndex, velocity);
        return;
      }
      const padIndex = midiPadNotes.indexOf(note);
      if (padIndex >= 0) void triggerMidiSamplerPad(padIndex, velocity);
    };
    input.onmidimessage = handleMidiMessage;
    return () => {
      if (input.onmidimessage === handleMidiMessage) input.onmidimessage = null;
    };
  }, [learningMidiPadIndex, midiConnected, midiPadNotes, selectedMidiInputId, triggerMidiSamplerPad]);

  const uploadEmulatorPatch = async (machine: EmulatorMachine, file: File) => {
    if (!isAuthenticated) {
      requestSignInToSave(projectRef.current);
      throw new Error("Sign in to save emulator patches to your 1999 project.");
    }
    if (file.size < 1 || file.size > 16 * 1024 * 1024) {
      throw new Error("The .fm1save file must be smaller than 16 MB.");
    }
    let saveData: unknown;
    try {
      saveData = JSON.parse(await file.text());
    } catch {
      throw new Error("This .fm1save file is not valid JSON.");
    }
    if (!isRecord(saveData)
      || saveData.format !== "fm1-emulator-save"
      || saveData.version !== 1
      || typeof saveData.name !== "string"
      || saveData.name.length > 256
      || typeof saveData.hash !== "string"
      || !/^[a-f0-9]{64}$/.test(saveData.hash)
      || !Array.isArray(saveData.sectors)
      || saveData.sectors.length > 256
      || (saveData.package !== null && typeof saveData.package !== "string")) {
      throw new Error("This file is not a supported FM-1/SMK-37 patch save.");
    }
    if (conflict) throw new Error("Resolve the project save conflict before attaching a patch.");
    if (!activeRef.current.id) {
      const created = await saveProject(projectRef.current, true);
      if (!created || !activeRef.current.id) {
        throw new Error("The 1999 project could not be saved. Try again when its save status is clear.");
      }
    }
    const projectId = activeRef.current.id!;
    const metadata = { filename: file.name, sizeBytes: file.size };
    const request = await apiFetch(`/api/vault/entries/${projectId}/emulator-save/${machine}/upload-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metadata),
    });
    const signed = await request.json().catch(() => ({})) as { uploadURL?: string; objectPath?: string; error?: string };
    if (!request.ok || !signed.uploadURL || !signed.objectPath) {
      throw new Error(signed.error || "Could not prepare the private patch upload.");
    }
    const uploaded = await fetch(signed.uploadURL, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/json" },
      body: file,
    });
    if (!uploaded.ok) throw new Error(`Patch upload failed (${uploaded.status}).`);

    const completed = await apiFetch(`/api/vault/entries/${projectId}/emulator-save/${machine}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...metadata, objectPath: signed.objectPath }),
    });
    const completion = await completed.json().catch(() => ({})) as { error?: string };
    if (!completed.ok) throw new Error(completion.error || "The uploaded patch could not be secured.");

    const next: Project = {
      ...projectRef.current,
      emulatorState: {
        ...projectRef.current.emulatorState,
        patchSaves: {
          ...projectRef.current.emulatorState.patchSaves,
          [machine]: { objectPath: signed.objectPath, filename: file.name, sizeBytes: file.size },
        },
      },
    };
    skipDirtyRef.current = true;
    projectRef.current = next;
    setProject(next);
    dirtyRef.current = true;
    const saved = await saveProject(next);
    if (!saved) throw new Error("The patch uploaded, but its project link did not save. Resolve the project conflict and retry.");
  };

  const downloadEmulatorPatch = async (machine: EmulatorMachine) => {
    const projectId = activeRef.current.id;
    if (!projectId) throw new Error("Save this project before downloading its patch.");
    const response = await apiFetch(`/api/vault/entries/${projectId}/emulator-save/${machine}`);
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error || `Patch download failed (${response.status}).`);
    }
    const save = projectRef.current.emulatorState.patchSaves?.[machine];
    downloadBlob(await response.blob(), save?.filename ?? `${machine}-patch.fm1save`);
  };

  const togglePlayback = async () => {
    if (playingRef.current) {
      playingRef.current = false;
      setIsPlaying(false);
      setPlayhead(-1);
      if (schedulerRef.current !== null) window.clearInterval(schedulerRef.current);
      schedulerRef.current = null;
      const stoppedSources = new Set(playbackSourcesRef.current);
      playbackSourcesRef.current.forEach(source => { try { source.stop(); } catch { /* Already stopped. */ } });
      samplerMidiVoicesRef.current = samplerMidiVoicesRef.current.filter(source => !stoppedSources.has(source));
      playbackSourcesRef.current = [];
      playbackSourcesByTrackRef.current.clear();
      playbackGainsRef.current.clear();
      const midiOutput = midiAccessRef.current?.outputs.get(selectedMidiOutputRef.current);
      if (midiOutput) {
        try { sendMidiAllNotesOff(midiOutput); }
        catch { setMidiStatus("MIDI output disconnected before notes could be stopped."); }
      }
      return;
    }
    stopLoopPreview();
    const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      setLoadError("Loop playback is not supported in this browser.");
      return;
    }
    try {
      const context = audioContextRef.current ?? new AudioContextClass();
      audioContextRef.current = context;
      await context.resume();
      const snapshot = projectRef.current;
      const recordingTracks = snapshot.tracks.filter(track => track.kind === "recording" && track.audioTrackId !== null);
      const recordingAudioIds = new Set(recordingTracks.flatMap(recordingAudioTrackIds));
      const samplerAudioIds = new Set(snapshot.tracks.flatMap(track => (
        usesSamplerPads(track.machineId)
          ? (track.samplerPads ?? []).flatMap(pad => pad.audioTrackId === null ? [] : [pad.audioTrackId])
          : []
      )));
      for (const audioTrackId of new Set([...recordingAudioIds, ...samplerAudioIds])) {
        await loadAudioBuffer(context, audioTrackId, clipBufferCacheRef.current);
      }
      const startsAt = context.currentTime + 0.04;
      playbackSourcesRef.current = [];
      playbackSourcesByTrackRef.current.clear();
      playbackGainsRef.current.clear();
      recordingTracks.forEach(track => {
        const audioTrackIds = recordingAudioTrackIds(track);
        if (!audioTrackIds.length) return;
        const gain = context.createGain();
        gain.gain.value = track.muted ? 0 : track.volume / 100;
        gain.connect(context.destination);
        const trackSources: AudioBufferSourceNode[] = [];
        audioTrackIds.forEach(audioTrackId => {
          const audio = clipBufferCacheRef.current.get(audioTrackId);
          if (!audio) return;
          const source = context.createBufferSource();
          source.buffer = audio;
          source.loop = true;
          source.playbackRate.value = recordingPlaybackRate(track, snapshot.bpm, snapshot.timeSignature);
          source.connect(gain);
          source.start(startsAt);
          playbackSourcesRef.current.push(source);
          trackSources.push(source);
        });
        playbackSourcesByTrackRef.current.set(track.id, trackSources);
        playbackGainsRef.current.set(track.id, gain);
      });
      playingRef.current = true;
      setIsPlaying(true);
      playStepRef.current = 0;
      nextStepTimeRef.current = startsAt;
      schedulerRef.current = window.setInterval(() => {
        if (!playingRef.current) return;
        while (nextStepTimeRef.current < context.currentTime + 0.12) {
          const snapshot = projectRef.current;
          const stepIndex = playStepRef.current;
          const midiOutput = midiAccessRef.current?.outputs.get(selectedMidiOutputRef.current);
          snapshot.tracks.forEach((track, trackIndex) => {
            if (track.muted || track.kind !== "instrument") return;
            if (usesSamplerPads(track.machineId)) {
              (track.padPatterns ?? []).forEach((pattern, padIndex) => {
                const velocity = pattern[stepIndex];
                const pad = track.samplerPads?.[padIndex];
                const buffer = pad?.audioTrackId === null ? undefined : clipBufferCacheRef.current.get(pad?.audioTrackId ?? -1);
                if (velocity && pad && buffer) {
                  const source = scheduleSamplerPad(context, track, pad, buffer, nextStepTimeRef.current, snapshot.key, velocity);
                  if (source) {
                    source.onended = () => {
                      playbackSourcesRef.current = playbackSourcesRef.current.filter(item => item !== source);
                    };
                    playbackSourcesRef.current.push(source);
                  }
                }
              });
              return;
            }
            if (track.steps[stepIndex]) {
              scheduleSynthVoice(context, track, stepIndex, nextStepTimeRef.current, snapshot.key);
              if (midiOutput) {
                try {
                  scheduleMidiNote(midiOutput, track, trackIndex, stepIndex, context, nextStepTimeRef.current, snapshot.key);
                } catch (error) {
                  if (!midiErrorRef.current) {
                    midiErrorRef.current = true;
                    setMidiStatus(error instanceof Error
                      ? `MIDI output stopped: ${error.message}`
                      : "MIDI output stopped unexpectedly.");
                  }
                }
              }
            }
          });
          setPlayhead(stepIndex);
          playStepRef.current = (stepIndex + 1) % 16;
          nextStepTimeRef.current += (60 / snapshot.bpm) * beatsPerBar(snapshot.timeSignature) / 16;
        }
      }, 25);
    } catch (error) {
      playingRef.current = false;
      setIsPlaying(false);
      playbackSourcesRef.current.forEach(source => { try { source.stop(); } catch { /* Already stopped. */ } });
      playbackSourcesRef.current = [];
      playbackSourcesByTrackRef.current.clear();
      playbackGainsRef.current.clear();
      setLoadError(error instanceof Error ? error.message : "Loop playback could not start.");
    }
  };

  const openEntry = (entry: VaultEntry) => {
    if (isRecording || isUploadingTake) {
      setRecordingLabel("Stop or finish saving the take before switching sessions.");
      return;
    }
    if ((dirtyRef.current || conflict) && !window.confirm("Switch sessions and discard the unsaved local version?")) return;
    const parsed = parseProject(entry.content);
    if (!parsed) return;
    stopLoopPreview();
    skipDirtyRef.current = true;
    projectRef.current = parsed;
    setProject(parsed);
    activeRef.current = { id: entry.id, updatedAt: entry.updatedAt };
    setActiveId(entry.id);
    setUpdatedAt(entry.updatedAt);
    setConflict(false);
    dirtyRef.current = false;
    setSaveState("saved");
    setSelectedTrackId(parsed.tracks[0]?.id ?? "");
  };
  const startNewProject = () => {
    if (isRecording || isUploadingTake) {
      setRecordingLabel("Stop or finish saving the take before starting a new session.");
      return;
    }
    if ((dirtyRef.current || conflict) && !window.confirm("Start a new session and discard the unsaved local version?")) return;
    stopLoopPreview();
    const next = freshProject();
    next.name = "Untitled session";
    skipDirtyRef.current = false;
    projectRef.current = next;
    setProject(next);
    setActiveId(null);
    setUpdatedAt(null);
    activeRef.current = { id: null, updatedAt: null };
    setConflict(false);
    dirtyRef.current = true;
    setSaveState("unsaved");
    setSelectedTrackId(next.tracks[0].id);
  };

  const exportProject = () => downloadBlob(new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }), `${safeFilename(project.name)}.1999.json`);
  const exportWav = async () => {
    setWavBusy(true);
    try { downloadBlob(await renderWav(project), `${safeFilename(project.name)}.wav`); }
    catch (error) { setLoadError(error instanceof Error ? error.message : "WAV export failed."); }
    finally { setWavBusy(false); }
  };
  const saveWavToLibrary = async () => {
    if (!isAuthenticated) {
      requestSignInToSave();
      return;
    }
    setVaultMixBusy(true);
    try {
      const blob = await renderWav(project);
      const filename = `${safeFilename(project.name)}.wav`;
      const file = new File([blob], filename, { type: "audio/wav", lastModified: Date.now() });
      const seconds = Math.ceil(Math.max(0, blob.size - 44) / (22050 * 2));
      await uploadAudioToLibrary(file, seconds);
      setRecordingLabel("Mix saved to your SALARYMAN music library.");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "The mix could not be saved.");
    } finally {
      setVaultMixBusy(false);
    }
  };

  const startRecording = async () => {
    if (!isAuthenticated) {
      requestSignInToSave();
      return;
    }
    if (isLoopPreviewActive) {
      setRecordingLabel("Stop loop preview before recording.");
      return;
    }
    const selectedAtStart = projectRef.current.tracks.find(track => track.id === selectedTrackId);
    const recordingTargetId = selectedAtStart?.kind === "recording" ? selectedAtStart.id : null;
    const recordingBars = selectedAtStart?.kind === "recording" ? selectedAtStart.loopBars ?? loopBars : loopBars;
    const recordingBpm = selectedAtStart?.kind === "recording" ? selectedAtStart.loopBpm ?? projectRef.current.bpm : projectRef.current.bpm;
    const recordingTimeSignature = selectedAtStart?.kind === "recording"
      ? selectedAtStart.loopTimeSignature ?? projectRef.current.timeSignature
      : projectRef.current.timeSignature;
    if (!recordingTargetId && projectRef.current.tracks.length >= 8) {
      setRecordingLabel("Arrangement full · 8 lane limit");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRecordingLabel("Microphone recording is not available in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        if (recordingStartTimerRef.current !== null) window.clearTimeout(recordingStartTimerRef.current);
        if (recordingStopTimerRef.current !== null) window.clearTimeout(recordingStopTimerRef.current);
        recordingStartTimerRef.current = null;
        recordingStopTimerRef.current = null;
        const duration = Math.max(1, Math.round((Date.now() - recordingStartRef.current) / 1000));
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setIsRecording(false);
        const type = recorder.mimeType || "audio/webm";
        const take = new File(chunksRef.current, `1999-take-${Date.now()}.${type.includes("mp4") ? "m4a" : "webm"}`, { type, lastModified: Date.now() });
        setRecordingLabel(`Saving loop · ${duration}s`);
        setIsUploadingTake(true);
        try {
          const audioTrackId = await uploadAudioToLibrary(take, duration);
          const current = projectRef.current;
          const target = recordingTargetId
            ? current.tracks.find(track => track.id === recordingTargetId && track.kind === "recording")
            : undefined;
          if (recordingTargetId && !target) throw new Error("The selected loop is no longer available.");
          if (!recordingTargetId && current.tracks.length >= 8) throw new Error("Arrangement full · 8 lane limit");
          let next: Project;
          let id: string;
          if (target) {
            id = target.id;
            next = {
              ...current,
              tracks: current.tracks.map(track => track.id !== target.id ? track : target.audioTrackId === null
                ? { ...target, audioTrackId, loopBars: recordingBars, loopBpm: recordingBpm, loopTimeSignature: recordingTimeSignature }
                : {
                  ...target,
                  loopBars: target.loopBars ?? recordingBars,
                  loopBpm: target.loopBpm ?? recordingBpm,
                  loopTimeSignature: target.loopTimeSignature ?? recordingTimeSignature,
                  overdubTrackIds: [...(target.overdubTrackIds ?? []), audioTrackId],
                }),
            };
          } else {
            const index = current.tracks.length + 1;
            id = `trk-${Date.now()}-${index}`;
            const loopTrack: ProjectTrack = {
              id,
              name: `Loop ${index}`,
              kind: "recording",
              machineId: "op1",
              steps: Array(16).fill(0),
              audioTrackId,
              loopBars: recordingBars,
              loopBpm: recordingBpm,
              loopTimeSignature: recordingTimeSignature,
              muted: false,
              volume: 82,
              soundState: defaultSoundState("op1"),
            };
            next = { ...current, tracks: [...current.tracks, loopTrack] };
          }
          skipDirtyRef.current = false;
          projectRef.current = next;
          dirtyRef.current = true;
          setProject(next);
          setSelectedTrackId(id);
          setRecordingLabel(target ? "Overdub added to loop." : "Loop added to arrangement.");
        } catch (error) {
          setRecordingLabel(error instanceof Error ? error.message : "The take could not be saved.");
        } finally {
          setIsUploadingTake(false);
        }
      };
      setIsRecording(true);
      const bpm = projectRef.current.bpm;
      const loopDurationMs = (60_000 / recordingBpm) * beatsPerBar(recordingTimeSignature) * recordingBars;
      const stepDurationMs = (60_000 / bpm) * beatsPerBar(projectRef.current.timeSignature) / 16;
      const stepsUntilBar = (16 - playStepRef.current) % 16;
      const context = audioContextRef.current;
      const untilNextStepMs = context
        ? Math.max(0, (nextStepTimeRef.current - context.currentTime) * 1000)
        : 0;
      const startDelayMs = playingRef.current
        ? untilNextStepMs + stepsUntilBar * stepDurationMs
        : 0;
      const beginCapture = () => {
        recordingStartTimerRef.current = null;
        try {
          recordingStartRef.current = Date.now();
          recorder.start();
          setRecordingLabel("Recording loop");
          recordingStopTimerRef.current = window.setTimeout(() => {
            if (recorder.state === "recording") recorder.stop();
          }, loopDurationMs);
        } catch (error) {
          stream.getTracks().forEach(track => track.stop());
          streamRef.current = null;
          recorderRef.current = null;
          setIsRecording(false);
          setRecordingLabel(error instanceof Error ? error.message : "Loop recording could not start.");
        }
      };
      if (startDelayMs > 0) {
        setRecordingLabel("Armed · next bar");
        recordingStartTimerRef.current = window.setTimeout(beginCapture, startDelayMs);
      } else {
        beginCapture();
      }
    } catch (error) {
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setIsRecording(false);
      setRecordingLabel(error instanceof Error ? error.message : "Microphone permission was not granted.");
    }
  };

  const stopRecording = () => {
    if (recordingStartTimerRef.current !== null && recorderRef.current?.state === "inactive") {
      window.clearTimeout(recordingStartTimerRef.current);
      recordingStartTimerRef.current = null;
      recorderRef.current = null;
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setIsRecording(false);
      setRecordingLabel("Loop cancelled");
      return;
    }
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const addTrack = (kind: "instrument" | "recording") => {
    if (project.tracks.length >= 8 || isRecording || isUploadingTake) return;
    const index = project.tracks.length + 1;
    const newTrack: ProjectTrack = {
      id: `trk-${Date.now()}-${index}`, name: kind === "recording" ? `Take ${index}` : `Track ${index}`, kind,
      machineId: "op1", steps: Array(16).fill(0), audioTrackId: null, muted: false, volume: 65,
      soundState: defaultSoundState("op1"),
    };
    updateProject(current => ({ ...current, tracks: [...current.tracks, newTrack] }));
    setSelectedTrackId(newTrack.id);
  };

  const stateLabel = saveState === "saved" ? "All changes saved" : saveState === "saving" ? "Saving…" :
    saveState === "loading" ? "Loading projects…" : saveState === "conflict" ? "Save conflict" :
    saveState === "error" ? "Save error" : saveState === "guest" ? "Guest · session only" : "Unsaved changes";

  return (
    <main className="salary-1999" data-testid="page-1999">
      <div className="n-shell">
        <header className="n-topline">
          <div className="n-brand" data-testid="text-1999-brand">1999</div>
        </header>

        <section className="n-toolbar" aria-label="Project controls" data-testid="section-project-controls">
           <input className="n-project-name" aria-label="Project name" maxLength={80} data-testid="input-project-name" value={project.name} onChange={event => updateProject(current => ({ ...current, name: event.target.value }))} />
          <button className="n-btn" type="button" onClick={startNewProject} data-testid="button-new-project"><Plus size={14} /> New</button>
          <button className="n-btn" type="button" onClick={() => void saveProject(projectRef.current)} disabled={saveState === "saving" || conflict || authLoading} data-testid="button-save-project"><Save size={13} /> {isAuthenticated ? "Save" : "Sign in to save"}</button>
          <button className="n-btn" type="button" onClick={exportProject} data-testid="button-export-project"><FileJson size={14} /> Project</button>
          <button className="n-btn" type="button" onClick={() => void exportWav()} disabled={wavBusy} data-testid="button-export-wav"><FileAudio size={14} /> {wavBusy ? "Rendering" : "WAV"}</button>
           <button className="n-btn" type="button" onClick={() => void saveWavToLibrary()} disabled={vaultMixBusy || authLoading} data-testid="button-save-mix-library"><Save size={13} /> {vaultMixBusy ? "Saving mix" : isAuthenticated ? "Music library" : "Sign in to save mix"}</button>
          <div className="n-save-state" data-state={saveState} title={updatedAt ? `Last saved ${new Date(updatedAt).toLocaleString()}` : undefined} role="status" aria-live="polite" data-testid="status-autosave">{stateLabel}</div>
        </section>

        {conflict && (
          <section className="n-conflict" role="alert" data-testid="status-conflict">
            <strong>This project changed in another session.</strong>
            <span>Your local version is still open and has not been overwritten. Export it now, or save it as a separate project to keep both versions.</span>
            <div className="n-conflict-actions">
              <button className="n-btn" type="button" onClick={exportProject} data-testid="button-recovery-export"><Download size={13} /> Export local JSON</button>
              <button className="n-btn n-btn-primary" type="button" onClick={() => { setConflict(false); activeRef.current = { id: null, updatedAt: null }; setActiveId(null); void saveProject(projectRef.current, true); }} data-testid="button-save-copy"><Save size={13} /> Save as new project</button>
            </div>
          </section>
        )}
        {loadError && !conflict && (
          <section className="n-error" role="alert" data-testid="status-error">
            <span>{loadError}</span>
            <button type="button" className="n-btn" onClick={() => { setLoadError(""); void refreshEntries().then(() => setSaveState("saved")).catch(error => { setLoadError(error instanceof Error ? error.message : "Retry failed."); setSaveState("error"); }); }} data-testid="button-retry"><RefreshCw size={13} /> Retry</button>
          </section>
        )}

        <div className="n-workspace">
          <section className="n-machine-stage n-panel" aria-label="Selected machine" data-testid="section-machine-stage">
            <div className="n-stage-head">
              <span className="n-eyebrow">MACHINE</span>
              {selectedTrack?.kind === "instrument" ? (
                <>
                  <label className="n-screen-reader" htmlFor="machine-select">Machine</label>
                  <select id="machine-select" className="n-machine-select" value={selectedTrack.machineId} onChange={event => {
                    const machineId = event.target.value as MachineId;
                    updateTrack(selectedTrack.id, track => ({
                      ...track,
                      machineId,
                      ...(usesSamplerPads(machineId) ? {
                        samplerPads: track.samplerPads ?? createEmptySamplerPads(),
                        padPatterns: track.padPatterns ?? Array.from({ length: 16 }, () => Array(16).fill(0)),
                      } : {}),
                    }));
                  }} data-testid="select-machine">
                    {machines.map(machine => <option key={machine.id} value={machine.id}>{machine.name}</option>)}
                  </select>
                </>
              ) : <span className="n-stage-mode">MIC LOOP</span>}
            </div>
            {selectedTrack?.kind === "recording" ? (
              <div className="n-loop-machine" data-testid="panel-audio-loop">
                <div className="n-loop-screen">
                  <span className="n-loop-code">LOOP / {String(project.tracks.indexOf(selectedTrack) + 1).padStart(2, "0")}</span>
                  <strong>{selectedTrack.name}</strong>
                  <span>{selectedTrack.audioTrackId === null ? "EMPTY" : `READY · ${recordingAudioTrackIds(selectedTrack).length} LAYER${recordingAudioTrackIds(selectedTrack).length === 1 ? "" : "S"}`}</span>
                </div>
              </div>
            ) : selectedTrack?.machineId === "fm1" || selectedTrack?.machineId === "smk37" ? (
              <Fm1EmulatorPanel
                initialMachine={selectedTrack.machineId}
                initialFirmwareId={project.emulatorState.firmwareIds[selectedTrack.machineId as EmulatorMachine] ?? ""}
                patchSaves={project.emulatorState.patchSaves}
                onSavePatchFile={uploadEmulatorPatch}
                onDownloadPatchFile={downloadEmulatorPatch}
                onFirmwareChange={(machineId, firmwareId) => updateProject(current => ({
                  ...current,
                  emulatorState: {
                    ...current.emulatorState,
                    firmwareIds: { ...current.emulatorState.firmwareIds, [machineId]: firmwareId },
                  },
                }))}
              />
            ) : selectedTrack?.machineId === "minimoog" ? (
              <MinimoogEmulatorPanel />
            ) : selectedTrack ? (
              <div className="n-native-machine" data-machine={selectedTrack.machineId} data-testid="panel-native-machine">
                <div className="n-native-screen">
                  <div className="n-native-screen-head">
                    <span>{machines.find(machine => machine.id === selectedTrack.machineId)?.name}</span>
                    <span>{selectedMachineSteps.filter(Boolean).length} / 16</span>
                  </div>
                  <strong>{selectedTrack.name}</strong>
                  <div className="n-native-sequence" aria-label={`${selectedTrack.name} pattern`}>
                    {selectedMachineSteps.map((step, index) => <span key={index} className={`${step ? "is-on" : ""}${playhead === index && isPlaying ? " is-playhead" : ""}`} />)}
                  </div>
                  <span className="n-native-tempo">{project.bpm} BPM · {project.timeSignature} · {project.key}</span>
                </div>
                <div className="n-native-controls">
                  <div className="n-knob-row"><label htmlFor="track-tone">TONE</label><span className="n-knob-val">{selectedTrack.soundState.tone}</span><input id="track-tone" type="range" min="0" max="100" value={selectedTrack.soundState.tone} onChange={event => updateTrack(selectedTrack.id, track => ({ ...track, soundState: { ...track.soundState, tone: Number(event.target.value) } }))} data-testid="input-track-tone" /></div>
                  <div className="n-knob-row"><label htmlFor="track-decay">DECAY</label><span className="n-knob-val">{selectedTrack.soundState.decayMs} ms</span><input id="track-decay" type="range" min="80" max="800" step="10" value={selectedTrack.soundState.decayMs} onChange={event => updateTrack(selectedTrack.id, track => ({ ...track, soundState: { ...track.soundState, decayMs: Number(event.target.value) } }))} data-testid="input-track-decay" /></div>
                </div>
                {usesSamplerPads(selectedTrack.machineId) && (
                  <div
                    className="n-mpc-sampler"
                    data-testid={selectedTrack.machineId === "mpc_sample" ? "panel-mpc-sampler" : "panel-sp404-sampler"}
                    aria-label={`${selectedTrack.machineId === "mpc_sample" ? "MPC Sample" : "SP-404MKII"} sampler`}
                  >
                    <div
                      className="n-mpc-pad-grid"
                      role="group"
                      aria-label={`${selectedTrack.machineId === "mpc_sample" ? "MPC Sample" : "SP-404MKII"} sample pads`}
                    >
                      {(selectedTrack.samplerPads ?? createEmptySamplerPads()).map((pad, padIndex) => {
                        const sampleTitle = availableSamplerSamples.find(sample => sample.id === pad.audioTrackId)?.title
                          ?? (pad.audioTrackId === null ? "EMPTY" : `SAMPLE ${pad.audioTrackId}`);
                        return <button
                          key={padIndex}
                          type="button"
                          className={`n-mpc-pad${selectedPadIndex === padIndex ? " is-selected" : ""}${samplerPreviewPadIndex === padIndex ? " is-playing" : ""}`}
                          aria-label={`Pad ${padIndex + 1}: ${sampleTitle}`}
                          aria-pressed={selectedPadIndex === padIndex}
                          onClick={() => { void previewSamplerPad(padIndex); }}
                          disabled={isPlaying || isRecording || isUploadingTake || isChoppingSample || isDetectingRootNote}
                          data-testid={`button-mpc-pad-${padIndex + 1}`}
                        >
                          <strong>{String(padIndex + 1).padStart(2, "0")}</strong>
                          <span>{sampleTitle.slice(0, 12)}</span>
                        </button>;
                      })}
                    </div>
                    <div className="n-mpc-pad-edit">
                      <div className="n-mpc-pad-edit-head">
                        <strong>PAD {String(selectedPadIndex + 1).padStart(2, "0")}</strong>
                        <span>{selectedSamplerPad?.audioTrackId ? "SAMPLE LOADED" : "EMPTY PAD"}</span>
                      </div>
                      <label className="n-mpc-field">
                        <span>SAMPLE</span>
                        <select
                          value={selectedSamplerPad?.audioTrackId ?? ""}
                          disabled={isPlaying || isRecording || isUploadingTake || isChoppingSample}
                          onChange={event => updateSamplerPad(selectedTrack.id, selectedPadIndex, pad => ({
                            ...pad,
                            audioTrackId: event.target.value ? Number(event.target.value) : null,
                            startSec: 0,
                            endSec: 0,
                            rootKey: null,
                          }))}
                          data-testid="select-mpc-sample"
                        >
                          <option value="">Choose audio from library</option>
                          {availableSamplerSamples.map(sample => <option key={sample.id} value={sample.id}>{sample.title}</option>)}
                        </select>
                      </label>
                      <input
                        ref={samplerFileInputRef}
                        className="n-screen-reader"
                        type="file"
                        accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.opus,.webm,.flac"
                        disabled={isUploadingTake || isChoppingSample || isDetectingRootNote}
                        onChange={event => {
                          const file = event.currentTarget.files?.[0];
                          if (file) void uploadSamplerSample(file);
                        }}
                        data-testid="input-mpc-upload"
                      />
                      <button className="n-btn n-mpc-upload" type="button" onClick={() => {
                        if (isAuthenticated) samplerFileInputRef.current?.click();
                        else requestSignInToSave();
                      }} disabled={isPlaying || isRecording || isUploadingTake || isChoppingSample || isDetectingRootNote || authLoading} data-testid="button-mpc-upload">
                        <Plus size={12} /> {isUploadingTake ? "Importing" : isAuthenticated ? "Upload sample" : "Sign in to upload"}
                      </button>
                      {selectedSamplerPad?.audioTrackId && (
                        <>
                          <div className="n-mpc-chop" data-testid="section-mpc-slicing">
                            <div className="n-mpc-trim">
                              <label className="n-mpc-field"><span>CHOP MODE</span><select value={samplerSliceMode} disabled={isPlaying || isRecording || isChoppingSample} onChange={event => setSamplerSliceMode(event.target.value as "regions" | "transient")} data-testid="select-mpc-slice-mode">
                                <option value="regions">Regions</option>
                                <option value="transient">Transient</option>
                              </select></label>
                              <label className="n-mpc-field"><span>{samplerSliceMode === "regions" ? "SLICES" : "MAX SLICES"}</span><select value={samplerSliceCount} disabled={isPlaying || isRecording || isChoppingSample} onChange={event => setSamplerSliceCount(Number(event.target.value) as 4 | 8 | 16)} data-testid="select-mpc-slice-count">
                                {[4, 8, 16].map(count => <option key={count} value={count} disabled={emptySamplerPadIndices.length < count - 1}>{count}</option>)}
                              </select></label>
                            </div>
                            {samplerSliceMode === "transient" && <label className="n-mpc-field"><span>SENSITIVITY · {samplerSliceSensitivity}</span><input type="range" min="0" max="100" value={samplerSliceSensitivity} disabled={isPlaying || isRecording || isChoppingSample} onChange={event => setSamplerSliceSensitivity(Number(event.target.value))} data-testid="input-mpc-slice-sensitivity" /></label>}
                            <button className="n-btn n-mpc-chop-button" type="button" onClick={() => void chopSamplerSample()} disabled={isPlaying || isRecording || isUploadingTake || isChoppingSample || emptySamplerPadIndices.length < samplerSliceCount - 1} data-testid="button-mpc-chop">
                              {isChoppingSample ? "Analyzing" : `Chop · ${samplerSliceCount}`}
                            </button>
                            <span className="n-mpc-chop-status">{emptySamplerPadIndices.length} EMPTY PADS</span>
                            <a className="n-mpc-chop-credit" href="https://github.com/snarebes/SampQOL-OS/releases" target="_blank" rel="noreferrer">SampQOL reference</a>
                          </div>
                          <div className="n-mpc-trim">
                            <label className="n-mpc-field"><span>START SEC</span><input type="number" min="0" max={selectedSamplerSample?.durationSec || undefined} step="0.01" value={selectedSamplerPad.startSec} disabled={isPlaying || isRecording} onChange={event => updateSamplerPad(selectedTrack.id, selectedPadIndex, pad => {
                              const maxStart = Math.max(0, (selectedSamplerSample?.durationSec || Number.MAX_SAFE_INTEGER) - 0.01);
                              const requested = Math.max(0, Number(event.target.value) || 0);
                              return { ...pad, startSec: Math.min(maxStart, pad.endSec > 0 ? Math.min(pad.endSec - 0.01, requested) : requested) };
                            })} data-testid="input-mpc-trim-start" /></label>
                            <label className="n-mpc-field"><span>END SEC</span><input type="number" min="0" max={selectedSamplerSample?.durationSec || undefined} step="0.01" placeholder="Full sample" value={selectedSamplerPad.endSec || ""} disabled={isPlaying || isRecording} onChange={event => updateSamplerPad(selectedTrack.id, selectedPadIndex, pad => {
                              if (!event.target.value) return { ...pad, endSec: 0 };
                              const maxEnd = selectedSamplerSample?.durationSec || Number.MAX_SAFE_INTEGER;
                              return { ...pad, endSec: Math.max(pad.startSec + 0.01, Math.min(maxEnd, Number(event.target.value) || 0)) };
                            })} data-testid="input-mpc-trim-end" /></label>
                          </div>
                          <label className="n-mpc-field"><span>TUNE · {selectedSamplerPad.tune} ST</span><input type="range" min="-24" max="24" value={selectedSamplerPad.tune} disabled={isPlaying || isRecording} onChange={event => updateSamplerPad(selectedTrack.id, selectedPadIndex, pad => ({ ...pad, tune: Number(event.target.value) }))} data-testid="input-mpc-tune" /></label>
                          <label className="n-mpc-field"><span>SPEED · {selectedSamplerPad.speed.toFixed(2)}×</span><input type="range" min="0.5" max="2" step="0.01" value={selectedSamplerPad.speed} disabled={isPlaying || isRecording} onChange={event => updateSamplerPad(selectedTrack.id, selectedPadIndex, pad => ({ ...pad, speed: Number(event.target.value) }))} data-testid="input-mpc-speed" /></label>
                          <label className="n-mpc-field"><span>ROOT KEY</span><select value={selectedSamplerPad.rootKey ?? ""} disabled={isPlaying || isRecording || isDetectingRootNote} onChange={event => updateSamplerPad(selectedTrack.id, selectedPadIndex, pad => ({ ...pad, rootKey: event.target.value === "" ? null : Number(event.target.value) }))} data-testid="select-mpc-root-key">
                            <option value="">Unknown</option>
                            {projectKeys.map((key, index) => <option key={key} value={index}>{key}</option>)}
                          </select></label>
                          <div className="n-mpc-root-detect">
                            <button className="n-btn n-mpc-detect-button" type="button" onClick={() => void detectSamplerRootNote()} disabled={isPlaying || isRecording || isDetectingRootNote || isChoppingSample} data-testid="button-mpc-detect-root">
                              <Radio size={12} /> {isDetectingRootNote ? "Analyzing" : "Detect root"}
                            </button>
                            {rootNoteStatus && <span className="n-mpc-detect-status" role="status" data-testid="text-mpc-root-status">{rootNoteStatus}</span>}
                          </div>
                          <div className="n-mpc-trim">
                            <label className="n-mpc-field"><span>LEVEL · {selectedSamplerPad.level}</span><input type="range" min="0" max="100" value={selectedSamplerPad.level} disabled={isPlaying || isRecording} onChange={event => updateSamplerPad(selectedTrack.id, selectedPadIndex, pad => ({ ...pad, level: Number(event.target.value) }))} data-testid="input-mpc-level" /></label>
                            <label className="n-mpc-field"><span>TONE · {selectedSamplerPad.tone}</span><input type="range" min="0" max="100" value={selectedSamplerPad.tone} disabled={isPlaying || isRecording} onChange={event => updateSamplerPad(selectedTrack.id, selectedPadIndex, pad => ({ ...pad, tone: Number(event.target.value) }))} data-testid="input-mpc-tone" /></label>
                          </div>
                          <label className="n-mpc-field"><span>ECHO · {selectedSamplerPad.echo}</span><input type="range" min="0" max="100" value={selectedSamplerPad.echo} disabled={isPlaying || isRecording} onChange={event => updateSamplerPad(selectedTrack.id, selectedPadIndex, pad => ({ ...pad, echo: Number(event.target.value) }))} data-testid="input-mpc-echo" /></label>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : <div className="n-empty">NO MACHINE SELECTED</div>}
          </section>

          <aside className="n-side" aria-label="Arrangement and mix">
            <section className="n-panel n-arrangement" aria-label="Sequencer arrangement" data-testid="section-arrangement">
              <div className="n-panel-head">
                <p className="n-eyebrow">ARRANGEMENT</p>
                <div className="n-transport">
                  <button className="n-btn n-play-btn" type="button" onClick={() => void togglePlayback()} data-testid="button-toggle-playback" aria-label={isPlaying ? "Stop loop playback" : "Play loop"}>
                    {isPlaying ? <Square size={12} /> : <Play size={12} />}{isPlaying ? "Stop" : "Play"}
                  </button>
                  <label className="n-bpm">BPM <input aria-label="Tempo in beats per minute" aria-description="Recorded loops follow session tempo; pitch shifts with speed." title="Recorded loops follow session tempo; pitch shifts with speed." data-testid="input-bpm" type="number" min="40" max="240" value={project.bpm} disabled={isRecording} onChange={event => updateProject(current => ({ ...current, bpm: Math.max(40, Math.min(240, Number(event.target.value) || 40)) }))} /></label>
                  <label className="n-bpm">KEY <select aria-label="Project key" value={project.key} onChange={event => updateProject(current => ({ ...current, key: event.target.value as ProjectKey }))} data-testid="select-project-key">
                    {projectKeys.map(key => <option key={key} value={key}>{key}</option>)}
                  </select></label>
                  <label className="n-bpm">METER <select aria-label="Time signature" value={project.timeSignature} disabled={isRecording} onChange={event => updateProject(current => ({ ...current, timeSignature: event.target.value as TimeSignature }))} data-testid="select-time-signature">
                    {timeSignatures.map(meter => <option key={meter} value={meter}>{meter}</option>)}
                  </select></label>
                </div>
              </div>
              <div className="n-grid-scroll">
                <div className="n-grid">
                  <div className="n-grid-ruler">
                    <span className="n-ruler-label">TRACK</span>
                    <div className="n-step-ruler">{Array.from({ length: 16 }, (_, index) => <span key={index}>{index % 4 === 0 ? index / 4 + 1 : "·"}</span>)}</div>
                    <span />
                  </div>
                  {project.tracks.map((track, index) => (
                    <div className={`n-track-row${selectedTrackId === track.id ? " is-selected" : ""}`} key={track.id} onClick={() => setSelectedTrackId(track.id)} data-testid={`row-track-${track.id}`}>
                      <div className="n-track-info">
                        <span className="n-track-num">{String(index + 1).padStart(2, "0")}</span>
                        <div>
                          <input className="n-track-name" aria-label={`Track ${index + 1} name`} data-testid={`input-track-name-${track.id}`} value={track.name} onChange={event => updateTrack(track.id, current => ({ ...current, name: event.target.value }))} />
                          <span className="n-kind">{track.kind === "recording" ? "MIC LOOP" : machines.find(machine => machine.id === track.machineId)?.name}</span>
                        </div>
                      </div>
                      {track.kind === "recording" ? (
                        <div className={`n-audio-clip${track.audioTrackId === null ? " is-empty" : ""}`} data-testid={`clip-loop-${track.id}`}>
                          {track.audioTrackId === null ? <span className="n-tape-empty">EMPTY TAPE</span> : (
                            <>
                              <span className="n-screen-reader">AUDIO LOOP</span>
                              <div className="n-tape-layers" aria-label={`${recordingAudioTrackIds(track).length} tape layers`}>
                                {recordingAudioTrackIds(track).map((audioTrackId, layerIndex) => (
                                  <div className={`n-tape-layer n-tape-color-${layerIndex % 4}`} key={audioTrackId} data-testid={`tape-layer-${track.id}-${audioTrackId}`}>
                                    <span className="n-tape-reel" aria-hidden="true" />
                                    <span className="n-tape-label">{libraryTracks.find(item => item.id === audioTrackId)?.title ?? `TAKE ${layerIndex + 1}`}</span>
                                    <span className="n-tape-splice" aria-hidden="true" />
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="n-steps" role="group" aria-label={`${track.name} steps`}>
                  {(usesSamplerPads(track.machineId) ? track.padPatterns?.[selectedPadIndex] ?? track.steps : track.steps).map((step, stepIndex) => <button
                            type="button" key={stepIndex} className={`n-step${step ? " is-on" : ""}${playhead === stepIndex && isPlaying ? " is-playhead" : ""}`}
                            aria-label={`${track.name}, step ${stepIndex + 1}, ${step ? "on" : "off"}`}
                            aria-pressed={!!step} data-testid={`button-step-${track.id}-${stepIndex + 1}`}
                            onClick={event => {
                              event.stopPropagation();
                              setSelectedTrackId(track.id);
                              updateTrack(track.id, current => {
                                const togglePattern = (pattern: number[]) => pattern.map((value, i) => i === stepIndex ? value ? 0 : 100 : value);
                                if (usesSamplerPads(current.machineId)) {
                                  const patterns = current.padPatterns ?? Array.from({ length: 16 }, () => Array(16).fill(0));
                                  return { ...current, padPatterns: patterns.map((pattern, index) => index === selectedPadIndex ? togglePattern(pattern) : pattern) };
                                }
                                return { ...current, steps: togglePattern(current.steps) };
                              });
                            }}
                          />)}
                        </div>
                      )}
                      <div className="n-track-actions">
                        {track.audioTrackId !== null && <button
                          className={`n-icon-btn${previewLoadingTrackId === track.id || previewingTrackId === track.id ? " is-active" : ""}`}
                          type="button"
                          title={previewLoadingTrackId === track.id ? "Cancel loop preview" : previewingTrackId === track.id ? "Stop loop preview" : "Preview all loop layers"}
                          aria-label={previewLoadingTrackId === track.id || previewingTrackId === track.id ? "Stop loop preview" : "Preview all loop layers"}
                          disabled={isPlaying || isRecording || isUploadingTake}
                          onClick={event => { event.stopPropagation(); void toggleLoopPreview(track); }}
                          data-testid={`button-play-loop-${track.id}`}
                        >
                          {previewLoadingTrackId === track.id ? <RefreshCw size={13} /> : previewingTrackId === track.id ? <Square size={12} /> : <Volume2 size={14} />}
                        </button>}
                        <button className={`n-icon-btn${track.muted ? " is-active" : ""}`} type="button" aria-label={track.muted ? "Unmute track" : "Mute track"} aria-pressed={track.muted} onClick={event => { event.stopPropagation(); updateTrack(track.id, current => ({ ...current, muted: !current.muted })); }} data-testid={`button-mute-${track.id}`}>M</button>
                      </div>
                    </div>
                  ))}
                  {project.tracks.length === 0 && <div className="n-empty" data-testid="empty-tracks">NO LANES</div>}
                </div>
              </div>
              <div className="n-track-add">
                  <button className="n-btn" type="button" onClick={() => addTrack("instrument")} disabled={project.tracks.length >= 8 || isLoopPreviewActive || isRecording || isUploadingTake} data-testid="button-add-track"><Plus size={13} /> Add lane</button>
                <span className="n-subtle">{project.tracks.length} / 8</span>
              </div>
              <div className={`n-recording${isRecording ? " is-live" : ""}`} data-testid="status-recording" role="status" aria-live="polite">
                <span className="n-pulse" />{recordingLabel}
              </div>
            </section>

            <section className="n-panel" aria-label="Mixer" data-testid="section-mixer">
              <div className="n-panel-head"><p className="n-eyebrow">MIXER</p><span className="n-subtle">{selectedTrack?.name}</span></div>
              {selectedTrack ? (
                <div className="n-machine-body">
                  <div className="n-knob-row"><label htmlFor="track-volume">OUTPUT LEVEL</label><span className="n-knob-val">{selectedTrack.volume}%</span><input id="track-volume" type="range" min="0" max="100" value={selectedTrack.volume} onChange={event => updateTrack(selectedTrack.id, track => ({ ...track, volume: Number(event.target.value) }))} data-testid="input-track-volume" /></div>
                </div>
              ) : <div className="n-empty">NO TRACK SELECTED</div>}
            </section>

            <section className="n-panel" aria-label="MIDI output" data-testid="section-midi-output">
              <div className="n-panel-head"><p className="n-eyebrow">MIDI OUT</p><span className="n-subtle">VST3</span></div>
              <div className="n-machine-body n-midi-controls">
                <button className="n-btn" type="button" onClick={() => void connectMidi()} data-testid="button-connect-midi">{midiConnected ? "Refresh MIDI" : "Connect MIDI"}</button>
                <label className="n-screen-reader" htmlFor="midi-output-select">MIDI output</label>
                <select id="midi-output-select" className="n-machine-select" value={selectedMidiOutputId} onChange={event => chooseMidiOutput(event.target.value)} disabled={!midiConnected || midiOutputs.length === 0 || isPlaying} data-testid="select-midi-output">
                  <option value="">{midiOutputs.length ? "Choose an output" : "No output selected"}</option>
                  {midiOutputs.map(output => <option key={output.id} value={output.id}>{output.name || output.id}</option>)}
                </select>
                <p className="n-midi-status" role="status" aria-live="polite" data-testid="status-midi-output">{midiStatus}</p>
              </div>
            </section>

            <section className="n-panel" aria-label="MIDI sampler input" data-testid="section-midi-input">
                <div className="n-panel-head"><p className="n-eyebrow">MIDI IN</p><span className="n-subtle">MPC / SP-404 PADS</span></div>
              <div className="n-machine-body n-midi-controls">
                <label className="n-screen-reader" htmlFor="midi-input-select">MIDI input device</label>
                <select id="midi-input-select" className="n-machine-select" value={selectedMidiInputId} onChange={event => chooseMidiInput(event.target.value)} disabled={!midiConnected || midiInputs.length === 0} data-testid="select-midi-input">
                  <option value="">{midiInputs.length ? "Choose an input" : "No input selected"}</option>
                  {midiInputs.map(input => <option key={input.id} value={input.id}>{input.name || input.id}</option>)}
                </select>
                <div className="n-midi-map-row">
                  <span>PAD {String(selectedPadIndex + 1).padStart(2, "0")} · NOTE {midiPadNotes[selectedPadIndex] < 0 ? "—" : midiPadNotes[selectedPadIndex]}</span>
                  <button
                    className={`n-btn${learningMidiPadIndex === selectedPadIndex ? " is-learning" : ""}`}
                    type="button"
                    onClick={() => {
                      if (learningMidiPadIndex === selectedPadIndex) {
                        setLearningMidiPadIndex(null);
                        setMidiInputStatus("Pad mapping cancelled.");
                      } else {
                        setLearningMidiPadIndex(selectedPadIndex);
                        setMidiInputStatus(`Press a pad to map PAD ${String(selectedPadIndex + 1).padStart(2, "0")}.`);
                      }
                    }}
                    disabled={!midiConnected || !selectedMidiInputId || !usesSamplerPads(selectedTrack?.machineId)}
                    data-testid="button-learn-midi-pad"
                  >
                    {learningMidiPadIndex === selectedPadIndex ? "Listening…" : `Learn pad ${String(selectedPadIndex + 1).padStart(2, "0")}`}
                  </button>
                </div>
                <button className="n-btn" type="button" onClick={resetMidiPadNotes} data-testid="button-reset-midi-map">Reset notes 36–51</button>
                <p className="n-midi-status" role="status" aria-live="polite" data-testid="status-midi-input">{midiInputStatus}</p>
                <p className="n-midi-map-hint">Notes 36–51 map to pads 01–16 by default. Mapping stays in this browser.</p>
              </div>
            </section>

            <section className="n-panel" aria-label="Saved sessions" data-testid="section-project-library">
              <div className="n-panel-head"><p className="n-eyebrow">SESSIONS</p><button className="n-icon-btn" type="button" aria-label="Refresh project list" onClick={() => void refreshEntries().catch(error => setLoadError(error instanceof Error ? error.message : "Could not refresh projects."))} data-testid="button-refresh-projects"><RefreshCw size={13} /></button></div>
              <div className="n-library">
                {!isAuthenticated && !authLoading
                  ? <div className="n-empty" data-testid="empty-projects">SIGN IN TO OPEN SAVED SESSIONS</div>
                  : saveState === "loading" && entries.length === 0
                  ? <div className="n-empty" role="status" data-testid="status-library-loading">Loading…</div>
                  : entries.length === 0
                    ? <div className="n-empty" data-testid="empty-projects">NO SAVED SESSIONS</div>
                    : <div className="n-library-list">{entries.map(entry => {
                      const parsed = parseProject(entry.content)!;
                      return <button type="button" className={`n-entry${activeId === entry.id ? " is-current" : ""}`} key={entry.id} onClick={() => openEntry(entry)} data-testid={`button-open-project-${entry.id}`}>
                        <span><span className="n-entry-name">{entry.title}</span><span className="n-entry-date">{new Date(entry.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></span>
                        <span className="n-entry-count">{parsed.tracks.length} lanes</span>
                      </button>;
                    })}</div>}
              </div>
            </section>

            <section className="n-panel" aria-label="Microphone looper" data-testid="section-recorder">
              <div className="n-panel-head"><p className="n-eyebrow">LIVE LOOP</p><Radio size={14} /></div>
              <div className="n-machine-body n-loop-controls">
                <label className="n-loop-length" htmlFor="loop-length">
                  <span>LOOP BARS</span>
                  <select id="loop-length" value={captureBarsForSelection} disabled={isRecording || isUploadingTake || selectedLoopBars !== undefined} onChange={event => setLoopBars(Number(event.target.value) as 1 | 2 | 4)} data-testid="select-loop-bars">
                    {[1, 2, 4].map(bars => <option key={bars} value={bars}>{bars}</option>)}
                  </select>
                </label>
                <button type="button" className={`n-btn n-btn-record${isRecording ? " is-recording" : ""}`} disabled={isUploadingTake || (!isRecording && isLoopPreviewActive) || (!isRecording && project.tracks.length >= 8 && selectedTrack?.kind !== "recording")} onClick={() => {
                  if (isRecording) stopRecording();
                  else void startRecording();
                }} data-testid="button-record">
                  {isRecording ? <><Square size={12} /> Stop loop</> : <><Mic size={13} /> {isUploadingTake ? "Saving loop" : `${selectedTrack?.kind === "recording" && selectedTrack.audioTrackId !== null ? "Overdub" : "Record"} ${captureBarsForSelection} bar${captureBarsForSelection === 1 ? "" : "s"}`}</>}
                </button>
              </div>
              {selectedTrack?.kind === "recording" && selectedTrack.audioTrackId !== null && (
                <div className="n-loop-takes" role="group" aria-label={`${selectedTrack.name} recorded takes`} data-testid={`list-loop-takes-${selectedTrack.id}`}>
                  <span className="n-loop-takes-heading">LOOP TAKES</span>
                  <div className="n-loop-take-row n-loop-take-base" data-testid={`row-loop-take-base-${selectedTrack.id}`}>
                    <span>BASE TAKE</span>
                    <span>ORIGINAL</span>
                  </div>
                  {(selectedTrack.overdubTrackIds ?? []).map((audioTrackId, index) => (
                    <div className="n-loop-take-row" key={audioTrackId} data-testid={`row-loop-overdub-${selectedTrack.id}-${audioTrackId}`}>
                      <span className="n-loop-take-label">
                        OVERDUB {index + 1} · {libraryTracks.find(track => track.id === audioTrackId)?.title ?? `TAKE ${audioTrackId}`}
                      </span>
                      <button
                        type="button"
                        className="n-loop-take-remove"
                        aria-label={`Remove overdub ${index + 1}`}
                        title="Remove from loop; keep take in library"
                        disabled={isPlaying || isLoopPreviewActive || isRecording || isUploadingTake}
                        onClick={event => {
                          event.stopPropagation();
                          removeOverdubLayer(selectedTrack.id, audioTrackId);
                        }}
                        data-testid={`button-remove-overdub-${selectedTrack.id}-${audioTrackId}`}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  <div className="n-loop-library-add">
                    <label className="n-loop-library-picker" htmlFor="library-loop-take">
                      <span>FROM MUSIC LIBRARY</span>
                      <select
                        id="library-loop-take"
                        value={selectedLibraryTakeId}
                        disabled={isPlaying || isLoopPreviewActive || isRecording || isUploadingTake || availableLibraryTakes.length === 0}
                        onChange={event => setSelectedLibraryTakeId(event.target.value)}
                        data-testid="select-library-overdub"
                      >
                        <option value="">{availableLibraryTakes.length ? "Choose matching audio" : "No matching takes"}</option>
                        {availableLibraryTakes.map(track => (
                          <option key={track.id} value={track.id} data-testid={`option-library-take-${track.id}`}>
                            {track.title} — {track.artist} ({track.durationSec}s)
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="n-btn n-loop-library-add-button"
                      disabled={isPlaying || isLoopPreviewActive || isRecording || isUploadingTake || !availableLibraryTakes.some(track => track.id === Number(selectedLibraryTakeId))}
                      onClick={addLibraryTakeToLoop}
                      data-testid="button-add-library-overdub"
                    >
                      <Plus size={11} /> Add take
                    </button>
                  </div>
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
