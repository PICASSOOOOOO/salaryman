import { Router, type IRouter, type Request, type Response } from "express";
import { db, alphaApplicationsTable, ALPHA_ROLES, notificationsTable, usersTable } from "@workspace/db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { isOwnerEmail, getPicassoAdminUserIds, isPicassoOrgOwner } from "../lib/plan";
import { guildInviteUrl, assignGuildRole, removeGuildRole } from "../lib/discord-auth";

const router: IRouter = Router();

// Tester program limits. Owners / Picasso staff are seeded as approved testers
// but are EXEMPT from the cap and the inactivity sweep — the 20 slots are for
// external community testers only.
export const MAX_ALPHA_TESTERS = 20;
// No SALARYMAN login (heartbeat → users.lastActiveAt) for this long releases a
// tester's slot automatically.
export const TESTER_INACTIVITY_MS = 3 * 24 * 60 * 60 * 1000;
export const TESTER_INACTIVITY_DAYS = Math.round(TESTER_INACTIVITY_MS / 86_400_000);
// Constant key for the Postgres advisory lock that serializes tester approvals
// so the 20-cap can't be oversubscribed by concurrent admin requests.
const ALPHA_CAP_LOCK_KEY = 918_273;

// Count approved alpha_testers, excluding owner emails (they don't take slots).
async function countActiveTesters(): Promise<number> {
  const rows = await db
    .select({ email: usersTable.email })
    .from(alphaApplicationsTable)
    .innerJoin(usersTable, eq(usersTable.id, alphaApplicationsTable.userId))
    .where(and(
      eq(alphaApplicationsTable.role, "alpha_tester"),
      eq(alphaApplicationsTable.status, "approved"),
    ));
  return rows.filter((r) => !isOwnerEmail(r.email)).length;
}

function getUserId(req: Request): string | null {
  if (!req.isAuthenticated?.()) return null;
  return req.user?.id ?? null;
}

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  if (!req.isAuthenticated?.()) {
    res.status(403).json({ error: "Picasso admin access required" });
    return false;
  }
  if (isOwnerEmail(req.user?.email)) return true;
  if (req.user?.id && await isPicassoOrgOwner(req.user.id)) return true;
  res.status(403).json({ error: "Picasso admin access required" });
  return false;
}

// GET /api/alpha/me — my application status (per role)
router.get("/alpha/me", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const apps = await db.select().from(alphaApplicationsTable)
      .where(eq(alphaApplicationsTable.userId, userId));
    const byRole: Record<string, typeof apps[number] | null> = { alpha_tester: null, alpha_dev: null };
    for (const a of apps) byRole[a.role] = a;
    res.json({
      applications: apps,
      tester: byRole.alpha_tester,
      dev: byRole.alpha_dev,
      isApprovedTester: byRole.alpha_tester?.status === "approved",
      isApprovedDev: byRole.alpha_dev?.status === "approved",
      isAdmin: isOwnerEmail(req.user?.email),
    });
  } catch (e) {
    console.error("[Alpha] /me failed:", e);
    res.status(500).json({ error: "Failed to load alpha status" });
  }
});

