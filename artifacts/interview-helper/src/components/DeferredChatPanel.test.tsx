import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const receivedProps = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-comms-summary", () => ({
  useCommsSummary: () => ({ total: 0 }),
}));

vi.mock("@/components/ChatPanel", () => ({
  ChatPanel: (props: unknown) => {
    receivedProps(props);
    return <div data-testid="loaded-chat" />;
  },
}));

import { DeferredChatPanel } from "./DeferredChatPanel";

describe("DeferredChatPanel direct-message handoff", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    receivedProps.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("preserves the target user while the chat chunk is unloaded", async () => {
    await act(async () => {
      root.render(<DeferredChatPanel />);
    });

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("salaryman:open-dm", { detail: { userId: "target-user" } }),
      );
      await Promise.resolve();
    });

    expect(receivedProps).toHaveBeenCalledWith(
      expect.objectContaining({
        initiallyOpen: true,
        initialDmUserId: "target-user",
      }),
    );
    expect(container.querySelector('[data-testid="loaded-chat"]')).not.toBeNull();
  });
});