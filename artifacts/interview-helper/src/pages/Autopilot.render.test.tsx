// @vitest-environment jsdom
//
// Renders the AGENT AUTOPILOT dashboard (Autopilot page) against a mocked
// GET /api/autopilot response and pins that the control surface correctly
// reflects what the server saved. The backend save/read paths already have
// integration tests; this is the missing FRONT-END guard that the dashboard
// component doesn't misread or drop the config it loads.
//
// It mounts the real Autopilot component with apiFetch and useAuth mocked, then
// asserts:
//   • all four domains render (by their meta labels)
//   • an ENABLED domain shows toggled ON, its assigned bot selected in the
//     ASSIGNED AGENT dropdown, its caps (cadence / max actions) populated, and
//     its saved prefs surfaced in the domain's prefs editor
//   • the OFF domains render as OFF
//   • the option metadata populates the relevant selectors — marketing tones
//     fill the TONE <select>, marketing platforms render as toggle buttons, and
//     the CRM lead statuses render as pipeline-stage buttons
//
// A regression where GET /api/autopilot returns correct data but the dashboard
// reads the wrong field (or drops a domain / option list) would be caught here.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Signed-in so the page loads its control surface instead of the sign-in prompt.
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock("@/components/SignInPrompt", () => ({ SignInPage: () => null }));

// apiFetch double: serve the saved control surface for GET /autopilot and an
// empty feed for the activity poll. No real network happens.
const apiFetch = vi.fn(async (path: string) => {
  if (path === "/autopilot") {
    return { ok: true, status: 200, json: async () => payload } as unknown as Response;
  }
  if (String(path).startsWith("/autopilot/activity")) {
    return { ok: true, status: 200, json: async () => ({ activity: [], hasMore: false }) } as unknown as Response;
  }
  return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
});
vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => (apiFetch as any)(...args),
}));

import Autopilot from "./Autopilot";

// A control surface as GET /api/autopilot would return it: Business Ops saved
// ON with a bot + caps + prefs, the other three domains OFF, plus the option
// metadata (marketing tones / platforms, CRM lead statuses).
const TONES = ["professional", "casual", "bold"];
const PLATFORMS = [
  { id: "twitter", label: "X / Twitter" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "bluesky", label: "Bluesky" },
];
const LEAD_STATUSES = [
  { id: "new", label: "New" },
  { id: "contacted", label: "Contacted" },
  { id: "qualified", label: "Qualified" },
  { id: "proposal", label: "Proposal" },
];

let payload: any;

function freshPayload() {
  return {
    orgId: 1,
    meta: {
      business_ops: { label: "Business Ops", description: "Runs day-to-day operations." },
      marketing: { label: "Marketing", description: "Plans and publishes campaigns." },
      crm_calls: { label: "CRM & Calls", description: "Works the lead pipeline." },
      accounting: { label: "Accounting", description: "Keeps the books." },
    },
    defaults: { cadenceMinutes: 60, maxActionsPerTick: 5 },
    marketing: { tones: TONES, platforms: PLATFORMS },
    crm: { leadStatuses: LEAD_STATUSES },
    bots: [
      { id: 10, name: "Pablo", status: "active", department: "Ops" },
      { id: 11, name: "Mila", status: "active", department: null },
    ],
    domains: [
      {
        orgId: 1,
        domain: "business_ops",
        enabled: true,
        botId: 10,
        cadenceMinutes: 30,
        maxActionsPerTick: 7,
        budgetCapCents: null,
        prefs: {
          staffTarget: 8,
          tasksPerTick: 3,
          closeStaleTimeEntries: true,
          postAnnouncements: true,
          announcementIntervalHours: 12,
        },
        lastRunAt: null,
        exists: true,
        updatedBy: "u1",
      },
      {
        orgId: 1,
        domain: "marketing",
        enabled: false,
        botId: null,
        cadenceMinutes: null,
        maxActionsPerTick: null,
        budgetCapCents: null,
        prefs: { platforms: ["twitter", "linkedin"], tone: "casual", topics: ["Launch"] },
        lastRunAt: null,
        exists: true,
        updatedBy: null,
      },
      {
        orgId: 1,
        domain: "crm_calls",
        enabled: false,
        botId: null,
        cadenceMinutes: null,
        maxActionsPerTick: null,
        budgetCapCents: null,
        prefs: { leadStatuses: ["new", "qualified"], followUpIntervalHours: 24, maxFollowUpsPerTick: 0 },
        lastRunAt: null,
        exists: true,
        updatedBy: null,
      },
      {
        orgId: 1,
        domain: "accounting",
        enabled: false,
        botId: null,
        cadenceMinutes: null,
        maxActionsPerTick: null,
        budgetCapCents: null,
        prefs: {},
        lastRunAt: null,
        exists: false,
        updatedBy: null,
      },
    ],
    activity: [],
  };
}

let root: Root;
let container: HTMLDivElement;

