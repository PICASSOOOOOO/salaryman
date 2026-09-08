// @vitest-environment jsdom
//
// Guards LaborRecordSection — the profile panel that surfaces a player's CF
// (Collections Facility) work history after their debt is released.
//
// The section is intentionally invisible when count === 0 (no history), which
// means a broken API call or an empty payload silently hides it. These tests
// pin the two ends of the contract:
//
//   1. Visibility guard  — section renders nothing when count is 0.
//   2. Happy-path render — with history present: heading, total-payoff figure,
//      shift count, and individual entry rows all appear.
//   3. Multiple entries  — each row's kind label, org name, and payoff are
//      rendered; totalPayoff = sum of all entries.
//   4. API call target   — the section calls GET /api/cf/labor-history exactly
//      once on mount.

import { createElement } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// ── Hoist mutable state before any imports ───────────────────────────────────
const h = vi.hoisted(() => ({ apiFetch: vi.fn() }));

// ── Mock every module that Profile.tsx imports at the top level ──────────────
// (LaborRecordSection lives in Profile.tsx, so all its sibling imports are
//  loaded too. We stub out everything except the component under test.)

vi.mock("@/lib/api-client", () => ({ apiFetch: h.apiFetch }));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ isAuthenticated: true, user: null }),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useBoomerMode: () => [false, vi.fn()] as [boolean, (v: boolean) => void],
}));

vi.mock("@/hooks/use-plan", () => ({
  usePlan: () => ({ isPro: false, isOwner: false, features: [] }),
}));

