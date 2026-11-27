// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ apiFetch: apiFetchMock }));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));
vi.mock("wouter", () => ({
  useLocation: () => ["/my-apps/connections", vi.fn()],
}));

import PlatformAPI from "./PlatformAPI";

const connectedApp = {
  slug: "test-service",
  name: "Test Service",
  description: "A test-only connection.",
  status: "available",
  category: "other",
  connected: true,
  connectionId: 1,
  lastSyncAt: null,
  credentials: {
    hasApiKey: true,
    apiKeyLast4: "1234",
    login: "test-user",
    hasPassword: true,
    baseUrl: null,
    hasNotes: false,
  },
};

function response(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

describe("Platform API connection settings", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith("/platform/apps")) return response([connectedApp]);
      return response({});
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  async function openManageDialog() {
    await act(async () => {
      root.render(<PlatformAPI embedded />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const manageButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("MANAGE"));
    if (!manageButton) throw new Error("Missing Manage connection button");
    await act(async () => manageButton.click());
    expect(container.textContent).toContain("MANAGE Test Service");
  }

  it("keeps the dialog open and explains a failed connection save", async () => {
    await openManageDialog();
    apiFetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/platform/apps/connect") && init?.method === "POST") {
        return response({ error: "Connection was rejected." }, false, 500);
      }
      if (String(url).endsWith("/platform/apps")) return response([connectedApp]);
      return response({});
    });

    await act(async () => {
      const saveButton = Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("SAVE CHANGES"));
      saveButton?.click();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Connection was rejected.");
    expect(container.textContent).toContain("MANAGE Test Service");
  });

  it("closes and refreshes the connection list after a successful save", async () => {
    await openManageDialog();

    await act(async () => {
      const saveButton = Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("SAVE CHANGES"));
      saveButton?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(apiFetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/platform/apps/connect"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(container.textContent).not.toContain("MANAGE Test Service");
    expect(apiFetchMock.mock.calls.filter(([url]) => String(url).endsWith("/platform/apps")).length)
      .toBeGreaterThan(1);
  });
});
