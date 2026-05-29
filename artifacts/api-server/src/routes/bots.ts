import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, and, desc, asc, or, inArray, isNotNull } from "drizzle-orm";
import {
  db,
  botsTable,
  botPlatformConnectionsTable,
  botMemoryTable,
  botScheduledTasksTable,
  botConversationLogsTable,
  botMarketplaceTable,
  botSubscriptionsTable,
  botDirectivesTable,
  orgMembersTable,
  hasRoleAccess,
  type PlatformType,
  type PermissionKey,
  type OrgRole,
  type BotDirectiveScope,
} from "@workspace/db";
import { artAssetsTable } from "@workspace/db";
import { composeSalarymanPrompt } from "../lib/salaryman-art";
import { createImageTask, isNanoBananaConfigured } from "../lib/nano-banana";
import { startBot, stopBot, processIncomingMessage } from "../lib/bot-engine";
import { getConnector } from "../lib/bot-connectors";
import { encryptCredentials, generateWebhookSecret, verifyTelegramWebhook, verifyTwilioSignature, decryptCredentials } from "../lib/bot-crypto";
import { hasFeature } from "../lib/plan";
import { openai } from "@workspace/integrations-openai-ai-server";

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

function requireBotAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  next();
}

async function requireBotFactory(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const userId = getUserId(req);
  const email = getUserEmail(req);
  const hasClawBot = await hasFeature(userId, email, "claw_bot");
  if (!hasClawBot) {
    res.status(403).json({ error: "Pixel Agents subscription required", feature: "claw_bot" });
    return;
  }
  next();
}

async function getUserActiveOrgIds(userId: string): Promise<number[]> {
  if (!userId) return [];
  const rows = await db.select({ orgId: orgMembersTable.orgId })
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")));
  return rows.map(r => r.orgId);
}

async function getOrgRole(userId: string, orgId: number): Promise<OrgRole | null> {
  if (!userId || !orgId) return null;
  const [row] = await db.select({ role: orgMembersTable.role })
    .from(orgMembersTable)
    .where(and(
      eq(orgMembersTable.userId, userId),
      eq(orgMembersTable.orgId, orgId),
      eq(orgMembersTable.status, "active"),
    ));
  return (row?.role as OrgRole | undefined) ?? null;
}

async function loadBotForUser(botId: number, userId: string) {
  const orgIds = await getUserActiveOrgIds(userId);
  const orgClause = orgIds.length > 0
    ? and(isNotNull(botsTable.orgId), inArray(botsTable.orgId, orgIds))
    : undefined;
  const accessClause = orgClause
    ? or(eq(botsTable.ownerId, userId), orgClause)
    : eq(botsTable.ownerId, userId);
  const [bot] = await db.select().from(botsTable).where(and(eq(botsTable.id, botId), accessClause));
  return bot ?? null;
}

async function requireBotWrite(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const userId = getUserId(req);
  const botId = parseInt(parseParam(req.params.id), 10);
  if (!botId || isNaN(botId)) { next(); return; }
  try {
    const bot = await loadBotForUser(botId, userId);
    if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }
    // Org-shared bots: writes require role >= manager in the owning org.
    if (bot.orgId && bot.ownerId !== userId) {
      const role = await getOrgRole(userId, bot.orgId);
      if (!role || !hasRoleAccess(role, "manager")) {
        res.status(403).json({ error: "Manager role required to modify org-owned bots" });
        return;
      }
      next();
      return;
    }
    if (bot.marketplaceItemId) {
      const [item] = await db.select().from(botMarketplaceTable).where(eq(botMarketplaceTable.id, bot.marketplaceItemId));
      if (item && item.priceMonthly <= 0) {
        next();
        return;
      }
    }
    const email = getUserEmail(req);
    const hasClawBot = await hasFeature(userId, email, "claw_bot");
    if (!hasClawBot) {
      res.status(403).json({ error: "Pixel Agents subscription required", feature: "claw_bot" });
      return;
    }
    next();
  } catch (err) {
    console.error("requireBotWrite authorization check failed:", err);
    res.status(500).json({ error: "Authorization check failed" });
    return;
  }
}

