import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isUnrealConfigured,
  isUnrealOutage,
  toUnrealJobType,
  extractUnrealUrls,
  resolveMediaType,
  unrealSubmit,
  unrealPoll,
  unrealHealthCheck,
  runUnrealJob,
} from "../lib/unreal-render";
import { unrealProvider } from "../lib/art-providers/unreal-provider";
import {
  getProvider,
  DEFAULT_PROVIDER_ID,
  listProviderSummaries,
  listProviderSummariesWithHealth,
  listProviderSummariesWithHealthNonBlocking,
  clearProviderHealthCache,
  PROVIDER_HEALTH_CACHE_TTL_MS,
} from "../lib/art-providers";

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

describe("unreal-render: health probe (reachability)", () => {
  const ORIG = { ...process.env };
  afterEach(() => {
    process.env = { ...ORIG };
    vi.restoreAllMocks();
  });

  it("reports not configured (no probe) when UNREAL_RENDER_URL is unset", async () => {
    delete process.env.UNREAL_RENDER_URL;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await unrealHealthCheck();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not configured/);
    // Never hits the network when unconfigured.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("online when the node answers any HTTP status (even 404)", async () => {
    process.env.UNREAL_RENDER_URL = URL;
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, statusText: "not found", text: async () => "" }) as any));
    expect((await unrealHealthCheck()).ok).toBe(true);
  });

  it("offline on an outage-class status (5xx/429/402)", async () => {
    process.env.UNREAL_RENDER_URL = URL;
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, statusText: "unavailable", text: async () => "" }) as any));
    const res = await unrealHealthCheck();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/503/);
  });

  it("offline (never throws) on a network/abort error", async () => {
    process.env.UNREAL_RENDER_URL = URL;
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("connect ECONNREFUSED"); }));
    const res = await unrealHealthCheck();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/ECONNREFUSED/);
  });

  it("sends the bearer token when a key is set", async () => {
    process.env.UNREAL_RENDER_URL = URL;
    process.env.UNREAL_RENDER_KEY = KEY;
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, statusText: "ok", text: async () => "" }) as any);
    vi.stubGlobal("fetch", fetchMock);
    await unrealHealthCheck();
    const init = (fetchMock.mock.calls[0] as unknown as any[])?.[1] as RequestInit | undefined;
    expect((init?.headers as Record<string, string>)?.Authorization).toBe(`Bearer ${KEY}`);
  });
});

describe("listProviderSummariesWithHealth (registry)", () => {
  const ORIG = { ...process.env };
  beforeEach(() => {
    clearProviderHealthCache();
  });
  afterEach(() => {
    process.env = { ...ORIG };
    clearProviderHealthCache();
    vi.restoreAllMocks();
  });

  it("marks an unconfigured backend not-configured WITHOUT probing", async () => {
    delete process.env.UNREAL_RENDER_URL;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const summaries = await listProviderSummariesWithHealth();
    const unreal = summaries.find((p) => p.id === "unreal");
    expect(unreal?.configured).toBe(false);
    expect(unreal?.health).toBe("not-configured");
    expect(unreal?.lastError).toBeNull();
  });

  it("marks a reachable configured backend online with no lastError", async () => {
    process.env.UNREAL_RENDER_URL = URL;
    delete process.env.FAL_KEY;
    delete process.env.NANO_BANANA_API_KEY;
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, statusText: "ok", text: async () => "" }) as any));
    const unreal = (await listProviderSummariesWithHealth()).find((p) => p.id === "unreal");
    expect(unreal?.health).toBe("online");
    expect(unreal?.lastError).toBeNull();
  });

  it("marks an unreachable configured backend offline and surfaces lastError", async () => {
    process.env.UNREAL_RENDER_URL = URL;
    delete process.env.FAL_KEY;
    delete process.env.NANO_BANANA_API_KEY;
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 502, statusText: "bad gateway", text: async () => "" }) as any));
    const unreal = (await listProviderSummariesWithHealth()).find((p) => p.id === "unreal");
    expect(unreal?.health).toBe("offline");
    expect(unreal?.lastError).toMatch(/502/);
  });
});

