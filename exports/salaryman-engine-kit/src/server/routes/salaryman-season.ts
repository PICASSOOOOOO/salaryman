import { Router, raw } from "express";
import Stripe from "stripe";
import {
  db,
  salarymanSeasonsTable,
  salarymanPlayerPassTable,
  salarymanPlayerMissionsTable,
  type SeasonTier,
  type SeasonMissionDef,
  type SeasonReward,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { buildCurrentSeason, getPeriodKeyForMission } from "../lib/season-data";

const router = Router();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not set");
  return new Stripe(key);
}

function getAppBaseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  return "http://localhost:3000";
}

async function ensureActiveSeason() {
  const [existing] = await db
    .select()
    .from(salarymanSeasonsTable)
    .where(eq(salarymanSeasonsTable.isActive, true))
    .limit(1);

  if (existing) return existing;

  const data = buildCurrentSeason();
  const [created] = await db
    .insert(salarymanSeasonsTable)
    .values(data)
    .onConflictDoUpdate({
      target: salarymanSeasonsTable.slug,
      set: {
        isActive: true,
        name: data.name,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        tiers: data.tiers,
        missions: data.missions,
        stripePriceId: data.stripePriceId,
      },
    })
    .returning();
  return created;
}

async function ensurePlayerPass(userId: string, seasonId: number) {
  const [existing] = await db
    .select()
    .from(salarymanPlayerPassTable)
    .where(and(
      eq(salarymanPlayerPassTable.userId, userId),
      eq(salarymanPlayerPassTable.seasonId, seasonId),
    ))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(salarymanPlayerPassTable)
    .values({ userId, seasonId, xp: 0, currentLevel: 1, isPremium: false, claimedTiers: [] })
    .returning();
  return created;
}

function computeLevel(xp: number, tiers: SeasonTier[]): number {
  let level = 1;
  for (const tier of tiers) {
    if (xp >= tier.xpRequired) {
      level = tier.level;
    } else {
      break;
    }
  }
  return level;
}

