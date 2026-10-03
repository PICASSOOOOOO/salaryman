import { describe, expect, it } from "vitest";
import { readCreativeWorkPrefs, sanitizeCreativeWorkPrefs } from "../lib/autopilot/creative-prefs";

describe("sanitizeCreativeWorkPrefs", () => {
  it("defaults missing or malformed targets to no project", () => {
    for (const value of [undefined, null, [], "project", 8, {}]) {
      expect(sanitizeCreativeWorkPrefs(value)).toEqual({ projectId: null });
    }
    expect(sanitizeCreativeWorkPrefs({ projectId: 0 })).toEqual({ projectId: null });
    expect(sanitizeCreativeWorkPrefs({ projectId: "NaN" })).toEqual({ projectId: null });
    expect(sanitizeCreativeWorkPrefs({ projectId: 2.5 })).toEqual({ projectId: null });
  });

  it("accepts only positive integer project ids", () => {
    expect(sanitizeCreativeWorkPrefs({ projectId: 42 })).toEqual({ projectId: 42 });
    expect(sanitizeCreativeWorkPrefs({ projectId: "42" })).toEqual({ projectId: 42 });
  });

  it("reads stored JSON through the same sanitizer", () => {
    expect(readCreativeWorkPrefs({ projectId: "17" })).toEqual({ projectId: 17 });
  });
});