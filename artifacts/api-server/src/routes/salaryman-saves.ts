import { Router, type IRouter } from "express";
import { db, salarymanSavesTable, organizationsTable, orgMembersTable, worldBusinessesTable, usersTable } from "@workspace/db";
import { eq, and, or, inArray } from "drizzle-orm";
import { getUserTier } from "../lib/plan";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { getObjectAclPolicy } from "../lib/objectAcl";
import { openai } from "@workspace/integrations-openai-ai-server";

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

export interface StoryState {
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
  // SCENE 1 mid-escape checkpoint (alley/battle milestones). Rides the story blob
  // so a reload during the breakout resumes; passes through the merge spread.
  scene1?: { alleyReached?: boolean; battleStarted?: boolean; battleDone?: boolean };
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
 * One-way story merge applied on every PUT save. The story is a
 * server-authoritative commitment: once `active` it must NEVER revert, even if a
 * stale/concurrent client save arrives without the flag (lost-update
 * protection). We read the committed (prior) story and merge it back over the
 * incoming blob.
 *
 * - If the prior story is NOT active, the incoming story passes through as-is.
 * - If the prior story IS active and the incoming one is also active, forward
 *   progress passes through (the `...incomingStory` spread — including any
 *   `scene1` mid-escape checkpoint), while the immutable commitment fields
 *   (`active`/`startedAt`/`homeBase`/`mx75Granted`) are pinned from the prior
 *   copy so they can't be downgraded.
 * - If the prior story is active but the incoming one is missing/inactive (a
 *   downgrade attempt), the prior story is kept wholesale.
 */
export function mergeStoryOnSave(
  priorStory: StoryState | undefined,
  incomingStory: StoryState | undefined,
): StoryState | undefined {
  if (!priorStory?.active) return incomingStory;
  return incomingStory?.active
    ? {
        ...incomingStory,
        active: true,
        startedAt: priorStory.startedAt,
        homeBase: priorStory.homeBase,
        mx75Granted: true,
      }
    : priorStory;
}

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
      incoming.story = mergeStoryOnSave(priorStory, incoming.story as StoryState | undefined);
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

// ── Photo → procedural pixel character (vision) ──────────────────────────────
// The player's avatar is a procedural paper-doll driven by an `Appearance` blob
// (stored in each save's data.appearance, the single client-side source of
// truth — see interview-helper/src/lib/character-identity.ts). This endpoint
// reads the user's uploaded profile photo, asks a vision model to map it onto
// the SAME constrained palettes the renderer understands, and returns a
// sanitized Appearance. The client applies it via the customizer and saves
// normally, so the server never owns the save blob. Palettes are mirrored from
// the client module; the client's sanitizeAppearance is the final authority.
const APP_SKIN_TONES = ['#f0d4b8','#e8c4a0','#d4a878','#c4956a','#b07848','#8a5a3a','#6a4028','#3e2616'];
const APP_HAIR_COLORS = ['#0a0a0a','#2a1808','#5a3a18','#7a3a18','#d4b070','#e8e4d8','#9a9a9a','#a83020','#c244aa','#2acccc','#56e8ff'];
const APP_OUTFIT_COLORS = ['#2e2e2e','#1e3055','#2a4a28','#7a6238','#7a3a18','#5a1a1a','#3a1a3a','#1a4a4a','#cfcabd','#38bdf8'];
const APP_HAIR_STYLES = ['short','long','mohawk','bun','bald','bowl'];
const APP_FACE_STYLES = ['plain','shades','scar','beard','visor','cyber'];
const APP_OUTFIT_STYLES = ['suit','hoodie','duster','jumpsuit','casual'];
const APP_GENDERS = ['m','f','nb'];

const APP_DEFAULT = {
  gender: 'nb',
  skinTone: '#d4a878',
  hairColor: '#0a0a0a',
  hairStyle: 'short',
  faceStyle: 'plain',
  outfitStyle: 'casual',
  outfitColor: '#2e2e2e',
};

function pickFrom(list: string[], val: unknown, fallback: string): string {
  return typeof val === 'string' && list.includes(val) ? val : fallback;
}

const APPEARANCE_VISION_PROMPT = `You are a character-creator that maps a real person's photo onto a retro pixel-art office avatar. Look at the photo and choose the CLOSEST option from each fixed list. Return ONLY a JSON object with these keys and no others:
- "gender": one of ${JSON.stringify(APP_GENDERS)} (m=masculine, f=feminine, nb=if unclear)
- "skinTone": the closest hex from ${JSON.stringify(APP_SKIN_TONES)} (lightest→darkest)
- "hairColor": the closest hex from ${JSON.stringify(APP_HAIR_COLORS)} (black, dark brown, brown, auburn, blonde, platinum, silver, red, magenta, cyan, electric blue)
- "hairStyle": one of ${JSON.stringify(APP_HAIR_STYLES)} (use "bald" if little/no visible hair)
- "faceStyle": one of ${JSON.stringify(APP_FACE_STYLES)} ("shades"=sunglasses, "beard"=facial hair, "scar"/"visor"/"cyber" only if clearly present, else "plain")
- "outfitStyle": one of ${JSON.stringify(APP_OUTFIT_STYLES)} (formal→"suit", casual→"casual", hooded→"hoodie")
- "outfitColor": the closest hex from ${JSON.stringify(APP_OUTFIT_COLORS)} to their clothing
Pick the single best match for each. Never invent values outside the lists.`;

// POST /salaryman/appearance/from-photo — derive an Appearance from the user's
// profile photo. Returns { appearance } for the client to apply + save.
router.post("/salaryman/appearance/from-photo", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const [u] = await db
      .select({ profileImageUrl: usersTable.profileImageUrl })
      .from(usersTable)
      .where(eq(usersTable.id, req.user.id))
      .limit(1);
    const photo = u?.profileImageUrl;
    if (!photo || !photo.startsWith("/objects/")) {
      res.status(400).json({ error: "Upload a profile photo first to generate your character." });
      return;
    }

    let dataUrl: string;
    try {
      const svc = new ObjectStorageService();
      const file = await svc.getObjectEntityFile(photo);
      // Defensive ownership guard. Avatar uploads in this project don't set an
      // ACL policy (object serving is path-protected, not ACL-gated), so the
      // default is allow-when-no-policy to match existing behavior. We only
      // refuse to process an object that carries an explicit policy owned by a
      // DIFFERENT user — never block the user's own (policy-less) avatar.
      const aclPolicy = await getObjectAclPolicy(file);
      if (aclPolicy && aclPolicy.visibility !== "public" && aclPolicy.owner && aclPolicy.owner !== req.user.id) {
        res.status(403).json({ error: "That photo isn't yours to use." });
        return;
      }
      const [buf] = await file.download();
      const [meta] = await file.getMetadata();
      const contentType = (meta.contentType as string) || "image/jpeg";
      dataUrl = `data:${contentType};base64,${buf.toString("base64")}`;
    } catch (err) {
      if (err instanceof ObjectNotFoundError) {
        res.status(404).json({ error: "Profile photo not found — re-upload it and try again." });
        return;
      }
      throw err;
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 2048,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: APPEARANCE_VISION_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Map this person to the pixel office avatar. Return only the JSON." },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    });

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    } catch {
      parsed = {};
    }

    const appearance = {
      gender: pickFrom(APP_GENDERS, parsed.gender, APP_DEFAULT.gender),
      skinTone: pickFrom(APP_SKIN_TONES, parsed.skinTone, APP_DEFAULT.skinTone),
      hairColor: pickFrom(APP_HAIR_COLORS, parsed.hairColor, APP_DEFAULT.hairColor),
      hairStyle: pickFrom(APP_HAIR_STYLES, parsed.hairStyle, APP_DEFAULT.hairStyle),
      faceStyle: pickFrom(APP_FACE_STYLES, parsed.faceStyle, APP_DEFAULT.faceStyle),
      outfitStyle: pickFrom(APP_OUTFIT_STYLES, parsed.outfitStyle, APP_DEFAULT.outfitStyle),
      outfitColor: pickFrom(APP_OUTFIT_COLORS, parsed.outfitColor, APP_DEFAULT.outfitColor),
    };

    res.json({ appearance });
  } catch (err: any) {
    console.error("[appearance/from-photo] error:", err?.message ?? err);
    res.status(500).json({ error: "Couldn't generate your character right now. Try again." });
  }
});

export default router;
