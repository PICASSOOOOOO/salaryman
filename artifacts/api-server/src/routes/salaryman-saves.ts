import { Router, type IRouter } from "express";
import { db, salarymanSavesTable, organizationsTable, orgMembersTable, worldBusinessesTable } from "@workspace/db";
import { eq, and, or, inArray } from "drizzle-orm";
import { getUserTier } from "../lib/plan";

const router: IRouter = Router();

const FREE_MAX_SLOTS = 2;
const PRO_MAX_SLOTS = 10;
const ENTERPRISE_MAX_SLOTS = 1;

// ── Story Mode (foundation) ──────────────────────────────────────────────────
// Story progression is a per-character (per save-slot) state stored inside the
// save's `data` JSON blob under `data.story`. Beginning the story is a deliberate,
// one-way, server-authorized commitment: the player must have completed their
// "first project" (registered a business OR taken a job) and it permanently
// relocates their home base + grants the MX-75 mobile office link. We keep the
// canonical begin-state on the server so the unlock can never be faked by a
// client flag (see onboarding-complete gating).
const STORY_HOME = { kind: "campsite" as const, x: 6620, y: 6520, label: "UNDERGROUND CAMP" };

interface StoryState {
  active: boolean;
  startedAt: string;
  quarter: number;
  chapter: number;
  missionIndex: number;
  homeBase: { kind: string; x: number; y: number; label: string };
  mx75Granted: boolean;
  // Ids of completed story assignments (per-quarter, ordered). Persisted as part
  // of the per-character data.story blob; rides the story-merge below.
  assignmentsCompleted?: string[];
}

const INACTIVE_STORY: StoryState = {
  active: false,
  startedAt: "",
  quarter: 1,
  chapter: 1,
  missionIndex: 0,
  homeBase: { ...STORY_HOME },
  mx75Granted: false,
  assignmentsCompleted: [],
};

/**
 * Server-authoritative eligibility: the player has finished their "first
 * project" if they have registered a business (world registry row, or a
 * persisted business in their save) OR they hold a job (employedAt in the save,
 * or an active org membership). Derived entirely from server-readable state —
 * never from a client-supplied flag.
 */
async function computeStoryEligibility(
  userId: string,
  charName: string,
  saveData: Record<string, unknown> | null,
): Promise<{ eligible: boolean; reason: string }> {
  if (saveData) {
    const employed = saveData.employedAt != null && saveData.employedAt !== "";
    const businesses = saveData.businesses;
    const hasBiz = Array.isArray(businesses) && businesses.length > 0;
    if (employed || hasBiz) return { eligible: true, reason: "save" };
  }
  const biz = await db
    .select({ id: worldBusinessesTable.id })
    .from(worldBusinessesTable)
    .where(
      and(
        or(eq(worldBusinessesTable.userId, userId), eq(worldBusinessesTable.playerName, charName)),
        inArray(worldBusinessesTable.businessType, ["real", "minx"]),
      ),
    )
    .limit(1);
  if (biz.length > 0) return { eligible: true, reason: "registry" };
  const membership = await db
    .select({ orgId: orgMembersTable.orgId })
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")))
    .limit(1);
  if (membership.length > 0) return { eligible: true, reason: "org" };
  return {
    eligible: false,
    reason: "Complete your first project — get a job or register a business — before you can begin the story.",
  };
}

async function hasActiveEnterprise(userId: string): Promise<boolean> {
  const owned = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(eq(organizationsTable.ownerUserId, userId))
    .limit(1);
  if (owned.length > 0) return true;
  const membership = await db
    .select({ orgId: orgMembersTable.orgId })
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")))
    .limit(1);
  if (membership.length > 0) return true;
  const realBiz = await db
    .select({ id: worldBusinessesTable.id })
    .from(worldBusinessesTable)
    .where(and(eq(worldBusinessesTable.userId, userId), eq(worldBusinessesTable.businessType, "real")))
    .limit(1);
  return realBiz.length > 0;
}

