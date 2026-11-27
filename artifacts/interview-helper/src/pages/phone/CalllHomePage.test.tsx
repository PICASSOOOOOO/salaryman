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
  setHideNavBar: vi.fn(),
  isMobile: false,
}));

vi.mock("@/lib/api-client", () => ({ apiFetch: mocks.apiFetch }));
vi.mock("@/hooks/use-mobile", () => ({
  useBoomerMode: () => [false],
  useIsMobile: () => mocks.isMobile,
}));
vi.mock("@/hooks/use-navbar-visibility", () => ({
  useNavBarVisibility: () => ({ setHideNavBar: mocks.setHideNavBar }),
}));
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
    mocks.setHideNavBar.mockReset();
    mocks.isMobile = false;
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
      "Twilio is not responding or rejected the account credentials.",
    );
    expect(container.textContent).toContain("HTTP 503");
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

  it("shows CALLL HOME features directly without a MORE dropdown", async () => {
    mocks.apiFetch.mockResolvedValue(response(200));

    await act(async () => {
      root.render(<CalllHomePage />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    for (const tab of ["cmd", "dial", "auto", "cc", "contacts", "sms", "numbers", "log", "rec", "vm", "conf", "ai"]) {
      expect(container.querySelector(`[data-testid="tab-${tab}"]`)).not.toBeNull();
    }
    expect(container.querySelector('[data-testid="tab-ai"]')?.textContent).toContain("VOICE COACH");
    expect(container.querySelector('[data-testid="button-tab-settings"]')).toBeNull();
    expect(container.querySelector('[data-testid="tab-settings-menu"]')).toBeNull();
  });

  it("uses the full mobile viewport and keeps a back action for CALLL HOME", async () => {
    mocks.isMobile = true;
    mocks.apiFetch.mockResolvedValue(response(200));

    await act(async () => {
      root.render(<CalllHomePage />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.setHideNavBar).toHaveBeenCalledWith(true);
    const backButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Back to workspace"]',
    );
    expect(backButton).not.toBeNull();

    await act(async () => {
      backButton?.click();
    });
    expect(mocks.navigate).toHaveBeenCalledWith("/workspace", { replace: true });
  });
});