router.get("/salaryman/season/current", async (req, res) => {
  if (!req.isAuthenticated?.()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const season = await ensureActiveSeason();
    const pass = await ensurePlayerPass(req.user.id, season.id);

    const missions = (season.missions as SeasonMissionDef[]).map(m => {
      const periodKey = getPeriodKeyForMission(m.type);
      return { ...m, periodKey };
    });

    const missionIds = missions.map(m => m.id);
    const periodKeys = [...new Set(missions.map(m => m.periodKey))];

    let playerMissions: Array<{ missionId: string; periodKey: string; progress: number; completed: boolean; xpAwarded: boolean }> = [];

    if (missionIds.length > 0) {
      const allRows = await db
        .select()
        .from(salarymanPlayerMissionsTable)
        .where(and(
          eq(salarymanPlayerMissionsTable.userId, req.user.id),
          eq(salarymanPlayerMissionsTable.seasonId, season.id),
        ));
      playerMissions = allRows
        .filter(r => missionIds.includes(r.missionId) && periodKeys.includes(r.periodKey))
        .map(r => ({ missionId: r.missionId, periodKey: r.periodKey, progress: r.progress, completed: r.completed, xpAwarded: r.xpAwarded }));
    }

    res.json({
      season: {
        id: season.id,
        slug: season.slug,
        name: season.name,
        number: season.number,
        startsAt: season.startsAt,
        endsAt: season.endsAt,
        premiumPriceUsd: season.premiumPriceUsd,
        tiers: season.tiers,
        missions,
      },
      pass: {
        xp: pass.xp,
        currentLevel: pass.currentLevel,
        isPremium: pass.isPremium,
        claimedTiers: pass.claimedTiers,
      },
      playerMissions,
    });
  } catch (err: any) {
    console.error("[season] get current error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/salaryman/season/history", async (req, res) => {
  if (!req.isAuthenticated?.()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const seasons = await db
      .select({
        id: salarymanSeasonsTable.id,
        slug: salarymanSeasonsTable.slug,
        name: salarymanSeasonsTable.name,
        number: salarymanSeasonsTable.number,
        startsAt: salarymanSeasonsTable.startsAt,
        endsAt: salarymanSeasonsTable.endsAt,
        isActive: salarymanSeasonsTable.isActive,
      })
      .from(salarymanSeasonsTable)
      .orderBy(salarymanSeasonsTable.number);

    const passesBySeasonId: Record<number, { xp: number; currentLevel: number; isPremium: boolean; claimedTiers: string[] }> = {};
    for (const s of seasons) {
      const [p] = await db
        .select()
        .from(salarymanPlayerPassTable)
        .where(and(
          eq(salarymanPlayerPassTable.userId, req.user.id),
          eq(salarymanPlayerPassTable.seasonId, s.id),
        ))
        .limit(1);
      if (p) {
        passesBySeasonId[s.id] = { xp: p.xp, currentLevel: p.currentLevel, isPremium: p.isPremium, claimedTiers: (p.claimedTiers as string[]) ?? [] };
      }
    }

    res.json({ seasons, passes: passesBySeasonId });
  } catch (err: any) {
    console.error("[season] history error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/salaryman/season/mission-progress", async (req, res) => {
  if (!req.isAuthenticated?.()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const { trackingKey, amount = 1 } = req.body as { trackingKey: string; amount?: number };
    if (!trackingKey || typeof amount !== "number" || amount <= 0) {
      res.status(400).json({ error: "trackingKey and positive amount required" });
      return;
    }

    const season = await ensureActiveSeason();
    const missions = season.missions as SeasonMissionDef[];
    const matching = missions.filter(m => m.trackingKey === trackingKey);
    if (matching.length === 0) {
      res.json({ updated: false, xpGained: 0 });
      return;
    }

    let totalXpGained = 0;
    const pass = await ensurePlayerPass(req.user.id, season.id);

    for (const mission of matching) {
      const periodKey = getPeriodKeyForMission(mission.type);
      const [existing] = await db
        .select()
        .from(salarymanPlayerMissionsTable)
        .where(and(
          eq(salarymanPlayerMissionsTable.userId, req.user.id),
          eq(salarymanPlayerMissionsTable.seasonId, season.id),
          eq(salarymanPlayerMissionsTable.missionId, mission.id),
          eq(salarymanPlayerMissionsTable.periodKey, periodKey),
        ))
        .limit(1);

      if (existing?.xpAwarded) continue;

      const currentProgress = existing?.progress ?? 0;
      const newProgress = Math.min(currentProgress + amount, mission.targetCount);
      const completed = newProgress >= mission.targetCount;
      const xpGained = completed && !existing?.xpAwarded ? mission.xpReward : 0;

      if (existing) {
        await db
          .update(salarymanPlayerMissionsTable)
          .set({ progress: newProgress, completed, xpAwarded: completed || existing.xpAwarded })
          .where(eq(salarymanPlayerMissionsTable.id, existing.id));
      } else {
        await db
          .insert(salarymanPlayerMissionsTable)
          .values({
            userId: req.user.id,
            seasonId: season.id,
            missionId: mission.id,
            periodKey,
            progress: newProgress,
            completed,
            xpAwarded: completed,
          })
          .onConflictDoNothing();
      }

      totalXpGained += xpGained;
    }

    let newLevel = pass.currentLevel;
    let newXp = pass.xp;
    if (totalXpGained > 0) {
      newXp = pass.xp + totalXpGained;
      newLevel = computeLevel(newXp, season.tiers as SeasonTier[]);
      await db
        .update(salarymanPlayerPassTable)
        .set({ xp: newXp, currentLevel: newLevel })
        .where(and(
          eq(salarymanPlayerPassTable.userId, req.user.id),
          eq(salarymanPlayerPassTable.seasonId, season.id),
        ));
    }

    res.json({ updated: true, xpGained: totalXpGained, newXp, newLevel });
  } catch (err: any) {
    console.error("[season] mission-progress error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/salaryman/season/claim-reward", async (req, res) => {
  if (!req.isAuthenticated?.()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const { tierLevel, track } = req.body as { tierLevel: number; track: "free" | "premium" };
    if (!tierLevel || !track || !["free", "premium"].includes(track)) {
      res.status(400).json({ error: "tierLevel and track (free/premium) required" });
      return;
    }

    const season = await ensureActiveSeason();
    const pass = await ensurePlayerPass(req.user.id, season.id);
    const tiers = season.tiers as SeasonTier[];

    const tier = tiers.find(t => t.level === tierLevel);
    if (!tier) {
      res.status(404).json({ error: "Tier not found" });
      return;
    }

    if (pass.currentLevel < tierLevel) {
      res.status(403).json({ error: "Tier not yet reached" });
      return;
    }

    if (track === "premium" && !pass.isPremium) {
      res.status(403).json({ error: "Premium pass required" });
      return;
    }

    const claimKey = `${tierLevel}-${track}`;
    const claimedTiers = (pass.claimedTiers as unknown as string[]) ?? [];
    if (claimedTiers.includes(claimKey)) {
      res.status(409).json({ error: "Already claimed" });
      return;
    }

    const reward: SeasonReward | null = track === "free" ? tier.freeReward : tier.premiumReward;
    if (!reward) {
      res.status(400).json({ error: "No reward for this tier/track" });
      return;
    }

    const newClaimed = [...claimedTiers, claimKey];
    await db
      .update(salarymanPlayerPassTable)
      .set({ claimedTiers: newClaimed as unknown as string[] })
      .where(and(
        eq(salarymanPlayerPassTable.userId, req.user.id),
        eq(salarymanPlayerPassTable.seasonId, season.id),
      ));

    res.json({ ok: true, reward });
  } catch (err: any) {
    console.error("[season] claim-reward error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/salaryman/season/purchase-premium", async (req, res) => {
  if (!req.isAuthenticated?.()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const season = await ensureActiveSeason();
    const pass = await ensurePlayerPass(req.user.id, season.id);

    if (pass.isPremium) {
      res.status(409).json({ error: "Premium pass already owned for this season" });
      return;
    }

    const priceId = season.stripePriceId;
    if (!priceId) {
      res.status(500).json({ error: "Season pass Stripe price not configured" });
      return;
    }

    const stripe = getStripe();
    const baseUrl = getAppBaseUrl();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/world?pass=success`,
      cancel_url: `${baseUrl}/world?pass=cancel`,
      client_reference_id: req.user.id,
      metadata: {
        type: "season_pass",
        userId: req.user.id,
        seasonId: String(season.id),
      },
    });

    res.json({ url: session.url });
  } catch (err: any) {
    console.error("[season] purchase-premium error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

export async function handleSeasonPassWebhookEvent(event: { data: { object: any }; type: string }) {
  if (event.type !== "checkout.session.completed") return;
  const session = event.data.object;
  if (session.metadata?.type !== "season_pass") return;

  const userId = session.metadata.userId;
  const seasonId = parseInt(session.metadata.seasonId, 10);
  if (!userId || isNaN(seasonId)) return;

  await db
    .update(salarymanPlayerPassTable)
    .set({ isPremium: true, premiumPurchasedAt: new Date(), stripeSessionId: session.id })
    .where(and(
      eq(salarymanPlayerPassTable.userId, userId),
      eq(salarymanPlayerPassTable.seasonId, seasonId),
    ));

  console.log(`[Season] User ${userId} unlocked premium pass for season ${seasonId}`);
}

export default router;
