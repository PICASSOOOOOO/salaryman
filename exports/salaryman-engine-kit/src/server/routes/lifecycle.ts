import { Router, type IRouter, type Request } from "express";
import { db, usersTable, notificationsTable } from "@workspace/db";
import { eq, lt, and, isNull, or, sql } from "drizzle-orm";

const router: IRouter = Router();

function getUserId(req: Request): string | null {
  if (!req.isAuthenticated?.()) return null;
  return req.user?.id ?? null;
}

// 3 days idle → Pablo warns. 28 days idle → assets seized by Pablo Corp.
export const ABANDONMENT_WARNING_DAYS = 3;
export const ABANDONMENT_SEIZURE_DAYS = 28;

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

// POST /api/lifecycle/heartbeat — bumps last_active_at. Called periodically
// by the client whenever the user is active in the app/game/terminal/bed.
router.post("/lifecycle/heartbeat", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const now = new Date();
    await db.update(usersTable)
      .set({ lastActiveAt: now, abandonmentWarnedAt: null, updatedAt: now })
      .where(eq(usersTable.id, userId));
    res.json({ ok: true, at: now.toISOString() });
  } catch (e) {
    console.error("[Lifecycle] heartbeat failed:", e);
    res.status(500).json({ error: "Heartbeat failed" });
  }
});

// GET /api/lifecycle/status — tells the client whether to show the abandonment
// banner and how many days remain before seizure.
router.get("/lifecycle/status", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const [user] = await db.select({
      lastActiveAt: usersTable.lastActiveAt,
      abandonmentWarnedAt: usersTable.abandonmentWarnedAt,
    }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const now = new Date();
    const daysIdle = daysBetween(new Date(user.lastActiveAt), now);
    const warning = daysIdle >= ABANDONMENT_WARNING_DAYS;
    const seizureImminent = daysIdle >= ABANDONMENT_SEIZURE_DAYS;
    const daysUntilSeizure = Math.max(0, ABANDONMENT_SEIZURE_DAYS - daysIdle);

    res.json({
      daysIdle,
      warning,
      seizureImminent,
      daysUntilSeizure,
      warningThresholdDays: ABANDONMENT_WARNING_DAYS,
      seizureThresholdDays: ABANDONMENT_SEIZURE_DAYS,
      lastActiveAt: user.lastActiveAt,
    });
  } catch (e) {
    console.error("[Lifecycle] status failed:", e);
    res.status(500).json({ error: "Status failed" });
  }
});

// POST /api/lifecycle/sweep — admin/cron endpoint. Walks idle users:
//   * Day 3+: send Pablo warning notification (once per idle streak)
//   * Day 28+: returns the list of users who would be seized (no destructive
//     action this turn — actual asset transfer to Pablo Corp is queued for a
//     follow-up, since it touches properties, bots, ledger, etc).
// Auth: only Picasso admins can trigger.
router.post("/lifecycle/sweep", async (req, res) => {
  if (!req.isAuthenticated?.()) { res.status(401).json({ error: "Not authenticated" }); return; }
  // Lazy import to avoid circular dep
  const { isOwnerEmail } = await import("../lib/plan");
  if (!isOwnerEmail(req.user?.email)) { res.status(403).json({ error: "Picasso admin only" }); return; }

  try {
    const now = new Date();
    const warnCutoff = new Date(now.getTime() - ABANDONMENT_WARNING_DAYS * 24 * 60 * 60 * 1000);
    const seizeCutoff = new Date(now.getTime() - ABANDONMENT_SEIZURE_DAYS * 24 * 60 * 60 * 1000);

    // Users idle past warning threshold who haven't been warned for this streak
    const toWarn = await db.select({ id: usersTable.id, email: usersTable.email, lastActiveAt: usersTable.lastActiveAt })
      .from(usersTable)
      .where(and(
        lt(usersTable.lastActiveAt, warnCutoff),
        or(
          isNull(usersTable.abandonmentWarnedAt),
          lt(usersTable.abandonmentWarnedAt, usersTable.lastActiveAt),
        ),
      ));

    let warned = 0;
    for (const u of toWarn) {
      const idleDays = daysBetween(new Date(u.lastActiveAt), now);
      const remaining = Math.max(0, ABANDONMENT_SEIZURE_DAYS - idleDays);
      try {
        await db.insert(notificationsTable).values({
          userId: u.id,
          type: "abandonment_warning",
          title: `[PABLO] You've been gone ${idleDays} days.`,
          body: `Show up. Sleep in your bed, touch your terminal, do something. ${remaining} days left before Pablo Corp absorbs your assets, demolishes what it can't sell, and lists the rest with your serial numbers attached.`,
          link: "/wallet",
          read: false,
        });
        await db.update(usersTable)
          .set({ abandonmentWarnedAt: now })
          .where(eq(usersTable.id, u.id));
        warned++;
      } catch (err) {
        console.error("[Lifecycle] warn insert failed for", u.id, err);
      }
    }

    // Seizure candidates (no destructive action yet — see follow-up)
    const seizureCandidates = await db.select({ id: usersTable.id, email: usersTable.email, lastActiveAt: usersTable.lastActiveAt })
      .from(usersTable)
      .where(lt(usersTable.lastActiveAt, seizeCutoff));

    res.json({
      ok: true,
      warned,
      seizureCandidates: seizureCandidates.map((u: { id: string; email: string | null; lastActiveAt: Date }) => ({
        userId: u.id, email: u.email, daysIdle: daysBetween(new Date(u.lastActiveAt), now),
      })),
    });
  } catch (e) {
    console.error("[Lifecycle] sweep failed:", e);
    res.status(500).json({ error: "Sweep failed" });
  }
});

export default router;
