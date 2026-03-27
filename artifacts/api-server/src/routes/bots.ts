import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, and, desc, asc } from "drizzle-orm";
import {
  db,
  botsTable,
  botPlatformConnectionsTable,
  botMemoryTable,
  botScheduledTasksTable,
  botConversationLogsTable,
  botMarketplaceTable,
  botSubscriptionsTable,
  type PlatformType,
  type PermissionKey,
} from "@workspace/db";
import { startBot, stopBot, processIncomingMessage } from "../lib/bot-engine";
import { getConnector } from "../lib/bot-connectors";
import { encryptCredentials, generateWebhookSecret, verifyTelegramWebhook, verifyTwilioSignature, decryptCredentials } from "../lib/bot-crypto";
import { hasFeature } from "../lib/plan";

const router = Router();

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  next();
}

function getUserId(req: Request): string {
  return (req as Request & { user?: { id?: string } }).user?.id ?? "";
}

function getUserEmail(req: Request): string | undefined {
  return (req as Request & { user?: { email?: string } }).user?.email;
}

async function requireBotFactory(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const userId = getUserId(req);
  const email = getUserEmail(req);
  const hasBotFactory = await hasFeature(userId, email, "bot_factory");
  if (!hasBotFactory) {
    res.status(403).json({ error: "Bot Factory subscription required", feature: "bot_factory" });
    return;
  }
  next();
}

function parseParam(val: string | string[] | undefined): string {
  if (Array.isArray(val)) return val[0] ?? "";
  return val ?? "";
}

router.get("/bots", requireBotFactory, async (req, res) => {
  try {
    const userId = getUserId(req);
    const bots = await db
      .select()
      .from(botsTable)
      .where(eq(botsTable.ownerId, userId))
      .orderBy(desc(botsTable.createdAt));

    const botsWithConnections = await Promise.all(
      bots.map(async (bot) => {
        const connections = await db
          .select()
          .from(botPlatformConnectionsTable)
          .where(eq(botPlatformConnectionsTable.botId, bot.id));
        return {
          ...bot,
          connections: connections.map(c => ({ ...c, credentials: undefined })),
        };
      })
    );

    res.json({ bots: botsWithConnections });
  } catch (err) {
    console.error("Error listing bots:", err);
    res.status(500).json({ error: "Failed to list bots" });
  }
});

router.post("/bots", requireBotFactory, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { name, personality, systemPrompt, permissions, maxTokensPerResponse, rateLimitPerMinute } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({ error: "Bot name is required" });
      return;
    }

    const [bot] = await db
      .insert(botsTable)
      .values({
        ownerId: userId,
        name: name.trim(),
        personality: personality || "You are a helpful assistant.",
        systemPrompt: systemPrompt || "",
        permissions: permissions || ["ai_chat"],
        maxTokensPerResponse: maxTokensPerResponse || 4096,
        rateLimitPerMinute: rateLimitPerMinute || 10,
      })
      .returning();

    res.json({ bot });
  } catch (err) {
    console.error("Error creating bot:", err);
    res.status(500).json({ error: "Failed to create bot" });
  }
});

router.get("/bots/:id", requireBotFactory, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);

    const [bot] = await db
      .select()
      .from(botsTable)
      .where(and(eq(botsTable.id, botId), eq(botsTable.ownerId, userId)));

    if (!bot) {
      res.status(404).json({ error: "Bot not found" });
      return;
    }

    const rawConnections = await db
      .select()
      .from(botPlatformConnectionsTable)
      .where(eq(botPlatformConnectionsTable.botId, botId));
    const connections = rawConnections.map(c => ({ ...c, credentials: undefined }));

    const memories = await db
      .select()
      .from(botMemoryTable)
      .where(eq(botMemoryTable.botId, botId))
      .orderBy(desc(botMemoryTable.updatedAt));

    const tasks = await db
      .select()
      .from(botScheduledTasksTable)
      .where(eq(botScheduledTasksTable.botId, botId));

    res.json({ bot: { ...bot, connections, memories, scheduledTasks: tasks } });
  } catch (err) {
    console.error("Error fetching bot:", err);
    res.status(500).json({ error: "Failed to fetch bot" });
  }
});

