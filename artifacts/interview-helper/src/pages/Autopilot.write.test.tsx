// @vitest-environment jsdom
//
// Complements Autopilot.render.test.tsx (which pins the READ path) by guarding
// the WRITE path: when the user toggles a domain, picks a bot, edits the
// cadence / max-actions caps, or saves a prefs editor, the dashboard must issue
// the right PUT /api/autopilot/<domain> with the right method and body — and
// then reload the control surface (GET /api/autopilot) so the saved value is
// reflected.
//
// It mounts the real Autopilot component with apiFetch and useAuth mocked, then
// for each interaction asserts:
//   • a PUT /autopilot/<domain> fired, with method PUT, JSON content-type, and
//     the expected body (enabled / botId / cadenceMinutes / maxActionsPerTick /
//     prefs)
//   • a GET /autopilot reload followed that PUT
//
// A regression that silently drops a user's change (broken onClick/onBlur, a
// malformed body, or a missing reload) would be caught here.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock("@/components/SignInPrompt", () => ({ SignInPage: () => null }));

// apiFetch double. Serves the saved control surface for GET /autopilot, an empty
// feed for the activity poll, and accepts PUT /autopilot/<domain> writes
// (reflecting the body back into the payload so the reload shows the change).
const apiFetch = vi.fn(async (path: string, opts?: any) => {
  if (typeof path === "string" && path.startsWith("/autopilot/") && opts?.method === "PUT") {
    const domain = path.slice("/autopilot/".length);
    const body = JSON.parse(opts.body);
    const cfg = payload.domains.find((d: any) => d.domain === domain);
    if (cfg) Object.assign(cfg, body);
    return { ok: true, status: 200, json: async () => ({ ok: true }) } as unknown as Response;
  }
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

async function flush() {
  await act(async () => {
    await Promise.resolve();
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

// The top ON/OFF toggle button inside a card (its text is exactly ON or OFF —
// the ToggleRow buttons in the prefs editors carry extra label text).
function topToggle(card: HTMLElement): HTMLButtonElement {
  const btn = Array.from(card.querySelectorAll("button")).find((b) => {
    const t = (b.textContent ?? "").trim();
    return t === "ON" || t === "OFF";
  });
  if (!btn) throw new Error("no ON/OFF toggle in card");
  return btn as HTMLButtonElement;
}

function saveBtn(card: HTMLElement): HTMLButtonElement {
  const btn = Array.from(card.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").includes("SAVE PREFERENCES"),
  );
  if (!btn) throw new Error("no SAVE PREFERENCES button in card");
  return btn as HTMLButtonElement;
}

function setNativeValue(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) {
  const proto = Object.getPrototypeOf(el);
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  desc!.set!.call(el, value);
}

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await flush();
}

async function changeSelect(sel: HTMLSelectElement, value: string) {
  await act(async () => {
    setNativeValue(sel, value);
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await flush();
}

async function blurNumber(input: HTMLInputElement, value: number) {
  await act(async () => {
    setNativeValue(input, String(value));
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  await flush();
}

// Like blurNumber but takes the raw string verbatim, so tests can exercise
// blank / non-numeric input on the uncontrolled cadence / max-actions fields.
async function blurRaw(input: HTMLInputElement, raw: string) {
  await act(async () => {
    setNativeValue(input, raw);
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  await flush();
}

// Fire a controlled-input change (React's onChange listens on "input"), used
// for the numeric prefs fields which hold their value in component state.
async function changeNumber(input: HTMLInputElement, value: number) {
  await act(async () => {
    setNativeValue(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await flush();
}

// All PUTs issued for a domain, newest last.
function putCalls(domain: string) {
  return apiFetch.mock.calls.filter(
    (c: any[]) => c[0] === `/autopilot/${domain}` && c[1]?.method === "PUT",
  );
}

function lastPut(domain: string) {
  const calls = putCalls(domain);
  return calls.length ? calls[calls.length - 1] : null;
}

function callIndex(predicate: (c: any[]) => boolean, from = 0): number {
  for (let i = from; i < apiFetch.mock.calls.length; i++) {
    if (predicate(apiFetch.mock.calls[i] as any[])) return i;
  }
  return -1;
}

// Asserts the most recent PUT for `domain` carried the right verb + headers +
// body, and that a GET /autopilot reload followed it.
function expectSavedAndReloaded(domain: string, body: unknown) {
  const put = lastPut(domain);
  expect(put, `expected a PUT /autopilot/${domain}`).toBeTruthy();
  const opts = put![1];
  expect(opts.method).toBe("PUT");
  expect(opts.headers["Content-Type"]).toBe("application/json");
  expect(JSON.parse(opts.body)).toEqual(body);

  const putIdx = callIndex((c) => c[0] === `/autopilot/${domain}` && c[1]?.method === "PUT");
  const reloadIdx = callIndex((c) => c[0] === "/autopilot" && (!c[1] || !c[1].method), putIdx + 1);
  expect(reloadIdx, "expected a GET /autopilot reload after the PUT").toBeGreaterThan(putIdx);
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

describe("Autopilot dashboard saves changes to the server", () => {
  it("toggling a domain PUTs the flipped enabled flag and reloads", async () => {
    await mount();
    apiFetch.mockClear();

    const card = cardFor("Business Ops");
    expect((topToggle(card).textContent ?? "").trim()).toBe("ON");
    await click(topToggle(card));

    expectSavedAndReloaded("business_ops", { enabled: false });
  });

  it("picking an agent PUTs the selected botId (numeric) and reloads", async () => {
    await mount();
    apiFetch.mockClear();

    const card = cardFor("Business Ops");
    const agentSelect = card.querySelector("select") as HTMLSelectElement;
    await changeSelect(agentSelect, "11");

    expectSavedAndReloaded("business_ops", { botId: 11 });
  });

  it("clearing the agent PUTs botId null and reloads", async () => {
    await mount();
    apiFetch.mockClear();

    const card = cardFor("Business Ops");
    const agentSelect = card.querySelector("select") as HTMLSelectElement;
    await changeSelect(agentSelect, "");

    expectSavedAndReloaded("business_ops", { botId: null });
  });

  it("editing the cadence cap (onBlur) PUTs cadenceMinutes and reloads", async () => {
    await mount();
    apiFetch.mockClear();

    const card = cardFor("Business Ops");
    const numbers = Array.from(card.querySelectorAll('input[type="number"]')) as HTMLInputElement[];
    await blurNumber(numbers[0], 45); // cadence is the first number input

    expectSavedAndReloaded("business_ops", { cadenceMinutes: 45 });
  });

  it("editing the max-actions cap (onBlur) PUTs maxActionsPerTick and reloads", async () => {
    await mount();
    apiFetch.mockClear();

    const card = cardFor("Business Ops");
    const numbers = Array.from(card.querySelectorAll('input[type="number"]')) as HTMLInputElement[];
    await blurNumber(numbers[1], 9); // max-actions is the second number input

    expectSavedAndReloaded("business_ops", { maxActionsPerTick: 9 });
  });

  it("an unchanged cadence blur does NOT issue a PUT", async () => {
    await mount();
    apiFetch.mockClear();

    const card = cardFor("Business Ops");
    const numbers = Array.from(card.querySelectorAll('input[type="number"]')) as HTMLInputElement[];
    await blurNumber(numbers[0], 30); // same as the saved cadenceMinutes

    expect(putCalls("business_ops")).toHaveLength(0);
  });

  it("saving the Business Ops prefs editor PUTs the prefs object and reloads", async () => {
    await mount();
    apiFetch.mockClear();

    const card = cardFor("Business Ops");
    await click(saveBtn(card));

    expectSavedAndReloaded("business_ops", {
      prefs: {
        staffTarget: 8,
        tasksPerTick: 3,
        closeStaleTimeEntries: true,
        postAnnouncements: true,
        announcementIntervalHours: 12,
      },
    });
  });

  it("saving the Marketing prefs editor PUTs platforms/tone/topics and reloads", async () => {
    await mount();
    apiFetch.mockClear();

    const card = cardFor("Marketing");
    await click(saveBtn(card));

    expectSavedAndReloaded("marketing", {
      prefs: { platforms: ["twitter", "linkedin"], tone: "casual", topics: ["Launch"] },
    });
  });
});

// The HTML min/max on these inputs are only hints — a user can still type or
// paste anything. The dashboard must never PUT a value outside the declared
// range (nor a fractional / non-numeric one). The contract:
//   • cadence / max-actions (onBlur): clamp finite numbers into range and round
//     to a whole number; a blank or non-numeric field is REJECTED (no PUT) and
//     the input reverts to the saved value.
//   • numeric prefs (on save): clamp into range; blank/NaN degrades to the
//     field's schema default.
describe("Autopilot clamps cap edits to their allowed range", () => {
  function bizNumberInputs() {
    const card = cardFor("Business Ops");
    return Array.from(card.querySelectorAll('input[type="number"]')) as HTMLInputElement[];
  }

  it("clamps a cadence above the max down to 1440", async () => {
    await mount();
    apiFetch.mockClear();
    await blurNumber(bizNumberInputs()[0], 99999);
    expectSavedAndReloaded("business_ops", { cadenceMinutes: 1440 });
  });

  it("clamps a cadence below the min up to 5", async () => {
    await mount();
    apiFetch.mockClear();
    await blurNumber(bizNumberInputs()[0], 0);
    expectSavedAndReloaded("business_ops", { cadenceMinutes: 5 });
  });

  it("clamps a negative cadence up to 5", async () => {
    await mount();
    apiFetch.mockClear();
    await blurNumber(bizNumberInputs()[0], -10);
    expectSavedAndReloaded("business_ops", { cadenceMinutes: 5 });
  });

  it("rounds a fractional cadence to a whole number", async () => {
    await mount();
    apiFetch.mockClear();
    await blurNumber(bizNumberInputs()[0], 45.7);
    expectSavedAndReloaded("business_ops", { cadenceMinutes: 46 });
  });

  it("rejects a blank cadence (no PUT) and reverts the field", async () => {
    await mount();
    apiFetch.mockClear();
    const input = bizNumberInputs()[0];
    await blurRaw(input, "");
    expect(putCalls("business_ops")).toHaveLength(0);
    expect(input.value).toBe("30"); // reverted to the saved cadenceMinutes
  });

  it("rejects a non-numeric cadence (no PUT)", async () => {
    await mount();
    apiFetch.mockClear();
    await blurRaw(bizNumberInputs()[0], "abc");
    expect(putCalls("business_ops")).toHaveLength(0);
  });

  it("clamps max-actions above the max down to 100", async () => {
    await mount();
    apiFetch.mockClear();
    await blurNumber(bizNumberInputs()[1], 9999);
    expectSavedAndReloaded("business_ops", { maxActionsPerTick: 100 });
  });

  it("clamps max-actions below the min up to 1", async () => {
    await mount();
    apiFetch.mockClear();
    await blurNumber(bizNumberInputs()[1], -5);
    expectSavedAndReloaded("business_ops", { maxActionsPerTick: 1 });
  });

  it("clamps out-of-range numeric prefs on save", async () => {
    await mount();
    apiFetch.mockClear();

    const card = cardFor("Business Ops");
    // numbers[2] = TASKS/TICK (1–20), [3] = STAFFING FLOOR (0–100), [4] = ANNOUNCE HRS (1–168)
    const numbers = bizNumberInputs();
    await changeNumber(numbers[2], 999); // over the tasks/tick max
    await changeNumber(numbers[4], 0); // under the announce-interval min

    await click(saveBtn(card));

    expectSavedAndReloaded("business_ops", {
      prefs: {
        staffTarget: 8,
        tasksPerTick: 20,
        closeStaleTimeEntries: true,
        postAnnouncements: true,
        announcementIntervalHours: 1,
      },
    });
  });
});
