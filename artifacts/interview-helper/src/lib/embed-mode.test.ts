import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// isEmbedMode LATCHES at module scope, so every case re-imports a fresh copy of
// the module via vi.resetModules() to start from an un-latched state. The URL is
// driven through history.replaceState (jsdom keeps window.location.search in
// sync) and the iframe signal is faked by overriding window.top so that
// window.top !== window.self.
async function freshIsEmbedMode() {
  vi.resetModules();
  return (await import("./embed-mode")).isEmbedMode;
}

function setUrl(url: string) {
  window.history.replaceState({}, "", url);
}

beforeEach(() => {
  setUrl("/");
});

describe("isEmbedMode", () => {
  it("is true when ?embed=1 is present", async () => {
    setUrl("/office?embed=1");
    const isEmbedMode = await freshIsEmbedMode();
    expect(isEmbedMode()).toBe(true);
  });

  it("is true when ?chrome=0 is present", async () => {
    setUrl("/office?chrome=0");
    const isEmbedMode = await freshIsEmbedMode();
    expect(isEmbedMode()).toBe(true);
  });

  it("is false on a clean URL with no embed query and not in a frame", async () => {
    setUrl("/office");
    const isEmbedMode = await freshIsEmbedMode();
    expect(isEmbedMode()).toBe(false);
  });

  it("stays latched true after the query is later stripped", async () => {
    setUrl("/office?embed=1");
    const isEmbedMode = await freshIsEmbedMode();
    expect(isEmbedMode()).toBe(true);

    // A mode toggle / funnel redirect rebuilds the URL without ?embed=.
    setUrl("/office");
    expect(isEmbedMode()).toBe(true);
  });

  describe("inside a nested browsing context (iframe)", () => {
    afterEach(() => {
      // Restore the jsdom default where window.top === window.self.
      Object.defineProperty(window, "top", {
        value: window,
        configurable: true,
        writable: true,
      });
    });

    it("is true even on a clean URL when window.top !== window.self", async () => {
      Object.defineProperty(window, "top", {
        value: {},
        configurable: true,
        writable: true,
      });
      expect(window.top !== window.self).toBe(true);

      setUrl("/office");
      const isEmbedMode = await freshIsEmbedMode();
      expect(isEmbedMode()).toBe(true);
    });
  });
});
