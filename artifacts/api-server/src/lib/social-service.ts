// ─── Social post services ────────────────────────────────────────────────────
// Callable service functions behind the Marketing Command Center's social-post
// screens. The Express routes (routes/social-media.ts) AND the Marketing
// Autopilot handler both call these — never re-implementing the logic inline —
// so the manual and automated paths can never diverge (autopilot contract).

import { eq, and, inArray } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { getOpenAiTextModel } from "./openai-models";
import {
  db,
  socialPostsTable,
  socialConnectionsTable,
  platformConnectedAppsTable,
} from "@workspace/db";
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
    model: getOpenAiTextModel(),
    max_completion_tokens: 600,
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
  | { ok: false; status: number; error: string; platform?: string; needsConnection?: string };

/**
 * Platform Connections uses generic catalog slugs, while the Marketing
 * providers use their publishing ids. Keep this mapping explicit: a catalog
 * credential is never treated as a social credential just because the names
 * happen to look similar.
 */
const PLATFORM_APP_SLUGS: Partial<Record<SocialPlatform, string>> = {
  twitter: "x-twitter",
  linkedin: "linkedin",
  instagram: "instagram",
  facebook: "facebook",
  threads: "threads",
  tiktok: "tiktok",
  youtube: "youtube",
  bluesky: "bluesky",
};

type PlatformConnectionBridge =
  | { kind: "none" }
  | { kind: "usable"; credentials: Record<string, string> }
  | { kind: "oauth_required" };

function hasCredentialValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasAuthCredentialValue(credentials: Record<string, unknown>): boolean {
  return ["apiKey", "login", "password"].some((key) => hasCredentialValue(credentials[key]));
}

function connectionCredentialValues(row: typeof platformConnectedAppsTable.$inferSelect): Record<string, unknown> {
  const config = row.config && typeof row.config === "object"
    ? row.config as Record<string, unknown>
    : {};
  return config.credentials && typeof config.credentials === "object"
    ? config.credentials as Record<string, unknown>
    : {};
}

/**
 * Read the private Platform Connections credential only at publish time.
 * Bluesky is the only supported username/password publishing path. OAuth
 * catalog entries are returned as an explicit block so callers never turn
 * them into a fake successful post.
 */
async function resolvePlatformConnectionBridge(
  userId: string,
  platform: string,
  orgId?: number | string | null,
): Promise<PlatformConnectionBridge> {
  if (!isSocialPlatform(platform)) return { kind: "none" };
  const appSlug = PLATFORM_APP_SLUGS[platform];
  if (!appSlug) return { kind: "none" };

  const orgIds = [userId, orgId == null ? null : String(orgId)].filter(
    (id): id is string => Boolean(id),
  );
  const rows = await db
    .select()
    .from(platformConnectedAppsTable)
    .where(and(
      eq(platformConnectedAppsTable.appSlug, appSlug),
      eq(platformConnectedAppsTable.status, "connected"),
      inArray(platformConnectedAppsTable.orgId, orgIds),
    ));

  // Prefer the active org's entry over the personal fallback when both exist.
  const row = rows.find((candidate) => orgId != null && candidate.orgId === String(orgId)) ?? rows[0];
  if (!row) return { kind: "none" };

  const credentials = connectionCredentialValues(row);
  if (platform === "bluesky") {
    const identifier = credentials.login;
    const appPassword = credentials.password;
    if (hasCredentialValue(identifier) && hasCredentialValue(appPassword)) {
      return {
        kind: "usable",
        credentials: { identifier: identifier.trim(), appPassword: appPassword.trim() },
      };
    }
    return { kind: "none" };
  }

  // The remaining mapped social APIs require OAuth-issued tokens. Even if a
  // user saved generic login/password fields, do not claim that a post was sent.
  if (Object.values(credentials).some(hasCredentialValue)) return { kind: "oauth_required" };
  return { kind: "none" };
}

/**
 * Return configured catalog platforms without returning their credentials.
 * Marketing Autopilot uses this to choose targets, while publishSocialPost
 * resolves the private credential again immediately before posting.
 */
export async function getBridgedSocialPlatforms(
  userId: string,
  orgId?: number | string | null,
): Promise<SocialPlatform[]> {
  const orgIds = [userId, orgId == null ? null : String(orgId)].filter(
    (id): id is string => Boolean(id),
  );
  if (orgIds.length === 0) return [];
  const rows = await db
    .select({ appSlug: platformConnectedAppsTable.appSlug, config: platformConnectedAppsTable.config })
    .from(platformConnectedAppsTable)
    .where(and(
      eq(platformConnectedAppsTable.status, "connected"),
      inArray(platformConnectedAppsTable.orgId, orgIds),
    ));
  const appSlugToPlatform = new Map(
    Object.entries(PLATFORM_APP_SLUGS).map(([platform, slug]) => [slug, platform as SocialPlatform]),
  );
  return Array.from(new Set(
    rows
      .map((row) => {
        const platform = appSlugToPlatform.get(row.appSlug);
        const creds = row.config && typeof row.config === "object"
          ? (row.config as Record<string, unknown>).credentials
          : null;
        if (!platform || !creds || typeof creds !== "object") return null;
        const values = creds as Record<string, unknown>;
        const hasCredential = platform === "bluesky"
          ? hasCredentialValue(values.login) && hasCredentialValue(values.password)
          : hasAuthCredentialValue(values);
        return hasCredential ? platform : null;
      })
      .filter((platform): platform is SocialPlatform => Boolean(platform)),
  ));
}

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
  /** Active org whose Platform Connections should be considered first. */
  orgId?: number | string | null;
}): Promise<PublishSocialPostResult> {
  const { userId, email, postId, orgId } = opts;
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

  // Real publish when PRIME + a live, connected Marketing account exists.
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

  if (canPublishLive && (!conn || conn.status !== "connected")) {
    const bridge = await resolvePlatformConnectionBridge(userId, post.platform, orgId);
    if (bridge.kind === "oauth_required") {
      return {
        ok: false,
        status: 409,
        error: `${provider?.label ?? post.platform} requires an OAuth connection before it can post. Connect it in the Marketing Command Center.`,
        platform: post.platform,
        needsConnection: post.platform,
      };
    }

    if (bridge.kind === "usable" && provider?.publish) {
      const result = await provider.publish(bridge.credentials, {
        content: post.content || "",
        hashtags: (post.hashtags as string[]) || [],
        mediaUrls: (post.mediaUrls as string[]) || [],
      });
      if (!result.ok) {
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
