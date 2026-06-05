import { describe, it, expect } from "vitest";
import { normalizeCatName } from "../routes/salaryman-saves";

// Cat companion names are globally unique among cats (a separate namespace from
// dogs). The save's PUT write path enforces this by comparing the incoming
// blob's ACTIVE cat name against other players' saves (case-insensitive).
// normalizeCatName is the shared extractor that both the conflict query and the
// transition guard rely on, so pin its contract: only an active, non-empty name
// reserves a slot, always trimmed + upper-cased.

describe("normalizeCatName", () => {
  it("returns the trimmed, upper-cased name for an active cat", () => {
    expect(normalizeCatName({ catCompanion: { active: true, name: "  Whiskers  " } })).toBe("WHISKERS");
  });

  it("treats names case-insensitively (collapses to upper)", () => {
    expect(normalizeCatName({ catCompanion: { active: true, name: "mittens" } })).toBe(
      normalizeCatName({ catCompanion: { active: true, name: "MITTENS" } }),
    );
  });

  it("returns null when there is no catCompanion (inactive saves never reserve a name)", () => {
    expect(normalizeCatName({})).toBeNull();
    expect(normalizeCatName(undefined)).toBeNull();
    expect(normalizeCatName(null)).toBeNull();
  });

  it("returns null for an inactive cat even if a stale name lingers", () => {
    expect(normalizeCatName({ catCompanion: { active: false, name: "GHOST" } })).toBeNull();
  });

  it("returns null for an active cat with an empty / whitespace / missing name", () => {
    expect(normalizeCatName({ catCompanion: { active: true, name: "" } })).toBeNull();
    expect(normalizeCatName({ catCompanion: { active: true, name: "   " } })).toBeNull();
    expect(normalizeCatName({ catCompanion: { active: true } })).toBeNull();
    expect(normalizeCatName({ catCompanion: { active: true, name: 123 } })).toBeNull();
  });
});
