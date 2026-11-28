import { describe, expect, it } from "vitest";
import { isGameOnlyBrowserPath, isGameReleaseLocked } from "./game-release";

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

  it("recognizes game-only browser paths and query variants", () => {
    for (const path of [
      "/armory",
      "/armory/inventory",
      "/business/floor-plans",
      "/cutscene/intro",
      "/desktop",
      "/game/settings",
      "/marketplace",
      "/office",
      "/settings/os",
      "/store/realty?from=office",
      "/tower/floor/66",
      "/vending",
    ]) {
      expect(isGameOnlyBrowserPath(path), path).toBe(true);
    }
    expect(isGameOnlyBrowserPath("/business/marketplace")).toBe(false);
    expect(isGameOnlyBrowserPath("/business/marketplace?tab=inventory")).toBe(false);
    expect(isGameOnlyBrowserPath("/settings")).toBe(false);
  });
});
