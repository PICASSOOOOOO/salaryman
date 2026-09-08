import { describe, expect, it } from "vitest";
import {
  hasOnboardingCompanyName,
  normalizeOnboardingCompanyName,
  shouldFileOnboardingRegistry,
} from "./PabloOnboarding";

describe("onboarding business registration guard", () => {
  it("does not treat an empty business name as a generated company", () => {
    expect(hasOnboardingCompanyName("business", "")).toBe(false);
    expect(normalizeOnboardingCompanyName("")).toBe("");
  });

  it("normalizes a real company name without inventing one", () => {
    expect(hasOnboardingCompanyName("business", "  Minx Works  ")).toBe(true);
    expect(normalizeOnboardingCompanyName("  Minx Works  ")).toBe("MINX WORKS");
  });

  it("allows the unemployed path without a company name", () => {
    expect(hasOnboardingCompanyName("unemployed", "")).toBe(true);
    expect(shouldFileOnboardingRegistry("unemployed")).toBe(false);
  });

  it("files the registry only for the business path", () => {
    expect(shouldFileOnboardingRegistry("business")).toBe(true);
  });
});