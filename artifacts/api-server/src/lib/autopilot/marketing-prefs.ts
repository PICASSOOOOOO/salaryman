import {
  AUTOPILOT_MARKETING_TONES,
  AUTOPILOT_DEFAULT_MARKETING_TONE,
  AUTOPILOT_MAX_MARKETING_TOPICS,
  AUTOPILOT_MAX_MARKETING_TOPIC_LEN,
  type MarketingAutopilotPrefs,
} from "@workspace/db";
import { isSocialPlatform, type SocialPlatform } from "../social-service";

// ─── Marketing autopilot preferences ─────────────────────────────────────────
// Pure helpers (unit-tested) that normalize the owner-set marketing prefs stored
// in autopilot_configs.prefs. The route sanitizes before writing and the handler
// reads through the same shape, so what an owner sets is exactly what the bot
// uses — and any garbage in the jsonb degrades to today's defaults.

const TONES = AUTOPILOT_MARKETING_TONES as readonly string[];

/**
 * Coerce arbitrary input (a partial or full prefs object) into a valid,
 * fully-defaulted MarketingAutopilotPrefs:
 *   • platforms — only known social platforms, de-duped (empty = no restriction)
 *   • tone      — only an allowed tone, else the default
 *   • topics    — trimmed, non-empty, capped in count and length
 */
export function sanitizeMarketingPrefs(raw: unknown): MarketingAutopilotPrefs {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const platforms = Array.isArray(obj.platforms)
    ? Array.from(new Set(obj.platforms.filter(isSocialPlatform)))
    : [];

  const toneRaw = typeof obj.tone === "string" ? obj.tone.trim().toLowerCase() : "";
  const tone = TONES.includes(toneRaw) ? toneRaw : AUTOPILOT_DEFAULT_MARKETING_TONE;

  const topics = Array.isArray(obj.topics)
    ? obj.topics
        .map((t) => (typeof t === "string" ? t.trim() : ""))
        .filter((t) => t.length > 0)
        .slice(0, AUTOPILOT_MAX_MARKETING_TOPICS)
        .map((t) => t.slice(0, AUTOPILOT_MAX_MARKETING_TOPIC_LEN))
    : [];

  return { platforms, tone, topics };
}

/** Read normalized marketing prefs from a stored config's `prefs` jsonb. */
export function readMarketingPrefs(prefs: unknown): MarketingAutopilotPrefs {
  return sanitizeMarketingPrefs(prefs);
}

/**
 * Resolve which platforms the bot may post to this tick, honoring the owner's
 * allow-list when set:
 *   • allow-list set + connected ⇒ connected ∩ allowed (or the allow-list if the
 *     intersection is empty, so the restriction is still respected — simulated).
 *   • allow-list set + none connected ⇒ the allow-list (simulated posts).
 *   • no allow-list ⇒ connected accounts, else the evergreen default set.
 */
export function resolveMarketingTargets(
  connected: SocialPlatform[],
  allowed: SocialPlatform[],
  defaults: SocialPlatform[],
): SocialPlatform[] {
  if (allowed.length > 0) {
    if (connected.length > 0) {
      const intersection = connected.filter((p) => allowed.includes(p));
      return intersection.length > 0 ? intersection : allowed;
    }
    return allowed;
  }
  return connected.length > 0 ? connected : defaults;
}
