import { Router, type IRouter, type Request, type Response } from "express";
import { db, alphaApplicationsTable, ALPHA_ROLES, notificationsTable, usersTable } from "@workspace/db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { isOwnerEmail, getPicassoAdminUserIds } from "../lib/plan";

const router: IRouter = Router();

function getUserId(req: Request): string | null {
  if (!req.isAuthenticated?.()) return null;
  return req.user?.id ?? null;
}

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  if (!req.isAuthenticated?.() || !isOwnerEmail(req.user?.email)) {
    res.status(403).json({ error: "Picasso admin access required" });
    return false;
  }
  return true;
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

    const [app] = await db.update(alphaApplicationsTable).set({
      status: newStatus,
      decidedByUserId: req.user!.id,
      decidedAt: new Date(),
      decisionNote: note ? String(note).slice(0, 2000) : null,
      updatedAt: new Date(),
    }).where(eq(alphaApplicationsTable.id, id)).returning();

    if (!app) { res.status(404).json({ error: "Application not found" }); return; }

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
