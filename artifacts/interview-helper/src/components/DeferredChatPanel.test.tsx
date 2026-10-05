import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.hoisted(() => vi.fn());

vi.mock("wouter", () => ({
  useLocation: () => ["/game", navigate],
}));

vi.mock("@/hooks/use-comms-summary", () => ({
  useCommsSummary: () => ({ total: 0 }),
}));

import { DeferredChatPanel } from "./DeferredChatPanel";

describe("DeferredChatPanel navigation", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    navigate.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("opens the dedicated COMMS page instead of a floating chat panel", async () => {
    await act(async () => {
      root.render(<DeferredChatPanel />);
    });

    const button = container.querySelector('[data-testid="button-comms-toggle"]');
    expect(button).not.toBeNull();
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    await act(async () => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(navigate).toHaveBeenCalledWith("/comms");
  });
});
