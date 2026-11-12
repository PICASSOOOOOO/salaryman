import { and, eq, sql, inArray } from "drizzle-orm";
import {
  db,
  socialConnectionsTable,
  organizationsTable,
  autopilotActivityLogTable,
} from "@workspace/db";
import {
  generateSocialCopy,
  createSocialPost,
  publishSocialPost,
  getBridgedSocialPlatforms,
  isSocialPlatform,
  type SocialPlatform,
} from "../../social-service";
import type { GptImageSize } from "@workspace/integrations-openai-ai-server/image";
import { ObjectStorageService } from "../../objectStorage";
import { getBrandKit, buildBrandContext, generateStudioImage, applyTaste, saveImageToStorage } from "../../studio-gen";
import { chargeMarketingImageCredit } from "../guardrails";
import { isMarketingImageGenerationApproved, readMarketingPrefs, resolveMarketingTargets } from "../marketing-prefs";
import type { AutopilotContext, AutopilotHandler } from "../types";

// ─── Marketing autopilot handler ─────────────────────────────────────────────
// Pablo Prime drafts a social post and publishes it on the org's cadence,
// using the SAME services the manual Marketing Command Center screens call
// (generateSocialCopy → create draft → publishSocialPost). It never forks the
// logic or bypasses the PRIME gate:
//   • Content generation is the paid AI capability behind /social/generate
//     (PRIME / claw_bot). It is gated by ctx.ensureEntitlement() (mirrors the
//     manual route's requireClaw) AND ctx.ensureCredit() (Pablo-Tax preflight).
//   • Publishing reuses publishSocialPost(), whose own PRIME check posts for
//     real when the org is PRIME + connected, and otherwise FALLS THROUGH to
//     the in-game simulated post — exactly like the manual publish path.
// Every draft and publish (real or simulated) is recorded to the org's
// Autopilot Activity log, and the post lands in the same social posts list a
// human reviews. Turning the domain OFF returns Marketing to manual-only.

// When the org has no live connections we still draft + simulate-publish across
// a small evergreen rotation so the feed shows activity and nudges the user to
// connect a platform (parity with the manual simulated path).
const DEFAULT_PLATFORMS: SocialPlatform[] = ["twitter", "linkedin", "instagram"];
const IMAGE_SIZES: Partial<Record<SocialPlatform, GptImageSize>> = {
  facebook: "1536x1024",
  instagram: "1024x1024",
  threads: "1024x1024",
};
const VIDEO_ONLY_PLATFORMS: SocialPlatform[] = ["tiktok", "youtube"];

// Evergreen marketing angles the bot rotates through so successive posts vary.
const MARKETING_ANGLES = [
  "highlight a key product or service and the core benefit it delivers",
  "share a quick, genuinely useful tip your audience can act on today",
  "tell a short customer-success or behind-the-scenes story",
  "announce what's new or what the team is excited about right now",
  "ask an engaging question that invites the audience to reply",
];

/** Connected social platforms for the org owner (status = "connected"). */
async function getConnectedPlatforms(ownerId: string): Promise<SocialPlatform[]> {
  const rows = await db
    .select({ provider: socialConnectionsTable.provider })
    .from(socialConnectionsTable)
    .where(
      and(
        eq(socialConnectionsTable.userId, ownerId),
        eq(socialConnectionsTable.status, "connected"),
      ),
    );
  return rows.map((r) => r.provider).filter(isSocialPlatform);
}

/** Count prior attempts so skipped media-first posts still rotate to another platform. */
async function countCampaignAttempts(orgId: number): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(autopilotActivityLogTable)
    .where(and(
      eq(autopilotActivityLogTable.orgId, orgId),
      eq(autopilotActivityLogTable.domain, "marketing"),
      inArray(autopilotActivityLogTable.action, ["draft_post", "media_required_skip"]),
    ));
  return Number(row?.n ?? 0);
}

async function getOrgName(orgId: number): Promise<string> {
  const [org] = await db
    .select({ name: organizationsTable.name })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId));
  return org?.name ?? "our business";
}

function buildTopic(orgName: string, angle: string, brandCtx: string): string {
  return `Marketing post for ${orgName}: ${angle}.${brandCtx}`;
}

/**
 * Pick the post's angle for this tick. When the owner has supplied their own
 * topics/themes/campaigns the bot rotates through THOSE; otherwise it falls back
 * to the evergreen rotation. Deterministic on `rotation` so successive posts vary.
 */
function chooseAngle(topics: string[], rotation: number): string {
  if (topics.length > 0) {
    const theme = topics[rotation % topics.length];
    return `center the post on this theme/campaign: ${theme}`;
  }
  return MARKETING_ANGLES[rotation % MARKETING_ANGLES.length];
}

