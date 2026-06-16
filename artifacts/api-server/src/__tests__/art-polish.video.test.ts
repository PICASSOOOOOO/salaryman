import { describe, it, expect } from "vitest";
import { extractFalVideoUrl, falVideoUpscaleModel } from "../lib/fal";
import { isPolishOp, isVideoPolishOp, startVideoPolish } from "../lib/art-polish";

// Contract tests for the video-enhancement polish path. These are pure helpers
// (no DB / no network), proving the cinematic video upscale op is recognized and
// that a fal video-job payload's URL is extracted across the shapes fal returns.

describe("video polish op guards", () => {
  it("recognizes 'enhance' as a video polish op only", () => {
    expect(isVideoPolishOp("enhance")).toBe(true);
    expect(isVideoPolishOp("upscale")).toBe(false);
    expect(isVideoPolishOp("remove_bg")).toBe(false);
    expect(isVideoPolishOp("")).toBe(false);
    expect(isVideoPolishOp(null)).toBe(false);
  });

  it("keeps image ops and video ops disjoint", () => {
    // 'enhance' must NOT be accepted as an image op, and image ops must NOT be
    // accepted as the video op — the route branches on mediaType.
    expect(isPolishOp("enhance")).toBe(false);
    expect(isPolishOp("upscale")).toBe(true);
    expect(isPolishOp("remove_bg")).toBe(true);
  });
});

describe("extractFalVideoUrl", () => {
  it("pulls { video: { url } }", () => {
    expect(extractFalVideoUrl({ video: { url: "https://cdn.fal/x.mp4" } })).toBe(
      "https://cdn.fal/x.mp4",
    );
  });

  it("pulls { videos: [{ url }] }", () => {
    expect(extractFalVideoUrl({ videos: [{ url: "https://cdn.fal/y.webm" }] })).toBe(
      "https://cdn.fal/y.webm",
    );
  });

  it("pulls { video_url }", () => {
    expect(extractFalVideoUrl({ video_url: "https://cdn.fal/z.mov" })).toBe(
      "https://cdn.fal/z.mov",
    );
  });

  it("pulls a top-level { url } only when it looks like a video", () => {
    expect(extractFalVideoUrl({ url: "https://cdn.fal/clip.mp4" })).toBe(
      "https://cdn.fal/clip.mp4",
    );
    // A still image URL must NOT be mistaken for a video output.
    expect(extractFalVideoUrl({ url: "https://cdn.fal/frame.png" })).toBeNull();
  });

  it("walks nested payloads for a video URL", () => {
    expect(
      extractFalVideoUrl({ data: { output: { result: "https://cdn.fal/deep.m4v" } } }),
    ).toBe("https://cdn.fal/deep.m4v");
  });

  it("returns null when there is no video URL", () => {
    expect(extractFalVideoUrl(null)).toBeNull();
    expect(extractFalVideoUrl({})).toBeNull();
    expect(extractFalVideoUrl({ images: [{ url: "https://cdn.fal/a.png" }] })).toBeNull();
  });
});

describe("startVideoPolish guards", () => {
  it("rejects when FAL_KEY is not configured", async () => {
    const prev = process.env.FAL_KEY;
    delete process.env.FAL_KEY;
    await expect(startVideoPolish("enhance", "https://cdn.fal/clip.mp4")).rejects.toThrow(
      /not configured/i,
    );
    if (prev === undefined) delete process.env.FAL_KEY;
    else process.env.FAL_KEY = prev;
  });

  it("rejects when there is no source video URL (before any network call)", async () => {
    const prev = process.env.FAL_KEY;
    process.env.FAL_KEY = "test-key";
    await expect(startVideoPolish("enhance", "")).rejects.toThrow(/no source video/i);
    if (prev === undefined) delete process.env.FAL_KEY;
    else process.env.FAL_KEY = prev;
  });
});

describe("falVideoUpscaleModel", () => {
  it("falls back to a video-capable default and honors the env override", () => {
    const prev = process.env.FAL_VIDEO_UPSCALE_MODEL;
    delete process.env.FAL_VIDEO_UPSCALE_MODEL;
    expect(falVideoUpscaleModel()).toBe("fal-ai/topaz/upscale/video");
    process.env.FAL_VIDEO_UPSCALE_MODEL = "fal-ai/custom/video-sr";
    expect(falVideoUpscaleModel()).toBe("fal-ai/custom/video-sr");
    if (prev === undefined) delete process.env.FAL_VIDEO_UPSCALE_MODEL;
    else process.env.FAL_VIDEO_UPSCALE_MODEL = prev;
  });
});
