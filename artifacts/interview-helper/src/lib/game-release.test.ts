import { describe, expect, it } from "vitest";
import { isGameReleaseLocked } from "./game-release";

describe("production game release gate", () => {
  it("keeps local and PTU builds playable", () => {
    expect(isGameReleaseLocked({ production: false })).toBe(false);
    expect(isGameReleaseLocked({ production: true, releaseChannel: "ptu" })).toBe(false);
  });

  it("locks production until the game trailer is ready", () => {
    expect(isGameReleaseLocked({ production: true })).toBe(true);
    expect(isGameReleaseLocked({ production: true, trailerReady: "false" })).toBe(true);
    expect(isGameReleaseLocked({ production: true, trailerReady: "true" })).toBe(false);
  });
});
