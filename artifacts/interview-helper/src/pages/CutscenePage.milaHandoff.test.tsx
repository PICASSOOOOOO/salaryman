// @vitest-environment jsdom
//
// Guard for the "exactly once" Mila handoff delivery on the cutscene page.
//
// The handoff is delivered "at least once": WorldPlay marks it pending at the
// MX-75 claim and replays it on every reload until the cutscene is shown (see
// shouldReplayMilaHandoff). Reaching /cutscene/mila-handoff IS the delivery, so
// CutscenePage's mount effect MUST clear the durable salaryman.milaHandoff flag
// so it never replays again. If that clear regresses, the cutscene loops forever
// (replays on every WorldPlay mount).
//
// This renders the REAL CutscenePage over a controllable wouter param and a
// stubbed CutsceneRunner, and asserts the flag is cleared on mount for the
// handoff id and left untouched for any other cutscene id.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MILA_HANDOFF_KEY, MILA_HANDOFF_CUTSCENE_ID } from "@/lib/story-scene1";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// The cutscene id is read via wouter's useParams; expose a mutable value so each
// test can route the page to a different scene. useLocation is a no-op setter.
const h = vi.hoisted(() => ({ id: "" }));

vi.mock("wouter", () => ({
  useParams: () => ({ id: h.id }),
  useLocation: () => ["", vi.fn()],
}));

// Stub the heavy runner — this test only cares about the flag-clearing effect,
// not the rendered talking-heads scene.
vi.mock("@/components/CutsceneRunner", () => ({ default: () => null }));

import CutscenePage from "./CutscenePage";

let root: Root;
let container: HTMLDivElement;

async function mount() {
  await act(async () => {
    root.render(<CutscenePage />);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  localStorage.clear();
});

describe("CutscenePage Mila handoff flag", () => {
  it("clears the pending handoff flag on mount of the handoff cutscene", async () => {
    localStorage.setItem(MILA_HANDOFF_KEY, "pending");
    h.id = MILA_HANDOFF_CUTSCENE_ID;

    await mount();

    expect(localStorage.getItem(MILA_HANDOFF_KEY)).toBe(null);
  });

  it("leaves the pending handoff flag untouched for a different cutscene id", async () => {
    localStorage.setItem(MILA_HANDOFF_KEY, "pending");
    h.id = "lobby-receptionist";

    await mount();

    expect(localStorage.getItem(MILA_HANDOFF_KEY)).toBe("pending");
  });
});
