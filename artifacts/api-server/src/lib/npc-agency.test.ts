import { describe, expect, it } from "vitest";
import {
  hasExplicitActionAccess,
  loyaltyOrderForBoss,
  validateNpcAgencySnapshot,
  type ExplicitActionGrant,
  type ShopLocationBoss,
} from "./npc-agency";

describe("NPC agency and explicit action access", () => {
  const npc = { id: "npc-boss-1", kind: "npc" as const };
  const grant: ExplicitActionGrant = {
    actor: npc,
    action: "calendar.create_event",
    resourceId: "calendar:org-17",
    dataScopes: ["team-calendar"],
  };

  it("requires an exact actor, action, resource, and data scope grant", () => {
    expect(hasExplicitActionAccess({
      actor: npc,
      action: "calendar.create_event",
      resourceId: "calendar:org-17",
      dataScope: "team-calendar",
    }, [grant])).toBe(true);
  });

  it("denies access by default and rejects mismatched scope or resource", () => {
    const request = {
      actor: npc,
      action: "calendar.create_event",
      resourceId: "calendar:org-17",
      dataScope: "payroll",
    };
    expect(hasExplicitActionAccess(request, [])).toBe(false);
    expect(hasExplicitActionAccess(request, [grant])).toBe(false);
    expect(hasExplicitActionAccess({
      ...request,
      dataScope: "team-calendar",
      resourceId: "calendar:org-18",
    }, [grant])).toBe(false);
  });

  it("treats humans and NPCs by the same grant rules", () => {
    expect(hasExplicitActionAccess({
      actor: { id: "human-1", kind: "human" },
      action: grant.action,
      resourceId: grant.resourceId,
      dataScope: "team-calendar",
    }, [grant])).toBe(false);

    const humanGrant = { ...grant, actor: { id: "human-1", kind: "human" as const } };
    expect(hasExplicitActionAccess({
      actor: humanGrant.actor,
      action: grant.action,
      resourceId: grant.resourceId,
      dataScope: "team-calendar",
    }, [humanGrant])).toBe(true);
  });

  it("rejects revoked and expired grants", () => {
    const request = {
      actor: npc,
      action: grant.action,
      resourceId: grant.resourceId,
      dataScope: "team-calendar",
    };
    expect(hasExplicitActionAccess(request, [{ ...grant, revokedAt: 1 }], 10)).toBe(false);
    expect(hasExplicitActionAccess(request, [{ ...grant, expiresAt: 10 }], 10)).toBe(false);
  });
});

describe("brand factions and shop-location bosses", () => {
  it("gives each location a distinct boss under one shared brand faction", () => {
    const bosses: ShopLocationBoss[] = [1, 2, 3].map((location) => ({
      id: `boss-${location}`,
      name: `Boss ${location}`,
      brandId: "brand-common-table",
      shopId: "common-table",
      locationId: `tower-floor-${location}`,
      netWorthFiat: location * 100_000,
    }));

    expect(new Set(bosses.map((boss) => boss.id)).size).toBe(3);
    expect(new Set(bosses.map((boss) => boss.brandId)).size).toBe(1);
    expect(bosses.map((boss) => loyaltyOrderForBoss(boss))).toEqual(
      bosses.map(() => [
        { level: "shop", id: "common-table" },
        { level: "brand", id: "brand-common-table" },
      ]),
    );
  });

  it("validates shared-brand references and one boss per physical location", () => {
    const brand = { id: "brand-common-table", name: "Common Table" };
    const bosses: ShopLocationBoss[] = [
      { id: "boss-a", name: "A", brandId: brand.id, shopId: "common-table", locationId: "floor-2-suite-1", netWorthFiat: 100 },
      { id: "boss-b", name: "B", brandId: brand.id, shopId: "common-table", locationId: "floor-5-suite-2", netWorthFiat: 200 },
    ];
    expect(validateNpcAgencySnapshot({ factions: [brand], bosses })).toEqual([]);
    expect(validateNpcAgencySnapshot({
      factions: [brand],
      bosses: [bosses[0], { ...bosses[1], locationId: bosses[0].locationId }],
    })).toContain("Duplicate boss location: floor-2-suite-1");
    expect(validateNpcAgencySnapshot({
      factions: [],
      bosses: [bosses[0]],
    })).toContain("Boss boss-a references an unknown brand");
  });
});
