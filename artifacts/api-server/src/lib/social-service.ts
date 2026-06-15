// ─── Social post services ────────────────────────────────────────────────────
// Callable service functions behind the Marketing Command Center's social-post
// screens. The Express routes (routes/social-media.ts) AND the Marketing
// Autopilot handler both call these — never re-implementing the logic inline —
// so the manual and automated paths can never diverge (autopilot contract).

import { eq, and } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { db, socialPostsTable, socialConnectionsTable } from "@workspace/db";
import { getProvider } from "./social-providers";
import { hasFeature } from "./plan";

export type SocialPost = typeof socialPostsTable.$inferSelect;

export const SOCIAL_PLATFORMS = [
  "twitter",
  "linkedin",
  "instagram",
  "facebook",
  "threads",
  "tiktok",
  "youtube",
  "bluesky",
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export function isSocialPlatform(value: unknown): value is SocialPlatform {
  return typeof value === "string" && (SOCIAL_PLATFORMS as readonly string[]).includes(value);
}

const CHAR_LIMITS: Record<string, number> = {
  twitter: 280,
  threads: 500,
  linkedin: 3000,
  instagram: 2200,
  facebook: 5000,
  tiktok: 300,
  youtube: 5000,
  bluesky: 300,
};

export interface GenerateCopyInput {
  platform: string;
  topic: string;
  tone?: string;
  includeHashtags?: boolean;
}

export interface GeneratedSocialCopy {
  content: string;
  hashtags: string[];
  platform: string;
}

/**
 * AI-generate a single social post's copy for a platform. This is the paid AI
 * capability behind POST /social/generate — callers must enforce the same gate
 * the manual route does (PRIME / claw_bot) before invoking it.
 */
export async function generateSocialCopy(input: GenerateCopyInput): Promise<GeneratedSocialCopy> {
  const { platform, topic } = input;
  const limit = CHAR_LIMITS[platform] || 1000;
  const toneStr = input.tone || "professional";
  const hashtagInstr =
    input.includeHashtags !== false
      ? "Include 3-5 relevant hashtags at the end."
      : "Do not include hashtags.";
  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 600,
    reasoning_effort: "minimal",
    messages: [
      {
        role: "system",
        content: `You are a social media copywriter. Write compelling ${platform} posts. Keep within ${limit} characters. Tone: ${toneStr}. ${hashtagInstr} Return ONLY the post text, nothing else.`,
      },
      { role: "user", content: `Write a ${platform} post about: ${topic}` },
    ],
  });
  const generated = response.choices[0]?.message?.content?.trim() || "";
  const hashtags = generated.match(/#\w+/g) || [];
  return { content: generated, hashtags, platform };
}

export type PublishSocialPostResult =
  | {
      ok: true;
      post: SocialPost;
      simulated: boolean;
      url?: string | null;
      needsConnection?: string;
    }
  | { ok: false; status: number; error: string; platform?: string };

/**
 * Publish an existing draft/scheduled social post owned by `userId`.
 *
 * Real outbound posting is a PRIME (claw_bot) capability AND requires a live,
 * connected account for the platform. Otherwise this falls through to the
 * in-game simulation (status flips to "published" but nothing leaves the app)
 * and signals `needsConnection` so the UI can nudge the user to connect.
 *
 * Both routes/social-media.ts and the Marketing Autopilot call this so a bot
 * can never publish anything a human in the same seat couldn't.
 */
export async function publishSocialPost(opts: {
  userId: string;
  email?: string | null;
  postId: number;
}): Promise<PublishSocialPostResult> {
  const { userId, email, postId } = opts;
  const [post] = await db
    .select()
    .from(socialPostsTable)
    .where(and(eq(socialPostsTable.id, postId), eq(socialPostsTable.userId, userId)));
  if (!post) return { ok: false, status: 404, error: "Post not found" };

  const provider = getProvider(post.platform);
  const [conn] = await db
    .select()
    .from(socialConnectionsTable)
    .where(and(eq(socialConnectionsTable.userId, userId), eq(socialConnectionsTable.provider, post.platform)));

  // A user who connected while subscribed and later downgraded must NOT keep
  // publishing for real — fall through to the in-game simulation instead.
  const canPublishLive = await hasFeature(userId, email ?? undefined, "claw_bot");

  // Real publish when PRIME + a live, connected account exists for this platform.
  if (canPublishLive && provider?.publish && conn && conn.status === "connected" && conn.credentials) {
    const result = await provider.publish(conn.credentials as Record<string, string>, {
      content: post.content || "",
      hashtags: (post.hashtags as string[]) || [],
      mediaUrls: (post.mediaUrls as string[]) || [],
    });
    if (!result.ok) {
      await db
        .update(socialConnectionsTable)
        .set({ lastError: result.error ?? "Publish failed", updatedAt: new Date() })
        .where(eq(socialConnectionsTable.id, conn.id));
      return { ok: false, status: 502, error: result.error || "Publish failed", platform: post.platform };
    }
    const [updated] = await db
      .update(socialPostsTable)
      .set({
        status: "published",
        publishedAt: new Date(),
        externalPostId: result.externalId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(socialPostsTable.id, post.id))
      .returning();
    return { ok: true, post: updated, simulated: false, url: result.url ?? null };
  }

  // No live connection (or not PRIME) — keep the in-game simulation but signal
  // it so the Command Center can nudge the user to connect this platform.
  const [updated] = await db
    .update(socialPostsTable)
    .set({ status: "published", publishedAt: new Date(), updatedAt: new Date() })
    .where(eq(socialPostsTable.id, post.id))
    .returning();
  return { ok: true, post: updated, simulated: true, needsConnection: post.platform };
}
