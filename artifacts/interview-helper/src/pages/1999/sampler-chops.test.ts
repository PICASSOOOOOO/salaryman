import { describe, expect, it } from "vitest";
import { createRegionSlices, findTransientSlices } from "./sampler-chops";

describe("1999 MPC sample slicing", () => {
  it("splits a selected range into exact, adjacent regions", () => {
    expect(createRegionSlices(0.2, 1, 4)).toEqual([
      { startSec: 0.2, endSec: 0.4 },
      { startSec: 0.4, endSec: 0.6000000000000001 },
      { startSec: 0.6000000000000001, endSec: 0.8 },
      { startSec: 0.8, endSec: 1 },
    ]);
  });

  it("finds strong onsets, orders slices, and respects the pad limit", () => {
    const samples = new Float32Array(4_000);
    for (const onset of [400, 1_200, 2_000, 2_800, 3_600]) {
      for (let frame = onset; frame < onset + 16; frame += 1) samples[frame] = 0.9;
    }

    const slices = findTransientSlices([samples], 4_000, 0, 1, 4, 35);

    expect(slices).toHaveLength(4);
    expect(slices[0].startSec).toBe(0);
    expect(slices.at(-1)?.endSec).toBe(1);
    expect(slices.every((slice, index) => (
      slice.endSec > slice.startSec
      && (index === 0 || slices[index - 1].endSec === slice.startSec)
    ))).toBe(true);
  });

  it("returns no transient slices for silence and rejects invalid ranges", () => {
    expect(findTransientSlices([new Float32Array(4_000)], 4_000, 0, 1, 8, 50)).toEqual([]);
    expect(() => createRegionSlices(0.5, 0.5, 4)).toThrow("Choose a sample range");
    expect(() => createRegionSlices(0, 1, 17)).toThrow("between 2 and 16");
  });
});
