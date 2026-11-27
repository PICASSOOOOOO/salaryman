// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-mobile", () => ({ useBoomerMode: () => [true] }));
vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(async () => ({ ok: true, json: async () => ({}) })),
}));
vi.mock("@/components/PixelAgentFace", () => ({
  PixelAgentFace: () => null,
  divisionFor: () => "operations",
}));

import BotCommandCenter from "./BotCommandCenter";
import type { BotData } from "./BotFactory";

const bot: BotData = {
  id: 8,
  name: "Operations bot",
  personality: "Organized",
  systemPrompt: "Help with operations.",
  status: "active",
  permissions: ["ai_chat"],
  maxTokensPerResponse: 2048,
  rateLimitPerMinute: 20,
  marketplaceItemId: 4,
  connections: [],
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("BotCommandCenter settings control", () => {
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

  it("calls the real settings action for the selected bot", () => {
    const onSelectBot = vi.fn();
    act(() => {
      root.render(
        <BotCommandCenter
          bots={[bot]}
          onRefresh={vi.fn()}
          onSelectBot={onSelectBot}
          onConnectBot={vi.fn()}
        />,
      );
    });
    const settingsButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="bot-command-settings-8"]',
    );
    expect(settingsButton?.getAttribute("aria-label")).toBe("Open settings for Operations bot");

    act(() => settingsButton?.click());

    expect(onSelectBot).toHaveBeenCalledWith(bot);
  });
});
