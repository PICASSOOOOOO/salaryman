import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  ensureDeviceReady: vi.fn(),
  reconnect: vi.fn(),
  acceptIncomingCall: vi.fn(),
  rejectIncomingCall: vi.fn(),
  openPledgePopup: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({ apiFetch: mocks.apiFetch }));
vi.mock("@/hooks/use-mobile", () => ({ useBoomerMode: () => [false] }));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));
vi.mock("@/hooks/use-plan", () => ({
  usePlan: () => ({
    features: new Set(["phone_system"]),
    trials: [],
    isOwner: false,
    loading: false,
  }),
}));
vi.mock("@/components/PledgeStorePopup", () => ({
  usePledgePopup: () => ({ openPledgePopup: mocks.openPledgePopup }),
}));
vi.mock("@/contexts/TwilioDeviceContext", () => ({
  useTwilioDeviceContext: () => ({
    deviceState: "ready",
    deviceError: null,
    ensureDeviceReady: mocks.ensureDeviceReady,
    reconnect: mocks.reconnect,
    incomingCall: null,
    acceptIncomingCall: mocks.acceptIncomingCall,
    rejectIncomingCall: mocks.rejectIncomingCall,
  }),
}));
vi.mock("wouter", () => ({
  useLocation: () => ["/phone", mocks.navigate],
}));
vi.mock("@/components/SignInPrompt", () => ({
  SignInPage: () => <div>Sign in</div>,
}));
vi.mock("./PhoneCommandCenter", () => ({
  default: () => <div data-testid="phone-command-center">PHONE CONSOLE</div>,
}));
vi.mock("./PhoneContactsPage", () => ({
  default: () => <div data-testid="phone-contacts">PHONE CONTACTS</div>,
}));
vi.mock("./PhoneDialerPage", () => ({
  default: () => <div data-testid="phone-dialer">PHONE DIALER</div>,
}));

import CalllHomePage from "./CalllHomePage";

function response(status: number, payload: Record<string, unknown> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(payload),
  };
}

describe("CALLL HOME page", () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalUrl: string;

  beforeEach(() => {
    originalUrl = `${window.location.pathname}${window.location.search}`;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.apiFetch.mockReset();
    mocks.ensureDeviceReady.mockReset().mockResolvedValue(undefined);
    mocks.reconnect.mockReset();
    mocks.acceptIncomingCall.mockReset();
    mocks.rejectIncomingCall.mockReset();
    mocks.openPledgePopup.mockReset();
    mocks.navigate.mockReset();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    window.history.replaceState(null, "", originalUrl || "/");
  });

  it("waits for phone service recovery before initializing the browser phone", async () => {
    mocks.apiFetch
      .mockResolvedValueOnce(response(503, { status: "down" }))
      .mockResolvedValueOnce(response(200));

    await act(async () => {
      root.render(<CalllHomePage />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain(
      "Phone service is temporarily unavailable.",
    );
    expect(mocks.ensureDeviceReady).not.toHaveBeenCalled();
    expect(mocks.apiFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      container.querySelector<HTMLButtonElement>(
        '[data-testid="button-phone-status-retry"]',
      )?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.apiFetch).toHaveBeenCalledTimes(2);
    expect(mocks.ensureDeviceReady).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("CALLING READY");
  });

  it("restores a requested tab and keeps tab navigation in CALLL HOME", async () => {
    window.history.replaceState(null, "", "/phone?tab=contacts");
    mocks.apiFetch.mockResolvedValue(response(200));

    await act(async () => {
      root.render(<CalllHomePage />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.querySelector('[data-testid="tab-contacts"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="phone-contacts"]')).not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="tab-dial"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(window.location.search).toContain("tab=dial");
    expect(container.querySelector('[data-testid="phone-dialer"]')).not.toBeNull();
    expect(mocks.ensureDeviceReady).toHaveBeenCalledTimes(1);
  });
});