describe("listProviderSummariesWithHealth (probe cache)", () => {
  const ORIG = { ...process.env };
  beforeEach(() => {
    clearProviderHealthCache();
    process.env.UNREAL_RENDER_URL = URL;
    delete process.env.FAL_KEY;
    delete process.env.NANO_BANANA_API_KEY;
  });
  afterEach(() => {
    process.env = { ...ORIG };
    clearProviderHealthCache();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("reuses a cached probe across rapid loads (one network round-trip)", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, statusText: "ok", text: async () => "" }) as any);
    vi.stubGlobal("fetch", fetchMock);
    const first = (await listProviderSummariesWithHealth()).find((p) => p.id === "unreal");
    const second = (await listProviderSummariesWithHealth()).find((p) => p.id === "unreal");
    expect(first?.health).toBe("online");
    expect(second?.health).toBe("online");
    // Second call served from cache — the node is probed only once.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("an offline backend isn't re-probed within the window (no repeated timeout)", async () => {
    const fetchMock = vi.fn(async () => { throw new Error("connect ECONNREFUSED"); });
    vi.stubGlobal("fetch", fetchMock);
    const first = (await listProviderSummariesWithHealth()).find((p) => p.id === "unreal");
    const second = (await listProviderSummariesWithHealth()).find((p) => p.id === "unreal");
    expect(first?.health).toBe("offline");
    expect(second?.health).toBe("offline");
    expect(second?.lastError).toMatch(/ECONNREFUSED/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-probes after the cache window expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, statusText: "ok", text: async () => "" }) as any);
    vi.stubGlobal("fetch", fetchMock);
    await listProviderSummariesWithHealth();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Within the window — still cached.
    vi.setSystemTime(PROVIDER_HEALTH_CACHE_TTL_MS - 1);
    await listProviderSummariesWithHealth();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Past the window — re-probes.
    vi.setSystemTime(PROVIDER_HEALTH_CACHE_TTL_MS + 1);
    await listProviderSummariesWithHealth();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("re-evaluates config immediately (cache only covers the network probe)", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, statusText: "ok", text: async () => "" }) as any);
    vi.stubGlobal("fetch", fetchMock);
    const online = (await listProviderSummariesWithHealth()).find((p) => p.id === "unreal");
    expect(online?.health).toBe("online");
    // Removing the config flips to not-configured on the very next load, despite
    // a fresh cached probe — config state is never cached.
    delete process.env.UNREAL_RENDER_URL;
    const off = (await listProviderSummariesWithHealth()).find((p) => p.id === "unreal");
    expect(off?.configured).toBe(false);
    expect(off?.health).toBe("not-configured");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("listProviderSummariesWithHealthNonBlocking (checking state)", () => {
  const ORIG = { ...process.env };
  beforeEach(() => {
    clearProviderHealthCache();
    process.env.UNREAL_RENDER_URL = URL;
    delete process.env.FAL_KEY;
    delete process.env.NANO_BANANA_API_KEY;
  });
  afterEach(() => {
    process.env = { ...ORIG };
    clearProviderHealthCache();
    vi.restoreAllMocks();
  });

  it("reports a freshly-probed backend as 'checking' WITHOUT blocking, then caches", async () => {
    // A probe that resolves only when we let it — proves the call returns before
    // the network round-trip completes (no blocking on a slow backend).
    let release: (v: any) => void = () => {};
    const gate = new Promise((r) => { release = r; });
    const fetchMock = vi.fn(async () => {
      await gate;
      return { ok: true, status: 200, statusText: "ok", text: async () => "" } as any;
    });
    vi.stubGlobal("fetch", fetchMock);

    // Returns synchronously while the probe is still in flight.
    const checking = listProviderSummariesWithHealthNonBlocking().find((p) => p.id === "unreal");
    expect(checking?.health).toBe("checking");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Let the background probe finish; the cache now holds the real result.
    release({});
    await new Promise((r) => setTimeout(r, 0));
    const settled = listProviderSummariesWithHealthNonBlocking().find((p) => p.id === "unreal");
    expect(settled?.health).toBe("online");
    // No second probe — the resolved cache was reused.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not fire a second probe while one is already in flight", async () => {
    let release: (v: any) => void = () => {};
    const gate = new Promise((r) => { release = r; });
    const fetchMock = vi.fn(async () => {
      await gate;
      return { ok: true, status: 200, statusText: "ok", text: async () => "" } as any;
    });
    vi.stubGlobal("fetch", fetchMock);

    const a = listProviderSummariesWithHealthNonBlocking().find((p) => p.id === "unreal");
    const b = listProviderSummariesWithHealthNonBlocking().find((p) => p.id === "unreal");
    expect(a?.health).toBe("checking");
    expect(b?.health).toBe("checking");
    // Deduped: the second checking tick rode the same in-flight probe.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release({});
    await new Promise((r) => setTimeout(r, 0));
  });

  it("serves a fresh cache immediately (never 'checking', no new probe)", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, statusText: "ok", text: async () => "" }) as any);
    vi.stubGlobal("fetch", fetchMock);
    // Seed the cache via the blocking path.
    await listProviderSummariesWithHealth();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const fast = listProviderSummariesWithHealthNonBlocking().find((p) => p.id === "unreal");
    expect(fast?.health).toBe("online");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("marks an unconfigured backend not-configured WITHOUT probing", async () => {
    delete process.env.UNREAL_RENDER_URL;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const unreal = listProviderSummariesWithHealthNonBlocking().find((p) => p.id === "unreal");
    expect(unreal?.configured).toBe(false);
    expect(unreal?.health).toBe("not-configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("carries a stale lastError through the 'checking' re-probe tick", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    // First probe fails → cache holds offline + the error message.
    const failMock = vi.fn(async () => { throw new Error("connect ECONNREFUSED"); });
    vi.stubGlobal("fetch", failMock);
    await listProviderSummariesWithHealth();
    // Advance past the cache window so the entry is stale-but-present, then a
    // non-blocking call re-probes and reports "checking" while keeping the old error.
    vi.setSystemTime(PROVIDER_HEALTH_CACHE_TTL_MS + 1);
    const stale = listProviderSummariesWithHealthNonBlocking().find((p) => p.id === "unreal");
    expect(stale?.health).toBe("checking");
    expect(stale?.lastError).toMatch(/ECONNREFUSED/);
    vi.useRealTimers();
  });
});
