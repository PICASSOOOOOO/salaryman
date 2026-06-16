// @vitest-environment jsdom
//
// Guards the OrgLaborRequests live-stats auto-refresh (polling) loop.
//
// While the panel is open, a 20s interval silently refetches the org-wide labor
// summary and — if a plan is expanded — that plan's labor stats. The refresh is
// "silent": it must NOT toggle the loading spinner or clear the visible data
// (so the panel never flickers), it must SKIP ticks while the tab is hidden and
// resume on visibilitychange, and it must leave the admin's expanded selection
// untouched.
//
// A regression that re-introduced the loading spinner during a poll, kept
// polling while document.hidden, or collapsed the expanded plan would silently
// degrade the admin's "watch inmates work" view. These tests advance a fake
// timer across poll cycles and assert each of those contracts.
//
// All network and browser-only dependencies are stubbed so the suite runs in
// jsdom without a server.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const apiFetchMock = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...(args as [string, unknown])),
}));

vi.mock("framer-motion", () => {
  const passthrough = (tag: string) =>
    ({ children, ...props }: any) => {
      const { initial, animate, exit, transition, whileHover, whileTap, layout, ...rest } = props;
      return (globalThis as any).React
        ? (globalThis as any).React.createElement(tag, rest, children)
        : null;
    };
  return {
    AnimatePresence: ({ children }: any) => children,
    motion: new Proxy({}, { get: (_t, tag: string) => passthrough(tag) }),
  };
});

import * as React from "react";
(globalThis as any).React = React;

import { OrgLaborRequests } from "./OrgLaborRequests";

const PLAN = {
  id: 88,
  title: "RIVERSIDE PROMENADE",
  region: "city",
  status: "active",
  tasks: [{ id: "t1", completed: true }, { id: "t2", completed: false }],
  rewardPerTask: 2500,
  owningOrgId: "7",
  owningOrgName: "PICASSO CORP",
  openToDebtorLabor: true,
  contributorCount: 2,
};

function planSummary(over: Partial<{
  totalDebtForgiven: number;
  laborerId: string;
  displayName: string;
}> = {}) {
  return {
    planId: 88,
    debtorShifts: 3,
    totalDebtForgiven: over.totalDebtForgiven ?? 4500,
    totalDebtorLaborers: 1,
    laborers: [
      {
        laborerId: over.laborerId ?? "debtor-x",
        displayName: over.displayName ?? "@inmate_xray",
        shifts: 2,
        totalReward: 3000,
        lastShiftAt: "2026-06-12T12:00:00.000Z",
      },
    ],
    page: 1,
    totalPages: 1,
  };
}

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

// Swappable handler for GET /api/world-build/plans/:id/labor-summary so a test
// can hold a poll's response pending (to inspect the mid-flight UI) before
// resolving it with fresh stats.
let planSummaryHandler: () => Promise<Response>;
// Counts of the two endpoints the poll tick touches.
let planSummaryCalls = 0;
let orgSummaryCalls = 0;
// Mutable document.hidden backing the visibility gate.
let hidden = false;

beforeEach(() => {
  vi.useFakeTimers();
  hidden = false;
  planSummaryCalls = 0;
  orgSummaryCalls = 0;
  planSummaryHandler = () => Promise.resolve(jsonResponse(planSummary()));

  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });

  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation((path: string) => {
    if (path.startsWith("/api/construction/my-projects")) {
      return Promise.resolve(jsonResponse({ projects: [] }));
    }
    if (path.startsWith("/api/world-build/plans") && path.includes("/labor-summary")) {
      planSummaryCalls += 1;
      return planSummaryHandler();
    }
    if (path.startsWith("/api/world-build/plans")) {
      return Promise.resolve(jsonResponse({ plans: [PLAN] }));
    }
    if (path.startsWith("/api/construction/org-labor-summary")) {
      orgSummaryCalls += 1;
      return Promise.resolve(jsonResponse({
        orgId: 7,
        orgName: "PICASSO CORP",
        allTime: { shifts: 0, debtForgiven: 0, uniqueLaborers: 0 },
        week: { shifts: 0, debtForgiven: 0, uniqueLaborers: 0 },
      }));
    }
    return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
  });
});

let root: Root;
let container: HTMLDivElement;

async function flush(rounds = 6) {
  await act(async () => {
    for (let i = 0; i < rounds; i++) await Promise.resolve();
  });
}

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<OrgLaborRequests orgId={7} orgName="PICASSO CORP" />);
  });
  await flush();
}

