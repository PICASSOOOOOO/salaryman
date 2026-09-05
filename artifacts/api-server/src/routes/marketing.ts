import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, desc, sql } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { getOpenAiTextModel } from "../lib/openai-models";
import type { GptImageSize } from "@workspace/integrations-openai-ai-server/image";
import {
  db,
  botsTable,
  adCreativesTable,
  AD_PLATFORMS,
  type AdPlatform,
  type Bot,
} from "@workspace/db";
import {
  generateStudioImage,
  applyTaste,
  getBrandKit,
  buildBrandContext,
  saveImageToStorage,
} from "../lib/studio-gen";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return null;
  }
  const id = (req.user as { id: string } | undefined)?.id;
  if (!id) {
    res.status(401).json({ error: "Login required" });
    return null;
  }
  return id;
}

function isAdPlatform(value: unknown): value is AdPlatform {
  return typeof value === "string" && (AD_PLATFORMS as readonly string[]).includes(value);
}

const PLATFORM_LABEL: Record<AdPlatform, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
};

// Per-platform generated image aspect (Nano Banana/gpt-image sizes).
const PLATFORM_IMAGE_SIZE: Record<AdPlatform, GptImageSize> = {
  linkedin: "1536x1024",
  facebook: "1536x1024",
  instagram: "1024x1024",
  tiktok: "1024x1536",
};

// Human-friendly native ad dimension shown to the user.
const PLATFORM_DIMENSIONS: Record<AdPlatform, string> = {
  linkedin: "1200x627",
  facebook: "1200x628",
  instagram: "1080x1080",
  tiktok: "1080x1920",
};

// Platform-specific copy guidance the LLM tailors to.
const PLATFORM_COPY_GUIDE: Record<AdPlatform, string> = {
  linkedin:
    "LinkedIn sponsored content: professional, credible, value-led. Headline <= 70 chars, primaryText <= 600 chars, no hype-spam.",
  instagram:
    "Instagram feed ad: visual-first, punchy, lifestyle tone. Headline <= 40 chars, primaryText <= 125 chars before the fold, emoji ok.",
  facebook:
    "Facebook feed ad: conversational, benefit-driven, shareable. Headline <= 40 chars, primaryText <= 125 chars, friendly tone.",
  tiktok:
    "TikTok ad: native, fast, trend-aware, hook in first line. Headline <= 30 chars, primaryText <= 100 chars, casual/native voice.",
};

// A small dedicated marketing team, grouped by job (department = "marketing").
const MARKETING_TEAM_SEED: Array<Pick<Bot, "name" | "personality" | "collaborationRole">> = [
  {
    name: "Lana Reels",
    collaborationRole: "lead",
    personality: "Social ads team lead. Punchy, trend-aware, conversion-focused. Owns the campaign brief.",
  },
  {
    name: "Vance Pixel",
    collaborationRole: "designer",
    personality: "Ad visual designer. Bold, scroll-stopping art direction tuned to each platform.",
  },
  {
    name: "Mona Quill",
    collaborationRole: "copywriter",
    personality: "Ad copywriter. Crisp hooks, tight headlines, clear calls to action.",
  },
  {
    name: "Theo Trends",
    collaborationRole: "strategist",
    personality: "Platform strategist. Knows the difference between LinkedIn restraint and TikTok energy.",
  },
];

async function ensureMarketingTeam(userId: string): Promise<Bot[]> {
  const existing = await db
    .select()
    .from(botsTable)
    .where(and(eq(botsTable.ownerId, userId), eq(botsTable.department, "marketing")))
    .orderBy(botsTable.id);
  if (existing.length > 0) return existing;

  // Lazily seed the team once. A transaction-scoped advisory lock serializes
  // concurrent first-reads for this user so two requests can't both pass the
  // empty check and double-insert the team. The lock auto-releases at tx end.
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"marketing_team_seed:" + userId}))`);
    const again = await tx
      .select()
      .from(botsTable)
      .where(and(eq(botsTable.ownerId, userId), eq(botsTable.department, "marketing")))
      .orderBy(botsTable.id);
    if (again.length > 0) return again;

    await tx.insert(botsTable).values(
      MARKETING_TEAM_SEED.map((m) => ({
        ownerId: userId,
        name: m.name,
        personality: m.personality,
        department: "marketing",
        collaborationRole: m.collaborationRole,
        collaborationEnabled: true,
        status: "paused",
      })),
    );

    return tx
      .select()
      .from(botsTable)
      .where(and(eq(botsTable.ownerId, userId), eq(botsTable.department, "marketing")))
      .orderBy(botsTable.id);
  });
}

// GET /api/marketing/ad-bots — the user's marketing team (seeded on first read).
router.get("/marketing/ad-bots", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const team = await ensureMarketingTeam(userId);
    res.json({
      department: "marketing",
      bots: team.map((b) => ({
        id: b.id,
        name: b.name,
        role: b.collaborationRole,
        status: b.status,
        personality: b.personality,
      })),
    });
  } catch (err) {
    console.error("[Marketing] ad-bots error:", err);
    res.status(500).json({ error: "Failed to load marketing team" });
  }
});

interface GeneratedCopy {
  headline: string;
  primaryText: string;
  cta: string;
  hashtags: string[];
}

async function generateAdCopy(
  platform: AdPlatform,
  brief: string,
  brandCtx: string,
): Promise<GeneratedCopy> {
  const userPrompt = `Write a single high-performing ${PLATFORM_LABEL[platform]} ad for this product/offer.
${PLATFORM_COPY_GUIDE[platform]}

Brief from the marketer: ${brief}${brandCtx}

