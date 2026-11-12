import { afterEach, describe, expect, it, vi } from "vitest";
import { isFreeFeatureTesterEmail, isOwnerEmailAddress } from "./free-feature-access";

describe("feature-only tester access", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("matches normalized addresses from a comma-separated allowlist", () => {
    expect(isFreeFeatureTesterEmail(" Tester@Example.com ", "one@example.test, tester@example.com")).toBe(true);
    expect(isFreeFeatureTesterEmail("someone@example.com", "one@example.test, tester@example.com")).toBe(false);
    expect(isFreeFeatureTesterEmail(" ", "tester@example.com")).toBe(false);
  });

  it("does not let a feature-only tester inherit owner privileges", () => {
    expect(isOwnerEmailAddress(
      "TESTER@example.com",
      ["owner@example.com", "tester@example.com"],
      "tester@example.com",
    )).toBe(false);
    expect(isOwnerEmailAddress("owner@example.com", ["owner@example.com"], "tester@example.com")).toBe(true);
  });

  it("reads the feature tester allowlist at runtime", () => {
    vi.stubEnv("SALARYMAN_FREE_FEATURE_EMAILS", "tester@example.com");
    expect(isFreeFeatureTesterEmail("tester@example.com")).toBe(true);
  });
});