router.get("/salaryman/saves", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const tier = await getUserTier(req.user.id, req.user.email);
    const enterprise = await hasActiveEnterprise(req.user.id);
    const maxSlots = enterprise ? ENTERPRISE_MAX_SLOTS : tier === "pro" ? PRO_MAX_SLOTS : FREE_MAX_SLOTS;
    const saves = await db
      .select()
      .from(salarymanSavesTable)
      .where(eq(salarymanSavesTable.userId, req.user.id));
    res.json({ saves, maxSlots, tier, enterprise });
  } catch (err: any) {
    console.error("[saves] list error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/salaryman/saves/:slot", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const slot = parseInt(req.params.slot, 10);
  const tier = await getUserTier(req.user.id, req.user.email);
  const enterprise = await hasActiveEnterprise(req.user.id);
  const maxSlots = enterprise ? ENTERPRISE_MAX_SLOTS : tier === "pro" ? PRO_MAX_SLOTS : FREE_MAX_SLOTS;
  if (isNaN(slot) || slot < 0 || slot >= maxSlots) {
    res.status(400).json({ error: enterprise ? "Enterprise accounts are limited to 1 save slot" : `Invalid slot (0-${maxSlots - 1})`, maxSlots, tier, enterprise });
    return;
  }
  const { charName, charClass, level, salary, lastZone, playtime, data } = req.body;
  if (!charName || !charClass || !data) {
    res.status(400).json({ error: "charName, charClass, data required" });
    return;
  }
  try {
    // One-way story guard: the story is a server-authoritative commitment. Once
    // it is active it must NEVER revert, even if a stale/concurrent client save
    // arrives without the story flag (lost-update protection). We read the
    // committed story and merge it back over the incoming blob, preserving the
    // immutable commitment fields while still letting forward progress through.
    const incoming = data as Record<string, unknown>;
    const [prior] = await db
      .select({ data: salarymanSavesTable.data })
      .from(salarymanSavesTable)
      .where(and(eq(salarymanSavesTable.userId, req.user.id), eq(salarymanSavesTable.slotIndex, slot)))
      .limit(1);
    const priorStory = ((prior?.data as Record<string, unknown> | undefined)?.story) as StoryState | undefined;
    if (priorStory?.active) {
      const incomingStory = incoming.story as StoryState | undefined;
      incoming.story = incomingStory?.active
        ? {
            ...incomingStory,
            active: true,
            startedAt: priorStory.startedAt,
            homeBase: priorStory.homeBase,
            mx75Granted: true,
          }
        : priorStory;
    }
    const [row] = await db
      .insert(salarymanSavesTable)
      .values({
        userId: req.user.id,
        slotIndex: slot,
        charName: String(charName).slice(0, 64).toUpperCase(),
        charClass: String(charClass).slice(0, 32).toLowerCase(),
        level: Number(level) || 1,
        salary: Number(salary) || 0,
        lastZone: String(lastZone || "MINX CITY").slice(0, 64),
        playtime: Number(playtime) || 0,
        data: data as Record<string, unknown>,
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [salarymanSavesTable.userId, salarymanSavesTable.slotIndex],
        set: {
          charName: String(charName).slice(0, 64).toUpperCase(),
          charClass: String(charClass).slice(0, 32).toLowerCase(),
          level: Number(level) || 1,
          salary: Number(salary) || 0,
          lastZone: String(lastZone || "MINX CITY").slice(0, 64),
          playtime: Number(playtime) || 0,
          data: data as Record<string, unknown>,
          lastSavedAt: new Date(),
        },
      })
      .returning();
    res.json({ ok: true, save: row });
  } catch (err: any) {
    console.error("[saves] upsert error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ── Story Mode: read current story state + eligibility for a save slot ──────
router.get("/salaryman/story/:slot", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const slot = parseInt(req.params.slot, 10);
  if (isNaN(slot) || slot < 0) {
    res.status(400).json({ error: "Invalid slot" });
    return;
  }
  try {
    const [save] = await db
      .select()
      .from(salarymanSavesTable)
      .where(and(eq(salarymanSavesTable.userId, req.user.id), eq(salarymanSavesTable.slotIndex, slot)))
      .limit(1);
    if (!save) {
      res.json({ story: { ...INACTIVE_STORY }, eligible: false, reason: "No save in this slot." });
      return;
    }
    const data = (save.data ?? {}) as Record<string, unknown>;
    const story = (data.story as StoryState | undefined) ?? { ...INACTIVE_STORY };
    const elig = await computeStoryEligibility(req.user.id, save.charName, data);
    res.json({ story, eligible: elig.eligible, reason: elig.reason });
  } catch (err: any) {
    console.error("[saves] story get error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ── Story Mode: begin the story (one-way, server-authorized commitment) ─────
router.post("/salaryman/story/:slot/begin", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const slot = parseInt(req.params.slot, 10);
  if (isNaN(slot) || slot < 0) {
    res.status(400).json({ error: "Invalid slot" });
    return;
  }
  try {
    const [save] = await db
      .select()
      .from(salarymanSavesTable)
      .where(and(eq(salarymanSavesTable.userId, req.user.id), eq(salarymanSavesTable.slotIndex, slot)))
      .limit(1);
    if (!save) {
      res.status(404).json({ error: "No save in this slot — play and save first." });
      return;
    }
    const data = (save.data ?? {}) as Record<string, unknown>;
    const existing = data.story as StoryState | undefined;
    // The story is a one-way door: once begun it never reverts.
    if (existing?.active) {
      res.json({ ok: true, story: existing, alreadyActive: true });
      return;
    }
    const elig = await computeStoryEligibility(req.user.id, save.charName, data);
    if (!elig.eligible) {
      res.status(403).json({ error: elig.reason, reason: elig.reason });
      return;
    }
    const story: StoryState = {
      active: true,
      startedAt: new Date().toISOString(),
      quarter: 1,
      chapter: 1,
      missionIndex: 0,
      homeBase: { ...STORY_HOME },
      mx75Granted: true,
      assignmentsCompleted: [],
    };
    data.story = story;
    await db
      .update(salarymanSavesTable)
      .set({ data, lastSavedAt: new Date() })
      .where(and(eq(salarymanSavesTable.userId, req.user.id), eq(salarymanSavesTable.slotIndex, slot)));
    res.json({ ok: true, story });
  } catch (err: any) {
    console.error("[saves] story begin error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/salaryman/saves/:slot", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const slot = parseInt(req.params.slot, 10);
  const tier = await getUserTier(req.user.id, req.user.email);
  const enterprise = await hasActiveEnterprise(req.user.id);
  const maxSlots = enterprise ? ENTERPRISE_MAX_SLOTS : tier === "pro" ? PRO_MAX_SLOTS : FREE_MAX_SLOTS;
  if (isNaN(slot) || slot < 0 || slot >= maxSlots) {
    res.status(400).json({ error: `Invalid slot (0-${maxSlots - 1})`, maxSlots, tier });
    return;
  }
  try {
    await db
      .delete(salarymanSavesTable)
      .where(
        and(
          eq(salarymanSavesTable.userId, req.user.id),
          eq(salarymanSavesTable.slotIndex, slot)
        )
      );
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[saves] delete error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
