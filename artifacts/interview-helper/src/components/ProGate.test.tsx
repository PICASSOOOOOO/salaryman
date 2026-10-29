// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { PaidAccessNotice, ProGate } from "./ProGate";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  fetch: vi.fn(),
  plan: { isPro: false, isOwner: false, features: new Set<string>(), trials: [], loading: false, loadError: false },
}));
vi.mock("wouter", () => ({ useLocation: () => ["/phone", mocks.navigate] }));
vi.mock("@/hooks/use-plan", () => ({ usePlan: () => mocks.plan, invalidatePlanCache: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetch: mocks.fetch }));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.navigate.mockReset();
  mocks.fetch.mockReset().mockResolvedValue({
    ok: true,
    json: async () => ({ items: [{ subscriptionFeature: "phone_system", priceUsd: 100 }] }),
  });
  Object.assign(mocks.plan, { isOwner: false, loading: false, loadError: false });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("paid access gates", () => {
  it("keeps the locked view on the feature page and shows the catalog price", async () => {
    await act(async () => root.render(<ProGate feature="CALLL HOME" featureKey="phone_system"><div>Protected content</div></ProGate>));
    expect(container.textContent).toContain("USD $100.00 / month");
    expect(container.textContent).not.toContain("Protected content");
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.fetch).toHaveBeenCalledWith("/api/pledge/catalog");
  });
  it("previews without fetching, charging, or granting access", async () => {
    mocks.plan.isOwner = true;
    await act(async () => root.render(<PaidAccessNotice feature="CALLL HOME" priceUsd={100} preview />));
    expect(container.textContent).toContain("Preview only");
    expect(container.textContent).not.toContain("View pricing");
    expect(mocks.fetch).not.toHaveBeenCalled();
    act(() => container.querySelector("button")!.click());
    expect(mocks.navigate).toHaveBeenCalledWith("/");
  });
  it("preserves owner access and never fetches pricing for an unlocked feature", async () => {
    mocks.plan.isOwner = true;
    await act(async () => root.render(<ProGate featureKey="phone_system">Protected content</ProGate>));
    expect(container.textContent).toBe("Protected content");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("does not invent a price if the catalog fails", async () => {
    mocks.fetch.mockRejectedValue(new Error("offline"));
    await act(async () => root.render(<ProGate featureKey="phone_system">Protected content</ProGate>));
    expect(container.textContent).toContain("View current pricing");
    expect(container.textContent).not.toContain("$");
    expect(container.textContent).not.toContain("Protected content");
  });
  it("does not show a sales gate when the access check fails", async () => {
    mocks.plan.loadError = true;
    await act(async () => root.render(<ProGate featureKey="phone_system">Protected content</ProGate>));
    expect(container.textContent).toContain("Retry access check");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
