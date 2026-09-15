// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const authState = vi.hoisted(() => ({
  isAuthenticated: false,
  isLoading: false,
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => authState,
}));

import ProfessionalHome from "./ProfessionalHome";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  authState.isAuthenticated = false;
  authState.isLoading = false;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("ProfessionalHome header", () => {
  it("keeps the header compact and puts sign-in inside the menu", () => {
    act(() => root.render(<ProfessionalHome />));

    expect(container.querySelector(".home-start-link")).toBeNull();
    const menuButton = container.querySelector(".home-menu-button") as HTMLButtonElement;
    expect(menuButton).not.toBeNull();

    act(() => menuButton.click());
    const links = Array.from(container.querySelectorAll("a"));
    const login = links.find(link => link.textContent?.trim() === "LOG IN");
    const agents = container.querySelector(".home-module--pixel-agents") as HTMLAnchorElement | null;

    expect(login?.getAttribute("href")).toContain("/sign-in?returnTo=%2Fbusiness");
    expect(agents?.getAttribute("href")).toContain("/business/autopilot");
    expect(agents?.className).toContain("home-module--pixel-agents");
    expect(agents?.textContent).toContain("PIXEL AGENTS");
    expect(agents?.textContent).not.toContain("AUTOMATION");
  });

  it("keeps the authenticated header to one menu control", () => {
    authState.isAuthenticated = true;
    act(() => root.render(<ProfessionalHome />));

    expect(container.querySelector(".home-start-link")).toBeNull();
    expect(container.querySelector(".home-menu-button")).not.toBeNull();
    expect(container.textContent).not.toContain("LOG IN");
  });
});