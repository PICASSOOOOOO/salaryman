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

vi.mock("@/hooks/use-plan", () => ({
  usePlan: () => ({ isOwner: false }),
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
  it("shows a compact sign-in link while signed out", () => {
    act(() => root.render(<ProfessionalHome />));

    expect(container.querySelector(".home-start-link")).toBeNull();
    const startWorkButton = container.querySelector(".start-work-button");
    expect(startWorkButton).toBeNull();
    const loginLink = container.querySelector(".home-login-link") as HTMLAnchorElement;
    expect(loginLink?.textContent).toBe("LOG IN");
    expect(loginLink?.getAttribute("href")).toContain("/sign-in?returnTo=%2F");

    expect(document.body.querySelector("#workspace-navigation-menu")).toBeNull();
  });

  it("opens the shared navigation menu from START WORK after authentication", () => {
    authState.isAuthenticated = true;
    act(() => root.render(<ProfessionalHome />));

    const startWorkButton = container.querySelector(".start-work-button") as HTMLButtonElement;
    expect(startWorkButton).not.toBeNull();
    expect(startWorkButton.textContent).toContain("START WORK");
    expect(container.querySelector(".home-login-link")).toBeNull();

    act(() => startWorkButton.click());
    expect(startWorkButton.getAttribute("aria-expanded")).toBe("true");
    expect(startWorkButton.getAttribute("aria-controls")).toBe("workspace-navigation-menu");
    expect(document.body.querySelector("#workspace-navigation-menu")).not.toBeNull();
    expect(document.body.textContent).toContain("PABLO AI");
    expect(document.body.textContent).toContain("CHAT");
    expect(document.body.textContent).toContain("PABLO PRIME AUTOMATION");
    expect(document.body.textContent).toContain("CALLL HOME");
    expect(document.body.textContent).toContain("SALARYMAN OS");
  });

  it("labels the customer card CALLL HOME and keeps its existing action tabs", () => {
    act(() => root.render(<ProfessionalHome />));

    const cards = Array.from(container.querySelectorAll<HTMLElement>(".home-module"));
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector("h2")?.textContent).toBe("PABLO AI");
    expect(cards[0].textContent).toContain("Chat with Pablo for SALARYMAN help");
    expect(cards[0].textContent).toContain("PABLO PRIME runs opt-in business automations separately");
    expect(Array.from(cards[0].querySelectorAll("a")).map(link => link.getAttribute("href"))).toEqual([
      "/pablo",
      "/business/autopilot",
    ]);

    expect(cards[1].querySelector("h2")?.textContent).toBe("CALLL HOME");
    expect(cards[1].textContent).toContain("Your customer records stay under your organization’s control");
    expect(cards[1].textContent).toContain("CALLL HOME connects calls, texts, and follow-up notes");
    expect(Array.from(cards[1].querySelectorAll(".home-module-actions a")).map(link => link.textContent?.trim())).toEqual([
      "Open CRM",
      "CALLL HOME",
    ]);
    expect(Array.from(cards[1].querySelectorAll("a")).map(link => link.getAttribute("href"))).toEqual([
      "/business/contacts",
      "/phone",
    ]);
  });

  it("keeps the authenticated header to one start-work control", () => {
    authState.isAuthenticated = true;
    act(() => root.render(<ProfessionalHome />));

    expect(container.querySelector(".home-start-link")).toBeNull();
    expect(container.querySelector(".start-work-button")).not.toBeNull();
    expect(container.textContent).not.toContain("LOG IN");
  });
});