// Guards the coalescing safety-net inside playNotify(): a burst of arrivals must
// collapse to a SINGLE chime, never one beep per message. The per-sound debounce
// in safe() (400ms min-gap for "notify") is what enforces this regardless of how
// many times a caller fires playNotify() in quick succession.
//
// soundEngine is fully mocked here so we can count the underlying SFX calls
// without needing a real (or stubbed) Web Audio context. Each test re-imports
// ui-sound after vi.resetModules() so the debounce state starts clean.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sfxHologramBeamIn = vi.fn();

vi.mock("../soundEngine", () => ({
  resumeAudioContext: vi.fn(),
  sfxUIClick: vi.fn(),
  sfxEnter: vi.fn(),
  sfxSalarymanSting: vi.fn(),
  sfxSave: vi.fn(),
  sfxMilestone: vi.fn(),
  sfxError: vi.fn(),
  sfxStep: vi.fn(),
  sfxHologramBeamIn,
  sfxSecretCode: vi.fn(),
}));

// playNotify reads the clock via performance.now(); control it so the debounce
// window is exercised deterministically instead of relying on wall-clock timing.
let nowMs = 0;

beforeEach(() => {
  vi.resetModules();
  nowMs = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => nowMs);
  sfxHologramBeamIn.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("playNotify coalescing", () => {
  it("plays exactly one chime per call", async () => {
    const { playNotify } = await import("./ui-sound");
    playNotify();
    expect(sfxHologramBeamIn).toHaveBeenCalledTimes(1);
  });

  it("collapses a rapid burst of arrivals into a single chime", async () => {
    const { playNotify } = await import("./ui-sound");
    // Five arrivals within the same coalescing window (<400ms apart).
    playNotify();
    nowMs += 50;
    playNotify();
    nowMs += 100;
    playNotify();
    nowMs += 100;
    playNotify();
    nowMs += 100;
    playNotify();
    expect(sfxHologramBeamIn).toHaveBeenCalledTimes(1);
  });

  it("allows a new chime once the coalescing window has elapsed", async () => {
    const { playNotify } = await import("./ui-sound");
    playNotify();
    expect(sfxHologramBeamIn).toHaveBeenCalledTimes(1);
    nowMs += 401; // past the 400ms notify min-gap
    playNotify();
    expect(sfxHologramBeamIn).toHaveBeenCalledTimes(2);
  });
});
