import { Router, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, playerProfilesTable, usersTable } from "@workspace/db";

const router = Router();

function requireAuth(req: Request, res: Response): req is Request & { user: Express.User } {
  if (!req.isAuthenticated() || !req.user?.id) {
    res.status(401).json({ error: "Login required" });
    return false;
  }
  return true;
}

function normName(raw: unknown): string {
  return String(raw ?? "").trim().slice(0, 32).toUpperCase();
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_COLOR = "#a78bfa";

/**
 * Auto-seed: if a logged-in user has zero profiles yet, mint one from their
 * existing legacy player name (firstName + lastName / email-local-part) so
 * the multi-profile system is backwards-compatible — every existing
 * world_businesses / business_snapshots row stays reachable under the
 * auto-seeded "default" profile.
 */
async function ensureSeedProfile(userId: string, fallbackName: string): Promise<void> {
  const existing = await db
    .select({ id: playerProfilesTable.id })
    .from(playerProfilesTable)
    .where(eq(playerProfilesTable.userId, userId))
    .limit(1);
  if (existing.length > 0) return;
  const baseName = normName(fallbackName) || "PLAYER 1";
  // playerName has BOTH per-user and GLOBAL uniqueness. On collision (either
  // because of a concurrent first-time GET for the same user, or because
  // another account already burned this derived name), retry with a numeric
  // suffix until we land on something free, then pick whatever row this user
  // ends up owning. Bounded loop so we can't spin forever.
  let chosenId: string | null = null;
  for (let suffix = 0; suffix < 50 && !chosenId; suffix++) {
    const candidate = (suffix === 0 ? baseName : `${baseName.slice(0, 28)} ${suffix + 1}`).toUpperCase();
    const inserted = await db
      .insert(playerProfilesTable)
      .values({ userId, playerName: candidate, avatarColor: DEFAULT_COLOR })
      .onConflictDoNothing()
      .returning({ id: playerProfilesTable.id });
    if (inserted[0]) { chosenId = inserted[0].id; break; }
    // Insert was a no-op (conflict). If it conflicted because *this* user
    // already owns a profile (concurrent seed), use that one and stop.
    const mine = await db
      .select({ id: playerProfilesTable.id })
      .from(playerProfilesTable)
      .where(eq(playerProfilesTable.userId, userId))
      .limit(1);
    if (mine[0]) { chosenId = mine[0].id; break; }
    // Otherwise the global name was taken by another account — try a suffix.
  }
  if (chosenId) {
    await db
      .update(usersTable)
      .set({ activeProfileId: chosenId, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));
  }
}

function derivedFallback(req: Request): string {
  const u = req.user as Express.User | undefined;
  if (!u) return "PLAYER 1";
  const first = u.firstName ?? "";
  const last = u.lastName ?? "";
  const parts = [first, last].filter(s => s.length > 0);
  const name = parts.length > 0 ? parts.join(" ") : ((u.email?.split("@")[0]) ?? String(u.id));
  return normName(name) || "PLAYER 1";
}

// GET /api/profiles — list this account's profiles + which one is active.
router.get("/profiles", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = String(req.user.id);
  try {
    await ensureSeedProfile(userId, derivedFallback(req));
    const rows = await db
      .select()
      .from(playerProfilesTable)
      .where(eq(playerProfilesTable.userId, userId))
      .orderBy(playerProfilesTable.createdAt);
    const [me] = await db
      .select({ activeProfileId: usersTable.activeProfileId, economicId: usersTable.economicId })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    res.json({ profiles: rows, activeProfileId: me?.activeProfileId ?? null, economicUserId: me?.economicId ?? null });
  } catch (e: any) {
    console.error("[Profiles] list error:", e?.message);
    res.status(500).json({ error: "Failed to load profiles" });
  }
});

// POST /api/profiles  body: { playerName, avatarColor?, makeActive? }
router.post("/profiles", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = String(req.user.id);
  const playerName = normName(req.body?.playerName);
  const avatarColor = HEX_RE.test(String(req.body?.avatarColor || "")) ? String(req.body.avatarColor) : DEFAULT_COLOR;
  const makeActive = req.body?.makeActive !== false; // default true
  if (!playerName) { res.status(400).json({ error: "playerName required" }); return; }
  try {
    // Hard-cap profile count per account so this can't be used to flood the
    // table. 12 is plenty for testing scenarios; tweak if needed.
    const countRows = await db
      .select({ id: playerProfilesTable.id })
      .from(playerProfilesTable)
      .where(eq(playerProfilesTable.userId, userId));
    if (countRows.length >= 12) {
      res.status(400).json({ error: "Profile limit reached (12 per account). Delete one first." });
      return;
    }
    // Single global existence check — playerName is globally unique now.
    const dup = await db
      .select({ id: playerProfilesTable.id, userId: playerProfilesTable.userId })
      .from(playerProfilesTable)
      .where(eq(playerProfilesTable.playerName, playerName))
      .limit(1);
    if (dup.length > 0) {
      const mine = dup[0].userId === userId;
      res.status(409).json({
        error: mine
          ? `You already have a profile named "${playerName}".`
          : `The name "${playerName}" is already taken. Pick another.`,
      });
      return;
    }
    const [created] = await db
      .insert(playerProfilesTable)
      .values({ userId, playerName, avatarColor })
      .returning();
    if (makeActive && created) {
      await db
        .update(usersTable)
        .set({ activeProfileId: created.id, updatedAt: new Date() })
        .where(eq(usersTable.id, userId));
    }
    res.json({ ok: true, profile: created, activeProfileId: makeActive ? created?.id : undefined });
  } catch (e: any) {
    console.error("[Profiles] create error:", e?.message);
    res.status(500).json({ error: "Failed to create profile" });
  }
});

