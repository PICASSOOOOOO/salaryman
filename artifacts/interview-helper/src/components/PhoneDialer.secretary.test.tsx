// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ apiFetch: apiFetchMock }));
vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
  useBoomerMode: () => [true],
}));
vi.mock("@/hooks/useReliableOutboundBridge", () => ({
  useReliableOutboundBridge: () => async (request: () => Promise<unknown>) => request(),
}));

import { PhoneDialer } from "./PhoneDialer";

const savedConfig = {
  isEnabled: false,
  personality: "professional",
  greetingScript: "Hello, how can I help?",
};

function response(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

describe("phone secretary settings save", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("__BUILD_VERSION__", "test");
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes("twilio/secretary/config")) {
        if (init?.method === "POST") {
          const config = JSON.parse(String(init.body));
          return response({ ok: true, config });
        }
        return response({ config: savedConfig });
      }
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

  async function openSecretarySettings() {
    await act(async () => {
      root.render(<PhoneDialer userId="test-user" />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const secretaryTab = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("SEC"));
    if (!secretaryTab) throw new Error("Missing secretary settings tab");
    await act(async () => secretaryTab.click());
  }

  it("shows a saved confirmation after the API persists settings", async () => {
    await openSecretarySettings();
    const greeting = container.querySelector<HTMLTextAreaElement>(
      'textarea[placeholder="Thank you for calling. How can I help you?"]',
    );
    if (!greeting) throw new Error("Missing secretary greeting setting");
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setValue?.call(greeting, "Thanks for calling SALARYMAN.");
    act(() => greeting.dispatchEvent(new Event("input", { bubbles: true })));

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="phone-secretary-save"]')?.click();
    });

    expect(apiFetchMock).toHaveBeenCalledWith(
      expect.stringContaining("twilio/secretary/config"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("Thanks for calling SALARYMAN."),
      }),
    );
    expect(container.querySelector('[data-testid="phone-secretary-save-success"]')?.textContent)
      .toBe("Configuration saved.");
  });

  it("shows the server error instead of silently swallowing a failed save", async () => {
    await openSecretarySettings();
    apiFetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes("twilio/secretary/config") && init?.method === "POST") {
        return response({ error: "Configuration was rejected." }, false, 500);
      }
      if (String(url).includes("twilio/secretary/config")) return response({ config: savedConfig });
      return response({});
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="phone-secretary-save"]')?.click();
    });

    expect(container.querySelector('[data-testid="phone-secretary-save-error"]')?.textContent)
      .toBe("Configuration was rejected.");
  });
});
