import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { db, providerHealthTransitionsTable } from "@workspace/db";
import {
  listProviderSummariesWithHealth,
  clearProviderHealthCache,
  clearProviderHealthHistory,
  PROVIDER_HEALTH_HISTORY_LIMIT,
} from "../lib/art-providers";

const URL = "https://render.example.test";

/** Minimal Response-like stub for the global fetch mock. */
function resp(ok: boolean, status = ok ? 200 : 502) {
  return { ok, status, statusText: ok ? "ok" : "down", text: async () => "" } as any;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The Unreal node is the only registry backend gated purely on an env URL, so we
 * use it to drive online↔offline transitions: stub fetch ok/!ok and clear the
 * probe cache between observations to force a fresh probe.
 *
 * The transition timeline is now persisted in the `provider_health_transitions`
 * table (so it survives a server restart), so these run against the real dev DB
 * and clean up the unreal rows around each case. Timestamps are real wall-clock
 * ms, so assertions compare relative ordering rather than fixed values.
 */
describe("persistent provider health-transition history", () => {
  const ORIG = { ...process.env };
  beforeEach(async () => {
    clearProviderHealthCache();
    await clearProviderHealthHistory();
    process.env.UNREAL_RENDER_URL = URL;
    delete process.env.FAL_KEY;
    delete process.env.NANO_BANANA_API_KEY;
  });
  afterEach(async () => {
    process.env = { ...ORIG };
    clearProviderHealthCache();
    await clearProviderHealthHistory();
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await clearProviderHealthHistory();
  });

  const unrealOf = async () =>
    (await listProviderSummariesWithHealth()).find((p) => p.id === "unreal")!;

  /** Drop the probe cache so the next list re-probes (no time advance needed). */
  function forceReprobe() {
    clearProviderHealthCache();
  }

  it("stamps lastChangedAt at first observation and seeds a one-entry history", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resp(true)));
    const before = Date.now();
    const u = await unrealOf();
    const after = Date.now();
    expect(u.health).toBe("online");
    expect(u.lastChangedAt).toBeGreaterThanOrEqual(before);
    expect(u.lastChangedAt).toBeLessThanOrEqual(after);
    expect(u.healthHistory).toHaveLength(1);
    expect(u.healthHistory![0].health).toBe("online");
  });

  it("does NOT move lastChangedAt while health is unchanged (idempotent)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resp(true)));
    const first = await unrealOf();
    await sleep(5);
    forceReprobe(); // re-probe later, still online
    const later = await unrealOf();
    expect(later.health).toBe("online");
    // Same run → lastChangedAt stays put even though time advanced.
    expect(later.lastChangedAt).toBe(first.lastChangedAt);
    expect(later.healthHistory).toHaveLength(1);
  });

  it("records a transition: lastChangedAt advances to the flip and history grows", async () => {
    const fetchMock = vi.fn(async () => resp(true));
    vi.stubGlobal("fetch", fetchMock);
    const up = await unrealOf(); // online
    await sleep(5);
    forceReprobe();
    fetchMock.mockImplementation(async () => resp(false)); // now unreachable
    const down = await unrealOf();
    expect(down.health).toBe("offline");
    expect(down.lastChangedAt).toBeGreaterThan(up.lastChangedAt!);
    // Most-recent-first: offline flip on top, original online run below.
    expect(down.healthHistory?.[0].health).toBe("offline");
    expect(down.healthHistory?.[1].health).toBe("online");
  });

  it("records a config removal as a transition to not-configured", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resp(true)));
    const up = await unrealOf(); // online
    await sleep(5);
    forceReprobe();
    delete process.env.UNREAL_RENDER_URL; // key pulled → not-configured
    const off = await unrealOf();
    expect(off.health).toBe("not-configured");
    expect(off.lastChangedAt).toBeGreaterThan(up.lastChangedAt!);
    expect(off.healthHistory?.[0].health).toBe("not-configured");
  });

  it("caps the retained history at PROVIDER_HEALTH_HISTORY_LIMIT and prunes old rows", async () => {
    const fetchMock = vi.fn(async () => resp(true));
    vi.stubGlobal("fetch", fetchMock);
    // Flip online↔offline well past the cap so the oldest entries fall off.
    for (let i = 0; i < PROVIDER_HEALTH_HISTORY_LIMIT + 5; i++) {
      forceReprobe();
      fetchMock.mockImplementation(async () => resp(i % 2 === 0));
      await unrealOf();
      await sleep(2); // keep flip timestamps distinct
    }
    const u = await unrealOf();
    expect(u.healthHistory!.length).toBeLessThanOrEqual(PROVIDER_HEALTH_HISTORY_LIMIT);
    // Newest entry is first and matches the current health.
    expect(u.healthHistory![0].health).toBe(u.health);
    // The underlying table is pruned too, not just the returned slice.
    const rows = await db.select().from(providerHealthTransitionsTable);
    const unrealRows = rows.filter((r) => r.providerId === "unreal");
    expect(unrealRows.length).toBeLessThanOrEqual(PROVIDER_HEALTH_HISTORY_LIMIT);
  });

  it("survives a 'restart': a fresh read still sees the persisted timeline", async () => {
    const fetchMock = vi.fn(async () => resp(true));
    vi.stubGlobal("fetch", fetchMock);
    const up = await unrealOf(); // online persisted
    await sleep(5);
    forceReprobe();
    fetchMock.mockImplementation(async () => resp(false));
    const down = await unrealOf(); // offline persisted

    // Simulate a server restart: drop ALL in-process probe caches. Only the DB
    // rows remain — that's the whole point of persisting the timeline.
    clearProviderHealthCache();
    fetchMock.mockImplementation(async () => resp(false)); // still down after "restart"
    const afterRestart = await unrealOf();
    expect(afterRestart.health).toBe("offline");
    // The "offline since …" clock is preserved across the restart.
    expect(afterRestart.lastChangedAt).toBe(down.lastChangedAt!);
    expect(afterRestart.lastChangedAt).toBeGreaterThan(up.lastChangedAt!);
    expect(afterRestart.healthHistory?.[0].health).toBe("offline");
    expect(afterRestart.healthHistory?.[1].health).toBe("online");
  });

  it("does not return a live array reference (caller copy is isolated)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resp(true)));
    const a = await unrealOf();
    a.healthHistory!.push({ at: 999, health: "offline" }); // mutate the caller's copy
    forceReprobe();
    const b = await unrealOf(); // still online, unchanged
    expect(b.healthHistory).toHaveLength(1); // persisted log untouched by the mutation
  });
});
