import { Router } from "express";
import { getUserFeatures, getUserTier, isOwnerEmail, FEATURE_CATALOG, FREE_FEATURES, grantFeature } from "../lib/plan";
import { FEATURE_KEYS, type FeatureKey } from "@workspace/db";

const router = Router();

router.get("/plan", async (req, res) => {
  if (!req.isAuthenticated?.()) {
    res.json({ tier: "free", isOwner: false, features: [], catalog: FEATURE_CATALOG, freeFeatures: FREE_FEATURES });
    return;
  }
  const user = req.user;
  const features = await getUserFeatures(user.id, user.email);
  const isOwner = isOwnerEmail(user.email);
  const tier = await getUserTier(user.id, user.email);
  res.json({
    tier,
    isOwner,
    features: [...features],
    catalog: FEATURE_CATALOG,
    freeFeatures: FREE_FEATURES,
    maxSaveSlots: tier === "pro" ? 10 : 2,
  });
});

router.post("/plan/grant", async (req, res) => {
  if (!req.isAuthenticated?.()) { res.status(401).json({ error: "Login required" }); return; }
  const caller = req.user;
  if (!isOwnerEmail(caller.email)) { res.status(403).json({ error: "Not authorized" }); return; }
  const { targetUserId, feature } = req.body ?? {};
  if (!targetUserId) { res.status(400).json({ error: "targetUserId required" }); return; }
  if (!feature || !FEATURE_KEYS.includes(feature)) {
    res.status(400).json({ error: "Valid feature key required", validFeatures: [...FEATURE_KEYS] });
    return;
  }
  await grantFeature(targetUserId, feature as FeatureKey, `owner:${caller.email}`);
  res.json({ ok: true, targetUserId, feature });
});

export default router;