router.put("/bots/:id", requireBotFactory, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);
    const { name, personality, systemPrompt, permissions, maxTokensPerResponse, rateLimitPerMinute, status } = req.body;

    const [existing] = await db
      .select()
      .from(botsTable)
      .where(and(eq(botsTable.id, botId), eq(botsTable.ownerId, userId)));

    if (!existing) {
      res.status(404).json({ error: "Bot not found" });
      return;
    }

    const updates: Partial<Record<string, unknown>> = {};
    if (name !== undefined) updates.name = name.trim();
    if (personality !== undefined) updates.personality = personality;
    if (systemPrompt !== undefined) updates.systemPrompt = systemPrompt;
    if (permissions !== undefined) updates.permissions = permissions;
    if (maxTokensPerResponse !== undefined) updates.maxTokensPerResponse = maxTokensPerResponse;
    if (rateLimitPerMinute !== undefined) updates.rateLimitPerMinute = rateLimitPerMinute;
    if (status !== undefined) {
      updates.status = status;
      if (status === "active" && existing.status !== "active") {
        await startBot(botId);
      } else if (status === "paused" && existing.status === "active") {
        await stopBot(botId);
      }
    }

    const [updated] = await db
      .update(botsTable)
      .set(updates)
      .where(eq(botsTable.id, botId))
      .returning();

    res.json({ bot: updated });
  } catch (err) {
    console.error("Error updating bot:", err);
    res.status(500).json({ error: "Failed to update bot" });
  }
});

router.delete("/bots/:id", requireBotFactory, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);

    const [existing] = await db
      .select()
      .from(botsTable)
      .where(and(eq(botsTable.id, botId), eq(botsTable.ownerId, userId)));

    if (!existing) {
      res.status(404).json({ error: "Bot not found" });
      return;
    }

    await stopBot(botId);
    await db.delete(botsTable).where(eq(botsTable.id, botId));
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting bot:", err);
    res.status(500).json({ error: "Failed to delete bot" });
  }
});

router.post("/bots/:id/connect", requireBotFactory, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);
    const { platform, credentials } = req.body;

    const [bot] = await db
      .select()
      .from(botsTable)
      .where(and(eq(botsTable.id, botId), eq(botsTable.ownerId, userId)));

    if (!bot) {
      res.status(404).json({ error: "Bot not found" });
      return;
    }

    const connector = getConnector(platform as PlatformType);
    if (!connector) {
      res.status(400).json({ error: `Platform '${platform}' is not supported yet` });
      return;
    }

    const webhookSecret = generateWebhookSecret();
    const host = req.headers.host || process.env.REPLIT_DEV_DOMAIN || "localhost";
    const proto = req.headers["x-forwarded-proto"] || "https";
    const webhookUrl = `${proto}://${host}/api/bots/webhook/${platform}/${botId}`;

    let finalCredentials = credentials;
    if (platform === "facebook") {
      try {
        const parsed = JSON.parse(credentials);
        parsed.webhookUrl = webhookUrl;
        finalCredentials = JSON.stringify(parsed);
      } catch {}
    }

    const encryptedCreds = encryptCredentials(finalCredentials);

    const existing = await db
      .select()
      .from(botPlatformConnectionsTable)
      .where(
        and(
          eq(botPlatformConnectionsTable.botId, botId),
          eq(botPlatformConnectionsTable.platform, platform)
        )
      );

    if (existing.length > 0) {
      const [updated] = await db
        .update(botPlatformConnectionsTable)
        .set({ credentials: encryptedCreds, webhookSecret, webhookUrl, status: "connected" })
        .where(eq(botPlatformConnectionsTable.id, existing[0].id))
        .returning();
      const { credentials: _, webhookSecret: __, ...safeConn } = updated;
      res.json({ connection: safeConn, webhookSecret, webhookUrl });
    } else {
      const [connection] = await db
        .insert(botPlatformConnectionsTable)
        .values({
          botId,
          platform,
          credentials: encryptedCreds,
          webhookSecret,
          webhookUrl,
          status: "connected",
        })
        .returning();
      const { credentials: _, webhookSecret: __, ...safeConn } = connection;
      res.json({ connection: safeConn, webhookSecret, webhookUrl });
    }

    if (bot.status === "active") {
      try {
        await startBot(botId);
      } catch (err) {
        console.error("Failed to restart bot after connecting platform:", err);
      }
    }
  } catch (err) {
    console.error("Error connecting platform:", err);
    res.status(500).json({ error: "Failed to connect platform" });
  }
});

