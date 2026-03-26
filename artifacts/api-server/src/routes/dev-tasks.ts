import { Router, type Request, type Response } from "express";
import {
  db,
  devTasksTable,
  devTaskNotesTable,
  feedbackReportsTable,
  notificationsTable,
  organizationsTable,
  usersTable,
  orgMembersTable,
  type DevTaskPriority,
  type DevTaskStatus,
  DEV_TASK_PRIORITIES,
  DEV_TASK_STATUSES,
} from "@workspace/db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { isOwnerEmail } from "../lib/plan";
import { getUncachableResendClient } from "../lib/resend";

const router = Router();

function requireAuth(req: Request, res: Response): req is Request & { user: Express.User } {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return false;
  }
  return true;
}

function isAdmin(req: Request): boolean {
  return !!req.user && isOwnerEmail((req.user as Express.User).email);
}

async function isOrgMember(userId: string): Promise<boolean> {
  const rows = await db
    .select({ orgId: orgMembersTable.orgId })
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")));
  return rows.length > 0;
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function getOwnerInfo(): Promise<{ userId: string; email: string | null; firstName: string | null }[]> {
  const orgs = await db.select({ ownerUserId: organizationsTable.ownerUserId }).from(organizationsTable);
  const ownerIds = [...new Set(orgs.map(o => o.ownerUserId))];
  if (ownerIds.length === 0) return [];
  const owners = await db
    .select({ id: usersTable.id, email: usersTable.email, firstName: usersTable.firstName })
    .from(usersTable)
    .where(inArray(usersTable.id, ownerIds));
  return owners.map(o => ({ userId: o.id, email: o.email ?? null, firstName: o.firstName ?? null }));
}

// GET /api/dev-tasks — list all dev tasks with optional filters (authenticated org members)
router.get("/dev-tasks", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = (req.user as Express.User).id;
  const member = await isOrgMember(userId);
  if (!member && !isAdmin(req)) {
    res.status(403).json({ error: "Org membership required" });
    return;
  }

  const { priority, status, assignee, escalated } = req.query as Record<string, string>;

  const conditions: Parameters<typeof and>[] = [];
  if (priority && priority !== "all" && DEV_TASK_PRIORITIES.includes(priority as DevTaskPriority)) {
    conditions.push(eq(devTasksTable.priority, priority as DevTaskPriority) as any);
  }
  if (status && status !== "all" && DEV_TASK_STATUSES.includes(status as DevTaskStatus)) {
    conditions.push(eq(devTasksTable.status, status as DevTaskStatus) as any);
  }
  if (assignee && assignee !== "all") {
    if (assignee === "me") {
      conditions.push(eq(devTasksTable.assignedToUserId, userId) as any);
    } else {
      conditions.push(eq(devTasksTable.assignedToUserId, assignee) as any);
    }
  }
  if (escalated === "true") {
    conditions.push(eq(devTasksTable.escalated, true) as any);
  }

  const whereClause = conditions.length > 0 ? and(...(conditions as any[])) : undefined;

  const tasks = await db
    .select()
    .from(devTasksTable)
    .where(whereClause)
    .orderBy(desc(devTasksTable.createdAt));

  const feedbackIds = [...new Set(tasks.map(t => t.feedbackReportId))];
  let feedbackMap: Record<number, typeof feedbackReportsTable.$inferSelect> = {};
  if (feedbackIds.length > 0) {
    const feedbacks = await db
      .select()
      .from(feedbackReportsTable)
      .where(inArray(feedbackReportsTable.id, feedbackIds));
    feedbackMap = Object.fromEntries(feedbacks.map(f => [f.id, f]));
  }

  const result = tasks.map(t => ({
    ...t,
    feedbackReport: feedbackMap[t.feedbackReportId] ?? null,
  }));

  res.json({ tasks: result, total: result.length });
});

