import { describe, expect, it } from "vitest";
import { FEATURE_CATALOG, isUsdPaidFeature } from "../lib/plan";

describe("paid service policy", () => {
  it("treats only phone and automation agents as USD-paid feature products", () => {
    expect(isUsdPaidFeature("phone_system")).toBe(true);
    expect(isUsdPaidFeature("claw_bot")).toBe(true);
    expect(isUsdPaidFeature("live_listen")).toBe(false);
  });

  it("prices the paid tiers correctly and includes CALLL HOME in PABLO PRIME", () => {
    expect(FEATURE_CATALOG.phone_system.price).toBe(100);
    expect(FEATURE_CATALOG.claw_bot.price).toBe(200);
    expect(FEATURE_CATALOG.claw_bot.desc).toContain("all CALLL HOME benefits");
  });
});