import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isUnrealConfigured,
  isUnrealOutage,
  toUnrealJobType,
  extractUnrealUrls,
  resolveMediaType,
  unrealSubmit,
  unrealPoll,
  runUnrealJob,
} from "../lib/unreal-render";
import { unrealProvider } from "../lib/art-providers/unreal-provider";
import { getProvider, DEFAULT_PROVIDER_ID, listProviderSummaries } from "../lib/art-providers";

const URL = "https://render.example.test";
const KEY = "secret-token";

/** Build a fetch mock that maps "METHOD path" → a response body (or function). */
function mockFetch(routes: Record<string, any>) {
  return vi.fn(async (input: any, init: any = {}) => {
    const url = String(input);
    const method = (init?.method || "GET").toUpperCase();
    // Match by suffix so absolute base URL prefixes don't matter.
    const key = Object.keys(routes).find((r) => {
      const [m, p] = r.split(" ");
      return m === method && url.endsWith(p);
    });
    const entry = key ? routes[key] : undefined;
    if (!entry) {
      return { ok: false, status: 404, statusText: "not found", text: async () => JSON.stringify({ error: "no route" }) } as any;
    }
    const resolved = typeof entry === "function" ? entry(url, init) : entry;
    const status = resolved.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: resolved.statusText ?? "",
      text: async () => (resolved.body == null ? "" : JSON.stringify(resolved.body)),
    } as any;
  });
}

describe("unreal-render: config + pure helpers", () => {
  const ORIG = { ...process.env };
  afterEach(() => {
    process.env = { ...ORIG };
    vi.restoreAllMocks();
  });

  it("isUnrealConfigured tracks UNREAL_RENDER_URL", () => {
    delete process.env.UNREAL_RENDER_URL;
    expect(isUnrealConfigured()).toBe(false);
    process.env.UNREAL_RENDER_URL = URL;
    expect(isUnrealConfigured()).toBe(true);
  });

  it("toUnrealJobType coerces to the allowed set", () => {
    expect(toUnrealJobType("landscape")).toBe("landscape");
    expect(toUnrealJobType("cinematic")).toBe("cinematic");
    expect(toUnrealJobType("object")).toBe("object");
    expect(toUnrealJobType("garbage")).toBe("object");
    expect(toUnrealJobType(undefined)).toBe("object");
    expect(toUnrealJobType(null)).toBe("object");
  });

  it("extractUnrealUrls handles every accepted shape", () => {
    expect(extractUnrealUrls({ resultUrls: ["https://a/x.png", "https://a/y.png"] })).toEqual([
      "https://a/x.png",
      "https://a/y.png",
    ]);
    expect(extractUnrealUrls({ videoUrl: "https://a/clip.mp4" })).toEqual(["https://a/clip.mp4"]);
    expect(extractUnrealUrls({ imageUrl: "https://a/i.jpg" })).toEqual(["https://a/i.jpg"]);
    expect(extractUnrealUrls({ url: "https://a/u.webp" })).toEqual(["https://a/u.webp"]);
    // Last-resort walk finds nested media URLs.
    expect(extractUnrealUrls({ data: { out: { file: "https://a/deep.png" } } })).toEqual([
      "https://a/deep.png",
    ]);
    expect(extractUnrealUrls({})).toEqual([]);
    expect(extractUnrealUrls(null)).toEqual([]);
  });

  it("resolveMediaType prefers explicit, then URL ext, then jobType", () => {
    expect(resolveMediaType("video", "object", "https://a/x.png")).toBe("video");
    expect(resolveMediaType("image", "cinematic", "https://a/x.mp4")).toBe("image");
    expect(resolveMediaType(undefined, "object", "https://a/x.mp4")).toBe("video");
    expect(resolveMediaType(undefined, "object", "https://a/x.png")).toBe("image");
    expect(resolveMediaType(undefined, "cinematic", undefined)).toBe("video");
    expect(resolveMediaType(undefined, "object", undefined)).toBe("image");
  });

  it("isUnrealOutage flags node/service failures, not bad prompts", () => {
    expect(isUnrealOutage("unreal 503: service unavailable")).toBe(true);
    expect(isUnrealOutage("unreal 429: rate limited")).toBe(true);
    expect(isUnrealOutage(new Error("unreal 502: bad gateway"))).toBe(true);
    expect(isUnrealOutage("connect ECONNREFUSED 1.2.3.4:443")).toBe(true);
    expect(isUnrealOutage("gpu busy, try later")).toBe(true);
    expect(isUnrealOutage("node offline")).toBe(true);
    expect(isUnrealOutage("unreal 400: invalid prompt")).toBe(false);
    expect(isUnrealOutage("")).toBe(false);
    expect(isUnrealOutage(null)).toBe(false);
  });
});

