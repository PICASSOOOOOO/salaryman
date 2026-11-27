import { describe, expect, it } from "vitest";
import {
  isCompletedOnboardingRow,
  isOnboardingMutationExempt,
} from "../middlewares/requireOnboarding";

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

  it("allows authenticated workspace preference saves before onboarding", () => {
    expect(isOnboardingMutationExempt("PUT", "/account/workspace")).toBe(true);
    expect(isOnboardingMutationExempt("GET", "/account/workspace")).toBe(false);
    expect(isOnboardingMutationExempt("PUT", "/account/settings")).toBe(false);
    expect(isOnboardingMutationExempt("POST", "/orgs")).toBe(true);
  });
});