function parseParam(val: string | string[] | undefined): string {
  if (Array.isArray(val)) return val[0] ?? "";
  return val ?? "";
}

router.get("/bots", requireBotAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const orgIds = await getUserActiveOrgIds(userId);
    const orgClause = orgIds.length > 0
      ? and(isNotNull(botsTable.orgId), inArray(botsTable.orgId, orgIds))
      : undefined;
    const where = orgClause
      ? or(eq(botsTable.ownerId, userId), orgClause)
      : eq(botsTable.ownerId, userId);
    const bots = await db
      .select()
      .from(botsTable)
      .where(where)
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
        name: primeName(name.trim()),
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

/**
 * POST /bots/:id/portrait — ensure a Pro-baked cutscene portrait exists for
 * this specific bot. Idempotent: re-calling returns the same row. The art
 * key is `bot_portrait_<id>` so the existing /api/art/asset/:key polling
 * machinery (and the useArtAsset hook) Just Works.
 *
 * Generation is keyed off the bot's name + personality so each unit gets
 * a distinct face. Falls back gracefully if Nano Banana isn't configured.
 */
router.post("/bots/:id/portrait", requireBotAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);
    if (!botId || isNaN(botId)) { res.status(400).json({ error: "Invalid bot id" }); return; }
    const bot = await loadBotForUser(botId, userId);
    if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }

    const key = `bot_portrait_${bot.id}`;
    // Build a Salaryman-style portrait subject seeded by the bot's identity.
    const personality = (bot.personality || "").slice(0, 280).replace(/\s+/g, " ").trim();
    const subject = [
      `Hyper-detailed pixel-art portrait of "${bot.name}", a sentient office bot from the Salaryman roster.`,
      "Chest-up, slight three-quarter turn to camera, dialogue-frame composition with empty headroom on the right for a speech bubble.",
      personality
        ? `Personality cues — design the chassis and pose to reflect: ${personality}.`
        : "Distinctive chassis with a single glowing visor, clean industrial lines.",
      "Dramatic neon rim-light: hot pink from camera-left, cyan from behind. Background: a faint corporate hallway smeared with neon.",
    ].join(" ");
    const prompt = composeSalarymanPrompt(subject);

    // Upsert the row
    const [existing] = await db.select().from(artAssetsTable).where(eq(artAssetsTable.key, key));
    let asset = existing;
    if (!asset) {
      const [created] = await db.insert(artAssetsTable).values({
        key,
        category: "character",
        subject,
        prompt,
        aspectRatio: "3:4",
        status: "pending",
      }).returning();
      asset = created;
    }

    // Kick off generation if there's no url yet and no in-flight task
    if (asset && !asset.url && !asset.taskId && asset.status !== "failed" && isNanoBananaConfigured()) {
      try {
        const taskId = await createImageTask({
          prompt,
          aspectRatio: "3:4" as any,
          resolution: "1K",
          outputFormat: "jpg",
        });
        const [updated] = await db.update(artAssetsTable)
          .set({ taskId, status: "pending", failMsg: null, updatedAt: new Date() })
          .where(eq(artAssetsTable.id, asset.id))
          .returning();
        asset = updated || asset;
      } catch (e: any) {
        const msg = (e?.message || String(e)).slice(0, 1000);
        const [updated] = await db.update(artAssetsTable)
          .set({ status: "failed", failMsg: msg, updatedAt: new Date() })
          .where(eq(artAssetsTable.id, asset.id))
          .returning();
        asset = updated || asset;
      }
    }

    res.json({ asset, key });
  } catch (err) {
    console.error("Error minting bot portrait:", err);
    res.status(500).json({ error: "Failed to mint portrait" });
  }
});

router.get("/bots/:id", requireBotAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);

    const bot = await loadBotForUser(botId, userId);

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

router.put("/bots/:id", requireBotWrite, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);
    const { name, personality, systemPrompt, permissions, maxTokensPerResponse, rateLimitPerMinute, status } = req.body;

    const existing = await loadBotForUser(botId, userId);

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

router.delete("/bots/:id", requireBotWrite, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);

    const existing = await loadBotForUser(botId, userId);

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

