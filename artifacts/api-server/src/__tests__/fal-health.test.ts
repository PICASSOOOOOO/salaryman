import { describe, it, expect, afterEach, vi } from "vitest";
import { falHealthCheck, isFalOutage } from "../lib/fal";
import { falProvider } from "../lib/art-providers/fal-provider";

const KEY = "fal-secret";

/** Minimal Response-like stub for the global fetch mock. */
function resp(status: number, statusText = "") {
  return { ok: status >= 200 && status < 300, status, statusText, text: async () => "" } as any;
}

describe("fal health probe (reachability) reuses isFalOutage", () => {
  const ORIG = { ...process.env };
  afterEach(() => {
    process.env = { ...ORIG };
    vi.restoreAllMocks();
  });

  it("not configured (no probe) when FAL_KEY is unset", async () => {
    delete process.env.FAL_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await falHealthCheck();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("online on a 2xx", async () => {
    process.env.FAL_KEY = KEY;
    vi.stubGlobal("fetch", vi.fn(async () => resp(200, "ok")));
    expect((await falHealthCheck()).ok).toBe(true);
  });

  it("online on a non-outage status (404 route miss still proves reach)", async () => {
    process.env.FAL_KEY = KEY;
    vi.stubGlobal("fetch", vi.fn(async () => resp(404, "not found")));
    expect((await falHealthCheck()).ok).toBe(true);
  });

  // isFalOutage classifies 402/403/429/5xx as outage-level → offline. This is the
  // exact case a hardcoded ">=500||429" check would get WRONG for 402/403.
  it.each([402, 403, 429, 500, 502, 503, 504])("offline on outage status %i", async (status) => {
    process.env.FAL_KEY = KEY;
    // Sanity-check the synthesized error matches the shared classifier.
    expect(isFalOutage(`fal ${status}: x`)).toBe(true);
    vi.stubGlobal("fetch", vi.fn(async () => resp(status, "x")));
    const res = await falHealthCheck();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(new RegExp(String(status)));
  });

  it("offline (never throws) on a network/abort error", async () => {
    process.env.FAL_KEY = KEY;
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("connect ECONNREFUSED"); }));
    const res = await falHealthCheck();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/ECONNREFUSED/);
  });

  it("provider.probe() delegates to falHealthCheck", async () => {
    process.env.FAL_KEY = KEY;
    vi.stubGlobal("fetch", vi.fn(async () => resp(403, "forbidden")));
    const res = await falProvider.probe!();
    expect(res.ok).toBe(false);
  });
});
