import { afterEach, describe, expect, it, vi } from "vitest";
import { trackEvent } from "./analytics";

afterEach(() => {
  delete window.umami;
  vi.restoreAllMocks();
});

describe("trackEvent", () => {
  it("forwards named events and safe dimensions to the injected tracker", () => {
    const track = vi.fn();
    window.umami = { track };

    trackEvent("onboarding_completed", { work_path: "business" });

    expect(track).toHaveBeenCalledWith("onboarding_completed", { work_path: "business" });
  });

  it("does nothing when the published-site tracker is unavailable", () => {
    expect(() => trackEvent("desktop_download_started", { platform: "linux" })).not.toThrow();
  });

  it("does not let tracker errors interrupt the app", () => {
    window.umami = { track: () => { throw new Error("tracker unavailable"); } };

    expect(() => trackEvent("pablo_message_replied", { surface: "terminal" })).not.toThrow();
  });
});