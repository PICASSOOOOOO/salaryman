import { Router, type Request, type Response } from "express";
import {
  db,
  ticketsTable,
  ticketCommentsTable,
  notificationsTable,
  organizationsTable,
  orgMembersTable,
  orgInvitesTable,
  usersTable,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
} from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { getUncachableResendClient } from "../lib/resend";

const router = Router();

function requireAuth(req: Request, res: Response): req is Request & { user: Express.User } {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return false;
  }
  return true;
}

async function getCallerOrgMembership(userId: string) {
  const rows = await db
    .select({ member: orgMembersTable, org: organizationsTable })
    .from(orgMembersTable)
    .innerJoin(organizationsTable, eq(orgMembersTable.orgId, organizationsTable.id))
    .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")));
  return rows[0] ?? null;
}

const ticketRateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkTicketRateLimit(ip: string): boolean {
  const now = Date.now();
  const WINDOW_MS = 60 * 60 * 1000;
  const MAX = 10;
  const entry = ticketRateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    ticketRateLimitMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX) return false;
  entry.count += 1;
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ticketRateLimitMap.entries()) {
    if (now > entry.resetAt) ticketRateLimitMap.delete(ip);
  }
}, 10 * 60 * 1000);

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

router.post("/tickets", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const user = req.user;

  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown";
  if (!checkTicketRateLimit(ip)) {
    res.status(429).json({ error: "Too many tickets submitted. Please wait before submitting again." });
    return;
  }

  const membership = await getCallerOrgMembership(user.id);
  if (!membership) {
    res.status(403).json({ error: "You must be a member of an organization to submit tickets" });
    return;
  }

  const { subject, category, priority, description, submittedByEmail, submittedByName } =
    (req.body ?? {}) as {
      subject?: string;
      category?: string;
      priority?: string;
      description?: string;
      submittedByEmail?: string;
      submittedByName?: string;
    };

  if (!subject || typeof subject !== "string" || subject.trim().length < 3) {
    res.status(400).json({ error: "Subject is required (min 3 characters)" });
    return;
  }
  if (!description || typeof description !== "string" || description.trim().length < 5) {
    res.status(400).json({ error: "Description is required (min 5 characters)" });
    return;
  }
  if (category && !TICKET_CATEGORIES.includes(category as TicketCategory)) {
    res.status(400).json({ error: `Invalid category. Must be one of: ${TICKET_CATEGORIES.join(", ")}` });
    return;
  }
  if (priority && !TICKET_PRIORITIES.includes(priority as TicketPriority)) {
    res.status(400).json({ error: `Invalid priority. Must be one of: ${TICKET_PRIORITIES.join(", ")}` });
    return;
  }

  const [ticket] = await db
    .insert(ticketsTable)
    .values({
      orgId: membership.org.id,
      subject: subject.trim(),
      category: (category as TicketCategory) ?? "support",
      priority: (priority as TicketPriority) ?? "medium",
      description: description.trim(),
      status: "open",
      submittedByUserId: user.id,
      submittedByEmail: submittedByEmail ?? user.email ?? null,
      submittedByName: submittedByName ?? user.firstName ?? null,
    })
    .returning();

  const org = membership.org;

  await db.insert(notificationsTable).values({
    userId: org.ownerUserId,
    type: "new_ticket",
    title: `New ticket: ${ticket.subject}`,
    body: `Priority: ${ticket.priority} · Category: ${ticket.category}\n${ticket.description.slice(0, 200)}`,
    link: `/admin/tickets/${ticket.id}`,
    read: false,
  });

  try {
    const ownerRows = await db
      .select({ email: usersTable.email, firstName: usersTable.firstName })
      .from(usersTable)
      .where(eq(usersTable.id, org.ownerUserId));
    const ownerEmail = ownerRows[0]?.email;

    if (ownerEmail) {
      const { client, fromEmail } = await getUncachableResendClient();
      const safeSubject = escapeHtml(ticket.subject);
      const safeDesc = escapeHtml(ticket.description);
      const safeName = escapeHtml(submittedByName ?? user.firstName ?? "Unknown");
      const safeEmail = escapeHtml(submittedByEmail ?? user.email ?? "Unknown");
      await client.emails.send({
        from: fromEmail,
        to: [ownerEmail],
        subject: `[TICKET #${ticket.id}] ${ticket.priority.toUpperCase()} · ${safeSubject}`,
        html: `
<div style="font-family:monospace;background:#030803;color:#00ff41;padding:24px;max-width:600px;border:1px solid rgba(0,255,65,0.2);border-radius:8px;">
  <h2 style="color:#00ff41;letter-spacing:0.1em;margin-bottom:4px;">[ NEW SUPPORT TICKET #${ticket.id} ]</h2>
  <p style="color:rgba(0,255,65,0.5);font-size:0.75em;margin-top:0;">SALARYMAN Platform · ${escapeHtml(org.name)}</p>
  <hr style="border-color:rgba(0,255,65,0.15);margin:16px 0;" />
  <p><strong style="color:#00ff41;">Subject:</strong> ${safeSubject}</p>
  <p><strong style="color:#00ff41;">Category:</strong> ${ticket.category}</p>
  <p><strong style="color:#00ff41;">Priority:</strong> <span style="color:${ticket.priority === 'urgent' ? '#ff4444' : ticket.priority === 'high' ? '#ff8800' : '#00ff41'}">${ticket.priority.toUpperCase()}</span></p>
  <p><strong style="color:#00ff41;">Submitted by:</strong> ${safeName} (${safeEmail})</p>
  <hr style="border-color:rgba(0,255,65,0.15);margin:16px 0;" />
  <p><strong style="color:#00ff41;">Description:</strong></p>
  <div style="background:rgba(0,255,65,0.05);border:1px solid rgba(0,255,65,0.1);border-radius:4px;padding:12px;white-space:pre-wrap;color:rgba(0,255,65,0.85);font-size:0.9em;">${safeDesc}</div>
  <hr style="border-color:rgba(0,255,65,0.15);margin:16px 0;" />
  <p style="color:rgba(0,255,65,0.3);font-size:0.75em;">Ticket submitted ${new Date().toUTCString()}</p>
</div>`.trim(),
      });
    }
  } catch (err) {
    console.error("[Tickets] Failed to send email notification:", err);
  }

  res.json({ ticket });
});

