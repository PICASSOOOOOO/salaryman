import { Router, type IRouter, type Request, type Response } from "express";
import { db, jobListingsTable, applicantsTable, staffTable, contactsTable, projectsTable, zapierWebhooksTable, discordWebhooksTable, userTiersTable } from "@workspace/db";
import { eq, and, sql, gte } from "drizzle-orm";
import { fireWebhook, isValidWebhookUrl } from "../lib/webhook";
import { fireDiscordWebhook, isValidDiscordWebhookUrl, buildSampleDiscordBody, type DiscordWebhookEvent } from "../lib/discord-webhook";
import { safeFetch } from "../lib/safe-fetch";

const router: IRouter = Router();

const PRO_MONTHLY_PRICE = 25;

function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Login required" });
    return false;
  }
  return true;
}

async function buildStats(userId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [openPositions] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(jobListingsTable)
    .where(and(eq(jobListingsTable.userId, userId), eq(jobListingsTable.status, "open")));

  const [totalApplicants] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(applicantsTable)
    .where(eq(applicantsTable.userId, userId));

  const [activeStaff] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(staffTable)
    .where(and(eq(staffTable.userId, userId), eq(staffTable.status, "active")));

  const [hiresThisMonth] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(staffTable)
    .where(and(eq(staffTable.userId, userId), gte(staffTable.startDate, monthStart)));

  const [totalContacts] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contactsTable)
    .where(eq(contactsTable.userId, userId));

  const [activeProjects] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(projectsTable)
    .where(eq(projectsTable.userId, userId));

  const applicantsByStage = await db
    .select({
      stage: applicantsTable.stage,
      count: sql<number>`count(*)::int`,
    })
    .from(applicantsTable)
    .where(eq(applicantsTable.userId, userId))
    .groupBy(applicantsTable.stage);

  const hiresPerMonth = await db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${staffTable.startDate}), 'YYYY-MM')`,
      count: sql<number>`count(*)::int`,
    })
    .from(staffTable)
    .where(and(eq(staffTable.userId, userId), gte(staffTable.startDate, sixMonthsAgo)))
    .groupBy(sql`date_trunc('month', ${staffTable.startDate})`)
    .orderBy(sql`date_trunc('month', ${staffTable.startDate}) ASC`);

  const applicantsPerMonth = await db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${applicantsTable.createdAt}), 'YYYY-MM')`,
      count: sql<number>`count(*)::int`,
    })
    .from(applicantsTable)
    .where(and(eq(applicantsTable.userId, userId), gte(applicantsTable.createdAt, sixMonthsAgo)))
    .groupBy(sql`date_trunc('month', ${applicantsTable.createdAt})`)
    .orderBy(sql`date_trunc('month', ${applicantsTable.createdAt}) ASC`);

  const allTiers = await db
    .select({ tier: userTiersTable.tier, updatedAt: userTiersTable.updatedAt })
    .from(userTiersTable);

  const totalProSubscribers = allTiers.filter(t => t.tier === "pro").length;
  const totalFreeUsers = allTiers.filter(t => t.tier !== "pro").length;
  const estimatedMRR = totalProSubscribers * PRO_MONTHLY_PRICE;

  const proUpgradesThisMonth = allTiers.filter(
    t => t.tier === "pro" && t.updatedAt >= monthStart
  ).length;

  return {
    summary: {
      openPositions: openPositions.count,
      totalApplicants: totalApplicants.count,
      activeStaff: activeStaff.count,
      hiresThisMonth: hiresThisMonth.count,
      totalContacts: totalContacts.count,
      activeProjects: activeProjects.count,
    },
    billing: {
      totalProSubscribers,
      totalFreeUsers,
      estimatedMRR,
      proUpgradesThisMonth,
      pricePerMonth: PRO_MONTHLY_PRICE,
    },
    applicantsByStage,
    hiresPerMonth,
    applicantsPerMonth,
  };
}

router.get("/reporting/stats", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const stats = await buildStats(req.user!.id);
  res.json(stats);
});

