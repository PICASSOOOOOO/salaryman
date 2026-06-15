import { describe, it, expect } from "vitest";
import { isImageServiceOutage } from "../lib/nano-banana";

describe("isImageServiceOutage", () => {
  it("flags an apipass 402 insufficient-credit thrown error as an outage", () => {
    const err = new Error("apipass /api/v1/jobs/createTask 402: Insufficient credit");
    expect(isImageServiceOutage(err)).toBe(true);
  });

  it("flags apipass 429 / 5xx wrapper statuses as outages", () => {
    expect(isImageServiceOutage("apipass /api/v1/jobs/createTask 429: rate limited")).toBe(true);
    expect(isImageServiceOutage("apipass /api/v1/jobs/recordInfo 503: upstream down")).toBe(true);
    expect(isImageServiceOutage("apipass /api/v1/jobs/createTask 502: bad gateway")).toBe(true);
  });

  it("flags credit/quota text signatures regardless of status wrapper", () => {
    expect(isImageServiceOutage("Insufficient credit")).toBe(true);
    expect(isImageServiceOutage("out of credit")).toBe(true);
    expect(isImageServiceOutage("quota exceeded")).toBe(true);
    expect(isImageServiceOutage("service temporarily unavailable")).toBe(true);
  });

  it("does NOT flag bad-photo / generic failures as outages", () => {
    expect(isImageServiceOutage(new Error("apipass /api/v1/jobs/createTask 400: invalid image"))).toBe(false);
    expect(isImageServiceOutage("could not detect a face in the photo")).toBe(false);
    expect(isImageServiceOutage("content policy violation")).toBe(false);
    expect(isImageServiceOutage("")).toBe(false);
  });

  it("handles null / undefined / non-string inputs safely", () => {
    expect(isImageServiceOutage(null)).toBe(false);
    expect(isImageServiceOutage(undefined)).toBe(false);
    expect(isImageServiceOutage(42)).toBe(false);
  });
});
