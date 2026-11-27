import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const planState = vi.hoisted(() => ({ isOwner: true, loading: false }));

vi.mock("@/hooks/use-plan", () => ({
  usePlan: () => ({ ...planState }),
}));

vi.mock("./Profile", () => ({
  default: () => <div>PROFILE VIEW</div>,
  SettingsPage: () => <div>ACCOUNT SETTINGS VIEW</div>,
  AdminHub: () => <div>ADMIN VIEW</div>,
}));

vi.mock("./DataVault", () => ({ default: () => <div>DATA VAULT VIEW</div> }));
vi.mock("./PlatformAPI", () => ({ default: () => <div>PLATFORM CONNECTIONS VIEW</div> }));

import SettingsWorkspace from "./SettingsWorkspace";

describe("Settings workspace", () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalUrl: string;

  beforeEach(() => {
    originalUrl = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState(null, "", "/settings");
    planState.isOwner = true;
    planState.loading = false;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    window.history.replaceState(null, "", originalUrl || "/");
  });

  it("opens settings and exposes account tools as direct in-page tabs", async () => {
    await act(async () => {
      root.render(<SettingsWorkspace />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain("ACCOUNT SETTINGS VIEW");
    for (const tab of ["settings", "profile", "admin", "data", "connections"]) {
      expect(container.querySelector(`[data-testid="settings-workspace-${tab}"]`)).not.toBeNull();
    }
    expect(container.querySelector("[aria-expanded]")).toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="settings-workspace-connections"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(window.location.search).toBe("?tab=connections");
    expect(container.textContent).toContain("PLATFORM CONNECTIONS VIEW");
  });

  it("does not show or retain the admin tab for non-owners", async () => {
    planState.isOwner = false;
    window.history.replaceState(null, "", "/settings?tab=admin");

    await act(async () => {
      root.render(<SettingsWorkspace />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.querySelector('[data-testid="settings-workspace-admin"]')).toBeNull();
    expect(window.location.search).toBe("");
    expect(container.textContent).toContain("ACCOUNT SETTINGS VIEW");
  });
});
