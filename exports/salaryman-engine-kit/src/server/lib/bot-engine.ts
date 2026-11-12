import {
  db,
  botsTable,
  botMemoryTable,
  botConversationLogsTable,
  botPlatformConnectionsTable,
  botScheduledTasksTable,
  botDirectivesTable,
  usersTable,
  type Bot,
  type PlatformType,
} from "@workspace/db";
import { eq, and, desc, or, gt, isNull, inArray, sql } from "drizzle-orm";
import { streamWithRouter } from "./ai-router";
import { getConnector, type IncomingMessage } from "./bot-connectors";
import { matchSkill, executeSkill, getSkillCatalog } from "./ai-skills";
import { parseMusicGenerateBlock, generateMusic, isMusicConfigured } from "./suno-connector";
import { hasFeature } from "./plan";

const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  ai_chat: "General AI conversation and knowledge queries",
  crm_read: "Read CRM/contact data",
  crm_write: "Create or update CRM/contact records",
  email_send: "Draft and send emails",
  calendar_read: "View calendar events and availability",
  calendar_write: "Create, modify, or cancel calendar events",
  documents_read: "Read documents and files",
  contacts_read: "Look up contact information",
  contacts_write: "Add or update contacts",
  trading_read: "Read portfolio positions and market data",
  trading_execute: "Execute live trades through Schwab API",
  trading_paper: "Run simulated paper trades against real market data",
  linkedin_outreach: "Send LinkedIn messages and connection requests for recruitment outreach",
  recruitment_manage: "Manage candidate tracking, recruitment pipeline, and hiring correspondence",
  music_generate: "Generate AI music tracks, beats, instrumentals, and full songs via Replicate MusicGen",
  audio_generate: "Generate audio content — voice, sound effects, and audio processing",
};

async function buildDirectiveContext(bot: Bot): Promise<string> {
  if (!bot.orgId) return "";
  const now = new Date();
  const rows = await db.select().from(botDirectivesTable)
    .where(and(
      eq(botDirectivesTable.orgId, bot.orgId),
      eq(botDirectivesTable.status, "active"),
      or(isNull(botDirectivesTable.expiresAt), gt(botDirectivesTable.expiresAt, now)),
    ))
    .orderBy(desc(botDirectivesTable.createdAt))
    .limit(20);
  const applicable = rows.filter(d =>
    d.scope === "all" || (Array.isArray(d.targetBotIds) && d.targetBotIds.includes(bot.id))
  );
  if (applicable.length === 0) return "";
  const lines = applicable.map(d => `- ${d.message}`).join("\n");
  return `\n\nMANAGEMENT DIRECTIVES (currently in effect from your organization's leadership — follow these in addition to your base instructions):\n${lines}`;
}

function buildPermissionContext(permissions: string[]): string {
  if (!permissions.length) return "";
  const allowed = permissions
    .map(p => `- ${PERMISSION_DESCRIPTIONS[p] || p}`)
    .join("\n");
  const allKeys = Object.keys(PERMISSION_DESCRIPTIONS);
  const denied = allKeys
    .filter(k => !permissions.includes(k))
    .map(k => `- ${PERMISSION_DESCRIPTIONS[k]}`);

  let ctx = `\n\nACCESS PERMISSIONS (strictly enforced):\nYou ARE allowed to:\n${allowed}`;
  if (denied.length > 0) {
    ctx += `\n\nYou are NOT allowed to (refuse these requests politely):\n${denied.join("\n")}`;
  }
  return ctx;
}

