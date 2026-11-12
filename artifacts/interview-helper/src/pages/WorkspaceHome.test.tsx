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
  WorkspaceMenuOverlay: ({
    open,
    onNavigate,
  }: {
    open: boolean;
    onNavigate: (path: string) => void;
  }) => open ? (
    <div data-testid="workspace-menu-mock">
      <button type="button" data-testid="select-calll-home" onClick={() => onNavigate("/phone")}>
        CALLL HOME
      </button>
      <button type="button" data-testid="select-prime-automation" onClick={() => onNavigate("/business/autopilot")}>
        PABLO PRIME automation
      </button>
    </div>
  ) : null,
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

  it("loads nine features, replaces a widget, and swaps widget positions", () => {
    act(() => root.render(<WorkspaceHome />));

    const paths = [
      "/pablo",
      "/workspace/notepad",
      "/workspace/calculator",
      "/business/crm",
      "/business/autopilot",
      "/comms",
      "/creative/classroom",
      "/1999",
      "/creative/media",
    ];
    for (const path of paths) {
      act(() => {
        window.dispatchEvent(
          new CustomEvent(WORKSPACE_FEATURE_ASSIGN_EVENT, { detail: { path } }),
        );
      });
    }

    const framePath = (slot: number) => {
      const frame = container.querySelector<HTMLIFrameElement>(
        `[data-testid="widget-frame-${slot}"]`,
      );
      if (!frame) throw new Error(`missing widget frame ${slot}`);
      return new URL(frame.getAttribute("src")!, window.location.origin).pathname;
    };

    expect(container.querySelectorAll(".workspace-slot")).toHaveLength(9);
    expect(container.querySelectorAll("iframe")).toHaveLength(9);
    paths.forEach((path, index) => expect(framePath(index + 1)).toBe(path));

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="change-feature-5"]')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="select-calll-home"]')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(framePath(5)).toBe("/phone");

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="change-feature-5"]')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="select-prime-automation"]')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(framePath(5)).toBe("/business/autopilot");

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="move-slot-right-1"]')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(framePath(1)).toBe(paths[1]);
    expect(framePath(2)).toBe(paths[0]);
    const saved = JSON.parse(
      window.localStorage.getItem("salaryman-workspace-slots:workspace-test-user")!,
    );
    expect(saved).toEqual({
      version: 2,
      slots: [paths[1], paths[0], ...paths.slice(2)],
    });

    const reloadContainer = document.createElement("div");
    document.body.appendChild(reloadContainer);
    const reloadRoot = createRoot(reloadContainer);
    act(() => reloadRoot.render(<WorkspaceHome />));
    expect(reloadContainer.querySelectorAll(".workspace-slot")).toHaveLength(9);
    const reloadedFrame = reloadContainer.querySelector<HTMLIFrameElement>(
      '[data-testid="widget-frame-5"]',
    )!;
    expect(new URL(reloadedFrame.getAttribute("src")!, window.location.origin).pathname)
      .toBe(paths[4]);
    act(() => reloadRoot.unmount());
    reloadContainer.remove();
  });

  it("migrates the shipped unversioned nine-widget layout to a blank canvas", () => {
    const legacyLayout = [
      "/pablo",
      "/workspace/notepad",
      "/workspace/calculator",
      "/business/crm",
      "/business/autopilot",
      "/comms",
      "/creative/classroom",
      "/1999",
      "/creative/media",
    ];
    window.localStorage.setItem(
      "salaryman-workspace-slots:workspace-test-user",
      JSON.stringify(legacyLayout),
    );

    act(() => root.render(<WorkspaceHome />));

    expect(container.querySelectorAll(".workspace-slot")).toHaveLength(1);
    expect(container.querySelector("iframe")).toBeNull();
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