router.post("/bots/:id/disconnect", requireBotFactory, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);
    const { platform } = req.body;

    const [bot] = await db
      .select()
      .from(botsTable)
      .where(and(eq(botsTable.id, botId), eq(botsTable.ownerId, userId)));

    if (!bot) {
      res.status(404).json({ error: "Bot not found" });
      return;
    }

    const connector = getConnector(platform as PlatformType);
    if (connector) await connector.stop(botId);

    await db
      .update(botPlatformConnectionsTable)
      .set({ status: "disconnected" })
      .where(
        and(
          eq(botPlatformConnectionsTable.botId, botId),
          eq(botPlatformConnectionsTable.platform, platform)
        )
      );

    res.json({ success: true });
  } catch (err) {
    console.error("Error disconnecting platform:", err);
    res.status(500).json({ error: "Failed to disconnect platform" });
  }
});

router.get("/bots/:id/logs", requireBotFactory, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);
    const limit = parseInt(req.query.limit as string, 10) || 50;

    const [bot] = await db
      .select()
      .from(botsTable)
      .where(and(eq(botsTable.id, botId), eq(botsTable.ownerId, userId)));

    if (!bot) {
      res.status(404).json({ error: "Bot not found" });
      return;
    }

    const logs = await db
      .select()
      .from(botConversationLogsTable)
      .where(eq(botConversationLogsTable.botId, botId))
      .orderBy(desc(botConversationLogsTable.createdAt))
      .limit(limit);

    res.json({ logs: logs.reverse() });
  } catch (err) {
    console.error("Error fetching bot logs:", err);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});

router.post("/bots/:id/test-chat", requireBotFactory, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);
    const { message } = req.body;

    if (!message || !message.trim()) {
      res.status(400).json({ error: "Message is required" });
      return;
    }

    const [bot] = await db
      .select()
      .from(botsTable)
      .where(and(eq(botsTable.id, botId), eq(botsTable.ownerId, userId)));

    if (!bot) {
      res.status(404).json({ error: "Bot not found" });
      return;
    }

    const response = await processIncomingMessage(bot, {
      platform: "telegram",
      externalUserId: `test:${userId}`,
      text: message.trim(),
    });

    res.json({ response });
  } catch (err) {
    console.error("Error in test chat:", err);
    res.status(500).json({ error: "Test chat failed" });
  }
});

router.get("/bots/:id/memory", requireBotFactory, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);

    const [bot] = await db
      .select()
      .from(botsTable)
      .where(and(eq(botsTable.id, botId), eq(botsTable.ownerId, userId)));

    if (!bot) {
      res.status(404).json({ error: "Bot not found" });
      return;
    }

    const memories = await db
      .select()
      .from(botMemoryTable)
      .where(eq(botMemoryTable.botId, botId))
      .orderBy(desc(botMemoryTable.updatedAt));

    res.json({ memories });
  } catch (err) {
    console.error("Error fetching bot memory:", err);
    res.status(500).json({ error: "Failed to fetch memory" });
  }
});

router.delete("/bots/:id/memory/:memoryId", requireBotFactory, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);
    const memoryId = parseInt(parseParam(req.params.memoryId), 10);

    const [bot] = await db
      .select()
      .from(botsTable)
      .where(and(eq(botsTable.id, botId), eq(botsTable.ownerId, userId)));

    if (!bot) {
      res.status(404).json({ error: "Bot not found" });
      return;
    }

    await db.delete(botMemoryTable).where(
      and(eq(botMemoryTable.id, memoryId), eq(botMemoryTable.botId, botId))
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting memory:", err);
    res.status(500).json({ error: "Failed to delete memory" });
  }
});

router.get("/bots/:id/tasks", requireBotFactory, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);

    const [bot] = await db
      .select()
      .from(botsTable)
      .where(and(eq(botsTable.id, botId), eq(botsTable.ownerId, userId)));

    if (!bot) {
      res.status(404).json({ error: "Bot not found" });
      return;
    }

    const tasks = await db
      .select()
      .from(botScheduledTasksTable)
      .where(eq(botScheduledTasksTable.botId, botId));

    res.json({ tasks });
  } catch (err) {
    console.error("Error listing tasks:", err);
    res.status(500).json({ error: "Failed to list tasks" });
  }
});

