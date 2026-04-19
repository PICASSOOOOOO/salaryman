import { Router, type Request, type Response } from "express";
import { db, orgInvitesTable, organizationsTable, appointmentsTable, chatChannelsTable } from "@workspace/db";
import { and, eq, gt, isNull, sql } from "drizzle-orm";

const router = Router();

function requireAuth(req: Request, res: Response): req is Request & { user: Express.User } {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return false;
  }
  return true;
}

export type PabloFeedItem = {
  id: string;
  kind: "job_offer" | "appointment_soon" | "dm_unread";
  title: string;
  body: string;
  action: { path: string; label: string } | null;
  severity: "info" | "warn" | "urgent";
  createdAt: string;
};

router.get("/me/pablo-feed", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = (req.user as { id: string }).id;
  const userEmail = (req.user as { email?: string }).email ?? null;

  const items: PabloFeedItem[] = [];

  // 1. Pending job offers (org_invites with offered_role, not yet decided)
  try {
    const offers = await db
      .select({
        id: orgInvitesTable.id,
        orgName: organizationsTable.name,
        title: orgInvitesTable.offeredTitle,
        role: orgInvitesTable.offeredRole,
        salary: orgInvitesTable.offeredSalary,
        createdAt: orgInvitesTable.createdAt,
      })
      .from(orgInvitesTable)
      .leftJoin(organizationsTable, eq(orgInvitesTable.orgId, organizationsTable.id))
      .where(and(
        eq(orgInvitesTable.status, "pending"),
        isNull(orgInvitesTable.decidedAt),
        userEmail
          ? sql`(${orgInvitesTable.inviteEmail} = ${userEmail})`
          : sql`false`,
        gt(orgInvitesTable.expiresAt, new Date()),
      ))
      .limit(10);

    for (const o of offers) {
      const salaryNote = o.salary ? ` at $${o.salary.toLocaleString()}/yr` : "";
      items.push({
        id: `offer-${o.id}`,
        kind: "job_offer",
        title: `Job offer from ${o.orgName ?? "an org"}`,
        body: `${o.title || o.role || "A role"}${salaryNote}. Tap to review.`,
        action: { path: "/job-offers", label: "Review offers" },
        severity: "urgent",
        createdAt: (o.createdAt ?? new Date()).toISOString(),
      });
    }
  } catch (err) {
    console.error("[pablo-feed] offers query failed:", err);
  }

  // 2. Appointments in the next 60 minutes
  try {
    const now = new Date();
    const horizon = new Date(now.getTime() + 60 * 60 * 1000);
    const appts = await db
      .select()
      .from(appointmentsTable)
      .where(and(
        eq(appointmentsTable.userId, userId),
        gt(appointmentsTable.startAt, now),
      ))
      .limit(20);

    for (const a of appts) {
      if (a.startAt > horizon) continue;
      const minutes = Math.max(1, Math.round((a.startAt.getTime() - now.getTime()) / 60000));
      items.push({
        id: `appt-${a.id}`,
        kind: "appointment_soon",
        title: `${a.title} in ${minutes} min`,
        body: a.location ? `Where: ${a.location}` : "On your calendar.",
        action: { path: "/calendar", label: "Open calendar" },
        severity: minutes <= 10 ? "urgent" : "warn",
        createdAt: (a.createdAt ?? new Date()).toISOString(),
      });
    }
  } catch (err) {
    console.error("[pablo-feed] appointments query failed:", err);
  }

  // 3. Unread DMs (channels where user is participant and last_message_at > last_read_at)
  try {
    const dms = await db.execute(sql`
      SELECT c.id, c.name, c.last_message_at
      FROM chat_channels c
      JOIN chat_channel_members m ON m.channel_id = c.id
      WHERE c.type = 'dm'
        AND m.user_id = ${userId}
        AND c.last_message_at IS NOT NULL
        AND (m.last_read_at IS NULL OR c.last_message_at > m.last_read_at)
      ORDER BY c.last_message_at DESC
      LIMIT 5
    `);
    const rows = (dms as unknown as { rows: Array<{ id: number; name: string | null; last_message_at: Date }> }).rows ?? [];
    for (const r of rows) {
      items.push({
        id: `dm-${r.id}`,
        kind: "dm_unread",
        title: `New message${r.name ? ` from ${r.name}` : ""}`,
        body: "Tap to open the conversation.",
        action: { path: "/", label: "Open chat" },
        severity: "info",
        createdAt: new Date(r.last_message_at).toISOString(),
      });
    }
  } catch (err) {
    // chat_channel_members table may not exist in all envs; soft-fail
  }

  res.json({ items });
});

export default router;