vi.mock("@/hooks/use-org", () => ({
  useOrg: () => ({ org: null }),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/profile", vi.fn()],
  Link: ({ children, ...rest }: any) => createElement("a", rest, children),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock("@/lib/lowGfx", () => ({
  useLowGfx: () => [false, vi.fn()],
}));

vi.mock("@/lib/commsAlerts", () => ({
  useCommsAlerts: () => ({ unread: 0 }),
  useCommsCityDnd: () => [false, vi.fn()],
}));

vi.mock("@/lib/avatar", () => ({
  resolveAvatarUrl: (url: string) => url ?? "",
}));

vi.mock("@/lib/modules", () => ({ PROFILE_MODULES: [] }));

vi.mock("@/components/LanguageSelector", () => ({
  LanguageSelector: () => null,
}));

vi.mock("@/components/CurrencySelector", () => ({
  CurrencySelector: () => null,
}));

vi.mock("@/components/FeedbackModal", () => ({
  FeedbackModal: () => null,
}));

vi.mock("@/components/SignInPrompt", () => ({
  SignInPage: () => null,
}));

vi.mock("@/components/GoogleLinkSection", () => ({ default: () => null }));
vi.mock("@/components/GithubLinkSection", () => ({ default: () => null }));
vi.mock("@/components/DiscordLinkSection", () => ({ default: () => null }));

vi.mock("@/components/ReferralPanel", () => ({ ReferralPanel: () => null }));

// framer-motion: render motion.section/div as plain elements so jsdom doesn't
// choke on animation props.
vi.mock("framer-motion", async () => {
  const motion = new Proxy({} as Record<string, unknown>, {
    get: (_t, tag: string) =>
      ({ children, animate, initial, transition, ...rest }: any) =>
        createElement(tag === "svg" ? "svg" : "div", rest, children),
  });
  return { motion, AnimatePresence: ({ children }: any) => children };
});

// ── Import the component under test (after all mocks are set up) ─────────────
import { LaborRecordSection } from "./Profile";

// ── Helpers ──────────────────────────────────────────────────────────────────

function jsonOk(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  });
}

function makeLaborHistory(
  entries: Array<{ kind: string; orgId: string; orgName: string; payoff: number }>,
) {
  const history = entries.map((e, i) => ({
    id: `task-${i + 1}`,
    source: "task" as const,
    kind: e.kind,
    orgId: e.orgId,
    orgName: e.orgName,
    payoff: e.payoff,
    createdAt: new Date("2026-03-15T10:00:00Z").toISOString(),
  }));
  const totalPayoff = history.reduce((s, e) => s + e.payoff, 0);
  return { history, totalPayoff, count: history.length };
}

// ── Test suite ───────────────────────────────────────────────────────────────

describe("LaborRecordSection", () => {
  let root: Root;
  let container: HTMLDivElement;

  async function render(boomerMode = false) {
    await act(async () => {
      root.render(<LaborRecordSection boomerMode={boomerMode} />);
    });
    // Flush the apiFetch microtask + React state update
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    h.apiFetch.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  // ── 1. Visibility guard ────────────────────────────────────────────────────

  it("renders nothing when count is 0 (no CF history)", async () => {
    h.apiFetch.mockReturnValue(jsonOk({ history: [], totalPayoff: 0, count: 0 }));
    await render();
    expect(container.textContent).toBe("");
  });

  it("renders nothing while loading (before the fetch resolves)", async () => {
    let resolve!: (v: unknown) => void;
    h.apiFetch.mockReturnValue(new Promise((r) => { resolve = r; }));
    // Mount but do NOT flush — section should be hidden during loading.
    await act(async () => {
      root.render(<LaborRecordSection boomerMode={false} />);
    });
    expect(container.textContent).toBe("");
    // Resolve so afterEach cleanup doesn't leave a dangling promise.
    resolve({ ok: true, json: () => Promise.resolve({ history: [], totalPayoff: 0, count: 0 }) });
  });

  it("renders nothing when the API call fails", async () => {
    h.apiFetch.mockReturnValue(Promise.reject(new Error("network error")));
    await render();
    expect(container.textContent).toBe("");
  });

  it("renders nothing when the API returns ok:false", async () => {
    h.apiFetch.mockReturnValue(
      Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) }),
    );
    await render();
    expect(container.textContent).toBe("");
  });

  // ── 2. Happy-path render ───────────────────────────────────────────────────

  it("shows LABOR RECORD heading when history is present", async () => {
    const payload = makeLaborHistory([
      { kind: "bug", orgId: "org-1", orgName: "Acme Corp", payoff: 1500 },
    ]);
    h.apiFetch.mockReturnValue(jsonOk(payload));
    await render();

    expect(container.textContent).toContain("LABOR RECORD");
  });

  it("shows 'Labor Record' heading in boomer mode", async () => {
    const payload = makeLaborHistory([
      { kind: "build", orgId: "org-2", orgName: "Build LLC", payoff: 500 },
    ]);
    h.apiFetch.mockReturnValue(jsonOk(payload));
    await render(true);

    const txt = container.textContent ?? "";
    expect(txt).toContain("Labor Record");
    expect(txt).not.toContain("LABOR RECORD");
  });

  it("displays the total payoff figure", async () => {
    const payload = makeLaborHistory([
      { kind: "bug", orgId: "org-1", orgName: "Acme Corp", payoff: 1500 },
    ]);
    h.apiFetch.mockReturnValue(jsonOk(payload));
    await render();

    const txt = container.textContent ?? "";
    expect(txt).toContain("1,500");
    expect(txt).toContain("Total Payoff");
  });

  it("displays the shift count", async () => {
    const payload = makeLaborHistory([
      { kind: "ad", orgId: "org-1", orgName: "Acme Corp", payoff: 500 },
    ]);
    h.apiFetch.mockReturnValue(jsonOk(payload));
    await render();

    const txt = container.textContent ?? "";
    expect(txt).toContain("Shifts");
    expect(txt).toContain("1"); // count = 1
  });

  it("shows the org name for each entry", async () => {
    const payload = makeLaborHistory([
      { kind: "build", orgId: "org-42", orgName: "Pixel Corp", payoff: 1000 },
    ]);
    h.apiFetch.mockReturnValue(jsonOk(payload));
    await render();

    expect(container.textContent).toContain("Pixel Corp");
  });

  it("maps kind codes to human labels (bug → Bug Report)", async () => {
    const payload = makeLaborHistory([
      { kind: "bug", orgId: "org-1", orgName: "Acme Corp", payoff: 1500 },
    ]);
    h.apiFetch.mockReturnValue(jsonOk(payload));
    await render();

    expect(container.textContent).toContain("Bug Report");
  });

  it("falls back to uppercase kind when no label mapping exists", async () => {
    const payload = makeLaborHistory([
      { kind: "mystery_task", orgId: "org-1", orgName: "Acme Corp", payoff: 300 },
    ]);
    h.apiFetch.mockReturnValue(jsonOk(payload));
    await render();

    expect(container.textContent).toContain("MYSTERY_TASK");
  });

  // ── 3. Multiple entries ────────────────────────────────────────────────────

  it("renders all entry rows and sums totalPayoff correctly", async () => {
    const payload = makeLaborHistory([
      { kind: "bug", orgId: "org-a", orgName: "Alpha LLC", payoff: 1500 },
      { kind: "feature", orgId: "org-b", orgName: "Beta Corp", payoff: 1500 },
      { kind: "label", orgId: "org-c", orgName: "Gamma Inc", payoff: 250 },
    ]);
    h.apiFetch.mockReturnValue(jsonOk(payload));
    await render();

    const txt = container.textContent ?? "";
    expect(txt).toContain("Alpha LLC");
    expect(txt).toContain("Beta Corp");
    expect(txt).toContain("Gamma Inc");

    // totalPayoff = 1500 + 1500 + 250 = 3,250   count = 3
    expect(txt).toContain("3,250");
    expect(txt).toContain("Shifts");
  });

  it("renders both task and construction source entries", async () => {
    const history = [
      {
        id: "task-1",
        source: "task" as const,
        kind: "bug",
        orgId: "org-task",
        orgName: "Task Org",
        payoff: 1500,
        createdAt: new Date("2026-03-10T10:00:00Z").toISOString(),
      },
      {
        id: "construction-1",
        source: "construction" as const,
        kind: "construction",
        orgId: "org-build",
        orgName: "Build Org",
        payoff: 200,
        createdAt: new Date("2026-03-11T10:00:00Z").toISOString(),
      },
    ];
    const payload = { history, totalPayoff: 1700, count: 2 };
    h.apiFetch.mockReturnValue(jsonOk(payload));
    await render();

    const txt = container.textContent ?? "";
    expect(txt).toContain("Task Org");
    expect(txt).toContain("Build Org");
    expect(txt).toContain("1,700");
  });

  // ── 4. API call target ─────────────────────────────────────────────────────

  it("calls GET /api/cf/labor-history exactly once on mount", async () => {
    h.apiFetch.mockReturnValue(jsonOk({ history: [], totalPayoff: 0, count: 0 }));
    await render();
    expect(h.apiFetch).toHaveBeenCalledOnce();
    expect(h.apiFetch).toHaveBeenCalledWith("/api/cf/labor-history");
  });
});
