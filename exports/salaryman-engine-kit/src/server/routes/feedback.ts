import { Router, type IRouter } from "express";
import { db, feedbackReportsTable, devTasksTable, notificationsTable, organizationsTable, alphaApplicationsTable, usersTable } from "@workspace/db";
import { eq, sql, desc, and } from "drizzle-orm";
import { isOwnerEmail } from "../lib/plan";
import { isApprovedAlpha } from "./alpha";
import { computeErrorSignature } from "../lib/feedback-signature";
import { sweepErrorReports } from "../lib/feedback-sweeper";

const router: IRouter = Router();

function getUserId(req: Express.Request): string | null {
  if (!req.isAuthenticated?.()) return null;
  return req.user?.id ?? null;
}

function isAdmin(req: Express.Request): boolean {
  return !!req.user && isOwnerEmail(req.user.email);
}

// Authorized viewer = Picasso admin OR approved alpha tester OR approved alpha
// dev. This is who should be able to see and triage the error/feedback stream.
// Errors are latency-sensitive — gatekeeping them behind owner-email only means
// no one sees them unless an owner happens to check the dashboard.
async function authorizedViewerRole(
  req: Express.Request,
): Promise<"admin" | "alpha_dev" | "alpha_tester" | null> {
  if (isAdmin(req)) return "admin";
  const userId = getUserId(req);
  if (!userId) return null;
  const alpha = await isApprovedAlpha(userId);
  if (alpha.dev) return "alpha_dev";
  if (alpha.tester) return "alpha_tester";
  return null;
}

// Returns only platform operators authorized to receive an "error report
// landed" notification. Organization ownership is not platform moderation
// access: founders and executives should receive notifications for their own
// organization, not every user's platform error.
async function getErrorNotifyUserIds(): Promise<string[]> {
  const [admins, alphas] = await Promise.all([
    db.select({ id: usersTable.id, email: usersTable.email }).from(usersTable),
    db.select({ userId: alphaApplicationsTable.userId })
      .from(alphaApplicationsTable)
      .where(and(
        eq(alphaApplicationsTable.status, "approved"),
        eq(alphaApplicationsTable.role, "alpha_dev"),
      )),
  ]);
  const ids = new Set<string>();
  for (const u of admins) if (isOwnerEmail(u.email)) ids.add(u.id);
  for (const a of alphas) if (a.userId) ids.add(a.userId);
  return [...ids];
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
  const [admins, devs] = await Promise.all([
    db.select({ id: usersTable.id, email: usersTable.email }).from(usersTable),
    db.select({ userId: alphaApplicationsTable.userId })
      .from(alphaApplicationsTable)
      .where(and(
        eq(alphaApplicationsTable.status, "approved"),
        eq(alphaApplicationsTable.role, "alpha_dev"),
      )),
  ]);
  return [...new Set([
    ...admins.filter(u => isOwnerEmail(u.email)).map(u => u.id),
    ...devs.map(d => d.userId),
  ])];
}