router.post("/bots/:id/collaboration", requireBotWrite, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);
    const { enabled, collaborationRole } = req.body;

    const bot = await loadBotForUser(botId, userId);

    if (!bot) {
      res.status(404).json({ error: "Bot not found" });
      return;
    }

    const updates: Partial<Record<string, unknown>> = {};
    if (enabled !== undefined) updates.collaborationEnabled = !!enabled;
    if (collaborationRole !== undefined) updates.collaborationRole = collaborationRole;

    const [updated] = await db
      .update(botsTable)
      .set(updates)
      .where(eq(botsTable.id, botId))
      .returning();

    res.json({ bot: updated });
  } catch (err) {
    console.error("Error updating collaboration:", err);
    res.status(500).json({ error: "Failed to update collaboration" });
  }
});

router.post("/bots/:id/spawn-custom", requireBotWrite, async (req, res) => {
  try {
    const userId = getUserId(req);
    const parentBotId = parseInt(parseParam(req.params.id), 10);
    const { name, personality, systemPrompt, permissions, collaborationRole } = req.body;

    const parent = await loadBotForUser(parentBotId, userId);

    if (!parent) {
      res.status(404).json({ error: "Parent bot not found" });
      return;
    }

    const existingChildren = await db
      .select()
      .from(botsTable)
      .where(and(eq(botsTable.ownerId, userId), eq(botsTable.parentBotId, parentBotId)));

    if (existingChildren.length >= 5) {
      res.status(400).json({ error: "Maximum 5 custom sub-bots per parent bot" });
      return;
    }

    const [child] = await db
      .insert(botsTable)
      .values({
        ownerId: userId,
        name: name?.trim() || `${parent.name} (Custom)`,
        personality: personality || parent.personality,
        systemPrompt: systemPrompt || parent.systemPrompt,
        permissions: permissions || parent.permissions,
        maxTokensPerResponse: parent.maxTokensPerResponse,
        rateLimitPerMinute: parent.rateLimitPerMinute,
        parentBotId,
        collaborationEnabled: true,
        collaborationRole: collaborationRole || "specialist",
      })
      .returning();

    res.json({ bot: child });
  } catch (err) {
    console.error("Error spawning custom bot:", err);
    res.status(500).json({ error: "Failed to spawn custom bot" });
  }
});

router.get("/bots/:id/team", requireBotAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);

    const bot = await loadBotForUser(botId, userId);

    if (!bot) {
      res.status(404).json({ error: "Bot not found" });
      return;
    }

    const teamWhere = bot.orgId
      ? or(eq(botsTable.ownerId, userId), eq(botsTable.orgId, bot.orgId))
      : eq(botsTable.ownerId, userId);
    const allBots = await db
      .select()
      .from(botsTable)
      .where(teamWhere);

    const collaborators = allBots.filter(b => b.collaborationEnabled && b.id !== botId);
    const children = allBots.filter(b => b.parentBotId === botId);

    res.json({
      team: collaborators.map(b => ({
        id: b.id,
        name: b.name,
        status: b.status,
        role: b.collaborationRole || "general",
        isChild: b.parentBotId === botId,
        permissions: b.permissions,
      })),
      children: children.map(b => ({
        id: b.id,
        name: b.name,
        status: b.status,
        role: b.collaborationRole || "specialist",
        permissions: b.permissions,
      })),
    });
  } catch (err) {
    console.error("Error fetching team:", err);
    res.status(500).json({ error: "Failed to fetch team" });
  }
});

router.post("/bots/:id/connect", requireBotWrite, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);
    const { platform, credentials } = req.body;

    const bot = await loadBotForUser(botId, userId);

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

router.post("/bots/:id/disconnect", requireBotWrite, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);
    const { platform } = req.body;

    const bot = await loadBotForUser(botId, userId);

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

router.get("/bots/:id/logs", requireBotAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);
    const limit = parseInt(req.query.limit as string, 10) || 50;

    const bot = await loadBotForUser(botId, userId);

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

router.post("/bots/:id/test-chat", requireBotWrite, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);
    const { message } = req.body;

    if (!message || !message.trim()) {
      res.status(400).json({ error: "Message is required" });
      return;
    }

    const bot = await loadBotForUser(botId, userId);

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

