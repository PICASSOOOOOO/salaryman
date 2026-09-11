// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  APP_HISTORY_DEPTH_KEY,
  APP_HISTORY_SESSION_KEY,
  canGoBackInApp,
  installAppHistoryTracking,
  readAppHistoryDepth,
} from "./app-navigation";

const settleHistory = () => new Promise(resolve => setTimeout(resolve, 25));

describe("browser app history tracking", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("tags push and replace entries so the shared back button can return through app routes", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "test-session" });
    window.history.replaceState(null, "", "/");
    installAppHistoryTracking();

    window.history.pushState(null, "", "/business");
    window.history.pushState(null, "", "/business/calendar");

    expect(window.history.state).toMatchObject({
      [APP_HISTORY_DEPTH_KEY]: 2,
      [APP_HISTORY_SESSION_KEY]: "test-session",
    });
    expect(canGoBackInApp()).toBe(true);

    window.history.replaceState({ tab: "month" }, "", "/business/calendar?tab=month");
    expect(readAppHistoryDepth(window.history.state)).toBe(2);

    window.history.back();
    await settleHistory();
    expect(window.location.pathname).toBe("/business");
    expect(canGoBackInApp()).toBe(true);

    window.history.back();
    await settleHistory();
    expect(window.location.pathname).toBe("/");
    expect(canGoBackInApp()).toBe(false);

    window.history.forward();
    await settleHistory();
    expect(window.location.pathname).toBe("/business");
    expect(canGoBackInApp()).toBe(true);
  });
});