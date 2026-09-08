// @vitest-environment jsdom
//
// Sibling of AudioControl.gates.test.tsx. That suite drives the global
// AudioControl popup's two boolean GATES:
//   • musicEnabled    — Shadow Radio. Default OFF until enabled.
//   • ambianceEnabled — the low ambient bed. Default OFF until enabled.
// The SAME two gates are also exposed on a SECOND surface — the Hummingbird
// "Audio Hub" panel (AudioSettingsPanel), the canonical full mixer. Those
// gate buttons are not driven by any test, so a regression there (e.g. wiring
// the AMBIANCE button to musicEnabled, or playClick swallowing the toggle)
// would go uncaught even though the AudioControl test still passes.
//
// These tests drive the real Audio Hub panel and assert:
//   - clicking "SHADOW RADIO · ON/OFF" flips ONLY musicEnabled,
//   - clicking "AMBIANCE · ON/OFF" flips ONLY ambianceEnabled,
//   - neither flip clobbers the volume keys or the unrelated game keys that
//     share the one `sm_game_settings_v1` localStorage blob.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// The panel calls playClick() on every toggle; stub it so the test focuses on
// the persistence contract (mirrors the other audio suites).
vi.mock("@/lib/ui-sound", () => ({ playClick: vi.fn() }));

// The audio store pushes levels into the sound engine, which reaches for a real
// AudioContext (absent in jsdom). Stub the functions applyToEngine() calls.
vi.mock("../soundEngine", () => ({
  setSfxVolume: vi.fn(),
  setMusicVolume: vi.fn(),
  setMuted: vi.fn(),
}));

import { AudioSettingsPanel } from "./AudioSettingsPanel";
import { setAudioSettings, AUDIO_DEFAULTS } from "../lib/audio-settings";

const STORE_KEY = "sm_game_settings_v1";

let root: Root;
let container: HTMLDivElement;

async function mount() {
  await act(async () => {
    root.render(<AudioSettingsPanel />);
  });
}

function blob(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(STORE_KEY)!);
}

// The panel has no data-testids, so gate buttons are selected by their label
// text ("SHADOW RADIO · ON/OFF" / "AMBIANCE · ON/OFF").
function buttonByText(prefix: string): HTMLButtonElement {
  const btns = Array.from(container.querySelectorAll("button"));
  const el = btns.find((b) => (b.textContent ?? "").includes(prefix));
  if (!el) throw new Error(`button not found: ${prefix}`);
  return el as HTMLButtonElement;
}

function click(el: Element) {
  act(() => { (el as HTMLElement).click(); });
}

beforeEach(() => {
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

describe("AudioSettingsPanel gate defaults", () => {
  it("renders SHADOW RADIO OFF and AMBIANCE ON at defaults", async () => {
    await mount();
    expect(blob().musicEnabled).toBe(false);
    expect(blob().ambianceEnabled).toBe(true);
    expect(buttonByText("SHADOW RADIO ·").textContent).toContain("OFF");
    expect(buttonByText("AMBIANCE ·").textContent).toContain("ON");
  });
});

describe("AudioSettingsPanel Shadow Radio gate toggle", () => {
  it("flips musicEnabled on/off without clobbering volumes or game keys", async () => {
    await mount();
    expect(blob().musicEnabled).toBe(false);

    // Turn Shadow Radio on.
    click(buttonByText("SHADOW RADIO ·"));
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
    expect(buttonByText("SHADOW RADIO ·").textContent).toContain("ON");

    // Turn Shadow Radio back off — round-trips cleanly.
    click(buttonByText("SHADOW RADIO ·"));
    b = blob();
    expect(b.musicEnabled).toBe(false);
    expect(b.ambianceEnabled).toBe(true);
    expect(b.controlScheme).toBe("arrows");
    expect(buttonByText("SHADOW RADIO ·").textContent).toContain("OFF");
  });
});

describe("AudioSettingsPanel AMBIANCE gate toggle", () => {
  it("flips ambianceEnabled on/off without clobbering volumes or game keys", async () => {
    await mount();
    expect(blob().ambianceEnabled).toBe(true);

    // Turn AMBIANCE off.
    click(buttonByText("AMBIANCE ·"));
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
    expect(buttonByText("AMBIANCE ·").textContent).toContain("OFF");

    // Turn AMBIANCE back on — round-trips cleanly.
    click(buttonByText("AMBIANCE ·"));
    b = blob();
    expect(b.ambianceEnabled).toBe(true);
    expect(b.musicEnabled).toBe(false);
    expect(b.invertY).toBe(true);
    expect(buttonByText("AMBIANCE ·").textContent).toContain("ON");
  });
});

describe("AudioSettingsPanel gates are independent", () => {
  it("toggling one gate never disturbs the other", async () => {
    await mount();

    // Flip Shadow Radio on, leave AMBIANCE alone.
    click(buttonByText("SHADOW RADIO ·"));
    expect(blob().musicEnabled).toBe(true);
    expect(blob().ambianceEnabled).toBe(true);

    // Now flip AMBIANCE off — Shadow Radio must stay off.
    click(buttonByText("AMBIANCE ·"));
    const b = blob();
    expect(b.musicEnabled).toBe(true);
    expect(b.ambianceEnabled).toBe(false);
  });
});
