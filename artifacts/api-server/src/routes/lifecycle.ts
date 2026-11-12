import { Router, type IRouter, type Request } from "express";
import { db, usersTable, notificationsTable } from "@workspace/db";
import { eq, lt, and, isNull, or } from "drizzle-orm";
import { getUncachableResendClient } from "../lib/resend";
import { getAccountProtection } from "../lib/payment-protection";
import { deleteInactiveUnpaidUserData } from "../lib/user-data-retention";

const router: IRouter = Router();
const DAY_MS = 24 * 60 * 60 * 1000;

function getUserId(req: Request): string | null {
  if (!req.isAuthenticated?.()) return null;
  return req.user?.id ?? null;
}

// Send a seven-day notice, then clear eligible unpaid app data at day 30.
export const ABANDONMENT_WARNING_DAYS = 23;
export const ABANDONMENT_DELETION_DAYS = 30;
const WARNING_LEAD_DAYS = ABANDONMENT_DELETION_DAYS - ABANDONMENT_WARNING_DAYS;

export function isUserDataRetentionEnabled(): boolean {
  return process.env.NODE_ENV === "production"
    && process.env.USER_DATA_RETENTION_ENABLED === "true";
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / DAY_MS);
}

function ownerEmails(): Set<string> {
  return new Set(
    (process.env.OWNER_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function sendDeletionWarningEmail(to: string): Promise<void> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const { error } = await client.emails.send({
      from: fromEmail,
      to,
      subject: "Your SALARYMAN workspace data will be deleted in 7 days",
      text: "Your SALARYMAN account has been inactive for 23 days. Sign in within the next 7 days to keep your personal app data. If the account remains inactive for 30 days, personal app data will be deleted. Account identity, billing history, and audit records are retained.",
      html: "<p>Your SALARYMAN account has been inactive for 23 days.</p><p>Sign in within the next 7 days to keep your personal app data. If the account remains inactive for 30 days, personal app data will be deleted.</p><p>Your account identity, billing history, and audit records are retained.</p>",
    });
    if (error) console.warn("[Lifecycle] deletion-warning email was not accepted by Resend");
  } catch (error) {
    console.warn("[Lifecycle] deletion-warning email could not be sent:", error instanceof Error ? error.message : "unknown error");
  }
}

// POST /api/lifecycle/heartbeat — active use begins a new retention window.
router.post("/lifecycle/heartbeat", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const now = new Date();
    await db.update(usersTable)
      .set({
        lastActiveAt: now,
        abandonmentWarnedAt: null,
        dataDeletedAt: null,
        updatedAt: now,
      })
      .where(eq(usersTable.id, userId));
    res.json({ ok: true, at: now.toISOString() });
  } catch (error) {
    console.error("[Lifecycle] heartbeat failed:", error);
    res.status(500).json({ error: "Heartbeat failed" });
  }
});

// GET /api/lifecycle/status — reports the seven-day data-deletion warning.
router.get("/lifecycle/status", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const [user] = await db.select({
      lastActiveAt: usersTable.lastActiveAt,
      abandonmentWarnedAt: usersTable.abandonmentWarnedAt,
      dataDeletedAt: usersTable.dataDeletedAt,
    }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const now = new Date();
    const daysIdle = daysBetween(new Date(user.lastActiveAt), now);
    const protection = await getAccountProtection();
    const protectedAccount = protection.userIds.has(userId);
    const warning = !protectedAccount && !user.dataDeletedAt && daysIdle >= ABANDONMENT_WARNING_DAYS;
    const deletionDeadline = Math.max(
      new Date(user.lastActiveAt).getTime() + ABANDONMENT_DELETION_DAYS * DAY_MS,
      user.abandonmentWarnedAt
        ? new Date(user.abandonmentWarnedAt).getTime() + WARNING_LEAD_DAYS * DAY_MS
        : 0,
    );
    const daysUntilDeletion = warning
      ? Math.max(0, Math.ceil((deletionDeadline - now.getTime()) / DAY_MS))
      : ABANDONMENT_DELETION_DAYS;

    res.json({
      daysIdle,
      warning,
      deletionImminent: warning,
      daysUntilDeletion,
      warningThresholdDays: ABANDONMENT_WARNING_DAYS,
      deletionThresholdDays: ABANDONMENT_DELETION_DAYS,
      warningLeadDays: WARNING_LEAD_DAYS,
      lastActiveAt: user.lastActiveAt,
      dataDeletedAt: user.dataDeletedAt,
    });
  } catch (error) {
    console.error("[Lifecycle] status failed:", error);
    res.status(500).json({ error: "Status failed" });
  }
});

