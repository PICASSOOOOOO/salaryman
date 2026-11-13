import express, { type Express } from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  botConversationLogsTable,
  botMemoryTable,
  botPlatformConnectionsTable,
  botsTable,
  db,
  orgMembersTable,
  orgPermissionsTable,
  organizationsTable,
  userFeaturesTable,
  usersTable,
} from "@workspace/db";
import botsRouter from "../routes/bots";

let app: Express;
const auth = { user: { id: "", email: "" } };
const createdUserIds: string[] = [];
const createdOrgIds: number[] = [];
const createdBotIds: number[] = [];

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.defineProperty(req, "isAuthenticated", { configurable: true, value: () => true });
    Object.defineProperty(req, "user", { configurable: true, value: auth.user });
    next();
  });
  app.use("/api", botsRouter);
});

beforeEach(() => {
  auth.user = { id: "", email: "" };
});

afterAll(async () => {
  if (createdBotIds.length) {
    await db.delete(botConversationLogsTable).where(eq(botConversationLogsTable.botId, createdBotIds[0]));
    await db.delete(botMemoryTable).where(eq(botMemoryTable.botId, createdBotIds[0]));
    await db.delete(botPlatformConnectionsTable).where(eq(botPlatformConnectionsTable.botId, createdBotIds[0]));
    await db.delete(botsTable).where(eq(botsTable.id, createdBotIds[0]));
  }
  if (createdOrgIds.length) {
    await db.delete(organizationsTable).where(eq(organizationsTable.id, createdOrgIds[0]));
  }
  if (createdUserIds.length) {
    await db.delete(userFeaturesTable).where(eq(userFeaturesTable.userId, createdUserIds[0]));
    await db.delete(userFeaturesTable).where(eq(userFeaturesTable.userId, createdUserIds[1]));
    await db.delete(orgMembersTable).where(eq(orgMembersTable.userId, createdUserIds[0]));
    await db.delete(orgMembersTable).where(eq(orgMembersTable.userId, createdUserIds[1]));
    await db.delete(usersTable).where(eq(usersTable.id, createdUserIds[0]));
    await db.delete(usersTable).where(eq(usersTable.id, createdUserIds[1]));
  }
});

async function createUserRecord(label: string) {
  const id = `bots-privacy-${label}-${randomUUID()}`;
  const email = `${id}@example.test`;
  const [user] = await db.insert(usersTable).values({ id, email }).returning();
  createdUserIds.push(user.id);
  await db.insert(userFeaturesTable).values({
    userId: user.id,
    featureKey: "claw_bot",
    grantedBy: "test",
    stripeSubscriptionId: `sub_${id}`,
  });
  return { id: user.id, email: user.email! };
}

describe("organization Pixel Agent privacy boundaries", () => {
  it("keeps owner memory and webhook secrets from members without CRM access", async () => {
    const owner = await createUserRecord("owner");
    const member = await createUserRecord("member");
    const [org] = await db.insert(organizationsTable).values({
      name: `Bots privacy ${owner.id}`,
      ownerUserId: owner.id,
    }).returning({ id: organizationsTable.id });
    createdOrgIds.push(org.id);
    await db.insert(orgMembersTable).values([
      { orgId: org.id, userId: owner.id, role: "owner", status: "active" },
      { orgId: org.id, userId: member.id, role: "manager", status: "active" },
    ]);
    await db.insert(orgPermissionsTable).values({
      orgId: org.id,
      permissionKey: "crm.view",
      minRole: "owner",
    });
    const [bot] = await db.insert(botsTable).values({
      ownerId: owner.id,
      orgId: org.id,
      name: "Shared test agent",
      status: "active",
    }).returning();
    createdBotIds.push(bot.id);
    await db.insert(botMemoryTable).values({
      botId: bot.id,
      key: "private_note",
      value: "Owner-only information",
    });
    await db.insert(botPlatformConnectionsTable).values({
      botId: bot.id,
      platform: "telegram",
      credentials: "encrypted-credential",
      webhookSecret: "private-webhook-secret",
      webhookUrl: "https://example.test/hook?secret=private",
      status: "connected",
    });
    await db.insert(botConversationLogsTable).values({
      botId: bot.id,
      platform: "telegram",
      externalUserId: "customer-1",
      role: "user",
      content: "A customer message",
    });

    auth.user = member;
    const memberBot = await request(app).get(`/api/bots/${bot.id}`);
    expect(memberBot.status).toBe(200);
    expect(memberBot.body.bot.memories).toEqual([]);
    expect(memberBot.body.bot.connections[0]).not.toHaveProperty("webhookSecret");
    expect(memberBot.body.bot.connections[0]).not.toHaveProperty("webhookUrl");
    expect(memberBot.body.bot.connections[0]).not.toHaveProperty("credentials");
    expect((await request(app).get(`/api/bots/${bot.id}/memory`)).status).toBe(403);
    expect((await request(app).get(`/api/bots/${bot.id}/logs`)).status).toBe(403);

    auth.user = owner;
    const ownerBot = await request(app).get(`/api/bots/${bot.id}`);
    expect(ownerBot.status).toBe(200);
    expect(ownerBot.body.bot.memories).toHaveLength(1);
    expect(ownerBot.body.bot.connections[0].webhookSecret).toBe("private-webhook-secret");
    expect((await request(app).get(`/api/bots/${bot.id}/memory`)).status).toBe(200);
    expect((await request(app).get(`/api/bots/${bot.id}/logs`)).status).toBe(200);
  });
});