router.get("/tickets", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;

  const membership = await getCallerOrgMembership(userId);
  if (!membership) {
    res.status(403).json({ error: "You must be a member of an organization to view tickets" });
    return;
  }

  const { status, assignedTo, category } = req.query as {
    status?: string;
    assignedTo?: string;
    category?: string;
  };

  const conditions = [eq(ticketsTable.orgId, membership.org.id)];
  if (status && TICKET_STATUSES.includes(status as TicketStatus)) {
    conditions.push(eq(ticketsTable.status, status as TicketStatus));
  }
  if (assignedTo === "me") {
    conditions.push(eq(ticketsTable.assignedToUserId, userId));
  }
  if (category && TICKET_CATEGORIES.includes(category as TicketCategory)) {
    conditions.push(eq(ticketsTable.category, category as TicketCategory));
  }

  const tickets = await db
    .select()
    .from(ticketsTable)
    .where(and(...conditions))
    .orderBy(desc(ticketsTable.createdAt));

  const openCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ticketsTable)
    .where(and(eq(ticketsTable.orgId, membership.org.id), eq(ticketsTable.status, "open")));

  const assignedToMeCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ticketsTable)
    .where(and(
      eq(ticketsTable.orgId, membership.org.id),
      eq(ticketsTable.assignedToUserId, userId),
      eq(ticketsTable.status, "in_progress"),
    ));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const resolvedTodayCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ticketsTable)
    .where(and(
      eq(ticketsTable.orgId, membership.org.id),
      eq(ticketsTable.status, "resolved"),
      sql`${ticketsTable.updatedAt} >= ${today.toISOString()}`,
    ));

  res.json({
    tickets,
    org: membership.org,
    member: membership.member,
    summary: {
      open: openCount[0]?.count ?? 0,
      assignedToMe: assignedToMeCount[0]?.count ?? 0,
      resolvedToday: resolvedTodayCount[0]?.count ?? 0,
    },
  });
});

router.get("/tickets/:ticketId", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const ticketId = parseInt(req.params.ticketId);
  if (isNaN(ticketId)) { res.status(400).json({ error: "Invalid ticket ID" }); return; }

  const membership = await getCallerOrgMembership(userId);
  if (!membership) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  const [ticket] = await db
    .select()
    .from(ticketsTable)
    .where(and(eq(ticketsTable.id, ticketId), eq(ticketsTable.orgId, membership.org.id)));

  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }

  const comments = await db
    .select()
    .from(ticketCommentsTable)
    .where(eq(ticketCommentsTable.ticketId, ticketId))
    .orderBy(ticketCommentsTable.createdAt);

  const orgMembers = await db
    .select()
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.orgId, membership.org.id), eq(orgMembersTable.status, "active")));

  res.json({ ticket, comments, orgMembers });
});

