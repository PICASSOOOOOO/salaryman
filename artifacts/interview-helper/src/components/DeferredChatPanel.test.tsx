import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.hoisted(() => vi.fn());

vi.mock("wouter", () => ({
  useLocation: () => ["/office", navigate],
}));

import { DeferredChatPanel } from "./DeferredChatPanel";

describe("COMMS navigation bridge", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    navigate.mockClear();
    window.sessionStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("routes open-chat intents to the full COMMS page without rendering a dock", () => {
    act(() => root.render(<DeferredChatPanel />));
    expect(container.childElementCount).toBe(0);

    act(() => {
      window.dispatchEvent(new Event("salaryman:open-chat"));
    });

    expect(navigate).toHaveBeenCalledWith("/comms");
  });

  it("routes direct messages to COMMS and preserves their target", () => {
    act(() => root.render(<DeferredChatPanel />));

    act(() => {
      window.dispatchEvent(
        new CustomEvent("salaryman:open-dm", { detail: { userId: "target-user" } }),
      );
    });

    expect(navigate).toHaveBeenCalledWith("/comms");
    expect(window.sessionStorage.getItem("salaryman:comms:pending-dm")).toBe("target-user");
  });
});
