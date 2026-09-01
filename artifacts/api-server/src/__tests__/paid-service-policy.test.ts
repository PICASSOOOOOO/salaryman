import { describe, expect, it } from "vitest";
import { FEATURE_CATALOG, isUsdPaidFeature } from "../lib/plan";

describe("paid service policy", () => {
  it("treats only phone and automation agents as USD-paid feature products", () => {
    expect(isUsdPaidFeature("phone_system")).toBe(true);
    expect(isUsdPaidFeature("claw_bot")).toBe(true);
    expect(isUsdPaidFeature("live_listen")).toBe(false);
  });

  it("keeps phone and automation as separately priced subscriptions", () => {
    expect(FEATURE_CATALOG.phone_system.price).toBe(95);
    expect(FEATURE_CATALOG.claw_bot.price).toBe(149);
    expect(FEATURE_CATALOG.claw_bot.desc).toContain("Phone service is separate");
  });
});