router.patch("/tickets/:ticketId", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const ticketId = parseInt(req.params.ticketId);
  if (isNaN(ticketId)) { res.status(400).json({ error: "Invalid ticket ID" }); return; }

  const membership = await getCallerOrgMembership(userId);
  if (!membership) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  const [ticket] = await db
    .select()
    .from(ticketsTable)
    .where(and(eq(ticketsTable.id, ticketId), eq(ticketsTable.orgId, membership.org.id)));

  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }

  const { status, assignedToUserId, priority } = (req.body ?? {}) as {
    status?: string;
    assignedToUserId?: string | null;
    priority?: string;
  };

  const updates: Partial<typeof ticketsTable.$inferInsert> = {};
  if (status && TICKET_STATUSES.includes(status as TicketStatus)) updates.status = status as TicketStatus;
  if (assignedToUserId !== undefined) updates.assignedToUserId = assignedToUserId ?? null;
  if (priority && TICKET_PRIORITIES.includes(priority as TicketPriority)) updates.priority = priority as TicketPriority;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  const [updated] = await db
    .update(ticketsTable)
    .set(updates)
    .where(eq(ticketsTable.id, ticketId))
    .returning();

  if (ticket.submittedByUserId && ticket.submittedByUserId !== userId) {
    try {
      const changes: string[] = [];
      if (updates.status) changes.push(`status changed to ${updates.status}`);
      if (updates.priority) changes.push(`priority set to ${updates.priority}`);
      if (updates.assignedToUserId !== undefined) changes.push(`assigned to a team member`);
      await db.insert(notificationsTable).values({
        userId: ticket.submittedByUserId,
        type: "ticket_update",
        title: `Ticket updated: ${ticket.subject}`,
        body: changes.length > 0 ? changes.join(", ").replace(/^./, c => c.toUpperCase()) + "." : "Your ticket has been updated.",
        link: `/business/tickets`,
      });
    } catch (err) {
      console.error("[Tickets] notification error:", err);
    }
  }

  res.json({ ticket: updated });
});

router.post("/tickets/:ticketId/comments", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const ticketId = parseInt(req.params.ticketId);
  if (isNaN(ticketId)) { res.status(400).json({ error: "Invalid ticket ID" }); return; }

  const membership = await getCallerOrgMembership(userId);
  if (!membership) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  const [ticket] = await db
    .select()
    .from(ticketsTable)
    .where(and(eq(ticketsTable.id, ticketId), eq(ticketsTable.orgId, membership.org.id)));

  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }

  const { body, isInternal } = (req.body ?? {}) as { body?: string; isInternal?: boolean };
  if (!body || typeof body !== "string" || body.trim().length === 0) {
    res.status(400).json({ error: "Comment body is required" });
    return;
  }

  const [comment] = await db
    .insert(ticketCommentsTable)
    .values({
      ticketId,
      userId,
      body: body.trim(),
      isInternal: isInternal !== false,
    })
    .returning();

  if (ticket.submittedByUserId && ticket.submittedByUserId !== userId && !isInternal) {
    try {
      await db.insert(notificationsTable).values({
        userId: ticket.submittedByUserId,
        type: "ticket_comment",
        title: `New reply on ticket: ${ticket.subject}`,
        body: body.trim().slice(0, 200),
        link: `/business/tickets`,
      });
    } catch (err) {
      console.error("[Tickets] comment notification error:", err);
    }
  }

  res.json({ comment });
});

router.get("/notifications", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;

  const notifications = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, userId))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);

  const unreadCount = notifications.filter(n => !n.read).length;

  res.json({ notifications, unreadCount });
});

router.delete("/notifications/:id", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db
    .delete(notificationsTable)
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, userId)));
  res.json({ ok: true });
});

router.post("/notifications/clear", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  await db
    .delete(notificationsTable)
    .where(eq(notificationsTable.userId, userId));
  res.json({ ok: true });
});

router.post("/notifications/mark-read", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;

  const { ids } = (req.body ?? {}) as { ids?: number[] };

  if (ids && Array.isArray(ids) && ids.length > 0) {
    for (const id of ids) {
      await db
        .update(notificationsTable)
        .set({ read: true })
        .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, userId)));
    }
  } else {
    await db
      .update(notificationsTable)
      .set({ read: true })
      .where(eq(notificationsTable.userId, userId));
  }

  res.json({ ok: true });
});

router.get("/orgs/:orgId/invites", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const orgId = parseInt(req.params.orgId);
  if (isNaN(orgId)) { res.status(400).json({ error: "Invalid org ID" }); return; }

  const membership = await db
    .select()
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")));

  if (!membership[0] || (membership[0].role !== "owner" && membership[0].role !== "manager")) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  const invites = await db
    .select()
    .from(orgInvitesTable)
    .where(eq(orgInvitesTable.orgId, orgId))
    .orderBy(desc(orgInvitesTable.createdAt));

  res.json({ invites });
});

export default router;
