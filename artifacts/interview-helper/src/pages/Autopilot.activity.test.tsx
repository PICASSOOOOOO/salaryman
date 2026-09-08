// @vitest-environment jsdom
//
// Guards the AGENT AUTOPILOT live ACTIVITY LOG on the Autopilot page. The
// dashboard renders a feed backed by two endpoints: GET /api/autopilot seeds
// the first page (inside its payload.activity), and GET /api/autopilot/activity
// serves filtered + cursor-paged follow-ups (filter changes, live polling, and
// the LOAD OLDER button). None of that feed behavior had a front-end test.
//
// It mounts the real Autopilot component with apiFetch + useAuth mocked, driving
// the activity endpoint with a configurable responder, then asserts:
//   • the outcome summary strip (SUCCESS / NO-OP / BLOCKED / ERROR) counts match
//     exactly the outcomes of the rows actually rendered below
//   • clicking a domain filter chip refetches with ?domain=<domain> and renders
//     only that domain's rows
//   • LOAD OLDER pages back using the OLDEST visible row id as the `before`
//     cursor, appends the next page, and de-dupes an overlapping row
//
// A regression that showed the wrong rows for a filter, miscounted the outcome
// summary, or broke the load-older cursor / de-dupe would be caught here.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Signed-in so the page loads its control surface instead of the sign-in prompt.
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock("@/components/SignInPrompt", () => ({ SignInPage: () => null }));

interface ActivityRow {
  id: number;
  domain: string;
  botId: number | null;
  action: string;
  summary: string;
  outcome: string;
  createdAt: string;
}

// Per-test seed feed (served inside GET /autopilot) and the responder that
// answers GET /autopilot/activity?<params>. Both are reset in beforeEach.
let seedActivity: ActivityRow[] = [];
let onActivityRequest: (params: URLSearchParams) => { activity: ActivityRow[]; hasMore: boolean };
// Lets a test force the NEXT /autopilot/activity calls to fail, exercising the
// silent error handling in loadActivity / loadMoreActivity. Reset each test.
let activityFailure: "none" | "non-ok" | "throw" = "none";

const jsonRes = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body } as unknown as Response);

const apiFetch = vi.fn(async (path: string) => {
  if (path === "/autopilot") {
    return jsonRes({ ...basePayload(), activity: seedActivity });
  }
  if (String(path).startsWith("/autopilot/activity")) {
    if (activityFailure === "throw") throw new Error("network down");
    if (activityFailure === "non-ok") {
      return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
    }
    const qs = String(path).split("?")[1] ?? "";
    return jsonRes(onActivityRequest(new URLSearchParams(qs)));
  }
  return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
});
vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => (apiFetch as any)(...args),
}));

import Autopilot from "./Autopilot";

// Mirror the component's internal constants (they aren't exported).
const ACTIVITY_POLL_MS = 15000;
const ACTIVITY_PAGE_SIZE = 50;

// Minimal control surface — four OFF domains plus the option metadata the cards
// need to render. The feed is what these tests actually exercise.
function basePayload() {
  return {
    orgId: 1,
    meta: {
      business_ops: { label: "Business Ops", description: "Runs day-to-day operations." },
      marketing: { label: "Marketing", description: "Plans and publishes campaigns." },
      crm_calls: { label: "CRM & Calls", description: "Works the lead pipeline." },
      accounting: { label: "Accounting", description: "Keeps the books." },
    },
    defaults: { cadenceMinutes: 60, maxActionsPerTick: 5 },
    marketing: { tones: ["professional"], platforms: [{ id: "twitter", label: "X / Twitter" }] },
    crm: { leadStatuses: [{ id: "new", label: "New" }] },
    bots: [{ id: 10, name: "Pablo", status: "active", department: "Ops" }],
    domains: (["business_ops", "marketing", "crm_calls", "accounting"] as const).map((domain) => ({
      orgId: 1,
      domain,
      enabled: false,
      botId: null,
      cadenceMinutes: null,
      maxActionsPerTick: null,
      budgetCapCents: null,
      prefs: {},
      lastRunAt: null,
      exists: false,
      updatedBy: null,
    })),
    activity: [] as ActivityRow[],
  };
}

function row(id: number, domain: string, outcome: string, summary = `event-${id}`): ActivityRow {
  return {
    id,
    domain,
    botId: null,
    action: "tick",
    summary,
    outcome,
    createdAt: new Date(Date.now() - id * 1000).toISOString(),
  };
}

