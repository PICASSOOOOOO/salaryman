// @vitest-environment node
//
// Unit tests for computeBoWarning — the Banco Ombra screen-edge warning
// indicator logic extracted from the WorldPlay canvas loop.
//
// Three scenarios the game must handle correctly:
//   1. Collector within 150 units outdoors  → warning fires
//   2. Player safely indoors (home)         → warning suppressed
//   3. Collectors list emptied              → warning clears
import { describe, it, expect } from "vitest";
import { computeBoWarning } from "./bo-collector-warning";

const noOffice = (_bid: string) => false;

describe("computeBoWarning", () => {
  it("warns when a collector is 140 units from the player (outdoor)", () => {
    const result = computeBoWarning(
      [{ x: 140, y: 0 }],
      0,
      0,
      null,
      "player_home",
      noOffice,
    );
    expect(result.shouldWarn).toBe(true);
    expect(result.nearDist).toBeCloseTo(140);
  });

  it("does NOT warn when player is inside their own home (hamletBuildingId match)", () => {
    const result = computeBoWarning(
      [{ x: 140, y: 0 }],
      0,
      0,
      { bid: "player_home" },
      "player_home",
      noOffice,
    );
    expect(result.shouldWarn).toBe(false);
  });

  it("does NOT warn when player is inside an office safe-zone", () => {
    const result = computeBoWarning(
      [{ x: 140, y: 0 }],
      0,
      0,
      { bid: "some_office_bid" },
      "player_home",
      (bid) => bid === "some_office_bid",
    );
    expect(result.shouldWarn).toBe(false);
  });

  it("clears when boCollectors is emptied", () => {
    const withCollector = computeBoWarning(
      [{ x: 100, y: 0 }],
      0,
      0,
      null,
      "player_home",
      noOffice,
    );
    expect(withCollector.shouldWarn).toBe(true);

    const cleared = computeBoWarning(
      [],
      0,
      0,
      null,
      "player_home",
      noOffice,
    );
    expect(cleared.shouldWarn).toBe(false);
    expect(cleared.nearDist).toBe(Infinity);
  });

  it("does NOT warn when collector is 150 units away (boundary — not less than)", () => {
    const result = computeBoWarning(
      [{ x: 150, y: 0 }],
      0,
      0,
      null,
      "player_home",
      noOffice,
    );
    expect(result.shouldWarn).toBe(false);
    expect(result.nearDist).toBeCloseTo(150);
  });

  it("picks the nearest collector when multiple are present", () => {
    const result = computeBoWarning(
      [
        { x: 200, y: 0 },
        { x: 100, y: 0 },
        { x: 300, y: 0 },
      ],
      0,
      0,
      null,
      "player_home",
      noOffice,
    );
    expect(result.shouldWarn).toBe(true);
    expect(result.nearDist).toBeCloseTo(100);
  });
});
