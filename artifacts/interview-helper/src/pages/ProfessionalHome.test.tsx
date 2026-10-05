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
    const startWorkButton = container.querySelector(".start-work-button");
    expect(startWorkButton).toBeNull();
    const loginLink = container.querySelector(".home-login-link") as HTMLAnchorElement;
    expect(loginLink?.textContent).toBe("LOG IN");
    expect(loginLink?.getAttribute("href")).toContain("/sign-in?returnTo=%2F");

    act(() => root.render(<ProfessionalHome />));
    expect(container.querySelector("#home-start-work-panel")).toBeNull();
  });

  it("shows the start-work panel only after authentication", () => {
    authState.isAuthenticated = true;
    act(() => root.render(<ProfessionalHome />));

    const startWorkButton = container.querySelector(".start-work-button") as HTMLButtonElement;
    expect(startWorkButton).not.toBeNull();
    expect(startWorkButton.textContent).toContain("START WORK");
    expect(container.querySelector(".home-login-link")).toBeNull();

    act(() => startWorkButton.click());
    expect(container.querySelector("#home-start-work-panel")).not.toBeNull();
    expect(container.textContent).toContain("PABLO AI");
    expect(container.textContent).toContain("CHAT");
    expect(container.textContent).toContain("PABLO PRIME AUTOMATION");
    expect(container.textContent).toContain("CALLL HOME");
    expect(container.textContent).toContain("SALARYMAN OS");
  });

  it("shows exactly two feature cards and explains the CRM and CALLL HOME connection", () => {
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

    expect(cards[1].querySelector("h2")?.textContent).toBe("CRM");
    expect(cards[1].textContent).toContain("Your customer records stay under your organization’s control");
    expect(cards[1].textContent).toContain("CALLL HOME connects calls, texts, and follow-up notes");
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