router.get("/bots/:id/memory", requireBotAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);

    const bot = await loadBotForUser(botId, userId);

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

router.delete("/bots/:id/memory/:memoryId", requireBotWrite, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);
    const memoryId = parseInt(parseParam(req.params.memoryId), 10);

    const bot = await loadBotForUser(botId, userId);

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

router.get("/bots/:id/tasks", requireBotAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);

    const bot = await loadBotForUser(botId, userId);

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

router.post("/bots/:id/tasks", requireBotWrite, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);
    const { cronExpression, taskDescription, enabled } = req.body;

    const bot = await loadBotForUser(botId, userId);

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

router.delete("/bots/:id/tasks/:taskId", requireBotWrite, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);
    const taskId = parseInt(parseParam(req.params.taskId), 10);

    const bot = await loadBotForUser(botId, userId);

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

router.put("/bots/:id/tasks/:taskId", requireBotWrite, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);
    const taskId = parseInt(parseParam(req.params.taskId), 10);
    const { cronExpression, taskDescription, enabled } = req.body;

    const bot = await loadBotForUser(botId, userId);

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

router.post("/bots/:id/linkedin/connect-request", requireBotWrite, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);
    const { profileUrn, message: customMessage } = req.body;

    const bot = await loadBotForUser(botId, userId);

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

router.post("/bots/marketplace/activate", requireBotAuth, async (req, res) => {
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

    if (item.priceMonthly > 0 || item.slug === "claw-bot") {
      const email = getUserEmail(req);
      const hasClawBot = await hasFeature(userId, email, "claw_bot");
      if (!hasClawBot) {
        res.status(403).json({ error: "Pixel Agents subscription required", feature: "claw_bot", requiresUpgrade: true });
        return;
      }
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

    const activeOrgIds = await getUserActiveOrgIds(userId);
    const stampOrgId = activeOrgIds.length === 1 ? activeOrgIds[0] : null;

    const [bot] = await db
      .insert(botsTable)
      .values({
        ownerId: userId,
        orgId: stampOrgId,
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
        .set({ botId: bot.id, orgId: stampOrgId, status: "active" })
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
        orgId: stampOrgId,
        status: "active",
      }).onConflictDoUpdate({
        target: [botSubscriptionsTable.userId, botSubscriptionsTable.marketplaceItemId],
        set: { botId: bot.id, orgId: stampOrgId, status: "active" },
      });
    }

    res.json({ bot, activated: true });
  } catch (err) {
    console.error("Error activating marketplace bot:", err);
    res.status(500).json({ error: "Failed to activate bot" });
  }
});

