// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuth } from "./use-auth";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let latest: ReturnType<typeof useAuth>;
let root: Root;
let container: HTMLDivElement;
let fetchMock: ReturnType<typeof vi.fn>;
let originalTop: PropertyDescriptor | undefined;

function Probe() {
  latest = useAuth();
  return null;
}

function render() {
  act(() => root.render(<Probe />));
}

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ user: null }) });
  vi.stubGlobal("fetch", fetchMock);
  originalTop = Object.getOwnPropertyDescriptor(window, "top");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  if (originalTop) {
    Object.defineProperty(window, "top", originalTop);
  } else {
    delete (window as Window & { top?: Window }).top;
  }
  vi.restoreAllMocks();
});

describe("Replit-backed useAuth adapter", () => {
  it("starts loading and resolves signed-out state from the session endpoint", async () => {
    render();
    expect(latest.isLoading).toBe(true);
    expect(latest.isAuthenticated).toBe(false);
    expect(latest.user).toBeNull();
    await act(async () => {});
    expect(latest.isLoading).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/user", { credentials: "include" });
  });

  it("exposes the Replit session user and redirects through the API", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        user: {
          id: "legacy-local-id",
          email: "user@example.com",
          firstName: "Salary",
          lastName: "Person",
          profileImageUrl: "https://example.com/avatar.png",
        },
      }),
    });
    render();
    await act(async () => {});
    expect(latest.isAuthenticated).toBe(true);
    expect(latest.user).toMatchObject({
      id: "legacy-local-id",
      email: "user@example.com",
      firstName: "Salary",
      lastName: "Person",
    });
  });

  it("opens preview sign-in in a detached tab without redirecting the preview frame", () => {
    Object.defineProperty(window, "top", { configurable: true, value: {} });
    const childLocation = { replace: vi.fn() };
    const childHead = { appendChild: vi.fn() };
    const childWindow = {
      opener: window,
      document: {
        createElement: vi.fn(() => document.createElement("meta")),
        head: childHead,
      },
      location: childLocation,
      close: vi.fn(),
    } as unknown as Window;
    const open = vi.spyOn(window, "open").mockReturnValue(childWindow);

    render();
    act(() => latest.login("/office"));

    expect(open).toHaveBeenCalledWith("about:blank", "_blank");
    expect(childWindow.opener).toBeNull();
    expect(childHead.appendChild).toHaveBeenCalledWith(
      expect.objectContaining({ name: "referrer", content: "no-referrer" }),
    );
    expect(childLocation.replace).toHaveBeenCalledWith("/api/login?returnTo=%2Foffice");
  });
});