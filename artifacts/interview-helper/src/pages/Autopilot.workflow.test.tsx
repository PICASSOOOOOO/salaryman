// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock("@/components/SignInPrompt", () => ({ SignInPage: () => null }));

const payload: any = {
  orgId: 1,
  meta: {
    business_ops: { label: "Business Ops", description: "Day-to-day operations." },
    marketing: { label: "Marketing", description: "Draft and publish social posts." },
    crm_calls: { label: "CRM & Calls", description: "Consent-aware SMS follow-ups." },
    accounting: { label: "Accounting", description: "Collections, bills, and payroll." },
  },
  defaults: { cadenceMinutes: 60, maxActionsPerTick: 5 },
  marketing: { tones: ["professional"], platforms: [{ id: "linkedin", label: "LinkedIn" }] },
  crm: { leadStatuses: [{ id: "new", label: "New" }] },
  domains: ["business_ops", "marketing", "crm_calls", "accounting"].map((domain) => ({
    orgId: 1, domain, enabled: false, botId: null, cadenceMinutes: null,
    maxActionsPerTick: null, budgetCapCents: null, prefs: {}, lastRunAt: null,
    exists: false, updatedBy: null,
  })),
  activity: [],
};

const apiFetch = vi.fn(async (path: string, opts?: any) => {
  if (path.startsWith("/api/autopilot/") && opts?.method === "PUT") {
    const domain = path.split("/").pop();
    Object.assign(payload.domains.find((item: any) => item.domain === domain), JSON.parse(opts.body));
    return { ok: true, status: 200, json: async () => ({ ok: true }) } as unknown as Response;
  }
  if (path === "/api/autopilot") return { ok: true, status: 200, json: async () => payload } as unknown as Response;
  if (path.startsWith("/api/autopilot/activity")) {
    return { ok: true, status: 200, json: async () => ({ activity: [], hasMore: false }) } as unknown as Response;
  }
  return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
});
vi.mock("@/lib/api-client", () => ({ apiFetch: (...args: unknown[]) => (apiFetch as any)(...args) }));

import Autopilot from "./Autopilot";

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
  await act(async () => root.render(<Autopilot />));
  await flush();
}
async function click(el: Element) {
  await act(async () => el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
  await flush();
}
function card(domain: string) {
  const result = container.querySelector(`[data-autopilot-domain="${domain}"]`);
  if (!result) throw new Error(`missing ${domain} domain`);
  return result as HTMLElement;
}

beforeEach(() => {
  payload.domains.forEach((cfg: any) => { cfg.enabled = false; });
  apiFetch.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("fixed visual workflow editor", () => {
  it("renders fixed trigger, policy, action, and audit nodes for all four workflows", async () => {
    await mount();
    for (const domain of ["business_ops", "marketing", "crm_calls", "accounting"]) {
      const flow = card(domain).querySelector(`[data-workflow-domain="${domain}"]`);
      expect(flow).toBeTruthy();
      expect(flow?.textContent).toContain("FIXED TRIGGER");
      expect(flow?.textContent).toContain("POLICY GUARD");
      expect(flow?.textContent).toContain("AUDIT TRAIL");
      expect(flow?.querySelectorAll(".autopilot-flow-action")).not.toHaveLength(0);
      expect(flow?.textContent).toContain("PAUSED");
    }
    expect(container.textContent).toContain("not reorderable or executable by user code");
    expect(container.textContent).not.toMatch(/\b(RUN NOW|TEST WORKFLOW|EXECUTE CODE)\b/i);
  });

  it("keeps domains paused until opt-in and saves activation through the existing PUT", async () => {
    await mount();
    const crm = card("crm_calls");
    const toggle = crm.querySelector('[data-testid="toggle-workflow-crm_calls"]');
    expect(toggle?.textContent?.trim()).toContain("OFF");
    await click(toggle!);
    const activation = apiFetch.mock.calls.find(([path, opts]: any[]) =>
      path === "/api/autopilot/crm_calls" && opts?.method === "PUT",
    );
    expect(JSON.parse((activation?.[1] as any).body)).toEqual({ enabled: true });
    expect(card("crm_calls").querySelector(".autopilot-flow-state")?.textContent).toBe("ARMED");
  });

  it("shows real domain-specific actions and their existing configurable preferences", async () => {
    await mount();
    const expected: Record<string, string[]> = {
      business_ops: ["Advance tasks + staffing", "Close prior-day time entries", "Rate-limited ops update", "TASKS ADVANCED / TICK"],
      marketing: ["Draft with saved tone + topics", "Publish through social service", "TONE", "TOPICS / THEMES"],
      crm_calls: ["Select eligible due leads", "Suppress opted-out contacts", "Send consent-aware SMS only", "PIPELINE STAGES"],
      accounting: ["Review collections", "Pay due bills when cash permits", "Run payroll by saved period", "PAYROLL PERIOD (DAYS)"],
    };
    for (const [domain, labels] of Object.entries(expected)) {
      const text = card(domain).textContent ?? "";
      for (const label of labels) expect(text).toContain(label);
    }
    expect(card("crm_calls").textContent).toContain("SMS only");
    expect(card("crm_calls").textContent).not.toContain("automated calls");
  });

  it("provides named, stacked workflow regions and readable controls for narrow phones", async () => {
    await mount();
    expect(container.querySelector('[aria-label="Marketing workflow"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Marketing fixed actions"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Enable Marketing scheduled workflow"]')).toBeTruthy();
    expect(container.querySelector('label')?.textContent).toContain("CADENCE");
    // Mobile layout is a single-column flow at widths under 760px; this class
    // and label contract lets the CSS stay testable without a browser layout engine.
    expect(container.querySelector(".autopilot-flow-frame")).toBeTruthy();
    expect(container.textContent).toContain("Every saved cadence");
  });
});