router.post("/bots/:id/tasks", requireBotFactory, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);
    const { cronExpression, taskDescription, enabled } = req.body;

    const [bot] = await db
      .select()
      .from(botsTable)
      .where(and(eq(botsTable.id, botId), eq(botsTable.ownerId, userId)));

    if (!bot) {
      res.status(404).json({ error: "Bot not found" });
      return;
    }

    const [task] = await db
      .insert(botScheduledTasksTable)
      .values({
        botId,
        cronExpression,
        taskDescription,
        enabled: enabled ?? true,
      })
      .returning();

    if (bot.status === "active") {
      try { await stopBot(botId); await startBot(botId); } catch (err) {
        console.error("Failed to refresh scheduler after task create:", err);
      }
    }

    res.json({ task });
  } catch (err) {
    console.error("Error creating scheduled task:", err);
    res.status(500).json({ error: "Failed to create task" });
  }
});

router.delete("/bots/:id/tasks/:taskId", requireBotFactory, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);
    const taskId = parseInt(parseParam(req.params.taskId), 10);

    const [bot] = await db
      .select()
      .from(botsTable)
      .where(and(eq(botsTable.id, botId), eq(botsTable.ownerId, userId)));

    if (!bot) {
      res.status(404).json({ error: "Bot not found" });
      return;
    }

    await db.delete(botScheduledTasksTable).where(
      and(eq(botScheduledTasksTable.id, taskId), eq(botScheduledTasksTable.botId, botId))
    );

    if (bot.status === "active") {
      try { await stopBot(botId); await startBot(botId); } catch (err) {
        console.error("Failed to refresh scheduler after task delete:", err);
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting task:", err);
    res.status(500).json({ error: "Failed to delete task" });
  }
});

router.put("/bots/:id/tasks/:taskId", requireBotFactory, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);
    const taskId = parseInt(parseParam(req.params.taskId), 10);
    const { cronExpression, taskDescription, enabled } = req.body;

    const [bot] = await db
      .select()
      .from(botsTable)
      .where(and(eq(botsTable.id, botId), eq(botsTable.ownerId, userId)));

    if (!bot) {
      res.status(404).json({ error: "Bot not found" });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (cronExpression !== undefined) updates.cronExpression = cronExpression;
    if (taskDescription !== undefined) updates.taskDescription = taskDescription;
    if (enabled !== undefined) updates.enabled = enabled;

    const [updated] = await db
      .update(botScheduledTasksTable)
      .set(updates)
      .where(and(eq(botScheduledTasksTable.id, taskId), eq(botScheduledTasksTable.botId, botId)))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    if (bot.status === "active") {
      try {
        await stopBot(botId);
        await startBot(botId);
      } catch (err) {
        console.error("Failed to restart bot after task update:", err);
      }
    }

    res.json({ task: updated });
  } catch (err) {
    console.error("Error updating task:", err);
    res.status(500).json({ error: "Failed to update task" });
  }
});

router.get("/bots/marketplace/list", async (_req, res) => {
  try {
    const rawItems = await db
      .select()
      .from(botMarketplaceTable)
      .where(eq(botMarketplaceTable.active, true))
      .orderBy(asc(botMarketplaceTable.priceMonthly), desc(botMarketplaceTable.featured));

    const items = rawItems.map(({ personality, systemPrompt, ...rest }) => rest);
    res.json({ items });
  } catch (err) {
    console.error("Error listing marketplace:", err);
    res.status(500).json({ error: "Failed to list marketplace" });
  }
});

router.post("/bots/:id/linkedin/connect-request", requireBotFactory, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);
    const { profileUrn, message: customMessage } = req.body;

    const [bot] = await db
      .select()
      .from(botsTable)
      .where(and(eq(botsTable.id, botId), eq(botsTable.ownerId, userId)));

    if (!bot) {
      res.status(404).json({ error: "Bot not found" });
      return;
    }

    if (!profileUrn) {
      res.status(400).json({ error: "profileUrn is required" });
      return;
    }

    const { linkedinConnector } = await import("../lib/bot-connectors-extended");
    await linkedinConnector.sendConnectionRequest(botId, profileUrn, customMessage);
    res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send connection request";
    console.error("LinkedIn connection request error:", err);
    res.status(500).json({ error: message });
  }
});

