import { describe, it, expect } from "vitest";
import { normalizeDogName } from "../routes/salaryman-saves";

// Dog companion names are globally unique. The save's PUT write path enforces
// this by comparing the incoming blob's ACTIVE dog name against other players'
// saves (case-insensitive). normalizeDogName is the shared extractor that both
// the conflict query and the transition guard rely on, so pin its contract:
// only an active, non-empty name reserves a slot, always trimmed + upper-cased.

describe("normalizeDogName", () => {
  it("returns the trimmed, upper-cased name for an active dog", () => {
    expect(normalizeDogName({ dogCompanion: { active: true, name: "  Rex  " } })).toBe("REX");
  });

  it("treats names case-insensitively (collapses to upper)", () => {
    expect(normalizeDogName({ dogCompanion: { active: true, name: "rex" } })).toBe(
      normalizeDogName({ dogCompanion: { active: true, name: "REX" } }),
    );
  });

  it("returns null when there is no dogCompanion (inactive saves never reserve a name)", () => {
    expect(normalizeDogName({})).toBeNull();
    expect(normalizeDogName(undefined)).toBeNull();
    expect(normalizeDogName(null)).toBeNull();
  });

  it("returns null for an inactive dog even if a stale name lingers", () => {
    expect(normalizeDogName({ dogCompanion: { active: false, name: "GHOST" } })).toBeNull();
  });

  it("returns null for an active dog with an empty / whitespace / missing name", () => {
    expect(normalizeDogName({ dogCompanion: { active: true, name: "" } })).toBeNull();
    expect(normalizeDogName({ dogCompanion: { active: true, name: "   " } })).toBeNull();
    expect(normalizeDogName({ dogCompanion: { active: true } })).toBeNull();
    expect(normalizeDogName({ dogCompanion: { active: true, name: 123 } })).toBeNull();
  });
});
