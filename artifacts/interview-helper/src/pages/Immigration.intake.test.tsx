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
const isTutorialDone = vi.fn(() => false);
vi.mock("wouter", () => ({ useLocation: () => ["/immigration", navigate] }));
vi.mock("@/lib/tutorial-progress", () => ({
  isTutorialDone: () => isTutorialDone(),
  markTutorialDone: vi.fn(),
  getSalarymanName: () => null,
  setSalarymanOfficeTier: vi.fn(),
}));
vi.mock("@/lib/onboarding-sync", () => ({ useOnboardingResolved: () => true }));
vi.mock("@/components/QuickOnboarding", () => ({
  QuickOnboarding: () => <div data-testid="immigration-intake" />,
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

import Immigration, { getPostOnboardingDestination } from "./Immigration";

describe("Immigration", () => {
  beforeEach(() => {
    navigate.mockReset();
    isTutorialDone.mockReturnValue(false);
    window.history.replaceState({}, "", "/immigration");
  });

  it("opens the registry intake immediately for a new authenticated arrival", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Immigration />);
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="immigration-intake"]')).not.toBeNull();
    root.unmount();
    container.remove();
  });

  it("defaults a completed intake handoff to office", () => {
    expect(getPostOnboardingDestination("")).toBe("/office");
    expect(getPostOnboardingDestination("?returnTo=/immigration")).toBe("/office");
  });

  it("preserves a safe sign-in destination while rejecting unsafe ones", () => {
    expect(getPostOnboardingDestination("?returnTo=%2Fdashboard%3Ftab%3Dtoday")).toBe("/dashboard?tab=today");
    expect(getPostOnboardingDestination("?returnTo=https%3A%2F%2Fevil.example")).toBe("/office");
  });

  it("continues to skip intake for a returning onboarded user", async () => {
    isTutorialDone.mockReturnValue(true);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Immigration />);
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="immigration-intake"]')).toBeNull();
    expect(navigate).toHaveBeenCalledWith("/", { replace: true });
    root.unmount();
    container.remove();
  });
});