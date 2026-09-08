// @vitest-environment jsdom
//
// Guards the client-side self-healing exponential backoff in useArtAsset when
// { retryOnFail: true }. The server re-attempts a failed asset after a cooldown,
// so the client polls with a capped exponential backoff so it catches the recovery
// without hammering the backend on every interval while it's still broken.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal fetch stub. Each call returns the next response in the array;
 *  the last entry repeats indefinitely. */
function makeFetchSequence(
  sequence: Array<{ status: "failed" | "pending" | "ready"; url?: string | null }>,
) {
  let call = 0;
  return vi.fn(async () => {
    const r = sequence[Math.min(call++, sequence.length - 1)];
    return {
      ok: true,
      json: async () => ({
        asset: {
          id: 1,
          key: "test/key",
          category: "test",
          status: r.status,
          url: r.url ?? null,
          aspectRatio: "1:1",
        },
      }),
    };
  });
}

// ---------------------------------------------------------------------------
// Hook harness (jsdom + React createRoot)
// ---------------------------------------------------------------------------

let root: Root;
let container: HTMLDivElement;

function setupDOM() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
}

function teardownDOM() {
  act(() => {
    root.unmount();
  });
  container.remove();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  setupDOM();
});

afterEach(() => {
  teardownDOM();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useArtAsset retryOnFail: false (default)", () => {
  it("stops polling after a failed status — no retry is scheduled", async () => {
    const fetchMock = makeFetchSequence([{ status: "failed" }]);
    (globalThis as any).fetch = fetchMock;

    const { useArtAsset } = await import("./art");

    let captured: string | null = "sentinel";
    function Capture() {
      captured = useArtAsset(`test/no-retry-${Math.random()}`, 4000);
      return null;
    }

    await act(async () => {
      root.render(<Capture />);
    });

    // Initial tick: one fetch call, status=failed, retryOnFail=false → stop.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(captured).toBeNull();

    // Advance well past several poll intervals — no further fetches should fire.
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("useArtAsset retryOnFail: true — exponential backoff", () => {
  it("schedules a retry after the first failure with delay = intervalMs * 2", async () => {
    const intervalMs = 4000;
    const fetchMock = makeFetchSequence([
      { status: "failed" },  // call 1 → triggers backoff
      { status: "failed" },  // call 2 (after 1st retry)
    ]);
    (globalThis as any).fetch = fetchMock;

    const { useArtAsset } = await import("./art");

    function Capture() {
      useArtAsset(`test/backoff-${Math.random()}`, intervalMs, { retryOnFail: true });
      return null;
    }

    await act(async () => {
      root.render(<Capture />);
    });

    // Initial tick fires immediately (no setTimeout on the first call).
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Advancing by less than the expected first backoff delay must NOT fire another fetch.
    await act(async () => {
      vi.advanceTimersByTime(intervalMs * 2 - 1); // 7999ms
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Advancing past the first backoff delay (intervalMs * 2^1 = 8000ms) fires retry.
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("doubles the delay on consecutive failures", async () => {
    const intervalMs = 2000;
    const fetchMock = makeFetchSequence([
      { status: "failed" }, // call 1 → delay1 = min(2000*2, 30000) = 4000
      { status: "failed" }, // call 2 → delay2 = min(2000*4, 30000) = 8000
      { status: "failed" }, // call 3 → delay3 = min(2000*8, 30000) = 16000
    ]);
    (globalThis as any).fetch = fetchMock;

    const { useArtAsset } = await import("./art");

    function Capture() {
      useArtAsset(`test/doubles-${Math.random()}`, intervalMs, { retryOnFail: true });
      return null;
    }

    await act(async () => {
      root.render(<Capture />);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1); // initial tick

    // After delay1=4000ms: second fetch fires.
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // After delay2=8000ms more: third fetch fires.
    await act(async () => {
      vi.advanceTimersByTime(8000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // After delay3=16000ms more: fourth fetch fires.
    await act(async () => {
      vi.advanceTimersByTime(16000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("caps the retry delay at maxBackoffMs and does not escalate further", async () => {
    const intervalMs = 4000;
    const maxBackoffMs = 10_000;
    // failures=1 → 4000*2=8000 < 10000  (below cap)
    // failures=2 → 4000*4=16000 > 10000 → capped at 10000
    // failures=3 → 4000*8=32000 → still capped at 10000
    const fetchMock = makeFetchSequence([{ status: "failed" }]);
    (globalThis as any).fetch = fetchMock;

    const { useArtAsset } = await import("./art");

    function Capture() {
      useArtAsset(`test/cap-${Math.random()}`, intervalMs, {
        retryOnFail: true,
        maxBackoffMs,
      });
      return null;
    }

    await act(async () => {
      root.render(<Capture />);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1); // call 1

    // delay1 = min(8000, 10000) = 8000
    await act(async () => { vi.advanceTimersByTime(8000); });
    expect(fetchMock).toHaveBeenCalledTimes(2); // call 2

    // delay2 = min(16000, 10000) = 10000 (capped)
    await act(async () => { vi.advanceTimersByTime(9999); });
    expect(fetchMock).toHaveBeenCalledTimes(2); // not yet

    await act(async () => { vi.advanceTimersByTime(1); });
    expect(fetchMock).toHaveBeenCalledTimes(3); // call 3

    // delay3 = min(32000, 10000) = 10000 (still capped — no further escalation)
    await act(async () => { vi.advanceTimersByTime(9999); });
    expect(fetchMock).toHaveBeenCalledTimes(3); // not yet

    await act(async () => { vi.advanceTimersByTime(1); });
    expect(fetchMock).toHaveBeenCalledTimes(4); // call 4 — delay is flat, not growing
  });

  it("resolves the URL and stops polling once the asset becomes ready after retries", async () => {
    const intervalMs = 4000;
    const fetchMock = makeFetchSequence([
      { status: "failed" },                          // call 1 → backoff
      { status: "ready", url: "https://cdn.example.com/art.png" }, // call 2 → resolved
    ]);
    (globalThis as any).fetch = fetchMock;

    const { useArtAsset } = await import("./art");

    // Key must be stable across re-renders; a new random key per render creates a new
    // effect dependency and triggers extra fetches on state updates (setU → re-render).
    const stableKey = "test/resolves-stable";
    let capturedUrl: string | null = null;
    function Capture() {
      capturedUrl = useArtAsset(stableKey, intervalMs, { retryOnFail: true });
      return null;
    }

    await act(async () => {
      root.render(<Capture />);
    });
    expect(capturedUrl).toBeNull(); // failed, no URL yet

    // Trigger the first backoff retry (delay = intervalMs * 2 = 8000ms).
    await act(async () => {
      vi.advanceTimersByTime(8000);
    });
    expect(capturedUrl).toBe("https://cdn.example.com/art.png");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // After the URL is set no further polling should happen.
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("resets the backoff counter to 0 when the asset returns to pending after a failure", async () => {
    // This models the self-heal scenario: failed → (server re-kicks) → pending →
    // (server completes) → ready. Once the server accepts the retry request the
    // client's poll returns "pending", which must reset failures so the client
    // returns to the normal steady-poll cadence (intervalMs), not the backed-off one.
    const intervalMs = 2000;
    const fetchMock = makeFetchSequence([
      { status: "failed" },  // call 1 → failures=1, delay=4000
      { status: "pending" }, // call 2 (after 4000ms) → failures=0, delay=intervalMs=2000
      { status: "ready", url: "https://cdn.example.com/done.png" }, // call 3 (after 2000ms)
    ]);
    (globalThis as any).fetch = fetchMock;

    const { useArtAsset } = await import("./art");

    const stableKey = "test/reset-stable";
    let capturedUrl: string | null = null;
    function Capture() {
      capturedUrl = useArtAsset(stableKey, intervalMs, { retryOnFail: true });
      return null;
    }

    await act(async () => {
      root.render(<Capture />);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(capturedUrl).toBeNull();

    // Advance 4000ms → 2nd fetch (pending resets failures to 0).
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // After reset, next delay is intervalMs (2000ms), NOT 8000ms.
    // Advancing only 2000ms must be enough to trigger the 3rd fetch.
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(capturedUrl).toBe("https://cdn.example.com/done.png");
  });
});
