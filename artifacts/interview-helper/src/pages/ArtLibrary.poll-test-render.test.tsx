// @vitest-environment jsdom
//
// Guards the Test-render polling loop in the Art Library.
//
// Contract (the bug fixed in the predecessor task):
//   runTestRender schedules pollTestJobs, which re-queries GET
//   /api/art/asset/:key for every in-flight job each cycle. Completion is
//   derived DIRECTLY from the freshly fetched results — a run keeps polling as
//   long as ANY job's fetch failed (null) or its asset is still 'pending', and
//   only settles (setTestRunning(false) + the reconciled "N stored" badge) once
//   every job reports ready/failed.
//
// A regression that read completion from a flag mutated inside the setTestJobs
// updater could settle a run early — flipping the button back to "Run test" and
// reconciling the badge while jobs were still in flight. These tests advance the
// fake poll timer across multiple cycles and assert the run stays "Rendering…"
// (no early settle, no early reconciled badge) until the last job lands.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  // Authoritative cross-backend stored total the GET /api/art/library reports.
  // The mount load reports 0; the POST handler bumps it to 9. Only a settle
  // (refreshTestRenderCount) re-reads it, so the reconciled "9 stored" badge is
  // proof the run settled.
  libraryTestCount: 0,
  // Per-key status the polled GET /api/art/asset/:key reports. Mutated between
  // poll cycles to simulate jobs landing one at a time.
  statusByKey: {} as Record<string, "pending" | "ready" | "failed">,
  // Keys whose GET /api/art/asset/:key returns a non-ok response (fetch failure
  // → null result). A null result must keep the run polling, never settle it.
  failKeys: new Set<string>(),
  apiFetch: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({ apiFetch: h.apiFetch }));

import ArtLibrary from "./ArtLibrary";

function json(body: any) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
}

function provider() {
  return {
    id: "nano-banana",
    label: "Nano Banana",
    description: "default backend",
    configured: true,
    isDefault: true,
    health: "online",
    lastError: null,
  };
}

function libraryBody() {
  return {
    configured: true,
    providers: [provider()],
    polishConfigured: false,
    total: 0,
    ready: 0,
    pending: 0,
    failed: 0,
    testRenderCount: h.libraryTestCount,
    assets: [],
  };
}

const JOB_KEYS = ["__test__/object", "__test__/landscape", "__test__/cinematic"];
const JOB_TYPES = ["object", "landscape", "cinematic"];

function asset(key: string, status: "pending" | "ready" | "failed") {
  return {
    id: 1,
    key,
    category: "__test__",
    url: status === "ready" ? "https://cdn.example/x.png" : null,
    status,
    aspectRatio: "1:1",
    backend: "nano-banana",
    jobType: key.split("/")[1],
    mediaType: "image",
    failMsg: status === "failed" ? "render failed" : null,
  };
}

// POST /api/art/test-render always returns all three jobs pending so the run
// schedules a poll; later cycles settle them via h.statusByKey.
function testRenderBody() {
  return {
    backend: "nano-banana",
    configured: true,
    jobs: JOB_KEYS.map((key, i) => ({ key, jobType: JOB_TYPES[i], asset: asset(key, "pending") })),
  };
}

let root: Root;
let container: HTMLDivElement;

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

async function render() {
  await act(async () => { root.render(<ArtLibrary />); });
  await flush();
}

