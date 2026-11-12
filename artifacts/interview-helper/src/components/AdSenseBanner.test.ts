import { describe, expect, it } from "vitest";
import { isAdEligiblePath, shouldReloadToKeepPabloAdFree } from "./AdSenseBanner";

describe("AdSense route boundaries", () => {
  it("keeps Pablo's nebula and its subroutes ad-free", () => {
    expect(isAdEligiblePath("/pablo")).toBe(false);
    expect(isAdEligiblePath("/pablo/deck")).toBe(false);
    expect(isAdEligiblePath("/pablo/promo")).toBe(false);
  });

  it("keeps the existing public content pages eligible", () => {
    expect(isAdEligiblePath("/")).toBe(true);
    expect(isAdEligiblePath("/desktop")).toBe(true);
    expect(isAdEligiblePath("/legal/privacy")).toBe(true);
    expect(isAdEligiblePath("/comms")).toBe(false);
  });

  it("reloads into a clean document if the ad library was already loaded", () => {
    expect(shouldReloadToKeepPabloAdFree("/pablo", true)).toBe(true);
    expect(shouldReloadToKeepPabloAdFree("/pablo", false)).toBe(false);
    expect(shouldReloadToKeepPabloAdFree("/", true)).toBe(false);
  });
});