// @vitest-environment jsdom
//
// Integration test for the OrgLaborRequests construction-project labor
// breakdown pagination (CONSTRUCTION tab).
//
// When an admin expands an in-progress construction project and pages the
// per-laborer breakdown (Prev/Next), the panel must NOT flash an empty/loading
// state. fetchLaborSummary carries the previous page's data forward
// (`data: prev[projectId]?.data ?? null`) and LaborBreakdown keeps those rows
// visible while the next page is in-flight, only swapping them in once the new
// page resolves. This test guards that carry-over behavior:
//
//   • Expanding loads page 1 and renders its laborer row.
//   • Clicking Next holds the page-2 fetch pending; the page-1 rows stay
//     visible (no "LOADING LABOR BREAKDOWN..." flash, no empty state).
//   • Once page 2 resolves, its rows replace the page-1 rows.
//
// All network and browser-only dependencies are stubbed so the suite runs in
// jsdom without a server.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// apiFetch double: routes each call by path so expand + paging resolve
// deterministically. The page-2 labor-summary fetch is held pending via a
// manually-resolved promise so we can assert the in-flight render.
const apiFetchMock = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...(args as [string])),
}));

// framer-motion's AnimatePresence/motion conditionally mount children behind
// animations; stub them to plain divs so the expanded panel is present
// synchronously in jsdom.
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

// ── Import after mocks ───────────────────────────────────────────────────────
import { OrgLaborRequests } from "./OrgLaborRequests";

const PROJECT = {
  id: 42,
  label: "RECLAIMED TOWER",
  buildingType: "office",
  status: "in_progress",
  progress: 50,
  laborRequired: 100,
  laborApplied: 50,
  owningOrgId: "7",
  owningOrgName: "PICASSO CORP",
  openToDebtorLabor: true,
  debtorShifts: 3,
};

// Two pages of breakdown data — totalPages: 2 so the Prev/Next controls render.
const PAGE_1 = {
  projectId: 42,
  totalShifts: 5,
  debtorShifts: 3,
  totalUnits: 12,
  totalDebtForgiven: 4500,
  laborers: [
    { laborerId: "debtor-a", displayName: "@inmate_alpha", shifts: 2, totalUnits: 8, totalReward: 3000, lastShiftAt: "2026-06-10T12:00:00.000Z" },
  ],
  page: 1,
  totalPages: 2,
  totalDebtorLaborers: 2,
};
const PAGE_2 = {
  projectId: 42,
  totalShifts: 5,
  debtorShifts: 3,
  totalUnits: 12,
  totalDebtForgiven: 4500,
  laborers: [
    { laborerId: "debtor-b", displayName: "@inmate_beta", shifts: 1, totalUnits: 4, totalReward: 1500, lastShiftAt: "2026-06-11T12:00:00.000Z" },
  ],
  page: 2,
  totalPages: 2,
  totalDebtorLaborers: 2,
};

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

// Deferred for the page-2 fetch so the test controls when it resolves.
let resolvePage2: (r: Response) => void;
let page2Promise: Promise<Response>;

beforeEach(() => {
  apiFetchMock.mockReset();
  page2Promise = new Promise<Response>((res) => { resolvePage2 = res; });
  apiFetchMock.mockImplementation((path: string) => {
    if (path.startsWith("/api/construction/my-projects")) {
      return Promise.resolve(jsonResponse({ projects: [PROJECT] }));
    }
    if (path.startsWith("/api/world-build/plans")) {
      return Promise.resolve(jsonResponse({ plans: [] }));
    }
    if (path.startsWith("/api/construction/org-labor-summary")) {
      return Promise.resolve(jsonResponse({ orgId: 7, orgName: "PICASSO CORP", allTime: { shifts: 0, debtForgiven: 0, uniqueLaborers: 0 }, week: { shifts: 0, debtForgiven: 0, uniqueLaborers: 0 } }));
    }
    if (path.includes("/labor-summary")) {
      if (path.includes("page=2")) return page2Promise; // held pending
      return Promise.resolve(jsonResponse(PAGE_1));
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

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

// Expand the project row and wait for page 1 to settle.
async function expandProject() {
  const labelSpan = Array.from(container.querySelectorAll("span")).find(
    (s) => s.textContent === "RECLAIMED TOWER",
  );
  expect(labelSpan).toBeTruthy();
  const row = labelSpan!.closest("div.py-3") as HTMLElement | null;
  expect(row).toBeTruthy();
  const rowBtns = Array.from(row!.querySelectorAll("button"));
  const expandBtn = rowBtns[rowBtns.length - 1] as HTMLButtonElement;
  await act(async () => expandBtn.click());
  await flush();
}

describe("OrgLaborRequests — construction breakdown pagination", () => {
  it("keeps page-1 rows visible while page-2 loads, then swaps them in", async () => {
    await mount();
    await expandProject();

    // Page 1 loaded with its laborer row + pagination footer.
    expect(container.textContent).toContain("@inmate_alpha");
    expect(container.textContent).toContain("PAGE 1 / 2");

    // The "Next" page button is the last pagination control. Locate it via the
    // pagination footer ("PAGE 1 / 2").
    const pageLabel = Array.from(container.querySelectorAll("span")).find(
      (s) => (s.textContent ?? "").includes("PAGE 1 / 2"),
    );
    expect(pageLabel).toBeTruthy();
    const pager = pageLabel!.parentElement as HTMLElement;
    const pagerBtns = Array.from(pager.querySelectorAll("button"));
    const nextBtn = pagerBtns[pagerBtns.length - 1] as HTMLButtonElement;
    expect(nextBtn).toBeTruthy();

    // Click Next — the page-2 fetch is held pending.
    await act(async () => nextBtn.click());
    await flush();

    // The page-2 fetch fired.
    expect(
      apiFetchMock.mock.calls.some(([p]) =>
        String(p).includes("/api/construction/42/labor-summary") && String(p).includes("page=2"),
      ),
    ).toBe(true);

    // While page 2 is in-flight: the page-1 rows STAY visible — no flash of the
    // full-panel loading spinner or empty state, and page 2 hasn't arrived yet.
    const pending = container.textContent ?? "";
    expect(pending).toContain("@inmate_alpha");
    expect(pending).not.toContain("LOADING LABOR BREAKDOWN");
    expect(pending).not.toContain("NO DEBTOR SHIFTS LOGGED YET");
    expect(pending).not.toContain("@inmate_beta");

    // Resolve page 2 — its rows replace the page-1 rows.
    await act(async () => {
      resolvePage2(jsonResponse(PAGE_2));
      await flush();
    });
    await flush();

    const settled = container.textContent ?? "";
    expect(settled).toContain("@inmate_beta");
    expect(settled).not.toContain("@inmate_alpha");
    expect(settled).toContain("PAGE 2 / 2");
  });
});