router.get("/reporting/webhook", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;
  const [row] = await db
    .select()
    .from(zapierWebhooksTable)
    .where(eq(zapierWebhooksTable.userId, userId));
  res.json({ webhook: row ?? null });
});

router.put("/reporting/webhook", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;
  const body = req.body as {
    webhookUrl?: string;
    eventNewHire?: boolean;
    eventNewContact?: boolean;
    eventWeeklySummary?: boolean;
    eventNewApplicant?: boolean;
    eventApplicantStageChanged?: boolean;
    eventDealStageChanged?: boolean;
  };

  const trimmedUrl = (body.webhookUrl ?? "").trim();
  if (trimmedUrl && !isValidWebhookUrl(trimmedUrl)) {
    res.status(400).json({ error: "Invalid webhook URL. Must be a valid http(s) URL." });
    return;
  }

  const values = {
    userId,
    webhookUrl: trimmedUrl,
    eventNewHire: body.eventNewHire ?? true,
    eventNewContact: body.eventNewContact ?? false,
    eventWeeklySummary: body.eventWeeklySummary ?? false,
    eventNewApplicant: body.eventNewApplicant ?? false,
    eventApplicantStageChanged: body.eventApplicantStageChanged ?? false,
    eventDealStageChanged: body.eventDealStageChanged ?? false,
  };

  const [row] = await db
    .insert(zapierWebhooksTable)
    .values(values)
    .onConflictDoUpdate({
      target: zapierWebhooksTable.userId,
      set: {
        webhookUrl: values.webhookUrl,
        eventNewHire: values.eventNewHire,
        eventNewContact: values.eventNewContact,
        eventWeeklySummary: values.eventWeeklySummary,
        eventNewApplicant: values.eventNewApplicant,
        eventApplicantStageChanged: values.eventApplicantStageChanged,
        eventDealStageChanged: values.eventDealStageChanged,
        updatedAt: new Date(),
      },
    })
    .returning();

  res.json({ webhook: row });
});

router.delete("/reporting/webhook", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;
  await db.delete(zapierWebhooksTable).where(eq(zapierWebhooksTable.userId, userId));
  res.json({ ok: true });
});

