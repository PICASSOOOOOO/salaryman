import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  botConversationLogsTable,
  botMemoryTable,
  botsTable,
  db,
  usersTable,
  type Bot,
} from "@workspace/db";
import { eq } from "drizzle-orm";

const { streamWithRouterMock } = vi.hoisted(() => ({
  streamWithRouterMock: vi.fn(),
}));

vi.mock("../lib/ai-router", () => ({
  streamWithRouter: streamWithRouterMock,
}));

import { processIncomingMessage } from "../lib/bot-engine";

describe("Pixel Agent memory privacy", () => {
  const ownerId = `bot-privacy-${randomUUID()}`;
  let bot: Bot;

  beforeAll(async () => {
    await db.insert(usersTable).values({
      id: ownerId,
      email: `${ownerId}@example.test`,
    });
    [bot] = await db.insert(botsTable).values({
      ownerId,
      name: "Privacy test bot",
      status: "active",
      permissions: ["ai_chat"],
    }).returning();
    await db.insert(botMemoryTable).values({
      botId: bot.id,
      key: "legacy_private_fact",
      value: "A fact from a different person's chat",
      context: "telegram",
    });
  });

  beforeEach(() => {
    streamWithRouterMock.mockReset().mockImplementation(async (...args: unknown[]) => {
      const onChunk = args[3] as (chunk: { content?: string }) => void;
      onChunk({ content: "[MEMORY:assistant_note=Private fact from this conversation] Response." });
    });
  });

  afterAll(async () => {
    if (bot?.id) {
      await db.delete(botConversationLogsTable).where(eq(botConversationLogsTable.botId, bot.id));
      await db.delete(botMemoryTable).where(eq(botMemoryTable.botId, bot.id));
      await db.delete(botsTable).where(eq(botsTable.id, bot.id));
    }
    await db.delete(usersTable).where(eq(usersTable.id, ownerId));
  });

  it("does not share persistent bot memory with external users", async () => {
    const response = await processIncomingMessage(bot, {
      platform: "telegram",
      externalUserId: "external-customer-17",
      text: "Hello",
    });

    const systemPrompt = streamWithRouterMock.mock.calls[0]?.[1] as string;
    expect(systemPrompt).not.toContain("A fact from a different person's chat");
    expect(systemPrompt).not.toContain("PERSISTENT MEMORY");
    expect(systemPrompt).not.toContain("[MEMORY:key=value]");
    expect(response).toBe("Response.");

    const memories = await db.select().from(botMemoryTable).where(eq(botMemoryTable.botId, bot.id));
    expect(memories).toHaveLength(1);
  });

  it("keeps bot memory available only for owner-initiated test chats", async () => {
    const response = await processIncomingMessage(bot, {
      platform: "telegram",
      externalUserId: `test:${ownerId}`,
      text: "Hello",
    }, { allowPersistentMemory: true });

    const systemPrompt = streamWithRouterMock.mock.calls[0]?.[1] as string;
    expect(systemPrompt).toContain("A fact from a different person's chat");
    expect(systemPrompt).toContain("PERSISTENT MEMORY");
    expect(systemPrompt).toContain("[MEMORY:key=value]");
    expect(response).toBe("Response.");
    const memories = await db.select().from(botMemoryTable).where(eq(botMemoryTable.botId, bot.id));
    expect(memories).toHaveLength(2);
    expect(memories.some((memory) => memory.key === "assistant_note")).toBe(true);
  });
});
