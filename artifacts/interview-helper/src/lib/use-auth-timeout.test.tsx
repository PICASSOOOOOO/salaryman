// @vitest-environment jsdom
//
// Locks down the AUTH-GATE FREEZE guard in @workspace/replit-auth-web's
// useAuth: the /api/auth/user probe is wrapped in a hard timeout so a stalled
// request (e.g. returning to the app after an aborted external OAuth flow, or a
// flaky network) can never pin isLoading=true forever. Every consumer that
// holds a loading screen behind isLoading (the home front door, protected-route
// gates) would otherwise freeze indefinitely. On timeout we must resolve to
// "logged out" — isLoading=false, isAuthenticated=false — so a usable screen
// always renders.
//
// We mount a tiny harness that surfaces the hook's state, drive fetch with a
// never-settling promise, advance fake timers past the timeout, and assert the
// hook stops loading and reports logged-out. A second test confirms a fast,
// successful response resolves normally and the timeout never fires.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAuth } from "@workspace/replit-auth-web";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Snapshot of the latest hook state, written by the harness on every render.
let latest: { isLoading: boolean; isAuthenticated: boolean } = {
  isLoading: true,
  isAuthenticated: false,
};

function AuthProbe() {
  const { isLoading, isAuthenticated } = useAuth();
  latest = { isLoading, isAuthenticated };
  return null;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(AuthProbe));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  latest = { isLoading: true, isAuthenticated: false };
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useAuth timeout", () => {
  it("resolves to logged-out when the auth probe stalls", async () => {
    // fetch never settles — the classic post-aborted-OAuth hang.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );

    mount();
    expect(latest.isLoading).toBe(true);

    // Advance past the 8s watchdog.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });

    expect(latest.isLoading).toBe(false);
    expect(latest.isAuthenticated).toBe(false);
  });

  it("resolves normally when the probe responds in time", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({ user: { id: "u1" } }),
        }) as unknown as Response,
    );
    vi.stubGlobal("fetch", fetchMock);

    mount();

    // Flush the resolved fetch microtasks (well under the timeout).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(latest.isLoading).toBe(false);
    expect(latest.isAuthenticated).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/user",
      expect.objectContaining({ credentials: "include" }),
    );
  });
});
