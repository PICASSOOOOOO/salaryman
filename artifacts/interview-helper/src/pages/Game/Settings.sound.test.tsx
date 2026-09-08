// @vitest-environment jsdom
//
// Sibling of Settings.game-reset.test.tsx / Settings.display.test.tsx /
// Settings.screen-terminal.test.tsx. Those cover the GAME (controls + reset),
// DISPLAY and TERMINAL tabs. This one closes the last untested corner: the
// GAME tab.
//
// The GAME tab's audio controls (Master / Music / SFX / Voice / Shadow Radio volume) and the
// "Mute all" toggle do NOT flow through the page's own game-settings store.
// They go through the central audio store (`src/lib/audio-settings.ts`), which
// persists VERBOSE keys (masterVolume, musicVolume, sfxVolume, voiceVolume,
// soundtrackVolume, audioMuted, …) into the SAME `sm_game_settings_v1` blob the
// game keys live in, and pushes the levels into the sound engine. A regression
// there silently changes how loud the whole game is — for the game, the
// terminal and Hummingbird — with nothing to catch it.
//
// These tests drive the real GAME tab audio UI and assert:
//   - moving a slider merges the value into sm_game_settings_v1 under the
//     correct verbose key WITHOUT clobbering the game keys sharing that blob,
//   - the slider→key mapping is correct for every channel,
//   - the "Mute all" toggle flips `audioMuted`, and
//   - the sliders become disabled while muted.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../components/LanguageSelector", () => ({ LanguageSelector: () => null }));
vi.mock("../../components/CurrencySelector", () => ({ CurrencySelector: () => null }));
vi.mock("../../lib/settings-sync", () => ({ flushSettingsToServer: vi.fn() }));
// The audio store pushes levels into the sound engine, which reaches for a real
// AudioContext (absent in jsdom) the moment audio is muted. Stub the three
// functions it calls so these tests can focus on the persistence contract.
vi.mock("../../soundEngine", () => ({
  setSfxVolume: vi.fn(),
  setMusicVolume: vi.fn(),
  setMuted: vi.fn(),
}));

import GameSettings from "./Settings";
import { setAudioSettings, AUDIO_DEFAULTS } from "../../lib/audio-settings";

const STORE_KEY = "sm_game_settings_v1";

let root: Root;
let container: HTMLDivElement;

async function mount() {
  await act(async () => {
    root.render(<GameSettings />);
  });
}

function blob(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(STORE_KEY)!);
}

// Tabs are <button>s whose trimmed text is the tab label (icon + label).
function clickTab(name: string) {
  const btn = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === name,
  );
  if (!btn) throw new Error(`tab not found: ${name}`);
  act(() => { btn.click(); });
}

// Each control lives in a Row: a `.grid` with a label <div> and the control. We
// locate the row by its exact label text, then grab the requested control.
function rowControl<T extends Element>(label: string, selector: string): T {
  const labelDiv = Array.from(
    container.querySelectorAll("div.text-xs.font-mono"),
  ).find((d) => d.textContent === label);
  if (!labelDiv) throw new Error(`row not found: ${label}`);
  const row = labelDiv.closest("div.grid");
  if (!row) throw new Error(`grid row not found for: ${label}`);
  const el = row.querySelector(selector);
  if (!el) throw new Error(`control "${selector}" not found in row: ${label}`);
  return el as T;
}

// React tracks an input's value internally; to make a programmatic value change
// trigger onChange we have to go through the native value setter and then
// dispatch the "input" event React listens for on range inputs.
function setNativeValue(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(el, value);
}

function moveSlider(label: string, value: string) {
  const slider = rowControl<HTMLInputElement>(label, "input[type=range]");
  act(() => {
    setNativeValue(slider, value);
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  localStorage.clear();
  // Seed GAME keys into the shared blob. These are owned by the page's own
  // settings store, NOT the audio store — they must survive every save the
  // GAME tab makes (the merge-on-save contract on the one localStorage key).
  localStorage.setItem(
    STORE_KEY,
    JSON.stringify({ controlScheme: "arrows", invertY: true, resolution: "720p" }),
  );
  // The audio store keeps a module-level state that survives between tests, so
  // reset it to defaults each time. This merges the verbose audio keys into the
  // blob (keeping the seeded game keys) and gives every test a clean baseline.
  setAudioSettings(AUDIO_DEFAULTS);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

describe("GameSettings General audio volume persistence", () => {
  it("moves the Master slider, merges masterVolume, and keeps the game keys", async () => {
    await mount();
    clickTab("GAME");
    expect(blob().masterVolume).toBe(AUDIO_DEFAULTS.master);

    moveSlider("Master", "0.5");

    const b = blob();
    expect(b.masterVolume).toBe(0.5);
    // Game keys (owned by the page's own store) are untouched by the audio save.
    expect(b.controlScheme).toBe("arrows");
    expect(b.invertY).toBe(true);
    expect(b.resolution).toBe("720p");
  });

  it("maps every slider to its correct verbose key", async () => {
    await mount();
    clickTab("GAME");

    // [row label, verbose key persisted, value to set]
    const cases: Array<[string, string, string]> = [
      ["Master", "masterVolume", "0.35"],
      ["Music", "musicVolume", "0.6"],
      ["SFX", "sfxVolume", "0.45"],
      ["Voice", "voiceVolume", "0.25"],
      ["Shadow Radio volume", "soundtrackVolume", "0.7"],
    ];

    for (const [label, key, value] of cases) {
      moveSlider(label, value);
      expect(blob()[key]).toBe(Number(value));
    }

    // Each channel landed in its OWN key — no cross-talk between sliders.
    const b = blob();
    expect(b.masterVolume).toBe(0.35);
    expect(b.musicVolume).toBe(0.6);
    expect(b.sfxVolume).toBe(0.45);
    expect(b.voiceVolume).toBe(0.25);
    expect(b.soundtrackVolume).toBe(0.7);
  });
});

describe("GameSettings General audio mute toggle", () => {
  it("flips audioMuted and disables every slider while muted", async () => {
    await mount();
    clickTab("GAME");
    expect(blob().audioMuted).toBe(false);

    // Sliders are live before muting.
    expect(rowControl<HTMLInputElement>("Master", "input[type=range]").disabled).toBe(false);

    const muteBtn = rowControl<HTMLButtonElement>("Mute all", "button");
    act(() => { muteBtn.click(); });

    // The verbose mute flag is persisted, game keys still intact.
    const b = blob();
    expect(b.audioMuted).toBe(true);
    expect(b.controlScheme).toBe("arrows");

    // Every slider is now disabled.
    for (const label of ["Master", "Music", "SFX", "Voice", "Shadow Radio volume"]) {
      expect(rowControl<HTMLInputElement>(label, "input[type=range]").disabled).toBe(true);
    }

    // Un-muting clears the flag and re-enables the sliders.
    act(() => { rowControl<HTMLButtonElement>("Mute all", "button").click(); });
    expect(blob().audioMuted).toBe(false);
    expect(rowControl<HTMLInputElement>("Master", "input[type=range]").disabled).toBe(false);
  });
});
