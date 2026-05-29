// ── Central audio settings — single source of truth ──────────────────────────
// The app historically split audio across three systems with no shared volume:
//   1. soundEngine.ts        — procedural SFX + ambient score (_sfxVol/_musicVol)
//   2. MusicPlayerContext    — Hummingbird user-music stream (own vol slider)
//   3. RadioPlayer/callhome  — the uploaded soundtrack (distant office radio)
// Game/Settings.tsx persisted volumes to localStorage but never applied them to
// the engine, so the sliders did nothing live and the terminal had no controls.
//
// This module is a tiny framework-agnostic pub/sub store that is THE place audio
// settings live. It persists to the same `sm_game_settings_v1` key the game
// settings page already uses (extended with `soundtrackVolume` + `muted`), applies
// changes to soundEngine immediately, and notifies subscribers (Hummingbird, the
// office radio) so they can scale their own streams. Use it from anywhere — the
// game settings page, the terminal, and the Hummingbird hub all read/write here.

import { setSfxVolume, setMusicVolume, setMuted as setEngineMuted } from "../soundEngine";

const STORE_KEY = "sm_game_settings_v1";

export interface AudioSettings {
  master: number;     // 0–1 master multiplier
  music: number;      // 0–1 procedural ambient score
  sfx: number;        // 0–1 sound effects
  voice: number;      // 0–1 TTS / advisor voices
  soundtrack: number; // 0–1 distant office radio (callhome tracks)
  muted: boolean;     // master mute
}

export const AUDIO_DEFAULTS: AudioSettings = {
  master: 0.8,
  music: 0.6,
  sfx: 0.9,
  voice: 1.0,
  soundtrack: 0.18, // intentionally low — "distant radio in the office"
  muted: false,
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
    };
    window.localStorage.setItem(STORE_KEY, JSON.stringify(merged));
  } catch {
    /* storage may be unavailable; settings just won't persist */
  }
}

let state: AudioSettings = readPersisted();
const listeners = new Set<(s: AudioSettings) => void>();

// Push the current state into soundEngine. Hummingbird + office radio subscribe
// separately and scale their own streams by `master` (and their own channel).
function applyToEngine() {
  const m = state.muted ? 0 : 1;
  setSfxVolume(state.sfx * state.master * m);
  setMusicVolume(state.music * state.master * m);
  setEngineMuted(state.muted);
}

export function getAudioSettings(): AudioSettings {
  return state;
}

// Effective per-channel gain a consumer should apply to its own stream.
export function channelGain(channel: keyof Omit<AudioSettings, "muted">): number {
  if (state.muted) return 0;
  return Math.max(0, Math.min(1, state[channel] * state.master));
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
}
if (typeof window !== "undefined") initAudioSettings();
