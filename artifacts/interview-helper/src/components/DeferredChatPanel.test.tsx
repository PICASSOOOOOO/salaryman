import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  isMobile: false,
  navigate: vi.fn(),
  chatPanelProps: [] as unknown[],
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/office", state.navigate],
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => state.isMobile,
}));

vi.mock("@/components/ChatPanel", () => ({
  ChatPanel: (props: unknown) => {
    state.chatPanelProps.push(props);
    return null;
  },
}));

vi.mock("@/hooks/use-comms-summary", () => ({
  useCommsSummary: () => ({ total: 0 }),
}));

import { DeferredChatPanel } from "./DeferredChatPanel";

describe("DeferredChatPanel navigation", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    state.navigate.mockClear();
    state.chatPanelProps.length = 0;
    state.isMobile = false;
    window.sessionStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("loads the COMMS dock from the desktop launcher", async () => {
    await act(async () => {
      root.render(<DeferredChatPanel />);
    });

    const button = container.querySelector('[data-testid="button-comms-toggle"]');
    expect(button).not.toBeNull();

    await act(async () => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(state.navigate).not.toHaveBeenCalled();
    expect(state.chatPanelProps.at(-1)).toMatchObject({
      dockMode: true,
      initiallyOpen: true,
    });
  });

  it("opens a targeted desktop direct message in the dock", async () => {
    await act(async () => {
      root.render(<DeferredChatPanel />);
    });

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("salaryman:open-dm", { detail: { userId: "target-user" } }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(state.navigate).not.toHaveBeenCalled();
    expect(state.chatPanelProps.at(-1)).toMatchObject({
      initialDmUserId: "target-user",
      initialDmRequestId: 1,
      openRequestId: 1,
    });

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("salaryman:open-dm", { detail: { userId: "target-user" } }),
      );
    });
    expect(state.chatPanelProps.at(-1)).toMatchObject({
      initialDmUserId: "target-user",
      initialDmRequestId: 2,
      openRequestId: 2,
    });
  });

  it("routes mobile direct-message intents to the COMMS page and preserves the target", async () => {
    state.isMobile = true;
    await act(async () => {
      root.render(<DeferredChatPanel />);
    });

    expect(container.querySelector('[data-testid="button-comms-toggle"]')).toBeNull();
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("salaryman:open-dm", { detail: { userId: "target-user" } }),
      );
    });

    expect(state.navigate).toHaveBeenCalledWith("/comms");
    expect(window.sessionStorage.getItem("salaryman:comms:pending-dm")).toBe("target-user");
  });
});