// POST /api/alpha/apply — apply for alpha tester or alpha dev
router.post("/alpha/apply", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const { role, reason, experience } = req.body ?? {};
    if (!ALPHA_ROLES.includes(role)) { res.status(400).json({ error: "Invalid role" }); return; }
    const reasonText = String(reason ?? "").trim().slice(0, 4000);
    const experienceText = String(experience ?? "").trim().slice(0, 4000);
    if (!reasonText) { res.status(400).json({ error: "Tell us why you want in" }); return; }

    const [existing] = await db.select().from(alphaApplicationsTable)
      .where(and(eq(alphaApplicationsTable.userId, userId), eq(alphaApplicationsTable.role, role)))
      .limit(1);

    let app;
    if (existing) {
      if (existing.status === "approved") {
        res.status(409).json({ error: "Already approved", application: existing });
        return;
      }
      if (existing.status === "pending") {
        res.status(409).json({ error: "Application already pending", application: existing });
        return;
      }
      // rejected/revoked → allow re-apply, reset to pending
      [app] = await db.update(alphaApplicationsTable).set({
        status: "pending",
        reason: reasonText,
        experience: experienceText,
        decidedByUserId: null,
        decidedAt: null,
        decisionNote: null,
        updatedAt: new Date(),
      }).where(eq(alphaApplicationsTable.id, existing.id)).returning();
    } else {
      // Race-safe insert: if a concurrent request created a row first, the
      // unique (userId, role) index will fire — fall back to returning the
      // existing row deterministically instead of bubbling a 500.
      try {
        [app] = await db.insert(alphaApplicationsTable).values({
          userId,
          role,
          reason: reasonText,
          experience: experienceText,
          status: "pending",
        }).returning();
      } catch (err: unknown) {
        const code = (err as { code?: string } | undefined)?.code;
        if (code === "23505") {
          const [winner] = await db.select().from(alphaApplicationsTable)
            .where(and(eq(alphaApplicationsTable.userId, userId), eq(alphaApplicationsTable.role, role)))
            .limit(1);
          if (winner) {
            res.status(409).json({
              error: winner.status === "approved" ? "Already approved" : "Application already pending",
              application: winner,
            });
            return;
          }
        }
        throw err;
      }
    }

    // Notify all Picasso admins in-app
    try {
      const adminIds = await getPicassoAdminUserIds();
      const roleLabel = role === "alpha_dev" ? "Alpha Developer" : "Alpha Tester";
      const applicantEmail = req.user?.email ?? "(unknown)";
      for (const adminId of adminIds) {
        await db.insert(notificationsTable).values({
          userId: adminId,
          type: "alpha_application",
          title: `New ${roleLabel} application`,
          body: `${applicantEmail} applied for ${roleLabel}.\n\n${reasonText.slice(0, 240)}`,
          link: "/profile/admin/alpha",
          read: false,
        });
      }
    } catch (notifErr) {
      console.error("[Alpha] notification fanout failed:", notifErr);
    }

    res.status(201).json({ application: app });
  } catch (e) {
    console.error("[Alpha] apply failed:", e);
    res.status(500).json({ error: "Failed to submit application" });
  }
});

// GET /api/alpha/applications — admin list
router.get("/alpha/applications", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const { status } = req.query as Record<string, string>;
    const where = status && status !== "all" ? eq(alphaApplicationsTable.status, status) : undefined;
    const apps = await db.select().from(alphaApplicationsTable)
      .where(where)
      .orderBy(desc(alphaApplicationsTable.createdAt))
      .limit(500);

    const userIds = [...new Set(apps.map(a => a.userId))];
    const users = userIds.length
      ? await db.select({ id: usersTable.id, email: usersTable.email, firstName: usersTable.firstName, lastName: usersTable.lastName })
          .from(usersTable).where(inArray(usersTable.id, userIds))
      : [];
    const userMap = new Map(users.map(u => [u.id, u]));

    const [{ pending }] = await db.select({ pending: sql<number>`count(*)` })
      .from(alphaApplicationsTable).where(eq(alphaApplicationsTable.status, "pending"));

    res.json({
      applications: apps.map(a => ({ ...a, applicant: userMap.get(a.userId) ?? null })),
      pendingCount: Number(pending),
    });
  } catch (e) {
    console.error("[Alpha] list failed:", e);
    res.status(500).json({ error: "Failed to list applications" });
  }
});

