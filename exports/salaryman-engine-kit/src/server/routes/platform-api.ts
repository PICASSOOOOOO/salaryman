import { Router } from "express";
import { db, platformApiKeysTable, platformWebhooksTable, platformConnectedAppsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import { generateMusic, checkTrackStatus, isMusicConfigured, parseMusicGenerateBlock } from "../lib/suno-connector";
import { hasFeature } from "../lib/plan";

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
    { slug: "quickbooks", name: "QUICKBOOKS", description: "Accounting sync — invoices, expenses, P&L, bank reconciliation. Bring your own QuickBooks API key + login.", status: "available", icon: "calculator", category: "finance" },
    { slug: "tax-provider", name: "TAX PROVIDER", description: "Bring your own tax-service account and API credentials. SALARYMAN does not include or resell tax filing services.", status: "available", icon: "landmark", category: "finance" },
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

    // === Music & media ===
    { slug: "spotify", name: "SPOTIFY", description: "Stream playlists, sync your library, pull listening data and artist analytics", status: "available", icon: "music", category: "music" },
    { slug: "apple-music", name: "APPLE MUSIC", description: "Sync library, playlists, and listening history from Apple Music", status: "available", icon: "music", category: "music" },
    { slug: "soundcloud", name: "SOUNDCLOUD", description: "Upload tracks, sync plays and followers, manage your SoundCloud presence", status: "available", icon: "music", category: "music" },
    { slug: "youtube", name: "YOUTUBE", description: "Upload videos, sync channel analytics, manage comments and playlists", status: "available", icon: "youtube", category: "media" },
    { slug: "youtube-music", name: "YOUTUBE MUSIC", description: "Sync playlists and listening history from YouTube Music", status: "available", icon: "music", category: "music" },
    { slug: "twitch", name: "TWITCH", description: "Stream alerts, chat bots, subscriber and follower sync", status: "available", icon: "twitch", category: "media" },

    // === Google suite (individual services) ===
    { slug: "gmail", name: "GMAIL", description: "Read, send, and label email — full Gmail sync for contacts and threads", status: "available", icon: "mail", category: "productivity" },
    { slug: "google-sheets", name: "GOOGLE SHEETS", description: "Read and write spreadsheets — two-way data sync, reports, and dashboards", status: "available", icon: "table", category: "productivity" },
    { slug: "google-drive", name: "GOOGLE DRIVE", description: "Sync files and folders, attach documents, back up your work", status: "available", icon: "hard-drive", category: "storage" },
    { slug: "google-calendar", name: "GOOGLE CALENDAR", description: "Sync events, meetings, and availability with Google Calendar", status: "available", icon: "calendar", category: "productivity" },
    { slug: "google-docs", name: "GOOGLE DOCS", description: "Create and sync documents — drafts, contracts, and manuscripts", status: "available", icon: "file-text", category: "productivity" },
    { slug: "google-forms", name: "GOOGLE FORMS", description: "Collect responses, sync submissions into your CRM and leads", status: "available", icon: "clipboard", category: "productivity" },
    { slug: "google-meet", name: "GOOGLE MEET", description: "Schedule and join video meetings, sync attendees", status: "available", icon: "video", category: "communication" },
    { slug: "google-analytics", name: "GOOGLE ANALYTICS", description: "Pull website traffic, conversions, and audience analytics", status: "available", icon: "bar-chart", category: "marketing" },
    { slug: "google-ads", name: "GOOGLE ADS", description: "Manage campaigns, sync spend, conversions, and performance", status: "available", icon: "megaphone", category: "marketing" },

    // === Microsoft ===
    { slug: "microsoft-365", name: "MICROSOFT 365", description: "Outlook, Word, Excel, PowerPoint, OneDrive — full Microsoft 365 sync", status: "available", icon: "grid", category: "productivity" },
    { slug: "outlook", name: "OUTLOOK", description: "Email and calendar sync with Microsoft Outlook", status: "available", icon: "mail", category: "productivity" },
    { slug: "microsoft-teams", name: "MICROSOFT TEAMS", description: "Send messages, deploy bots, and sync channels in Teams", status: "available", icon: "message-square", category: "communication" },
    { slug: "excel", name: "MICROSOFT EXCEL", description: "Read and write Excel workbooks — data sync and reporting", status: "available", icon: "table", category: "productivity" },
    { slug: "onedrive", name: "ONEDRIVE", description: "Sync files and folders with Microsoft OneDrive", status: "available", icon: "hard-drive", category: "storage" },

    // === Storage & files ===
    { slug: "dropbox", name: "DROPBOX", description: "Sync files and folders, attach documents, automate backups", status: "available", icon: "hard-drive", category: "storage" },
    { slug: "box", name: "BOX", description: "Enterprise file storage and sharing — sync documents and folders", status: "available", icon: "hard-drive", category: "storage" },

    // === Communication & video ===
    { slug: "zoom", name: "ZOOM", description: "Schedule meetings, sync recordings, deploy meeting bots", status: "available", icon: "video", category: "communication" },
    { slug: "messenger", name: "FACEBOOK MESSENGER", description: "Deploy AI agents and auto-replies to Messenger conversations", status: "available", icon: "message-circle", category: "communication" },
    { slug: "signal", name: "SIGNAL", description: "Send secure notifications and alerts via Signal", status: "available", icon: "message-circle", category: "communication" },
    { slug: "intercom", name: "INTERCOM", description: "Live chat, support inbox, and customer messaging sync", status: "available", icon: "message-square", category: "support" },

    // === Social media ===
    { slug: "x-twitter", name: "X (TWITTER)", description: "Post updates, schedule threads, sync mentions and analytics", status: "available", icon: "twitter", category: "social" },
    { slug: "instagram", name: "INSTAGRAM", description: "Post content, sync DMs and comments, track engagement", status: "available", icon: "instagram", category: "social" },
    { slug: "tiktok", name: "TIKTOK", description: "Upload videos, sync analytics, manage comments and trends", status: "available", icon: "music", category: "social" },
    { slug: "reddit", name: "REDDIT", description: "Post to subreddits, monitor mentions, deploy community bots", status: "available", icon: "message-circle", category: "social" },
    { slug: "pinterest", name: "PINTEREST", description: "Create pins, sync boards, track traffic and engagement", status: "available", icon: "image", category: "social" },
    { slug: "threads", name: "THREADS", description: "Post updates and sync engagement from Threads", status: "available", icon: "at-sign", category: "social" },
    { slug: "bluesky", name: "BLUESKY", description: "Post and sync your Bluesky social presence", status: "available", icon: "cloud", category: "social" },
    { slug: "noise", name: "NOISE", description: "Creator content engine — generate short-form videos and auto-post to TikTok, Instagram Reels & YouTube Shorts. Bring your own Noise API key + login.", status: "available", icon: "megaphone", category: "marketing" },

    // === Productivity & project management ===
    { slug: "trello", name: "TRELLO", description: "Sync boards, cards, and lists — visual project tracking", status: "available", icon: "trello", category: "productivity" },
    { slug: "asana", name: "ASANA", description: "Sync tasks, projects, and timelines with Asana", status: "available", icon: "check-square", category: "productivity" },
    { slug: "monday", name: "MONDAY.COM", description: "Sync boards, automations, and workflows from monday.com", status: "available", icon: "layout", category: "productivity" },
    { slug: "clickup", name: "CLICKUP", description: "Sync tasks, docs, goals, and sprints with ClickUp", status: "available", icon: "check-square", category: "productivity" },
    { slug: "todoist", name: "TODOIST", description: "Sync tasks and projects — turn to-dos into actions", status: "available", icon: "check-square", category: "productivity" },
    { slug: "coda", name: "CODA", description: "Sync docs, tables, and automations from Coda", status: "available", icon: "file-text", category: "productivity" },
    { slug: "evernote", name: "EVERNOTE", description: "Sync notes and notebooks into your workspace", status: "available", icon: "file-text", category: "productivity" },
    { slug: "typeform", name: "TYPEFORM", description: "Collect form responses, sync submissions into leads", status: "available", icon: "clipboard", category: "productivity" },

    // === Design & creative ===
    { slug: "figma", name: "FIGMA", description: "Sync designs, comments, and assets from Figma", status: "available", icon: "figma", category: "design" },
    { slug: "canva", name: "CANVA", description: "Pull designs and brand assets, export creatives", status: "available", icon: "image", category: "design" },
    { slug: "adobe-creative-cloud", name: "ADOBE CREATIVE CLOUD", description: "Sync assets and libraries across Adobe apps", status: "available", icon: "image", category: "design" },

    // === Development & cloud ===
    { slug: "gitlab", name: "GITLAB", description: "Repository access, CI/CD, issues, and merge request notifications", status: "available", icon: "git-branch", category: "development" },
    { slug: "bitbucket", name: "BITBUCKET", description: "Repository access, pipelines, and pull request sync", status: "available", icon: "git-branch", category: "development" },
    { slug: "jira", name: "JIRA", description: "Sync issues, sprints, and boards with Jira", status: "available", icon: "layout", category: "development" },
    { slug: "confluence", name: "CONFLUENCE", description: "Sync wiki pages, docs, and knowledge base", status: "available", icon: "file-text", category: "development" },
    { slug: "vercel", name: "VERCEL", description: "Deploy frontends, sync builds and deployment status", status: "available", icon: "triangle", category: "development" },
    { slug: "netlify", name: "NETLIFY", description: "Deploy sites, sync builds and form submissions", status: "available", icon: "globe", category: "development" },
    { slug: "aws", name: "AMAZON WEB SERVICES", description: "Cloud compute, storage, and services — connect your AWS account", status: "available", icon: "cloud", category: "cloud" },
    { slug: "google-cloud", name: "GOOGLE CLOUD", description: "Cloud compute, storage, BigQuery, and AI services", status: "available", icon: "cloud", category: "cloud" },
    { slug: "azure", name: "MICROSOFT AZURE", description: "Cloud compute, storage, and enterprise services", status: "available", icon: "cloud", category: "cloud" },

    // === CRM, sales & marketing ===
    { slug: "pipedrive", name: "PIPEDRIVE", description: "Sync deals, pipelines, and sales activity with Pipedrive", status: "available", icon: "database", category: "crm" },
    { slug: "zoho", name: "ZOHO CRM", description: "Sync leads, contacts, and deals with Zoho", status: "available", icon: "database", category: "crm" },
    { slug: "klaviyo", name: "KLAVIYO", description: "Email & SMS marketing automation — sync lists and flows", status: "available", icon: "mail", category: "marketing" },
    { slug: "activecampaign", name: "ACTIVECAMPAIGN", description: "Marketing automation, email campaigns, and CRM sync", status: "available", icon: "mail", category: "marketing" },
    { slug: "sendgrid", name: "SENDGRID", description: "Transactional and marketing email delivery", status: "available", icon: "send", category: "marketing" },
    { slug: "constant-contact", name: "CONSTANT CONTACT", description: "Email marketing — sync lists, campaigns, and engagement", status: "available", icon: "mail", category: "marketing" },
    { slug: "surveymonkey", name: "SURVEYMONKEY", description: "Collect survey responses, sync feedback into reports", status: "available", icon: "clipboard", category: "marketing" },

    // === Finance, payments & commerce ===
    { slug: "paypal", name: "PAYPAL", description: "Accept payments, sync transactions and payouts", status: "available", icon: "credit-card", category: "finance" },
    { slug: "square", name: "SQUARE", description: "Point-of-sale, payments, and inventory sync", status: "available", icon: "credit-card", category: "finance" },
    { slug: "xero", name: "XERO", description: "Accounting sync — invoices, bills, bank reconciliation", status: "available", icon: "calculator", category: "finance" },
    { slug: "wave", name: "WAVE", description: "Free accounting and invoicing sync for small business", status: "available", icon: "calculator", category: "finance" },
    { slug: "plaid", name: "PLAID", description: "Connect bank accounts — balances, transactions, and verification", status: "available", icon: "landmark", category: "finance" },
    { slug: "coinbase", name: "COINBASE", description: "Crypto balances, transactions, and commerce payments", status: "available", icon: "bitcoin", category: "finance" },
    { slug: "woocommerce", name: "WOOCOMMERCE", description: "WordPress e-commerce — products, orders, customers", status: "available", icon: "shopping-bag", category: "commerce" },
    { slug: "amazon", name: "AMAZON SELLER", description: "Marketplace integration — listings, orders, FBA inventory", status: "available", icon: "shopping-bag", category: "commerce" },
    { slug: "ebay", name: "EBAY", description: "Marketplace listings, orders, and inventory sync", status: "available", icon: "shopping-bag", category: "commerce" },
    { slug: "bigcommerce", name: "BIGCOMMERCE", description: "E-commerce platform — products, orders, customers", status: "available", icon: "shopping-bag", category: "commerce" },
    { slug: "wix", name: "WIX", description: "Website and store sync — orders, bookings, contacts", status: "available", icon: "globe", category: "commerce" },
    { slug: "squarespace", name: "SQUARESPACE", description: "Website and store sync — products, orders, and forms", status: "available", icon: "globe", category: "commerce" },

    // === HR & operations ===
    { slug: "gusto", name: "GUSTO", description: "Payroll, benefits, and HR sync for your team", status: "available", icon: "users", category: "hr" },
    { slug: "bamboohr", name: "BAMBOOHR", description: "HR records, time off, and employee data sync", status: "available", icon: "users", category: "hr" },
    { slug: "docusign", name: "DOCUSIGN", description: "Send and track e-signatures on contracts and agreements", status: "available", icon: "pen-tool", category: "hr" },

    // === Support ===
    { slug: "freshdesk", name: "FRESHDESK", description: "Help desk — tickets, knowledge base, and support sync", status: "available", icon: "headphones", category: "support" },

    // === Automation ===
    { slug: "ifttt", name: "IFTTT", description: "Automate workflows across hundreds of apps and devices", status: "available", icon: "zap", category: "automation" },
    { slug: "n8n", name: "N8N", description: "Open-source workflow automation — connect APIs and self-host", status: "available", icon: "workflow", category: "automation" },

    // === AI ===
    { slug: "openai", name: "OPENAI", description: "GPT models for agents, content, and automation", status: "available", icon: "sparkles", category: "ai" },
    { slug: "anthropic", name: "ANTHROPIC CLAUDE", description: "Claude models for agents, writing, and analysis", status: "available", icon: "sparkles", category: "ai" },
    { slug: "gemini", name: "GOOGLE GEMINI", description: "Gemini models for multimodal AI workflows", status: "available", icon: "sparkles", category: "ai" },
    { slug: "elevenlabs", name: "ELEVENLABS", description: "AI voice synthesis and text-to-speech for agents", status: "available", icon: "mic", category: "ai" },
  ];

  const bySlug = new Map(connected.map(c => [c.appSlug, c]));
  // Credentials live in `config.credentials` (jsonb). NEVER return raw secrets to
  // the client — surface a masked summary only (login/baseUrl are non-secret and
  // shown verbatim so the UI can prove "SALARYMAN remembers it").
  const apps = PICASSO_APPS.map(app => {
    const c = bySlug.get(app.slug);
    const creds = ((c?.config as Record<string, unknown> | undefined)?.credentials ?? {}) as Record<string, string>;
    return {
      ...app,
      connected: !!c,
      connectionId: c?.id ?? null,
      lastSyncAt: c?.lastSyncAt ?? null,
      credentials: c
        ? {
            hasApiKey: !!creds.apiKey,
            apiKeyLast4: creds.apiKey ? String(creds.apiKey).slice(-4) : null,
            login: creds.login ?? null,
            hasPassword: !!creds.password,
            baseUrl: creds.baseUrl ?? null,
            hasNotes: !!creds.notes,
          }
        : null,
    };
  });

  res.json(apps);
});