function clickButton(label: string) {
  const btn = Array.from(container.querySelectorAll("button")).find(b =>
    (b.textContent ?? "").includes(label),
  );
  if (!btn) throw new Error(`button not found: ${label}`);
  return act(async () => {
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

function pageText(): string {
  return container.textContent ?? "";
}

function libraryCallCount(): number {
  return h.apiFetch.mock.calls.filter(
    ([url]: [string]) => typeof url === "string" && url.includes("/art/library"),
  ).length;
}

// Advance exactly one poll cycle (the loop reschedules every 3000ms).
async function advanceOnePoll() {
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers();
  h.libraryTestCount = 0;
  h.statusByKey = Object.fromEntries(JOB_KEYS.map(k => [k, "pending"])) as Record<
    string,
    "pending" | "ready" | "failed"
  >;
  h.failKeys = new Set<string>();
  h.apiFetch.mockReset();
  h.apiFetch.mockImplementation((url: string, opts?: any) => {
    const method = (opts?.method ?? "GET").toUpperCase();
    if (url.includes("/art/test-render") && method === "POST") {
      h.libraryTestCount = 9;
      return json(testRenderBody());
    }
    if (url.includes("/art/test-render") && method === "DELETE") {
      h.libraryTestCount = 0;
      return json({ deleted: 0 });
    }
    if (url.includes("/art/library")) return json(libraryBody());
    if (url.includes("/art/providers"))
      return json({ providers: [provider()], polishConfigured: false });
    const m = url.match(/\/art\/asset\/(.+)$/);
    if (m) {
      const key = decodeURIComponent(m[1]);
      if (h.failKeys.has(key)) {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
      }
      return json({ asset: asset(key, h.statusByKey[key] ?? "ready") });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("test-render polling settles only when every job lands", () => {
  it("keeps polling across cycles while any job is pending, then settles once all are ready/failed", async () => {
    await render();

    await clickButton("Run test");
    await flush();

    // Run started: button shows the in-flight label and the optimistic
    // per-backend count, but NOT the reconciled cross-backend total.
    expect(pageText()).toMatch(/Rendering…/);
    expect(pageText()).toMatch(/3 stored/);
    expect(pageText()).not.toMatch(/9 stored/);

    // Snapshot the library-fetch count: a settle would call refreshTestRenderCount
    // (one more /art/library fetch). It must not move while jobs are pending.
    const libCallsAfterRun = libraryCallCount();

    // Cycle 1: two jobs land, one stays pending → run must NOT settle.
    h.statusByKey["__test__/object"] = "ready";
    h.statusByKey["__test__/landscape"] = "ready";
    h.statusByKey["__test__/cinematic"] = "pending";
    await advanceOnePoll();

    expect(pageText()).toMatch(/Rendering…/);
    expect(pageText()).not.toMatch(/Run test/);
    expect(pageText()).not.toMatch(/9 stored/);
    expect(libraryCallCount()).toBe(libCallsAfterRun);

    // Cycle 2: still pending (proves it really keeps polling, not a one-shot).
    await advanceOnePoll();
    expect(pageText()).toMatch(/Rendering…/);
    expect(pageText()).not.toMatch(/9 stored/);
    expect(libraryCallCount()).toBe(libCallsAfterRun);

    // Cycle 3: the last job lands as 'failed' (a terminal state, like ready).
    h.statusByKey["__test__/cinematic"] = "failed";
    await advanceOnePoll();

    // Now — and only now — the run settles: button resets and the badge
    // reconciles to the authoritative total.
    expect(pageText()).not.toMatch(/Rendering…/);
    expect(pageText()).toMatch(/Run test/);
    expect(pageText()).toMatch(/9 stored/);
    expect(libraryCallCount()).toBe(libCallsAfterRun + 1);
  });

  it("a failed (null) asset fetch keeps the run polling rather than settling early", async () => {
    // One job's poll fetch fails outright (non-ok → null result). A null must be
    // treated as still-in-flight, never as a settled job.
    h.failKeys = new Set(["__test__/cinematic"]);

    await render();

    await clickButton("Run test");
    await flush();
    expect(pageText()).toMatch(/Rendering…/);

    // Cycle 1: two jobs ready, the third fetch fails → keep polling.
    h.statusByKey["__test__/object"] = "ready";
    h.statusByKey["__test__/landscape"] = "ready";
    await advanceOnePoll();
    expect(pageText()).toMatch(/Rendering…/);
    expect(pageText()).not.toMatch(/9 stored/);

    // Cycle 2: fetch still failing → still polling (no premature settle).
    await advanceOnePoll();
    expect(pageText()).toMatch(/Rendering…/);
    expect(pageText()).not.toMatch(/9 stored/);

    // Cycle 3: the fetch recovers and reports ready → run settles.
    h.failKeys = new Set<string>();
    h.statusByKey["__test__/cinematic"] = "ready";
    await advanceOnePoll();
    expect(pageText()).not.toMatch(/Rendering…/);
    expect(pageText()).toMatch(/Run test/);
    expect(pageText()).toMatch(/9 stored/);
  });
});