// POST /api/alpha/applications/:id/decide — admin approve/reject
router.post("/alpha/applications/:id/decide", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const id = Number(req.params.id);
    const { decision, note } = req.body ?? {};
    const validDecisions = ["approve", "reject", "revoke"];
    if (!validDecisions.includes(decision)) { res.status(400).json({ error: "Invalid decision" }); return; }
    const newStatus = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "revoked";

    // Enforce the 20-tester cap atomically. We serialize approvals with a
    // transaction-scoped advisory lock and recount inside the SAME transaction
    // as the status write, so two concurrent admin approvals can't both pass a
    // stale "19/20" check and oversubscribe the slots. Owners are exempt.
    let capReached = false;
    let notFound = false;
    const [app] = await db.transaction(async (tx) => {
      if (decision === "approve") {
        const [target] = await tx.select().from(alphaApplicationsTable)
          .where(eq(alphaApplicationsTable.id, id)).limit(1);
        if (!target) { notFound = true; return [undefined]; }
        if (target.role === "alpha_tester" && target.status !== "approved") {
          const [applicant] = await tx.select({ email: usersTable.email })
            .from(usersTable).where(eq(usersTable.id, target.userId)).limit(1);
          if (!isOwnerEmail(applicant?.email)) {
            await tx.execute(sql`SELECT pg_advisory_xact_lock(${ALPHA_CAP_LOCK_KEY})`);
            const rows = await tx
              .select({ email: usersTable.email })
              .from(alphaApplicationsTable)
              .innerJoin(usersTable, eq(usersTable.id, alphaApplicationsTable.userId))
              .where(and(
                eq(alphaApplicationsTable.role, "alpha_tester"),
                eq(alphaApplicationsTable.status, "approved"),
              ));
            const active = rows.filter((r) => !isOwnerEmail(r.email)).length;
            if (active >= MAX_ALPHA_TESTERS) { capReached = true; return [undefined]; }
          }
        }
      }
      return await tx.update(alphaApplicationsTable).set({
        status: newStatus,
        decidedByUserId: req.user!.id,
        decidedAt: new Date(),
        decisionNote: note ? String(note).slice(0, 2000) : null,
        updatedAt: new Date(),
      }).where(eq(alphaApplicationsTable.id, id)).returning();
    });

    if (notFound) { res.status(404).json({ error: "Application not found" }); return; }
    if (capReached) {
      res.status(409).json({
        error: `Tester slots are full (${MAX_ALPHA_TESTERS}/${MAX_ALPHA_TESTERS}). Revoke an inactive tester to free a slot.`,
        capReached: true,
      });
      return;
    }
    if (!app) { res.status(404).json({ error: "Application not found" }); return; }

    // Approved testers auto-become Discord moderators (best-effort). Only works
    // for users who signed in via Discord (id "discord:<id>") and only when a
    // bot + guild + mod role id are configured; otherwise it's a silent no-op.
    if (decision === "approve" && app.role === "alpha_tester" && app.userId.startsWith("discord:")) {
      const discordId = app.userId.slice("discord:".length);
      assignGuildRole({ userId: discordId, role: "moderator" })
        .then((r) => { if (r !== "skipped") console.log(`[Alpha] mod role for ${discordId}: ${r}`); })
        .catch((e) => console.error("[Alpha] mod role assign error:", e));
    }

    // Revoking a tester (manually here, or via the inactivity sweep) pulls the
    // Discord role so they lose access to the tester-only channels. Best-effort.
    if (decision === "revoke" && app.role === "alpha_tester" && app.userId.startsWith("discord:")) {
      const discordId = app.userId.slice("discord:".length);
      removeGuildRole({ userId: discordId, role: "moderator" })
        .then((r) => { if (r !== "skipped") console.log(`[Alpha] tester role removal for ${discordId}: ${r}`); })
        .catch((e) => console.error("[Alpha] tester role removal error:", e));
    }

    // Notify the applicant
    try {
      const roleLabel = app.role === "alpha_dev" ? "Alpha Developer" : "Alpha Tester";
      const verb = decision === "approve" ? "APPROVED" : decision === "reject" ? "rejected" : "revoked";
      await db.insert(notificationsTable).values({
        userId: app.userId,
        type: "alpha_decision",
        title: `${roleLabel} application ${verb}`,
        body: decision === "approve"
          ? `You're in. You can now submit BUGS that auto-create dev tasks. Open the bug submitter from any screen.`
          : `Your ${roleLabel} application was ${verb}.${note ? `\n\n${String(note).slice(0, 240)}` : ""}`,
        link: "/alpha",
        read: false,
      });
    } catch (notifErr) {
      console.error("[Alpha] applicant notification failed:", notifErr);
    }

    res.json({ application: app });
  } catch (e) {
    console.error("[Alpha] decide failed:", e);
    res.status(500).json({ error: "Failed to decide application" });
  }
});

// GET /api/alpha/capacity — tester-slot status + Discord invite for the apply
// screen. Auth required (the apply page is behind login).
router.get("/alpha/capacity", async (req, res) => {
  if (!getUserId(req)) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const active = await countActiveTesters();
    res.json({
      max: MAX_ALPHA_TESTERS,
      active,
      remaining: Math.max(0, MAX_ALPHA_TESTERS - active),
      full: active >= MAX_ALPHA_TESTERS,
      inactivityDays: TESTER_INACTIVITY_DAYS,
      discordInviteUrl: guildInviteUrl(),
    });
  } catch (e) {
    console.error("[Alpha] capacity failed:", e);
    res.status(500).json({ error: "Failed to load capacity" });
  }
});

