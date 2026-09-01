// @vitest-environment jsdom
//
// Guards the per-domain SAVE FEEDBACK contract on the Agent Autopilot dashboard
// (complements Autopilot.write.test.tsx, which pins the write call itself):
//
//   • a FAILED save (network error or non-OK response) surfaces an inline error
//     on the affected domain card — not just a single shared page banner — and
//     the edited control visibly reverts to the last-saved value
//   • a SUCCESSFUL save shows a brief inline "Saved." confirmation on that card
//   • feedback is scoped to the affected card: a failure on one domain does not
//     mark another domain as failed/saved
//
// A regression that silently drops a change (no error shown, stale value left in
// the input) or that stops confirming a successful save would be caught here.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock("@/components/SignInPrompt", () => ({ SignInPage: () => null }));

// PUT behavior is steerable per test via `putMode`:
//   'ok'    -> accept + reflect the body into the payload (so a reload shows it)
//   'fail'  -> resolve a non-OK response (server rejected the change)
//   'throw' -> reject (network error)
let putMode: "ok" | "fail" | "throw" = "ok";

const apiFetch = vi.fn(async (path: string, opts?: any) => {
  if (typeof path === "string" && path.startsWith("/autopilot/") && opts?.method === "PUT") {
    if (putMode === "throw") throw new Error("network down");
    if (putMode === "fail") {
      return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
    }
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
        prefs: { leadStatuses: ["new"], followUpIntervalHours: 24, maxFollowUpsPerTick: 0 },
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

function cardFor(label: string): HTMLElement {
  const h3 = Array.from(container.querySelectorAll("h3")).find((h) => h.textContent === label);
  if (!h3) throw new Error(`no card heading for "${label}"`);
  let el: HTMLElement | null = h3;
  while (el && !el.querySelector("select")) el = el.parentElement;
  if (!el) throw new Error(`no card body for "${label}"`);
  return el;
}

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

function statusText(card: HTMLElement): string {
  const el = card.querySelector('[role="status"]');
  return (el?.textContent ?? "").trim();
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

async function blurNumber(input: HTMLInputElement, value: number) {
  await act(async () => {
    setNativeValue(input, String(value));
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  await flush();
}

beforeEach(() => {
  payload = freshPayload();
  putMode = "ok";
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

describe("Autopilot per-domain save feedback", () => {
  it("a non-OK save surfaces an inline error on the affected card", async () => {
    await mount();
    putMode = "fail";

    const card = cardFor("Business Ops");
    await click(topToggle(card));

    expect(statusText(card).toLowerCase()).toContain("could not save");
  });

  it("a network error during save surfaces an inline error on the affected card", async () => {
    await mount();
    putMode = "throw";

    const card = cardFor("Business Ops");
    await click(topToggle(card));

    expect(statusText(card).toLowerCase()).toContain("network error");
  });

  it("a successful save shows a brief inline confirmation on the affected card", async () => {
    await mount();

    const card = cardFor("Business Ops");
    await click(topToggle(card));
    // The success path chains PUT -> reload -> setState; give it extra ticks.
    await flush();
    await flush();

    expect(statusText(cardFor("Business Ops")).toLowerCase()).toContain("saved");
  });

  it("a failed cadence edit reverts the input to the last-saved value", async () => {
    await mount();
    putMode = "fail";

    const card = cardFor("Business Ops");
    const cadence = (card.querySelectorAll('input[type="number"]')[0]) as HTMLInputElement;
    expect(cadence.value).toBe("30");

    await blurNumber(cadence, 45);

    // After the rejected save, the (remounted) input shows the last-saved 30.
    const after = (cardFor("Business Ops").querySelectorAll('input[type="number"]')[0]) as HTMLInputElement;
    expect(after.value).toBe("30");
    expect(statusText(cardFor("Business Ops")).toLowerCase()).toContain("could not save");
  });

  it("a failed prefs save reverts the editor and the toggle stays put", async () => {
    await mount();
    putMode = "fail";

    const card = cardFor("Accounting");
    // Flip the COLLECTIONS toggle inside the prefs editor (defaults to ON).
    const collections = Array.from(card.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("COLLECTIONS"),
    ) as HTMLButtonElement;
    expect((collections.textContent ?? "").trim().endsWith("ON")).toBe(true);
    await click(collections);
    // Local toggle flipped to OFF before save.
    expect(
      (Array.from(cardFor("Accounting").querySelectorAll("button")).find((b) =>
        (b.textContent ?? "").includes("COLLECTIONS"),
      )?.textContent ?? "").trim().endsWith("OFF"),
    ).toBe(true);

    await click(saveBtn(cardFor("Accounting")));

    // Save rejected -> editor remounts -> COLLECTIONS reverts to last-saved ON.
    const reverted = Array.from(cardFor("Accounting").querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("COLLECTIONS"),
    ) as HTMLButtonElement;
    expect((reverted.textContent ?? "").trim().endsWith("ON")).toBe(true);
    expect(statusText(cardFor("Accounting")).toLowerCase()).toContain("could not save");
  });

  it("a failure on one domain does not mark a different domain", async () => {
    await mount();
    putMode = "fail";

    await click(topToggle(cardFor("Business Ops")));
    expect(statusText(cardFor("Business Ops")).toLowerCase()).toContain("could not save");
    // Marketing card untouched -> no status shown.
    expect(cardFor("Marketing").querySelector('[role="status"]')).toBeNull();
  });
});
