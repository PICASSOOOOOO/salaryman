import { Router, type Request, type Response } from "express";
import { eq, desc, and, sql, gte, lte } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { getOpenAiTextModel } from "../lib/openai-models";
import { db, socialPostsTable } from "@workspace/db";
import { generateSocialCopy, publishSocialPost, isSocialPlatform } from "../lib/social-service";
import { requireFeature } from "../middlewares/requirePro";

const router = Router();

// AI copy generation calls OpenAI on the user's behalf, so it's a paid
// (PRIME / claw_bot) capability — same gate the studio tools use.
const requireClaw = requireFeature("claw_bot");

function getAuthUserId(req: Request): string | null {
  return req.isAuthenticated?.() && req.user ? req.user.id : null;
}

router.get("/social/posts", async (req: Request, res: Response): Promise<void> => {
  const userId = getAuthUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const { platform, status } = req.query;
    let conditions = [eq(socialPostsTable.userId, userId)];
    if (platform && typeof platform === "string") conditions.push(eq(socialPostsTable.platform, platform));
    if (status && typeof status === "string") conditions.push(eq(socialPostsTable.status, status));
    const posts = await db.select().from(socialPostsTable).where(and(...conditions)).orderBy(desc(socialPostsTable.createdAt)).limit(200);
    res.json(posts);
  } catch (err: any) {
    console.error("[Social] list error:", err.message);
    res.status(500).json({ error: "Failed to load posts" });
  }
});

router.get("/social/posts/:id", async (req: Request, res: Response): Promise<void> => {
  const userId = getAuthUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [post] = await db.select().from(socialPostsTable).where(and(eq(socialPostsTable.id, Number(req.params.id)), eq(socialPostsTable.userId, userId)));
    if (!post) { res.status(404).json({ error: "Post not found" }); return; }
    res.json(post);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load post" });
  }
});

router.post("/social/posts", async (req: Request, res: Response): Promise<void> => {
  const userId = getAuthUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const { platform, content, hashtags, status, scheduledAt } = req.body;
    if (!platform || !isSocialPlatform(platform)) { res.status(400).json({ error: "Invalid platform" }); return; }
    const [post] = await db.insert(socialPostsTable).values({
      userId,
      platform,
      content: content || "",
      hashtags: hashtags || [],
      status: status || "draft",
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    }).returning();
    res.json(post);
  } catch (err: any) {
    console.error("[Social] create error:", err.message);
    res.status(500).json({ error: "Failed to create post" });
  }
});

router.patch("/social/posts/:id", async (req: Request, res: Response): Promise<void> => {
  const userId = getAuthUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(socialPostsTable).where(and(eq(socialPostsTable.id, id), eq(socialPostsTable.userId, userId)));
    if (!existing) { res.status(404).json({ error: "Post not found" }); return; }
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (req.body.content !== undefined) updates.content = req.body.content;
    if (req.body.hashtags !== undefined) updates.hashtags = req.body.hashtags;
    if (req.body.platform !== undefined) {
      if (!isSocialPlatform(req.body.platform)) { res.status(400).json({ error: "Invalid platform" }); return; }
      updates.platform = req.body.platform;
    }
    if (req.body.status !== undefined) updates.status = req.body.status;
    if (req.body.scheduledAt !== undefined) updates.scheduledAt = req.body.scheduledAt ? new Date(req.body.scheduledAt) : null;
    const [updated] = await db.update(socialPostsTable).set(updates).where(and(eq(socialPostsTable.id, id), eq(socialPostsTable.userId, userId))).returning();
    res.json(updated);
  } catch (err: any) {
    console.error("[Social] update error:", err.message);
    res.status(500).json({ error: "Failed to update post" });
  }
});

router.delete("/social/posts/:id", async (req: Request, res: Response): Promise<void> => {
  const userId = getAuthUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const id = Number(req.params.id);
    const [deleted] = await db.delete(socialPostsTable).where(and(eq(socialPostsTable.id, id), eq(socialPostsTable.userId, userId))).returning();
    if (!deleted) { res.status(404).json({ error: "Post not found" }); return; }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to delete post" });
  }
});