router.post("/reporting/webhook/test", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;
  const [row] = await db
    .select()
    .from(zapierWebhooksTable)
    .where(eq(zapierWebhooksTable.userId, userId));

  if (!row?.webhookUrl) {
    res.status(400).json({ error: "No webhook URL configured" });
    return;
  }

  try {
    const response = await safeFetch(row.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "test",
        timestamp: new Date().toISOString(),
        message: "PABLO CORP — Webhook connection verified. All systems nominal.",
      }),
      timeoutMs: 8000,
    });
    res.json({ ok: true, status: response.status });
  } catch (err) {
    res.status(502).json({ error: `Webhook delivery failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// ── Discord webhook (self-serve, all users) ──────────────────────────────────
// Mirrors the Zapier webhook above but delivers to a user's Discord channel
// webhook. Discord requires a specific embed body shape (see discord-webhook.ts).
router.get("/reporting/discord", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;
  const [row] = await db
    .select()
    .from(discordWebhooksTable)
    .where(eq(discordWebhooksTable.userId, userId));
  res.json({ webhook: row ?? null });
});

router.put("/reporting/discord", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;
  const body = req.body as {
    webhookUrl?: string;
    eventNewHire?: boolean;
    eventNewContact?: boolean;
    eventWeeklySummary?: boolean;
    eventNewApplicant?: boolean;
    eventApplicantStageChanged?: boolean;
    eventDealStageChanged?: boolean;
  };

  const trimmedUrl = (body.webhookUrl ?? "").trim();
  if (trimmedUrl && !isValidDiscordWebhookUrl(trimmedUrl)) {
    res.status(400).json({ error: "Invalid Discord webhook URL. Must be a https://discord.com/api/webhooks/... URL." });
    return;
  }

  const values = {
    userId,
    webhookUrl: trimmedUrl,
    eventNewHire: body.eventNewHire ?? true,
    eventNewContact: body.eventNewContact ?? false,
    eventWeeklySummary: body.eventWeeklySummary ?? false,
    eventNewApplicant: body.eventNewApplicant ?? false,
    eventApplicantStageChanged: body.eventApplicantStageChanged ?? false,
    eventDealStageChanged: body.eventDealStageChanged ?? false,
  };

  const [row] = await db
    .insert(discordWebhooksTable)
    .values(values)
    .onConflictDoUpdate({
      target: discordWebhooksTable.userId,
      set: {
        webhookUrl: values.webhookUrl,
        eventNewHire: values.eventNewHire,
        eventNewContact: values.eventNewContact,
        eventWeeklySummary: values.eventWeeklySummary,
        eventNewApplicant: values.eventNewApplicant,
        eventApplicantStageChanged: values.eventApplicantStageChanged,
        eventDealStageChanged: values.eventDealStageChanged,
        updatedAt: new Date(),
      },
    })
    .returning();

  res.json({ webhook: row });
});

router.delete("/reporting/discord", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;
  await db.delete(discordWebhooksTable).where(eq(discordWebhooksTable.userId, userId));
  res.json({ ok: true });
});

router.post("/reporting/discord/test", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;
  const [row] = await db
    .select()
    .from(discordWebhooksTable)
    .where(eq(discordWebhooksTable.userId, userId));

  if (!row?.webhookUrl) {
    res.status(400).json({ error: "No webhook URL configured" });
    return;
  }

  // Build a sample preview for each enabled event so users see exactly how their
  // alerts (including the stage-change embeds with from/to fields) will look.
  const enabledEvents: DiscordWebhookEvent[] = [];
  if (row.eventNewHire) enabledEvents.push("new_hire");
  if (row.eventNewApplicant) enabledEvents.push("new_applicant");
  if (row.eventNewContact) enabledEvents.push("new_contact");
  if (row.eventApplicantStageChanged) enabledEvents.push("applicant_stage_changed");
  if (row.eventDealStageChanged) enabledEvents.push("deal_stage_changed");
  if (row.eventWeeklySummary) enabledEvents.push("weekly_summary");

  const body = enabledEvents.length > 0
    ? buildSampleDiscordBody(enabledEvents)
    : {
        username: "PABLO CORP",
        embeds: [{
          title: "✅ Webhook connection verified",
          description: "PABLO CORP — Discord webhook connected. No events are enabled yet, so there's nothing to preview.",
          color: 0x38bdf8,
          footer: { text: "SALARYMAN · PABLO CORP" },
          timestamp: new Date().toISOString(),
        }],
      };

  try {
    const response = await safeFetch(row.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: 8000,
    });
    if (!response.ok) {
      res.status(502).json({ error: `Discord rejected the webhook (HTTP ${response.status})` });
      return;
    }
    res.json({ ok: true, status: response.status, previewCount: enabledEvents.length });
  } catch (err) {
    res.status(502).json({ error: `Webhook delivery failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

export async function dispatchWeeklySummaries(): Promise<void> {
  console.log("[Reporting] Dispatching weekly summary webhooks...");
  const webhooks = await db
    .select()
    .from(zapierWebhooksTable)
    .where(eq(zapierWebhooksTable.eventWeeklySummary, true));

  for (const webhook of webhooks) {
    if (!webhook.webhookUrl) continue;
    try {
      const stats = await buildStats(webhook.userId);
      await fireWebhook(webhook.userId, "weekly_summary", {
        summary: stats.summary,
        billing: stats.billing,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`[Reporting] Weekly summary failed for user ${webhook.userId}:`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`[Reporting] Weekly summary dispatched to ${webhooks.length} subscribers.`);

  const discordHooks = await db
    .select()
    .from(discordWebhooksTable)
    .where(eq(discordWebhooksTable.eventWeeklySummary, true));

  for (const hook of discordHooks) {
    if (!hook.webhookUrl) continue;
    try {
      const stats = await buildStats(hook.userId);
      await fireDiscordWebhook(hook.userId, "weekly_summary", {
        summary: stats.summary,
        billing: stats.billing,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`[Reporting] Discord weekly summary failed for user ${hook.userId}:`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`[Reporting] Discord weekly summary dispatched to ${discordHooks.length} subscribers.`);
}

export default router;
