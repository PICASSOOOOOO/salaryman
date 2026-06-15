// @vitest-environment jsdom
//
// Exercises the Settings DATA tab's "RESET SETTINGS TO DEFAULTS" button end to
// end. settings-sync.flush.test.ts covers flushSettingsToServer() in isolation,
// but the BUTTON wiring — that one click restores all three local stores (game
// settings, audio, low-graphics) to their defaults AND immediately overwrites
// the synced server copy — was untested. A regression here would leave stale
// preferences on the device (or re-hydrating from the account on another
// device) after a reset, which is the whole reason the immediate flush exists.
//
// We render the REAL component against the REAL game-settings / audio /
// low-graphics stores (the point is their localStorage wiring), driving it the
// way a user would: switch to the DATA tab, click Reset. Only two things are
// mocked — the localization selectors (i18n / currency dropdowns are unrelated
// to this flow and pull in heavy deps) and flushSettingsToServer (so we assert
// the immediate server push fires without a network call).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const flushSettingsToServerMock = vi.fn();
vi.mock("../../lib/settings-sync", () => ({
  flushSettingsToServer: () => flushSettingsToServerMock(),
}));
// The localization dropdowns are irrelevant to the reset flow and drag in i18n
// / currency machinery; stub them to nothing so the page renders cleanly.
vi.mock("../../components/LanguageSelector", () => ({ LanguageSelector: () => null }));
vi.mock("../../components/CurrencySelector", () => ({ CurrencySelector: () => null }));

import GameSettings from "./Settings";
import { isLowGfx } from "../../lib/lowGfx";

const STORE_KEY = "sm_game_settings_v1";
const LOW_GFX_KEY = "salaryman_low_gfx";

// Mirrors DEFAULTS / AUDIO_DEFAULTS in the source — kept local so a drift in the
// product defaults is caught by this test instead of silently tracked.
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
  crtEffect: true,
  invertY: false,
  controlScheme: "wasd",
};
const GAME_KEYS = Object.keys(GAME_DEFAULTS);
const AUDIO_DEFAULT_PERSIST = {
  masterVolume: 0.8,
  musicVolume: 0.14,
  sfxVolume: 0.9,
  voiceVolume: 1.0,
  soundtrackVolume: 0.22,
  audioMuted: false,
};

let root: Root;
let container: HTMLDivElement;

function readStore(): Record<string, unknown> {
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

beforeEach(() => {
  flushSettingsToServerMock.mockClear();
  localStorage.clear();
  document.documentElement.classList.remove("low-gfx");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
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
        crtEffect: false,
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
    expect(flushSettingsToServerMock).not.toHaveBeenCalled();

    clickByText("RESET SETTINGS TO DEFAULTS");

    // Every game key is back to its default value in the shared blob.
    const store = readStore();
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
    expect(flushSettingsToServerMock).toHaveBeenCalledTimes(1);
  });
});
