// @vitest-environment jsdom
//
// Integration test for the OrgLaborRequests expanded-project panel.
//
// When an admin expands an in-progress construction project, the panel fetches
// GET /api/construction/:id/labor-summary and renders three stat tiles
// (SHIFTS / FORGIVEN / WORKERS) plus a per-laborer breakdown table. This test
// guards that flow end-to-end against the component:
//
//   • Expanding a project triggers the labor-summary fetch for that project id.
//   • The stat tiles render the values returned by the endpoint, including the
//     totalDebtForgiven figure (the "FORGIVEN" tile).
//   • The per-laborer breakdown row renders the laborer's display name + shifts.
//
// All network and browser-only dependencies are stubbed so the suite runs in
// jsdom without a server.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// apiFetch double: routes each call by path so expand can resolve the
// labor-summary fetch deterministically.
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

const LABOR_SUMMARY = {
  projectId: 42,
  totalShifts: 5,
  debtorShifts: 3,
  totalUnits: 12,
  totalDebtForgiven: 4500,
  laborers: [
    {
      laborerId: "debtor-a",
      displayName: "@inmate_alpha",
      shifts: 2,
      totalUnits: 8,
      totalReward: 3000,
      lastShiftAt: "2026-06-10T12:00:00.000Z",
    },
  ],
  page: 1,
  totalPages: 1,
  totalDebtorLaborers: 2,
};

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

beforeEach(() => {
  apiFetchMock.mockReset();
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
      return Promise.resolve(jsonResponse(LABOR_SUMMARY));
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

describe("OrgLaborRequests — expanded project labor breakdown", () => {
  it("fetches labor-summary and renders the FORGIVEN stat tile on expand", async () => {
    await mount();

    // The project row renders after my-projects resolves.
    expect(container.textContent).toContain("RECLAIMED TOWER");
    // No labor-summary fetch should have fired before expanding.
    expect(apiFetchMock.mock.calls.some(([p]) => String(p).includes("/labor-summary"))).toBe(false);

    // Find the project row (the label span lives inside it) and click its
    // chevron expand button — the last button in the row (no text, icon only).
    const labelSpan = Array.from(container.querySelectorAll("span")).find(
      (s) => s.textContent === "RECLAIMED TOWER",
    );
    expect(labelSpan).toBeTruthy();
    const row = labelSpan!.closest("div.py-3") as HTMLElement | null;
    expect(row).toBeTruthy();
    const rowBtns = Array.from(row!.querySelectorAll("button"));
    const expandBtn = rowBtns[rowBtns.length - 1] as HTMLButtonElement;
    expect(expandBtn).toBeTruthy();
    await act(async () => expandBtn.click());
    await flush();

    // The expand triggers the per-project labor-summary fetch.
    const summaryCall = apiFetchMock.mock.calls.find(([p]) =>
      String(p).includes("/api/construction/42/labor-summary"),
    );
    expect(summaryCall).toBeTruthy();

    // Stat tiles render the endpoint values: 3 shifts, ƒ4,500 forgiven, 2 workers.
    const text = container.textContent ?? "";
    expect(text).toContain("FORGIVEN");
    expect(text).toContain("4,500");
    expect(text).toContain("SHIFTS");
    expect(text).toContain("WORKERS");

    // The per-laborer breakdown row renders.
    expect(text).toContain("@inmate_alpha");
    expect(text).toContain("DEBTOR LABOR BREAKDOWN");
  });
});
