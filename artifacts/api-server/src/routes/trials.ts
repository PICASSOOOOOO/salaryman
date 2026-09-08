import { Router, type IRouter } from "express";
import { db, subscribersTable, featureTrialsTable, type FeatureKey, FEATURE_KEYS } from "@workspace/db";
import { eq, and, gt, or } from "drizzle-orm";
import { FEATURE_CATALOG, resolveFeatureKey } from "../lib/plan";

const router: IRouter = Router();

const TRIAL_DAYS = 7;

router.post("/trials", async (req, res) => {
  const { email, featureKey } = req.body as { email?: string; featureKey?: string };

  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Valid email is required" });
    return;
  }

  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    res.status(400).json({ error: "Invalid email address" });
    return;
  }

  const resolvedKey = featureKey ? resolveFeatureKey(featureKey as string) : undefined;
  if (!resolvedKey) {
    res.status(400).json({ error: "Invalid feature key", validFeatures: [...FEATURE_KEYS] });
    return;
  }

  const fk = resolvedKey;
  const catalog = FEATURE_CATALOG[fk];

  const userId = req.isAuthenticated?.() ? req.user.id : null;

  const identityConditions = [eq(featureTrialsTable.email, normalized)];
  if (userId) {
    identityConditions.push(eq(featureTrialsTable.userId, userId));
  }

  const allExisting = await db
    .select()
    .from(featureTrialsTable)
    .where(
      and(
        or(...identityConditions),
        eq(featureTrialsTable.featureKey, fk)
      )
    );

  const activeTrial = allExisting.find((t) => t.trialExpiresAt.getTime() > Date.now());
  if (activeTrial) {
    const daysLeft = Math.max(0, Math.ceil((activeTrial.trialExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
    res.json({
      ok: true,
      alreadyActive: true,
      featureKey: fk,
      featureName: catalog.name,
      trialExpiresAt: activeTrial.trialExpiresAt.toISOString(),
      daysLeft,
    });
    return;
  }

  if (allExisting.length > 0) {
    res.status(403).json({
      error: "Trial already used",
      message: `You've already used your free trial for ${catalog.name}. Subscribe to continue access.`,
      featureKey: fk,
      upgrade: "/upgrade",
    });
    return;
  }

  try {
    await db.insert(subscribersTable).values({
      email: normalized,
      source: `trial:${fk}`,
    });
  } catch (err) {
    const pgCode = (err as { code?: string })?.code;
    if (pgCode !== "23505") {
      console.error("trial subscriber insert error:", err);
    }
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(featureTrialsTable).values({
    email: normalized,
    featureKey: fk,
    userId,
    trialStartedAt: now,
    trialExpiresAt: expiresAt,
    trialDays: TRIAL_DAYS,
    source: `feature_trial:${fk}`,
  });

  res.json({
    ok: true,
    alreadyActive: false,
    featureKey: fk,
    featureName: catalog.name,
    trialExpiresAt: expiresAt.toISOString(),
    daysLeft: TRIAL_DAYS,
  });
});

router.get("/trials", async (req, res) => {
  if (!req.isAuthenticated?.()) {
    res.json({ trials: [] });
    return;
  }

  const now = new Date();
  const userId = req.user.id;
  const email = req.user.email?.toLowerCase();

  const identityConditions = [eq(featureTrialsTable.userId, userId)];
  if (email) {
    identityConditions.push(eq(featureTrialsTable.email, email));
  }

  const trials = await db
    .select()
    .from(featureTrialsTable)
    .where(
      and(
        or(...identityConditions),
        gt(featureTrialsTable.trialExpiresAt, now)
      )
    );

  const seen = new Set<string>();
  const deduped = trials.filter((t) => {
    if (seen.has(t.featureKey)) return false;
    seen.add(t.featureKey);
    return true;
  });

  const result = deduped.map((t) => ({
    featureKey: t.featureKey,
    trialExpiresAt: t.trialExpiresAt.toISOString(),
    daysLeft: Math.max(0, Math.ceil((t.trialExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))),
  }));

  res.json({ trials: result });
});

export default router;
