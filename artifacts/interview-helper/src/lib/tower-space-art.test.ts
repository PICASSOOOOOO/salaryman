import { describe, expect, it } from "vitest";
import {
  getPublicFloorOfficeLayout,
  getRecreationOfficeLayout,
  getShadowTowerOfficeLayout,
} from "@/lib/office-property-layouts";
import { getTowerSpaceArtKind, getTowerSpaceArtUrlForLayout } from "@/lib/tower-space-art";

describe("Shadow Tower physical-space art", () => {
  it("assigns public and office floor families", () => {
    expect(getTowerSpaceArtKind(getRecreationOfficeLayout("minx_city"))).toBe("recreation");
    expect(getTowerSpaceArtKind(getPublicFloorOfficeLayout("minx_city", 2))).toBe("mezzanine");
    expect(getTowerSpaceArtKind(getPublicFloorOfficeLayout("minx_city", 3))).toBe("rest");
    expect(getTowerSpaceArtKind(getPublicFloorOfficeLayout("minx_city", 4))).toBe("security");
    expect(getTowerSpaceArtKind(getShadowTowerOfficeLayout("minx_city", 12, "founder_team"))).toBe("founder");
    const company = getShadowTowerOfficeLayout("minx_city", 12, "company");
    company.label = "CUSTOM TENANT NAME";
    expect(getTowerSpaceArtKind(company)).toBe("company");
  });

  it("reserves Shadow Corp art for the actual roofline", () => {
    expect(getTowerSpaceArtKind(getShadowTowerOfficeLayout("minx_city", 67, "company"))).toBe("shadow_corp");
    expect(getTowerSpaceArtKind(getShadowTowerOfficeLayout("minx_city", 66, "company"))).toBe("picasso");
  });

  it("resolves every numbered floor to a local environment asset", () => {
    for (let floor = 1; floor <= 67; floor += 1) {
      const layout = getShadowTowerOfficeLayout("minx_city", floor, "company");
      expect(getTowerSpaceArtUrlForLayout(layout)).toMatch(/shadow-tower\/spaces\/tower_space_.+\.jpg$/);
    }
  });
});