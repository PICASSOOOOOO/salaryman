// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@workspace/replit-auth-web", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    user: { firstName: "Direct", lastName: "Arrival" },
  }),
}));
vi.mock("wouter", () => ({ useLocation: () => ["/immigration", vi.fn()] }));
vi.mock("@/lib/tutorial-progress", () => ({
  isTutorialDone: () => false,
  markTutorialDone: vi.fn(),
  getSalarymanName: () => null,
  setSalarymanOfficeTier: vi.fn(),
}));
vi.mock("@/lib/onboarding-sync", () => ({ useOnboardingResolved: () => true }));
vi.mock("@/lib/onboarding-score", () => ({ ensureOnboardingScore: vi.fn() }));
vi.mock("@/components/PabloOnboarding", () => ({
  PabloOnboarding: () => <div data-testid="immigration-intake" />,
}));
vi.mock("@/components/PostOnboardingIntro", () => ({ PostOnboardingIntro: () => null }));
vi.mock("@/components/PabloNebula3D", () => ({ PabloNebula3D: () => null }));
vi.mock("@/components/EconomyKey", () => ({ EconomyKey: () => null }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/lib/world-servers", () => ({ getCityById: () => null }));
vi.mock("@/lib/art", () => ({ useArtAsset: () => null }));

import Immigration from "./Immigration";

describe("Immigration", () => {
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
});