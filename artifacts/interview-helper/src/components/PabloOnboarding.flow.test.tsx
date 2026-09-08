import { describe, expect, it } from "vitest";
import {
  getInitialOnboardingBizPath,
  LOBBY_ONBOARDING_COPY,
  REQUIRED_ONBOARDING_STEPS,
} from "./PabloOnboarding";

describe("first-run onboarding flow", () => {
  it("blocks only on city, identity, and work path", () => {
    expect(REQUIRED_ONBOARDING_STEPS).toEqual([
      "destination",
      "identity",
      "business",
    ]);
  });

  it("does not restore retired ceremony steps", () => {
    expect(REQUIRED_ONBOARDING_STEPS).not.toContain("greet");
    expect(REQUIRED_ONBOARDING_STEPS).not.toContain("estate");
    expect(REQUIRED_ONBOARDING_STEPS).not.toContain("done");
  });

  it("opens the business form for a new Tower arrival", () => {
    expect(getInitialOnboardingBizPath("lobby", null)).toBe("business");
    expect(getInitialOnboardingBizPath("lobby", "unemployed")).toBe("business");
  });

  it("keeps the saved path in the full onboarding flow", () => {
    expect(getInitialOnboardingBizPath("registry", "unemployed")).toBe("unemployed");
    expect(getInitialOnboardingBizPath("registry", null)).toBe("");
  });

  it("keeps the Tower check-in copy compact and unbranded", () => {
    expect(LOBBY_ONBOARDING_COPY).toEqual({
      heading: "Choose a start.",
      helper: "One choice. Change it later.",
      business: "BUILD A BUSINESS",
      unemployed: "FIND WORK",
      companyLabel: "COMPANY NAME",
    });
    expect(Object.values(LOBBY_ONBOARDING_COPY).join(" ")).not.toMatch(/PABLO|CORP/i);
  });
});