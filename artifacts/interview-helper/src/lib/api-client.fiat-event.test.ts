// @vitest-environment jsdom
//
// Guards the instant HUD-balance refresh signal. After a successful *mutating*
// request to a money-affecting path, `apiFetch` dispatches FIAT_CHANGED_EVENT on
// `window` so the world HUD "YOU ƒ..." readout (CurrencyTicker) can refetch
// immediately instead of waiting for its 30s fallback poll.
//
// Contract:
//   1. A successful POST/PUT/PATCH/DELETE to a money-affecting path → exactly one
//      FIAT_CHANGED_EVENT.
//   2. A GET (even to a money path) → no event (GETs don't change the balance).
//   3. A mutating request to a NON-money path → no event.
//   4. A mutating money request that fails (response not ok) → no event.
//
// The dispatch is attached as a separate `.then` on the fetch promise, so tests
// await the returned promise and then flush a couple of microtasks to let that
// side-effect chain run.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiFetch, notifyFiatChangedSoon, FIAT_CHANGED_EVENT } from "./api-client";

let fired = 0;
const onFired = () => {
  fired++;
};

function okResponse(ok = true): Response {
  return { ok, status: ok ? 200 : 402 } as Response;
}

// Let the returned promise settle AND the separately-attached dispatch `.then`
// run (it's a microtask chained off the same fetch promise).
async function settle(p: Promise<unknown>) {
  await p.catch(() => {});
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  fired = 0;
  window.addEventListener(FIAT_CHANGED_EVENT, onFired);
});

afterEach(() => {
  window.removeEventListener(FIAT_CHANGED_EVENT, onFired);
  vi.restoreAllMocks();
});

describe("apiFetch FIAT_CHANGED_EVENT dispatch", () => {
  it("fires once after a successful mutating money-affecting request", async () => {
    global.fetch = vi.fn(() => Promise.resolve(okResponse(true)));
    await settle(apiFetch("/api/economy/bank/transfer", { method: "POST" }));
    expect(fired).toBe(1);
  });

  it("fires for the various money-affecting paths (gear, pledge buy, pablo command, payroll)", async () => {
    global.fetch = vi.fn(() => Promise.resolve(okResponse(true)));
    for (const path of [
      "/api/armory/gear/buy",
      "/api/pledge/buy",
      "/api/pablo/command",
      "/api/payroll/run",
      "/api/real-estate/purchase",
    ]) {
      fired = 0;
      await settle(apiFetch(path, { method: "POST" }));
      expect(fired, path).toBe(1);
    }
  });

  it("does NOT fire for a GET to a money path", async () => {
    global.fetch = vi.fn(() => Promise.resolve(okResponse(true)));
    // No method → defaults to GET.
    await settle(apiFetch("/api/economy/bank/accounts"));
    await settle(apiFetch("/api/economy/bank/accounts", { method: "GET" }));
    expect(fired).toBe(0);
  });

  it("does NOT fire for a mutating request to a non-money path", async () => {
    global.fetch = vi.fn(() => Promise.resolve(okResponse(true)));
    await settle(apiFetch("/api/comms/channels/general/send", { method: "POST" }));
    expect(fired).toBe(0);
  });

  it("does NOT fire when the mutating money request fails (not ok)", async () => {
    global.fetch = vi.fn(() => Promise.resolve(okResponse(false)));
    await settle(apiFetch("/api/economy/bank/transfer", { method: "POST" }));
    expect(fired).toBe(0);
  });

  it("does NOT fire when the request rejects", async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error("network")));
    await settle(apiFetch("/api/armory/gear/buy", { method: "POST" }));
    expect(fired).toBe(0);
  });
});

// AI features (Pablo chat, image generation, character portraits) bill through
// the fire-and-forget Pablo-Tax meter, so their ƒ draw commits just AFTER the
// response. For these paths apiFetch fires FIAT_CHANGED_EVENT on a DELAY (via
// notifyFiatChangedSoon) rather than immediately, so the HUD refetch lands after
// the charge has committed instead of racing it.
describe("apiFetch Pablo-Tax delayed FIAT_CHANGED_EVENT dispatch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // The dispatch chains off the fetch promise (a microtask), then schedules a
  // timer. Flush the promise chain with real microtasks, then advance timers.
  async function flushPromises() {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }

  it("fires once, only AFTER the delay, for each AI Pablo-Tax path", async () => {
    global.fetch = vi.fn(() => Promise.resolve(okResponse(true)));
    for (const path of [
      "/api/chat/pablo/message",
      "/api/ai/image",
      "/salaryman/character/portrait",
    ]) {
      fired = 0;
      apiFetch(path, { method: "POST" });
      await flushPromises();
      // Not yet — the timer hasn't elapsed.
      expect(fired, `${path} before delay`).toBe(0);
      await vi.runAllTimersAsync();
      expect(fired, `${path} after delay`).toBe(1);
    }
  });

  it("does NOT fire for a GET to an AI Pablo-Tax path", async () => {
    global.fetch = vi.fn(() => Promise.resolve(okResponse(true)));
    apiFetch("/api/chat/pablo/message");
    await flushPromises();
    await vi.runAllTimersAsync();
    expect(fired).toBe(0);
  });

  it("does NOT fire when the AI request fails (not ok)", async () => {
    global.fetch = vi.fn(() => Promise.resolve(okResponse(false)));
    apiFetch("/api/chat/pablo/message", { method: "POST" });
    await flushPromises();
    await vi.runAllTimersAsync();
    expect(fired).toBe(0);
  });

  it("notifyFiatChangedSoon fires exactly one delayed event", async () => {
    notifyFiatChangedSoon();
    expect(fired).toBe(0);
    await vi.runAllTimersAsync();
    expect(fired).toBe(1);
  });
});
