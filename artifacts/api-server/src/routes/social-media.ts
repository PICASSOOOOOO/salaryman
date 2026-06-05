import { Router, type Request, type Response } from "express";
import { eq, desc, and, sql, gte, lte } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { db, socialPostsTable, socialConnectionsTable } from "@workspace/db";
import { getProvider } from "../lib/social-providers";
import { hasFeature } from "../lib/plan";
import { requireFeature } from "../middlewares/requirePro";

const router = Router();

// AI copy generation calls OpenAI on the user's behalf, so it's a paid
// (PRIME / claw_bot) capability — same gate the studio tools use.
const requireClaw = requireFeature("claw_bot");

const PLATFORMS = ["twitter", "linkedin", "instagram", "facebook", "threads", "tiktok", "youtube", "bluesky"] as const;

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
    if (!platform || !PLATFORMS.includes(platform)) { res.status(400).json({ error: "Invalid platform" }); return; }
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
      if (!PLATFORMS.includes(req.body.platform)) { res.status(400).json({ error: "Invalid platform" }); return; }
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
    const [post] = await db.select().from(socialPostsTable).where(and(eq(socialPostsTable.id, id), eq(socialPostsTable.userId, userId)));
    if (!post) { res.status(404).json({ error: "Post not found" }); return; }

    const provider = getProvider(post.platform);
    const [conn] = await db.select().from(socialConnectionsTable).where(and(eq(socialConnectionsTable.userId, userId), eq(socialConnectionsTable.provider, post.platform)));

    // Real outbound posting is a PRIME (claw_bot) capability. A user who
    // connected while subscribed and later downgraded must NOT keep publishing
    // for real — fall through to the in-game simulation instead.
    const canPublishLive = await hasFeature(userId, req.user?.email, "claw_bot");

    // Real publish when PRIME + a live, connected account exists for this platform.
    if (canPublishLive && provider?.publish && conn && conn.status === "connected" && conn.credentials) {
      const result = await provider.publish(conn.credentials as Record<string, string>, {
        content: post.content || "",
        hashtags: (post.hashtags as string[]) || [],
        mediaUrls: (post.mediaUrls as string[]) || [],
      });
      if (!result.ok) {
        await db.update(socialConnectionsTable).set({ lastError: result.error ?? "Publish failed", updatedAt: new Date() }).where(eq(socialConnectionsTable.id, conn.id));
        res.status(502).json({ error: result.error || "Publish failed", platform: post.platform });
        return;
      }
      const [updated] = await db.update(socialPostsTable).set({ status: "published", publishedAt: new Date(), externalPostId: result.externalId ?? null, updatedAt: new Date() }).where(eq(socialPostsTable.id, id)).returning();
      res.json({ ...updated, simulated: false, url: result.url ?? null });
      return;
    }

    // No live connection — keep the in-game simulation but signal it so the
    // Command Center can nudge the user to connect this platform for real.
    const [updated] = await db.update(socialPostsTable).set({ status: "published", publishedAt: new Date(), updatedAt: new Date() }).where(eq(socialPostsTable.id, id)).returning();
    res.json({ ...updated, simulated: true, needsConnection: post.platform });
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
    const charLimits: Record<string, number> = { twitter: 280, threads: 500, linkedin: 3000, instagram: 2200, facebook: 5000, tiktok: 300, youtube: 5000, bluesky: 300 };
    const limit = charLimits[platform] || 1000;
    const toneStr = tone || "professional";
    const hashtagInstr = includeHashtags !== false ? "Include 3-5 relevant hashtags at the end." : "Do not include hashtags.";
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.8,
      messages: [
        { role: "system", content: `You are a social media copywriter. Write compelling ${platform} posts. Keep within ${limit} characters. Tone: ${toneStr}. ${hashtagInstr} Return ONLY the post text, nothing else.` },
        { role: "user", content: `Write a ${platform} post about: ${topic}` },
      ],
    });
    const generated = response.choices[0]?.message?.content?.trim() || "";
    const hashtagMatch = generated.match(/#\w+/g) || [];
    res.json({ content: generated, hashtags: hashtagMatch, platform });
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
      model: "gpt-4o-mini",
      temperature: 0.8,
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
