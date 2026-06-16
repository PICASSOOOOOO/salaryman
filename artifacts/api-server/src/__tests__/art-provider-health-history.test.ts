import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  listProviderSummariesWithHealth,
  clearProviderHealthCache,
  clearProviderHealthHistory,
  PROVIDER_HEALTH_CACHE_TTL_MS,
  PROVIDER_HEALTH_HISTORY_LIMIT,
} from "../lib/art-providers";

const URL = "https://render.example.test";

/** Minimal Response-like stub for the global fetch mock. */
function resp(ok: boolean, status = ok ? 200 : 502) {
  return { ok, status, statusText: ok ? "ok" : "down", text: async () => "" } as any;
}

/**
 * The Unreal node is the only registry backend gated purely on an env URL, so we
 * use it to drive online↔offline transitions: stub fetch ok/!ok and advance the
 * probe cache window between observations.
 */
describe("server-side provider health-transition history", () => {
  const ORIG = { ...process.env };
  beforeEach(() => {
    clearProviderHealthCache();
    clearProviderHealthHistory();
    vi.useFakeTimers();
    vi.setSystemTime(0);
    process.env.UNREAL_RENDER_URL = URL;
    delete process.env.FAL_KEY;
    delete process.env.NANO_BANANA_API_KEY;
  });
  afterEach(() => {
    process.env = { ...ORIG };
    clearProviderHealthCache();
    clearProviderHealthHistory();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const unrealOf = async () =>
    (await listProviderSummariesWithHealth()).find((p) => p.id === "unreal")!;

  /** Move past the probe cache TTL so the next list re-probes. */
  function advancePastCache() {
    vi.setSystemTime(Date.now() + PROVIDER_HEALTH_CACHE_TTL_MS + 1);
    clearProviderHealthCache();
  }

  it("stamps lastChangedAt at first observation and seeds a one-entry history", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resp(true)));
    const u = await unrealOf();
    expect(u.health).toBe("online");
    expect(u.lastChangedAt).toBe(0);
    expect(u.healthHistory).toEqual([{ at: 0, health: "online" }]);
  });

  it("does NOT move lastChangedAt while health is unchanged (idempotent)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resp(true)));
    const first = await unrealOf();
    expect(first.lastChangedAt).toBe(0);
    advancePastCache(); // re-probe at a later time, still online
    const later = await unrealOf();
    expect(later.health).toBe("online");
    // Same run → lastChangedAt stays put even though "now" advanced.
    expect(later.lastChangedAt).toBe(0);
    expect(later.healthHistory).toHaveLength(1);
  });

  it("records a transition: lastChangedAt jumps to the flip time and history grows", async () => {
    const fetchMock = vi.fn(async () => resp(true));
    vi.stubGlobal("fetch", fetchMock);
    await unrealOf(); // online @ 0
    advancePastCache();
    const flipTime = Date.now();
    fetchMock.mockImplementation(async () => resp(false)); // now unreachable
    const down = await unrealOf();
    expect(down.health).toBe("offline");
    expect(down.lastChangedAt).toBe(flipTime);
    // Most-recent-first: offline flip on top, original online run below.
    expect(down.healthHistory?.[0]).toEqual({ at: flipTime, health: "offline" });
    expect(down.healthHistory?.[1]).toEqual({ at: 0, health: "online" });
  });

  it("records a config removal as a transition to not-configured", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resp(true)));
    await unrealOf(); // online @ 0
    advancePastCache();
    const flipTime = Date.now();
    delete process.env.UNREAL_RENDER_URL; // key pulled → not-configured
    const off = await unrealOf();
    expect(off.health).toBe("not-configured");
    expect(off.lastChangedAt).toBe(flipTime);
    expect(off.healthHistory?.[0]).toEqual({ at: flipTime, health: "not-configured" });
  });

  it("caps the retained history at PROVIDER_HEALTH_HISTORY_LIMIT", async () => {
    const fetchMock = vi.fn(async () => resp(true));
    vi.stubGlobal("fetch", fetchMock);
    // Flip online↔offline well past the cap so the oldest entries fall off.
    for (let i = 0; i < PROVIDER_HEALTH_HISTORY_LIMIT + 5; i++) {
      advancePastCache();
      fetchMock.mockImplementation(async () => resp(i % 2 === 0));
      await unrealOf();
    }
    const u = await unrealOf();
    expect(u.healthHistory!.length).toBeLessThanOrEqual(PROVIDER_HEALTH_HISTORY_LIMIT);
    // Newest entry is first and matches the current health.
    expect(u.healthHistory![0].health).toBe(u.health);
  });

  it("survives the per-list snapshot (returns a copy, not the live array)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resp(true)));
    const a = await unrealOf();
    a.healthHistory!.push({ at: 999, health: "offline" }); // mutate the caller's copy
    advancePastCache();
    const b = await unrealOf(); // still online, unchanged
    expect(b.healthHistory).toHaveLength(1); // internal log untouched by the mutation
  });
});