export const marketingAutopilotHandler: AutopilotHandler = async (ctx: AutopilotContext) => {
  // One post per tick keeps the cadence sensible and well within the per-tick
  // action cap. claimAction() also logs a "blocked" entry if the cap is spent.
  if (!ctx.claimAction()) return;

  // Content generation is paid AI behind the PRIME-gated /social/generate route.
  // Enforce the SAME gates the manual path does before spending anything.
  if (!(await ctx.ensureEntitlement())) return;

  // Owner-tunable marketing preferences (allowed platforms, tone, topics). An
  // org that never set any gets the same evergreen behavior as before.
  const prefs = readMarketingPrefs(ctx.config.prefs);
  const allowed = prefs.platforms.filter(isSocialPlatform);

  // Choose the target platform: honor the owner's platform allow-list when set,
  // otherwise rotate the connected accounts (or an evergreen default set).
  const [marketingConnected, bridgedConnected] = await Promise.all([
    getConnectedPlatforms(ctx.ownerId),
    getBridgedSocialPlatforms(ctx.ownerId, ctx.orgId),
  ]);
  const connected = Array.from(new Set([...marketingConnected, ...bridgedConnected]));
  const targets = resolveMarketingTargets(connected, allowed, DEFAULT_PLATFORMS);
  const rotation = await countCampaignAttempts(ctx.orgId);
  const platform = targets[rotation % targets.length];
  const imageGenerationEnabled = isMarketingImageGenerationApproved(prefs, ctx.ownerId);
  if (VIDEO_ONLY_PLATFORMS.includes(platform)) {
    await ctx.log({
      action: "media_required_skip",
      summary: `Skipped ${platform}: a campaign video must be attached before it can publish.`,
      outcome: "noop",
      detail: { platform, requiredMedia: "video" },
    });
    return;
  }
  if (platform === "instagram" && !imageGenerationEnabled) {
    await ctx.log({
      action: "media_required_skip",
      summary: "Skipped Instagram: enable owner-approved image generation or attach an image before publishing.",
      outcome: "noop",
      detail: { platform, requiredMedia: "image" },
    });
    return;
  }
  if (!(await ctx.ensureCredit())) return;

  const angle = chooseAngle(prefs.topics, rotation);

  // Ground the copy in the owner's brand kit + org name, same as the ad studio.
  const orgName = await getOrgName(ctx.orgId);
  const kit = await getBrandKit(ctx.ownerId).catch(() => null);
  const brandCtx = buildBrandContext(kit);
  const topic = buildTopic(orgName, angle, brandCtx);

  let content = "";
  let hashtags: string[] = [];
  try {
    const copy = await generateSocialCopy({ platform, topic, tone: prefs.tone });
    content = copy.content;
    hashtags = copy.hashtags;
  } catch (err) {
    await ctx.log({
      action: "generate_failed",
      summary: `Could not draft a ${platform} post — content generation failed.`,
      outcome: "error",
      detail: { platform, error: err instanceof Error ? err.message : "unknown" },
    });
    return;
  }

  if (!content.trim()) {
    await ctx.log({
      action: "generate_empty",
      summary: `Skipped a ${platform} post — the generator returned no copy.`,
      outcome: "noop",
      detail: { platform },
    });
    return;
  }

  const mediaUrls: string[] = [];
  const imageSize = IMAGE_SIZES[platform];
  if (imageGenerationEnabled && imageSize) {
    const credit = await chargeMarketingImageCredit(ctx.ownerId, ctx.ownerEmail);
    if (!credit.allowed) {
      await ctx.log({
        action: "image_generation_blocked",
        summary: "Skipped campaign image generation because the owner's image credit check did not pass.",
        outcome: "blocked",
        detail: { platform, reason: credit.reason ?? "unknown" },
      });
    } else {
      try {
        const imagePrompt = applyTaste(
          `Create one polished social campaign image for ${orgName}. Base the visual on this approved post copy: ${content.slice(0, 900)}. ${buildBrandContext(kit)} Create an original composition that supports the message. Do not include text, lettering, watermarks, or logos.`,
        );
        const image = await generateStudioImage(imagePrompt, imageSize);
        const saved = await saveImageToStorage(
          ctx.ownerId,
          image,
          `autopilot-${platform}-${Date.now()}.png`,
          "marketing-autopilot",
        );
        if (saved) {
          const publicUrl = await new ObjectStorageService().signDownloadURL(saved.objectPath, 86_400);
          mediaUrls.push(publicUrl);
        }
      } catch (error) {
        await ctx.log({
          action: "image_generation_failed",
          summary: `Could not prepare the ${platform} campaign image; no image was attached.`,
          outcome: "error",
          detail: { platform, error: error instanceof Error ? error.message : "unknown" },
        });
      }
    }
  }

  if (platform === "instagram" && mediaUrls.length === 0) {
    await ctx.log({
      action: "media_required_skip",
      summary: "Skipped Instagram because a publishable image was not available.",
      outcome: "noop",
      detail: { platform, requiredMedia: "image" },
    });
    return;
  }

  // Create the draft via the same table the manual "create post" screen writes,
  // so it appears in the human's posts list for review/edit/takeover.
  const draft = await createSocialPost(ctx.ownerId, {
    platform,
    content,
    hashtags,
    mediaUrls,
    status: "draft",
    aiGenerated: "yes",
  });

  await ctx.log({
    action: "draft_post",
    summary: `${ctx.assistantName} drafted a ${platform} post for ${orgName}.`,
    outcome: "success",
    detail: { postId: draft.id, platform },
  });

  // Publish through the shared service. Its own PRIME check posts for real when
  // the org is PRIME + connected, otherwise falls through to the simulated post.
  const result = await publishSocialPost({
    userId: ctx.ownerId,
    email: ctx.ownerEmail,
    postId: draft.id,
    orgId: ctx.orgId,
    liveOnly: true,
  });

  if (!result.ok) {
    await ctx.log({
      action: "publish_failed",
      summary: `Failed to publish the ${platform} post (${result.error}).`,
      outcome: "error",
      detail: { postId: draft.id, platform, error: result.error },
    });
    return;
  }

  if (result.simulated) {
    await ctx.log({
      action: "publish_simulated",
      summary: `Published a ${platform} post in-game (simulated) — connect ${platform} with PRIME to post for real.`,
      outcome: "success",
      detail: { postId: draft.id, platform, simulated: true, needsConnection: result.needsConnection },
    });
  } else {
    await ctx.log({
      action: "publish_live",
      summary: `${ctx.assistantName} published a ${platform} post live for ${orgName}.`,
      outcome: "success",
      detail: { postId: draft.id, platform, simulated: false, url: result.url ?? null },
    });
  }

};
