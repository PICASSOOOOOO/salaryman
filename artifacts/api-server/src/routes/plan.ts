import { Router } from "express";
import { getUserTier, setUserTier, isOwnerEmail, PRO_FEATURES, FREE_FEATURES } from "../lib/plan";
import { db } from "@workspace/db";

const router = Router();

async function ensureTable() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_tiers (
      user_id VARCHAR PRIMARY KEY,
      tier VARCHAR NOT NULL DEFAULT 'free',
      granted_by VARCHAR NOT NULL DEFAULT 'default',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}
ensureTable().catch(console.error);

router.get("/api/plan", async (req, res) => {
  if (!req.isAuthenticated?.()) { res.json({ tier: "free", isOwner: false }); return; }
  const user = req.user;
  const tier = await getUserTier(user.id, user.email);
  res.json({
    tier,
    isOwner: isOwnerEmail(user.email),
    proFeatures: PRO_FEATURES,
    freeFeatures: FREE_FEATURES,
  });
});

router.post("/api/plan/grant", async (req, res) => {
  if (!req.isAuthenticated?.()) { res.status(401).json({ error: "Login required" }); return; }
  const caller = req.user;
  if (!isOwnerEmail(caller.email)) { res.status(403).json({ error: "Not authorized" }); return; }
  const { targetUserId, tier = "pro" } = req.body ?? {};
  if (!targetUserId) { res.status(400).json({ error: "targetUserId required" }); return; }
  await setUserTier(targetUserId, tier, `owner:${caller.email}`);
  res.json({ ok: true, targetUserId, tier });
});

export default router;
