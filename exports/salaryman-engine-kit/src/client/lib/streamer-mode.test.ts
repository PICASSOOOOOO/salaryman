import { describe, it, expect, beforeEach } from "vitest";
import { isStreamerMode, maskWhenStreaming, STREAMER_MASK } from "./streamer-mode";

const STORE_KEY = "sm_game_settings_v1";

describe("streamer mode flag", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("is off when no settings blob exists", () => {
    expect(isStreamerMode()).toBe(false);
  });

  it("is off when the blob omits or disables the flag", () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ obsHost: "localhost" }));
    expect(isStreamerMode()).toBe(false);
    localStorage.setItem(STORE_KEY, JSON.stringify({ streamerMode: false }));
    expect(isStreamerMode()).toBe(false);
  });

  it("is on only when streamerMode === true", () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ streamerMode: true }));
    expect(isStreamerMode()).toBe(true);
  });

  it("treats a truthy-but-not-true value as off", () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ streamerMode: "yes" }));
    expect(isStreamerMode()).toBe(false);
  });

  it("survives a corrupt blob without throwing", () => {
    localStorage.setItem(STORE_KEY, "{not json");
    expect(isStreamerMode()).toBe(false);
  });
});

describe("maskWhenStreaming", () => {
  it("returns the mask when streaming and the real value otherwise", () => {
    expect(maskWhenStreaming("user@example.com", true)).toBe(STREAMER_MASK);
    expect(maskWhenStreaming("user@example.com", false)).toBe("user@example.com");
  });
});
