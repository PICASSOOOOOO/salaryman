// @vitest-environment jsdom
//
// Sibling-in-spirit of pages/Game/Settings.sound.test.tsx. That suite covers the
// GAME tab's numeric volume sliders + the Mute-all toggle. It does NOT touch the
// two boolean GATES the audio store also owns:
//   • musicEnabled    — Shadow Radio. Default OFF until explicitly enabled.
//   • ambianceEnabled — the low ambient bed. Default ON.
// These gates decide whether whole CATEGORIES of audio play at all
// (channelGain()/applyToEngine() branch on them), yet no test exercises the UI
// that flips them. If a toggle stops persisting into the shared
// `sm_game_settings_v1` blob, music/ambiance silently never play (or always
// play) with nothing to catch it.
//
// The global AudioControl (bottom-right speaker → popup) is the always-available
// surface that exposes both gates with explicit data-testids, writing through
// the same central audio store as the settings page. These tests drive that real
// UI and assert:
//   - defaults round-trip: musicEnabled false, ambianceEnabled true,
//   - clicking each toggle flips ONLY its own flag in the blob,
//   - the flip does NOT clobber the volume keys or the unrelated game keys that
//     share the one localStorage blob.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// The audio store pushes levels into the sound engine, which reaches for a real
// AudioContext (absent in jsdom). Stub the functions applyToEngine() calls so
// these tests can focus on the persistence contract for the two gates.
vi.mock("../soundEngine", () => ({
  setSfxVolume: vi.fn(),
  setMusicVolume: vi.fn(),
  setMuted: vi.fn(),
}));

import { AudioControl } from "./AudioControl";
import { setAudioSettings, AUDIO_DEFAULTS } from "../lib/audio-settings";

const STORE_KEY = "sm_game_settings_v1";

let root: Root;
let container: HTMLDivElement;

async function mount() {
  await act(async () => {
    root.render(<AudioControl />);
  });
}

function blob(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(STORE_KEY)!);
}

function byTestId<T extends Element>(id: string): T {
  const el = container.querySelector(`[data-testid="${id}"]`);
  if (!el) throw new Error(`testid not found: ${id}`);
  return el as T;
}

function click(el: Element) {
  act(() => { (el as HTMLElement).click(); });
}

// The popup (and its toggles) only renders once the speaker button is opened.
function openPanel() {
  click(byTestId("audio-control-toggle"));
}

beforeEach(() => {
  // useIsMobile reaches for matchMedia, which jsdom doesn't implement.
  if (!window.matchMedia) {
    (window as any).matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    });
  }
  localStorage.clear();
  // Seed GAME keys into the shared blob. These are owned by the page's own
  // settings store, NOT the audio store — they must survive every save the gate
  // toggles make (the merge-on-save contract on the one localStorage key).
  localStorage.setItem(
    STORE_KEY,
    JSON.stringify({ controlScheme: "arrows", invertY: true, resolution: "720p" }),
  );
  // The audio store keeps module-level state that survives between tests; reset
  // it to defaults so the verbose audio keys are written into the blob (keeping
  // the seeded game keys) and every test starts from a clean baseline.
  setAudioSettings(AUDIO_DEFAULTS);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

describe("AudioControl gate defaults round-trip", () => {
  it("persists musicEnabled=false and ambianceEnabled=true at defaults", async () => {
    await mount();
    const b = blob();
    expect(b.musicEnabled).toBe(false);
    expect(b.ambianceEnabled).toBe(true);
    // The defaults must match the store's declared defaults.
    expect(b.musicEnabled).toBe(AUDIO_DEFAULTS.musicEnabled);
    expect(b.ambianceEnabled).toBe(AUDIO_DEFAULTS.ambianceEnabled);

    // The toggle buttons reflect the same state in their label.
    openPanel();
    expect(byTestId("audio-control-music-toggle").textContent).toContain("OFF");
    expect(byTestId("audio-control-ambiance-toggle").textContent).toContain("ON");
  });
});

describe("AudioControl MUSIC gate toggle", () => {
  it("flips musicEnabled on/off without clobbering volumes or game keys", async () => {
    await mount();
    openPanel();
    expect(blob().musicEnabled).toBe(false);

    // Turn MUSIC on.
    click(byTestId("audio-control-music-toggle"));
    let b = blob();
    expect(b.musicEnabled).toBe(true);
    // ambiance gate untouched.
    expect(b.ambianceEnabled).toBe(true);
    // Volume keys preserved (the shared blob's audio half).
    expect(b.masterVolume).toBe(AUDIO_DEFAULTS.master);
    expect(b.musicVolume).toBe(AUDIO_DEFAULTS.music);
    expect(b.soundtrackVolume).toBe(AUDIO_DEFAULTS.soundtrack);
    // Game keys preserved (the shared blob's non-audio half).
    expect(b.controlScheme).toBe("arrows");
    expect(b.invertY).toBe(true);
    expect(b.resolution).toBe("720p");
    expect(byTestId("audio-control-music-toggle").textContent).toContain("ON");

    // Turn MUSIC back off — round-trips cleanly.
    click(byTestId("audio-control-music-toggle"));
    b = blob();
    expect(b.musicEnabled).toBe(false);
    expect(b.ambianceEnabled).toBe(true);
    expect(b.controlScheme).toBe("arrows");
    expect(byTestId("audio-control-music-toggle").textContent).toContain("OFF");
  });
});

describe("AudioControl AMBIANCE gate toggle", () => {
  it("flips ambianceEnabled on/off without clobbering volumes or game keys", async () => {
    await mount();
    openPanel();
    expect(blob().ambianceEnabled).toBe(true);

    // Turn AMBIANCE off.
    click(byTestId("audio-control-ambiance-toggle"));
    let b = blob();
    expect(b.ambianceEnabled).toBe(false);
    // music gate untouched.
    expect(b.musicEnabled).toBe(false);
    // Volume keys preserved.
    expect(b.masterVolume).toBe(AUDIO_DEFAULTS.master);
    expect(b.musicVolume).toBe(AUDIO_DEFAULTS.music);
    // Game keys preserved.
    expect(b.controlScheme).toBe("arrows");
    expect(b.resolution).toBe("720p");
    expect(byTestId("audio-control-ambiance-toggle").textContent).toContain("OFF");

    // Turn AMBIANCE back on — round-trips cleanly.
    click(byTestId("audio-control-ambiance-toggle"));
    b = blob();
    expect(b.ambianceEnabled).toBe(true);
    expect(b.musicEnabled).toBe(false);
    expect(b.invertY).toBe(true);
    expect(byTestId("audio-control-ambiance-toggle").textContent).toContain("ON");
  });
});

describe("AudioControl gates are independent", () => {
  it("toggling one gate never disturbs the other", async () => {
    await mount();
    openPanel();

    // Flip MUSIC off, leave AMBIANCE alone.
    click(byTestId("audio-control-music-toggle"));
    expect(blob().musicEnabled).toBe(true);
    expect(blob().ambianceEnabled).toBe(true);

    // Now flip AMBIANCE off — MUSIC must stay off.
    click(byTestId("audio-control-ambiance-toggle"));
    const b = blob();
    expect(b.musicEnabled).toBe(true);
    expect(b.ambianceEnabled).toBe(false);
  });
});