// GET /api/dev-tasks/escalated — dedicated endpoint for Replit planning agent (admin only)
router.get("/dev-tasks/escalated", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = (req.user as Express.User).id;
  const member = await isOrgMember(userId);
  if (!member && !isAdmin(req)) {
    res.status(403).json({ error: "Org membership required" });
    return;
  }

  const tasks = await db
    .select()
    .from(devTasksTable)
    .where(and(
      eq(devTasksTable.escalated, true),
      sql`${devTasksTable.status} != 'verified'`,
    ))
    .orderBy(desc(devTasksTable.escalatedAt));

  const feedbackIds = [...new Set(tasks.map(t => t.feedbackReportId))];
  let feedbackMap: Record<number, typeof feedbackReportsTable.$inferSelect> = {};
  if (feedbackIds.length > 0) {
    const feedbacks = await db
      .select()
      .from(feedbackReportsTable)
      .where(inArray(feedbackReportsTable.id, feedbackIds));
    feedbackMap = Object.fromEntries(feedbacks.map(f => [f.id, f]));
  }

  const result = tasks.map(t => ({
    ...t,
    feedbackReport: feedbackMap[t.feedbackReportId] ?? null,
  }));

  res.json({ escalatedTasks: result, total: result.length });
});

// GET /api/dev-tasks/:id — single task with notes (authenticated org members)
router.get("/dev-tasks/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = (req.user as Express.User).id;
  const member = await isOrgMember(userId);
  if (!member && !isAdmin(req)) {
    res.status(403).json({ error: "Org membership required" });
    return;
  }

  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid task ID" }); return; }

  const [task] = await db.select().from(devTasksTable).where(eq(devTasksTable.id, id));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }

  const [feedbackReport] = await db
    .select()
    .from(feedbackReportsTable)
    .where(eq(feedbackReportsTable.id, task.feedbackReportId));

  const notes = await db
    .select()
    .from(devTaskNotesTable)
    .where(eq(devTaskNotesTable.devTaskId, id))
    .orderBy(devTaskNotesTable.createdAt);

  res.json({ task, feedbackReport: feedbackReport ?? null, notes });
});

// PATCH /api/dev-tasks/:id — update status, priority, assignee (authenticated org members can claim/update)
router.patch("/dev-tasks/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = (req.user as Express.User).id;
  const member = await isOrgMember(userId);
  if (!member && !isAdmin(req)) {
    res.status(403).json({ error: "Org membership required" });
    return;
  }

  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid task ID" }); return; }

  const [task] = await db.select().from(devTasksTable).where(eq(devTasksTable.id, id));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }

  const { status, priority, assignedToUserId } = (req.body ?? {}) as {
    status?: string;
    priority?: string;
    assignedToUserId?: string | null;
  };

  const updates: Partial<typeof devTasksTable.$inferInsert> = { updatedAt: new Date() };
  if (status && DEV_TASK_STATUSES.includes(status as DevTaskStatus)) {
    updates.status = status as DevTaskStatus;
  }
  if (priority && DEV_TASK_PRIORITIES.includes(priority as DevTaskPriority)) {
    updates.priority = priority as DevTaskPriority;
  }
  if (assignedToUserId !== undefined) {
    updates.assignedToUserId = assignedToUserId ?? null;

    // Notify the assigned developer
    if (assignedToUserId) {
      try {
        await db.insert(notificationsTable).values({
          userId: assignedToUserId,
          type: "dev_task_assigned",
          title: `Dev task assigned to you: ${task.title}`,
          body: `Priority: ${task.priority} · Status: ${task.status}`,
          link: `/admin/dev-tasks`,
          read: false,
        });
      } catch (err) {
        console.error("[DevTasks] Failed to create assignment notification:", err);
      }
    }
  }

  if (Object.keys(updates).length <= 1) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  const [updated] = await db
    .update(devTasksTable)
    .set(updates)
    .where(eq(devTasksTable.id, id))
    .returning();

  res.json({ task: updated });
});

// POST /api/dev-tasks/:id/notes — add a note to a task (authenticated org members)
router.post("/dev-tasks/:id/notes", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = (req.user as Express.User).id;
  const member = await isOrgMember(userId);
  if (!member && !isAdmin(req)) {
    res.status(403).json({ error: "Org membership required" });
    return;
  }

  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid task ID" }); return; }

  const [task] = await db.select().from(devTasksTable).where(eq(devTasksTable.id, id));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }

  const { body } = (req.body ?? {}) as { body?: string };
  if (!body || typeof body !== "string" || body.trim().length === 0) {
    res.status(400).json({ error: "Note body is required" });
    return;
  }

  const [note] = await db
    .insert(devTaskNotesTable)
    .values({ devTaskId: id, userId, body: body.trim() })
    .returning();

  res.json({ note });
});

