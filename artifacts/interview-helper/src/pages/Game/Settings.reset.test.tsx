// @vitest-environment jsdom
//
// Guards the DATA tab's "RESET SETTINGS TO DEFAULTS" button — the single action
// that touches ALL THREE setting stores at once and then pushes the wipe to the
// signed-in player's account so no other device re-hydrates the stale values:
//
//   1. the game-settings blob   (sm_game_settings_v1, owned by this page)
//   2. the central audio store   (lib/audio-settings — AUDIO_DEFAULTS)
//   3. the low-graphics flag      (lib/lowGfx — salaryman_low_gfx)
//   …then bumps a nonce whose effect calls flushSettingsToServer() so the synced
//   server copy is overwritten with the defaults immediately (see the effect in
//   Settings.tsx). settings-sync.flush.test.ts covers flushSettingsToServer() in
//   isolation; here we prove the BUTTON wiring drives it.
//
// That cross-store coordination has no other coverage, so a regression could
// silently leave one store stale or skip the server flush. Two complementary
// suites exercise the same button from different angles:
//   • "...button" seeds the device with thoroughly non-default values directly
//     in localStorage, clicks reset, then reads the persisted blob back.
//   • "GameSettings RESET TO DEFAULTS" drives the REAL component AND the REAL
//     audio store the way a user would — flipping controls across tabs — then
//     asserts the live stores (getAudioSettings, isLowGfx) and the flush.
//
// Only the game-tab Language/Currency selectors (i18n + currency hooks) and the
// settings-sync network glue are stubbed — flushSettingsToServer is replaced
// with a spy so we can assert it ran without making a real request. The audio
// store is exercised for real, so a minimal Web Audio stub stands in for the
// browser API soundEngine reaches for.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../components/LanguageSelector", () => ({ LanguageSelector: () => null }));
vi.mock("../../components/CurrencySelector", () => ({ CurrencySelector: () => null }));
vi.mock("../../lib/settings-sync", () => ({ flushSettingsToServer: vi.fn() }));

import GameSettings from "./Settings";
import { flushSettingsToServer } from "../../lib/settings-sync";
import {
  AUDIO_DEFAULTS,
  getAudioSettings,
  setAudioSettings,
} from "../../lib/audio-settings";
import { isLowGfx } from "../../lib/lowGfx";

const flushMock = flushSettingsToServer as ReturnType<typeof vi.fn>;

const STORE_KEY = "sm_game_settings_v1";
const LOW_GFX_KEY = "salaryman_low_gfx";

// The page's own game-key defaults (DEFAULTS in Settings.tsx is not exported, so
// we mirror it here — these are the values RESET must restore in the blob). Kept
// local so a drift in the product defaults is caught by this test.
const GAME_DEFAULTS = {
  resolution: "auto",
  uiScale: 1.0,
  fpsCap: 120,
  cameraZoom: 3.2,
  weatherEffects: "full",
  reducedMotion: false,
  bloom: true,
  groundGlow: true,
  nightLighting: true,
  cinematic: true,
  terminalBoot: true,
  invertY: false,
  controlScheme: "wasd",
} as const;
const GAME_KEYS = Object.keys(GAME_DEFAULTS);

// AUDIO_DEFAULTS as the audio store PERSISTS them (verbose keys in the shared
// blob). Mirrors persist() in lib/audio-settings.
const AUDIO_DEFAULT_PERSIST = {
  masterVolume: 0.8,
  musicVolume: 0.14,
  sfxVolume: 0.9,
  voiceVolume: 1.0,
  soundtrackVolume: 0.22,
  audioMuted: false,
};

// ── Minimal Web Audio stub ───────────────────────────────────────────────────
// Resetting the audio store calls into soundEngine, which lazily reaches for an
// AudioContext. We never assert on audio output here, so the stub just has to
// not throw.
class FakeAudioParam {
  value = 0;
  setValueAtTime() { return this; }
  setTargetAtTime() { return this; }
  cancelScheduledValues() { return this; }
  linearRampToValueAtTime() { return this; }
  exponentialRampToValueAtTime() { return this; }
}
class FakeNode {
  gain = new FakeAudioParam();
  frequency = new FakeAudioParam();
  detune = new FakeAudioParam();
  Q = { value: 0 };
  type = "sine";
  onended: (() => void) | null = null;
  connect() { return this; }
  disconnect() {}
  start() {}
  stop() {}
}
class FakeAudioContext {
  state = "running";
  currentTime = 0;
  sampleRate = 44100;
  destination = {};
  createGain() { return new FakeNode(); }
  createOscillator() { return new FakeNode(); }
  createBiquadFilter() { return new FakeNode(); }
  createBufferSource() { return new FakeNode(); }
  createBuffer(_ch: number, len: number) { return { getChannelData: () => new Float32Array(len) }; }
  resume() {}
}

let root: Root;
let container: HTMLDivElement;

async function mount() {
  await act(async () => {
    root.render(<GameSettings />);
  });
}

function blob(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
}

