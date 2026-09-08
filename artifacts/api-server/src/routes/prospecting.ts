import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, and } from "drizzle-orm";
import {
  db,
  botsTable,
  contactsTable,
  dealsTable,
  botScheduledTasksTable,
  botMarketplaceTable,
} from "@workspace/db";
import { runLinkedInProspecting, runFacebookProspecting, type ProspectingCriteria, type DiscoveredContact } from "../lib/social-scraper";

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

function parseParam(val: string | string[] | undefined): string {
  if (Array.isArray(val)) return val[0] ?? "";
  return val ?? "";
}

const PROSPECTING_SLUGS = ["linkedin-prospector", "facebook-scout"];
const SOURCE_MAP: Record<string, "linkedin" | "facebook"> = {
  "linkedin-prospector": "linkedin",
  "facebook-scout": "facebook",
};

interface ProspectResult {
  id: string;
  name: string;
  title: string;
  company: string;
  location: string;
  email: string;
  phone: string;
  bio: string;
  profileUrl: string;
  source: "linkedin" | "facebook";
  qualificationScore: number;
  notes: string;
  status: "pending" | "approved" | "dismissed";
  discoveredAt: string;
}

const prospectResultsStore = new Map<string, ProspectResult[]>();
const prospectConfigStore = new Map<string, {
  criteria: ProspectingCriteria;
  autoImport: boolean;
  scheduleMinutes: number;
  disclaimer: string;
}>();

function getBotResultsKey(botId: number): string {
  return `bot:${botId}:results`;
}

function getBotConfigKey(botId: number): string {
  return `bot:${botId}:config`;
}

async function getBotAndVerifyOwner(botId: number, userId: string): Promise<typeof botsTable.$inferSelect | null> {
  const [bot] = await db
    .select()
    .from(botsTable)
    .where(and(eq(botsTable.id, botId), eq(botsTable.ownerId, userId)));
  return bot ?? null;
}

async function getBotSource(bot: typeof botsTable.$inferSelect): Promise<"linkedin" | "facebook" | null> {
  const marketplaceId = bot.marketplaceItemId;
  if (!marketplaceId) return null;

  const [item] = await db
    .select({ slug: botMarketplaceTable.slug })
    .from(botMarketplaceTable)
    .where(eq(botMarketplaceTable.id, marketplaceId));

  return item ? (SOURCE_MAP[item.slug] ?? null) : null;
}

router.get("/bots/:id/prospecting/config", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);

    const bot = await getBotAndVerifyOwner(botId, userId);
    if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }

    const configKey = getBotConfigKey(botId);
    const config = prospectConfigStore.get(configKey) ?? {
      criteria: {
        targetTitles: [],
        industries: [],
        locations: [],
        companySizes: [],
        keywords: [],
        maxResults: 10,
      },
      autoImport: false,
      scheduleMinutes: 1440,
      disclaimer: "",
    };

    res.json({ config });
  } catch (err) {
    console.error("Error fetching prospecting config:", err);
    res.status(500).json({ error: "Failed to fetch config" });
  }
});

router.post("/bots/:id/prospecting/config", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);

    const bot = await getBotAndVerifyOwner(botId, userId);
    if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }

    const { criteria, autoImport, scheduleMinutes } = req.body as {
      criteria: ProspectingCriteria;
      autoImport: boolean;
      scheduleMinutes: number;
    };

    const configKey = getBotConfigKey(botId);
    const existing = prospectConfigStore.get(configKey);
    prospectConfigStore.set(configKey, {
      criteria: criteria ?? existing?.criteria ?? { targetTitles: [], industries: [], locations: [], companySizes: [], keywords: [], maxResults: 10 },
      autoImport: autoImport ?? existing?.autoImport ?? false,
      scheduleMinutes: scheduleMinutes ?? existing?.scheduleMinutes ?? 1440,
      disclaimer: existing?.disclaimer ?? "",
    });

    const taskDescription = `Prospecting scan — search LinkedIn/Facebook for leads based on configured criteria`;
    const existingTasks = await db
      .select()
      .from(botScheduledTasksTable)
      .where(and(
        eq(botScheduledTasksTable.botId, botId),
        eq(botScheduledTasksTable.taskDescription, taskDescription),
      ));

    const cronMinutes = String(scheduleMinutes ?? 1440);

    if (existingTasks.length > 0) {
      await db
        .update(botScheduledTasksTable)
        .set({ cronExpression: cronMinutes, enabled: true })
        .where(eq(botScheduledTasksTable.id, existingTasks[0].id));
    } else {
      await db.insert(botScheduledTasksTable).values({
        botId,
        cronExpression: cronMinutes,
        taskDescription,
        enabled: true,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("Error saving prospecting config:", err);
    res.status(500).json({ error: "Failed to save config" });
  }
});

