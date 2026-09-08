import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyArtFamily,
  listArtFamilies,
  SALARYMAN_ART_FAMILIES,
} from "../lib/art-families";

const assetRoot = path.resolve(process.cwd(), "../interview-helper/public/pixel-agents/assets");

function pngDimensions(relativePath: string): { width: number; height: number } {
  const file = readFileSync(path.join(assetRoot, relativePath));
  expect(file.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return {
    width: file.readUInt32BE(16),
    height: file.readUInt32BE(20),
  };
}

describe("SALARYMAN art-family matrix", () => {
  it("keeps every family tied to an art-dev tool, renderer, and review contract", () => {
    const families = listArtFamilies();
    expect(families.length).toBeGreaterThanOrEqual(8);
    for (const family of families) {
      expect(family.artDevTool).toBeTruthy();
      expect(family.productionRenderer).toBeTruthy();
      expect(family.sourceContract.length).toBeGreaterThan(10);
      expect(family.reviewChecklist.length).toBeGreaterThan(1);
    }
  });

  it("classifies representative catalog entries without changing their explicit renderer", () => {
    expect(classifyArtFamily({ key: "char_template_man_suit", category: "character" })).toBe("character_template");
    expect(classifyArtFamily({ key: "building_tower_iso", category: "building" })).toBe("spatial_landscape");
    expect(classifyArtFamily({ key: "prop_terminal_kiosk", category: "prop" })).toBe("spatial_object");
    expect(classifyArtFamily({ key: "ui_card_economy", category: "ui" })).toBe("ui_illustration");
    expect(SALARYMAN_ART_FAMILIES.character_template.productionRenderer).toBe("unreal");
  });

  it("protects the live pixel-office contracts used by Godot review and web rendering", () => {
    for (let index = 0; index < 6; index += 1) {
      expect(pngDimensions(`characters/char_${index}.png`)).toEqual({ width: 112, height: 96 });
    }
    for (let index = 0; index < 9; index += 1) {
      expect(pngDimensions(`floors/floor_${index}.png`)).toEqual({ width: 16, height: 16 });
    }
    expect(pngDimensions("walls/wall_0.png")).toEqual({ width: 64, height: 128 });
    expect(pngDimensions("furniture/BIN/BIN.png")).toEqual({ width: 16, height: 16 });
    expect(existsSync(path.join(assetRoot, "default-layout-1.json"))).toBe(true);
    expect(existsSync(path.join(assetRoot, "furniture-catalog.json"))).toBe(true);
  });
});