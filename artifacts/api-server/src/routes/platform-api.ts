import { Router } from "express";
import { db, platformApiKeysTable, platformWebhooksTable, platformConnectedAppsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import { generateMusic, checkTrackStatus, isSunoConfigured, parseMusicGenerateBlock } from "../lib/suno-connector";

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
  const userId = (req as any).userId;
  const orgId = (req as any).orgId ?? userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

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
  const userId = (req as any).userId;
  const orgId = (req as any).orgId ?? userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { name, scopes = [] } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });

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
  const userId = (req as any).userId;
  const orgId = (req as any).orgId ?? userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const id = parseInt(req.params.id);
  await db
    .update(platformApiKeysTable)
    .set({ active: false })
    .where(and(eq(platformApiKeysTable.id, id), eq(platformApiKeysTable.orgId, orgId)));

  res.json({ success: true });
});

router.get("/platform/webhooks", async (req, res) => {
  const userId = (req as any).userId;
  const orgId = (req as any).orgId ?? userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

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
  const userId = (req as any).userId;
  const orgId = (req as any).orgId ?? userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { name, url, events = [] } = req.body;
  if (!name || !url) return res.status(400).json({ error: "Name and URL are required" });

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
  const userId = (req as any).userId;
  const orgId = (req as any).orgId ?? userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const id = parseInt(req.params.id);
  await db
    .update(platformWebhooksTable)
    .set({ active: false })
    .where(and(eq(platformWebhooksTable.id, id), eq(platformWebhooksTable.orgId, orgId)));

  res.json({ success: true });
});

router.get("/platform/apps", async (req, res) => {
  const userId = (req as any).userId;
  const orgId = (req as any).orgId ?? userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const connected = await db
    .select()
    .from(platformConnectedAppsTable)
    .where(eq(platformConnectedAppsTable.orgId, orgId))
    .orderBy(desc(platformConnectedAppsTable.createdAt));

  const PICASSO_APPS = [
    { slug: "salaryman", name: "SALARYMAN", description: "Business CRM, AI agents, phone system, creative suite, marketing, insurance", status: "core", icon: "terminal" },
    { slug: "publishing-music", name: "PICASSO PUBLISHING (MUSIC)", description: "Royalty tracking, sync licensing, distribution, A&R, catalog management", status: "available", icon: "music" },
    { slug: "publishing-books", name: "PICASSO PUBLISHING (BOOKS)", description: "Manuscript pipeline, editing, production, rights management, marketing", status: "available", icon: "book-open" },
    { slug: "minx-city", name: "MINX CITY", description: "Virtual office MMO, in-game businesses, economy, territory control", status: "available", icon: "gamepad" },
    { slug: "jean-claw", name: "JEAN CLAW NETWORK", description: "Multi-agent automation suite — sales, support, trading, recruiting", status: "available", icon: "target" },
    { slug: "storefront", name: "PICASSO STOREFRONT", description: "E-commerce, merchandise, print-on-demand, dropshipping operations", status: "coming_soon", icon: "store" },
    { slug: "payments", name: "PICASSO PAY", description: "Payment processing, invoicing, subscriptions, financial reconciliation", status: "coming_soon", icon: "credit-card" },
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
  const userId = (req as any).userId;
  const orgId = (req as any).orgId ?? userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { appSlug, appName } = req.body;
  if (!appSlug || !appName) return res.status(400).json({ error: "App slug and name required" });

  const existing = await db
    .select()
    .from(platformConnectedAppsTable)
    .where(and(eq(platformConnectedAppsTable.orgId, orgId), eq(platformConnectedAppsTable.appSlug, appSlug)));

  if (existing.length > 0) return res.json({ success: true, message: "Already connected" });

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
    { method: "GET", path: "/api/world/servers", description: "LIST MINX CITY SERVERS", scope: "world:read" },
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
  res.json({ configured: isSunoConfigured() });
});

router.post("/platform/music/generate", async (req, res) => {
  const userId = (req as any).userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  if (!isSunoConfigured()) {
    return res.status(503).json({
      error: "SUNO_API_KEY not configured",
      message: "Music generation requires a Suno API key. Add SUNO_API_KEY to your environment to enable this feature.",
    });
  }

  const { title, genre, mood, tempo, key, vocal, lyrics, stylePrompt, duration } = req.body;
  if (!title || !genre) {
    return res.status(400).json({ error: "title and genre are required" });
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
      duration: duration ?? 120,
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
    if (!track) return res.status(404).json({ error: "Track not found" });
    res.json(track);
  } catch (err) {
    res.status(500).json({ error: "Failed to check track status" });
  }
});

export default router;
