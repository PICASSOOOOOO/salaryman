import { afterEach, describe, expect, it, vi } from "vitest";
import { getArtQaRecipe, validateArtOutput } from "../lib/art-qa";

function png(width: number, height: number, colorType = 6): Uint8Array {
  const bytes = new Uint8Array(120_000);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[25] = colorType;
  return bytes;
}

function fakeImageResponse(bytes: Uint8Array) {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => bytes.buffer,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("art output QA", () => {
  it("passes a sufficiently large 2K transparent PNG prop", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeImageResponse(png(2048, 2048))));
    const result = await validateArtOutput(
      "https://cdn.example.com/prop.png",
      getArtQaRecipe("prop", "1:1"),
    );
    expect(result.state).toBe("technical_pass");
    expect(result.width).toBe(2048);
    expect(result.height).toBe(2048);
    expect(result.hasAlpha).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("requires review for an opaque JPEG cutout", async () => {
    const jpeg = new Uint8Array(120_000);
    jpeg.set([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70], 0);
    // SOF0 marker with a 2048×2048 frame.
    jpeg.set([0xff, 0xc0, 0, 17, 8, 8, 0, 8, 0, 8], 20);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeImageResponse(jpeg)));
    const result = await validateArtOutput(
      "https://cdn.example.com/character.jpg",
      getArtQaRecipe("character", "1:1"),
    );
    expect(result.state).toBe("needs_review");
    expect(result.hasAlpha).toBe(false);
    expect(result.reviewReasons.length).toBeGreaterThan(0);
  });

  it("fails an undersized output instead of marking it ready", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeImageResponse(png(512, 512))));
    const result = await validateArtOutput(
      "https://cdn.example.com/building.png",
      getArtQaRecipe("building", "1:1"),
    );
    expect(result.state).toBe("failed");
    expect(result.failures.some((failure) => failure.includes("minimum"))).toBe(true);
  });
});