router.post("/bots/marketplace/activate", requireBotFactory, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { marketplaceItemId } = req.body;

    const [item] = await db
      .select()
      .from(botMarketplaceTable)
      .where(eq(botMarketplaceTable.id, marketplaceItemId));

    if (!item) {
      res.status(404).json({ error: "Marketplace item not found" });
      return;
    }

    if (item.priceMonthly > 0) {
      res.status(402).json({ error: "Payment required", requiresCheckout: true, marketplaceItemId });
      return;
    }

    const existing = await db
      .select()
      .from(botSubscriptionsTable)
      .where(
        and(
          eq(botSubscriptionsTable.userId, userId),
          eq(botSubscriptionsTable.marketplaceItemId, marketplaceItemId)
        )
      );

    if (existing.length > 0 && existing[0].botId && existing[0].status === "active") {
      res.json({ bot: { id: existing[0].botId }, alreadyActive: true });
      return;
    }

    const [bot] = await db
      .insert(botsTable)
      .values({
        ownerId: userId,
        name: item.name,
        personality: item.personality,
        systemPrompt: item.systemPrompt,
        permissions: item.permissions,
        marketplaceItemId: item.id,
      })
      .returning();

    if (existing.length > 0) {
      await db
        .update(botSubscriptionsTable)
        .set({ botId: bot.id, status: "active" })
        .where(
          and(
            eq(botSubscriptionsTable.userId, userId),
            eq(botSubscriptionsTable.marketplaceItemId, marketplaceItemId)
          )
        );
    } else {
      await db.insert(botSubscriptionsTable).values({
        userId,
        marketplaceItemId: item.id,
        botId: bot.id,
        status: "active",
      });
    }

    res.json({ bot, activated: true });
  } catch (err) {
    console.error("Error activating marketplace bot:", err);
    res.status(500).json({ error: "Failed to activate bot" });
  }
});

router.get("/bots/marketplace/subscriptions", requireBotFactory, async (req, res) => {
  try {
    const userId = getUserId(req);
    const subs = await db
      .select()
      .from(botSubscriptionsTable)
      .where(eq(botSubscriptionsTable.userId, userId));

    res.json({ subscriptions: subs });
  } catch (err) {
    console.error("Error fetching subscriptions:", err);
    res.status(500).json({ error: "Failed to fetch subscriptions" });
  }
});

function getOAuthStateSecret(): string {
  const secret = process.env.BOT_OAUTH_STATE_SECRET || process.env.SESSION_SECRET;
  if (!secret) throw new Error("BOT_OAUTH_STATE_SECRET or SESSION_SECRET must be configured for OAuth flows");
  return secret;
}