Return ONLY valid JSON (no markdown fences) with exactly these fields:
{
  "headline": string,
  "primaryText": string,
  "cta": string (max 5 words),
  "hashtags": string[] (5-8 items, no leading #)
}`;

  const response = await openai.chat.completions.create({
    model: getOpenAiTextModel(),
    max_completion_tokens: 1200,
    messages: [
      {
        role: "system",
        content:
          "You are an expert paid-social ad copywriter. You write tight, on-brand, platform-native ad copy that converts. Respond with valid JSON only — no markdown, no commentary.",
      },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = (response.choices[0]?.message?.content ?? "{}").trim();
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  let parsed: Partial<GeneratedCopy> = {};
  try {
    parsed = JSON.parse(cleaned) as Partial<GeneratedCopy>;
  } catch {
    parsed = { primaryText: cleaned };
  }

  return {
    headline: typeof parsed.headline === "string" ? parsed.headline : "",
    primaryText: typeof parsed.primaryText === "string" ? parsed.primaryText : "",
    cta: typeof parsed.cta === "string" ? parsed.cta : "",
    hashtags: Array.isArray(parsed.hashtags)
      ? parsed.hashtags.filter((h): h is string => typeof h === "string").map((h) => h.replace(/^#/, "")).slice(0, 8)
      : [],
  };
}

// POST /api/marketing/ads/generate — make a platform-correct ad creative.
router.post("/marketing/ads/generate", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { platform, brief, botId } = req.body as {
    platform?: string;
    brief?: string;
    botId?: number;
  };

  if (!isAdPlatform(platform)) {
    res.status(400).json({ error: "Valid platform required (linkedin, instagram, facebook, tiktok)" });
    return;
  }
  if (!brief?.trim()) {
    res.status(400).json({ error: "A brief describing the product or offer is required" });
    return;
  }

  // Validate the chosen bot belongs to this user (if provided).
  let bot: Bot | null = null;
  if (typeof botId === "number") {
    const [found] = await db
      .select()
      .from(botsTable)
      .where(and(eq(botsTable.id, botId), eq(botsTable.ownerId, userId)));
    bot = found ?? null;
    if (!bot) {
      res.status(404).json({ error: "Bot not found" });
      return;
    }
  }

  const cleanBrief = brief.trim().slice(0, 1000);

  // Mark the bot as actively working while it produces the ad.
  if (bot) {
    await db.update(botsTable).set({ status: "active" }).where(eq(botsTable.id, bot.id));
  }

  try {
    const kit = await getBrandKit(userId);
    const brandCtx = buildBrandContext(kit);

    const copy = await generateAdCopy(platform, cleanBrief, brandCtx);

    const brandTones = kit?.primaryColor
      ? `Use the brand palette (primary ${kit.primaryColor}${kit.secondaryColor ? `, secondary ${kit.secondaryColor}` : ""}).`
      : "";
    const imagePrompt = applyTaste(
      `A scroll-stopping ${PLATFORM_LABEL[platform]} advertisement visual for: ${cleanBrief}. ${brandTones} Designed as a paid-social ad creative with room for a short headline, modern and premium. Do NOT render any text, letters, or logos in the image.`,
    );

    let imageObjectPath: string | null = null;
    let imageFileId: number | null = null;
    try {
      const buffer = await generateStudioImage(imagePrompt, PLATFORM_IMAGE_SIZE[platform]);
      const saved = await saveImageToStorage(
        userId,
        buffer,
        `ad-${platform}-${Date.now()}.png`,
        "marketing-ad",
      );
      if (saved) {
        imageObjectPath = saved.objectPath;
        imageFileId = saved.fileId;
      }
    } catch (imgErr) {
      // Copy still succeeds even if the image generation fails.
      console.error("[Marketing] ad image generation failed:", imgErr);
    }

    const [record] = await db
      .insert(adCreativesTable)
      .values({
        ownerId: userId,
        orgId: bot?.orgId ?? null,
        botId: bot?.id ?? null,
        botName: bot?.name ?? null,
        platform,
        brief: cleanBrief,
        headline: copy.headline,
        primaryText: copy.primaryText,
        cta: copy.cta,
        hashtags: copy.hashtags,
        imageUrl: imageObjectPath,
        imageFileId,
        dimensions: PLATFORM_DIMENSIONS[platform],
        status: "ready",
      })
      .returning();

    res.json({ ad: record });
  } catch (err: unknown) {
    console.error("[Marketing] ad generation error:", err);
    const message = err instanceof Error ? err.message : "Failed to generate ad";
    res.status(500).json({ error: message });
  } finally {
    if (bot) {
      await db.update(botsTable).set({ status: "paused" }).where(eq(botsTable.id, bot.id));
    }
  }
});

// GET /api/marketing/ads — gallery of the user's generated ads.
router.get("/marketing/ads", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const ads = await db
      .select()
      .from(adCreativesTable)
      .where(eq(adCreativesTable.ownerId, userId))
      .orderBy(desc(adCreativesTable.createdAt))
      .limit(100);
    res.json({ ads });
  } catch (err) {
    console.error("[Marketing] list ads error:", err);
    res.status(500).json({ error: "Failed to load ads" });
  }
});

// DELETE /api/marketing/ads/:id
router.delete("/marketing/ads/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    const deleted = await db
      .delete(adCreativesTable)
      .where(and(eq(adCreativesTable.id, id), eq(adCreativesTable.ownerId, userId)))
      .returning({ id: adCreativesTable.id });
    if (deleted.length === 0) {
      res.status(404).json({ error: "Ad not found" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[Marketing] delete ad error:", err);
    res.status(500).json({ error: "Failed to delete ad" });
  }
});

export default router;
