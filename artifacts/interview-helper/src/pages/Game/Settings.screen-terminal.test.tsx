// @vitest-environment jsdom
//
// Sibling of Settings.display.test.tsx. That file covers the DISPLAY tab's
// visual-quality toggles, the Weather select and the Camera zoom slider. This
// one closes the remaining gaps in GameSettings persistence:
//
//   - The SCREEN section (on the DISPLAY tab): Resolution / UI scale / FPS cap.
//     UI scale is doubly special — besides persisting it ALSO drives the
//     `--game-ui-scale` CSS variable on <html> that scales the whole game UI.
//   - The whole TERMINAL tab: Boot animation + CRT / scanlines toggles. The CRT
//     toggle is the riskiest control in the page: it calls applyCrt() which
//     toggles a global `no-crt` class on <html> that grades scene artwork
//     app-wide (SceneFX), so a regression silently changes how the ENTIRE game
//     looks with no other test to catch it.
//
// Every control asserts the same two contracts as the display test:
//   1. The new value is MERGED into sm_game_settings_v1 — the audio store ALSO
//      persists into that same blob (master/music/muted/…), so the page must
//      never clobber those keys. We pre-seed them and prove they survive.
//   2. The `sm-settings-changed` window event fires on every change so the live
//      renderer re-reads its cached prefs in the same tab.
//
// Plus the two side effects unique to this surface: `--game-ui-scale` tracks UI
// scale, and `no-crt` on <html> tracks the inverted CRT toggle.
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

// React tracks an input/select's value internally; to make a programmatic value
// change trigger onChange we have to go through the native value setter and then
// dispatch the event React listens for.
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
  document.documentElement.classList.remove("low-gfx", "no-crt");
  document.documentElement.style.removeProperty("--game-ui-scale");
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

describe("GameSettings SCREEN section persistence", () => {
  it('changes "Resolution", merges it, and fires the event', async () => {
    await mount();
    clickTab("DISPLAY");
    expect(blob().resolution).toBe("auto");

    const baseline = changeCount;
    const sel = rowControl<HTMLSelectElement>("Resolution", "select");
    act(() => {
      setNativeValue(sel, "1080p");
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const b = blob();
    expect(b.resolution).toBe("1080p");
    expect(b.master).toBe(0.3);                 // audio keys untouched
    expect(b.music).toBe(0.55);
    expect(b.muted).toBe(true);
    expect(changeCount).toBe(baseline + 1);
  });

  it('changes "FPS cap" (numeric select), merges it, and fires the event', async () => {
    await mount();
    clickTab("DISPLAY");
    expect(blob().fpsCap).toBe(120);

    const baseline = changeCount;
    const sel = rowControl<HTMLSelectElement>("FPS cap", "select");
    act(() => {
      setNativeValue(sel, "30");
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const b = blob();
    expect(b.fpsCap).toBe(30);                   // coerced to a number, not "30"
    expect(b.master).toBe(0.3);
    expect(b.muted).toBe(true);
    expect(changeCount).toBe(baseline + 1);
  });

  it('moves the "UI scale" slider, merges it, fires the event, and sets --game-ui-scale', async () => {
    await mount();
    clickTab("DISPLAY");
    expect(blob().uiScale).toBe(1.0);
    // The mount effect applies the default scale immediately.
    expect(document.documentElement.style.getPropertyValue("--game-ui-scale")).toBe("1");

    const baseline = changeCount;
    const slider = rowControl<HTMLInputElement>("UI scale", "input[type=range]");
    act(() => {
      setNativeValue(slider, "1.2");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const b = blob();
    expect(b.uiScale).toBe(1.2);
    expect(b.master).toBe(0.3);
    expect(b.music).toBe(0.55);
    expect(changeCount).toBe(baseline + 1);
    // The CSS variable that scales the whole game UI tracks the new value.
    expect(document.documentElement.style.getPropertyValue("--game-ui-scale")).toBe("1.2");
  });
});

describe("GameSettings TERMINAL tab persistence", () => {
  it('flips "Boot animation", merges it, and fires the event', async () => {
    await mount();
    clickTab("TERMINAL");
    expect(blob().terminalBoot).toBe(true);

    const baseline = changeCount;
    const btn = rowControl<HTMLButtonElement>("Boot animation", "button");
    act(() => { btn.click(); });

    const b = blob();
    expect(b.terminalBoot).toBe(false);
    expect(b.master).toBe(0.3);
    expect(b.music).toBe(0.55);
    expect(b.muted).toBe(true);
    expect(changeCount).toBe(baseline + 1);
  });

  it('flips "CRT / scanlines", merges it, fires the event, and toggles the global no-crt class', async () => {
    await mount();
    // CRT defaults ON, so applyCrt(true) on mount means `no-crt` is absent.
    expect(document.documentElement.classList.contains("no-crt")).toBe(false);
    clickTab("TERMINAL");
    expect(blob().crtEffect).toBe(true);

    const baseline = changeCount;
    const btn = rowControl<HTMLButtonElement>("CRT / scanlines", "button");
    act(() => { btn.click(); });

    const b = blob();
    expect(b.crtEffect).toBe(false);
    expect(b.master).toBe(0.3);
    expect(b.muted).toBe(true);
    expect(changeCount).toBe(baseline + 1);
    // Turning CRT OFF must add the app-wide `no-crt` grade class on <html>.
    expect(document.documentElement.classList.contains("no-crt")).toBe(true);

    // Turning it back ON must strip the class again. Re-query the button: the
    // Toggle is an inline component, so React remounts a fresh DOM node on every
    // render and the `btn` captured above is now detached.
    const btnAgain = rowControl<HTMLButtonElement>("CRT / scanlines", "button");
    act(() => { btnAgain.click(); });
    expect(blob().crtEffect).toBe(true);
    expect(document.documentElement.classList.contains("no-crt")).toBe(false);
  });
});
