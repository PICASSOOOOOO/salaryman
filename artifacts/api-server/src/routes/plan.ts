import { Router } from "express";
import { getUserFeatures, isOwnerEmail, FEATURE_CATALOG, FREE_FEATURES, grantFeature } from "../lib/plan";
import { FEATURE_KEYS, type FeatureKey } from "@workspace/db";

const router = Router();

router.get("/plan", async (req, res) => {
  if (!req.isAuthenticated?.()) {
    res.json({ tier: "free", isOwner: false, features: [], catalog: FEATURE_CATALOG, freeFeatures: FREE_FEATURES });
    return;
  }
  const user = req.user;
  const features = await getUserFeatures(user.id, user.email);
  const tier = features.size > 0 ? "pro" : "free";
  res.json({
    tier,
    isOwner: isOwnerEmail(user.email),
    features: [...features],
    catalog: FEATURE_CATALOG,
    freeFeatures: FREE_FEATURES,
    maxSaveSlots: features.size > 0 ? 10 : 2,
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
