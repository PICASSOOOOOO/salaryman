import { Router } from "express";
import { getUserTier, setUserTier, isOwnerEmail, PRO_FEATURES, FREE_FEATURES } from "../lib/plan";
import { db, userTiersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

// ── Ensure table exists ────────────────────────────────────────────────────
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

// GET /api/plan — current user's tier
router.get("/api/plan", async (req, res) => {
  if (!req.isAuthenticated?.()) { res.json({ tier: "free", isOwner: false }); return; }
  const user = req.user as any;
  const tier = await getUserTier(user.id, user.email);
  res.json({
    tier,
    isOwner: isOwnerEmail(user.email),
    proFeatures: PRO_FEATURES,
    freeFeatures: FREE_FEATURES,
  });
});

// POST /api/plan/activate — called by Stripe webhook or manual grant
// Body: { userId, tier, secret }
// Protected by WEBHOOK_SECRET env var
router.post("/api/plan/activate", async (req, res) => {
  const { userId, tier, secret } = req.body ?? {};
  const expected = process.env.WEBHOOK_SECRET;
  if (!expected || secret !== expected) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!userId || !["free", "pro"].includes(tier)) { res.status(400).json({ error: "Invalid payload" }); return; }
  await setUserTier(userId, tier, "webhook");
  res.json({ ok: true, userId, tier });
});

// POST /api/plan/grant — owner-only manual grant (for testing / gifting access)
router.post("/api/plan/grant", async (req, res) => {
  if (!req.isAuthenticated?.()) { res.status(401).json({ error: "Login required" }); return; }
  const caller = req.user as any;
  if (!isOwnerEmail(caller.email)) { res.status(403).json({ error: "Not authorized" }); return; }
  const { targetUserId, tier = "pro" } = req.body ?? {};
  if (!targetUserId) { res.status(400).json({ error: "targetUserId required" }); return; }
  await setUserTier(targetUserId, tier, `owner:${caller.email}`);
  res.json({ ok: true, targetUserId, tier });
});

export default router;
