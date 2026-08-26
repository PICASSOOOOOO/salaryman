import { describe, expect, it } from "vitest";
import { crewAccentFor, NEON_NOIR_PALETTE, sceneGradeFor } from "./visual-grade";

describe("scene grades", () => {
  it("uses one restrained live palette", () => {
    const live = sceneGradeFor("live");
    expect(live.accent).toBe(NEON_NOIR_PALETTE.cyan);
    expect(live.secondary).toBe(NEON_NOIR_PALETTE.magenta);
    expect(live.wash).not.toContain("52,211,153");
  });

  it("reserves phosphor green for explicit CCTV", () => {
    const cctv = sceneGradeFor("cctv");
    expect(cctv.accent).toBe("#6ee7b7");
    expect(cctv.filter).toContain("hue-rotate(75deg)");
    expect(sceneGradeFor("live").filter).not.toContain("hue-rotate");
  });

  it("never uses phosphor green for live crew status", () => {
    expect(crewAccentFor("generic", true, "live")).toBe(NEON_NOIR_PALETTE.cyan);
    expect(crewAccentFor("pablo", true, "live")).toBe(NEON_NOIR_PALETTE.magenta);
    expect(crewAccentFor("generic", true, "cctv")).toBe(sceneGradeFor("cctv").accent);
  });
});