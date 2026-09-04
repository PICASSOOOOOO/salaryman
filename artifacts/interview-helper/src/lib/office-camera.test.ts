import { describe, expect, it } from "vitest";
import { getOfficeCameraScale, LIVE_OFFICE_MIN_SCALE } from "./office-camera";

describe("office camera scale", () => {
  it("keeps live mode above the tighter detail minimum", () => {
    expect(getOfficeCameraScale({
      surveillance: false,
      viewportWidth: 320,
      viewportHeight: 420,
      floorWidthTiles: 33,
      floorHeightTiles: 24,
    })).toBe(LIVE_OFFICE_MIN_SCALE);
    expect(LIVE_OFFICE_MIN_SCALE).toBeGreaterThan(2.4);
  });

  it("still fits the entire floor in surveillance mode", () => {
    expect(getOfficeCameraScale({
      surveillance: true,
      viewportWidth: 1200,
      viewportHeight: 700,
      floorWidthTiles: 33,
      floorHeightTiles: 24,
    })).toBeCloseTo(700 / (24 * 16));
  });
});