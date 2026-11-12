import { describe, it, expect } from "vitest";
import {
  FACTION_DISTRICTS,
  factionFromValue,
  getFactionPropertyCatalog,
  getFactionOnboardingTiers,
  type Faction,
} from "./property-catalog";

const FACTIONS: Faction[] = ["suit", "nomad", "replicant"];

describe("factionFromValue", () => {
  it("passes through valid factions", () => {
    expect(factionFromValue("nomad")).toBe("nomad");
    expect(factionFromValue("replicant")).toBe("replicant");
    expect(factionFromValue("suit")).toBe("suit");
  });
  it("defaults garbage / missing values to the corporate baseline (suit)", () => {
    expect(factionFromValue(null)).toBe("suit");
    expect(factionFromValue(undefined)).toBe("suit");
    expect(factionFromValue("")).toBe("suit");
    expect(factionFromValue("megacorp")).toBe("suit");
    expect(factionFromValue(42)).toBe("suit");
  });
});

describe("FACTION_DISTRICTS", () => {
  it("gives every faction a distinct district + accent", () => {
    const districts = FACTIONS.map((f) => FACTION_DISTRICTS[f].district);
    const accents = FACTIONS.map((f) => FACTION_DISTRICTS[f].accent);
    expect(new Set(districts).size).toBe(3);
    expect(new Set(accents).size).toBe(3);
  });
});

describe("getFactionPropertyCatalog", () => {
  it("returns the same slot count (5 homes, 7 offices) for every faction", () => {
    for (const f of FACTIONS) {
      const { homes, offices } = getFactionPropertyCatalog(f);
      expect(homes).toHaveLength(5);
      expect(offices).toHaveLength(7);
    }
  });

  it("keeps artKeys, prices and stats identical across factions (server stays authoritative)", () => {
    const base = getFactionPropertyCatalog("suit");
    const baseAll = [...base.homes, ...base.offices];
    for (const f of FACTIONS) {
      const cat = getFactionPropertyCatalog(f);
      const all = [...cat.homes, ...cat.offices];
      expect(all.map((p) => p.artKey)).toEqual(baseAll.map((p) => p.artKey));
      all.forEach((p, i) => {
        expect(p.monthlyRent).toBe(baseAll[i].monthlyRent);
        expect(p.userLimit).toBe(baseAll[i].userLimit);
        expect(p.terminals).toBe(baseAll[i].terminals);
        expect(p.desks).toBe(baseAll[i].desks);
        expect(p.sqft).toBe(baseAll[i].sqft);
      });
    }
  });

  it("re-skins names so each faction sees a distinct catalog", () => {
    const suit = getFactionPropertyCatalog("suit");
    const nomad = getFactionPropertyCatalog("nomad");
    const replicant = getFactionPropertyCatalog("replicant");
    // Entry home reads differently per faction.
    const names = [suit.homes[0].name, nomad.homes[0].name, replicant.homes[0].name];
    expect(new Set(names).size).toBe(3);
    // Every template has non-empty copy + four perks.
    for (const f of FACTIONS) {
      const cat = getFactionPropertyCatalog(f);
      for (const p of [...cat.homes, ...cat.offices]) {
        expect(p.name.length).toBeGreaterThan(0);
        expect(p.blurb.length).toBeGreaterThan(0);
        expect(p.badge.length).toBeGreaterThan(0);
        expect(p.perks.length).toBe(4);
      }
    }
  });
});

describe("getFactionOnboardingTiers", () => {
  it("returns the four tiers in order with stable ids + prices across factions", () => {
    const expectedIds = ["capsule", "studio", "coworking", "suite"];
    const suit = getFactionOnboardingTiers("suit");
    expect(suit.map((t) => t.id)).toEqual(expectedIds);
    for (const f of FACTIONS) {
      const tiers = getFactionOnboardingTiers(f);
      expect(tiers.map((t) => t.id)).toEqual(expectedIds);
      tiers.forEach((t, i) => expect(t.price).toBe(suit[i].price));
    }
  });

  it("themes the labels per faction", () => {
    const labels = FACTIONS.map((f) => getFactionOnboardingTiers(f)[0].label);
    expect(new Set(labels).size).toBe(3);
  });
});
