// @vitest-environment jsdom
//
// Integration test for the OrgLaborRequests expanded-PLAN panel.
//
// When an admin switches to the Plans tab and expands an org-owned World-Build
// Plan, the panel fetches GET /api/world-build/plans/:id/labor-summary and
// renders three stat tiles (SHIFTS / FORGIVEN / WORKERS) plus a per-laborer
// breakdown table. This test guards that flow end-to-end:
//
//   • Expanding a plan triggers the plan labor-summary fetch for that plan id.
//   • The per-laborer breakdown row renders the laborer's display name + the
//     "DEBTOR LABOR BREAKDOWN" heading.
//
// All network and browser-only dependencies are stubbed so the suite runs in
// jsdom without a server.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const apiFetchMock = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...(args as [string])),
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

const PLAN_LABOR_SUMMARY = {
  planId: 88,
  debtorShifts: 3,
  totalDebtForgiven: 4500,
  totalDebtorLaborers: 2,
  laborers: [
    {
      laborerId: "debtor-x",
      displayName: "@inmate_xray",
      shifts: 2,
      totalReward: 3000,
      lastShiftAt: "2026-06-12T12:00:00.000Z",
    },
  ],
  page: 1,
  totalPages: 1,
};

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation((path: string) => {
    if (path.startsWith("/api/construction/my-projects")) {
      return Promise.resolve(jsonResponse({ projects: [] }));
    }
    if (path.startsWith("/api/world-build/plans") && path.includes("/labor-summary")) {
      return Promise.resolve(jsonResponse(PLAN_LABOR_SUMMARY));
    }
    if (path.startsWith("/api/world-build/plans")) {
      return Promise.resolve(jsonResponse({ plans: [PLAN] }));
    }
    if (path.startsWith("/api/construction/org-labor-summary")) {
      return Promise.resolve(jsonResponse({ orgId: 7, orgName: "PICASSO CORP", allTime: { shifts: 0, debtForgiven: 0, uniqueLaborers: 0 }, week: { shifts: 0, debtForgiven: 0, uniqueLaborers: 0 } }));
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

describe("OrgLaborRequests — expanded plan labor breakdown", () => {
  it("fetches plan labor-summary and renders the per-laborer breakdown on expand", async () => {
    await mount();

    // Switch to the Plans tab.
    const plansTab = Array.from(container.querySelectorAll("button")).find(
      (b) => (b.textContent ?? "").toUpperCase().includes("BLUEPRINT"),
    );
    expect(plansTab).toBeTruthy();
    await act(async () => (plansTab as HTMLButtonElement).click());
    await flush();

    // The plan row renders after the plans list resolves.
    expect(container.textContent).toContain("RIVERSIDE PROMENADE");
    // No plan labor-summary fetch should have fired before expanding.
    expect(apiFetchMock.mock.calls.some(([p]) => String(p).includes("/world-build/plans/88/labor-summary"))).toBe(false);

    // Expand the plan via the chevron button (last button in the row).
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

    // The expand triggers the per-plan labor-summary fetch (with pagination).
    const summaryCall = apiFetchMock.mock.calls.find(([p]) =>
      String(p).includes("/api/world-build/plans/88/labor-summary"),
    );
    expect(summaryCall).toBeTruthy();
    expect(String(summaryCall![0])).toContain("page=1");

    // Stat tiles + per-laborer breakdown render the endpoint values.
    const text = container.textContent ?? "";
    expect(text).toContain("FORGIVEN");
    expect(text).toContain("4,500");
    expect(text).toContain("DEBTOR LABOR BREAKDOWN");
    expect(text).toContain("@inmate_xray");
  });
});
