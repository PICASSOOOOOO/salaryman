import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  isMobile: false,
  isLoading: false,
  isAuthenticated: false,
  isAdmin: false,
  isApprovedDev: false,
  isApprovedTester: false,
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: "workspace-test-user" },
    isAuthenticated: state.isAuthenticated,
    isLoading: state.isLoading,
    logout: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-alpha", () => ({
  useAlpha: () => ({
    isAdmin: state.isAdmin,
    isApprovedDev: state.isApprovedDev,
    isApprovedTester: state.isApprovedTester,
  }),
}));

import WorkspaceHome from "./WorkspaceHome";
import {
  consumeQueuedWorkspaceFeatureOpen,
  queueWorkspaceFeatureOpen,
  WORKSPACE_FEATURE_ASSIGN_EVENT,
} from "@/lib/workspace-events";
import { WORKSPACE_STARTER_PATHS } from "@/lib/workspace-widget-catalog";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("The Office workspace", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.localStorage.clear();
    consumeQueuedWorkspaceFeatureOpen();
    state.isLoading = false;
    state.isAuthenticated = false;
    state.isAdmin = false;
    state.isApprovedDev = false;
    state.isApprovedTester = false;
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
    vi.unstubAllGlobals();
  });

  it("starts with a useful layout and supports up to nine widgets", () => {
    act(() => root.render(<WorkspaceHome />));

    expect(container.querySelectorAll(".workspace-slot")).toHaveLength(WORKSPACE_STARTER_PATHS.length);
    expect(container.querySelector('[data-testid="workspace-home"]')).not.toBeNull();

    const addButton = container.querySelector<HTMLButtonElement>('[data-testid="add-workspace-feature"]')!;
    for (let index = WORKSPACE_STARTER_PATHS.length; index < 9; index += 1) {
      act(() => addButton.dispatchEvent(new MouseEvent("click", { bubbles: true })));
      act(() => container.querySelector<HTMLButtonElement>('[data-testid="workspace-feature-option-pablo-main"]')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true })));
    }

    expect(container.querySelectorAll(".workspace-slot")).toHaveLength(9);
    expect(addButton.disabled).toBe(true);
  });

  it("loads nine features, replaces a widget, and swaps widget positions", () => {
    window.localStorage.setItem(
      "salaryman-workspace-slots:workspace-test-user",
      JSON.stringify({ version: 2, slots: [null] }),
    );
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
    expect(container.querySelector(".workspace-grid")?.getAttribute("style"))
      .toContain("repeat(3, minmax(24rem, 1fr))");
    paths.forEach((path, index) => expect(framePath(index + 1)).toBe(path));

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="change-feature-5"]')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="workspace-feature-option-phone-main"]')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(framePath(5)).toBe("/phone");

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="change-feature-5"]')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="workspace-feature-option-bots-main"]')!
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

  it("migrates the old unversioned starter to the current starter layout", () => {
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

    expect(container.querySelectorAll(".workspace-slot")).toHaveLength(WORKSPACE_STARTER_PATHS.length);
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
    expect(container.querySelectorAll(".workspace-slot")).toHaveLength(WORKSPACE_STARTER_PATHS.length + 2);
  });

  it("shows all feature groups in a dropdown without a horizontal scroller", () => {
    act(() => root.render(<WorkspaceHome />));
    const addFeature = container.querySelector<HTMLButtonElement>('[data-testid="add-workspace-feature"]');
    if (!addFeature) throw new Error("Missing Add a feature control");

    act(() => addFeature.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(container.querySelector('[data-testid="workspace-feature-picker"]')?.getAttribute("role")).toBe("region");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('[data-testid="workspace-feature-option-pablo-main"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="workspace-feature-group-business"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="workspace-feature-group-hemingway"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="workspace-feature-group-settings"]')).not.toBeNull();
    expect(container.querySelector(".workspace-feature-groups")).toBeNull();
    expect(container.querySelector('[data-testid="workspace-feature-option-armory-main"]')).toBeNull();
    expect(container.querySelector('[data-testid="workspace-feature-option-marketplace-main"]')).toBeNull();
    expect(container.textContent).not.toContain("/workspace/");
    expect(container.textContent).not.toContain("WORKSPACE / TOOLS");
  });

  it("closes the feature dropdown with Escape and an outside click", () => {
    act(() => root.render(<WorkspaceHome />));
    const addFeature = container.querySelector<HTMLButtonElement>('[data-testid="add-workspace-feature"]')!;
    act(() => addFeature.click());
    expect(container.querySelector('[data-testid="workspace-feature-picker"]')).not.toBeNull();

    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(container.querySelector('[data-testid="workspace-feature-picker"]')).toBeNull();

    act(() => addFeature.click());
    expect(container.querySelector('[data-testid="workspace-feature-picker"]')).not.toBeNull();
    act(() => container.querySelector(".workspace-grid")?.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(container.querySelector('[data-testid="workspace-feature-picker"]')).toBeNull();
  });

  it("opens feature choices from an empty widget tile and fills that widget", () => {
    window.localStorage.setItem(
      "salaryman-workspace-slots:workspace-test-user",
      JSON.stringify({ version: 2, slots: [null] }),
    );
    act(() => root.render(<WorkspaceHome />));

    const tilePlus = container.querySelector<HTMLButtonElement>('[data-testid="add-feature-1"]');
    expect(tilePlus).not.toBeNull();
    expect(tilePlus?.disabled).toBe(false);
    act(() => tilePlus?.click());

    expect(container.querySelector('[data-testid="workspace-feature-picker"]')).not.toBeNull();
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="workspace-feature-option-pablo-main"]')?.click());

    expect(container.querySelector(".workspace-feature-name")?.textContent).toBe("PABLO AI");
    expect(container.querySelector('[data-testid="workspace-feature-picker"]')).toBeNull();
  });

  it("adds a queued menu feature to The Office workspace", () => {
    window.localStorage.setItem(
      "salaryman-workspace-slots:workspace-test-user",
      JSON.stringify({
        version: 2,
        slots: [
          "/pablo",
          "/workspace/notepad",
          "/workspace/calculator",
          "/business/crm",
          "/business/autopilot",
          "/comms",
          "/creative/classroom",
          "/1999",
          "/creative/media",
        ],
      }),
    );
    queueWorkspaceFeatureOpen("/hummingbird");

    act(() => root.render(<WorkspaceHome />));

    const focusedFrame = container.querySelector<HTMLIFrameElement>(
      '[data-testid="focused-feature-frame"]',
    );
    expect(focusedFrame?.getAttribute("src")).toContain("hummingbird");
    expect(container.querySelectorAll(".workspace-slot")).toHaveLength(9);
    expect(container.querySelector('[data-testid="close-focused-workspace"]')).not.toBeNull();
    expect(consumeQueuedWorkspaceFeatureOpen()).toBeNull();
  });

  it("keeps a queued menu choice until account loading finishes", () => {
    state.isLoading = true;
    queueWorkspaceFeatureOpen("/hummingbird");

    act(() => root.render(<WorkspaceHome />));
    expect(container.querySelector('[data-testid="focused-feature-frame"]')).toBeNull();
    expect(consumeQueuedWorkspaceFeatureOpen()).toBe("/hummingbird");

    queueWorkspaceFeatureOpen("/hummingbird");
    state.isLoading = false;
    act(() => root.render(<WorkspaceHome />));

    expect(container.querySelector<HTMLIFrameElement>('[data-testid="focused-feature-frame"]')?.getAttribute("src"))
      .toContain("hummingbird");
  });

  it("shows the HTTP status when account workspace sync fails", async () => {
    state.isAuthenticated = true;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Workspace unavailable" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await act(async () => {
      root.render(<WorkspaceHome />);
    });

    expect(container.querySelector(".workspace-sync-status")?.textContent)
      .toContain("HTTP 500");
  });

  it("shows the PABLO-channel unread count on its workspace tile", async () => {
    state.isAuthenticated = true;
    window.localStorage.setItem(
      "salaryman-workspace-slots:workspace-test-user",
      JSON.stringify({ version: 2, slots: ["/pablo"] }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const path = String(input);
        const payload = path.includes("/api/chat/channels")
          ? { pabloChannelId: 42, unreadCounts: { "42": 17 } }
          : { layout: { version: 2, slots: ["/pablo"] } };
        return Promise.resolve(new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }));
      }),
    );

    await act(async () => {
      root.render(<WorkspaceHome />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.querySelector('[data-testid="workspace-pablo-unread-1"]')?.textContent)
      .toBe("17");
  });

  it("shows admin and moderator destinations only to the matching staff roles", () => {
    state.isApprovedTester = true;
    act(() => root.render(<WorkspaceHome />));
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="add-workspace-feature"]')!
      .dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.querySelector('[data-testid="workspace-feature-option-profile-profile-moderator"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="workspace-feature-option-profile-profile-admin"]')).toBeNull();

    act(() => root.unmount());
    container.innerHTML = "";
    root = createRoot(container);
    state.isApprovedTester = false;
    state.isAdmin = true;
    act(() => root.render(<WorkspaceHome />));
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="add-workspace-feature"]')!
      .dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.querySelector('[data-testid="workspace-feature-option-profile-profile-admin"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="workspace-feature-option-profile-profile-moderator"]')).not.toBeNull();
  });

  it("places a dragged subfeature into the dropped widget", () => {
    act(() => root.render(<WorkspaceHome />));
    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="change-feature-1"]')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const feature = container.querySelector<HTMLButtonElement>(
      '[data-testid="workspace-feature-option-creative-scene"]',
    )!;
    const values = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: "",
      setData: (type: string, value: string) => values.set(type, value),
      getData: (type: string) => values.get(type) ?? "",
    };
    const dragStart = new Event("dragstart", { bubbles: true });
    Object.defineProperty(dragStart, "dataTransfer", { value: dataTransfer });
    act(() => feature.dispatchEvent(dragStart));

    const drop = new Event("drop", { bubbles: true });
    Object.defineProperty(drop, "dataTransfer", { value: dataTransfer });
    act(() => container.querySelector('[data-testid="workspace-slot-2"]')!.dispatchEvent(drop));

    const frame = container.querySelector<HTMLIFrameElement>('[data-testid="widget-frame-2"]');
    expect(new URL(frame!.getAttribute("src")!, window.location.origin).pathname)
      .toBe("/creative/scene");
  });

  it("reorders widgets when a widget is dragged onto another slot", () => {
    act(() => root.render(<WorkspaceHome />));
    const dragStart = new Event("dragstart", { bubbles: true });
    const values = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: "",
      setData: (type: string, value: string) => values.set(type, value),
      getData: (type: string) => values.get(type) ?? "",
    };
    Object.defineProperty(dragStart, "dataTransfer", { value: dataTransfer });
    act(() => container.querySelector('[data-testid="drag-slot-1"]')!.dispatchEvent(dragStart));

    const drop = new Event("drop", { bubbles: true });
    Object.defineProperty(drop, "dataTransfer", { value: dataTransfer });
    act(() => container.querySelector('[data-testid="workspace-slot-2"]')!.dispatchEvent(drop));

    const first = container.querySelector<HTMLIFrameElement>('[data-testid="widget-frame-1"]')!;
    const second = container.querySelector<HTMLIFrameElement>('[data-testid="widget-frame-2"]')!;
    expect(new URL(first.getAttribute("src")!, window.location.origin).pathname).toBe("/phone");
    expect(new URL(second.getAttribute("src")!, window.location.origin).pathname).toBe("/pablo");
  });
});