// PATCH /api/profiles/:id  body: { playerName?, avatarColor? }
router.patch("/profiles/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = String(req.user.id);
  const id = String(req.params.id);
  const updates: Record<string, unknown> = {};
  if (req.body?.playerName !== undefined) {
    const n = normName(req.body.playerName);
    if (!n) { res.status(400).json({ error: "playerName cannot be empty" }); return; }
    updates.playerName = n;
  }
  if (req.body?.avatarColor !== undefined) {
    const c = String(req.body.avatarColor);
    if (!HEX_RE.test(c)) { res.status(400).json({ error: "avatarColor must be #RRGGBB" }); return; }
    updates.avatarColor = c;
  }
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "Nothing to update" }); return; }
  try {
    if (updates.playerName) {
      const dup = await db
        .select({ id: playerProfilesTable.id, userId: playerProfilesTable.userId })
        .from(playerProfilesTable)
        .where(eq(playerProfilesTable.playerName, updates.playerName as string))
        .limit(1);
      if (dup.length > 0 && dup[0].id !== id) {
        const mine = dup[0].userId === userId;
        res.status(409).json({
          error: mine
            ? `You already have a profile named "${updates.playerName}".`
            : `The name "${updates.playerName}" is already taken. Pick another.`,
        });
        return;
      }
    }
    const [updated] = await db
      .update(playerProfilesTable)
      .set(updates)
      .where(and(eq(playerProfilesTable.id, id), eq(playerProfilesTable.userId, userId)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Profile not found" }); return; }
    res.json({ ok: true, profile: updated });
  } catch (e: any) {
    console.error("[Profiles] patch error:", e?.message);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// DELETE /api/profiles/:id  — refuses to delete the only profile or the
// currently-active one (to avoid leaving the account in a "no character"
// limbo state). Caller must switch first.
router.delete("/profiles/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = String(req.user.id);
  const id = String(req.params.id);
  try {
    const all = await db
      .select()
      .from(playerProfilesTable)
      .where(eq(playerProfilesTable.userId, userId));
    if (all.length <= 1) {
      res.status(400).json({ error: "Cannot delete your only profile." });
      return;
    }
    const [me] = await db
      .select({ activeProfileId: usersTable.activeProfileId })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (me?.activeProfileId === id) {
      res.status(400).json({ error: "Switch to another profile before deleting this one." });
      return;
    }
    const target = all.find(p => p.id === id);
    if (!target) { res.status(404).json({ error: "Profile not found" }); return; }
    await db
      .delete(playerProfilesTable)
      .where(and(eq(playerProfilesTable.id, id), eq(playerProfilesTable.userId, userId)));
    // Note: world_businesses / snapshots / transactions for that playerName
    // are intentionally left in place — re-creating a profile with the same
    // name will resurrect the character. This is a feature for testing.
    res.json({ ok: true });
  } catch (e: any) {
    console.error("[Profiles] delete error:", e?.message);
    res.status(500).json({ error: "Failed to delete profile" });
  }
});

// POST /api/profiles/:id/switch — make this the active profile.
router.post("/profiles/:id/switch", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = String(req.user.id);
  const id = String(req.params.id);
  try {
    const [profile] = await db
      .select()
      .from(playerProfilesTable)
      .where(and(eq(playerProfilesTable.id, id), eq(playerProfilesTable.userId, userId)))
      .limit(1);
    if (!profile) { res.status(404).json({ error: "Profile not found" }); return; }
    await db
      .update(playerProfilesTable)
      .set({ lastUsedAt: new Date() })
      .where(eq(playerProfilesTable.id, id));
    await db
      .update(usersTable)
      .set({ activeProfileId: id, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));
    res.json({ ok: true, activeProfileId: id, playerName: profile.playerName });
  } catch (e: any) {
    console.error("[Profiles] switch error:", e?.message);
    res.status(500).json({ error: "Failed to switch profile" });
  }
});

export default router;
