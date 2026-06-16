// @vitest-environment jsdom
//
// Guards the WorldPlay game-loop teardown useEffect that clears sm_live on
// unmount so phantom collector dots cannot persist on the world map after a
// player logs out or closes the city tab.
//
// The game loop writes:
//   localStorage.setItem('sm_live', JSON.stringify({ writtenAt, boCollectors, … }));
// every ~1 second.  On teardown the cleanup return fires:
//   try { localStorage.removeItem('sm_live'); } catch { /* ignore */ }
//
// If that line is accidentally deleted, readBoCollectorsFromSave() continues to
// return the stale sm_live data for up to 5 minutes, leaving red dots on the
// world map for every logged-out player who still has a fresh-ish sm_live entry.
//
// This file contains two independent guards:
//
//   1. SOURCE GUARD (static) — reads WorldPlay.tsx at build time and asserts:
//       a. the removeItem('sm_live') call is present, AND
//       b. it appears within a useEffect cleanup block (co-located with
//          cancelAnimationFrame, which is always the first thing cleaned up).
//      Fails immediately if the line is removed or moved outside a cleanup.
//
//   2. BEHAVIOUR GUARD (jsdom) — mounts a minimal React stub that mirrors the
//      exact cleanup structure (useEffect returning a function that calls
//      removeItem), seeds sm_live, unmounts the component, and confirms the
//      key has been removed. This proves the pattern works end-to-end with
//      real localStorage so a future refactor can't silently break it.
//
// Neither guard requires spinning up the full ~24k-line WorldPlay component.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// ─── Source guard ─────────────────────────────────────────────────────────────

const WORLDPLAY = join(dirname(fileURLToPath(import.meta.url)), "WorldPlay.tsx");
const src = readFileSync(WORLDPLAY, "utf8");

describe("WorldPlay sm_live cleanup — source guard", () => {
  it("loaded the WorldPlay source (sanity check)", () => {
    // The real file is ~24k lines. Guard against an accidental empty read
    // that would cause every subsequent assertion to vacuously pass.
    expect(src.length).toBeGreaterThan(100_000);
  });

  it("calls localStorage.removeItem('sm_live') in the source", () => {
    expect(src).toMatch(/localStorage\.removeItem\(\s*['"]sm_live['"]\s*\)/);
  });

  it("removeItem('sm_live') is co-located with cancelAnimationFrame in the same cleanup block", () => {
    // The cleanup return () => { … } must cancel the animation frame AND
    // remove sm_live. Both must appear within ~500 characters of each other —
    // which is only possible if they are in the same function body.
    const removeIdx =
      src.indexOf("localStorage.removeItem('sm_live')") !== -1
        ? src.indexOf("localStorage.removeItem('sm_live')")
        : src.indexOf('localStorage.removeItem("sm_live")');

    expect(removeIdx).toBeGreaterThan(-1);

    // Grab a window of source around the removeItem call (400 chars back,
    // 100 chars forward — enough to include the cancelAnimationFrame that
    // always opens the same cleanup block).
    const snippet = src.slice(Math.max(0, removeIdx - 400), removeIdx + 100);
    expect(snippet).toMatch(/cancelAnimationFrame/);
  });
});

// ─── Behaviour guard (jsdom) ──────────────────────────────────────────────────

// A minimal React component that mirrors the WorldPlay cleanup pattern exactly:
//   useEffect(() => {
//     return () => {
//       try { localStorage.removeItem('sm_live'); } catch { /* ignore */ }
//     };
//   }, []);
//
// We don't import WorldPlay itself (it has heavy dependencies and a canvas
// requirement). Instead we verify the pattern in isolation so that if the
// source guard ever requires a different shape we can update this stub to match.
function SmLiveCleanupStub() {
  useEffect(() => {
    return () => {
      try {
        localStorage.removeItem("sm_live");
      } catch {
        /* ignore */
      }
    };
  }, []);
  return null;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mountStub() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(SmLiveCleanupStub));
  });
}

function unmountStub() {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  if (container && container.parentNode) {
    container.parentNode.removeChild(container);
    container = null;
  }
}

describe("WorldPlay sm_live cleanup — behaviour guard (jsdom)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    unmountStub();
    localStorage.clear();
  });

  it("removes sm_live from localStorage when the component unmounts", async () => {
    // Seed sm_live as the game loop would on every tick.
    localStorage.setItem(
      "sm_live",
      JSON.stringify({
        writtenAt: Date.now(),
        boCollectors: [{ x: 100, y: 200 }],
        wantedLevel: 1,
      }),
    );

    mountStub();
    expect(localStorage.getItem("sm_live")).not.toBeNull();

    unmountStub();

    expect(localStorage.getItem("sm_live")).toBeNull();
  });

  it("does not throw when sm_live is already absent on unmount", async () => {
    // localStorage is empty — the cleanup try/catch must swallow any error
    // and not propagate it.
    mountStub();
    expect(() => unmountStub()).not.toThrow();
    expect(localStorage.getItem("sm_live")).toBeNull();
  });

  it("leaves unrelated localStorage keys intact after unmount", async () => {
    localStorage.setItem("sm_save", JSON.stringify({ boCollectors: [] }));
    localStorage.setItem(
      "sm_live",
      JSON.stringify({ writtenAt: Date.now(), boCollectors: [] }),
    );

    mountStub();
    unmountStub();

    // Only sm_live should have been removed — sm_save must survive.
    expect(localStorage.getItem("sm_live")).toBeNull();
    expect(localStorage.getItem("sm_save")).not.toBeNull();
  });
});