router.post("/bots/:id/prospecting/run", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);

    const bot = await getBotAndVerifyOwner(botId, userId);
    if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }

    const source = await getBotSource(bot);
    if (!source) { res.status(400).json({ error: "Not a prospecting bot" }); return; }

    const configKey = getBotConfigKey(botId);
    const config = prospectConfigStore.get(configKey);

    const criteria: ProspectingCriteria = config?.criteria ?? {
      targetTitles: [],
      industries: [],
      locations: [],
      companySizes: [],
      keywords: [],
      maxResults: 10,
    };

    let result: { contacts: DiscoveredContact[]; disclaimer: string; rateLimitNote: string };
    if (source === "linkedin") {
      result = await runLinkedInProspecting(criteria);
    } else {
      result = await runFacebookProspecting(criteria);
    }

    if (config) {
      config.disclaimer = result.disclaimer;
    }

    const resultsKey = getBotResultsKey(botId);
    const existing = prospectResultsStore.get(resultsKey) ?? [];

    const newResults: ProspectResult[] = result.contacts.map((c) => ({
      ...c,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: "pending" as const,
      discoveredAt: new Date().toISOString(),
    }));

    const autoImport = config?.autoImport ?? false;

    const importedIds: string[] = [];
    if (autoImport) {
      for (const contact of newResults) {
        const inserted = await importContactToCRM(userId, contact);
        if (inserted) {
          contact.status = "approved";
          importedIds.push(contact.id);
        }
      }
    }

    const allResults = [...newResults, ...existing].slice(0, 100);
    prospectResultsStore.set(resultsKey, allResults);

    res.json({
      results: newResults,
      disclaimer: result.disclaimer,
      rateLimitNote: result.rateLimitNote,
      autoImported: importedIds.length,
    });
  } catch (err) {
    console.error("Error running prospecting scan:", err);
    res.status(500).json({ error: "Failed to run prospecting scan" });
  }
});

router.get("/bots/:id/prospecting/results", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);

    const bot = await getBotAndVerifyOwner(botId, userId);
    if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }

    const resultsKey = getBotResultsKey(botId);
    const configKey = getBotConfigKey(botId);
    const results = prospectResultsStore.get(resultsKey) ?? [];
    const config = prospectConfigStore.get(configKey);

    res.json({ results, disclaimer: config?.disclaimer ?? "" });
  } catch (err) {
    console.error("Error fetching prospecting results:", err);
    res.status(500).json({ error: "Failed to fetch results" });
  }
});

router.post("/bots/:id/prospecting/results/:resultId/approve", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);
    const resultId = parseParam(req.params.resultId);

    const bot = await getBotAndVerifyOwner(botId, userId);
    if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }

    const resultsKey = getBotResultsKey(botId);
    const results = prospectResultsStore.get(resultsKey) ?? [];
    const result = results.find(r => r.id === resultId);

    if (!result) { res.status(404).json({ error: "Result not found" }); return; }
    if (result.status === "approved") { res.json({ ok: true, alreadyImported: true }); return; }

    const imported = await importContactToCRM(userId, result);
    if (imported) {
      result.status = "approved";
      prospectResultsStore.set(resultsKey, results);
    }

    res.json({ ok: true, contact: imported });
  } catch (err) {
    console.error("Error approving prospect:", err);
    res.status(500).json({ error: "Failed to approve prospect" });
  }
});

router.post("/bots/:id/prospecting/results/:resultId/dismiss", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);
    const resultId = parseParam(req.params.resultId);

    const bot = await getBotAndVerifyOwner(botId, userId);
    if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }

    const resultsKey = getBotResultsKey(botId);
    const results = prospectResultsStore.get(resultsKey) ?? [];
    const result = results.find(r => r.id === resultId);

    if (!result) { res.status(404).json({ error: "Result not found" }); return; }

    result.status = "dismissed";
    prospectResultsStore.set(resultsKey, results);

    res.json({ ok: true });
  } catch (err) {
    console.error("Error dismissing prospect:", err);
    res.status(500).json({ error: "Failed to dismiss prospect" });
  }
});

async function importContactToCRM(
  userId: string,
  prospect: ProspectResult
): Promise<typeof contactsTable.$inferSelect | null> {
  try {
    const [contact] = await db
      .insert(contactsTable)
      .values({
        userId,
        name: prospect.name,
        email: prospect.email || "",
        phone: prospect.phone || "",
        company: prospect.company || "",
        bio: [
          prospect.bio,
          prospect.notes ? `Notes: ${prospect.notes}` : "",
          prospect.profileUrl ? `Profile: ${prospect.profileUrl}` : "",
        ].filter(Boolean).join("\n"),
        tag: "Lead",
        dealStage: "Prospect",
        address: prospect.location || "",
        hometown: prospect.location || "",
        timezone: "",
        age: "",
        ethnicity: "",
        kids: "",
      })
      .returning();

    if (contact) {
      await db.insert(dealsTable).values({
        userId,
        title: `${prospect.name}${prospect.company ? ` — ${prospect.company}` : ""}`,
        stage: "Lead",
        contactId: contact.id,
        contactName: contact.name,
        notes: [
          `Source: ${prospect.source === "linkedin" ? "LinkedIn (RECON-LI)" : "Facebook (SCOUT-FB)"}`,
          `Title: ${prospect.title}`,
          prospect.notes ? `Context: ${prospect.notes}` : "",
          prospect.profileUrl ? `Profile: ${prospect.profileUrl}` : "",
        ].filter(Boolean).join("\n"),
      });
    }

    return contact;
  } catch (err) {
    console.error("Error importing contact to CRM:", err);
    return null;
  }
}

export default router;
