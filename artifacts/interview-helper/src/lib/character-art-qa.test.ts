import { describe, expect, it } from "vitest";
import { summarizeCharacterArtQa } from "./character-art-qa";

describe("named character art QA summary", () => {
  it("counts only character assets and blocks promotion until all are ready", () => {
    expect(summarizeCharacterArtQa([
      { category: "character", status: "ready" },
      { category: "character", status: "pending" },
      { category: "scene", status: "failed" },
    ])).toEqual({
      expected: 2,
      ready: 1,
      pending: 1,
      failed: 0,
      unclassified: 0,
      releaseReady: false,
    });
  });

  it("does not report an empty character library as release-ready", () => {
    expect(summarizeCharacterArtQa([]).releaseReady).toBe(false);
  });

  it("marks a fully ready character library as release-ready", () => {
    expect(summarizeCharacterArtQa([
      { category: "character", status: "ready" },
      { category: "character", status: "ready" },
    ]).releaseReady).toBe(true);
  });
});
