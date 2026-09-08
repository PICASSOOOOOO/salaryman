import { Router } from "express";
import { getUserFeatures, getUserTier, isOwnerEmail, FEATURE_CATALOG, FREE_FEATURES, grantFeature, resolveFeatureKey } from "../lib/plan";
import { FEATURE_KEYS, type FeatureKey, db, featureTrialsTable } from "@workspace/db";
import { eq, and, gt, or, type SQL } from "drizzle-orm";

const router = Router();

router.get("/plan", async (req, res) => {
  if (!req.isAuthenticated?.()) {
    res.json({ tier: "free", isOwner: false, features: [], trials: [], catalog: FEATURE_CATALOG, freeFeatures: FREE_FEATURES });
    return;
  }
  const user = req.user;
  const features = await getUserFeatures(user.id, user.email);
  const isOwner = isOwnerEmail(user.email);
  const tier = await getUserTier(user.id, user.email);

  const now = new Date();
  let trialRows: typeof featureTrialsTable.$inferSelect[] = [];
  const conditions: SQL[] = [];
  if (user.email) {
    conditions.push(eq(featureTrialsTable.email, user.email.toLowerCase()));
  }
  conditions.push(eq(featureTrialsTable.userId, user.id));

  if (conditions.length > 0) {
    trialRows = await db
      .select()
      .from(featureTrialsTable)
      .where(and(or(...conditions), gt(featureTrialsTable.trialExpiresAt, now)));
  }

  const trials = trialRows.map((t) => ({
    featureKey: resolveFeatureKey(t.featureKey),
    trialExpiresAt: t.trialExpiresAt.toISOString(),
    daysLeft: Math.max(0, Math.ceil((t.trialExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))),
  }));

  res.json({
    tier,
    isOwner,
    features: [...features],
    trials,
    catalog: FEATURE_CATALOG,
    freeFeatures: FREE_FEATURES,
    maxSaveSlots: tier === "pro" ? 10 : 2,
  });
});

router.post("/plan/grant", async (req, res) => {
  if (!req.isAuthenticated?.()) { res.status(401).json({ error: "Login required" }); return; }
  const caller = req.user;
  if (!isOwnerEmail(caller.email)) { res.status(403).json({ error: "Not authorized" }); return; }
  const { targetUserId, feature: rawFeature } = req.body ?? {};
  if (!targetUserId) { res.status(400).json({ error: "targetUserId required" }); return; }
  const feature = rawFeature ? resolveFeatureKey(rawFeature) : undefined;
  if (!feature) {
    res.status(400).json({ error: "Valid feature key required", validFeatures: [...FEATURE_KEYS] });
    return;
  }
  await grantFeature(targetUserId, feature, `owner:${caller.email}`);
  res.json({ ok: true, targetUserId, feature });
});

export default router;
