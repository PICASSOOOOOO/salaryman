// @vitest-environment jsdom
//
// Third sibling of Settings.display.test.tsx / Settings.screen-terminal.test.tsx.
// Those cover the DISPLAY (visual + SCREEN) and TERMINAL tabs. This one closes
// the last two untested corners of the settings page:
//
//   - The GAME tab's CONTROLS section: the control "Scheme" select
//     (WASD / ARROWS / TOUCH) and the "Invert vertical" toggle. Both persist
//     into sm_game_settings_v1 and must not clobber the audio store's keys that
//     share that same blob, and both must fire `sm-settings-changed` so the live
//     renderer re-reads its cached prefs in the same tab.
//
//   - "RESET SETTINGS TO DEFAULTS" (DATA tab) — the riskiest untested path. One
//     click must restore defaults across THREE separate stores at once:
//       1. the game keys in sm_game_settings_v1 (via setS(DEFAULTS)),
//       2. the audio store's verbose keys in that same blob (via setAudio),
//       3. the low-graphics flag salaryman_low_gfx + its <html> class.
//     and then push the reset up via flushSettingsToServer() so no other device
//     re-hydrates the pre-reset values. A regression here silently loses or
//     fails to clear a player's preferences across devices, with nothing else
//     to catch it.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../components/LanguageSelector", () => ({ LanguageSelector: () => null }));
vi.mock("../../components/CurrencySelector", () => ({ CurrencySelector: () => null }));
vi.mock("../../lib/settings-sync", () => ({ flushSettingsToServer: vi.fn() }));

import GameSettings from "./Settings";
import { flushSettingsToServer } from "../../lib/settings-sync";

const STORE_KEY = "sm_game_settings_v1";
const LOW_GFX_KEY = "salaryman_low_gfx";

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

function clickButton(text: string) {
  const btn = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === text,
  );
  if (!btn) throw new Error(`button not found: ${text}`);
  act(() => { (btn as HTMLButtonElement).click(); });
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
  // must survive every save the GAME tab makes — that's the merge-on-save
  // contract. These arbitrary keys stand in for any non-game keys in the blob.
  localStorage.setItem(
    STORE_KEY,
    JSON.stringify({ master: 0.3, music: 0.55, muted: true }),
  );
  document.documentElement.classList.remove("low-gfx");
  document.documentElement.style.removeProperty("--game-ui-scale");
  changeCount = 0;
  window.addEventListener("sm-settings-changed", onChange);
  (flushSettingsToServer as unknown as ReturnType<typeof vi.fn>).mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  window.removeEventListener("sm-settings-changed", onChange);
});

describe("GameSettings GAME tab CONTROLS persistence", () => {
  it('changes the control "Scheme", merges it, and fires the event', async () => {
    await mount();
    clickTab("GAME");
    expect(blob().controlScheme).toBe("wasd");

    const baseline = changeCount;
    const sel = rowControl<HTMLSelectElement>("Scheme", "select");
    act(() => {
      setNativeValue(sel, "arrows");
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const b = blob();
    expect(b.controlScheme).toBe("arrows");
    expect(b.master).toBe(0.3);                 // non-game keys untouched
    expect(b.music).toBe(0.55);
    expect(b.muted).toBe(true);
    expect(changeCount).toBe(baseline + 1);
  });

  it('flips "Invert vertical", merges it, and fires the event', async () => {
    await mount();
    clickTab("GAME");
    expect(blob().invertY).toBe(false);

    const baseline = changeCount;
    const btn = rowControl<HTMLButtonElement>("Invert vertical", "button");
    act(() => { btn.click(); });

    const b = blob();
    expect(b.invertY).toBe(true);
    expect(b.master).toBe(0.3);                 // non-game keys untouched
    expect(b.music).toBe(0.55);
    expect(b.muted).toBe(true);
    expect(changeCount).toBe(baseline + 1);
  });
});

describe('GameSettings "Reset to defaults"', () => {
  it("restores game keys, audio keys and the low-gfx flag, then flushes to the server", async () => {
    await mount();

    // Drive every store AWAY from its defaults so the reset has something to undo.
    // 1) Game keys via the GAME tab.
    clickTab("GAME");
    const scheme = rowControl<HTMLSelectElement>("Scheme", "select");
    act(() => {
      setNativeValue(scheme, "arrows");
      scheme.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const invert = rowControl<HTMLButtonElement>("Invert vertical", "button");
    act(() => { invert.click(); });

    // 2) Audio store via the GAME tab's Master slider (persists masterVolume).
    clickTab("GAME");
    const master = rowControl<HTMLInputElement>("Master", "input[type=range]");
    act(() => {
      setNativeValue(master, "0.2");
      master.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // 3) Low-graphics flag via the DISPLAY tab toggle.
    clickTab("DISPLAY");
    const lowGfx = rowControl<HTMLButtonElement>("Low graphics mode", "button");
    act(() => { lowGfx.click(); });

    // Sanity: everything is now non-default before we reset.
    expect(blob().controlScheme).toBe("arrows");
    expect(blob().invertY).toBe(true);
    expect(blob().masterVolume).toBe(0.2);
    expect(localStorage.getItem(LOW_GFX_KEY)).toBe("1");
    expect(document.documentElement.classList.contains("low-gfx")).toBe(true);

    // Reset everything in one click.
    clickTab("DATA");
    clickButton("RESET SETTINGS TO DEFAULTS");

    const b = blob();
    // Game keys back to defaults.
    expect(b.controlScheme).toBe("wasd");
    expect(b.invertY).toBe(false);
    expect(b.resolution).toBe("auto");
    expect(b.uiScale).toBe(1.0);
    // Audio keys back to defaults (verbose keys the audio store owns).
    expect(b.masterVolume).toBe(0.8);
    expect(b.musicVolume).toBe(0.14);
    expect(b.audioMuted).toBe(false);
    // Low-graphics flag cleared everywhere — localStorage key and <html> class.
    expect(localStorage.getItem(LOW_GFX_KEY)).toBeNull();
    expect(document.documentElement.classList.contains("low-gfx")).toBe(false);

    // The reset is pushed to the account immediately so no device re-hydrates
    // the pre-reset values.
    expect(flushSettingsToServer).toHaveBeenCalledTimes(1);
  });
});
