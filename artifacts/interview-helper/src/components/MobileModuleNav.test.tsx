// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumeQueuedWorkspaceFeatureOpen,
  WORKSPACE_FEATURE_OPEN_EVENT,
} from "@/lib/workspace-events";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  location: "/workspace",
  navigate: vi.fn(),
}));

vi.mock("wouter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("wouter")>();
  return { ...actual, useLocation: () => [mocks.location, mocks.navigate] };
});
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));
vi.mock("@/hooks/use-notifications", () => ({
  useNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    markRead: vi.fn(),
    dismiss: vi.fn(),
    clearAll: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-feature-label", () => ({
  useFeatureLabel: () => ({ label: "CLASSROOM" }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

import { MobileModuleNav } from "./MobileBottomBar";

describe("minimal global navigation", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.location = "/workspace";
    consumeQueuedWorkspaceFeatureOpen();
    mocks.navigate.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows the SALARYMAN logo, alpha badge, menu, and notification bell", () => {
    act(() => root.render(<MobileModuleNav />));

    expect(container.querySelector(".app-brand-logo")?.getAttribute("src")).toContain("icon-192.png");
    expect(container.querySelector(".app-brand-name")?.textContent).toBe("SALARYMAN");
    expect(container.querySelector('[data-testid="app-brand-home"]')?.getAttribute("href")).toBe("/workspace");
    expect(container.querySelector('[data-testid="app-version-badge"]')?.textContent).toContain("ALPHA");
    expect(container.querySelector('[data-testid="start-work-menu-trigger"]')?.textContent).toContain("START WORK");
    expect(container.querySelector('button[title="Notifications"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="workspace-navigation-menu"]')).toBeNull();
  });

  it("opens the grouped menu and navigates to The Office", () => {
    act(() => root.render(<MobileModuleNav />));
    const startWork = container.querySelector<HTMLButtonElement>('[data-testid="start-work-menu-trigger"]');
    if (!startWork) throw new Error("Missing Start Work navigation link");

    act(() => startWork.click());
    const officeLink = document.body.querySelector<HTMLAnchorElement>('[data-testid="workspace-menu-office"]');
    if (!officeLink) throw new Error("Missing The Office menu link");
    act(() => officeLink.click());

    expect(mocks.navigate).toHaveBeenCalledWith("/workspace");
  });

  it("adds a feature as a widget when selected from the workspace menu", () => {
    act(() => root.render(<MobileModuleNav />));
    const assignedPaths: string[] = [];
    const onAssign = (event: Event) => {
      assignedPaths.push((event as CustomEvent<{ path: string }>).detail.path);
    };
    window.addEventListener(WORKSPACE_FEATURE_OPEN_EVENT, onAssign);

    const startWork = container.querySelector<HTMLButtonElement>('[data-testid="start-work-menu-trigger"]');
    if (!startWork) throw new Error("Missing Start Work menu button");
    act(() => startWork.click());
    const phoneLink = document.body.querySelector<HTMLAnchorElement>('.workspace-menu-link[href="/phone"]');
    if (!phoneLink) throw new Error("Missing CALLL HOME feature link");
    act(() => phoneLink.click());

    window.removeEventListener(WORKSPACE_FEATURE_OPEN_EVENT, onAssign);
    expect(assignedPaths).toEqual(["/phone"]);
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("returns to The Office and queues the selected widget from another feature", () => {
    mocks.location = "/business";
    act(() => root.render(<MobileModuleNav />));

    const startWork = container.querySelector<HTMLButtonElement>('[data-testid="start-work-menu-trigger"]');
    if (!startWork) throw new Error("Missing Start Work menu button");
    act(() => startWork.click());
    const phoneLink = document.body.querySelector<HTMLAnchorElement>('.workspace-menu-link[href="/phone"]');
    if (!phoneLink) throw new Error("Missing CALLL HOME feature link");
    act(() => phoneLink.click());

    expect(mocks.navigate).toHaveBeenCalledWith("/workspace");
    expect(consumeQueuedWorkspaceFeatureOpen()).toBe("/phone");
  });

  it("keeps the established office card and shows seven groups in priority and size order", () => {
    act(() => root.render(<MobileModuleNav />));
    const startWork = container.querySelector<HTMLButtonElement>('[data-testid="start-work-menu-trigger"]');
    if (!startWork) throw new Error("Missing Start Work menu button");
    act(() => startWork.click());

    const officeCard = document.body.querySelector<HTMLAnchorElement>(".workspace-menu-office");
    expect(officeCard?.textContent).toContain("THE OFFICE");
    expect(officeCard?.textContent).toContain("Your tools and shared workspace");
    expect(document.body.querySelector(".workspace-menu-featured")).toBeNull();

    const pabloGroup = document.body.querySelector('[data-testid="workspace-menu-group-pablo-ai"]');
    expect(Array.from(pabloGroup?.querySelectorAll("a") ?? []).map((link) => [
      link.textContent?.trim(),
      link.getAttribute("href"),
    ])).toEqual([
      ["PABLO AI", "/pablo"],
      ["PABLO DECK", "/pablo/deck"],
    ]);

    const groups = Array.from(document.body.querySelectorAll(".workspace-menu-group h3"))
      .map((heading) => heading.textContent);
    expect(groups).toEqual([
      "PABLO AI",
      "PAID FEATURES",
      "RUN YOUR BUSINESS",
      "MAKE & BUILD",
      "ACCOUNT",
      "REACH & GROW",
      "OFFICE",
    ]);
    const creativeGroup = document.body.querySelector('[data-testid="workspace-menu-group-creative"]');
    expect(Array.from(creativeGroup?.querySelectorAll("a") ?? []).map((link) => [
      link.textContent?.trim(),
      link.getAttribute("href"),
    ])).toEqual([
      ["PISE", "/creative/design"],
      ["HEMINGWAY", "/creative/writer"],
      ["1999", "/1999"],
      ["HUMMINGBIRD", "/hummingbird"],
    ]);
    const businessGroup = document.body.querySelector('[data-testid="workspace-menu-group-business"]');
    expect(Array.from(businessGroup?.querySelectorAll("a") ?? []).map((link) => link.getAttribute("href")))
      .toEqual(["/business", "/organizations", "/workspace/calculator", "/workspace/notepad"]);
    const destinations = Array.from(document.body.querySelectorAll(".workspace-navigation-menu a"))
      .map((link) => link.getAttribute("href"));
    expect(new Set(destinations).size).toBe(destinations.length);
  });

  it("opens SALARYMAN OS directly instead of trying to make it a widget", () => {
    act(() => root.render(<MobileModuleNav />));
    const startWork = container.querySelector<HTMLButtonElement>('[data-testid="start-work-menu-trigger"]');
    if (!startWork) throw new Error("Missing Start Work menu button");
    act(() => startWork.click());

    const osLink = document.body.querySelector<HTMLAnchorElement>('[data-testid="workspace-menu-salaryman-os"]');
    if (!osLink) throw new Error("Missing SALARYMAN OS link");
    act(() => osLink.click());

    expect(mocks.navigate).toHaveBeenCalledWith("/desktop");
    expect(consumeQueuedWorkspaceFeatureOpen()).toBeNull();
  });

  it("closes the grouped menu with Escape", () => {
    act(() => root.render(<MobileModuleNav />));
    const startWork = container.querySelector<HTMLButtonElement>('[data-testid="start-work-menu-trigger"]');
    if (!startWork) throw new Error("Missing Start Work menu button");
    act(() => startWork.click());

    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.body.querySelector('[data-testid="workspace-navigation-menu"]')).toBeNull();
    expect(startWork.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(startWork);
  });
});