async function signOAuthState(payload: Record<string, string>): Promise<string> {
  const { createHmac } = await import("crypto");
  const secret = getOAuthStateSecret();
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

async function verifyOAuthState(state: string): Promise<Record<string, string> | null> {
  const { createHmac, timingSafeEqual } = await import("crypto");
  let secret: string;
  try { secret = getOAuthStateSecret(); } catch { return null; }
  const parts = state.split(".");
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expected = createHmac("sha256", secret).update(data).digest("base64url");
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString()) as Record<string, string>;
    const ts = parseInt(payload.ts || "0", 10);
    if (Date.now() - ts > 10 * 60 * 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

router.get("/bots/oauth/gmail/url", requireBotFactory, async (req, res) => {
  try {
    const botId = req.query.botId as string;
    const userId = getUserId(req);
    const clientId = process.env.GMAIL_OAUTH_CLIENT_ID;
    if (!clientId) {
      res.status(500).json({ error: "Gmail OAuth not configured" });
      return;
    }

    const [bot] = await db.select().from(botsTable).where(and(eq(botsTable.id, parseInt(botId, 10)), eq(botsTable.ownerId, userId)));
    if (!bot) {
      res.status(403).json({ error: "Not your bot" });
      return;
    }

    const host = req.headers.host || process.env.REPLIT_DEV_DOMAIN || "localhost";
    const proto = req.headers["x-forwarded-proto"] || "https";
    const redirectUri = `${proto}://${host}/api/bots/oauth/gmail/callback`;
    const state = await signOAuthState({ botId, userId, ts: String(Date.now()) });
    const scopes = [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
    ].join(" ");
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;
    res.json({ url });
  } catch (err) {
    console.error("Gmail OAuth URL error:", err);
    res.status(500).json({ error: "Failed to generate OAuth URL" });
  }
});

router.get("/bots/oauth/gmail/callback", async (req, res) => {
  try {
    const code = req.query.code as string;
    const stateRaw = req.query.state as string;
    if (!code || !stateRaw) {
      res.status(400).send("Missing authorization code");
      return;
    }

    const statePayload = await verifyOAuthState(stateRaw);
    if (!statePayload) {
      res.status(403).send("Invalid or expired OAuth state");
      return;
    }

    const botId = parseInt(statePayload.botId, 10);
    const userId = statePayload.userId;

    const [bot] = await db.select().from(botsTable).where(and(eq(botsTable.id, botId), eq(botsTable.ownerId, userId)));
    if (!bot) {
      res.status(403).send("Bot ownership verification failed");
      return;
    }

    const clientId = process.env.GMAIL_OAUTH_CLIENT_ID || "";
    const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET || "";
    const host = req.headers.host || process.env.REPLIT_DEV_DOMAIN || "localhost";
    const proto = req.headers["x-forwarded-proto"] || "https";
    const redirectUri = `${proto}://${host}/api/bots/oauth/gmail/callback`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenRes.ok) {
      res.status(500).send("Failed to exchange authorization code");
      return;
    }

    const tokenData = await tokenRes.json() as { access_token: string; refresh_token?: string };

    const credentials = JSON.stringify({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      clientId,
      clientSecret,
    });

    const encryptedCreds = encryptCredentials(credentials);
    const webhookSecret = generateWebhookSecret();
    const webhookUrl = `${proto}://${host}/api/bots/webhook/email/${botId}`;

    const existing = await db
      .select()
      .from(botPlatformConnectionsTable)
      .where(and(eq(botPlatformConnectionsTable.botId, botId), eq(botPlatformConnectionsTable.platform, "email")));

    if (existing.length > 0) {
      await db.update(botPlatformConnectionsTable)
        .set({ credentials: encryptedCreds, webhookSecret, webhookUrl, status: "connected" })
        .where(eq(botPlatformConnectionsTable.id, existing[0].id));
    } else {
      await db.insert(botPlatformConnectionsTable).values({
        botId,
        platform: "email",
        credentials: encryptedCreds,
        webhookSecret,
        webhookUrl,
        status: "connected",
      });
    }

    if (bot.status === "active") {
      try { await startBot(botId); } catch (e) { console.error("Failed to start bot after Gmail OAuth:", e); }
    }

    res.send('<html><body><h2>Gmail connected successfully!</h2><p>You can close this window.</p><script>window.close();</script></body></html>');
  } catch (err) {
    console.error("Gmail OAuth callback error:", err);
    res.status(500).send("OAuth callback failed");
  }
});

router.get("/bots/oauth/linkedin/url", requireBotFactory, async (req, res) => {
  try {
    const botId = req.query.botId as string;
    const userId = getUserId(req);
    const clientId = process.env.LINKEDIN_OAUTH_CLIENT_ID;
    if (!clientId) {
      res.status(500).json({ error: "LinkedIn OAuth not configured" });
      return;
    }

    const [bot] = await db.select().from(botsTable).where(and(eq(botsTable.id, parseInt(botId, 10)), eq(botsTable.ownerId, userId)));
    if (!bot) {
      res.status(403).json({ error: "Not your bot" });
      return;
    }

    const host = req.headers.host || process.env.REPLIT_DEV_DOMAIN || "localhost";
    const proto = req.headers["x-forwarded-proto"] || "https";
    const redirectUri = `${proto}://${host}/api/bots/oauth/linkedin/callback`;
    const state = await signOAuthState({ botId, userId, ts: String(Date.now()) });
    const scopes = "r_liteprofile r_emailaddress w_member_social rw_organization_admin";
    const url = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(state)}`;
    res.json({ url });
  } catch (err) {
    console.error("LinkedIn OAuth URL error:", err);
    res.status(500).json({ error: "Failed to generate OAuth URL" });
  }
});

router.get("/bots/oauth/linkedin/callback", async (req, res) => {
  try {
    const code = req.query.code as string;
    const stateRaw = req.query.state as string;
    if (!code || !stateRaw) {
      res.status(400).send("Missing authorization code");
      return;
    }

    const statePayload = await verifyOAuthState(stateRaw);
    if (!statePayload) {
      res.status(403).send("Invalid or expired OAuth state");
      return;
    }

    const botId = parseInt(statePayload.botId, 10);
    const userId = statePayload.userId;

    const [bot] = await db.select().from(botsTable).where(and(eq(botsTable.id, botId), eq(botsTable.ownerId, userId)));
    if (!bot) {
      res.status(403).send("Bot ownership verification failed");
      return;
    }

    const clientId = process.env.LINKEDIN_OAUTH_CLIENT_ID || "";
    const clientSecret = process.env.LINKEDIN_OAUTH_CLIENT_SECRET || "";
    const host = req.headers.host || process.env.REPLIT_DEV_DOMAIN || "localhost";
    const proto = req.headers["x-forwarded-proto"] || "https";
    const redirectUri = `${proto}://${host}/api/bots/oauth/linkedin/callback`;

    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!tokenRes.ok) {
      res.status(500).send("Failed to exchange authorization code");
      return;
    }

    const tokenData = await tokenRes.json() as { access_token: string; expires_in?: number; refresh_token?: string };

    const credentials = JSON.stringify({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      clientId,
      clientSecret,
      expiresAt: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : undefined,
    });

    const encryptedCreds = encryptCredentials(credentials);
    const webhookSecret = generateWebhookSecret();
    const webhookUrl = `${proto}://${host}/api/bots/webhook/linkedin/${botId}`;

    const existing = await db
      .select()
      .from(botPlatformConnectionsTable)
      .where(and(eq(botPlatformConnectionsTable.botId, botId), eq(botPlatformConnectionsTable.platform, "linkedin")));

    if (existing.length > 0) {
      await db.update(botPlatformConnectionsTable)
        .set({ credentials: encryptedCreds, webhookSecret, webhookUrl, status: "connected" })
        .where(eq(botPlatformConnectionsTable.id, existing[0].id));
    } else {
      await db.insert(botPlatformConnectionsTable).values({
        botId,
        platform: "linkedin",
        credentials: encryptedCreds,
        webhookSecret,
        webhookUrl,
        status: "connected",
      });
    }

    if (bot.status === "active") {
      try { await startBot(botId); } catch (e) { console.error("Failed to start bot after LinkedIn OAuth:", e); }
    }

    res.send('<html><body><h2>LinkedIn connected successfully!</h2><p>You can close this window.</p><script>window.close();</script></body></html>');
  } catch (err) {
    console.error("LinkedIn OAuth callback error:", err);
    res.status(500).send("OAuth callback failed");
  }
});

