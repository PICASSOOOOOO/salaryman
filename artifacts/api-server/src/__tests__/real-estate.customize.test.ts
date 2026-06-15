import { describe, it, expect } from "vitest";
import {
  planRenovation,
  sanitizeCustomization,
  TIER_LABOR_COST,
  type PropertyCustomizationDTO,
} from "../routes/real-estate";

// The /api/real-estate/customize endpoint spends ƒ ("renovation labor") to
// restyle an owned property. The cost / no-op / merge rules are extracted into
// the pure `planRenovation` + `sanitizeCustomization` helpers so the economy
// contract is testable without a DB. Pin them here.

describe("sanitizeCustomization", () => {
  it("accepts #rrggbb and lowercases it", () => {
    expect(sanitizeCustomization({ themeColor: "#38BDF8" })).toEqual({ themeColor: "#38bdf8" });
  });

  it("prefixes a bare 6-hex string with #", () => {
    expect(sanitizeCustomization({ themeColor: "FB9F24" })).toEqual({ themeColor: "#fb9f24" });
  });

  it("accepts an r,g,b triple and normalizes to rgb()", () => {
    expect(sanitizeCustomization({ themeColor: "56, 189, 248" })).toEqual({ themeColor: "rgb(56,189,248)" });
  });

  it("drops an out-of-range rgb triple", () => {
    expect(sanitizeCustomization({ themeColor: "999,0,0" })).toEqual({});
  });

  it("trims and clamps signage to 18 chars", () => {
    const out = sanitizeCustomization({ signage: "  PABLO CORP HEADQUARTERS  " });
    expect(out.signage).toBe("PABLO CORP HEADQUA"); // trimmed then 18-char slice
    expect(out.signage!.length).toBe(18);
  });

  it("only accepts known lighting values", () => {
    expect(sanitizeCustomization({ lighting: "dim" })).toEqual({ lighting: "dim" });
    expect(sanitizeCustomization({ lighting: "neon" })).toEqual({});
  });

  it("drops unknown / garbage fields entirely", () => {
    expect(sanitizeCustomization({ hax: true, themeColor: 123, signage: 9 })).toEqual({});
  });
});

describe("planRenovation cost + no-op rules", () => {
  const tiers = Object.keys(TIER_LABOR_COST) as (keyof typeof TIER_LABOR_COST)[];

  it("charges the full tier labor cost for a real change", () => {
    for (const tier of tiers) {
      const { changed, cost, next } = planRenovation({}, { signage: "HQ" }, tier);
      expect(changed).toBe(true);
      expect(cost).toBe(TIER_LABOR_COST[tier]);
      expect(next.signage).toBe("HQ");
    }
  });

  it("scales cost by tier (capsule cheapest, suite priciest)", () => {
    expect(TIER_LABOR_COST.capsule).toBeLessThan(TIER_LABOR_COST.studio);
    expect(TIER_LABOR_COST.studio).toBeLessThan(TIER_LABOR_COST.coworking);
    expect(TIER_LABOR_COST.coworking).toBeLessThan(TIER_LABOR_COST.suite);
  });

  it("is FREE (cost 0, changed false) when the patch matches the current state", () => {
    const prev: PropertyCustomizationDTO = { themeColor: "#38bdf8", signage: "HQ", lighting: "dim" };
    const { changed, cost, next } = planRenovation(prev, { themeColor: "#38bdf8", signage: "HQ", lighting: "dim" }, "suite");
    expect(changed).toBe(false);
    expect(cost).toBe(0);
    expect(next).toEqual(prev);
  });

  it("is FREE for an empty patch (nothing to do)", () => {
    const prev: PropertyCustomizationDTO = { signage: "HQ" };
    const { changed, cost } = planRenovation(prev, {}, "coworking");
    expect(changed).toBe(false);
    expect(cost).toBe(0);
  });

  it("merges a partial patch over the previous customization", () => {
    const prev: PropertyCustomizationDTO = { themeColor: "#38bdf8", signage: "OLD", lighting: "normal" };
    const { changed, cost, next } = planRenovation(prev, { signage: "NEW" }, "studio");
    expect(changed).toBe(true);
    expect(cost).toBe(TIER_LABOR_COST.studio);
    expect(next).toEqual({ themeColor: "#38bdf8", signage: "NEW", lighting: "normal" });
  });

  it("falls back to capsule cost for an unknown tier", () => {
    const { cost } = planRenovation({}, { signage: "X" }, "penthouse" as any);
    expect(cost).toBe(TIER_LABOR_COST.capsule);
  });
});
