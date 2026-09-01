import { Router } from "express";
import { eq, desc, sql, and, gte } from "drizzle-orm";
import { db, worldEventsTable, eventResponsesTable, usersTable, playerProfilesTable } from "@workspace/db";

import { getActiveWorldEvents, resolveWorldEvent, sendToPlayer, getPlayerPosition, isNearBankOrStore } from "../worldServer";
import { OUTSIDE_WORLD_DISABLED_BODY, OUTSIDE_WORLD_ENABLED } from "../lib/outside-world";

const router = Router();

router.use("/events", (_req, res, next) => {
  if (OUTSIDE_WORLD_ENABLED) return next();
  return res.status(410).json(OUTSIDE_WORLD_DISABLED_BODY);
});

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

    // Robbery events require the responding player to be near a bank or store.
    if (dbEvent.eventType === "evt_robbery") {
      const pos = getPlayerPosition(userId);
      if (!pos || !isNearBankOrStore(pos.x, pos.y)) {
        res.status(403).json({ error: "You must be near a bank or store building to respond to a robbery." });
        return;
      }
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

    await db
      .update(playerProfilesTable)
      .set({
        responderCount: sql`${playerProfilesTable.responderCount} + 1`,
        emergencyEarnings: sql`${playerProfilesTable.emergencyEarnings} + ${rewardPaid}`,
      })
      .where(eq(playerProfilesTable.userId, userId));

    resolveWorldEvent(eventId);

    const eventTypeLabel: Record<string, string> = {
      evt_blackout: "GRID RESTORED",
      evt_fire: "FIRE SUPPRESSED",
      evt_medical: "CASUALTY STABILISED",
      evt_robbery: "ROBBERY FOILED",
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

router.get("/events/my-stats", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const userId = String(req.user!.id);

    const [profile] = await db
      .select({
        responderCount: playerProfilesTable.responderCount,
        emergencyEarnings: playerProfilesTable.emergencyEarnings,
      })
      .from(playerProfilesTable)
      .where(eq(playerProfilesTable.userId, userId))
      .limit(1);

    const responderCount = profile?.responderCount ?? 0;
    const emergencyEarnings = profile?.emergencyEarnings ?? 0;

    const MILESTONE_BADGE = 5;
    const badgeUnlocked = responderCount >= MILESTONE_BADGE;

    const recentRows = await db
      .select({
        respondedAt: eventResponsesTable.respondedAt,
        rewardPaid: eventResponsesTable.rewardPaid,
        eventId: eventResponsesTable.eventId,
      })
      .from(eventResponsesTable)
      .where(eq(eventResponsesTable.userId, userId))
      .orderBy(desc(eventResponsesTable.respondedAt))
      .limit(10);

    const eventIds = [...new Set(recentRows.map(r => r.eventId))];
    const eventTypes: Record<number, string> = {};
    if (eventIds.length > 0) {
      const evRows = await db
        .select({ id: worldEventsTable.id, eventType: worldEventsTable.eventType })
        .from(worldEventsTable)
        .where(sql`${worldEventsTable.id} IN (${sql.join(eventIds.map(id => sql`${id}`), sql`, `)})`);
      for (const ev of evRows) eventTypes[ev.id] = ev.eventType;
    }

    const history = recentRows.map(r => ({
      eventId: r.eventId,
      eventType: eventTypes[r.eventId] ?? "unknown",
      rewardPaid: r.rewardPaid,
      respondedAt: r.respondedAt,
    }));

    res.json({ responderCount, emergencyEarnings, badgeUnlocked, history });
  } catch (err: any) {
    console.error("[Events] my-stats error:", err.message);
    res.status(500).json({ error: "Internal error" });
  }
});

router.get("/events/history", async (req, res) => {
  try {
    let targetUserId: string | null = null;
    if (req.query.userId) {
      targetUserId = String(req.query.userId);
    } else if (req.isAuthenticated()) {
      targetUserId = String(req.user!.id);
    }
    if (!targetUserId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const rows = await db
      .select({
        eventType: worldEventsTable.eventType,
        count: sql<number>`count(*)`.as("count"),
        totalEarned: sql<number>`sum(${eventResponsesTable.rewardPaid})`.as("total_earned"),
      })
      .from(eventResponsesTable)
      .innerJoin(worldEventsTable, eq(eventResponsesTable.eventId, worldEventsTable.id))
      .where(eq(eventResponsesTable.userId, targetUserId))
      .groupBy(worldEventsTable.eventType);

    const byType: Record<string, { count: number; totalEarned: number }> = {};
    for (const r of rows) {
      byType[r.eventType] = { count: Number(r.count), totalEarned: Number(r.totalEarned) };
    }

    const robberyCount = byType["evt_robbery"]?.count ?? 0;
    const securityBadge = robberyCount >= 10;

    res.json({ byType, securityBadge });
  } catch (err: any) {
    console.error("[Events] history error:", err.message);
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

    // Per-event-type breakdown: join responses → events to get the event type
    const breakdownRows = userIds.length > 0
      ? await db
          .select({
            userId: eventResponsesTable.userId,
            eventType: worldEventsTable.eventType,
            count: sql<number>`count(*)`.as("count"),
            reward: sql<number>`sum(${eventResponsesTable.rewardPaid})`.as("reward"),
          })
          .from(eventResponsesTable)
          .innerJoin(worldEventsTable, eq(eventResponsesTable.eventId, worldEventsTable.id))
          .where(
            and(
              gte(eventResponsesTable.respondedAt, oneWeekAgo),
              sql`${eventResponsesTable.userId} IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)})`,
            )
          )
          .groupBy(eventResponsesTable.userId, worldEventsTable.eventType)
      : [];

    const breakdown: Record<string, Record<string, { count: number; reward: number }>> = {};
    for (const b of breakdownRows) {
      if (!breakdown[b.userId]) breakdown[b.userId] = {};
      breakdown[b.userId][b.eventType] = { count: Number(b.count), reward: Number(b.reward) };
    }

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
      byEventType: breakdown[r.userId] ?? {},
    }));

    res.json({ leaderboard });
  } catch (err: any) {
    console.error("[Events] leaderboard error:", err.message);
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