async function mount() {
  await act(async () => {
    root.render(<Autopilot />);
  });
  // Flush the load() promise chain (fetch → json → setState).
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

// The card for a domain is the nearest ancestor of its <h3> label that also
// contains the ASSIGNED AGENT <select>.
function cardFor(label: string): HTMLElement {
  const h3 = Array.from(container.querySelectorAll("h3")).find((h) => h.textContent === label);
  if (!h3) throw new Error(`no card heading for "${label}"`);
  let el: HTMLElement | null = h3;
  while (el && !el.querySelector("select")) el = el.parentElement;
  if (!el) throw new Error(`no card body for "${label}"`);
  return el;
}

// The ON/OFF toggle button inside a card (its text is exactly ON or OFF).
function toggleState(card: HTMLElement): string | null {
  const btn = Array.from(card.querySelectorAll("button")).find((b) => {
    const t = (b.textContent ?? "").trim();
    return t === "ON" || t === "OFF";
  });
  return btn ? (btn.textContent ?? "").trim() : null;
}

beforeEach(() => {
  payload = freshPayload();
  apiFetch.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe("Autopilot dashboard renders saved config", () => {
  it("renders all four domains from the loaded control surface", async () => {
    await mount();
    for (const label of ["Business Ops", "Marketing", "CRM & Calls", "Accounting"]) {
      const h3 = Array.from(container.querySelectorAll("h3")).find((h) => h.textContent === label);
      expect(h3, `domain card "${label}" should render`).toBeTruthy();
    }
  });

  it("shows an enabled domain toggled ON with its bot, caps and prefs", async () => {
    await mount();
    const card = cardFor("Business Ops");

    // Toggled ON.
    expect(toggleState(card)).toBe("ON");

    // ASSIGNED AGENT dropdown has the saved bot selected (botId 10 → "Pablo").
    const agentSelect = card.querySelector("select") as HTMLSelectElement;
    expect(agentSelect.value).toBe("10");
    const selectedOption = agentSelect.options[agentSelect.selectedIndex];
    expect(selectedOption.textContent).toContain("Pablo");

    // Caps reflect the saved cadence / max-actions, not the defaults.
    const numbers = Array.from(card.querySelectorAll('input[type="number"]')) as HTMLInputElement[];
    const [cadence, maxActions] = numbers;
    expect(cadence.value).toBe("30");
    expect(maxActions.value).toBe("7");

    // Saved prefs surface in the Business Ops prefs editor (staffTarget 8,
    // tasksPerTick 3, announce-every 12).
    const prefValues = numbers.map((n) => n.value);
    expect(prefValues).toContain("8");
    expect(prefValues).toContain("3");
    expect(prefValues).toContain("12");
  });

  it("renders the OFF domains as OFF", async () => {
    await mount();
    for (const label of ["Marketing", "CRM & Calls", "Accounting"]) {
      expect(toggleState(cardFor(label)), `${label} should be OFF`).toBe("OFF");
    }
  });

  it("populates marketing tones into the TONE selector", async () => {
    await mount();
    const card = cardFor("Marketing");
    // The card has two selects: ASSIGNED AGENT then TONE. Find the one whose
    // options match the tones option list.
    const selects = Array.from(card.querySelectorAll("select")) as HTMLSelectElement[];
    const toneSelect = selects.find((s) =>
      TONES.every((t) => Array.from(s.options).some((o) => o.value === t)),
    );
    expect(toneSelect, "TONE select should be populated from marketing.tones").toBeTruthy();
    // Saved tone ("casual") is the selected value.
    expect(toneSelect!.value).toBe("casual");
  });

  it("renders marketing platforms as toggle buttons with their labels", async () => {
    await mount();
    const card = cardFor("Marketing");
    const text = card.textContent ?? "";
    for (const p of PLATFORMS) {
      expect(text, `platform "${p.label}" should render`).toContain(p.label);
    }
    // Saved allowed platforms (twitter, linkedin) render as the SELECTED variant.
    const onButtons = Array.from(card.querySelectorAll("button")).filter((b) =>
      b.className.includes("bg-cyan-500/20"),
    );
    const onLabels = onButtons.map((b) => (b.textContent ?? "").trim());
    expect(onLabels).toContain("X / Twitter");
    expect(onLabels).toContain("LinkedIn");
  });

  it("renders the CRM lead statuses as pipeline-stage buttons", async () => {
    await mount();
    const card = cardFor("CRM & Calls");
    const text = card.textContent ?? "";
    for (const s of LEAD_STATUSES) {
      expect(text, `lead status "${s.label}" should render`).toContain(s.label);
    }
    // Saved stages (new, qualified) render as the SELECTED variant.
    const onButtons = Array.from(card.querySelectorAll("button")).filter((b) =>
      b.className.includes("bg-cyan-500/20"),
    );
    const onLabels = onButtons.map((b) => (b.textContent ?? "").trim());
    expect(onLabels).toContain("New");
    expect(onLabels).toContain("Qualified");
  });
});
