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

describe("ProfessionalHome entry actions", () => {
  it("sends logged-out visitors through sign-in and highlights automation", () => {
    act(() => root.render(<ProfessionalHome />));

    const links = Array.from(container.querySelectorAll("a"));
    const login = links.find(link => link.textContent?.trim() === "LOG IN");
    const automation = links.find(link => link.textContent?.includes("PIXEL AGENT AUTOMATION"));

    expect(login?.getAttribute("href")).toContain("/sign-in?returnTo=%2Fbusiness");
    expect(automation?.getAttribute("href")).toContain("/business/autopilot");
    expect(automation?.className).toContain("home-module--automation");
  });

  it("turns LOG IN into START WORK after authentication", () => {
    authState.isAuthenticated = true;
    act(() => root.render(<ProfessionalHome />));

    const links = Array.from(container.querySelectorAll("a"));
    const startWork = links.find(link => link.textContent?.trim() === "START WORK");

    expect(startWork?.getAttribute("href")).toContain("/business");
    expect(container.textContent).not.toContain("LOG IN");
  });
});