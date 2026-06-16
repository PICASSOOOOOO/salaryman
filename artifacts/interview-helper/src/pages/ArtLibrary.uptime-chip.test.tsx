// @vitest-environment jsdom
//
// Guards how the Art Library renders SERVER-TRACKED backend uptime on screen.
//
// The server now returns, per backend, a `lastChangedAt` (when the current
// health began — survives reloads, shared across admins) plus a `healthHistory`
// list of recent transitions. The chip turns that into:
//   • a wording-by-health "since" label: online -> "up Ns ago",
//     offline -> "down Ns ago", anything else (no key / ready) -> "set Ns ago",
//     timed off the server's lastChangedAt (NOT the client's poll time)
//   • a "log·N" expander that reveals the recent transitions (each prior event's
//     health label + "Ns ago"), excluding the current run already in the chip
//   • a graceful fallback to "checked Ns ago" for older servers that don't send
//     lastChangedAt at all
//
// These render paths had no test; a regression in the label wording, the history
// expander, or the fallback would silently show admins the wrong uptime. We mount
// the real ArtLibrary against a mocked /api/art/library and assert the DOM.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetch: h.apiFetch }));

import ArtLibrary from "./ArtLibrary";

function json(body: any) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
}

// A single backend as GET /api/art/library would return it. Callers override
// health / lastChangedAt / healthHistory to drive each render path.
function provider(over: Partial<any> = {}) {
  return {
    id: "nano-banana",
    label: "Nano Banana",
    description: "default backend",
    configured: true,
    isDefault: true,
    health: "online",
    lastError: null,
    ...over,
  };
}

function libraryBody(providers: any[]) {
  return {
    configured: true,
    providers,
    polishConfigured: false,
    total: 0,
    ready: 0,
    pending: 0,
    failed: 0,
    assets: [],
  };
}

let root: Root;
let container: HTMLDivElement;