function clickByText(text: string) {
  const btn = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === text,
  );
  if (!btn) throw new Error(`button "${text}" not found`);
  act(() => {
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function clickTab(name: string) {
  clickByText(name);
}

// Locate a control inside the Row that carries the given label text.
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

function clickReset() {
  clickByText("RESET SETTINGS TO DEFAULTS");
}

// React tracks an input/select's value internally; go through the native setter
// so a programmatic change still fires the component's onChange.
function setNativeValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  setter.call(el, value);
}

beforeEach(() => {
  (globalThis as any).AudioContext = FakeAudioContext as any;
  localStorage.clear();
  document.documentElement.classList.remove("low-gfx");
  // The audio store is a module-level singleton that survives between tests;
  // reset it to a clean baseline so each test starts from the defaults.
  setAudioSettings({ ...AUDIO_DEFAULTS });
  flushMock.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

describe("Settings 'RESET SETTINGS TO DEFAULTS' button", () => {
  it("restores game, audio & low-graphics to defaults locally and flushes to the server", () => {
    // Seed the device with thoroughly NON-default preferences across all three
    // stores, the way a player who has customised everything would have it.
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        resolution: "1440p",
        uiScale: 1.4,
        fpsCap: 30,
        cameraZoom: 1.6,
        weatherEffects: "off",
        reducedMotion: true,
        bloom: false,
        groundGlow: false,
        nightLighting: false,
        cinematic: false,
        terminalBoot: false,
        invertY: true,
        controlScheme: "arrows",
        // audio-store keys live in the SAME blob
        masterVolume: 0.1,
        musicVolume: 0.99,
        sfxVolume: 0.2,
        voiceVolume: 0.3,
        soundtrackVolume: 0.95,
        audioMuted: true,
      }),
    );
    localStorage.setItem(LOW_GFX_KEY, "1");

    act(() => {
      root.render(<GameSettings />);
    });

    // Move to the DATA tab where the reset button lives, then reset.
    clickByText("DATA");
    expect(flushMock).not.toHaveBeenCalled();

    clickByText("RESET SETTINGS TO DEFAULTS");

    // Every game key is back to its default value in the shared blob.
    const store = blob();
    for (const k of GAME_KEYS) {
      expect(store[k]).toEqual((GAME_DEFAULTS as Record<string, unknown>)[k]);
    }
    // Audio keys (same blob) are back to defaults too.
    for (const [k, v] of Object.entries(AUDIO_DEFAULT_PERSIST)) {
      expect(store[k]).toEqual(v);
    }
    // Low-graphics is cleared both in storage and on the <html> element.
    expect(isLowGfx()).toBe(false);
    expect(localStorage.getItem(LOW_GFX_KEY)).toBeNull();
    expect(document.documentElement.classList.contains("low-gfx")).toBe(false);

    // The synced server copy is overwritten immediately (nonce-driven flush),
    // not left to the 1s debounce — exactly once per reset click.
    expect(flushMock).toHaveBeenCalledTimes(1);
  });
});

describe("GameSettings RESET TO DEFAULTS", () => {
  it("restores the game blob, the audio store, and the low-graphics flag, and flushes to the server", async () => {
    await mount();

    // ── Change settings across every store so the reset has something to undo ──
    // GAME tab: a game-blob boolean.
    clickTab("GAME");
    act(() => { rowControl<HTMLButtonElement>("Invert vertical", "button").click(); });

    // DISPLAY tab: another game-blob boolean + the low-graphics flag.
    clickTab("DISPLAY");
    act(() => { rowControl<HTMLButtonElement>("Bloom / glow", "button").click(); });
    act(() => { rowControl<HTMLButtonElement>("Low graphics mode", "button").click(); });

    // GAME tab: the central audio store (a separate store sharing the blob).
    clickTab("GAME");
    const master = rowControl<HTMLInputElement>("Master", "input[type=range]");
    act(() => {
      setNativeValue(master, "0.2");
      master.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // Sanity: everything is now non-default before we reset.
    expect(blob().invertY).toBe(true);
    expect(blob().bloom).toBe(false);
    expect(isLowGfx()).toBe(true);
    expect(localStorage.getItem(LOW_GFX_KEY)).toBe("1");
    expect(getAudioSettings().master).toBe(0.2);
    expect(flushMock).not.toHaveBeenCalled();

    // ── RESET ──
    clickTab("DATA");
    clickReset();
    // Let the post-render effects (game-key persist + the flush effect) run.
    await act(async () => {});

    // 1. The game-settings blob is back to every default.
    const b = blob();
    for (const [key, value] of Object.entries(GAME_DEFAULTS)) {
      expect(b[key]).toBe(value);
    }

    // 2. The central audio store is back to AUDIO_DEFAULTS.
    expect(getAudioSettings()).toEqual(AUDIO_DEFAULTS);

    // 3. The low-graphics flag is cleared (store + <html> class).
    expect(isLowGfx()).toBe(false);
    expect(localStorage.getItem(LOW_GFX_KEY)).toBeNull();
    expect(document.documentElement.classList.contains("low-gfx")).toBe(false);

    // 4. The synced server copy was overwritten with the defaults exactly once,
    //    so no other device re-hydrates the pre-reset values.
    expect(flushMock).toHaveBeenCalledTimes(1);
  });

  it("does not flush to the server on mount — only after a reset (nonce guard)", async () => {
    await mount();
    // The flush effect is gated on resetNonce !== 0, so a fresh mount must not
    // touch the server copy.
    await act(async () => {});
    expect(flushMock).not.toHaveBeenCalled();

    clickTab("DATA");
    clickReset();
    await act(async () => {});
    expect(flushMock).toHaveBeenCalledTimes(1);
  });
});
