import { Router } from "express";
import { db, platformApiKeysTable, platformWebhooksTable, platformConnectedAppsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import { generateMusic, checkTrackStatus, isMusicConfigured, parseMusicGenerateBlock } from "../lib/suno-connector";

const router = Router();

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function generateApiKey(): string {
  return `psk_live_${randomBytes(32).toString("hex")}`;
}

function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("hex")}`;
}

router.get("/platform/api-keys", async (req, res) => {
  const userId = req.user?.id;
  const orgId = (req as any).orgId ?? userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const keys = await db
    .select({
      id: platformApiKeysTable.id,
      name: platformApiKeysTable.name,
      keyPrefix: platformApiKeysTable.keyPrefix,
      scopes: platformApiKeysTable.scopes,
      active: platformApiKeysTable.active,
      lastUsedAt: platformApiKeysTable.lastUsedAt,
      expiresAt: platformApiKeysTable.expiresAt,
      createdAt: platformApiKeysTable.createdAt,
    })
    .from(platformApiKeysTable)
    .where(eq(platformApiKeysTable.orgId, orgId))
    .orderBy(desc(platformApiKeysTable.createdAt));

  res.json(keys);
});

router.post("/platform/api-keys", async (req, res) => {
  const userId = req.user?.id;
  const orgId = (req as any).orgId ?? userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { name, scopes = [] } = req.body;
  if (!name) { res.status(400).json({ error: "Name is required" }); return; }

  const rawKey = generateApiKey();
  const keyHash = hashKey(rawKey);
  const keyPrefix = rawKey.substring(0, 12) + "...";

  await db.insert(platformApiKeysTable).values({
    orgId,
    userId,
    name,
    keyHash,
    keyPrefix,
    scopes,
    active: true,
  });

  res.json({ key: rawKey, prefix: keyPrefix, message: "Store this key securely — it will not be shown again." });
});

router.delete("/platform/api-keys/:id", async (req, res) => {
  const userId = req.user?.id;
  const orgId = (req as any).orgId ?? userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  await db
    .update(platformApiKeysTable)
    .set({ active: false })
    .where(and(eq(platformApiKeysTable.id, id), eq(platformApiKeysTable.orgId, orgId)));

  res.json({ success: true });
});

router.get("/platform/webhooks", async (req, res) => {
  const userId = req.user?.id;
  const orgId = (req as any).orgId ?? userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const webhooks = await db
    .select()
    .from(platformWebhooksTable)
    .where(eq(platformWebhooksTable.orgId, orgId))
    .orderBy(desc(platformWebhooksTable.createdAt));

  const masked = webhooks.map(w => ({
    ...w,
    secret: w.secret ? w.secret.substring(0, 10) + "..." : null,
  }));

  res.json(masked);
});

router.post("/platform/webhooks", async (req, res) => {
  const userId = req.user?.id;
  const orgId = (req as any).orgId ?? userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { name, url, events = [] } = req.body;
  if (!name || !url) { res.status(400).json({ error: "Name and URL are required" }); return; }

  const secret = generateWebhookSecret();

  const [webhook] = await db.insert(platformWebhooksTable).values({
    orgId,
    userId,
    name,
    url,
    events,
    secret,
    active: true,
  }).returning();

  res.json({ ...webhook, secret });
});

router.delete("/platform/webhooks/:id", async (req, res) => {
  const userId = req.user?.id;
  const orgId = (req as any).orgId ?? userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  await db
    .update(platformWebhooksTable)
    .set({ active: false })
    .where(and(eq(platformWebhooksTable.id, id), eq(platformWebhooksTable.orgId, orgId)));

  res.json({ success: true });
});

router.get("/platform/apps", async (req, res) => {
  const userId = req.user?.id;
  const orgId = (req as any).orgId ?? userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const connected = await db
    .select()
    .from(platformConnectedAppsTable)
    .where(eq(platformConnectedAppsTable.orgId, orgId))
    .orderBy(desc(platformConnectedAppsTable.createdAt));

  const PICASSO_APPS: { slug: string; name: string; description: string; status: string; icon: string; category: string }[] = [
    { slug: "salaryman", name: "SALARYMAN", description: "Virtual office hub — CRM, AI agents, phone system, creative suite, bot factory, payments, world", status: "core", icon: "terminal", category: "picasso" },

    { slug: "google-workspace", name: "GOOGLE WORKSPACE", description: "Gmail, Google Calendar, Google Drive, Google Sheets — sync contacts, events, files, and spreadsheets", status: "available", icon: "mail", category: "productivity" },
    { slug: "slack", name: "SLACK", description: "Send notifications, sync channels, deploy bots to Slack workspaces", status: "available", icon: "message-square", category: "communication" },
    { slug: "discord", name: "DISCORD", description: "Deploy bots to Discord servers, sync messages, manage communities", status: "available", icon: "message-circle", category: "communication" },
    { slug: "telegram", name: "TELEGRAM", description: "Deploy AI agents and bots to Telegram chats and groups", status: "available", icon: "send", category: "communication" },
    { slug: "whatsapp", name: "WHATSAPP BUSINESS", description: "Send and receive messages, deploy AI agents to WhatsApp Business", status: "available", icon: "phone", category: "communication" },
    { slug: "hubspot", name: "HUBSPOT", description: "Sync contacts, deals, and pipelines — two-way CRM integration", status: "available", icon: "database", category: "crm" },
    { slug: "salesforce", name: "SALESFORCE", description: "Sync leads, contacts, opportunities, and accounts with Salesforce", status: "available", icon: "cloud", category: "crm" },
    { slug: "stripe", name: "STRIPE", description: "Payment processing, subscription management, invoice sync", status: "available", icon: "credit-card", category: "finance" },
    { slug: "quickbooks", name: "QUICKBOOKS", description: "Accounting sync — invoices, expenses, P&L, bank reconciliation", status: "available", icon: "calculator", category: "finance" },
    { slug: "shopify", name: "SHOPIFY", description: "E-commerce integration — products, orders, inventory, customers", status: "available", icon: "shopping-bag", category: "commerce" },
    { slug: "etsy", name: "ETSY", description: "Marketplace integration — listings, orders, reviews, shop analytics", status: "available", icon: "palette", category: "commerce" },
    { slug: "zapier", name: "ZAPIER", description: "Connect to 6,000+ apps with automated workflows and triggers", status: "available", icon: "zap", category: "automation" },
    { slug: "make", name: "MAKE (INTEGROMAT)", description: "Visual workflow automation — connect APIs, transform data, schedule jobs", status: "available", icon: "workflow", category: "automation" },
    { slug: "notion", name: "NOTION", description: "Sync databases, pages, and project boards with Notion workspaces", status: "available", icon: "file-text", category: "productivity" },
    { slug: "linear", name: "LINEAR", description: "Sync issues, projects, and sprints — development workflow integration", status: "available", icon: "layout", category: "productivity" },
    { slug: "github", name: "GITHUB", description: "Repository access, issue tracking, PR notifications, code deployment", status: "available", icon: "git-branch", category: "development" },
    { slug: "twilio", name: "TWILIO", description: "SMS, voice calls, and phone number management for AI agents", status: "available", icon: "phone-call", category: "communication" },
    { slug: "mailchimp", name: "MAILCHIMP", description: "Email marketing — sync lists, send campaigns, track engagement", status: "available", icon: "mail", category: "marketing" },
    { slug: "facebook", name: "META BUSINESS", description: "Facebook Pages, Instagram, Messenger — deploy bots and manage ads", status: "available", icon: "share-2", category: "marketing" },
    { slug: "linkedin", name: "LINKEDIN", description: "Post updates, sync connections, deploy outreach automation", status: "available", icon: "briefcase", category: "marketing" },
    { slug: "airtable", name: "AIRTABLE", description: "Database sync — import/export records, automate data pipelines", status: "available", icon: "table", category: "productivity" },
    { slug: "zendesk", name: "ZENDESK", description: "Help desk integration — tickets, knowledge base, customer support sync", status: "available", icon: "headphones", category: "support" },
    { slug: "calendly", name: "CALENDLY", description: "Scheduling integration — sync meetings, availability, and bookings", status: "available", icon: "calendar", category: "productivity" },
  ];

  const connectedSlugs = new Set(connected.map(c => c.appSlug));
  const apps = PICASSO_APPS.map(app => ({
    ...app,
    connected: connectedSlugs.has(app.slug),
    connectionId: connected.find(c => c.appSlug === app.slug)?.id ?? null,
    lastSyncAt: connected.find(c => c.appSlug === app.slug)?.lastSyncAt ?? null,
  }));

  res.json(apps);
});

router.post("/platform/apps/connect", async (req, res) => {
  const userId = req.user?.id;
  const orgId = (req as any).orgId ?? userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { appSlug, appName } = req.body;
  if (!appSlug || !appName) { res.status(400).json({ error: "App slug and name required" }); return; }

  const existing = await db
    .select()
    .from(platformConnectedAppsTable)
    .where(and(eq(platformConnectedAppsTable.orgId, orgId), eq(platformConnectedAppsTable.appSlug, appSlug)));

  if (existing.length > 0) { res.json({ success: true, message: "Already connected" }); return; }

  await db.insert(platformConnectedAppsTable).values({
    orgId,
    appSlug,
    appName,
    status: "connected",
  });

  res.json({ success: true });
});

router.get("/platform/endpoints", async (_req, res) => {
  const endpoints = [
    { method: "GET", path: "/api/platform/api-keys", description: "LIST ALL API KEYS", scope: "keys:read" },
    { method: "POST", path: "/api/platform/api-keys", description: "CREATE API KEY", scope: "keys:write" },
    { method: "DELETE", path: "/api/platform/api-keys/:id", description: "REVOKE API KEY", scope: "keys:write" },
    { method: "GET", path: "/api/platform/webhooks", description: "LIST WEBHOOKS", scope: "webhooks:read" },
    { method: "POST", path: "/api/platform/webhooks", description: "CREATE WEBHOOK", scope: "webhooks:write" },
    { method: "DELETE", path: "/api/platform/webhooks/:id", description: "DELETE WEBHOOK", scope: "webhooks:write" },
    { method: "GET", path: "/api/platform/apps", description: "LIST CONNECTED APPS", scope: "apps:read" },
    { method: "POST", path: "/api/platform/apps/connect", description: "CONNECT APP", scope: "apps:write" },
    { method: "GET", path: "/api/contacts", description: "LIST CONTACTS", scope: "contacts:read" },
    { method: "POST", path: "/api/contacts", description: "CREATE CONTACT", scope: "contacts:write" },
    { method: "GET", path: "/api/deals", description: "LIST DEALS", scope: "deals:read" },
    { method: "GET", path: "/api/invoices", description: "LIST INVOICES", scope: "invoices:read" },
    { method: "GET", path: "/api/insurance/clients", description: "LIST INSURANCE CLIENTS", scope: "insurance:read" },
    { method: "GET", path: "/api/insurance/policies", description: "LIST POLICIES", scope: "insurance:read" },
    { method: "GET", path: "/api/bots/marketplace", description: "LIST MARKETPLACE BOTS", scope: "bots:read" },
    { method: "GET", path: "/api/world/servers", description: "LIST WORLD SERVERS", scope: "world:read" },
    { method: "POST", path: "/api/chat/message", description: "SEND CHAT MESSAGE TO BOT", scope: "chat:write" },
    { method: "GET", path: "/api/campaigns", description: "LIST MARKETING CAMPAIGNS", scope: "marketing:read" },
    { method: "GET", path: "/api/leads", description: "LIST LEADS", scope: "leads:read" },
    { method: "GET", path: "/api/reporting/stats", description: "GET BUSINESS STATS", scope: "reporting:read" },
  ];

  const webhookEvents = [
    { event: "contact.created", description: "NEW CONTACT ADDED" },
    { event: "contact.updated", description: "CONTACT DETAILS CHANGED" },
    { event: "deal.created", description: "NEW DEAL CREATED" },
    { event: "deal.stage_changed", description: "DEAL MOVED TO NEW STAGE" },
    { event: "deal.closed", description: "DEAL CLOSED (WON OR LOST)" },
    { event: "invoice.generated", description: "NEW INVOICE CREATED" },
    { event: "payment.received", description: "PAYMENT RECEIVED" },
    { event: "insurance.client_added", description: "NEW INSURANCE CLIENT" },
    { event: "insurance.policy_created", description: "NEW POLICY ISSUED" },
    { event: "bot.message_received", description: "BOT RECEIVED USER MESSAGE" },
    { event: "music.release_scheduled", description: "NEW MUSIC RELEASE SCHEDULED" },
    { event: "music.royalty_received", description: "ROYALTY PAYMENT RECEIVED" },
    { event: "book.manuscript_submitted", description: "MANUSCRIPT SUBMITTED" },
    { event: "book.published", description: "BOOK PUBLISHED" },
    { event: "minx.business_registered", description: "IN-GAME BUSINESS REGISTERED" },
    { event: "minx.territory_claimed", description: "TERRITORY CLAIMED IN MINX CITY" },
  ];

  res.json({ endpoints, webhookEvents });
});

router.get("/platform/music/status", async (_req, res) => {
  res.json({ configured: isMusicConfigured() });
});

router.post("/platform/music/generate", async (req, res) => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  if (!isMusicConfigured()) {
    res.status(503).json({
      error: "REPLICATE_API_TOKEN not configured",
      message: "Music generation requires a Replicate API token. Add REPLICATE_API_TOKEN to your environment to enable this feature.",
    });
    return;
  }

  const { title, genre, mood, tempo, key, vocal, lyrics, stylePrompt, duration } = req.body;
  if (!title || !genre) {
    res.status(400).json({ error: "title and genre are required" });
    return;
  }

  try {
    const result = await generateMusic({
      title,
      genre,
      mood: mood ?? "",
      tempo: tempo ?? 120,
      key: key ?? "C major",
      vocal: vocal ?? "instrumental",
      lyrics: lyrics ?? "instrumental",
      stylePrompt: stylePrompt ?? genre,
      duration: duration ?? 30,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: "Music generation failed",
      message: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

router.get("/platform/music/track/:trackId", async (req, res) => {
  const { trackId } = req.params;
  try {
    const track = await checkTrackStatus(trackId);
    if (!track) { res.status(404).json({ error: "Track not found" }); return; }
    res.json(track);
  } catch (err) {
    res.status(500).json({ error: "Failed to check track status" });
  }
});

export default router;
