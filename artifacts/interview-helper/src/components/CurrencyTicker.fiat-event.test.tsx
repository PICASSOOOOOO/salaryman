// @vitest-environment jsdom
//
// Guards the world HUD "YOU ƒ..." balance's instant refresh. When `showPlayerFiat`
// is on, CurrencyTicker subscribes to FIAT_CHANGED_EVENT and refetches
// `/api/economy/bank/accounts` (debounced) so the readout updates ~immediately
// after a purchase, instead of waiting on the 30s fallback poll.
//
// Contract:
//   1. With showPlayerFiat → the bank-accounts endpoint is fetched on mount.
//   2. A FIAT_CHANGED_EVENT triggers a debounced refetch of bank-accounts.
//   3. A burst of events within the debounce window coalesces into ONE refetch.
//   4. After unmount the listener is removed → a later event triggers no refetch.
//   5. Without showPlayerFiat → bank-accounts is never fetched and events are
//      ignored.
//
// We mock apiFetch and keep the real FIAT_CHANGED_EVENT constant so the dispatch
// path matches production.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const FIAT_EVENT = "salaryman:fiat-changed";

const h = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock("@/lib/api-client", () => ({
  apiFetch: h.apiFetch,
  FIAT_CHANGED_EVENT: "salaryman:fiat-changed",
}));

import { CurrencyTicker } from "./CurrencyTicker";

const marketIndex = {
  btcUsd: 50000,
  multiplier: 1,
  asOf: 0,
  source: "test",
  conversion: { usdToFiat: 2, usdToGoldOz: 0.0005, btcToFiat: 100000, btcToGoldOz: 25 },
};

function bankCalls() {
  return h.apiFetch.mock.calls.filter((c) => String(c[0]).includes("bank/accounts")).length;
}

let root: Root;
let container: HTMLDivElement;

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function render(props: { showPlayerFiat?: boolean } = {}) {
  await act(async () => {
    root.render(<CurrencyTicker compact {...props} />);
  });
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers();
  h.apiFetch.mockReset();
  h.apiFetch.mockImplementation((path: string) => {
    if (path.includes("market-index")) {
      return Promise.resolve({ ok: true, json: async () => marketIndex } as any);
    }
    if (path.includes("bank/accounts")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ accounts: [{ balance: 500, currency: "FIAT" }] }),
      } as any);
    }
    return Promise.resolve({ ok: false, json: async () => ({}) } as any);
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("CurrencyTicker player-fiat refresh", () => {
  it("fetches the bank balance on mount when showPlayerFiat is on", async () => {
    await render({ showPlayerFiat: true });
    expect(bankCalls()).toBe(1);
  });

  it("refetches the balance (debounced) when a FIAT_CHANGED_EVENT fires", async () => {
    await render({ showPlayerFiat: true });
    expect(bankCalls()).toBe(1);

    await act(async () => {
      window.dispatchEvent(new CustomEvent(FIAT_EVENT));
    });
    // Debounced — nothing yet before the 400ms timer elapses.
    expect(bankCalls()).toBe(1);

    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    await flush();
    expect(bankCalls()).toBe(2);
  });

  it("coalesces a burst of events into a single refetch", async () => {
    await render({ showPlayerFiat: true });
    expect(bankCalls()).toBe(1);

    await act(async () => {
      window.dispatchEvent(new CustomEvent(FIAT_EVENT));
      window.dispatchEvent(new CustomEvent(FIAT_EVENT));
      window.dispatchEvent(new CustomEvent(FIAT_EVENT));
    });
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    await flush();
    expect(bankCalls()).toBe(2); // mount + one coalesced refetch
  });

  it("stops listening after unmount (no refetch on a later event)", async () => {
    await render({ showPlayerFiat: true });
    expect(bankCalls()).toBe(1);

    await act(async () => {
      root.unmount();
    });

    await act(async () => {
      window.dispatchEvent(new CustomEvent(FIAT_EVENT));
    });
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    await flush();
    expect(bankCalls()).toBe(1);

    // re-mount an empty tree so afterEach's unmount is a no-op
    root = createRoot(container);
  });

  it("never touches the bank endpoint and ignores events without showPlayerFiat", async () => {
    await render({ showPlayerFiat: false });
    expect(bankCalls()).toBe(0);

    await act(async () => {
      window.dispatchEvent(new CustomEvent(FIAT_EVENT));
    });
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    await flush();
    expect(bankCalls()).toBe(0);
  });
});
