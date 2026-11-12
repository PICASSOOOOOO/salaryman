import { describe, expect, it } from "vitest";
import { isCompletedOnboardingRow } from "../middlewares/requireOnboarding";

describe("browser onboarding completion signal", () => {
  it("accepts a completed browser intake with valid contact details", () => {
    expect(isCompletedOnboardingRow({
      businessType: "unemployed",
      contactEmail: "user@example.com",
      meta: { source: "browser_onboarding", contactPhone: "+15551234567" },
    })).toBe(true);
  });

  it("does not treat an unrelated world registry row as browser onboarding", () => {
    expect(isCompletedOnboardingRow({
      businessType: "real",
      contactEmail: "user@example.com",
      meta: { source: null },
    })).toBe(false);
    expect(isCompletedOnboardingRow({
      businessType: "unemployed",
      contactEmail: "user@example.com",
      meta: { source: "browser_onboarding", contactPhone: "no number" },
    })).toBe(false);
  });
});
