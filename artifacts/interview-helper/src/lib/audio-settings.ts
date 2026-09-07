// ── Central audio settings — single source of truth ──────────────────────────
// The app historically split audio across three systems with no shared volume:
//   1. soundEngine.ts        — procedural SFX + ambient score (_sfxVol/_musicVol)
//   2. MusicPlayerContext    — Hummingbird user-music stream (own vol slider)
//   3. Shadow Radio/callhome — the global Call Home broadcast
// Game/Settings.tsx persisted volumes to localStorage but never applied them to
// the engine, so the sliders did nothing live and the terminal had no controls.
//
// This module is a tiny framework-agnostic pub/sub store that is THE place audio
// settings live. It persists to the same `sm_game_settings_v1` key the game
// settings page already uses (extended with `soundtrackVolume` + `muted`), applies
// changes to soundEngine immediately, and notifies subscribers (Hummingbird, the
// Shadow Radio) so they can scale their own streams. Use it from anywhere — the
// game settings page, the terminal, and the Hummingbird hub all read/write here.

import { setSfxVolume, setMusicVolume, setMuted as setEngineMuted } from "../soundEngine";
import { subscribeVoicePriority } from "./audio-bus";

const STORE_KEY = "sm_game_settings_v1";

export interface AudioSettings {
  master: number;     // 0–1 master multiplier
  music: number;      // 0–1 AMBIANCE — procedural ambient bed (in-game only)
  sfx: number;        // 0–1 sound effects
  voice: number;      // 0–1 TTS / advisor voices
  soundtrack: number; // 0–1 SHADOW RADIO — Call Home tracks
  muted: boolean;     // master mute
  musicEnabled: boolean;    // SHADOW RADIO — explicit opt-in
  ambianceEnabled: boolean; // AMBIANCE (low ambient bed) — explicit opt-in
}

// Numeric volume channels only (the booleans above are gates, not levels).
type VolumeChannel = "master" | "music" | "sfx" | "voice" | "soundtrack";

export const AUDIO_DEFAULTS: AudioSettings = {
  master: 0.8,
  music: 0.14,       // AMBIANCE is intentionally EXTREMELY LOW
  sfx: 0.9,
  voice: 1.0,
  soundtrack: 0.22,  // Shadow Radio stays silent until explicitly enabled
  muted: false,
  musicEnabled: false,
  ambianceEnabled: true,
};

// The settings page uses verbose key names; map between the two shapes so the
// two stay in lockstep on the one localStorage key.
function readPersisted(): AudioSettings {
  if (typeof window === "undefined") return { ...AUDIO_DEFAULTS };
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return { ...AUDIO_DEFAULTS };
    const p = JSON.parse(raw) as Record<string, unknown>;
    const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
    return {
      master: num(p.masterVolume, AUDIO_DEFAULTS.master),
      music: num(p.musicVolume, AUDIO_DEFAULTS.music),
      sfx: num(p.sfxVolume, AUDIO_DEFAULTS.sfx),
      voice: num(p.voiceVolume, AUDIO_DEFAULTS.voice),
      soundtrack: num(p.soundtrackVolume, AUDIO_DEFAULTS.soundtrack),
      muted: typeof p.audioMuted === "boolean" ? p.audioMuted : AUDIO_DEFAULTS.muted,
      musicEnabled: typeof p.musicEnabled === "boolean" ? p.musicEnabled : AUDIO_DEFAULTS.musicEnabled,
      ambianceEnabled: typeof p.ambianceEnabled === "boolean" ? p.ambianceEnabled : AUDIO_DEFAULTS.ambianceEnabled,
    };
  } catch {
    return { ...AUDIO_DEFAULTS };
  }
}

function persist(s: AudioSettings) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const existing = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    // Merge so we don't clobber non-audio game settings (resolution, fps, etc.).
    const merged = {
      ...existing,
      masterVolume: s.master,
      musicVolume: s.music,
      sfxVolume: s.sfx,
      voiceVolume: s.voice,
      soundtrackVolume: s.soundtrack,
      audioMuted: s.muted,
      musicEnabled: s.musicEnabled,
      ambianceEnabled: s.ambianceEnabled,
    };
    window.localStorage.setItem(STORE_KEY, JSON.stringify(merged));
  } catch {
    /* storage may be unavailable; settings just won't persist */
  }
}

let state: AudioSettings = readPersisted();
const listeners = new Set<(s: AudioSettings) => void>();

// Voice ducking: while Pablo / an NPC / the phone is speaking (voice priority
// from audio-bus), ALL background music must drop to silence — voice always
// wins, because TTS frequently fails silently when music plays over it. Only
// the music-ish channels duck; voice + sfx are untouched. This is applied here,
// centrally, so every music consumer (soundEngine ambient score AND Pablo
// Radio) ducks in lockstep without each having to wire the bus.
const DUCKED_CHANNELS = new Set<VolumeChannel>(["music", "soundtrack"]);
let voiceActive = false;

function duckFactor(channel: VolumeChannel): number {
  return voiceActive && DUCKED_CHANNELS.has(channel) ? 0 : 1;
}

// Push the current state into soundEngine. Hummingbird + Shadow Radio subscribe
// separately and scale their own streams by `master` (and their own channel).
function applyToEngine() {
  const m = state.muted ? 0 : 1;
  const ambiance = state.ambianceEnabled ? 1 : 0;
  setSfxVolume(state.sfx * state.master * m);
  setMusicVolume(state.music * state.master * m * ambiance * duckFactor("music"));
  setEngineMuted(state.muted);
}

export function getAudioSettings(): AudioSettings {
  return state;
}

// Shadow Radio is silent until the player explicitly enables it.
export function getMusicEnabled(): boolean {
  return state.musicEnabled;
}

// AMBIANCE (low ambient bed) is silent until the player explicitly enables it.
export function getAmbianceEnabled(): boolean {
  return state.ambianceEnabled;
}

// Effective per-channel gain a consumer should apply to its own stream.
export function channelGain(channel: VolumeChannel): number {
  if (state.muted) return 0;
  // The `music` channel is AMBIANCE; the `soundtrack` channel is opt-in Shadow Radio.
  if (channel === "music" && !state.ambianceEnabled) return 0;
  if (channel === "soundtrack" && !state.musicEnabled) return 0;
  return Math.max(0, Math.min(1, state[channel] * state.master * duckFactor(channel)));
}

export function setAudioSettings(patch: Partial<AudioSettings>) {
  state = { ...state, ...patch };
  persist(state);
  applyToEngine();
  for (const fn of listeners) fn(state);
}

export function toggleAudioMuted(): boolean {
  setAudioSettings({ muted: !state.muted });
  return state.muted;
}

export function subscribeAudioSettings(fn: (s: AudioSettings) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// Apply persisted settings to the engine as soon as this module loads so audio
// starts at the user's chosen levels (not the engine's raw defaults).
let _initialized = false;
export function initAudioSettings() {
  if (_initialized) return;
  _initialized = true;
  applyToEngine();
  // React to voice priority (Pablo/NPC TTS, phone): duck all music to silence
  // while a voice is speaking, restore the user's levels the instant it ends.
  subscribeVoicePriority((active) => {
    if (active === voiceActive) return;
    voiceActive = active;
    applyToEngine();                  // soundEngine ambient score
    for (const fn of listeners) fn(state); // office radio re-reads channelGain
  });
}
if (typeof window !== "undefined") initAudioSettings();
