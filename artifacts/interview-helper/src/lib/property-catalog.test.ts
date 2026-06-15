import { describe, it, expect } from "vitest";
import {
  PROPERTY_TEMPLATES,
  REALTY_HOMES,
  REALTY_OFFICES,
  TIER_LABOR_COST,
  renovationLaborCost,
  renovationCrewDays,
  tierForArtKey,
  getTemplate,
  type PropertyTier,
} from "./property-catalog";

// The property ladder is the single source of truth shared by RealtyStore, the
// owned-office tier map, and (via pledgeSku) the Pledge Store. Pin its internal
// coherence so a future edit can't silently drift one view from another.

describe("property ladder integrity", () => {
  it("has unique artKeys across the whole ladder", () => {
    const keys = PROPERTY_TEMPLATES.map((p) => p.artKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("REALTY_HOMES / REALTY_OFFICES partition the realty templates by kind", () => {
    expect(REALTY_HOMES.length).toBeGreaterThan(0);
    expect(REALTY_OFFICES.length).toBeGreaterThan(0);
    expect(REALTY_HOMES.every((p) => p.kind === "home" && p.store === "realty")).toBe(true);
    expect(REALTY_OFFICES.every((p) => p.kind === "office" && p.store === "realty")).toBe(true);
  });

  it("every template has a valid tier and positive sqft", () => {
    const validTiers: PropertyTier[] = ["capsule", "studio", "coworking", "suite"];
    for (const p of PROPERTY_TEMPLATES) {
      expect(validTiers).toContain(p.tier);
      expect(p.sqft).toBeGreaterThan(0);
      expect(p.monthlyRent).toBeGreaterThanOrEqual(0);
    }
  });

  it("tierForArtKey resolves real keys and falls back to capsule for unknowns", () => {
    for (const p of PROPERTY_TEMPLATES) {
      expect(tierForArtKey(p.artKey)).toBe(p.tier);
    }
    expect(tierForArtKey("does_not_exist")).toBe("capsule");
  });

  it("getTemplate round-trips by artKey", () => {
    expect(getTemplate("property_loft")?.kind).toBe("home");
    expect(getTemplate("nope")).toBeUndefined();
  });
});

describe("renovation labor cost", () => {
  // The server mirrors these exact values in real-estate.ts (TIER_LABOR_COST).
  // If this changes, the server table MUST change in lockstep.
  it("matches the canonical tier cost table", () => {
    expect(TIER_LABOR_COST).toEqual({
      capsule: 2_000,
      studio: 6_000,
      coworking: 18_000,
      suite: 60_000,
    });
  });

  it("scales monotonically by tier", () => {
    expect(TIER_LABOR_COST.capsule).toBeLessThan(TIER_LABOR_COST.studio);
    expect(TIER_LABOR_COST.studio).toBeLessThan(TIER_LABOR_COST.coworking);
    expect(TIER_LABOR_COST.coworking).toBeLessThan(TIER_LABOR_COST.suite);
  });

  it("renovationLaborCost falls back to capsule for unknown tiers", () => {
    expect(renovationLaborCost("suite")).toBe(60_000);
    expect(renovationLaborCost("penthouse" as any)).toBe(2_000);
  });

  it("renovationCrewDays grows with tier", () => {
    expect(renovationCrewDays("capsule")).toBeLessThan(renovationCrewDays("suite"));
  });
});

describe("pledge coherence", () => {
  it("every pledgeSku points at a known pledge property id", () => {
    const known = new Set(["prop_corner_office", "prop_warehouse", "prop_penthouse"]);
    const linked = PROPERTY_TEMPLATES.filter((p) => p.pledgeSku);
    expect(linked.length).toBeGreaterThan(0);
    for (const p of linked) {
      expect(known.has(p.pledgeSku!)).toBe(true);
    }
  });

  it("only office templates carry a pledgeSku (homes are ƒ-only)", () => {
    for (const p of PROPERTY_TEMPLATES) {
      if (p.pledgeSku) expect(p.kind).toBe("office");
    }
  });
});
