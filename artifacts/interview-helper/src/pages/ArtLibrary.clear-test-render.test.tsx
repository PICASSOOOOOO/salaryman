// @vitest-environment jsdom
//
// Guards the Test-render "Clear" reset path in the Art Library.
//
// Contract:
//   clearTestRender (the "Clear" button) DELETEs all stored throwaway
//   test-render rows, then:
//     - resets the "N stored" badge to 0 (badge disappears),
//     - shows a "Cleared N test results" confirmation using the server's
//       reported deleted count,
//     - cancels any in-flight poll timer scheduled by a prior test render so a
//       stale poll can't later resurrect the badge.
//
// A regression that dropped setTestRenderCount(0) would leave the badge stale;
// one that dropped the clearTimeout(testPollRef) would let a pending poll fire
// after the clear and re-query the count, bringing the badge back from the dead.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  // Stored test-render total the next GET /api/art/library reports. The initial
  // mount load reports 0; the POST /api/art/test-render handler bumps it to the
  // authoritative cross-backend total. If a poll wrongly fired after a clear, the
  // reconciliation fetch would read this non-zero value and resurrect the badge.
  libraryTestCount: 0,
  // Status the polled GET /api/art/asset/:key reports for in-flight jobs.
  assetStatus: "ready" as "pending" | "ready",
  // Deleted count the DELETE /api/art/test-render handler reports.
  deletedCount: 9,
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

beforeEach(() => {
  vi.useFakeTimers();
  h.libraryTestCount = 0;
  h.assetStatus = "ready";
  h.deletedCount = 9;
  h.apiFetch.mockReset();
  h.apiFetch.mockImplementation((url: string, opts?: any) => {
    const method = (opts?.method ?? "GET").toUpperCase();
    if (url.includes("/art/test-render") && method === "POST") {
      // The smoke test persisted this backend's rows; the authoritative total
      // (across all backends) is now 9.
      h.libraryTestCount = 9;
      return json(testRenderBody(h.assetStatus));
    }
    if (url.includes("/art/test-render") && method === "DELETE") {
      // Server wiped every stored throwaway row.
      h.libraryTestCount = 0;
      return json({ deleted: h.deletedCount });
    }
    if (url.includes("/art/library")) return json(libraryBody());
    if (url.includes("/art/providers"))
      return json({ providers: [provider()], polishConfigured: false });
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

describe("clear test-render reset", () => {
  it("resets the badge to 0 and shows the cleared confirmation", async () => {
    h.assetStatus = "ready"; // jobs settle immediately → badge reconciles to 9
    await render();

    await clickButton("Run test");
    await flush();

    // Badge now shows the authoritative stored count.
    expect(pageText()).toMatch(/9 stored/);

    h.deletedCount = 9;
    await clickButton("Clear");
    await flush();

    // Badge disappears (count back to 0) and the confirmation reports the
    // server's deleted count.
    expect(pageText()).not.toMatch(/stored/);
    expect(pageText()).toMatch(/Cleared 9 test results/);
  });

  it("singularizes the confirmation when exactly one row is cleared", async () => {
    h.assetStatus = "ready";
    await render();

    await clickButton("Run test");
    await flush();

    h.deletedCount = 1;
    await clickButton("Clear");
    await flush();

    expect(pageText()).toMatch(/Cleared 1 test result(?!s)/);
  });

  it("a poll from a prior test render does not resurrect the badge after clear", async () => {
    // A test render with pending jobs schedules a poll (testPollRef). The Clear
    // button is disabled while that poll keeps the run "in flight", so we let the
    // poll settle the run first — which leaves the just-fired poll timer id still
    // parked in testPollRef. clearTestRender must clear/forget that ref so no
    // residual poll work can re-query the server and bring the badge back.
    h.assetStatus = "pending"; // jobs start pending → runTestRender schedules a poll
    await render();

    await clickButton("Run test");
    await flush();

    // Optimistic bump shows this backend's job count while the poll is pending;
    // a real poll timer is now parked in testPollRef.
    expect(pageText()).toMatch(/3 stored/);

    // The poll fires and settles the run → run ends, badge reconciles to the
    // server total, and (only now) Clear becomes enabled.
    h.assetStatus = "ready";
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    await flush();
    expect(pageText()).toMatch(/9 stored/);

    // Snapshot how many times the library was queried so we can prove no further
    // reconciliation fetch fires after the clear.
    const libCallsBeforeClear = h.apiFetch.mock.calls.filter(
      ([url]: [string]) => typeof url === "string" && url.includes("/art/library"),
    ).length;

    await clickButton("Clear");
    await flush();

    expect(pageText()).not.toMatch(/stored/);
    expect(pageText()).toMatch(/Cleared 9 test results/);

    // Advance well past any poll interval. A leaked/forgotten poll timer would
    // call pollTestJobs → refreshTestRenderCount, re-reading the (still 9 if the
    // server hadn't been told, here 0) total and reviving the badge. Nothing must
    // fire: the badge stays gone and no extra /art/library fetch happens.
    h.libraryTestCount = 9; // worst case: if a stale poll DID refetch, it'd read 9
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    await flush();

    expect(pageText()).not.toMatch(/stored/);
    const libCallsAfterClear = h.apiFetch.mock.calls.filter(
      ([url]: [string]) => typeof url === "string" && url.includes("/art/library"),
    ).length;
    expect(libCallsAfterClear).toBe(libCallsBeforeClear);
  });
});
