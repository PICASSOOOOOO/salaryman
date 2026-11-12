import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ isMobile: false }));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "workspace-test-user" }, logout: vi.fn() }),
}));

vi.mock("@/hooks/use-plan", () => ({
  usePlan: () => ({ isOwner: false }),
}));

vi.mock("@/components/WorkspaceMenuOverlay", () => ({
  WorkspaceMenuOverlay: () => null,
}));

import WorkspaceHome from "./WorkspaceHome";
import { WORKSPACE_FEATURE_ASSIGN_EVENT } from "@/lib/workspace-events";

describe("The Office workspace", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn((media: string) => ({
        matches: state.isMobile,
        media,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    state.isMobile = false;
  });

  it("starts with one blank widget and supports up to nine", () => {
    act(() => root.render(<WorkspaceHome />));

    expect(container.querySelectorAll(".workspace-slot")).toHaveLength(1);
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.textContent).toContain("THE OFFICE");

    const addButton = container.querySelector<HTMLButtonElement>('[data-testid="add-workspace-widget"]')!;
    act(() => {
      for (let index = 0; index < 8; index += 1) {
        addButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }
    });

    expect(container.querySelectorAll(".workspace-slot")).toHaveLength(9);
    expect(addButton.disabled).toBe(true);
  });

  it("loads selected features into widgets and shows only one feature on mobile", () => {
    state.isMobile = true;
    act(() => root.render(<WorkspaceHome />));

    act(() => {
      window.dispatchEvent(
        new CustomEvent(WORKSPACE_FEATURE_ASSIGN_EVENT, { detail: { path: "/comms" } }),
      );
    });
    act(() => {
      window.dispatchEvent(
        new CustomEvent(WORKSPACE_FEATURE_ASSIGN_EVENT, { detail: { path: "/workspace/notepad" } }),
      );
    });

    const frames = container.querySelectorAll<HTMLIFrameElement>("iframe");
    expect(frames).toHaveLength(1);
    expect(frames[0].getAttribute("src")).toContain("workspace/notepad");
    expect(container.querySelectorAll(".workspace-slot")).toHaveLength(2);
  });
});
