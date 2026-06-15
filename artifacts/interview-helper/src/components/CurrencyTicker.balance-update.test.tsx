// @vitest-environment jsdom
//
// End-to-end guard for the world HUD "YOU ƒ..." balance updating ON SCREEN after
// an AI (Pablo-Tax) charge. The sibling CurrencyTicker.fiat-event.test.tsx mocks
// `@/lib/api-client` and only asserts the bank endpoint is *refetched*. The
// api-client.fiat-event.test.ts only asserts the delayed event *fires*. Neither
// proves the full loop renders the new number. This test wires the REAL pieces
// together (real api-client, real CurrencyTicker) and mocks only the network
// `fetch`, then asserts the displayed balance actually changes:
//
//   apiFetch(POST /chat/pablo/message)   ← AI call (Pablo-Tax, fire-and-forget)
//     → notifyFiatChangedSoon (1500ms)   ← waits for the async ƒ draw to commit
//       → FIAT_CHANGED_EVENT
//         → CurrencyTicker listener (400ms debounce)
//           → GET /economy/bank/accounts ← now returns the post-charge balance
//             → re-render "YOU ƒ<new>"
//
// We drive everything with fake timers so the ~1500ms delay + 400ms debounce are
// advanced deterministically, and read the rendered DOM text to confirm the
// readout flips from the pre-charge to the post-charge value.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Real api-client (so the Pablo-Tax delayed dispatch runs for real) + real
// CurrencyTicker (so its event listener + debounced refetch run for real).
import { apiFetch } from "@/lib/api-client";
import { CurrencyTicker } from "./CurrencyTicker";

const marketIndex = {
  btcUsd: 50000,
  multiplier: 1,
  asOf: 0,
  source: "test",
  conversion: { usdToFiat: 2, usdToGoldOz: 0.0005, btcToFiat: 100000, btcToGoldOz: 25 },
};

// Mutable bank balance the mocked GET /economy/bank/accounts reflects. The AI
// flow "charges" the player by lowering this between the mount fetch and the
// post-event refetch.
let bankBalance = 500;

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

let root: Root;
let container: HTMLDivElement;

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function youText(): string {
  // The "YOU ƒ..." segment is the sky-colored span in compact mode.
  return container.textContent ?? "";
}

beforeEach(() => {
  vi.useFakeTimers();
  bankBalance = 500;
  global.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("market-index")) return Promise.resolve(jsonResponse(marketIndex));
    if (url.includes("bank/accounts")) {
      return Promise.resolve(jsonResponse({ accounts: [{ balance: bankBalance, currency: "FIAT" }] }));
    }
    // AI Pablo-Tax call (POST /chat/pablo/message) — the body is irrelevant; the
    // ƒ draw is server-side fire-and-forget, so we just resolve OK.
    return Promise.resolve(jsonResponse({}));
  }) as unknown as typeof fetch;

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
  vi.restoreAllMocks();
});

describe("CurrencyTicker on-screen balance update after AI usage", () => {
  it("re-renders the post-charge balance after the Pablo-Tax delay + debounce", async () => {
    // Mount with the player-fiat readout enabled (the world HUD usage).
    await act(async () => {
      root.render(<CurrencyTicker compact showPlayerFiat />);
    });
    await flush();

    // Pre-charge: the HUD shows the mount-time balance.
    expect(youText()).toContain("YOU ƒ500");

    // --- Simulate the AI flow: a successful Pablo-Tax-billed request. ---
    // Use the REAL apiFetch so its PABLO_TAX_AFFECTING branch schedules the
    // delayed FIAT_CHANGED_EVENT exactly as production does.
    await act(async () => {
      apiFetch("/api/chat/pablo/message", { method: "POST" });
    });
    // Let the fetch promise (and the .then that schedules notifyFiatChangedSoon)
    // settle so the 1500ms timer is actually registered.
    await flush();

    // The async ƒ draw has now committed server-side — reflect it in the bank.
    bankBalance = 480;

    // Before the delay elapses the HUD must still show the old value (the
    // refresh is intentionally deferred to avoid racing the fire-and-forget draw).
    expect(youText()).toContain("YOU ƒ500");

    // Advance past the ~1500ms Pablo-Tax delay → FIAT_CHANGED_EVENT fires and
    // the listener schedules its 400ms debounced refetch.
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    await flush();
    // Still old — the debounce window hasn't elapsed yet.
    expect(youText()).toContain("YOU ƒ500");

    // Advance past the 400ms debounce → the bank is refetched and the readout
    // re-renders the new number.
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    await flush();

    expect(youText()).toContain("YOU ƒ480");
    expect(youText()).not.toContain("YOU ƒ500");
  });
});
