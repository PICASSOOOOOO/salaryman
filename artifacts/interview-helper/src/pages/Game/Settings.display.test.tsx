// @vitest-environment jsdom
//
// Guards the DISPLAY tab of GameSettings end-to-end, the sibling of the
// already-covered low-graphics toggle (lib/lowGfx.test.tsx owns that one). Every
// other display-quality control on this tab — the Reduced motion / Bloom /
// Ground glow / Night lighting / Cinematic letterbox toggles, plus the Weather
// effects select and the Camera zoom slider — writes into the shared
// `sm_game_settings_v1` blob and fires the `sm-settings-changed` window event
// that the live world renderer keys off (WorldPlay's readGfxQuality()). A
// regression there silently changes how the game looks with no test to catch it.
//
// Two contracts matter and are asserted for each control:
//   1. The flipped value is MERGED into sm_game_settings_v1 — the audio store
//      ALSO persists into that same blob (master/music/muted/…), so the page
//      must never clobber those keys when it saves (see the NOTE comment block
//      at the top of Settings.tsx). We pre-seed audio keys and prove they
//      survive every save.
//   2. The `sm-settings-changed` event fires on every change so the renderer
//      re-reads its cached quality prefs in the same tab (same-tab writes don't
//      fire a native `storage` event).
//
// We drive the REAL component (no mocking of its state) by rendering it, clicking
// the DISPLAY tab, then flipping each control with real DOM events and reading
// localStorage + the event spy back. Only the game-tab-only children
// (Language/Currency selectors, which pull in i18n + currency hooks) and the
// settings-sync network glue are stubbed — they are unrelated to this tab.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../components/LanguageSelector", () => ({ LanguageSelector: () => null }));
vi.mock("../../components/CurrencySelector", () => ({ CurrencySelector: () => null }));
vi.mock("../../lib/settings-sync", () => ({ flushSettingsToServer: vi.fn() }));

import GameSettings from "./Settings";

const STORE_KEY = "sm_game_settings_v1";

let root: Root;
let container: HTMLDivElement;
let changeCount = 0;
const onChange = () => { changeCount++; };

async function mount() {
  await act(async () => {
    root.render(<GameSettings />);
  });
}

function blob(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(STORE_KEY)!);
}

// The DISPLAY tab button is an icon + the text "DISPLAY"; click it to reveal the
// visual-quality controls.
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

// React tracks an input/select's value internally; to make a programmatic value
// change trigger onChange we have to go through the native value setter (the same
// trick @testing-library uses) and then dispatch the event React listens for.
function setNativeValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  setter.call(el, value);
}

beforeEach(() => {
  localStorage.clear();
  // Pre-seed the audio store's keys (it shares STORE_KEY with this page). They
  // must survive every save the page makes — that's the merge-on-save contract.
  localStorage.setItem(
    STORE_KEY,
    JSON.stringify({ master: 0.3, music: 0.55, muted: true }),
  );
  document.documentElement.classList.remove("low-gfx");
  changeCount = 0;
  window.addEventListener("sm-settings-changed", onChange);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  window.removeEventListener("sm-settings-changed", onChange);
});

describe("GameSettings DISPLAY tab persistence", () => {
  it("keeps the audio store's keys in the blob on mount (merge, not overwrite)", async () => {
    await mount();
    const b = blob();
    expect(b.master).toBe(0.3);
    expect(b.music).toBe(0.55);
    expect(b.muted).toBe(true);
    // The game defaults are merged in alongside the audio keys.
    expect(b.bloom).toBe(true);
    expect(b.cameraZoom).toBe(3.2);
  });

  // The boolean visual-quality toggles. Each starts at its default and flips on a
  // single click of the row's ON/OFF button.
  const toggles: { label: string; key: string; from: boolean }[] = [
    { label: "Reduced motion",      key: "reducedMotion", from: false },
    { label: "Bloom / glow",        key: "bloom",         from: true },
    { label: "Ground glow",         key: "groundGlow",    from: true },
    { label: "Night lighting",      key: "nightLighting", from: true },
    { label: "Cinematic letterbox", key: "cinematic",     from: true },
  ];

  for (const { label, key, from } of toggles) {
    it(`flips "${label}", merges it into the blob, and fires sm-settings-changed`, async () => {
      await mount();
      clickTab("DISPLAY");
      expect(blob()[key]).toBe(from);

      const baseline = changeCount;
      const btn = rowControl<HTMLButtonElement>(label, "button");
      act(() => { btn.click(); });

      const b = blob();
      expect(b[key]).toBe(!from);                 // value persisted, flipped
      expect(b.master).toBe(0.3);                 // audio keys untouched
      expect(b.music).toBe(0.55);
      expect(b.muted).toBe(true);
      expect(changeCount).toBe(baseline + 1);     // renderer notified once
    });
  }

  it('changes the "Weather effects" select, merges it, and fires the event', async () => {
    await mount();
    clickTab("DISPLAY");
    expect(blob().weatherEffects).toBe("full");

    const baseline = changeCount;
    const sel = rowControl<HTMLSelectElement>("Weather effects", "select");
    act(() => {
      setNativeValue(sel, "reduced");
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const b = blob();
    expect(b.weatherEffects).toBe("reduced");
    expect(b.master).toBe(0.3);
    expect(b.muted).toBe(true);
    expect(changeCount).toBe(baseline + 1);
  });

  it('moves the "Camera zoom" slider, merges it, and fires the event', async () => {
    await mount();
    clickTab("DISPLAY");
    expect(blob().cameraZoom).toBe(3.2);

    const baseline = changeCount;
    const slider = rowControl<HTMLInputElement>("Camera zoom", "input[type=range]");
    act(() => {
      setNativeValue(slider, "2");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const b = blob();
    expect(b.cameraZoom).toBe(2);
    expect(b.master).toBe(0.3);
    expect(b.music).toBe(0.55);
    expect(changeCount).toBe(baseline + 1);
  });
});