const webhookRateLimits = new Map<number, { count: number; resetAt: number }>();

function checkBotRateLimit(bot: { id: number; rateLimitPerMinute: number }): boolean {
  const now = Date.now();
  let entry = webhookRateLimits.get(bot.id);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + 60_000 };
    webhookRateLimits.set(bot.id, entry);
  }
  entry.count++;
  return entry.count <= bot.rateLimitPerMinute;
}

async function verifyWebhookAuth(platform: string, botId: number, req: Request): Promise<boolean> {
  const [conn] = await db
    .select()
    .from(botPlatformConnectionsTable)
    .where(and(eq(botPlatformConnectionsTable.botId, botId), eq(botPlatformConnectionsTable.platform, platform)));

  if (!conn || conn.status !== "connected") return false;

  if (platform === "telegram") {
    const secretToken = req.headers["x-telegram-bot-api-secret-token"] as string | undefined;
    if (conn.webhookSecret) {
      return verifyTelegramWebhook(secretToken, conn.webhookSecret);
    }
    return false;
  }

  if (platform === "whatsapp") {
    const twilioSignature = req.headers["x-twilio-signature"] as string | undefined;
    if (conn.webhookSecret && twilioSignature) {
      let creds: { authToken?: string };
      try {
        creds = JSON.parse(decryptCredentials(conn.credentials));
      } catch {
        return false;
      }
      const authToken = creds.authToken || process.env.TWILIO_AUTH_TOKEN || "";
      if (!authToken) return false;
      const webhookUrl = conn.webhookUrl || "";
      return verifyTwilioSignature(twilioSignature, webhookUrl, req.body || {}, authToken);
    }
    if (!conn.webhookSecret) return false;
    return false;
  }

  if (platform === "facebook") {
    const signature = req.headers["x-hub-signature-256"] as string | undefined;
    if (!signature) return !conn.webhookSecret;
    let appSecret: string | undefined;
    try {
      const creds = JSON.parse(decryptCredentials(conn.credentials));
      appSecret = creds.appSecret;
    } catch {}
    const secret = appSecret || process.env.FACEBOOK_APP_SECRET || "";
    if (!secret) {
      console.warn(`[Facebook Bot ${botId}] No app secret configured — rejecting webhook`);
      return false;
    }
    const { createHmac, timingSafeEqual } = await import("crypto");
    const rawBody = req.rawBody;
    const bodyBuf = rawBody || Buffer.from(JSON.stringify(req.body));
    const expected = "sha256=" + createHmac("sha256", secret).update(bodyBuf).digest("hex");
    try {
      return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  if (platform === "discord" || platform === "email" || platform === "linkedin") {
    return false;
  }

  return false;
}

router.get("/bots/webhook/facebook/:botId", async (req, res) => {
  try {
    const botId = parseInt(parseParam(req.params.botId), 10);
    const mode = req.query["hub.mode"] as string;
    const token = req.query["hub.verify_token"] as string;
    const challenge = req.query["hub.challenge"] as string;

    if (mode !== "subscribe") {
      res.status(403).json({ error: "Invalid mode" });
      return;
    }

    const [conn] = await db
      .select()
      .from(botPlatformConnectionsTable)
      .where(and(eq(botPlatformConnectionsTable.botId, botId), eq(botPlatformConnectionsTable.platform, "facebook")));

    if (!conn) {
      res.status(404).json({ error: "Connection not found" });
      return;
    }

    if (token !== conn.webhookSecret) {
      res.status(403).json({ error: "Verify token mismatch" });
      return;
    }

    res.status(200).send(challenge);
  } catch (err) {
    console.error("Facebook webhook verification error:", err);
    res.status(500).json({ error: "Verification failed" });
  }
});

router.post("/bots/webhook/:platform/:botId", async (req, res) => {
  try {
    const botId = parseInt(parseParam(req.params.botId), 10);
    const platform = parseParam(req.params.platform) as PlatformType;

    const [bot] = await db
      .select()
      .from(botsTable)
      .where(eq(botsTable.id, botId));

    if (!bot || bot.status !== "active") {
      res.status(404).json({ error: "Bot not found or inactive" });
      return;
    }

    const ownerHasAccess = await hasFeature(bot.ownerId, undefined, "bot_factory");
    if (!ownerHasAccess) {
      res.status(403).json({ error: "Bot owner subscription inactive" });
      return;
    }

    const verified = await verifyWebhookAuth(platform, botId, req);
    if (!verified) {
      res.status(403).json({ error: "Webhook verification failed" });
      return;
    }

    if (!checkBotRateLimit(bot)) {
      res.status(429).json({ error: "Rate limit exceeded" });
      return;
    }

    let text = "";
    let externalUserId = "";

    if (platform === "whatsapp") {
      text = req.body.Body || "";
      externalUserId = (req.body.From || "").replace("whatsapp:", "");
    } else if (platform === "telegram") {
      text = req.body.message?.text || "";
      externalUserId = String(req.body.message?.chat?.id || "");
    } else if (platform === "facebook") {
      const entry = req.body?.entry?.[0];
      const messaging = entry?.messaging?.[0];
      text = messaging?.message?.text || "";
      externalUserId = messaging?.sender?.id || "";
    }

    if (!text) {
      res.json({ ok: true });
      return;
    }

    const response = await processIncomingMessage(bot, {
      platform,
      externalUserId,
      text,
    });

    const connector = getConnector(platform);
    if (connector) {
      await connector.send(botId, externalUserId, { text: response });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;