export default router;

// Helper for other routes to check alpha status
export async function isApprovedAlpha(userId: string): Promise<{ tester: boolean; dev: boolean }> {
  const apps = await db.select({ role: alphaApplicationsTable.role, status: alphaApplicationsTable.status })
    .from(alphaApplicationsTable)
    .where(and(eq(alphaApplicationsTable.userId, userId), eq(alphaApplicationsTable.status, "approved")));
  return {
    tester: apps.some(a => a.role === "alpha_tester"),
    dev: apps.some(a => a.role === "alpha_dev"),
  };
}

// Periodic sweep: revoke approved testers who haven't logged into SALARYMAN for
// TESTER_INACTIVITY_MS, freeing their slot. Owners are exempt. A tester's clock
// is the most recent of their last heartbeat and the moment they were approved,
// so a freshly-approved tester always gets a full window before they can lapse.
export async function sweepInactiveTesters(): Promise<{ revoked: number }> {
  const cutoff = Date.now() - TESTER_INACTIVITY_MS;
  const rows = await db
    .select({
      id: alphaApplicationsTable.id,
      userId: alphaApplicationsTable.userId,
      decidedAt: alphaApplicationsTable.decidedAt,
      email: usersTable.email,
      lastActiveAt: usersTable.lastActiveAt,
    })
    .from(alphaApplicationsTable)
    .innerJoin(usersTable, eq(usersTable.id, alphaApplicationsTable.userId))
    .where(and(
      eq(alphaApplicationsTable.role, "alpha_tester"),
      eq(alphaApplicationsTable.status, "approved"),
    ));

  const stale = rows.filter((r) => {
    if (isOwnerEmail(r.email)) return false;
    const lastSeen = r.lastActiveAt ? new Date(r.lastActiveAt).getTime() : 0;
    const approved = r.decidedAt ? new Date(r.decidedAt).getTime() : 0;
    return Math.max(lastSeen, approved) < cutoff;
  });

  let revoked = 0;
  for (const r of stale) {
    try {
      // Guard the write on still-approved status so an overlapping sweep or a
      // concurrent admin action can't double-revoke / double-notify the row.
      const updated = await db.update(alphaApplicationsTable).set({
        status: "revoked",
        decidedByUserId: "system",
        decidedAt: new Date(),
        decisionNote: `Auto-revoked after ${TESTER_INACTIVITY_DAYS} days without logging into SALARYMAN. Re-apply any time — a slot will be waiting if one's open.`,
        updatedAt: new Date(),
      }).where(and(
        eq(alphaApplicationsTable.id, r.id),
        eq(alphaApplicationsTable.status, "approved"),
      )).returning({ id: alphaApplicationsTable.id });
      if (updated.length === 0) continue;

      // Kick the lapsed tester out of the tester-only Discord channels by
      // pulling the role that grants access. Mirrors the auto-assign on
      // approval; only applies to Discord-linked accounts and is best-effort
      // (a Discord failure must not abort the slot release).
      if (r.userId.startsWith("discord:")) {
        const discordId = r.userId.slice("discord:".length);
        removeGuildRole({ userId: discordId, role: "moderator" })
          .then((res) => { if (res !== "skipped") console.log(`[Alpha Sweep] tester role removal for ${discordId}: ${res}`); })
          .catch((e) => console.error("[Alpha Sweep] tester role removal error:", e));
      }

      await db.insert(notificationsTable).values({
        userId: r.userId,
        type: "alpha_decision",
        title: "Alpha Tester slot released",
        body: `Your tester slot was freed after ${TESTER_INACTIVITY_DAYS} days of inactivity. Log back in and re-apply from /alpha to reclaim a spot.`,
        link: "/alpha",
        read: false,
      });
      revoked++;
    } catch (err) {
      console.error("[Alpha] failed to revoke inactive tester", r.id, err);
    }
  }
  if (revoked) console.log(`[Alpha Sweep] revoked ${revoked} inactive tester(s)`);
  return { revoked };
}