// Mount ArtLibrary with the given backend list served by /api/art/library and
// flush the async load() -> json() -> setState chain.
async function renderWith(providers: any[]) {
  h.apiFetch.mockReset();
  h.apiFetch.mockImplementation((url: string) => {
    if (url.includes("/art/library")) return json(libraryBody(providers));
    if (url.includes("/art/providers"))
      return json({ providers, polishConfigured: false });
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  });
  await act(async () => {
    root.render(<ArtLibrary />);
  });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

function text(): string {
  return container.textContent ?? "";
}

// The recent-history expander toggle (text "log·N").
function logButton(): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find((b) =>
    /^log·/.test((b.textContent ?? "").trim()),
  ) as HTMLButtonElement | undefined;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("uptime chip: health-worded 'since' label off server lastChangedAt", () => {
  it("shows 'up Nm ago' for an online backend, timed off lastChangedAt", async () => {
    // lastChangedAt 3 minutes ago -> "up 3m ago", distinguishing it from the
    // client's "checked 0s ago" poll time (which would be ~0s).
    await renderWith([provider({ health: "online", lastChangedAt: Date.now() - 3 * 60_000 })]);
    expect(text()).toMatch(/up 3m ago/);
    expect(text()).not.toMatch(/checked/);
  });

  it("shows 'down Nm ago' for an offline backend", async () => {
    await renderWith([provider({ health: "offline", lastChangedAt: Date.now() - 2 * 60_000 })]);
    expect(text()).toMatch(/down 2m ago/);
    // The reachability badge for an offline backend reads "offline".
    expect(text()).toContain("offline");
  });

  it("shows 'set Nm ago' for a non-configured backend (no key)", async () => {
    // configured:false with no health -> derived 'not-configured' -> "set …",
    // and the badge reads "no key".
    await renderWith([
      provider({ configured: false, health: undefined, lastChangedAt: Date.now() - 5 * 60_000 }),
    ]);
    expect(text()).toMatch(/set 5m ago/);
    expect(text()).toContain("no key");
  });

  it("falls back to 'checked Ns ago' when the server omits lastChangedAt", async () => {
    // Older server response: no lastChangedAt -> chip uses the client poll time.
    await renderWith([provider({ health: "online" })]);
    expect(text()).toMatch(/checked \d+s ago/);
    expect(text()).not.toMatch(/up \d/);
  });
});

describe("uptime chip: 'log·N' recent-transitions expander", () => {
  // healthHistory is most-recent-first; the chip drops the first (current) entry
  // and lists the rest, so a 3-entry history surfaces "log·2".
  function withHistory() {
    return provider({
      health: "online",
      lastChangedAt: Date.now() - 30_000,
      healthHistory: [
        { at: Date.now() - 30_000, health: "online" },   // current (excluded)
        { at: Date.now() - 60_000, health: "offline" },  // prior #1
        { at: Date.now() - 120_000, health: "online" },  // prior #2
      ],
    });
  }

  it("renders 'log·2' for a 3-entry history and hides the list until expanded", async () => {
    await renderWith([withHistory()]);
    const btn = logButton();
    expect(btn, "log button should render when there are prior transitions").toBeTruthy();
    expect((btn!.textContent ?? "").trim()).toBe("log·2");
    // Collapsed: the recent-transition list (an <ol>) isn't in the DOM yet.
    expect(container.querySelector("ol")).toBeNull();
  });

  it("reveals the prior transitions with their health + 'Nm ago' on click", async () => {
    await renderWith([withHistory()]);
    await act(async () => { logButton()!.click(); });

    const list = container.querySelector("ol");
    expect(list, "expanded history list should render").toBeTruthy();
    const rows = list!.textContent ?? "";
    // Both prior transitions show their health label and relative time.
    expect(rows).toContain("offline");
    expect(rows).toContain("online");
    expect(rows).toMatch(/1m ago/);
    expect(rows).toMatch(/2m ago/);
    // The toggle now reads "hide" (the "log·N" label is gone while expanded).
    expect(logButton()).toBeUndefined();
    expect(text()).toContain("hide");
  });

  it("shows no 'log·' expander when there are no prior transitions", async () => {
    // Only the current run in history -> nothing to expand.
    await renderWith([
      provider({ health: "online", lastChangedAt: Date.now() - 10_000, healthHistory: [{ at: Date.now() - 10_000, health: "online" }] }),
    ]);
    expect(logButton()).toBeUndefined();
    expect(container.querySelector("ol")).toBeNull();
  });
});

describe("uptime chip: absolute wall-clock timestamps for incident triage", () => {
  // The exact change time of each prior transition, alongside the relative
  // "Nm ago", so an admin can correlate a flip with errors elsewhere.
  function withHistory() {
    return provider({
      health: "online",
      lastChangedAt: Date.now() - 30_000,
      healthHistory: [
        { at: Date.now() - 30_000, health: "online" },
        { at: Date.now() - 60_000, health: "offline" },
        { at: Date.now() - 120_000, health: "online" },
      ],
    });
  }

  it("includes the absolute 'since' time in the chip title when lastChangedAt is known", async () => {
    const lastChangedAt = Date.now() - 3 * 60_000;
    await renderWith([provider({ health: "online", lastChangedAt })]);
    const chip = Array.from(container.querySelectorAll("[title]")).find((el) =>
      (el.getAttribute("title") ?? "").includes("Status up"),
    );
    expect(chip, "chip with a status title should render").toBeTruthy();
    const title = chip!.getAttribute("title") ?? "";
    expect(title).toContain(`since ${new Date(lastChangedAt).toLocaleString()}`);
  });

  it("renders each expanded history row's absolute timestamp inline and as a tooltip", async () => {
    const prov = withHistory() as any;
    await renderWith([prov]);
    await act(async () => { logButton()!.click(); });

    const rows = Array.from(container.querySelectorAll("ol li"));
    expect(rows.length).toBe(2);
    // The two prior transitions (offline #1, online #2), newest first.
    const offlineAt = prov.healthHistory[1].at;
    const onlineAt = prov.healthHistory[2].at;
    const allText = container.querySelector("ol")!.textContent ?? "";
    expect(allText).toContain(new Date(offlineAt).toLocaleString());
    expect(allText).toContain(new Date(onlineAt).toLocaleString());
    // The absolute time is also exposed as a hover tooltip on each row.
    expect(rows[0].getAttribute("title")).toBe(new Date(offlineAt).toLocaleString());
    expect(rows[1].getAttribute("title")).toBe(new Date(onlineAt).toLocaleString());
    // Relative durations are preserved.
    expect(allText).toMatch(/1m ago/);
    expect(allText).toMatch(/2m ago/);
  });

  it("omits the absolute 'since' time from the title when lastChangedAt is absent", async () => {
    // Older server: no lastChangedAt -> fallback "checked …", no "since".
    await renderWith([provider({ health: "online" })]);
    const titled = Array.from(container.querySelectorAll("[title]")).map((el) =>
      el.getAttribute("title") ?? "",
    );
    expect(titled.some((t) => t.includes("since "))).toBe(false);
  });
});
