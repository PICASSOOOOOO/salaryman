import { Router, type IRouter } from "express";
import { db, feedbackReportsTable, devTasksTable, notificationsTable, usersTable, organizationsTable } from "@workspace/db";
import { eq, sql, desc, and } from "drizzle-orm";
import { isOwnerEmail } from "../lib/plan";

const router: IRouter = Router();

function getUserId(req: Express.Request): string | null {
  if (!req.isAuthenticated?.()) return null;
  return req.user?.id ?? null;
}

function isAdmin(req: Express.Request): boolean {
  return !!req.user && isOwnerEmail(req.user.email);
}

function derivePriority(category: string): "low" | "medium" | "high" | "critical" {
  switch (category) {
    case "Performance": return "high";
    case "Bug": return "high";
    case "UI Issue": return "low";
    case "Feature Request": return "medium";
    default: return "medium";
  }
}

async function getOwnerUserIds(): Promise<string[]> {
  const rows = await db
    .select({ ownerUserId: organizationsTable.ownerUserId })
    .from(organizationsTable);
  return [...new Set(rows.map(r => r.ownerUserId))];
}

router.post("/feedback", async (req, res) => {
  try {
    const { title, description, category, screenshotUrl, appVersion } = req.body;
    if (!title?.trim()) { res.status(400).json({ error: "Title required" }); return; }
    if (title.trim().length > 500) { res.status(400).json({ error: "Title too long (max 500 chars)" }); return; }
    if (!description?.trim()) { res.status(400).json({ error: "Description required" }); return; }
    if (description.trim().length > 10000) { res.status(400).json({ error: "Description too long (max 10000 chars)" }); return; }

    const validCategories = ["Bug", "UI Issue", "Feature Request", "Performance", "Other"];
    const cat = validCategories.includes(category) ? category : "Bug";

    let safeScreenshotUrl: string | null = null;
    if (screenshotUrl?.trim()) {
      try {
        const parsed = new URL(screenshotUrl.trim());
        if (parsed.protocol === "https:" || parsed.protocol === "http:") {
          safeScreenshotUrl = parsed.href.slice(0, 2048);
        }
      } catch {
        // invalid URL — discard silently
      }
    }

    const userId = getUserId(req);

    const [row] = await db.insert(feedbackReportsTable).values({
      userId,
      title: title.trim(),
      description: description.trim(),
      category: cat,
      screenshotUrl: safeScreenshotUrl,
      status: "open",
      appVersion: appVersion ?? null,
    }).returning();

    // Auto-create dev task
    const priority = derivePriority(cat);
    const [devTask] = await db.insert(devTasksTable).values({
      feedbackReportId: row.id,
      title: row.title,
      priority,
      status: "open",
      escalated: false,
      notes: "",
    }).returning();

    // Notify owners about the new dev task
    try {
      const ownerIds = await getOwnerUserIds();
      for (const ownerId of ownerIds) {
        await db.insert(notificationsTable).values({
          userId: ownerId,
          type: "new_dev_task",
          title: `New dev task: ${row.title}`,
          body: `Category: ${cat} · Priority: ${priority}\n${description.trim().slice(0, 200)}`,
          link: `/admin/dev-tasks`,
          read: false,
        });
      }
    } catch (notifErr) {
      console.error("[Feedback] Failed to create dev task notifications:", notifErr);
    }

    res.status(201).json({ report: row, devTask });
  } catch (e) {
    console.error("Failed to submit feedback:", e);
    res.status(500).json({ error: "Failed to submit feedback" });
  }
});

router.get("/feedback", async (req, res) => {
  if (!req.isAuthenticated?.() || !isAdmin(req)) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  try {
    const { category, status, limit: limitParam, offset: offsetParam } = req.query as Record<string, string>;
    const limit = Math.min(Number(limitParam) || 50, 200);
    const offset = Number(offsetParam) || 0;

    const catFilter = category && category !== "all" ? eq(feedbackReportsTable.category, category) : undefined;
    const statusFilter = status && status !== "all" ? eq(feedbackReportsTable.status, status) : undefined;
    const whereClause = catFilter && statusFilter ? and(catFilter, statusFilter) : catFilter ?? statusFilter;

    const rows = await db.select().from(feedbackReportsTable)
      .where(whereClause)
      .orderBy(desc(feedbackReportsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(feedbackReportsTable).where(whereClause);

    res.json({ reports: rows, total: Number(count) });
  } catch (e) {
    console.error("Failed to fetch feedback:", e);
    res.status(500).json({ error: "Failed to fetch feedback" });
  }
});

router.patch("/feedback/:id", async (req, res) => {
  if (!req.isAuthenticated?.() || !isAdmin(req)) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  try {
    const id = Number(req.params.id);
    const { status } = req.body;

    const validStatuses = ["open", "acknowledged", "resolved"];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }

    const [row] = await db.update(feedbackReportsTable)
      .set({ status, updatedAt: new Date() })
      .where(eq(feedbackReportsTable.id, id))
      .returning();

    if (!row) { res.status(404).json({ error: "Report not found" }); return; }
    res.json({ report: row });
  } catch (e) {
    console.error("Failed to update feedback:", e);
    res.status(500).json({ error: "Failed to update feedback" });
  }
});

export default router;
