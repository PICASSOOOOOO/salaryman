import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, FileAudio, FileJson, Mic, Play, Plus, Radio, RefreshCw, Save, Square, Volume2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useMusicPlayer } from "@/contexts/MusicPlayerContext";
import Fm1EmulatorPanel, { type EmulatorPatchSave } from "@/components/Fm1EmulatorPanel";
import MinimoogEmulatorPanel from "@/components/MinimoogEmulatorPanel";
import "./1999.css";

type MachineId = "op1" | "sp404mkii" | "mpc_sample" | "korg_ms2000r" | "korg_m1" | "boss_ce2" | "fm1" | "smk37" | "minimoog";
type EmulatorMachine = "fm1" | "smk37";
type SoundEngineState = { tone: number; decayMs: number };
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
  muted: boolean;
  volume: number;
  soundState: SoundEngineState;
};
type Project = { schemaVersion: 1; name: string; bpm: number; tracks: ProjectTrack[]; emulatorState: EmulatorState };
type VaultEntry = { id: number; title: string; content: string; entryType: string; tags: string[]; folder: string; updatedAt: string };
type SaveState = "loading" | "saved" | "saving" | "unsaved" | "error" | "conflict";
type MidiOutputPort = {
  id: string;
  name?: string;
  state?: string;
  send: (data: number[], timestamp?: number) => void;
};
type MidiAccessPort = {
  outputs: Map<string, MidiOutputPort>;
  onstatechange: (() => void) | null;
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

const freshProject = (): Project => ({
  schemaVersion: 1,
  name: "Untitled session",
  bpm: 92,
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
        && typeof item.muted === "boolean"
        && Number.isFinite(item.volume) && item.volume >= 0 && item.volume <= 100
        && (item.soundState === undefined || isSoundEngineState(item.soundState));
    });
    if (!validTracks) return null;
    if (candidate.emulatorState !== undefined && !isEmulatorState(candidate.emulatorState)) return null;
    const tracks = candidate.tracks.map((track) => {
      const item = track as ProjectTrack & { soundState?: SoundEngineState };
      return { ...item, soundState: item.soundState ?? defaultSoundState(item.machineId) };
    });
    return {
      ...(candidate as Project),
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

function safeFilename(value: string) {
  return value.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "1999-project";
}

function baseFrequencyForMachine(machineId: MachineId) {
  return machineId === "mpc_sample" ? 82
    : machineId === "fm1" ? 110
      : machineId === "minimoog" ? 130.81
      : machineId === "korg_m1" ? 261.63
        : machineId === "korg_ms2000r" ? 146.83
          : machineId === "smk37" ? 196 : 164.81;
}

function scheduleSynthVoice(context: BaseAudioContext, track: ProjectTrack, stepIndex: number, atTime: number) {
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
  oscillator.frequency.setValueAtTime(baseFrequencyForMachine(track.machineId) * Math.pow(2, (stepIndex % 7) / 12), atTime);
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

function scheduleMidiNote(
  output: MidiOutputPort,
  track: ProjectTrack,
  trackIndex: number,
  stepIndex: number,
  context: AudioContext,
  atTime: number,
) {
  const channel = trackIndex % 16;
  const note = Math.max(0, Math.min(127, Math.round(69 + 12 * Math.log2(baseFrequencyForMachine(track.machineId) / 440) + (stepIndex % 7))));
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
  const loopSeconds = (60 / project.bpm) * 16;
  const clipBuffers = new Map<number, AudioBuffer>();
  const decoder = new AudioContextClass();
  try {
    for (const track of project.tracks) {
      if (track.muted || track.kind !== "recording" || track.audioTrackId === null || clipBuffers.has(track.audioTrackId)) continue;
      const response = await apiFetch(`/api/music/stream/${track.audioTrackId}`);
      if (!response.ok) throw new Error(`Saved take could not be loaded (${response.status}).`);
      clipBuffers.set(track.audioTrackId, await decoder.decodeAudioData(await response.arrayBuffer()));
    }
  } finally {
    await decoder.close().catch(() => undefined);
  }
  const seconds = Math.min(90, Math.max(loopSeconds, ...Array.from(clipBuffers.values(), audio => audio.duration)));
  const context = new OfflineAudioContext(1, Math.ceil(seconds * sampleRate), sampleRate);
  project.tracks.forEach(track => {
    if (track.muted) return;
    if (track.kind === "recording" && track.audioTrackId !== null) {
      const audio = clipBuffers.get(track.audioTrackId);
      if (!audio) return;
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = audio;
      gain.gain.value = track.volume / 100;
      source.connect(gain);
      gain.connect(context.destination);
      source.start(0);
      return;
    }
    for (let bar = 0; bar < 4; bar += 1) {
      track.steps.forEach((active, stepIndex) => {
        if (active) scheduleSynthVoice(context, track, stepIndex, (60 / project.bpm) * (bar * 4 + stepIndex / 4));
      });
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
  const { tracks: libraryTracks, refresh, previewTrack } = useMusicPlayer();
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(-1);
  const [recordingLabel, setRecordingLabel] = useState("Microphone ready");
  const [wavBusy, setWavBusy] = useState(false);
  const [vaultMixBusy, setVaultMixBusy] = useState(false);
  const [midiOutputs, setMidiOutputs] = useState<MidiOutputPort[]>([]);
  const [selectedMidiOutputId, setSelectedMidiOutputId] = useState("");
  const [midiConnected, setMidiConnected] = useState(false);
  const [midiStatus, setMidiStatus] = useState("MIDI output is not connected.");
  const dirtyRef = useRef(false);
  const skipDirtyRef = useRef(true);
  const projectRef = useRef(project);
  const activeRef = useRef<{ id: number | null; updatedAt: string | null }>({ id: null, updatedAt: null });
  const savingRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recordingStartRef = useRef(0);
  const recordingTargetRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const schedulerRef = useRef<number | null>(null);
  const playingRef = useRef(false);
  const nextStepTimeRef = useRef(0);
  const playStepRef = useRef(0);
  const midiAccessRef = useRef<MidiAccessPort | null>(null);
  const selectedMidiOutputRef = useRef("");
  const midiErrorRef = useRef(false);

  const refreshEntries = useCallback(async () => {
    const response = await apiFetch("/api/vault/entries?folder=%2F1999");
    const data = await response.json().catch(() => ({})) as { entries?: VaultEntry[]; error?: string };
    if (!response.ok) throw new Error(data.error || `Project list unavailable (${response.status})`);
    setEntries(Array.isArray(data.entries) ? data.entries.filter(entry => entry.entryType === "1999_project" && !!parseProject(entry.content)) : []);
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setSaveState("loading");
      try {
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
  }, []);

  useEffect(() => {
    projectRef.current = project;
    if (skipDirtyRef.current) {
      skipDirtyRef.current = false;
      return;
    }
    dirtyRef.current = true;
    if (!conflict && saveState !== "loading") setSaveState("unsaved");
  }, [project]);

  const saveProject = useCallback(async (snapshot: Project, createAsNew = false): Promise<boolean> => {
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
  }, [conflict, refreshEntries]);

  useEffect(() => {
    if (!dirtyRef.current || conflict || saveState !== "unsaved") return;
    const timer = window.setTimeout(() => { void saveProject(projectRef.current); }, 850);
    return () => window.clearTimeout(timer);
  }, [project, conflict, saveState, saveProject]);

  useEffect(() => () => {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(track => track.stop());
    if (schedulerRef.current !== null) window.clearInterval(schedulerRef.current);
    playingRef.current = false;
    if (midiAccessRef.current) midiAccessRef.current.onstatechange = null;
    const midiOutput = midiAccessRef.current?.outputs.get(selectedMidiOutputRef.current);
    if (midiOutput) {
      try { sendMidiAllNotesOff(midiOutput); } catch { /* The device may already be disconnected. */ }
    }
    void audioContextRef.current?.close().catch(() => undefined);
  }, []);

  const selectedTrack = useMemo(() => project.tracks.find(track => track.id === selectedTrackId) ?? project.tracks[0], [project.tracks, selectedTrackId]);
  const updateProject = (updater: (current: Project) => Project) => setProject(current => updater(current));
  const updateTrack = (id: string, updater: (track: ProjectTrack) => ProjectTrack) => updateProject(current => ({
    ...current, tracks: current.tracks.map(track => track.id === id ? updater(track) : track),
  }));
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
  const connectMidi = async () => {
    const requestMIDIAccess = (navigator as MidiNavigator).requestMIDIAccess;
    if (!requestMIDIAccess) {
      setMidiStatus("Web MIDI is unavailable here. Use a current Chrome or Edge browser over HTTPS.");
      return;
    }
    try {
      const access = await requestMIDIAccess.call(navigator, { sysex: false });
      midiAccessRef.current = access;
      access.onstatechange = () => refreshMidiOutputs(access);
      setMidiConnected(true);
      midiErrorRef.current = false;
      refreshMidiOutputs(access);
    } catch (error) {
      setMidiConnected(false);
      setMidiStatus(error instanceof Error
        ? `MIDI permission or device access failed: ${error.message}`
        : "MIDI permission or device access failed.");
    }
  };
  const chooseMidiOutput = (outputId: string) => {
    selectedMidiOutputRef.current = outputId;
    setSelectedMidiOutputId(outputId);
    midiErrorRef.current = false;
    const output = midiOutputs.find(candidate => candidate.id === outputId);
    setMidiStatus(output ? `Ready to send notes to ${output.name || "selected MIDI output"}.` : "Choose a MIDI output.");
  };
  const uploadAudioToLibrary = async (file: File, durationSec: number) => {
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

  const uploadEmulatorPatch = async (machine: EmulatorMachine, file: File) => {
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
      throw new Error("This file is not a supported FM-1/SMK-37 emulator save.");
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
      const midiOutput = midiAccessRef.current?.outputs.get(selectedMidiOutputRef.current);
      if (midiOutput) {
        try { sendMidiAllNotesOff(midiOutput); }
        catch { setMidiStatus("MIDI output disconnected before notes could be stopped."); }
      }
      return;
    }
    const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      setLoadError("Loop playback is not supported in this browser.");
      return;
    }
    try {
      const context = audioContextRef.current ?? new AudioContextClass();
      audioContextRef.current = context;
      await context.resume();
      playingRef.current = true;
      setIsPlaying(true);
      playStepRef.current = 0;
      nextStepTimeRef.current = context.currentTime + 0.04;
      schedulerRef.current = window.setInterval(() => {
        if (!playingRef.current) return;
        while (nextStepTimeRef.current < context.currentTime + 0.12) {
          const snapshot = projectRef.current;
          const stepIndex = playStepRef.current;
          const midiOutput = midiAccessRef.current?.outputs.get(selectedMidiOutputRef.current);
          snapshot.tracks.forEach((track, trackIndex) => {
            if (!track.muted && track.kind === "instrument" && track.steps[stepIndex]) {
              scheduleSynthVoice(context, track, stepIndex, nextStepTimeRef.current);
              if (midiOutput) {
                try {
                  scheduleMidiNote(midiOutput, track, trackIndex, stepIndex, context, nextStepTimeRef.current);
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
          nextStepTimeRef.current += (60 / snapshot.bpm) / 4;
        }
      }, 25);
    } catch (error) {
      playingRef.current = false;
      setIsPlaying(false);
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
    setVaultMixBusy(true);
    try {
      const blob = await renderWav(project);
      const filename = `${safeFilename(project.name)}.wav`;
      const file = new File([blob], filename, { type: "audio/wav", lastModified: Date.now() });
      const seconds = Math.ceil(Math.min(90, (60 / project.bpm) * 16));
      await uploadAudioToLibrary(file, seconds);
      setRecordingLabel("Mix saved to your SALARYMAN music library.");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "The mix could not be saved.");
    } finally {
      setVaultMixBusy(false);
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRecordingLabel("Microphone recording is not available in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      recordingTargetRef.current = selectedTrack?.id ?? null;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        const duration = Math.max(1, Math.round((Date.now() - recordingStartRef.current) / 1000));
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setIsRecording(false);
        const type = recorder.mimeType || "audio/webm";
        const take = new File(chunksRef.current, `1999-take-${Date.now()}.${type.includes("mp4") ? "m4a" : "webm"}`, { type, lastModified: Date.now() });
        setRecordingLabel(`Uploading take · ${duration}s`);
        setIsUploadingTake(true);
        try {
          const audioTrackId = await uploadAudioToLibrary(take, duration);
          const targetTrackId = recordingTargetRef.current;
          if (targetTrackId) {
            updateTrack(targetTrackId, track => ({ ...track, kind: "recording", audioTrackId }));
            setSelectedTrackId(targetTrackId);
            setRecordingLabel("Take saved and linked to this project.");
          } else {
            setRecordingLabel("Take saved to your SALARYMAN music library.");
          }
        } catch (error) {
          setRecordingLabel(error instanceof Error ? error.message : "The take could not be saved.");
        } finally {
          setIsUploadingTake(false);
          recordingTargetRef.current = null;
        }
      };
      recordingStartRef.current = Date.now();
      recorder.start();
      setIsRecording(true);
      setRecordingLabel("Recording microphone take");
    } catch (error) {
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setIsRecording(false);
      setRecordingLabel(error instanceof Error ? error.message : "Microphone permission was not granted.");
    }
  };

  const addTrack = (kind: "instrument" | "recording") => {
    if (project.tracks.length >= 8) return;
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
    saveState === "error" ? "Save error" : "Unsaved changes";

  return (
    <main className="salary-1999" data-testid="page-1999">
      <div className="n-shell">
        <header className="n-topline">
          <div className="n-brand" data-testid="text-1999-brand"><span className="n-mark">S</span><span>SALARYMAN</span><span>/</span><span>1999</span></div>
          <div className="n-top-meta"><span className="n-live" data-testid="status-workspace">WORKSPACE READY</span><span>STEREO / 01</span></div>
        </header>
        <section className="n-heading">
          <h1 className="n-title">1999<small>PRODUCTION WORKSPACE</small></h1>
          <p className="n-heading-note">A small room for rough ideas. Sketch a loop, capture a take, save it for later.</p>
        </section>

        <section className="n-toolbar" aria-label="Project controls" data-testid="section-project-controls">
           <input className="n-project-name" aria-label="Project name" maxLength={80} data-testid="input-project-name" value={project.name} onChange={event => updateProject(current => ({ ...current, name: event.target.value }))} />
          <button className="n-btn" type="button" onClick={startNewProject} data-testid="button-new-project"><Plus size={14} /> New</button>
          <button className="n-btn" type="button" onClick={() => void saveProject(projectRef.current)} disabled={saveState === "saving" || conflict} data-testid="button-save-project"><Save size={13} /> Save</button>
          <button className="n-btn" type="button" onClick={exportProject} data-testid="button-export-project"><FileJson size={14} /> Project</button>
          <button className="n-btn" type="button" onClick={() => void exportWav()} disabled={wavBusy} data-testid="button-export-wav"><FileAudio size={14} /> {wavBusy ? "Rendering" : "WAV"}</button>
           <button className="n-btn" type="button" onClick={() => void saveWavToLibrary()} disabled={vaultMixBusy} data-testid="button-save-mix-library"><Save size={13} /> {vaultMixBusy ? "Saving mix" : "Music library"}</button>
          <div className="n-save-state" data-state={saveState} role="status" aria-live="polite" data-testid="status-autosave">{stateLabel}</div>
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
          <section className="n-main n-panel" aria-label="Step sequencer">
            <div className="n-panel-head">
              <p className="n-eyebrow">01 / Pattern</p>
              <div className="n-transport">
                <button className="n-btn n-play-btn" type="button" onClick={() => void togglePlayback()} data-testid="button-toggle-playback" aria-label={isPlaying ? "Stop loop playback" : "Play loop"}>
                  {isPlaying ? <Square size={12} /> : <Play size={12} />}{isPlaying ? "Stop" : "Play"}
                </button>
                <label className="n-bpm">BPM <input aria-label="Tempo in beats per minute" data-testid="input-bpm" type="number" min="40" max="240" value={project.bpm} onChange={event => updateProject(current => ({ ...current, bpm: Math.max(40, Math.min(240, Number(event.target.value) || 40)) }))} /></label>
                <span className="n-subtle">{project.tracks.length} / 8 LANES</span>
              </div>
            </div>
            <div className="n-grid-scroll">
              <div className="n-grid">
                <div className="n-grid-ruler">
                  <span className="n-ruler-label">TRACK / MACHINE</span>
                  <div className="n-step-ruler">{Array.from({ length: 16 }, (_, index) => <span key={index}>{index % 4 === 0 ? index / 4 + 1 : "·"}</span>)}</div>
                  <span />
                </div>
                {project.tracks.map((track, index) => (
                  <div className="n-track-row" key={track.id} onClick={() => setSelectedTrackId(track.id)} data-testid={`row-track-${track.id}`}>
                    <div className="n-track-info">
                      <span className="n-track-num">{String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <input className="n-track-name" aria-label={`Track ${index + 1} name`} data-testid={`input-track-name-${track.id}`} value={track.name} onChange={event => updateTrack(track.id, current => ({ ...current, name: event.target.value }))} />
                        <span className="n-kind">{track.kind === "recording" ? "MIC TAKE" : machines.find(machine => machine.id === track.machineId)?.name}</span>
                      </div>
                    </div>
                    <div className="n-steps" role="group" aria-label={`${track.name} steps`}>
                      {track.steps.map((step, stepIndex) => <button
                         type="button" key={stepIndex} className={`n-step${step ? " is-on" : ""}${playhead === stepIndex && isPlaying ? " is-playhead" : ""}`}
                        aria-label={`${track.name}, step ${stepIndex + 1}, ${step ? "on" : "off"}`}
                        aria-pressed={!!step} data-testid={`button-step-${track.id}-${stepIndex + 1}`}
                        onClick={event => { event.stopPropagation(); updateTrack(track.id, current => ({ ...current, steps: current.steps.map((value, i) => i === stepIndex ? value ? 0 : 1 : value) })); }}
                      />)}
                    </div>
                    <div className="n-track-actions">
                      {track.audioTrackId !== null && <button className="n-icon-btn" type="button" title="Play saved take" aria-label="Play saved take" onClick={event => { event.stopPropagation(); if (libraryTracks.some(item => item.id === track.audioTrackId)) previewTrack(track.audioTrackId!); }} data-testid={`button-play-take-${track.id}`}><Volume2 size={14} /></button>}
                      <button className={`n-icon-btn${track.muted ? " is-active" : ""}`} type="button" aria-label={track.muted ? "Unmute track" : "Mute track"} aria-pressed={track.muted} onClick={event => { event.stopPropagation(); updateTrack(track.id, current => ({ ...current, muted: !current.muted })); }} data-testid={`button-mute-${track.id}`}>M</button>
                    </div>
                  </div>
                ))}
                {project.tracks.length === 0 && <div className="n-empty" data-testid="empty-tracks">No lanes yet. Add an instrument or record a microphone take.</div>}
              </div>
            </div>
            <div className="n-track-add">
              <p className="n-note">Tap a square to place a hit. Four bars, sixteen steps.</p>
              <button className="n-btn" type="button" onClick={() => addTrack("instrument")} disabled={project.tracks.length >= 8} data-testid="button-add-track"><Plus size={13} /> Add lane</button>
            </div>
            <div className={`n-recording${isRecording ? " is-live" : ""}`} data-testid="status-recording" role="status" aria-live="polite">
              <span className="n-pulse" />{recordingLabel}
            </div>
          </section>

          <aside className="n-side">
            <section className="n-panel" aria-label="Selected lane controls" data-testid="section-machine-panel">
              <div className="n-panel-head"><p className="n-eyebrow">02 / Machine</p><span className="n-subtle">LANE SETUP</span></div>
              {selectedTrack ? (
                <div className="n-machine-body">
                  <div className="n-machine-plate"><span className="n-machine-index">99<br />/ {String(project.tracks.indexOf(selectedTrack) + 1).padStart(2, "0")}</span><span className="n-machine-chip">{selectedTrack.kind === "recording" ? "REC" : "SKETCH"}</span></div>
                  <p className="n-machine-copy">{machines.find(machine => machine.id === selectedTrack.machineId)?.descriptor ?? "Recorded microphone take"}.<br />Tone and decay are saved with this lane. FM-1/SMK-37 firmware selection also saves; the embedded emulator does not expose its internal patch session.</p>
                  <label className="n-screen-reader" htmlFor="machine-select">Machine</label>
                  <select id="machine-select" className="n-machine-select" value={selectedTrack.machineId} onChange={event => updateTrack(selectedTrack.id, track => ({ ...track, machineId: event.target.value as MachineId }))} data-testid="select-machine">
                    {machines.map(machine => <option key={machine.id} value={machine.id}>{machine.name}</option>)}
                  </select>
                  <div className="n-knob-row"><label htmlFor="track-volume">OUTPUT LEVEL</label><span className="n-knob-val">{selectedTrack.volume}%</span><input id="track-volume" type="range" min="0" max="100" value={selectedTrack.volume} onChange={event => updateTrack(selectedTrack.id, track => ({ ...track, volume: Number(event.target.value) }))} data-testid="input-track-volume" /></div>
                  {selectedTrack.kind === "instrument" && (
                    <>
                      <div className="n-knob-row"><label htmlFor="track-tone">TONE</label><span className="n-knob-val">{selectedTrack.soundState.tone}</span><input id="track-tone" type="range" min="0" max="100" value={selectedTrack.soundState.tone} onChange={event => updateTrack(selectedTrack.id, track => ({ ...track, soundState: { ...track.soundState, tone: Number(event.target.value) } }))} data-testid="input-track-tone" /></div>
                      <div className="n-knob-row"><label htmlFor="track-decay">DECAY</label><span className="n-knob-val">{selectedTrack.soundState.decayMs} ms</span><input id="track-decay" type="range" min="80" max="800" step="10" value={selectedTrack.soundState.decayMs} onChange={event => updateTrack(selectedTrack.id, track => ({ ...track, soundState: { ...track.soundState, decayMs: Number(event.target.value) } }))} data-testid="input-track-decay" /></div>
                    </>
                  )}
                </div>
              ) : <div className="n-empty">Select or add a lane to shape the sketch.</div>}
            </section>

            <section className="n-panel" aria-label="MIDI output for VST3 instruments" data-testid="section-midi-output">
              <div className="n-panel-head"><p className="n-eyebrow">03 / MIDI Out</p><span className="n-subtle">VST3 ROUTING</span></div>
              <div className="n-machine-body n-midi-controls">
                <p className="n-machine-copy">Send the 1999 pattern to a MIDI port feeding a VST3 instrument in your desktop DAW. This browser does not load VST3 plugins.</p>
                <button className="n-btn" type="button" onClick={() => void connectMidi()} data-testid="button-connect-midi">{midiConnected ? "Refresh MIDI" : "Connect MIDI"}</button>
                <label className="n-screen-reader" htmlFor="midi-output-select">MIDI output</label>
                <select id="midi-output-select" className="n-machine-select" value={selectedMidiOutputId} onChange={event => chooseMidiOutput(event.target.value)} disabled={!midiConnected || midiOutputs.length === 0 || isPlaying} data-testid="select-midi-output">
                  <option value="">{midiOutputs.length ? "Choose an output" : "No output selected"}</option>
                  {midiOutputs.map(output => <option key={output.id} value={output.id}>{output.name || output.id}</option>)}
                </select>
                <p className="n-midi-status" role="status" aria-live="polite" data-testid="status-midi-output">{midiStatus}</p>
              </div>
            </section>

            <section className="n-panel" aria-label="Saved projects" data-testid="section-project-library">
              <div className="n-panel-head"><p className="n-eyebrow">04 / Sessions</p><button className="n-icon-btn" type="button" aria-label="Refresh project list" onClick={() => void refreshEntries().catch(error => setLoadError(error instanceof Error ? error.message : "Could not refresh projects."))} data-testid="button-refresh-projects"><RefreshCw size={13} /></button></div>
              <div className="n-library">
                {saveState === "loading" && entries.length === 0
                  ? <div className="n-empty" role="status" data-testid="status-library-loading">Finding your sketches…</div>
                  : entries.length === 0
                    ? <div className="n-empty" data-testid="empty-projects">Your saved sessions will live here. Start shaping a loop and it will save automatically.</div>
                    : <div className="n-library-list">{entries.map(entry => {
                      const parsed = parseProject(entry.content)!;
                      return <button type="button" className={`n-entry${activeId === entry.id ? " is-current" : ""}`} key={entry.id} onClick={() => openEntry(entry)} data-testid={`button-open-project-${entry.id}`}>
                        <span><span className="n-entry-name">{entry.title}</span><span className="n-entry-date">{new Date(entry.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></span>
                        <span className="n-entry-count">{parsed.tracks.length} lanes</span>
                      </button>;
                    })}</div>}
              </div>
            </section>

            <section className="n-panel" aria-label="Microphone recorder" data-testid="section-recorder">
              <div className="n-panel-head"><p className="n-eyebrow">05 / Capture</p><Radio size={14} /></div>
              <div className="n-machine-body">
                <p className="n-machine-copy" style={{ marginTop: 0 }}>Record a voice or instrument take. Microphone permission is requested only when you start.</p>
                 <button type="button" className={`n-btn n-btn-record${isRecording ? " is-recording" : ""}`} disabled={isUploadingTake} onClick={() => {
                  if (isRecording) recorderRef.current?.stop();
                  else void startRecording();
                }} data-testid="button-record">
                   {isRecording ? <><Square size={12} /> Stop take</> : <><Mic size={13} /> {isUploadingTake ? "Saving take" : "Record take"}</>}
                </button>
                <button type="button" className="n-btn" style={{ marginLeft: 6 }} onClick={() => addTrack("recording")} disabled={project.tracks.length >= 8} data-testid="button-add-recording-lane"><Plus size={12} /> Take lane</button>
              </div>
            </section>
          </aside>
        </div>
        {selectedTrack && (selectedTrack.machineId === "fm1" || selectedTrack.machineId === "smk37") && (
          <section className="n-emulator-panel" aria-label="Selected machine emulator" data-testid="section-machine-emulator">
            <Fm1EmulatorPanel
              initialMachine={selectedTrack.machineId}
              initialFirmwareId={project.emulatorState.firmwareIds[selectedTrack.machineId as EmulatorMachine] ?? ""}
              patchSaves={project.emulatorState.patchSaves}
              onSavePatchFile={uploadEmulatorPatch}
              onDownloadPatchFile={downloadEmulatorPatch}
              onMachineChange={(machineId) => updateTrack(selectedTrack.id, track => ({ ...track, machineId }))}
              onFirmwareChange={(machineId, firmwareId) => updateProject(current => ({
                ...current,
                emulatorState: {
                  ...current.emulatorState,
                  firmwareIds: { ...current.emulatorState.firmwareIds, [machineId]: firmwareId },
                },
              }))}
            />
          </section>
        )}
        {selectedTrack?.machineId === "minimoog" && (
          <section className="n-emulator-panel" aria-label="Minimoog Model D emulator" data-testid="section-minimoog-emulator">
            <MinimoogEmulatorPanel />
          </section>
        )}
         <footer className="n-footer"><span><b>1999</b> / SKETCH · CAPTURE · KEEP</span><span>{updatedAt ? `LAST SAVE ${new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "LOCAL SESSION"}</span><span>PROJECTS: VAULT · AUDIO: MUSIC LIBRARY</span></footer>
      </div>
    </main>
  );
}