describe("unreal-render: submit + poll over HTTP (mocked)", () => {
  const ORIG = { ...process.env };
  beforeEach(() => {
    process.env.UNREAL_RENDER_URL = URL;
    process.env.UNREAL_RENDER_KEY = KEY;
  });
  afterEach(() => {
    process.env = { ...ORIG };
    vi.restoreAllMocks();
  });

  it("submit sends the bearer token + job body and returns the jobId", async () => {
    const fetchMock = mockFetch({ "POST /render": { body: { jobId: "job-1" } } });
    vi.stubGlobal("fetch", fetchMock);

    const out = await unrealSubmit({ prompt: "p", aspectRatio: "16:9", jobType: "cinematic", key: "scene_x" });
    expect(out.jobId).toBe("job-1");

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ prompt: "p", aspectRatio: "16:9", jobType: "cinematic", key: "scene_x" });
  });

  it("submit accepts job_id / id aliases and throws when missing", async () => {
    vi.stubGlobal("fetch", mockFetch({ "POST /render": { body: { job_id: "j2" } } }));
    expect((await unrealSubmit({ prompt: "p", aspectRatio: "1:1" })).jobId).toBe("j2");

    vi.stubGlobal("fetch", mockFetch({ "POST /render": { body: { nope: true } } }));
    await expect(unrealSubmit({ prompt: "p", aspectRatio: "1:1" })).rejects.toThrow(/missing jobId/);
  });

  it("poll returns pending while rendering and ready (image) on completion", async () => {
    vi.stubGlobal("fetch", mockFetch({ "GET /render/job-1": { body: { status: "rendering" } } }));
    expect((await unrealPoll({ jobId: "job-1", jobType: "object" })).state).toBe("pending");

    vi.stubGlobal(
      "fetch",
      mockFetch({ "GET /render/job-1": { body: { status: "completed", resultUrls: ["https://cdn/out.png"] } } }),
    );
    const ready = await unrealPoll({ jobId: "job-1", jobType: "object" });
    expect(ready.state).toBe("ready");
    expect(ready.url).toBe("https://cdn/out.png");
    expect(ready.mediaType).toBe("image");
  });

  it("poll surfaces cinematic video results as mediaType=video", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ "GET /render/cin-1": { body: { status: "completed", videoUrl: "https://cdn/clip.mp4" } } }),
    );
    const res = await unrealPoll({ jobId: "cin-1", jobType: "cinematic" });
    expect(res.state).toBe("ready");
    expect(res.url).toBe("https://cdn/clip.mp4");
    expect(res.mediaType).toBe("video");
  });

  it("poll returns failed on an explicit failure and keeps the error message", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ "GET /render/bad": { body: { status: "failed", error: "scene asset missing" } } }),
    );
    const res = await unrealPoll({ jobId: "bad" });
    expect(res.state).toBe("failed");
    expect(res.failMsg).toMatch(/scene asset missing/);
  });

  it("poll treats an outage (5xx) as failed but a transient error as pending", async () => {
    vi.stubGlobal("fetch", mockFetch({ "GET /render/out": { status: 503, body: { error: "down" } } }));
    expect((await unrealPoll({ jobId: "out" })).state).toBe("failed");

    // A 404 (route miss) is not an outage signature → stay pending and retry.
    vi.stubGlobal("fetch", mockFetch({}));
    expect((await unrealPoll({ jobId: "missing" })).state).toBe("pending");
  });

  it("runUnrealJob drives submit → poll → ready end to end", async () => {
    let polls = 0;
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "POST /render": { body: { jobId: "e2e" } },
        "GET /render/e2e": () => {
          polls += 1;
          return polls < 2
            ? { body: { status: "rendering" } }
            : { body: { status: "completed", resultUrls: ["https://cdn/final.mp4"], mediaType: "video" } };
        },
      }),
    );
    const out = await runUnrealJob({ prompt: "p", aspectRatio: "16:9", jobType: "cinematic" }, 30_000);
    expect(out.url).toBe("https://cdn/final.mp4");
    expect(out.mediaType).toBe("video");
  });
});

describe("unreal provider (registry seam)", () => {
  const ORIG = { ...process.env };
  afterEach(() => {
    process.env = { ...ORIG };
    vi.restoreAllMocks();
  });

  it("is registered but NOT the default backend", () => {
    expect(getProvider("unreal").id).toBe("unreal");
    expect(DEFAULT_PROVIDER_ID).toBe("nano-banana");
  });

  it("reports not-configured when UNREAL_RENDER_URL is unset (graceful fallback)", () => {
    delete process.env.UNREAL_RENDER_URL;
    expect(unrealProvider.isConfigured()).toBe(false);
    const summary = listProviderSummaries().find((p) => p.id === "unreal");
    expect(summary?.configured).toBe(false);
    expect(summary?.isDefault).toBe(false);
  });

  it("start() persists jobId + statusUrl + jobType in the handle meta", async () => {
    process.env.UNREAL_RENDER_URL = URL;
    delete process.env.UNREAL_RENDER_KEY; // no key → no Authorization header
    const fetchMock = mockFetch({
      "POST /render": { body: { jobId: "h1", statusUrl: `${URL}/render/h1/status` } },
    });
    vi.stubGlobal("fetch", fetchMock);

    const handle = await unrealProvider.start({ prompt: "p", aspectRatio: "4:3", jobType: "landscape" });
    expect(handle.taskId).toBe("h1");
    expect(handle.meta).toMatchObject({ statusUrl: `${URL}/render/h1/status`, jobType: "landscape" });
    // No key configured → no Authorization header sent.
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it("poll() uses the persisted statusUrl override and ingests the result", async () => {
    process.env.UNREAL_RENDER_URL = URL;
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "GET /render/h1/status": { body: { status: "completed", resultUrls: ["https://cdn/iso.png"] } },
      }),
    );
    const status = await unrealProvider.poll({
      taskId: "h1",
      meta: { statusUrl: `${URL}/render/h1/status`, jobType: "landscape" },
    });
    expect(status.state).toBe("ready");
    expect(status.url).toBe("https://cdn/iso.png");
    expect(status.mediaType).toBe("image");
  });

  it("poll() returns pending for an empty handle", async () => {
    const status = await unrealProvider.poll({ taskId: "" });
    expect(status.state).toBe("pending");
  });
});