router.post("/social/posts/:id/publish", async (req: Request, res: Response): Promise<void> => {
  const userId = getAuthUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const id = Number(req.params.id);
    const result = await publishSocialPost({
      userId,
      email: req.user?.email,
      postId: id,
      orgId: (req as any).orgId ?? null,
    });
    if (!result.ok) {
      res.status(result.status).json({
        error: result.error,
        ...(result.platform ? { platform: result.platform } : {}),
        ...(result.needsConnection ? { needsConnection: result.needsConnection } : {}),
      });
      return;
    }
    res.json({
      ...result.post,
      simulated: result.simulated,
      ...(result.url !== undefined ? { url: result.url } : {}),
      ...(result.needsConnection ? { needsConnection: result.needsConnection } : {}),
    });
  } catch (err: any) {
    console.error("[Social] publish error:", err?.message);
    res.status(500).json({ error: "Failed to publish post" });
  }
});

router.post("/social/generate", requireClaw, async (req: Request, res: Response): Promise<void> => {
  const userId = getAuthUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const { platform, topic, tone, includeHashtags } = req.body;
    if (!platform || !topic) { res.status(400).json({ error: "Platform and topic are required" }); return; }
    const result = await generateSocialCopy({ platform, topic, tone, includeHashtags });
    res.json(result);
  } catch (err: any) {
    console.error("[Social] AI generate error:", err.message);
    res.status(500).json({ error: "Failed to generate content" });
  }
});

router.post("/social/generate-variants", requireClaw, async (req: Request, res: Response): Promise<void> => {
  const userId = getAuthUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const { content, platforms } = req.body;
    if (!content || !platforms?.length) { res.status(400).json({ error: "Content and platforms required" }); return; }
    const charLimits: Record<string, number> = { twitter: 280, threads: 500, linkedin: 3000, instagram: 2200, facebook: 5000, tiktok: 300, youtube: 5000, bluesky: 300 };
    const platformList = platforms.map((p: string) => `${p} (max ${charLimits[p] || 1000} chars)`).join(", ");
    const response = await openai.chat.completions.create({
      model: getOpenAiTextModel(),
      max_completion_tokens: 600,
      messages: [
        { role: "system", content: `You are a social media copywriter. Adapt the given content for multiple platforms. Return a JSON object where keys are platform names and values are the adapted post text. Include relevant hashtags. Return ONLY valid JSON.` },
        { role: "user", content: `Adapt this content for these platforms: ${platformList}\n\nOriginal content:\n${content}` },
      ],
    });
    const raw = response.choices[0]?.message?.content?.trim() || "{}";
    const cleaned = raw.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    const variants = JSON.parse(cleaned);
    res.json({ variants });
  } catch (err: any) {
    console.error("[Social] variants error:", err.message);
    res.status(500).json({ error: "Failed to generate variants" });
  }
});

router.get("/social/calendar", async (req: Request, res: Response): Promise<void> => {
  const userId = getAuthUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const { start, end } = req.query;
    const startDate = start ? new Date(start as string) : new Date(Date.now() - 30 * 86400000);
    const endDate = end ? new Date(end as string) : new Date(Date.now() + 30 * 86400000);
    const posts = await db.select().from(socialPostsTable).where(
      and(
        eq(socialPostsTable.userId, userId),
        gte(socialPostsTable.scheduledAt, startDate),
        lte(socialPostsTable.scheduledAt, endDate),
      )
    ).orderBy(socialPostsTable.scheduledAt);
    res.json(posts);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load calendar" });
  }
});

router.get("/social/stats", async (req: Request, res: Response): Promise<void> => {
  const userId = getAuthUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [result] = await db.select({
      total: sql<number>`count(*)`,
      published: sql<number>`count(*) filter (where ${socialPostsTable.status} = 'published')`,
      scheduled: sql<number>`count(*) filter (where ${socialPostsTable.status} = 'scheduled')`,
      drafts: sql<number>`count(*) filter (where ${socialPostsTable.status} = 'draft')`,
      totalImpressions: sql<number>`coalesce(sum(${socialPostsTable.impressions}), 0)`,
      totalEngagements: sql<number>`coalesce(sum(${socialPostsTable.engagements}), 0)`,
      totalClicks: sql<number>`coalesce(sum(${socialPostsTable.clicks}), 0)`,
    }).from(socialPostsTable).where(eq(socialPostsTable.userId, userId));
    const platformBreakdown = await db.select({
      platform: socialPostsTable.platform,
      count: sql<number>`count(*)`,
    }).from(socialPostsTable).where(eq(socialPostsTable.userId, userId)).groupBy(socialPostsTable.platform);
    res.json({ ...result, platformBreakdown });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load stats" });
  }
});

export default router;
