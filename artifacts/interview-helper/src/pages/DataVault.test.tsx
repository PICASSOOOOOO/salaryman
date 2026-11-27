// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DataVault from "./DataVault";

vi.mock("@/pages/MediaLibrary", () => ({
  default: () => <div data-testid="files-content">File library</div>,
}));
vi.mock("@/pages/KnowledgeVault", () => ({
  default: () => <div data-testid="knowledge-content">Knowledge entries</div>,
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));

describe("DataVault", () => {
  let root: Root;
  let mountPoint: HTMLDivElement;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mountPoint = document.createElement("div");
    document.body.append(mountPoint);
    root = createRoot(mountPoint);
  });

  afterEach(() => {
    act(() => root.unmount());
    mountPoint.remove();
    vi.unstubAllGlobals();
  });

  it("opens the knowledge tab from legacy-route redirects and preserves both data views", async () => {
    window.history.replaceState({}, "", "/creative/media?tab=knowledge");
    await act(async () => {
      root.render(<DataVault />);
    });

    expect(document.querySelector('[data-testid="knowledge-content"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="button-data-vault-knowledge"]')?.getAttribute("aria-selected")).toBe("true");

    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-testid="button-data-vault-files"]')?.click();
    });
    expect(document.querySelector('[data-testid="files-content"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="button-data-vault-files"]')?.getAttribute("aria-selected")).toBe("true");
  });
});
