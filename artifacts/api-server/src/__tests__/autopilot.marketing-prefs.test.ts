import { describe, it, expect } from "vitest";
import {
  sanitizeMarketingPrefs,
  readMarketingPrefs,
  resolveMarketingTargets,
} from "../lib/autopilot/marketing-prefs";
import {
  AUTOPILOT_DEFAULT_MARKETING_TONE,
  AUTOPILOT_MAX_MARKETING_TOPICS,
  AUTOPILOT_MAX_MARKETING_TOPIC_LEN,
} from "@workspace/db";
import type { SocialPlatform } from "../lib/social-service";

// These pure helpers gate what the marketing autopilot bot actually does, so any
// garbage stored in autopilot_configs.prefs (or a malicious PUT body) must
// degrade to today's safe defaults — never crash the handler or post somewhere
// the owner didn't allow.

describe("sanitizeMarketingPrefs", () => {
  it("returns fully-defaulted prefs for empty / non-object input", () => {
    const expected = { platforms: [], tone: AUTOPILOT_DEFAULT_MARKETING_TONE, topics: [] };
    expect(sanitizeMarketingPrefs(undefined)).toEqual(expected);
    expect(sanitizeMarketingPrefs(null)).toEqual(expected);
    expect(sanitizeMarketingPrefs("nope")).toEqual(expected);
    expect(sanitizeMarketingPrefs(42)).toEqual(expected);
    expect(sanitizeMarketingPrefs({})).toEqual(expected);
  });

  it("keeps only known social platforms and de-dupes them", () => {
    const out = sanitizeMarketingPrefs({
      platforms: ["twitter", "linkedin", "twitter", "myspace", 7, null, "instagram"],
    });
    expect(out.platforms).toEqual(["twitter", "linkedin", "instagram"]);
  });

  it("accepts an allowed tone (case-insensitive) and rejects unknown ones", () => {
    expect(sanitizeMarketingPrefs({ tone: "Playful" }).tone).toBe("playful");
    expect(sanitizeMarketingPrefs({ tone: "  BOLD  " }).tone).toBe("bold");
    expect(sanitizeMarketingPrefs({ tone: "sarcastic" }).tone).toBe(AUTOPILOT_DEFAULT_MARKETING_TONE);
    expect(sanitizeMarketingPrefs({ tone: 5 }).tone).toBe(AUTOPILOT_DEFAULT_MARKETING_TONE);
  });

  it("trims topics, drops empties, and caps count + length", () => {
    const many = Array.from({ length: AUTOPILOT_MAX_MARKETING_TOPICS + 5 }, (_, i) => `topic ${i}`);
    const out = sanitizeMarketingPrefs({
      topics: ["  Summer sale  ", "", "   ", "New launch", 123, ...many],
    });
    expect(out.topics[0]).toBe("Summer sale");
    expect(out.topics[1]).toBe("New launch");
    expect(out.topics).toHaveLength(AUTOPILOT_MAX_MARKETING_TOPICS);
    expect(out.topics.every((t) => t.length > 0)).toBe(true);

    const long = "x".repeat(AUTOPILOT_MAX_MARKETING_TOPIC_LEN + 50);
    const capped = sanitizeMarketingPrefs({ topics: [long] });
    expect(capped.topics[0]).toHaveLength(AUTOPILOT_MAX_MARKETING_TOPIC_LEN);
  });

  it("readMarketingPrefs is sanitizeMarketingPrefs over a stored jsonb blob", () => {
    expect(readMarketingPrefs({ platforms: ["bluesky"], tone: "witty", topics: [" hi "] })).toEqual({
      platforms: ["bluesky"],
      tone: "witty",
      topics: ["hi"],
    });
  });
});

describe("resolveMarketingTargets", () => {
  const DEFAULTS: SocialPlatform[] = ["twitter", "linkedin", "instagram"];

  it("falls back to connected accounts when no allow-list is set", () => {
    expect(resolveMarketingTargets(["bluesky", "facebook"], [], DEFAULTS)).toEqual(["bluesky", "facebook"]);
  });

  it("falls back to the default set when nothing is connected and no allow-list", () => {
    expect(resolveMarketingTargets([], [], DEFAULTS)).toEqual(DEFAULTS);
  });

  it("intersects connected accounts with the allow-list when both exist", () => {
    expect(
      resolveMarketingTargets(["twitter", "linkedin", "bluesky"], ["linkedin", "bluesky"], DEFAULTS),
    ).toEqual(["linkedin", "bluesky"]);
  });

  it("respects the allow-list even when none of it is connected (simulated)", () => {
    expect(resolveMarketingTargets(["twitter"], ["tiktok", "youtube"], DEFAULTS)).toEqual([
      "tiktok",
      "youtube",
    ]);
  });

  it("uses the allow-list directly when nothing is connected", () => {
    expect(resolveMarketingTargets([], ["instagram"], DEFAULTS)).toEqual(["instagram"]);
  });
});