const CREDENTIAL_FIELDS = ["apiKey", "login", "password", "baseUrl", "notes"] as const;

function cleanCredentials(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object") return {};
  const src = input as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const field of CREDENTIAL_FIELDS) {
    const v = src[field];
    if (typeof v === "string" && v.trim()) out[field] = v.trim();
  }
  return out;
}

router.post("/platform/apps/connect", async (req, res) => {
  const userId = req.user?.id;
  const orgId = (req as any).orgId ?? userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { appSlug, appName, credentials } = req.body;
  if (!appSlug || !appName) { res.status(400).json({ error: "App slug and name required" }); return; }

  const cleaned = cleanCredentials(credentials);

  const existing = await db
    .select()
    .from(platformConnectedAppsTable)
    .where(and(eq(platformConnectedAppsTable.orgId, orgId), eq(platformConnectedAppsTable.appSlug, appSlug)));

  if (existing.length > 0) {
    // Re-connecting / managing an existing app: merge new credentials over the
    // stored ones so a user can update just their API key without re-typing the
    // login (and vice-versa).
    const prevConfig = (existing[0].config as Record<string, unknown> | null) ?? {};
    const prevCreds = (prevConfig.credentials as Record<string, string> | undefined) ?? {};
    const mergedCreds = { ...prevCreds, ...cleaned };
    await db
      .update(platformConnectedAppsTable)
      .set({ appName, status: "connected", config: { ...prevConfig, credentials: mergedCreds }, lastSyncAt: new Date() })
      .where(and(eq(platformConnectedAppsTable.id, existing[0].id), eq(platformConnectedAppsTable.orgId, orgId)));
    res.json({ success: true, updated: true });
    return;
  }

  await db.insert(platformConnectedAppsTable).values({
    orgId,
    appSlug,
    appName,
    status: "connected",
    config: { credentials: cleaned },
    lastSyncAt: new Date(),
  });

  res.json({ success: true });
});

