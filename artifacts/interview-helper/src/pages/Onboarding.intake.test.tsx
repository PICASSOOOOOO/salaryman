// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    user: { firstName: "Direct", lastName: "Arrival" },
  }),
}));
const navigate = vi.fn();
const apiFetch = vi.fn();
vi.mock("wouter", () => ({ useLocation: () => ["/onboarding", navigate] }));
vi.mock("@/lib/api-client", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
vi.mock("@/lib/tutorial-progress", () => ({
  markTutorialDone: vi.fn(),
  getSalarymanName: () => null,
  setSalarymanOfficeTier: vi.fn(),
}));
vi.mock("@/components/QuickOnboarding", () => ({
  QuickOnboarding: () => <div data-testid="onboarding-intake" />,
}));
vi.mock("@/components/PostOnboardingIntro", () => ({ PostOnboardingIntro: () => null }));
vi.mock("@/components/PabloNebula3D", () => ({ PabloNebula3D: () => null }));
vi.mock("@/components/EconomyKey", () => ({ EconomyKey: () => null }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/lib/world-servers", () => ({
  getCityById: () => null,
  getOperationalCities: () => [],
  getLocalTimezone: () => "Asia/Saigon",
  resolveHomeCity: () => null,
}));
vi.mock("@/lib/art", () => ({ useArtAsset: () => null }));

import Onboarding, { getPostOnboardingDestination } from "./Onboarding";

describe("Onboarding", () => {
  beforeEach(() => {
    navigate.mockReset();
    apiFetch.mockReset();
    localStorage.clear();
    apiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ completed: false }),
    });
    window.history.replaceState({}, "", "/onboarding");
  });

  it("opens intake when the server says the account is new, even with a stale local flag", async () => {
    localStorage.setItem("salaryman_tutorial_done", "1");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Onboarding />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.querySelector('[data-testid="onboarding-intake"]')).not.toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    expect(localStorage.getItem("salaryman_tutorial_done")).toBe("1");
    root.unmount();
    container.remove();
  });

  it("returns a newly onboarded user to The Office by default", () => {
    expect(getPostOnboardingDestination("")).toBe("/workspace");
    expect(getPostOnboardingDestination("?returnTo=/onboarding")).toBe("/workspace");
  });

  it("preserves a safe sign-in destination while rejecting unsafe ones", () => {
    expect(getPostOnboardingDestination("?returnTo=%2Fdashboard%3Ftab%3Dtoday")).toBe("/dashboard?tab=today");
    expect(getPostOnboardingDestination("?returnTo=https%3A%2F%2Fevil.example")).toBe("/workspace");
  });

  it("returns an already-onboarded user to the requested feature", async () => {
    apiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ completed: true }),
    });
    window.history.replaceState({}, "", "/onboarding?returnTo=%2Fbusiness%2Fautopilot");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Onboarding />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.querySelector('[data-testid="onboarding-intake"]')).toBeNull();
    expect(navigate).toHaveBeenCalledWith("/business/autopilot", { replace: true });
    root.unmount();
    container.remove();
  });
});