router.get("/bots/marketplace/subscriptions", requireBotAuth, async (req, res) => {
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

    const bot = await loadBotForUser(parseInt(botId, 10), userId);
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

    const bot = await loadBotForUser(botId, userId);
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

    const bot = await loadBotForUser(parseInt(botId, 10), userId);
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

    const bot = await loadBotForUser(botId, userId);
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

    let needsClawBot = true;
    if (bot.marketplaceItemId) {
      const [item] = await db.select().from(botMarketplaceTable).where(eq(botMarketplaceTable.id, bot.marketplaceItemId));
      if (item && item.priceMonthly <= 0) needsClawBot = false;
    }
    if (needsClawBot) {
      const ownerHasAccess = await hasFeature(bot.ownerId, undefined, "claw_bot");
      if (!ownerHasAccess) {
        res.status(403).json({ error: "Bot owner subscription inactive" });
        return;
      }
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

const BOT_RECOMMEND_SYSTEM = `You are Pablo, the AI assistant for Salaryman by Picasso.AI. The user will describe what they need automated. Your job is to recommend the best bots from the Pixel Agents Bot Factory (managed by Jean Claw).

You have access to TWO sources of bots:

SOURCE 1 — MARKETPLACE BOTS (78 pre-built bots included with Pixel Agents $145/mo):
These are fully built bots ready to activate. You'll receive the current marketplace catalog.

SOURCE 2 — CUSTOM BOT TEMPLATES (50+ templates for creating your own):
Categories: Sales & Outreach, Customer Service, Marketing & Content, HR & Recruiting, Operations & Admin, Finance & Billing, Data & Analytics, Development & IT, Social Media, E-Commerce, Legal & Compliance, Personal & Utility.

Templates include: Cold Outreach, Lead Qualifier, Sales Closer, Pipeline Manager, Upsell Agent, Helpdesk Tier-1, Live Chat Agent, FAQ Auto-Responder, Feedback Collector, Escalation Router, Blog Writer, Email Campaign, SEO Optimizer, Ad Copy Generator, PR & Press, Recruiter, Onboarding, Interview Scheduler, Employee Pulse, Appointment Scheduler, Document Processor, Meeting Notes, Inventory Tracker, Task Dispatcher, Workflow Automator, Invoice Generator, Expense Tracker, Revenue Reporter, Payroll Assistant, Report Generator, Survey Analyst, Competitor Monitor, Data Cleaner, Bug Reporter, Deployment Notifier, Status Page, Code Reviewer, Social Scheduler, Community Manager, Influencer Scout, Review Responder, Order Manager, Cart Recovery, Product Recommender, Pricing Monitor, Contract Reviewer, Compliance Monitor, NDA Manager, Daily Briefing, Habit Tracker, Travel Planner, Email Triage, Knowledge Base, Vendor Manager, Localization, Webinar Manager.

RESPONSE FORMAT — respond in valid JSON only:
{
  "recommendations": [
    {
      "type": "marketplace" or "custom",
      "name": "BOT NAME",
      "slug": "bot-slug (marketplace only, null for custom)",
      "reason": "1-2 sentence explanation of why this bot fits their need",
      "category": "category name"
    }
  ],
  "summary": "Brief 1-2 sentence overview of your recommendation strategy",
  "tip": "Optional pro tip about combining bots or getting the most out of them"
}

Return 1-5 recommendations, ranked by relevance. Always prefer marketplace bots when available. Suggest custom templates only when no marketplace bot fits or as a complement. Be specific about WHY each bot helps.`;

router.post("/bots/recommend", requireAuth, async (req: Request, res: Response) => {
  const { description } = (req.body ?? {}) as { description?: string };
  if (!description || typeof description !== "string" || !description.trim()) {
    res.status(400).json({ error: "description required" });
    return;
  }

  try {
    const marketplaceItems = await db
      .select({ name: botMarketplaceTable.name, slug: botMarketplaceTable.slug, tagline: botMarketplaceTable.tagline, category: botMarketplaceTable.category })
      .from(botMarketplaceTable)
      .orderBy(asc(botMarketplaceTable.name));

    const catalogText = marketplaceItems.map(b => `- ${b.name} (${b.slug}) [${b.category}]: ${b.tagline}`).join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: BOT_RECOMMEND_SYSTEM },
        { role: "user", content: `MARKETPLACE CATALOG:\n${catalogText}\n\nUSER NEED: ${description.slice(0, 500)}` },
      ],
      max_tokens: 800,
      temperature: 0.4,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }
    const recommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 5).map((r: any) => ({
      type: typeof r.type === 'string' ? r.type : 'marketplace',
      name: typeof r.name === 'string' ? r.name : 'Unknown Bot',
      slug: typeof r.slug === 'string' ? r.slug : null,
      reason: typeof r.reason === 'string' ? r.reason : '',
      category: typeof r.category === 'string' ? r.category : '',
    })) : [];
    res.json({
      recommendations,
      summary: typeof parsed.summary === 'string' ? parsed.summary : 'Here are my recommendations based on your needs.',
      tip: typeof parsed.tip === 'string' ? parsed.tip : undefined,
    });
  } catch (err) {
    console.error("[Bot Recommend] Error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Recommendation engine temporarily unavailable" });
  }
});

// ============================================================
// Bot Directives — manager+ issues org-wide commands to bots
// ============================================================

async function requireOrgManager(req: Request, res: Response): Promise<{ userId: string; orgId: number } | null> {
  const userId = getUserId(req);
  const orgId = parseInt(parseParam(req.params.orgId), 10);
  if (!Number.isFinite(orgId)) {
    res.status(400).json({ error: "Invalid orgId" });
    return null;
  }
  const role = await getOrgRole(userId, orgId);
  if (!role || !hasRoleAccess(role, "manager")) {
    res.status(403).json({ error: "Manager role or higher required" });
    return null;
  }
  return { userId, orgId };
}