let root: Root;
let container: HTMLDivElement;

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount() {
  await act(async () => {
    root.render(<Autopilot />);
  });
  await flush();
}

function findButton(label: string): HTMLButtonElement {
  const btn = Array.from(container.querySelectorAll("button")).find(
    (b) => (b.textContent ?? "").trim() === label,
  ) as HTMLButtonElement | undefined;
  if (!btn) throw new Error(`no button labelled "${label}"`);
  return btn;
}

async function click(btn: HTMLButtonElement) {
  await act(async () => {
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
}

// Drive the fake-timer clock forward, flushing the microtasks the timer
// callback kicks off (loadActivity -> apiFetch -> json -> setState).
async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  await flush();
}

// Override the document's visibility (jsdom doesn't change it on its own); the
// poll effect only refetches while the page is `visible`.
function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

// The feed rows live in the list container (the only `.divide-y`). Each row's
// first <span> is its outcome label (SUCCESS / NO-OP / BLOCKED / ERROR).
function rowList(): HTMLElement {
  const el = container.querySelector(".divide-y") as HTMLElement | null;
  if (!el) throw new Error("no activity list container");
  return el;
}
function renderedRowOutcomes(): string[] {
  return Array.from(rowList().children)
    .map((rowEl) => (rowEl.querySelector("span")?.textContent ?? "").trim())
    .filter((t) => t.length > 0);
}

// Outcome summary chips: each count is the `tabular-nums` span; its preceding
// sibling span holds the label. (Only the summary strip uses tabular-nums.)
function summaryChips(): { label: string; count: number }[] {
  return Array.from(container.querySelectorAll("span.tabular-nums")).map((c) => ({
    label: (c.previousElementSibling?.textContent ?? "").trim(),
    count: Number((c.textContent ?? "").trim()),
  }));
}

// The empty-state notice and the page-level error banner both live outside the
// row list; these locate them so a test can assert what is (and isn't) shown.
function emptyStateText(): string {
  return (rowList().textContent ?? "").trim();
}
function pageError(): HTMLElement | null {
  // Both the page-level error banner and the inline "couldn't refresh activity
  // log" retry banner share `bg-amber-500/10`. Match the page banner's unique
  // class combo (border-amber-500/20 + text-amber-400) so an inline activity
  // refetch failure isn't mistaken for a page error.
  return (
    (Array.from(container.querySelectorAll("div")).find(
      (d) =>
        d.className.includes("border-amber-500/20") &&
        d.className.includes("text-amber-400"),
    ) as HTMLElement | undefined) ?? null
  );
}

beforeEach(() => {
  seedActivity = [];
  onActivityRequest = () => ({ activity: [], hasMore: false });
  activityFailure = "none";
  apiFetch.mockClear();
  setVisibility("visible");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
});

describe("Autopilot activity feed", () => {
  it("summary counts match the outcomes of the rendered rows", async () => {
    // 3 success, 2 no-op, 1 blocked, 1 error — mixed across domains.
    seedActivity = [
      row(70, "business_ops", "success"),
      row(69, "marketing", "success"),
      row(68, "crm_calls", "success"),
      row(67, "accounting", "noop"),
      row(66, "business_ops", "noop"),
      row(65, "marketing", "blocked"),
      row(64, "crm_calls", "error"),
    ];

    await mount();

    // Every rendered row is present.
    expect(renderedRowOutcomes()).toHaveLength(7);

    const chips = summaryChips();
    const byLabel = Object.fromEntries(chips.map((c) => [c.label, c.count]));
    expect(byLabel).toEqual({ SUCCESS: 3, "NO-OP": 2, BLOCKED: 1, ERROR: 1 });

    // And each chip equals the count of matching rows actually rendered.
    const labels = renderedRowOutcomes();
    for (const chip of chips) {
      const expected = labels.filter((l) => l === chip.label).length;
      expect(chip.count, `chip ${chip.label} should match rendered rows`).toBe(expected);
    }
  });

  it("switching a domain filter chip refetches that domain and renders only its rows", async () => {
    seedActivity = [
      row(70, "business_ops", "success"),
      row(69, "marketing", "success"),
      row(68, "crm_calls", "error"),
    ];
    // The activity endpoint returns ONLY the requested domain's rows.
    onActivityRequest = (params) => {
      const domain = params.get("domain");
      if (domain === "marketing") {
        return {
          activity: [row(69, "marketing", "success"), row(60, "marketing", "noop")],
          hasMore: false,
        };
      }
      return { activity: [], hasMore: false };
    };

    await mount();
    apiFetch.mockClear();

    await click(findButton("MARKETING"));

    // Refetched the feed scoped to the marketing domain.
    const activityCalls = apiFetch.mock.calls
      .map((c) => String(c[0]))
      .filter((p) => p.startsWith("/autopilot/activity"));
    expect(activityCalls.length).toBeGreaterThan(0);
    expect(activityCalls.every((p) => p.includes("domain=marketing"))).toBe(true);

    // Only marketing rows render (both belong to Marketing, none from other domains).
    const rows = Array.from(rowList().children).map((r) => r.textContent ?? "");
    expect(rows).toHaveLength(2);
    expect(rows.every((t) => t.includes("Marketing"))).toBe(true);
    expect(rows.some((t) => t.includes("Business Ops"))).toBe(false);
    expect(rows.some((t) => t.includes("CRM & Calls"))).toBe(false);
  });

  it("LOAD OLDER pages back using the oldest row id as the cursor and de-dupes", async () => {
    // A full first page (>= page size) so the feed reports more is available.
    const page1: ActivityRow[] = [];
    for (let id = 100; id >= 51; id--) page1.push(row(id, "business_ops", "success"));
    seedActivity = page1; // newest-first; oldest visible id is 51

    let beforeSeen: string | null = null;
    onActivityRequest = (params) => {
      beforeSeen = params.get("before");
      // Second page: row 51 OVERLAPS the first page (must be de-duped), plus two
      // genuinely older rows.
      return {
        activity: [row(51, "business_ops", "success"), row(50, "business_ops", "noop"), row(49, "business_ops", "error")],
        hasMore: false,
      };
    };

    await mount();
    expect(renderedRowOutcomes()).toHaveLength(50);

    await click(findButton("LOAD OLDER"));

    // Cursor was the OLDEST visible row id (51), not the newest.
    expect(beforeSeen).toBe("51");

    const text = rowList().textContent ?? "";
    // The overlapping row appears exactly once (de-duped).
    expect((text.match(/event-51(?![0-9])/g) ?? []).length).toBe(1);
    // The two genuinely older rows were appended.
    expect(text).toContain("event-50");
    expect(text).toContain("event-49");
    // 50 original + 2 new (51 de-duped) = 52 rows.
    expect(renderedRowOutcomes()).toHaveLength(52);
  });

  it("the empty-state message switches with the active domain filter", async () => {
    // Nothing logged anywhere, so every filter lands on its empty state.
    seedActivity = [];
    onActivityRequest = () => ({ activity: [], hasMore: false });

    await mount();

    // No rows render, just the generic empty notice.
    expect(renderedRowOutcomes()).toHaveLength(0);
    expect(emptyStateText()).toBe("No autopilot activity yet.");

    // Scoping to a domain switches the notice to that domain's label.
    await click(findButton("MARKETING"));
    expect(renderedRowOutcomes()).toHaveLength(0);
    expect(emptyStateText()).toBe("No Marketing activity yet.");

    await click(findButton("CRM & CALLS"));
    expect(emptyStateText()).toBe("No CRM & Calls activity yet.");
  });

  it("a failed activity refetch leaves the existing feed intact and shows no page error", async () => {
    seedActivity = [
      row(70, "business_ops", "success"),
      row(69, "marketing", "success"),
      row(68, "crm_calls", "error"),
    ];

    await mount();
    expect(renderedRowOutcomes()).toHaveLength(3);
    expect(pageError()).toBeNull();

    // A non-ok GET /autopilot/activity (triggered by the filter switch) is
    // swallowed: the feed keeps its rows and no page-level error appears.
    activityFailure = "non-ok";
    await click(findButton("MARKETING"));
    expect(renderedRowOutcomes()).toHaveLength(3);
    expect(pageError()).toBeNull();

    // A thrown fetch is handled the same way — feed intact, still no error.
    activityFailure = "throw";
    await click(findButton("CRM & CALLS"));
    expect(renderedRowOutcomes()).toHaveLength(3);
    expect(pageError()).toBeNull();
  });

  it("a failed LOAD OLDER keeps the current rows and re-enables the button", async () => {
    // A full first page so the feed offers LOAD OLDER.
    const page1: ActivityRow[] = [];
    for (let id = 100; id >= 51; id--) page1.push(row(id, "business_ops", "success"));
    seedActivity = page1;

    await mount();
    expect(renderedRowOutcomes()).toHaveLength(50);

    // The paging request fails: existing rows are preserved, no page error, and
    // the button comes back enabled so the user can retry.
    activityFailure = "non-ok";
    await click(findButton("LOAD OLDER"));

    expect(renderedRowOutcomes()).toHaveLength(50);
    expect(pageError()).toBeNull();
    const btn = findButton("LOAD OLDER");
    expect(btn.disabled).toBe(false);
  });

  it("live polling refetches and re-renders newer rows after the poll interval", async () => {
    vi.useFakeTimers();
    setVisibility("visible");

    seedActivity = [row(70, "business_ops", "success")];
    // Until the server gets fresher data, the feed endpoint echoes the seed row.
    onActivityRequest = () => ({ activity: [row(70, "business_ops", "success")], hasMore: false });

    await mount();
    expect(renderedRowOutcomes()).toHaveLength(1);

    apiFetch.mockClear();
    // A newer event lands server-side, on top of the existing row.
    onActivityRequest = () => ({
      activity: [
        row(71, "marketing", "success", "fresh-event"),
        row(70, "business_ops", "success"),
      ],
      hasMore: false,
    });

    // One poll interval elapses while the page is visible.
    await advance(ACTIVITY_POLL_MS);

    const activityCalls = apiFetch.mock.calls
      .map((c) => String(c[0]))
      .filter((p) => p.startsWith("/autopilot/activity"));
    expect(activityCalls.length).toBeGreaterThan(0);

    // The feed snapped to the fresher window and re-rendered the new row.
    expect(renderedRowOutcomes()).toHaveLength(2);
    expect(rowList().textContent ?? "").toContain("fresh-event");
  });

  it("does not poll once the user has paged into older history", async () => {
    vi.useFakeTimers();
    setVisibility("visible");

    // A full first page so LOAD OLDER is offered.
    const page1: ActivityRow[] = [];
    for (let id = 100; id >= 51; id--) page1.push(row(id, "business_ops", "success"));
    seedActivity = page1;
    onActivityRequest = () => ({
      activity: [row(50, "business_ops", "noop"), row(49, "business_ops", "error")],
      hasMore: false,
    });

    await mount();
    expect(renderedRowOutcomes()).toHaveLength(50);

    // Page back so the feed grows past one page (paginatedRef becomes true).
    await click(findButton("LOAD OLDER"));
    expect(renderedRowOutcomes().length).toBeGreaterThan(ACTIVITY_PAGE_SIZE);

    apiFetch.mockClear();
    // Several poll intervals pass — polling must stay paused so it doesn't snap
    // the feed back to the latest page and discard the loaded history.
    await advance(ACTIVITY_POLL_MS * 3);

    const activityCalls = apiFetch.mock.calls
      .map((c) => String(c[0]))
      .filter((p) => p.startsWith("/autopilot/activity"));
    expect(activityCalls).toHaveLength(0);
    // The paged-in feed is left intact.
    expect(renderedRowOutcomes().length).toBeGreaterThan(ACTIVITY_PAGE_SIZE);
  });

  it("live polling is gated on the page being visible", async () => {
    vi.useFakeTimers();
    // Page starts hidden — the poll tick fires but must not refetch.
    setVisibility("hidden");

    seedActivity = [row(70, "business_ops", "success")];
    onActivityRequest = () => ({ activity: [row(70, "business_ops", "success")], hasMore: false });

    await mount();
    apiFetch.mockClear();

    await advance(ACTIVITY_POLL_MS * 2);
    let activityCalls = apiFetch.mock.calls
      .map((c) => String(c[0]))
      .filter((p) => p.startsWith("/autopilot/activity"));
    expect(activityCalls).toHaveLength(0);

    // Becoming visible again lets the very next tick refetch.
    setVisibility("visible");
    await advance(ACTIVITY_POLL_MS);
    activityCalls = apiFetch.mock.calls
      .map((c) => String(c[0]))
      .filter((p) => p.startsWith("/autopilot/activity"));
    expect(activityCalls.length).toBeGreaterThan(0);
  });
});
