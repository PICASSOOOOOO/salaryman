import { describe, expect, it } from "vitest";
import { requiresAppSignIn } from "./app-route-access";

describe("application route sign-in boundary", () => {
  it("keeps account entry and public information available", () => {
    for (const path of ["/", "/sign-in", "/sign-up", "/pricing", "/alpha", "/legal/privacy", "/sms-opt-in", "/sms-opt-in?source=terms"]) {
      expect(requiresAppSignIn(path)).toBe(false);
    }
  });

  it("requires sign-in for feature routes and account onboarding", () => {
    for (const path of [
      "/workspace",
      "/business/autopilot",
      "/phone",
      "/onboarding",
      "/settings",
      "/desktop",
      "/download",
    ]) {
      expect(requiresAppSignIn(path)).toBe(true);
    }
  });
});