// Auto-captured error reports. Open to guests on purpose: errors fire on the
// landing page and during the unauthenticated Pablo intro, and we need them
// captured even when no user session exists. Stored as kind="error_report"
// in the same feedback table so the admin dashboard sees them alongside
// human-submitted feedback. Never auto-creates a dev task — devs triage.
// Lazy import to keep this route's hot path import-free until needed.
import { classifyNoise } from "../lib/feedback-noise";
import { sendDailyDigestIfDue } from "../lib/feedback-digest";

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

    // Drop known-noise patterns BEFORE any DB write. The client gets a
    // 200 with {suppressed: true} so it doesn't loop, but no row lands
    // in the inbox. See lib/feedback-noise.ts for the rule list.
    const noiseLabel = classifyNoise({ message, stack: body.stack ?? null, source: body.source ?? null });
    if (noiseLabel) {
      res.status(200).json({ ok: true, suppressed: true, reason: noiseLabel });
      return;
    }

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

    // Fingerprint the error so identical recurrences collapse onto the SAME
    // row instead of spawning a fresh ticket per page-load. Without this,
    // a single broken render in production can produce thousands of "open"
    // rows in minutes and drown the inbox.
    const signature = computeErrorSignature({
      message,
      stack: body.stack ?? null,
      source: body.source ?? null,
    });

    const now = new Date();
    const appVersion = body.appVersion?.slice(0, 50) ?? null;

    // Atomic UPSERT against the partial UNIQUE index on (signature) WHERE
    // status='open' AND kind='error_report'. This is race-safe: two
    // simultaneous reports of the same brand-new error can't both INSERT
    // — the loser hits the conflict and we bump occurrence_count instead.
    // Once a row is RESOLVED, the partial-uniq predicate no longer matches
    // it, so a fresh occurrence correctly opens a new ticket (signaling
    // regression to triagers).
    //
    // We need raw SQL because Drizzle's onConflictDoUpdate doesn't yet
    // support a custom WHERE clause on the conflict target — required for
    // a partial unique index.
    const upserted = await db.execute(sql`
      INSERT INTO feedback_reports
        (user_id, title, description, kind, category, status, app_version,
         signature, occurrence_count, last_seen_at, created_at, updated_at)
      VALUES
        (${userId ?? null}, ${title}, ${description}, 'error_report', 'Bug',
         'open', ${appVersion}, ${signature}, 1, ${now}, ${now}, ${now})
      ON CONFLICT (signature)
        WHERE status = 'open' AND kind = 'error_report' AND signature IS NOT NULL
      DO UPDATE SET
        occurrence_count = feedback_reports.occurrence_count + 1,
        last_seen_at = EXCLUDED.last_seen_at,
        description = EXCLUDED.description,
        app_version = EXCLUDED.app_version,
        updated_at = EXCLUDED.updated_at
      RETURNING id, occurrence_count, (xmax = 0) AS inserted
    `);
    // node-postgres returns { rows: [...] }; drizzle's QueryResult passes
    // it through. xmax=0 trick: a tuple's xmax is 0 only when the tuple
    // was just INSERTed; ON CONFLICT path produces a non-zero xmax.
    const upsertRow = (upserted as unknown as { rows: Array<{ id: number; occurrence_count: number; inserted: boolean }> }).rows[0];
    const row = { id: upsertRow.id, occurrenceCount: upsertRow.occurrence_count };
    const isNewRow = upsertRow.inserted;

    // Notification fan-out: log-scale milestones (1, 10, 100, 1k, 10k…).
    // First occurrence ALWAYS notifies. Subsequent notifications taper
    // off so a hot error doesn't spam every viewer's inbox, but a
    // critical-but-rare bug still breaches a milestone in single digits.
    const isMilestone = (n: number): boolean => {
      if (n <= 1) return true;
      // 10, 100, 1000, 10000, ... — Number.isInteger guards against IEEE
      // 754 quirks where Math.log10(1000) can return 2.9999…96.
      return n >= 10 && Number.isInteger(Math.log10(n));
    };
    const shouldNotify = isNewRow || isMilestone(row.occurrenceCount);
    if (shouldNotify) {
      try {
        const ids = await getErrorNotifyUserIds();
        if (ids.length) {
          const src = (body.source ?? "unknown").toString().slice(0, 32);
          const preview = message.slice(0, 180);
          const countSuffix = isNewRow ? "" : ` ×${row.occurrenceCount}`;
          await db.insert(notificationsTable).values(ids.map(uid => ({
            userId: uid,
            type: "error_report",
            title: `⚠ Auto-error (${src})${countSuffix}`,
            body: preview,
            link: `/profile/admin/feedback?kind=error_report&id=${row.id}`,
            read: false,
          })));
        }
      } catch (notifErr) {
        console.error("[Error Report] notify fan-out failed:", notifErr);
      }
    }

    res.status(201).json({
      ok: true,
      id: row.id,
      deduped: !isNewRow,
      occurrenceCount: row.occurrenceCount,
    });
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

// Viewer status probe — lets the client decide whether to show the feedback
// dashboard entry point (and what to label the viewer as).
router.get("/feedback/viewer-status", async (req, res) => {
  if (!req.isAuthenticated?.()) { res.json({ canView: false, role: null }); return; }
  const role = await authorizedViewerRole(req);
  res.json({ canView: role !== null, role });
});

router.get("/feedback", async (req, res) => {
  if (!req.isAuthenticated?.()) { res.status(401).json({ error: "Sign in required" }); return; }
  const role = await authorizedViewerRole(req);
  if (!role) {
    res.status(403).json({ error: "Authorized viewer access required (admin, alpha tester, or alpha dev)" });
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

// Manual trigger for the daily digest — admin-only. Bypasses the
// 24h-since-last-send guard so a triager can preview the email
// without waiting.
router.post("/feedback/digest/send", async (req, res) => {
  if (!req.isAuthenticated?.()) { res.status(401).json({ error: "Sign in required" }); return; }
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    const result = await sendDailyDigestIfDue(true);
    res.json(result);
  } catch (e) {
    console.error("[Digest] manual send failed:", e);
    res.status(500).json({ error: "Digest send failed" });
  }
});

// Manual trigger for the auto-resolution sweep. Cron runs hourly anyway,
// but a button-press path lets a triager force a cleanup right now (e.g.
// after shipping a fix they expect to drain the inbox). Admin-only —
// alpha testers can view, but only owners can mutate at scale.
router.post("/feedback/error-report/sweep", async (req, res) => {
  if (!req.isAuthenticated?.()) { res.status(401).json({ error: "Sign in required" }); return; }
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    const result = await sweepErrorReports();
    res.json(result);
  } catch (e) {
    console.error("[Sweep] manual run failed:", e);
    res.status(500).json({ error: "Sweep failed" });
  }
});

router.patch("/feedback/:id", async (req, res) => {
  if (!req.isAuthenticated?.()) { res.status(401).json({ error: "Sign in required" }); return; }
  const role = await authorizedViewerRole(req);
  if (!role) {
    res.status(403).json({ error: "Authorized viewer access required (admin, alpha tester, or alpha dev)" });
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
