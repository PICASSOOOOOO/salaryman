import { describe, expect, it } from "vitest";
import { REQUIRED_ONBOARDING_STEPS } from "./PabloOnboarding";

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
});