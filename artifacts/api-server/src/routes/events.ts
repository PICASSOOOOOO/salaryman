import { Router } from "express";
import { eq, desc, sql, and, gte } from "drizzle-orm";
import { db, worldEventsTable, eventResponsesTable, usersTable, playerProfilesTable } from "@workspace/db";
import { getActiveWorldEvents, resolveWorldEvent, sendToPlayer } from "../worldServer";

const router = Router();

router.post("/events/:id/respond", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const eventId = Number(req.params.id);
    if (!Number.isInteger(eventId) || eventId <= 0) {
      res.status(400).json({ error: "Invalid event id" });
      return;
    }
    const userId = String(req.user!.id);

    const activeEvents = getActiveWorldEvents();
    const ev = activeEvents.find(e => e.id === eventId);
    if (!ev) {
      res.status(404).json({ error: "Event not found or already resolved" });
      return;
    }

    const [dbEvent] = await db
      .select()
      .from(worldEventsTable)
      .where(and(eq(worldEventsTable.id, eventId), eq(worldEventsTable.status, "active")))
      .limit(1);

    if (!dbEvent) {
      res.status(404).json({ error: "Event not found or already resolved" });
      return;
    }

    const existingResponders = (dbEvent.resolverUserIds ?? []) as string[];
    const isFirstResponder = existingResponders.length === 0;
    const alreadyResponded = existingResponders.includes(userId);
    if (alreadyResponded) {
      res.status(409).json({ error: "Already responded to this event" });
      return;
    }

    const baseReward = dbEvent.rewardFiat;
    const rewardPaid = isFirstResponder ? baseReward : Math.floor(baseReward * 0.4);

    const updatedResponders = [...existingResponders, userId];
    const isNowResolved = true;

    await db
      .update(worldEventsTable)
      .set({
        status: isFirstResponder ? "resolved" : "resolved",
        resolvedAt: new Date(),
        resolverUserIds: updatedResponders,
      })
      .where(eq(worldEventsTable.id, eventId));

    await db.insert(eventResponsesTable).values({
      eventId,
      userId,
      rewardPaid,
    });

    resolveWorldEvent(eventId);

    const eventTypeLabel: Record<string, string> = {
      evt_blackout: "GRID RESTORED",
      evt_fire: "FIRE SUPPRESSED",
      evt_medical: "CASUALTY STABILISED",
    };
    const label = eventTypeLabel[dbEvent.eventType] ?? "EVENT RESOLVED";
    const message = isFirstResponder
      ? `${label} — First responder bonus ƒ${rewardPaid.toLocaleString()} credited.`
      : `${label} — Support response ƒ${rewardPaid.toLocaleString()} credited.`;

    sendToPlayer(userId, {
      type: "event_reward",
      reward: rewardPaid,
      eventId,
      eventType: dbEvent.eventType,
      message,
    });

    res.json({ ok: true, rewardPaid, isFirstResponder });
  } catch (err: any) {
    console.error("[Events] respond error:", err.message);
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/events/revive/:targetUserId", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const rescuerId = String(req.user!.id);
    const targetUserId = req.params.targetUserId;
    if (!targetUserId) {
      res.status(400).json({ error: "targetUserId required" });
      return;
    }

    const REVIVE_REWARD = 500;

    sendToPlayer(rescuerId, {
      type: "event_reward",
      reward: REVIVE_REWARD,
      eventId: null,
      eventType: "evt_medical",
      message: `CASUALTY REVIVED — ƒ${REVIVE_REWARD} credited.`,
    });

    sendToPlayer(targetUserId, {
      type: "player_revived_by",
      rescuerId,
      message: "You were revived by a nearby player.",
    });

    res.json({ ok: true, rewardPaid: REVIVE_REWARD });
  } catch (err: any) {
    console.error("[Events] revive error:", err.message);
    res.status(500).json({ error: "Internal error" });
  }
});

router.get("/events/responders/weekly", async (req, res) => {
  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const rows = await db
      .select({
        userId: eventResponsesTable.userId,
        totalReward: sql<number>`sum(${eventResponsesTable.rewardPaid})`.as("total_reward"),
        responseCount: sql<number>`count(*)`.as("response_count"),
      })
      .from(eventResponsesTable)
      .where(gte(eventResponsesTable.respondedAt, oneWeekAgo))
      .groupBy(eventResponsesTable.userId)
      .orderBy(desc(sql`sum(${eventResponsesTable.rewardPaid})`))
      .limit(10);

    const userIds = rows.map(r => r.userId);
    const names: Record<string, string> = {};
    if (userIds.length > 0) {
      const profileRows = await db
        .select({ userId: playerProfilesTable.userId, playerName: playerProfilesTable.playerName })
        .from(playerProfilesTable)
        .where(sql`${playerProfilesTable.userId} IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)})`);
      for (const p of profileRows) {
        if (!names[p.userId]) names[p.userId] = p.playerName;
      }
      const userRows = await db
        .select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
        .from(usersTable)
        .where(sql`${usersTable.id}::text IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)})`);
      for (const u of userRows) {
        const uid = String(u.id);
        if (!names[uid]) {
          const parts = [u.firstName, u.lastName].filter(Boolean);
          names[uid] = parts.length > 0 ? parts.join(" ").toUpperCase() : (u.email?.split("@")[0] ?? uid).toUpperCase();
        }
      }
    }

    const leaderboard = rows.map((r, i) => ({
      rank: i + 1,
      userId: r.userId,
      name: names[r.userId] ?? "OPERATIVE",
      totalReward: Number(r.totalReward),
      responseCount: Number(r.responseCount),
    }));

    res.json({ leaderboard });
  } catch (err: any) {
    console.error("[Events] leaderboard error:", err.message);
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
