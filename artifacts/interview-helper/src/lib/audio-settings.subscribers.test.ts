// @vitest-environment jsdom
//
// The engine tests (audio-settings.engine.test.ts) prove applyToEngine() pushes
// the right gains into the PROCEDURAL sound engine. But the office radio
// (OfficeRadio.tsx) and the Hummingbird user-music stream (MusicPlayerContext)
// are NOT the engine — they are external subscribers that register via
// subscribeAudioSettings() and, on every notification, re-read
// channelGain("soundtrack") to scale their own <audio> element.
//
// So two things have to hold for those streams to actually follow the sliders:
//   1. the store must NOTIFY subscribers whenever the audible result changes —
//      on setAudioSettings(), on a mute toggle, and on voice-priority changes
//      (a voice ducking/un-ducking the music); and
//   2. when a subscriber re-reads channelGain("soundtrack") inside that
//      notification it must get the CORRECT number: 0 when muted, 0 when MUSIC
//      is disabled, 0 while a voice is ducking, and master*soundtrack otherwise.
//
// This test stands in for the real subscribers with a tiny recorder so we verify
// the notify-then-re-read contract end to end. The sound engine is stubbed so
// importing the store doesn't need a real AudioContext; modules are reset so the
// store's state + the voice bus start clean for every test.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../soundEngine", () => ({
  setSfxVolume: vi.fn(),
  setMusicVolume: vi.fn(),
  setMuted: vi.fn(),
}));

type Settings = typeof import("./audio-settings");
type Bus = typeof import("./audio-bus");

async function load(): Promise<{ settings: Settings; bus: Bus }> {
  await import("../soundEngine");
  const settings = await import("./audio-settings");
  const bus = await import("./audio-bus");
  return { settings, bus };
}

beforeEach(() => {
  vi.resetModules();
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// A stand-in for the office radio / Hummingbird stream: it subscribes and, on
// every notification, re-reads its own effective gain — exactly what the real
// consumers do to set audio.volume.
function attachRadio(settings: Settings) {
  let notifications = 0;
  let gain = settings.channelGain("soundtrack");
  const unsub = settings.subscribeAudioSettings(() => {
    notifications += 1;
    gain = settings.channelGain("soundtrack");
  });
  return {
    get notifications() { return notifications; },
    get gain() { return gain; },
    unsub,
  };
}

describe("external soundtrack subscribers are notified and re-read the right gain", () => {
  it("is notified on setAudioSettings() and reads master*soundtrack when enabled", async () => {
    const { settings } = await load();
    // MUSIC must be opted in for the office radio to be audible at all.
    settings.setAudioSettings({ muted: false, master: 1, soundtrack: 0.4, musicEnabled: true });

    const radio = attachRadio(settings);
    expect(radio.notifications).toBe(0); // subscribing alone doesn't fire

    settings.setAudioSettings({ master: 0.5 });
    expect(radio.notifications).toBe(1);
    expect(radio.gain).toBeCloseTo(0.4 * 0.5);

    settings.setAudioSettings({ soundtrack: 0.8 });
    expect(radio.notifications).toBe(2);
    expect(radio.gain).toBeCloseTo(0.8 * 0.5);
  });

  it("notifies and drops the soundtrack to zero when muted, restores on unmute", async () => {
    const { settings } = await load();
    settings.setAudioSettings({ muted: false, master: 1, soundtrack: 0.4, musicEnabled: true });

    const radio = attachRadio(settings);

    expect(settings.toggleAudioMuted()).toBe(true);
    expect(radio.notifications).toBe(1);
    expect(radio.gain).toBe(0);

    expect(settings.toggleAudioMuted()).toBe(false);
    expect(radio.notifications).toBe(2);
    expect(radio.gain).toBeCloseTo(0.4 * 1);
  });

  it("notifies and silences the soundtrack when MUSIC is disabled", async () => {
    const { settings } = await load();
    settings.setAudioSettings({ muted: false, master: 1, soundtrack: 0.4, musicEnabled: true });

    const radio = attachRadio(settings);
    expect(radio.gain).toBeCloseTo(0.4 * 1);

    settings.setAudioSettings({ musicEnabled: false });
    expect(radio.notifications).toBe(1);
    expect(radio.gain).toBe(0);

    settings.setAudioSettings({ musicEnabled: true });
    expect(radio.notifications).toBe(2);
    expect(radio.gain).toBeCloseTo(0.4 * 1);
  });

  it("notifies on voice-priority changes and ducks the soundtrack to zero while a voice speaks", async () => {
    const { settings, bus } = await load();
    settings.setAudioSettings({ muted: false, master: 1, soundtrack: 0.4, musicEnabled: true });

    const radio = attachRadio(settings);
    expect(radio.gain).toBeCloseTo(0.4 * 1);

    const release = bus.acquireVoicePriority();
    // A voice started — the store must notify and the re-read gain must be 0.
    expect(radio.notifications).toBe(1);
    expect(radio.gain).toBe(0);

    release();
    // Voice ended — notified again and restored to the user's level.
    expect(radio.notifications).toBe(2);
    expect(radio.gain).toBeCloseTo(0.4 * 1);
  });

  it("holds the duck across overlapping voices, restoring only at the last release", async () => {
    const { settings, bus } = await load();
    settings.setAudioSettings({ muted: false, master: 1, soundtrack: 0.4, musicEnabled: true });

    const radio = attachRadio(settings);

    const releaseA = bus.acquireVoicePriority();
    const releaseB = bus.acquireVoicePriority();
    // Only the FIRST acquire flips priority on, so only one notification fires.
    expect(radio.notifications).toBe(1);
    expect(radio.gain).toBe(0);

    releaseA();
    // A second voice is still speaking — no edge, still silent.
    expect(radio.notifications).toBe(1);
    expect(radio.gain).toBe(0);

    releaseB();
    expect(radio.notifications).toBe(2);
    expect(radio.gain).toBeCloseTo(0.4 * 1);
  });

  it("stops notifying after the subscriber unsubscribes", async () => {
    const { settings } = await load();
    settings.setAudioSettings({ muted: false, master: 1, soundtrack: 0.4, musicEnabled: true });

    const radio = attachRadio(settings);
    settings.setAudioSettings({ soundtrack: 0.6 });
    expect(radio.notifications).toBe(1);

    radio.unsub();
    settings.setAudioSettings({ soundtrack: 0.2 });
    expect(radio.notifications).toBe(1); // no further notifications
  });
});
