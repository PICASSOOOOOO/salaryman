// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ apiFetch: apiFetchMock }));

import { BotDetailModal, type BotData } from "./BotFactory";

const bot: BotData = {
  id: 42,
  name: "Test assistant",
  personality: "Clear and helpful",
  systemPrompt: "Help with approved business tasks.",
  status: "paused",
  permissions: ["ai_chat"],
  maxTokensPerResponse: 2048,
  rateLimitPerMinute: 20,
  marketplaceItemId: null,
  connections: [],
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("bot settings destination", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    apiFetchMock.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("opens the bot's real settings tab when requested from a gear control", async () => {
    await act(async () => {
      root.render(
        <BotDetailModal
          bot={bot}
          initialTab="settings"
          onClose={vi.fn()}
          onRefresh={vi.fn()}
          boomer
          t={(key) => key}
        />,
      );
    });

    expect(container.querySelector('[data-testid="bot-detail-settings"]')).not.toBeNull();
    expect(container.textContent).toContain("Clear and helpful");
    expect((container.querySelector('[data-testid="bot-settings-max-tokens"]') as HTMLInputElement).value)
      .toBe("2048");
    expect((container.querySelector('[data-testid="bot-settings-rate-limit"]') as HTMLInputElement).value)
      .toBe("20");
    expect(container.querySelector('[data-testid="bot-settings-personality"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="bot-settings-system-prompt"]')).not.toBeNull();
  });

  it("saves edited bot settings through the existing API and keeps the modal current", async () => {
    const updatedBot = { ...bot, name: "Updated assistant" };
    apiFetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ bot: updatedBot }),
    });
    const onSaved = vi.fn();

    await act(async () => {
      root.render(
        <BotDetailModal
          bot={bot}
          initialTab="settings"
          onClose={vi.fn()}
          onRefresh={vi.fn()}
          onSaved={onSaved}
          boomer
          t={(key) => key}
        />,
      );
    });
    const nameInput = container.querySelector<HTMLInputElement>('[data-testid="bot-settings-name"]');
    if (!nameInput) throw new Error("Missing bot name setting");
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setValue?.call(nameInput, "Updated assistant");
    act(() => nameInput.dispatchEvent(new Event("input", { bubbles: true })));

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="bot-settings-save"]')?.click();
    });

    expect(apiFetchMock).toHaveBeenCalledWith("/api/bots/42", expect.objectContaining({
      method: "PUT",
      body: expect.stringContaining('"name":"Updated assistant"'),
    }));
    expect(onSaved).toHaveBeenCalledWith(updatedBot);
    expect(container.textContent).toContain("Settings saved.");
  });

  it("rejects invalid token limits before sending a save request", async () => {
    await act(async () => {
      root.render(
        <BotDetailModal
          bot={bot}
          initialTab="settings"
          onClose={vi.fn()}
          onRefresh={vi.fn()}
          boomer
          t={(key) => key}
        />,
      );
    });
    const tokenInput = container.querySelector<HTMLInputElement>('[data-testid="bot-settings-max-tokens"]');
    if (!tokenInput) throw new Error("Missing max-tokens setting");
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setValue?.call(tokenInput, "0");
    act(() => tokenInput.dispatchEvent(new Event("input", { bubbles: true })));

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="bot-settings-save"]')?.click();
    });

    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent)
      .toContain("1 to 32,768");
  });
});