const PERMISSION_ACTION_PATTERNS: Record<string, RegExp[]> = {
  email_send: [/send\s+(an?\s+)?email/i, /email\s+(to|this|that)/i, /compose\s+(an?\s+)?email/i, /mail\s+(to|this)/i],
  calendar_write: [/schedule\s+(a|an|the)\s+(meeting|event|call)/i, /create\s+(a|an)?\s*(calendar|event|meeting)/i, /book\s+(a|an)?\s*(meeting|slot|time)/i, /cancel\s+(the|my|a)\s*(meeting|event)/i],
  calendar_read: [/check\s+(my|the)?\s*calendar/i, /what('s| is)\s+(on\s+)?(my\s+)?schedule/i, /am\s+i\s+(free|available)/i],
  crm_write: [/create\s+(a|an)?\s*(contact|lead|deal|customer)/i, /add\s+(a|an)?\s*(contact|lead|deal|customer)/i, /update\s+(the|a)?\s*(contact|lead|deal|customer)/i],
  crm_read: [/look\s*up\s+(a|the)?\s*(contact|lead|deal|customer)/i, /search\s+(for\s+)?(contacts|leads|deals|customers)/i, /show\s+(me\s+)?(the\s+)?(contacts|leads|deals|customers)/i],
  contacts_write: [/add\s+(a|an)?\s*contact/i, /save\s+(this|the)?\s*contact/i, /update\s+(a|the)?\s*contact/i],
  contacts_read: [/find\s+(a|the)?\s*contact/i, /who\s+is\s+/i, /contact\s+(info|details|information)\s+(for|of|about)/i],
  documents_read: [/read\s+(the|this|a)?\s*(document|file|doc)/i, /open\s+(the|this|a)?\s*(document|file|doc)/i, /show\s+(me\s+)?(the|this|a)?\s*(document|file|doc)/i],
  linkedin_outreach: [/send\s+(a\s+)?linkedin\s+message/i, /connect\s+(with|to)\s+(them|this person|candidate)/i, /linkedin\s+outreach/i, /inmail/i],
  recruitment_manage: [/track\s+(this\s+)?(candidate|applicant)/i, /update\s+(the\s+)?(hiring|recruitment)\s+pipeline/i, /move\s+(to\s+)?(next|previous)\s+stage/i, /candidate\s+status/i],
  music_generate: [/make\s+(a|me|an?)?\s*(song|beat|track|instrumental|music)/i, /generate\s+(a|an?)?\s*(song|beat|track|instrumental|music)/i, /create\s+(a|an?)?\s*(song|beat|track|instrumental|music)/i, /produce\s+(a|an?)?\s*(song|beat|track|instrumental)/i],
  audio_generate: [/generate\s+(audio|sound|voice)/i, /create\s+(audio|sound|sfx)/i, /text\s*to\s*speech/i, /voice\s*over/i],
};

function enforcePermissions(permissions: string[], userMessage: string): string | null {
  if (!permissions.includes("ai_chat")) {
    return "This bot is not authorized for conversation. Please contact the bot owner.";
  }

  const allKeys = Object.keys(PERMISSION_ACTION_PATTERNS);
  const denied = allKeys.filter(k => !permissions.includes(k));

  for (const deniedPerm of denied) {
    const patterns = PERMISSION_ACTION_PATTERNS[deniedPerm];
    if (!patterns) continue;
    for (const pattern of patterns) {
      if (pattern.test(userMessage)) {
        const desc = PERMISSION_DESCRIPTIONS[deniedPerm] || deniedPerm;
        return `I'm not authorized to perform that action. The capability "${desc}" is not enabled for this bot. Please contact the bot owner to update permissions.`;
      }
    }
  }
  return null;
}

const OUTPUT_ACTION_MARKERS: Record<string, RegExp[]> = {
  email_send: [/\[ACTION:SEND_EMAIL\]/i, /I('ve| have) sent (the|an|your) email/i, /Email sent to/i],
  calendar_write: [/\[ACTION:CREATE_EVENT\]/i, /\[ACTION:CANCEL_EVENT\]/i, /I('ve| have) (scheduled|booked|cancelled)/i],
  crm_write: [/\[ACTION:CREATE_CONTACT\]/i, /\[ACTION:UPDATE_DEAL\]/i, /I('ve| have) (created|updated|added) (the|a|an)? ?(contact|lead|deal)/i],
  contacts_write: [/\[ACTION:ADD_CONTACT\]/i, /I('ve| have) (saved|added|updated) (the|this)? ?contact/i],
  music_generate: [/\[MUSIC_GENERATE\]/i],
};

function sanitizeOutput(permissions: string[], response: string): string {
  const denied = Object.keys(OUTPUT_ACTION_MARKERS).filter(k => !permissions.includes(k));
  for (const deniedPerm of denied) {
    const markers = OUTPUT_ACTION_MARKERS[deniedPerm];
    if (!markers) continue;
    for (const marker of markers) {
      if (marker.test(response)) {
        return "I attempted to perform an action I'm not authorized for. The request has been blocked. Please contact the bot owner to update permissions.";
      }
    }
  }
  return response;
}

const scheduledIntervals = new Map<number, NodeJS.Timeout[]>();
const messageRateLimits = new Map<number, { count: number; resetAt: number }>();

function checkRateLimit(bot: Bot): boolean {
  const now = Date.now();
  let entry = messageRateLimits.get(bot.id);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + 60_000 };
    messageRateLimits.set(bot.id, entry);
  }
  entry.count++;
  return entry.count <= bot.rateLimitPerMinute;
}

export async function processIncomingMessage(
  bot: Bot,
  msg: IncomingMessage
): Promise<string> {
  if (!checkRateLimit(bot)) {
    return "I'm receiving too many messages right now. Please try again in a moment.";
  }

  const permissions = (bot.permissions as string[]) || [];
  const blocked = enforcePermissions(permissions, msg.text);
  if (blocked) return blocked;

  await db.insert(botConversationLogsTable).values({
    botId: bot.id,
    platform: msg.platform,
    externalUserId: msg.externalUserId,
    role: "user",
    content: msg.text,
  });

  const memories = await db
    .select()
    .from(botMemoryTable)
    .where(eq(botMemoryTable.botId, bot.id))
    .orderBy(desc(botMemoryTable.updatedAt))
    .limit(20);

  const recentLogs = await db
    .select()
    .from(botConversationLogsTable)
    .where(
      and(
        eq(botConversationLogsTable.botId, bot.id),
        eq(botConversationLogsTable.externalUserId, msg.externalUserId ?? "")
      )
    )
    .orderBy(desc(botConversationLogsTable.createdAt))
    .limit(20);

  const memoryContext = memories.length > 0
    ? `\n\nPERSISTENT MEMORY:\n${memories.map(m => `- ${m.key}: ${m.value}`).join("\n")}`
    : "";

  const permissionContext = buildPermissionContext(permissions);
  const directiveContext = await buildDirectiveContext(bot);

  const conversationHistory = recentLogs
    .reverse()
    .map(log => ({
      role: log.role as "user" | "assistant",
      content: log.content,
    }));

  const skill = matchSkill(msg.text);

  let fullResponse = "";

  if (msg.text.trim().toLowerCase() === "/skills" || msg.text.trim().toLowerCase() === "/tools") {
    const catalog = getSkillCatalog();
    fullResponse = "**AVAILABLE SKILLS**\n\n" +
      catalog.map(s => `\`${s.command}\` — **${s.name}**\n${s.description}`).join("\n\n") +
      "\n\nUse any command followed by your request. Example: `/plan launch our new product by Q3`";
  } else if (skill) {
    fullResponse = await executeSkill(skill, msg.text, conversationHistory, undefined, directiveContext);
  } else {
    const skillCatalogHint = `\n\nYou have access to specialized skills the user can invoke with slash commands: ${getSkillCatalog().map(s => s.command).join(", ")}. If the user asks for something that matches a skill, mention the relevant command they can use for a more structured result.`;

    const systemPrompt = [
      bot.personality,
      bot.systemPrompt,
      memoryContext,
      directiveContext,
      permissionContext,
      skillCatalogHint,
      "\n\nIMPORTANT: If the user shares important information (their name, preferences, facts they want you to remember), prefix your internal note with [MEMORY:key=value] to save it. The user won't see this tag.",
    ].filter(Boolean).join("\n");

    await streamWithRouter(
      conversationHistory,
      systemPrompt,
      { maxTokens: bot.maxTokensPerResponse },
      (chunk) => {
        if (chunk.content) fullResponse += chunk.content;
      }
    );
  }

  const memoryMatches = fullResponse.matchAll(/\[MEMORY:(\w+)=([^\]]+)\]/g);
  for (const match of memoryMatches) {
    const [, key, value] = match;
    const existing = await db
      .select()
      .from(botMemoryTable)
      .where(and(eq(botMemoryTable.botId, bot.id), eq(botMemoryTable.key, key)));
    if (existing.length > 0) {
      await db
        .update(botMemoryTable)
        .set({ value, context: msg.platform })
        .where(eq(botMemoryTable.id, existing[0].id));
    } else {
      await db.insert(botMemoryTable).values({
        botId: bot.id,
        key,
        value,
        context: msg.platform,
      });
    }
  }

  const cleanResponse = fullResponse.replace(/\[MEMORY:\w+=[^\]]+\]/g, "").trim();

  let musicAppendix = "";
  if (permissions.includes("music_generate")) {
    const musicReq = parseMusicGenerateBlock(cleanResponse);
    if (musicReq) {
      // Auto-generation is gated behind the bot owner's PABLO / Jean Claw
      // subscription (`claw_bot` feature key). Without it we still emit
      // the [MUSIC_GENERATE] block so the artist gets a producer-grade
      // brief, but we don't burn Replicate credits on a non-subscriber.
      let ownerSubscribed = false;
      try {
        const [owner] = await db
          .select({ id: usersTable.id, email: usersTable.email })
          .from(usersTable)
          .where(eq(usersTable.id, bot.ownerId));
        if (owner) {
          ownerSubscribed = await hasFeature(owner.id, owner.email ?? null, "claw_bot");
        }
      } catch {
        ownerSubscribed = false;
      }

      if (!ownerSubscribed) {
        musicAppendix = "\n\n🔒 **PABLO SUBSCRIPTION REQUIRED** — Auto-generation via Replicate MusicGen is a Jean Claw / PABLO PACKAGE perk ($149/mo). The [MUSIC_GENERATE] brief above is ready; subscribe to /pricing to have Terrence cut the track automatically.";
      } else if (isMusicConfigured()) {
        try {
          const result = await generateMusic(musicReq);
          const tracks = result.tracks;
          if (tracks.length > 0) {
            musicAppendix = "\n\n🎵 **TRACK GENERATED**\n";
            for (const t of tracks) {
              musicAppendix += `- **${t.title}** — Status: ${t.status.toUpperCase()}`;
              if (t.audioUrl) musicAppendix += ` — [Listen](${t.audioUrl})`;
              musicAppendix += `\n`;
            }
            if (result.creditsRemaining >= 0) {
              musicAppendix += `\nReplicate credits remaining: ${result.creditsRemaining}`;
            }
          }
        } catch (err) {
          musicAppendix = `\n\n⚠️ Music generation error: ${err instanceof Error ? err.message : "Unknown error"}`;
        }
      } else {
        musicAppendix = "\n\n📋 **GENERATION REQUEST QUEUED** — The [MUSIC_GENERATE] block above contains everything needed to create this track. Connect your Replicate API token (REPLICATE_API_TOKEN) to enable automatic generation.";
      }
    }
  }

  const sanitizedResponse = sanitizeOutput(permissions, cleanResponse + musicAppendix);

  await db.insert(botConversationLogsTable).values({
    botId: bot.id,
    platform: msg.platform,
    externalUserId: msg.externalUserId,
    role: "assistant",
    content: sanitizedResponse,
  });

  return sanitizedResponse;
}

export async function startBot(botId: number): Promise<void> {
  const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, botId));
  if (!bot) throw new Error("Bot not found");

  const existingIntervals = scheduledIntervals.get(botId);
  if (existingIntervals) {
    existingIntervals.forEach(clearInterval);
    scheduledIntervals.delete(botId);
  }

  const existingConns = await db
    .select()
    .from(botPlatformConnectionsTable)
    .where(eq(botPlatformConnectionsTable.botId, botId));
  for (const conn of existingConns) {
    const connector = getConnector(conn.platform as PlatformType);
    if (connector?.isActive(botId)) {
      try { await connector.stop(botId); } catch {}
    }
  }

  const connections = await db
    .select()
    .from(botPlatformConnectionsTable)
    .where(eq(botPlatformConnectionsTable.botId, botId));

  for (const conn of connections) {
    if (conn.status !== "connected") continue;
    const connector = getConnector(conn.platform as PlatformType);
    if (!connector) continue;

    try {
      await connector.start(botId, conn.credentials, async (msg) => {
        const currentBot = await db.select().from(botsTable).where(eq(botsTable.id, botId));
        if (!currentBot[0] || currentBot[0].status !== "active") return;

        const response = await processIncomingMessage(currentBot[0], msg);
        await connector.send(botId, msg.externalUserId, { text: response });
      });

      await db
        .update(botPlatformConnectionsTable)
        .set({ lastActiveAt: new Date() })
        .where(eq(botPlatformConnectionsTable.id, conn.id));
    } catch (err) {
      console.error(`Failed to start ${conn.platform} for bot ${botId}:`, err);
      await db
        .update(botPlatformConnectionsTable)
        .set({ status: "error" })
        .where(eq(botPlatformConnectionsTable.id, conn.id));
    }
  }

  const tasks = await db
    .select()
    .from(botScheduledTasksTable)
    .where(and(eq(botScheduledTasksTable.botId, botId), eq(botScheduledTasksTable.enabled, true)));

  const intervals: NodeJS.Timeout[] = [];
  for (const task of tasks) {
    const intervalMs = cronToMs(task.cronExpression);
    if (intervalMs > 0) {
      const interval = setInterval(async () => {
        try {
          const currentBot = await db.select().from(botsTable).where(eq(botsTable.id, botId));
          if (!currentBot[0] || currentBot[0].status !== "active") return;

          if (task.taskDescription.startsWith("[TRADING_SCAN]")) {
            const connector = getConnector("thinkorswim");
            if (connector?.isActive(botId)) {
              await connector.send(botId, "system", { text: "[TRADING_SCAN]" });
            }
          } else {
            await processIncomingMessage(currentBot[0], {
              platform: "telegram",
              externalUserId: "system",
              text: `[SCHEDULED TASK] ${task.taskDescription}`,
            });
          }

          await db
            .update(botScheduledTasksTable)
            .set({ lastRunAt: new Date() })
            .where(eq(botScheduledTasksTable.id, task.id));
        } catch (err) {
          console.error(`Scheduled task ${task.id} failed for bot ${botId}:`, err);
        }
      }, intervalMs);
      intervals.push(interval);
    }
  }
  if (intervals.length > 0) scheduledIntervals.set(botId, intervals);

  await db.update(botsTable).set({ status: "active" }).where(eq(botsTable.id, botId));
}

export async function stopBot(botId: number): Promise<void> {
  const connections = await db
    .select()
    .from(botPlatformConnectionsTable)
    .where(eq(botPlatformConnectionsTable.botId, botId));

  for (const conn of connections) {
    const connector = getConnector(conn.platform as PlatformType);
    if (connector) {
      try {
        await connector.stop(botId);
      } catch (err) {
        console.error(`Failed to stop ${conn.platform} for bot ${botId}:`, err);
      }
    }
  }

  const intervals = scheduledIntervals.get(botId);
  if (intervals) {
    intervals.forEach(clearInterval);
    scheduledIntervals.delete(botId);
  }

  await db.update(botsTable).set({ status: "paused" }).where(eq(botsTable.id, botId));
}

export async function rehydrateActiveBots(): Promise<void> {
  const MAX_ATTEMPTS = 3;
  const BASE_DELAY_MS = 2000;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const activeBots = await db.select().from(botsTable).where(eq(botsTable.status, "active"));
      if (activeBots.length === 0) return;

      console.log(`[Bot Engine] Rehydrating ${activeBots.length} active bot(s)... (attempt ${attempt})`);
      for (const bot of activeBots) {
        try {
          await startBot(bot.id);
          console.log(`[Bot Engine] Rehydrated bot ${bot.id} (${bot.name})`);
        } catch (err) {
          console.error(`[Bot Engine] Failed to rehydrate bot ${bot.id}:`, err);
          await db.update(botsTable).set({ status: "error" }).where(eq(botsTable.id, bot.id));
        }
      }
      return;
    } catch (err) {
      console.error(`[Bot Engine] Rehydration attempt ${attempt} failed:`, err);
      if (attempt < MAX_ATTEMPTS) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`[Bot Engine] Retrying rehydration in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        console.error("[Bot Engine] All rehydration attempts failed.");
      }
    }
  }
}

function cronToMs(expr: string): number {
  const trimmed = expr.trim();

  if (/^\d+$/.test(trimmed)) {
    const num = parseInt(trimmed, 10);
    if (!isNaN(num) && num > 0) return num * 60_000;
  }

  const parts = trimmed.split(/\s+/);

  if (parts.length >= 5) {
    const [min, hour, dayOfMonth, month, dayOfWeek] = parts;

    if (min === "*" && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
      return 60_000;
    }

    if (min.startsWith("*/")) {
      const interval = parseInt(min.slice(2), 10);
      if (!isNaN(interval) && interval > 0) return interval * 60_000;
    }

    if (/^\d+$/.test(min) && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
      return 3600_000;
    }

    if (min === "0" && hour.startsWith("*/")) {
      const interval = parseInt(hour.slice(2), 10);
      if (!isNaN(interval) && interval > 0) return interval * 3600_000;
    }

    if (min === "0" && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
      return 3600_000;
    }

    if (min === "0" && /^\d+$/.test(hour) && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
      return 24 * 3600_000;
    }

    if (min === "0" && hour === "0" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
      return 24 * 3600_000;
    }
  }

  console.warn(`[Bot Engine] Unsupported cron expression: "${expr}" — defaulting to 1-hour interval`);
  return 3600_000;
}