export async function runUserDataRetentionSweep(): Promise<{
  enabled: boolean;
  warned: number;
  deletedUsers: number;
  deletedRows: Record<string, number>;
}> {
  if (!isUserDataRetentionEnabled()) {
    return { enabled: false, warned: 0, deletedUsers: 0, deletedRows: {} };
  }

  const now = new Date();
  const warningCutoff = new Date(now.getTime() - ABANDONMENT_WARNING_DAYS * DAY_MS);
  const deletionCutoff = new Date(now.getTime() - ABANDONMENT_DELETION_DAYS * DAY_MS);
  const warningLeadCutoff = new Date(now.getTime() - WARNING_LEAD_DAYS * DAY_MS);
  const [protection, candidatesToWarn] = await Promise.all([
    getAccountProtection(),
    db.select({
      id: usersTable.id,
      email: usersTable.email,
      lastActiveAt: usersTable.lastActiveAt,
      abandonmentWarnedAt: usersTable.abandonmentWarnedAt,
      dataDeletedAt: usersTable.dataDeletedAt,
    })
      .from(usersTable)
      .where(and(
        lt(usersTable.lastActiveAt, warningCutoff),
        isNull(usersTable.dataDeletedAt),
        or(
          isNull(usersTable.abandonmentWarnedAt),
          lt(usersTable.abandonmentWarnedAt, usersTable.lastActiveAt),
        ),
      )),
  ]);

  const owners = ownerEmails();
  let warned = 0;
  for (const user of candidatesToWarn) {
    if (protection.userIds.has(user.id) || (user.email && owners.has(user.email.toLowerCase()))) continue;

    try {
      const notice = await db.transaction(async (tx) => {
        const [current] = await tx.select({
          id: usersTable.id,
          email: usersTable.email,
          lastActiveAt: usersTable.lastActiveAt,
          abandonmentWarnedAt: usersTable.abandonmentWarnedAt,
          dataDeletedAt: usersTable.dataDeletedAt,
        }).from(usersTable).where(eq(usersTable.id, user.id)).for("update");
        if (!current || current.dataDeletedAt || new Date(current.lastActiveAt) >= warningCutoff) return null;
        const currentProtection = await getAccountProtection(tx);
        if (currentProtection.userIds.has(current.id)) return null;
        if (current.abandonmentWarnedAt && new Date(current.abandonmentWarnedAt) >= new Date(current.lastActiveAt)) return null;

        const idleDays = daysBetween(new Date(current.lastActiveAt), now);
        const remainingDays = Math.max(0, ABANDONMENT_DELETION_DAYS - idleDays);
        await tx.insert(notificationsTable).values({
          userId: current.id,
          type: "data_deletion_warning",
          title: "Your SALARYMAN data will be deleted in 7 days",
          body: `Your account has been inactive for ${idleDays} days. Sign in within ${remainingDays} days to keep your personal app data. Account identity, billing history, and audit records are retained.`,
          link: "/sign-in",
          read: false,
        });
        await tx.update(usersTable)
          .set({ abandonmentWarnedAt: now, updatedAt: now })
          .where(eq(usersTable.id, current.id));
        return { email: current.email };
      });

      if (!notice) continue;
      warned++;
      if (notice.email) await sendDeletionWarningEmail(notice.email);
    } catch (error) {
      console.error("[Lifecycle] warning creation failed for a user:", error instanceof Error ? error.message : "unknown error");
    }
  }

  // The selection is only a candidate list. The deletion service locks each
  // account and rechecks both payment protection and the current idle dates.
  const deletionCandidates = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(and(
      lt(usersTable.lastActiveAt, deletionCutoff),
      lt(usersTable.abandonmentWarnedAt, warningLeadCutoff),
      isNull(usersTable.dataDeletedAt),
    ));
  const eligibleCandidates = deletionCandidates
    .map(({ id }) => id)
    .filter((id) => !protection.userIds.has(id));
  const deletion = await deleteInactiveUnpaidUserData(eligibleCandidates, {
    inactiveBefore: deletionCutoff,
    warnedBefore: warningLeadCutoff,
  });

  return {
    enabled: true,
    warned,
    deletedUsers: deletion.userIds.length,
    deletedRows: deletion.counts,
  };
}

// POST /api/lifecycle/sweep — admin-only trigger, also run daily by the server.
router.post("/lifecycle/sweep", async (req, res) => {
  if (!req.isAuthenticated?.()) { res.status(401).json({ error: "Not authenticated" }); return; }
  const { isOwnerEmail } = await import("../lib/plan");
  if (!isOwnerEmail(req.user?.email)) { res.status(403).json({ error: "Picasso admin only" }); return; }
  if (!isUserDataRetentionEnabled()) {
    res.status(409).json({ error: "Retention sweep is disabled until payment-history protection is verified and enabled for production." });
    return;
  }

  try {
    const result = await runUserDataRetentionSweep();
    res.json({ ok: true, ...result });
  } catch (error) {
    console.error("[Lifecycle] retention sweep failed:", error);
    res.status(500).json({ error: "Retention sweep failed" });
  }
});

export default router;