// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import MinimoogEmulatorPanel from "./MinimoogEmulatorPanel";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("Minimoog emulator panel", () => {
  it("does not contact the external emulator until the user launches it", async () => {
    await act(async () => root.render(createElement(MinimoogEmulatorPanel)));

    expect(container.querySelector('[data-testid="iframe-minimoog-emulator"]')).toBeNull();
    expect(container.querySelector('[data-testid="button-load-minimoog"]')).not.toBeNull();
    expect(container.querySelector('a[href="https://github.com/stevebarakat/Minimoog"]')).not.toBeNull();
  });

  it("loads the upstream emulator with MIDI permission and no referrer", async () => {
    await act(async () => root.render(createElement(MinimoogEmulatorPanel)));
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="button-load-minimoog"]')!.click();
    });

    const frame = container.querySelector<HTMLIFrameElement>('[data-testid="iframe-minimoog-emulator"]');
    expect(frame?.getAttribute("src")).toBe("https://www.minimoog.app/");
    expect(frame?.getAttribute("allow")).toContain("midi");
    expect(frame?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(container.querySelector('[data-testid="status-minimoog-loaded"]')).not.toBeNull();
  });
});