router.get("/orgs/:orgId/bot-directives", requireBotAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const orgId = parseInt(parseParam(req.params.orgId), 10);
    if (!Number.isFinite(orgId)) {
      res.status(400).json({ error: "Invalid orgId" });
      return;
    }
    const role = await getOrgRole(userId, orgId);
    if (!role) {
      res.status(403).json({ error: "Active org membership required" });
      return;
    }

    const rows = await db.select().from(botDirectivesTable)
      .where(eq(botDirectivesTable.orgId, orgId))
      .orderBy(desc(botDirectivesTable.createdAt));

    const now = new Date();
    const annotated = rows.map(d => ({
      ...d,
      effectiveStatus: d.status === "active" && d.expiresAt && d.expiresAt < now ? "expired" : d.status,
    }));
    res.json({ directives: annotated });
  } catch (err) {
    console.error("Error listing bot directives:", err);
    res.status(500).json({ error: "Failed to list directives" });
  }
});

router.post("/orgs/:orgId/bot-directives", requireBotAuth, async (req, res) => {
  try {
    const ctx = await requireOrgManager(req, res);
    if (!ctx) return;
    const { message, scope = "all", targetBotIds = [], expiresAt } = req.body ?? {};
    const trimmed = typeof message === "string" ? message.trim() : "";
    if (!trimmed || trimmed.length > 2000) {
      res.status(400).json({ error: "message required (1-2000 chars)" });
      return;
    }
    if (scope !== "all" && scope !== "specific") {
      res.status(400).json({ error: "scope must be 'all' or 'specific'" });
      return;
    }
    let validatedTargets: number[] = [];
    if (scope === "specific") {
      if (!Array.isArray(targetBotIds) || targetBotIds.length === 0) {
        res.status(400).json({ error: "targetBotIds required when scope='specific'" });
        return;
      }
      const ids = targetBotIds.map((n: any) => parseInt(n, 10)).filter((n: number) => Number.isFinite(n));
      if (ids.length === 0) {
        res.status(400).json({ error: "No valid bot ids" });
        return;
      }
      const orgBots = await db.select({ id: botsTable.id }).from(botsTable)
        .where(and(eq(botsTable.orgId, ctx.orgId), inArray(botsTable.id, ids)));
      validatedTargets = orgBots.map(b => b.id);
      if (validatedTargets.length === 0) {
        res.status(400).json({ error: "None of the target bots belong to this org" });
        return;
      }
    }
    let parsedExpiry: Date | null = null;
    if (expiresAt) {
      const d = new Date(expiresAt);
      if (Number.isNaN(d.getTime())) {
        res.status(400).json({ error: "Invalid expiresAt" });
        return;
      }
      parsedExpiry = d;
    }

    const [created] = await db.insert(botDirectivesTable).values({
      orgId: ctx.orgId,
      issuedBy: ctx.userId,
      message: trimmed,
      scope: scope as BotDirectiveScope,
      targetBotIds: validatedTargets,
      status: "active",
      expiresAt: parsedExpiry,
    }).returning();

    res.json({ directive: created });
  } catch (err) {
    console.error("Error creating bot directive:", err);
    res.status(500).json({ error: "Failed to create directive" });
  }
});

router.delete("/orgs/:orgId/bot-directives/:id", requireBotAuth, async (req, res) => {
  try {
    const ctx = await requireOrgManager(req, res);
    if (!ctx) return;
    const directiveId = parseInt(parseParam(req.params.id), 10);
    if (!Number.isFinite(directiveId)) {
      res.status(400).json({ error: "Invalid directive id" });
      return;
    }
    const [updated] = await db.update(botDirectivesTable)
      .set({ status: "rescinded" })
      .where(and(eq(botDirectivesTable.id, directiveId), eq(botDirectivesTable.orgId, ctx.orgId)))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Directive not found" });
      return;
    }
    res.json({ directive: updated });
  } catch (err) {
    console.error("Error rescinding bot directive:", err);
    res.status(500).json({ error: "Failed to rescind directive" });
  }
});

export default router;