// POST /api/dev-tasks/:id/escalate — escalate a task (authenticated org members)
router.post("/dev-tasks/:id/escalate", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = (req.user as Express.User).id;
  const member = await isOrgMember(userId);
  if (!member && !isAdmin(req)) {
    res.status(403).json({ error: "Org membership required" });
    return;
  }

  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid task ID" }); return; }

  const [task] = await db.select().from(devTasksTable).where(eq(devTasksTable.id, id));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }

  if (task.escalated) {
    res.status(409).json({ error: "Task is already escalated" });
    return;
  }

  const now = new Date();
  const [updated] = await db
    .update(devTasksTable)
    .set({ escalated: true, escalatedAt: now, updatedAt: now })
    .where(eq(devTasksTable.id, id))
    .returning();

  const [feedbackReport] = await db
    .select()
    .from(feedbackReportsTable)
    .where(eq(feedbackReportsTable.id, task.feedbackReportId));

  // In-app notifications to owners
  try {
    const owners = await getOwnerInfo();
    for (const owner of owners) {
      await db.insert(notificationsTable).values({
        userId: owner.userId,
        type: "dev_task_escalated",
        title: `ESCALATED: ${task.title}`,
        body: `Priority: ${task.priority} · This task has been escalated for senior review.\n${feedbackReport?.description?.slice(0, 200) ?? ""}`,
        link: `/admin/dev-tasks`,
        read: false,
      });
    }
  } catch (notifErr) {
    console.error("[DevTasks] Failed to create escalation notifications:", notifErr);
  }

  // Email notification to owners
  try {
    const owners = await getOwnerInfo();
    const ownerEmails = owners.map(o => o.email).filter(Boolean) as string[];
    if (ownerEmails.length > 0) {
      const { client, fromEmail } = await getUncachableResendClient();
      const safeTitle = escapeHtml(task.title);
      const safeDesc = escapeHtml(feedbackReport?.description ?? "N/A");
      const safeCategory = escapeHtml(feedbackReport?.category ?? "N/A");
      const safeVersion = escapeHtml(feedbackReport?.appVersion ?? "N/A");

      await client.emails.send({
        from: fromEmail,
        to: ownerEmails,
        subject: `[ESCALATED] DEV TASK #${task.id} · ${task.priority.toUpperCase()} · ${safeTitle}`,
        html: `
<div style="font-family:monospace;background:#030812;color:#38bdf8;padding:24px;max-width:600px;border:1px solid rgba(56,189,248,0.2);border-radius:8px;">
  <h2 style="color:#ff4444;letter-spacing:0.1em;margin-bottom:4px;">[ ⚠ ESCALATED DEV TASK #${task.id} ]</h2>
  <p style="color:rgba(56,189,248,0.5);font-size:0.75em;margin-top:0;">SALARYMAN Platform · Requires Senior Engineer Review</p>
  <hr style="border-color:rgba(56,189,248,0.15);margin:16px 0;" />
  <p><strong style="color:#38bdf8;">Title:</strong> ${safeTitle}</p>
  <p><strong style="color:#38bdf8;">Priority:</strong> <span style="color:${task.priority === 'critical' ? '#ff4444' : task.priority === 'high' ? '#ff8800' : '#38bdf8'}">${task.priority.toUpperCase()}</span></p>
  <p><strong style="color:#38bdf8;">Status:</strong> ${task.status}</p>
  <hr style="border-color:rgba(56,189,248,0.15);margin:16px 0;" />
  <p><strong style="color:#38bdf8;">Original Bug Report:</strong></p>
  <p><strong style="color:#38bdf8;">Category:</strong> ${safeCategory}</p>
  <p><strong style="color:#38bdf8;">App Version:</strong> ${safeVersion}</p>
  <div style="background:rgba(56,189,248,0.05);border:1px solid rgba(56,189,248,0.1);border-radius:4px;padding:12px;white-space:pre-wrap;color:rgba(56,189,248,0.85);font-size:0.9em;">${safeDesc}</div>
  ${feedbackReport?.screenshotUrl ? `<p style="margin-top:12px;"><strong style="color:#38bdf8;">Screenshot:</strong> <a href="${escapeHtml(feedbackReport.screenshotUrl)}" style="color:#38bdf8;">${escapeHtml(feedbackReport.screenshotUrl)}</a></p>` : ""}
  <hr style="border-color:rgba(56,189,248,0.15);margin:16px 0;" />
  <p style="color:rgba(56,189,248,0.3);font-size:0.75em;">Escalated at ${now.toUTCString()}</p>
</div>`.trim(),
      });
    }
  } catch (emailErr) {
    console.error("[DevTasks] Failed to send escalation email:", emailErr);
  }

  res.json({ task: updated });
});

export default router;
