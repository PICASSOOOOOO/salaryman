// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const locationState = vi.hoisted(() => ({
  location: "/business/autopilot?cap=workflows",
  navigate: vi.fn(),
}));

vi.mock("wouter", () => ({
  useLocation: () => [locationState.location, locationState.navigate],
}));

import { PabloAutomationNav } from "./PabloAutomationNav";

describe("PABLO PRIME capability navigation", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    locationState.location = "/business/autopilot?cap=workflows";
    locationState.navigate.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows all four capabilities inside one accessible feature navigation", () => {
    act(() => root.render(<PabloAutomationNav />));

    expect(container.querySelector('[aria-label="PABLO PRIME features"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid^="pablo-automation-"]')).toHaveLength(4);
    expect(container.querySelector('[data-testid="pablo-automation-workflows"]')?.getAttribute("aria-current"))
      .toBe("page");
  });

  it("uses the selected in-page capability callback instead of navigating to another feature", () => {
    const onSelect = vi.fn();
    act(() => root.render(<PabloAutomationNav onSelect={onSelect} />));

    const agents = container.querySelector<HTMLButtonElement>('[data-testid="pablo-automation-agents"]');
    if (!agents) throw new Error("Missing AI agents capability button");
    act(() => agents.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(onSelect).toHaveBeenCalledWith("agents");
    expect(locationState.navigate).not.toHaveBeenCalled();
  });
});
