import { Router, type IRouter } from "express";
import { db, feedbackReportsTable, devTasksTable, notificationsTable, organizationsTable } from "@workspace/db";
import { eq, sql, desc, and } from "drizzle-orm";
import { isOwnerEmail } from "../lib/plan";
import { isApprovedAlpha } from "./alpha";

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

// Auto-captured error reports. Open to guests on purpose: errors fire on the
// landing page and during the unauthenticated Pablo intro, and we need them
// captured even when no user session exists. Stored as kind="error_report"
// in the same feedback table so the admin dashboard sees them alongside
// human-submitted feedback. Never auto-creates a dev task — devs triage.
router.post("/feedback/error-report", async (req, res) => {
  try {
    const body = (req.body ?? {}) as {
      message?: string;
      stack?: string;
      url?: string;
      userAgent?: string;
      source?: string;          // "react" | "window.onerror" | "unhandledrejection" | "manual"
      componentStack?: string;
      userNote?: string;
      appVersion?: string;
    };

    const message = (body.message ?? "Unknown error").toString().slice(0, 500).trim() || "Unknown error";
    const userId = getUserId(req);

    // Build the description as a structured technical report. Cap each field
    // so a giant stack trace can't blow out the 10k description limit.
    const parts: string[] = [];
    if (body.userNote?.trim()) {
      parts.push(`USER NOTE:\n${body.userNote.trim().slice(0, 2000)}`);
    }
    parts.push(`SOURCE: ${(body.source ?? "unknown").toString().slice(0, 64)}`);
    if (body.url) parts.push(`URL: ${body.url.toString().slice(0, 500)}`);
    if (body.userAgent) parts.push(`UA: ${body.userAgent.toString().slice(0, 500)}`);
    if (body.stack) parts.push(`STACK:\n${body.stack.toString().slice(0, 4000)}`);
    if (body.componentStack) parts.push(`COMPONENT STACK:\n${body.componentStack.toString().slice(0, 2000)}`);
    if (!userId) parts.push("USER: <guest>");
    const description = parts.join("\n\n").slice(0, 10000);

    const titleSource = body.userNote?.trim() ? body.userNote.trim() : message;
    const title = `[error] ${titleSource}`.slice(0, 500);

    const [row] = await db.insert(feedbackReportsTable).values({
      userId: userId ?? null,
      title,
      description,
      kind: "error_report",
      category: "Bug",
      status: "open",
      appVersion: body.appVersion?.slice(0, 50) ?? null,
    }).returning();

    res.status(201).json({ ok: true, id: row.id });
  } catch (e) {
    console.error("[Error Report] Failed to record:", e);
    // Never let error-reporting itself bubble back as another error to the
    // client — the page is already in a bad state. Return 200 so the client
    // doesn't loop trying to report the failure to report.
    res.status(200).json({ ok: false });
  }
});

router.post("/feedback", async (req, res) => {
  try {
    const { title, description, category, screenshotUrl, appVersion, kind } = req.body;
    if (!title?.trim()) { res.status(400).json({ error: "Title required" }); return; }
    if (title.trim().length > 500) { res.status(400).json({ error: "Title too long (max 500 chars)" }); return; }
    if (!description?.trim()) { res.status(400).json({ error: "Description required" }); return; }
    if (description.trim().length > 10000) { res.status(400).json({ error: "Description too long (max 10000 chars)" }); return; }

    const validCategories = ["Bug", "UI Issue", "Feature Request", "Performance", "Other"];
    const cat = validCategories.includes(category) ? category : "Bug";

    // Bug vs feedback distinction:
    //   "feedback" — a note/idea for the team. Anyone can submit. No dev task created.
    //   "bug"      — a defect that should auto-create a dev task. Only Picasso admins
    //                or APPROVED alpha testers / alpha devs may submit bugs.
    const requestedKind = kind === "bug" ? "bug" : "feedback";
    const userId = getUserId(req);
    if (!userId) { res.status(401).json({ error: "Sign in to submit feedback" }); return; }

    let finalKind: "bug" | "feedback" = requestedKind;
    if (requestedKind === "bug") {
      const admin = isAdmin(req);
      const alpha = admin ? { tester: true, dev: true } : await isApprovedAlpha(userId);
      if (!admin && !alpha.tester && !alpha.dev) {
        res.status(403).json({
          error: "Only approved alpha testers or developers can submit bugs. Apply at /alpha — until then, your note will be filed as feedback.",
          code: "ALPHA_REQUIRED",
        });
        return;
      }
    }

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

    const [row] = await db.insert(feedbackReportsTable).values({
      userId,
      title: title.trim(),
      description: description.trim(),
      kind: finalKind,
      category: cat,
      screenshotUrl: safeScreenshotUrl,
      status: "open",
      appVersion: appVersion ?? null,
    }).returning();

    let devTask: typeof devTasksTable.$inferSelect | null = null;
    if (finalKind === "bug") {
      // Bugs from approved alphas auto-create dev tasks (no human approval needed —
      // the alpha was already vetted on the way in).
      const priority = derivePriority(cat);
      [devTask] = await db.insert(devTasksTable).values({
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
    const { category, status, kind, limit: limitParam, offset: offsetParam } = req.query as Record<string, string>;
    const limit = Math.min(Number(limitParam) || 50, 200);
    const offset = Number(offsetParam) || 0;

    const filters = [
      category && category !== "all" ? eq(feedbackReportsTable.category, category) : undefined,
      status && status !== "all" ? eq(feedbackReportsTable.status, status) : undefined,
      kind && kind !== "all" ? eq(feedbackReportsTable.kind, kind) : undefined,
    ].filter(Boolean) as ReturnType<typeof eq>[];
    const whereClause = filters.length ? and(...filters) : undefined;

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
