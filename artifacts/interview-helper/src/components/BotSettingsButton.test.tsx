// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BotSettingsButton } from "./BotSettingsButton";

describe("BotSettingsButton", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("opens settings directly without triggering the parent feature row", () => {
    const openSettings = vi.fn();
    const onRowClick = vi.fn();
    act(() => {
      root.render(
        <div onClick={onRowClick}>
          <BotSettingsButton
            botName="Assistant"
            onOpenSettings={openSettings}
            testId="settings-button"
          />
        </div>,
      );
    });
    const button = container.querySelector<HTMLButtonElement>('[data-testid="settings-button"]');
    expect(button?.getAttribute("aria-label")).toBe("Open settings for Assistant");

    act(() => button?.click());

    expect(openSettings).toHaveBeenCalledOnce();
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
