import { useSyncExternalStore } from "react";
import {
  getAudioSettings,
  setAudioSettings,
  subscribeAudioSettings,
  toggleAudioMuted,
  type AudioSettings,
} from "../lib/audio-settings";

// React binding for the central audio settings store. Any component can read the
// live settings and update them; every consumer (game, terminal, Hummingbird)
// stays in sync because they all go through the same store.
export function useAudioSettings(): {
  settings: AudioSettings;
  set: (patch: Partial<AudioSettings>) => void;
  toggleMuted: () => void;
} {
  const settings = useSyncExternalStore(
    subscribeAudioSettings,
    getAudioSettings,
    getAudioSettings,
  );
  return { settings, set: setAudioSettings, toggleMuted: toggleAudioMuted };
}
