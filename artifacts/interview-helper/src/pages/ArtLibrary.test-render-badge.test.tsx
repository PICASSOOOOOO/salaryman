// @vitest-environment jsdom
//
// Guards the Test-render "N stored" badge reconciliation in the Art Library.
//
// Contract:
//   After a "Run test" completes, the badge must end at the AUTHORITATIVE stored
//   test-render count reported by GET /api/art/library (testRenderCount) — NOT
//   the optimistic per-backend bump (Math.max(prev, jobs.length)) that
//   runTestRender applies up front. The optimistic value only knows about the
//   backend that was just smoke-tested, so it can drift stale once rows from
//   other backends exist. refreshTestRenderCount re-queries the server once all
//   jobs settle to keep the badge exact.
//
// Two settle paths are covered:
//   - immediate settle: test-render returns already-`ready` jobs, so
//     runTestRender refreshes the count straight away (no polling).
//   - poll-to-settle: test-render returns `pending` jobs, pollTestJobs polls
//     GET /api/art/asset/:key until each is ready, THEN refreshes the count.
//
// We pick a server total (9) that differs from this backend's job count (3) so
// a regression that dropped the reconciliation would leave the badge at "3
// stored" and fail the assertion.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  // Stored test-render total the NEXT GET /api/art/library should report. The
  // initial mount load reports 0; the POST /api/art/test-render handler bumps
  // this to the authoritative cross-backend total so the post-run reconciliation
  // fetch returns it.
  libraryTestCount: 0,
  // Status the polled GET /api/art/asset/:key reports for in-flight jobs. Flip to
  // "ready" to let pollTestJobs settle.
  assetStatus: "ready" as "pending" | "ready",
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

function asset(key: string, status: "pending" | "ready") {
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
    failMsg: null,
  };
}

// POST /api/art/test-render → three jobs in the given initial status.
function testRenderBody(initialStatus: "pending" | "ready") {
  return {
    backend: "nano-banana",
    configured: true,
    jobs: JOB_KEYS.map((key, i) => ({ key, jobType: JOB_TYPES[i], asset: asset(key, initialStatus) })),
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

function clickRunTest() {
  const btn = Array.from(container.querySelectorAll("button")).find(b =>
    (b.textContent ?? "").includes("Run test"),
  );
  if (!btn) throw new Error("Run test button not found");
  return act(async () => {
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

function badgeText(): string {
  return container.textContent ?? "";
}

beforeEach(() => {
  vi.useFakeTimers();
  h.libraryTestCount = 0;
  h.assetStatus = "ready";
  h.apiFetch.mockReset();
  h.apiFetch.mockImplementation((url: string, opts?: any) => {
    const method = (opts?.method ?? "GET").toUpperCase();
    if (url.includes("/art/test-render") && method === "POST") {
      // The smoke test persisted this backend's rows; the authoritative total
      // (across all backends) is now 9.
      h.libraryTestCount = 9;
      return json(testRenderBody(h.assetStatus));
    }
    if (url.includes("/art/library")) return json(libraryBody());
    if (url.includes("/art/providers"))
      return json({ providers: [provider()], polishConfigured: false });
    // GET /api/art/asset/:key — used by pollTestJobs.
    const m = url.match(/\/art\/asset\/(.+)$/);
    if (m) {
      const key = decodeURIComponent(m[1]);
      return json({ asset: asset(key, h.assetStatus) });
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

describe("test-render badge reconciliation", () => {
  it("immediate-settle: badge ends at the server total, not the optimistic job count", async () => {
    h.assetStatus = "ready"; // jobs come back already settled → no polling
    await render();

    // No test rows yet → badge hidden.
    expect(badgeText()).not.toMatch(/stored/);

    await clickRunTest();
    await flush();

    // Optimistic bump would have shown "3 stored" (this backend's 3 jobs); the
    // reconciliation fetch must override it to the true cross-backend total.
    expect(badgeText()).toMatch(/9 stored/);
    expect(badgeText()).not.toMatch(/3 stored/);
  });

  it("poll-to-settle: badge ends at the server total once pending jobs resolve", async () => {
    h.assetStatus = "pending"; // jobs start pending → pollTestJobs runs
    await render();

    await clickRunTest();
    await flush();

    // Mid-flight: only the optimistic bump has run (badge shows this backend's
    // job count), and the authoritative refresh has NOT fired yet.
    expect(badgeText()).toMatch(/3 stored/);

    // Jobs settle, then the next poll observes "ready" and reconciles the count.
    h.assetStatus = "ready";
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    await flush();

    expect(badgeText()).toMatch(/9 stored/);
    expect(badgeText()).not.toMatch(/3 stored/);
  });
});