// Switch to the Plans tab and expand the org-owned plan so the plan
// labor-summary loads and the poll has an expanded selection to refresh.
async function expandPlan() {
  const plansTab = Array.from(container.querySelectorAll("button")).find(
    (b) => (b.textContent ?? "").toUpperCase().includes("BLUEPRINT"),
  );
  expect(plansTab).toBeTruthy();
  await act(async () => (plansTab as HTMLButtonElement).click());
  await flush();

  const titleSpan = Array.from(container.querySelectorAll("span")).find(
    (s) => s.textContent === "RIVERSIDE PROMENADE",
  );
  expect(titleSpan).toBeTruthy();
  const row = titleSpan!.closest("div.py-3") as HTMLElement | null;
  expect(row).toBeTruthy();
  const rowBtns = Array.from(row!.querySelectorAll("button"));
  const expandBtn = rowBtns[rowBtns.length - 1] as HTMLButtonElement;
  await act(async () => expandBtn.click());
  await flush();
}

// Advance exactly one poll cycle (the interval fires every 20000ms).
async function advanceOnePoll() {
  await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
  await flush();
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  delete (document as any).hidden;
});

describe("OrgLaborRequests — live-stats auto-refresh", () => {
  it("silently refreshes the expanded plan's stats on a poll tick — no spinner, no data clear", async () => {
    await mount();
    await expandPlan();

    // Baseline: the expanded plan loaded its stats once and rendered them.
    expect(planSummaryCalls).toBe(1);
    expect(container.textContent).toContain("4,500");
    expect(container.textContent).toContain("@inmate_xray");

    // Hold the NEXT plan-summary fetch (the poll's) pending so we can inspect
    // the UI mid-flight: it must keep showing the old stats with no spinner.
    const d = deferred<Response>();
    planSummaryHandler = () => d.promise;
    const orgCallsBefore = orgSummaryCalls;

    await advanceOnePoll();

    // The tick fired both the org-summary refresh and the plan-summary refetch.
    expect(orgSummaryCalls).toBe(orgCallsBefore + 1);
    expect(planSummaryCalls).toBe(2);

    // Mid-flight (poll fetch still pending): the old data stays put and the
    // loading spinner is NOT shown — a silent refresh must not flicker.
    expect(container.textContent).toContain("4,500");
    expect(container.textContent).toContain("@inmate_xray");
    expect(container.textContent).not.toContain("LOADING LABOR BREAKDOWN");

    // Resolve the poll fetch with fresh numbers — they replace the old ones.
    await act(async () => {
      d.resolve(jsonResponse(planSummary({ totalDebtForgiven: 9999, laborerId: "debtor-y", displayName: "@inmate_yankee" })));
      await Promise.resolve();
    });
    await flush();

    expect(container.textContent).toContain("9,999");
    expect(container.textContent).toContain("@inmate_yankee");
    expect(container.textContent).not.toContain("LOADING LABOR BREAKDOWN");
  });

  it("skips polling while the tab is hidden and resumes (with an immediate tick) on visibilitychange", async () => {
    await mount();
    await expandPlan();

    const orgBefore = orgSummaryCalls;
    const planBefore = planSummaryCalls;

    // Tab hidden → the interval tick must early-return: no refreshes fire.
    hidden = true;
    await advanceOnePoll();
    expect(orgSummaryCalls).toBe(orgBefore);
    expect(planSummaryCalls).toBe(planBefore);

    // Becoming visible again fires an immediate tick (no need to wait 20s).
    hidden = false;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    await flush();

    expect(orgSummaryCalls).toBe(orgBefore + 1);
    expect(planSummaryCalls).toBe(planBefore + 1);
  });

  it("preserves the admin's expanded plan selection across a poll refresh", async () => {
    await mount();
    await expandPlan();

    // The expanded breakdown is visible before the poll.
    expect(container.textContent).toContain("DEBTOR LABOR BREAKDOWN");
    expect(container.textContent).toContain("@inmate_xray");

    await advanceOnePoll();

    // After the silent refresh the plan is STILL expanded — the breakdown and
    // its refreshed contents remain rendered; the selection was not collapsed.
    expect(container.textContent).toContain("DEBTOR LABOR BREAKDOWN");
    expect(container.textContent).toContain("@inmate_xray");
  });
});
