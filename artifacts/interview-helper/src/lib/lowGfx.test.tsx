// @vitest-environment jsdom
//
// Guards the cross-tab half of the low-graphics preference — the part that keeps
// a SECOND open tab honest. When the user flips low-graphics in tab A, only that
// tab's in-page setLowGfx() runs; tab B never sees the CustomEvent, it only hears
// the browser's cross-tab `storage` event. The useLowGfx hook listens for that
// and must re-apply the <html class="low-gfx"> class + update its returned state,
// or tab B silently renders at the wrong graphics quality until a reload (there's
// a deliberate comment in lowGfx.ts explaining exactly this).
//
// We drive the REAL hook (no mocks — the whole point is its localStorage + DOM +
// event wiring) by rendering a tiny capture component, then dispatch the events a
// real browser would and assert the boolean + the <html> class both track.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { useLowGfx } from "./lowGfx";

const KEY = "salaryman_low_gfx";

let captured: ReturnType<typeof useLowGfx> | null = null;
function Capture() {
  captured = useLowGfx();
  return null;
}

let root: Root;
let container: HTMLDivElement;

async function mount() {
  await act(async () => {
    root.render(<Capture />);
  });
}

// jsdom doesn't fire `storage` events for our own localStorage writes (they only
// fire in OTHER documents), so we simulate the cross-tab signal the same way the
// browser would deliver it to tab B.
function fireStorage(key: string | null) {
  act(() => {
    window.dispatchEvent(new StorageEvent("storage", { key }));
  });
}

beforeEach(() => {
  captured = null;
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

describe("useLowGfx cross-tab sync", () => {
  it("starts from the persisted value", async () => {
    localStorage.setItem(KEY, "1");
    await mount();

    expect(captured![0]).toBe(true);
  });

  it("turns ON when another tab enables low-gfx (storage event)", async () => {
    await mount();
    expect(captured![0]).toBe(false);
    expect(document.documentElement.classList.contains("low-gfx")).toBe(false);

    // Another tab flipped it on: localStorage already holds the new value when
    // the storage event arrives.
    localStorage.setItem(KEY, "1");
    fireStorage(KEY);

    expect(captured![0]).toBe(true);
    expect(document.documentElement.classList.contains("low-gfx")).toBe(true);
  });

  it("turns OFF when another tab disables low-gfx (storage event)", async () => {
    localStorage.setItem(KEY, "1");
    document.documentElement.classList.add("low-gfx");
    await mount();
    expect(captured![0]).toBe(true);

    // Another tab turned it off (removeItem) before signalling.
    localStorage.removeItem(KEY);
    fireStorage(KEY);

    expect(captured![0]).toBe(false);
    expect(document.documentElement.classList.contains("low-gfx")).toBe(false);
  });

  it("ignores storage events for an unrelated key", async () => {
    await mount();
    expect(captured![0]).toBe(false);

    // Some other key changed in another tab; localStorage even has low-gfx set,
    // but because the event key isn't ours we must NOT react to it.
    localStorage.setItem(KEY, "1");
    fireStorage("some_other_key");

    expect(captured![0]).toBe(false);
    expect(document.documentElement.classList.contains("low-gfx")).toBe(false);
  });

  it("re-syncs on a null-key storage event (storage.clear in another tab)", async () => {
    await mount();
    expect(captured![0]).toBe(false);

    // localStorage.clear() in another tab fires a storage event with key === null,
    // which the hook treats as "something changed, re-read".
    localStorage.setItem(KEY, "1");
    fireStorage(null);

    expect(captured![0]).toBe(true);
    expect(document.documentElement.classList.contains("low-gfx")).toBe(true);
  });

  it("re-syncs on the in-page salaryman:lowgfx-changed event", async () => {
    await mount();
    expect(captured![0]).toBe(false);

    // Another part of THIS tab changed the preference directly in localStorage
    // and announced it via the in-page event (e.g. settings hydrate). The hook
    // must pick it up the same as a cross-tab change.
    localStorage.setItem(KEY, "1");
    act(() => {
      window.dispatchEvent(new CustomEvent("salaryman:lowgfx-changed", { detail: true }));
    });

    expect(captured![0]).toBe(true);
    expect(document.documentElement.classList.contains("low-gfx")).toBe(true);
  });
});
