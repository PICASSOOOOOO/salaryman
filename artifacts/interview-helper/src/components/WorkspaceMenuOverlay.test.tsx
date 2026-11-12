// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceMenuOverlay } from "./WorkspaceMenuOverlay";

vi.mock("./MiniNebula", () => ({ MiniNebula: () => null }));

describe("WorkspaceMenuOverlay", () => {
  let root: Root;
  let mountPoint: HTMLDivElement;
  let opener: HTMLButtonElement;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mountPoint = document.createElement("div");
    opener = document.createElement("button");
    opener.type = "button";
    document.body.append(mountPoint, opener);
    opener.focus();
    root = createRoot(mountPoint);
  });

  afterEach(() => {
    act(() => root.unmount());
    mountPoint.remove();
    opener.remove();
    document.body.style.overflow = "";
    vi.unstubAllGlobals();
  });

  function renderMenu({
    open = true,
    pathname = "/",
    canAccessStaff = false,
    onClose = vi.fn(),
  }: {
    open?: boolean;
    pathname?: string;
    canAccessStaff?: boolean;
    onClose?: () => void;
  } = {}) {
    act(() => {
      root.render(
        <WorkspaceMenuOverlay
          open={open}
          pathname={pathname}
          canAccessStaff={canAccessStaff}
          onClose={onClose}
          onNavigate={vi.fn()}
          onSignOut={vi.fn()}
        />,
      );
    });
  }

  it("focuses search, traps keyboard focus, and restores focus and scrolling on close", () => {
    document.body.style.overflow = "auto";
    const onClose = vi.fn();
    renderMenu({ onClose });

    const panel = document.querySelector<HTMLElement>("#workspace-navigation-menu");
    const search = panel?.querySelector<HTMLInputElement>('input[type="search"]');
    const signOut = panel?.querySelector<HTMLButtonElement>(".workspace-menu-signout");
    expect(search).not.toBeNull();
    expect(signOut).not.toBeNull();
    expect(document.activeElement).toBe(search);
    expect(document.body.style.overflow).toBe("hidden");

    const backwardsTab = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(backwardsTab);
    expect(backwardsTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(signOut);

    const forwardsTab = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(forwardsTab);
    expect(forwardsTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(search);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(onClose).toHaveBeenCalledOnce();

    renderMenu({ open: false, onClose });
    expect(document.body.style.overflow).toBe("auto");
    expect(document.activeElement).toBe(opener);
  });

  it("shows nested destinations directly without expandable dropdown controls", () => {
    renderMenu({ pathname: "/business/invoices" });
    const invoice = Array.from(document.querySelectorAll<HTMLButtonElement>(".workspace-menu-link"))
      .find((button) => button.textContent?.includes("INVOICES"));

    expect(invoice).toBeDefined();
    expect(invoice?.getAttribute("aria-current")).toBe("page");
    expect(invoice?.closest(".workspace-menu-children")).not.toBeNull();
    expect(document.querySelector(".workspace-menu-expand")).toBeNull();
  });
});