router.post("/platform/apps/disconnect", async (req, res) => {
  const userId = req.user?.id;
  const orgId = (req as any).orgId ?? userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { appSlug } = req.body;
  if (!appSlug) { res.status(400).json({ error: "App slug required" }); return; }

  await db
    .delete(platformConnectedAppsTable)
    .where(and(eq(platformConnectedAppsTable.orgId, orgId), eq(platformConnectedAppsTable.appSlug, appSlug)));

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
    { method: "POST", path: "/api/platform/apps/connect", description: "CONNECT APP (STORE API KEY + LOGIN)", scope: "apps:write" },
    { method: "POST", path: "/api/platform/apps/disconnect", description: "DISCONNECT APP", scope: "apps:write" },
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
  const userEmail = req.user?.email;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  // Music generation is a Jean Claw / PABLO PACKAGE perk. The `claw_bot`
  // feature key is the canonical PABLO subscription (see lib/plan.ts) —
  // every other paid music capability is bundled under it.
  const subscribed = await hasFeature(userId, userEmail ?? null, "claw_bot");
  if (!subscribed) {
    res.status(402).json({
      error: "PABLO subscription required",
      message: "AI music generation is a Jean Claw / PABLO PACKAGE perk ($149/mo). Subscribe to unlock automatic Replicate MusicGen tracks.",
      upgradeUrl: "/pricing",
    });
    return;
  }

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
