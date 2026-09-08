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

import ArtLibrary, { buildHistoryCopyText, buildAllHistoryCopyText } from "./ArtLibrary";

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
    // Both incident channels configured so the picker defaults to selecting
    // them; otherwise selectedChannels stays empty and the per-backend "send"
    // button is disabled (and sendHistory early-returns).
    incidentChannels: { discord: true, email: true, any: true },
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

describe("uptime chip: buildHistoryCopyText (plain-text incident dump)", () => {
  it("emits the backend label then one '<health> · <absolute time>' line per transition", () => {
    const offlineAt = Date.UTC(2026, 5, 16, 14, 4, 31);
    const onlineAt = Date.UTC(2026, 5, 16, 14, 3, 31);
    const out = buildHistoryCopyText("Nano Banana", [
      { at: offlineAt, health: "offline" },
      { at: onlineAt, health: "online" },
    ] as any);
    const lines = out.split("\n");
    expect(lines[0]).toBe("Nano Banana");
    expect(lines[1]).toBe(`offline · ${new Date(offlineAt).toLocaleString()}`);
    expect(lines[2]).toBe(`online · ${new Date(onlineAt).toLocaleString()}`);
    // Newline-separated, no trailing blank line.
    expect(lines.length).toBe(3);
  });

  it("emits just the label when there are no transitions to copy", () => {
    expect(buildHistoryCopyText("Fal", [])).toBe("Fal");
  });
});

describe("uptime chip: buildAllHistoryCopyText (timestamped incident report header)", () => {
  it("prepends a header with the absolute report time and online/offline counts", () => {
    const at = Date.UTC(2026, 5, 16, 14, 4, 31);
    const out = buildAllHistoryCopyText(
      [
        { id: "nano-banana", label: "Nano Banana", configured: true, health: "online", healthHistory: [] },
        { id: "fal", label: "Fal", configured: true, health: "offline", healthHistory: [] },
        { id: "unreal", label: "Unreal", configured: false, health: "not-configured", healthHistory: [] },
      ] as any,
      at,
    );
    const lines = out.split("\n");
    expect(lines[0]).toBe(`Backend downtime report · ${new Date(at).toLocaleString()}`);
    // 1 online, 1 offline, and the not-configured backend is counted explicitly.
    expect(lines[1]).toBe("1 online · 1 offline · 1 not configured");
  });

  it("derives the offline count from health when present and from configured otherwise", () => {
    const at = Date.UTC(2026, 5, 16, 14, 0, 0);
    const out = buildAllHistoryCopyText(
      [
        { id: "fal", label: "Fal", configured: true, health: "offline", healthHistory: [] },
        { id: "unreal", label: "Unreal", configured: true, healthHistory: [] }, // unknown → counted as unknown
      ] as any,
      at,
    );
    expect(out.split("\n")[1]).toBe("0 online · 1 offline · 1 unknown");
  });

  it("counts not-configured and unknown/checking backends in the summary", () => {
    const at = Date.UTC(2026, 5, 16, 14, 0, 0);
    const out = buildAllHistoryCopyText(
      [
        { id: "nano-banana", label: "Nano Banana", configured: true, health: "online", healthHistory: [] },
        { id: "fal", label: "Fal", configured: true, health: "offline", healthHistory: [] },
        { id: "unreal", label: "Unreal", configured: false, health: "not-configured", healthHistory: [] },
        { id: "extra", label: "Extra", configured: true, health: "checking", healthHistory: [] },
      ] as any,
      at,
    );
    expect(out.split("\n")[1]).toBe("1 online · 1 offline · 1 not configured · 1 unknown");
  });

  it("omits the not-configured / unknown segments when none are present", () => {
    const at = Date.UTC(2026, 5, 16, 14, 0, 0);
    const out = buildAllHistoryCopyText(
      [
        { id: "nano-banana", label: "Nano Banana", configured: true, health: "online", healthHistory: [] },
        { id: "fal", label: "Fal", configured: true, health: "offline", healthHistory: [] },
      ] as any,
      at,
    );
    expect(out.split("\n")[1]).toBe("1 online · 1 offline");
  });

  it("separates the header from each backend block with a blank line", () => {
    const offlineAt = Date.UTC(2026, 5, 16, 13, 0, 0);
    const out = buildAllHistoryCopyText(
      [
        {
          id: "nano-banana",
          label: "Nano Banana",
          configured: true,
          health: "online",
          healthHistory: [
            { at: Date.UTC(2026, 5, 16, 14, 0, 0), health: "online" }, // current (excluded)
            { at: offlineAt, health: "offline" }, // prior
          ],
        },
      ] as any,
      Date.UTC(2026, 5, 16, 14, 5, 0),
    );
    const sections = out.split("\n\n");
    expect(sections.length).toBe(2);
    expect(sections[1]).toBe(`Nano Banana\noffline · ${new Date(offlineAt).toLocaleString()}`);
  });
});

describe("uptime chip: copy-to-clipboard action for incident reports", () => {
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

  // The "copy" action inside the expanded history list.
  function copyButton(): HTMLButtonElement | undefined {
    return Array.from(container.querySelectorAll("ol ~ button, div > button")).find((b) =>
      /^copy$/.test((b.textContent ?? "").trim()),
    ) as HTMLButtonElement | undefined;
  }

  let writeText: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
  });

  it("copies the label + each transition's health and absolute time to the clipboard", async () => {
    const prov = withHistory() as any;
    await renderWith([prov]);
    await act(async () => { logButton()!.click(); });

    const btn = copyButton();
    expect(btn, "copy button should render in the expanded history list").toBeTruthy();
    await act(async () => { btn!.click(); });

    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = writeText.mock.calls[0][0] as string;
    const lines = copied.split("\n");
    expect(lines[0]).toBe("Nano Banana");
    // The two prior transitions (current run excluded), newest first.
    expect(lines[1]).toBe(`offline · ${new Date(prov.healthHistory[1].at).toLocaleString()}`);
    expect(lines[2]).toBe(`online · ${new Date(prov.healthHistory[2].at).toLocaleString()}`);
  });

  it("shows a brief 'copied' confirmation after copying", async () => {
    await renderWith([withHistory()]);
    await act(async () => { logButton()!.click(); });
    await act(async () => { copyButton()!.click(); });
    expect(text()).toContain("copied");
  });
});

describe("uptime chip: 'Copy all' dumps every backend's transitions at once", () => {
  // The "Copy all" action near the chip row.
  function copyAllButton(): HTMLButtonElement | undefined {
    return Array.from(container.querySelectorAll("button")).find((b) =>
      /^Copy all$/.test((b.textContent ?? "").trim()),
    ) as HTMLButtonElement | undefined;
  }

  let writeText: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
  });

  it("copies every backend's recent transitions grouped by label in one block", async () => {
    const nano = provider({
      id: "nano-banana",
      label: "Nano Banana",
      health: "online",
      lastChangedAt: Date.now() - 30_000,
      healthHistory: [
        { at: Date.now() - 30_000, health: "online" },   // current (excluded)
        { at: Date.now() - 60_000, health: "offline" },  // prior
      ],
    });
    const fal = provider({
      id: "fal",
      label: "Fal",
      isDefault: false,
      health: "offline",
      lastChangedAt: Date.now() - 90_000,
      healthHistory: [
        { at: Date.now() - 90_000, health: "offline" },  // current (excluded)
        { at: Date.now() - 150_000, health: "online" },  // prior
      ],
    });
    await renderWith([nano, fal]);

    const btn = copyAllButton();
    expect(btn, "Copy all button should render with backends present").toBeTruthy();
    await act(async () => { btn!.click(); });

    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = writeText.mock.calls[0][0] as string;
    const sections = copied.split("\n\n");
    // First section is the incident header: report time + online/offline summary.
    const headerLines = sections[0].split("\n");
    expect(headerLines[0]).toMatch(/^Backend downtime report · /);
    // nano online, fal offline → 1 online · 1 offline.
    expect(headerLines[1]).toBe("1 online · 1 offline");
    // Then two backend blocks, each grouped under its label.
    expect(sections[1]).toBe(
      ["Nano Banana", `offline · ${new Date((nano as any).healthHistory[1].at).toLocaleString()}`].join("\n"),
    );
    expect(sections[2]).toBe(
      ["Fal", `online · ${new Date((fal as any).healthHistory[1].at).toLocaleString()}`].join("\n"),
    );
  });

  it("includes backends with no prior transitions as a label-only block", async () => {
    const nano = provider({
      id: "nano-banana",
      label: "Nano Banana",
      health: "online",
      lastChangedAt: Date.now() - 10_000,
      healthHistory: [{ at: Date.now() - 10_000, health: "online" }], // only current
    });
    await renderWith([nano]);

    await act(async () => { copyAllButton()!.click(); });
    const copied = writeText.mock.calls[0][0] as string;
    const sections = copied.split("\n\n");
    expect(sections[0].split("\n")[1]).toBe("1 online · 0 offline");
    // The lone backend is still a label-only block after the header.
    expect(sections[1]).toBe("Nano Banana");
  });

  it("shows a brief 'Copied' confirmation after copying all", async () => {
    await renderWith([provider({ health: "online", lastChangedAt: Date.now() - 30_000 })]);
    await act(async () => { copyAllButton()!.click(); });
    expect(text()).toContain("Copied");
  });
});

describe("buildAllHistoryCopyText (shared copy/download dump)", () => {
  it("groups each backend under its label after the header, blocks blank-line separated, current run excluded", () => {
    const at = Date.UTC(2026, 5, 16, 14, 5, 0);
    const out = buildAllHistoryCopyText([
      {
        id: "nano-banana",
        label: "Nano Banana",
        configured: true,
        health: "online",
        healthHistory: [
          { at: Date.UTC(2026, 5, 16, 14, 4, 31), health: "online" },  // current (excluded)
          { at: Date.UTC(2026, 5, 16, 14, 3, 31), health: "offline" }, // prior
        ],
      },
      {
        id: "fal",
        label: "Fal",
        configured: true,
        health: "offline",
        healthHistory: [
          { at: Date.UTC(2026, 5, 16, 14, 2, 31), health: "offline" }, // current (excluded)
          { at: Date.UTC(2026, 5, 16, 14, 1, 31), health: "online" },  // prior
        ],
      },
    ] as any, at);
    const expected = [
      `Backend downtime report · ${new Date(at).toLocaleString()}`,
      "1 online · 1 offline",
      "",
      "Nano Banana",
      `offline · ${new Date(Date.UTC(2026, 5, 16, 14, 3, 31)).toLocaleString()}`,
      "",
      "Fal",
      `online · ${new Date(Date.UTC(2026, 5, 16, 14, 1, 31)).toLocaleString()}`,
    ].join("\n");
    expect(out).toBe(expected);
  });

  it("emits a label-only block (after the header) for a backend with no prior transitions", () => {
    const at = Date.UTC(2026, 5, 16, 14, 5, 0);
    const out = buildAllHistoryCopyText([
      { id: "nano-banana", label: "Nano Banana", configured: true, health: "online", healthHistory: [{ at: Date.now(), health: "online" }] },
    ] as any, at);
    expect(out).toBe(
      [
        `Backend downtime report · ${new Date(at).toLocaleString()}`,
        "1 online · 0 offline",
        "",
        "Nano Banana",
      ].join("\n"),
    );
  });
});

describe("uptime chip: 'Download' saves the same all-backends dump as a .txt file", () => {
  function downloadButton(): HTMLButtonElement | undefined {
    return Array.from(container.querySelectorAll("button")).find((b) =>
      /^Download$/.test((b.textContent ?? "").trim()),
    ) as HTMLButtonElement | undefined;
  }

  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    createObjectURL = vi.fn((blob: any) => {
      // Stash the blob so the assertion can read its text after the click.
      (createObjectURL as any).lastBlob = blob;
      return "blob:mock";
    });
    revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    // Stub the anchor click so jsdom doesn't try to navigate.
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    clickSpy.mockRestore();
  });

  function backends() {
    return [
      provider({
        id: "nano-banana",
        label: "Nano Banana",
        health: "online",
        lastChangedAt: Date.now() - 30_000,
        healthHistory: [
          { at: Date.now() - 30_000, health: "online" },   // current (excluded)
          { at: Date.now() - 60_000, health: "offline" },  // prior
        ],
      }),
      provider({
        id: "fal",
        label: "Fal",
        isDefault: false,
        health: "offline",
        lastChangedAt: Date.now() - 90_000,
        healthHistory: [
          { at: Date.now() - 90_000, health: "offline" },  // current (excluded)
          { at: Date.now() - 150_000, health: "online" },  // prior
        ],
      }),
    ];
  }

  it("builds a text/plain blob whose contents match buildAllHistoryCopyText", async () => {
    const provs = backends();
    await renderWith(provs);

    const btn = downloadButton();
    expect(btn, "Download button should render with backends present").toBeTruthy();
    await act(async () => { btn!.click(); });

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = (createObjectURL as any).lastBlob as Blob;
    expect(blob.type).toContain("text/plain");
    const contents = await blob.text();
    // Same report shape as buildAllHistoryCopyText: timestamped header + summary,
    // then each backend's grouped block (the report time is stamped at click
    // time, so compare the header shape and the backend blocks, not the exact ms).
    const sections = contents.split("\n\n");
    expect(sections[0].split("\n")[0]).toMatch(/^Backend downtime report · /);
    // nano online, fal offline → 1 online · 1 offline.
    expect(sections[0].split("\n")[1]).toBe("1 online · 1 offline");
    expect(sections[1]).toBe(
      ["Nano Banana", `offline · ${new Date((provs[0] as any).healthHistory[1].at).toLocaleString()}`].join("\n"),
    );
    expect(sections[2]).toBe(
      ["Fal", `online · ${new Date((provs[1] as any).healthHistory[1].at).toLocaleString()}`].join("\n"),
    );
    // The object URL is cleaned up after the download.
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });

  it("downloads to a timestamped .txt filename and triggers a click", async () => {
    await renderWith(backends());
    await act(async () => { downloadButton()!.click(); });

    expect(clickSpy).toHaveBeenCalledTimes(1);
    const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toMatch(/^backend-downtime-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.txt$/);
  });

  it("shows a brief 'Downloaded' confirmation after downloading", async () => {
    await renderWith(backends());
    await act(async () => { downloadButton()!.click(); });
    expect(text()).toContain("Downloaded");
  });
});

describe("uptime chip: per-backend 'download' saves just that backend's history", () => {
  // The "download" action inside the expanded per-backend history list (lowercase,
  // distinct from the all-backends "Download" button).
  function perBackendDownloadButton(): HTMLButtonElement | undefined {
    return Array.from(container.querySelectorAll("button")).find((b) =>
      /^download$/.test((b.textContent ?? "").trim()),
    ) as HTMLButtonElement | undefined;
  }

  function withHistory() {
    return provider({
      id: "fal",
      label: "Fal",
      isDefault: false,
      health: "online",
      lastChangedAt: Date.now() - 30_000,
      healthHistory: [
        { at: Date.now() - 30_000, health: "online" },   // current (excluded)
        { at: Date.now() - 60_000, health: "offline" },  // prior #1
        { at: Date.now() - 120_000, health: "online" },  // prior #2
      ],
    });
  }

  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    createObjectURL = vi.fn((blob: any) => {
      (createObjectURL as any).lastBlob = blob;
      return "blob:mock";
    });
    revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    clickSpy.mockRestore();
  });

  it("builds a text/plain blob matching buildHistoryCopyText for that one backend", async () => {
    const prov = withHistory() as any;
    await renderWith([prov]);
    await act(async () => { logButton()!.click(); });

    const btn = perBackendDownloadButton();
    expect(btn, "per-backend download button should render in the expanded list").toBeTruthy();
    await act(async () => { btn!.click(); });

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = (createObjectURL as any).lastBlob as Blob;
    expect(blob.type).toContain("text/plain");
    const contents = await blob.text();
    // Same dump as the per-backend "copy" action: label + prior transitions only.
    const lines = contents.split("\n");
    expect(lines[0]).toBe("Fal");
    expect(lines[1]).toBe(`offline · ${new Date(prov.healthHistory[1].at).toLocaleString()}`);
    expect(lines[2]).toBe(`online · ${new Date(prov.healthHistory[2].at).toLocaleString()}`);
    expect(lines.length).toBe(3);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });

  it("downloads to a per-backend, timestamped .txt filename and triggers a click", async () => {
    await renderWith([withHistory()]);
    await act(async () => { logButton()!.click(); });
    await act(async () => { perBackendDownloadButton()!.click(); });

    expect(clickSpy).toHaveBeenCalledTimes(1);
    const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
    // Includes the backend id so per-backend dumps don't collide with each other
    // or with the all-backends export.
    expect(anchor.download).toMatch(/^backend-downtime-fal-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.txt$/);
  });

  it("shows a brief 'saved' confirmation after downloading one backend", async () => {
    await renderWith([withHistory()]);
    await act(async () => { logButton()!.click(); });
    await act(async () => { perBackendDownloadButton()!.click(); });
    expect(text()).toContain("saved");
  });
});

describe("uptime chip: per-backend 'send' pushes just that backend's history to the incident channel", () => {
  // The "send" action inside the expanded per-backend history list (lowercase,
  // distinct from the all-backends "Send to incident channel" button).
  function perBackendSendButton(): HTMLButtonElement | undefined {
    return Array.from(container.querySelectorAll("button")).find((b) =>
      /^send$/.test((b.textContent ?? "").trim()),
    ) as HTMLButtonElement | undefined;
  }

  function withHistory() {
    return provider({
      id: "fal",
      label: "Fal",
      isDefault: false,
      health: "online",
      lastChangedAt: Date.now() - 30_000,
      healthHistory: [
        { at: Date.now() - 30_000, health: "online" },   // current (excluded)
        { at: Date.now() - 60_000, health: "offline" },  // prior #1
        { at: Date.now() - 120_000, health: "online" },  // prior #2
      ],
    });
  }

  // renderWith() wires /art/library + /art/providers; override the incident-report
  // POST per test so we can drive the success / no-channel / failure branches.
  function onIncidentReport(resp: any) {
    h.apiFetch.mockImplementation((url: string, init?: any) => {
      if (url.includes("/art/incident-report") && init?.method === "POST") return resp(init);
      if (url.includes("/art/library")) return json(libraryBody([withHistory()]));
      if (url.includes("/art/providers")) return json({ providers: [withHistory()], polishConfigured: false });
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    });
  }

  it("POSTs the per-backend buildHistoryCopyText dump (not the all-backends report) to /api/art/incident-report", async () => {
    const prov = withHistory() as any;
    let sentBody: any = null;
    await renderWith([prov]);
    onIncidentReport((init: any) => {
      sentBody = JSON.parse(init.body);
      return json({ delivered: ["discord"] });
    });
    await act(async () => { logButton()!.click(); });

    const btn = perBackendSendButton();
    expect(btn, "per-backend send button should render in the expanded list").toBeTruthy();
    await act(async () => { btn!.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(sentBody).toBeTruthy();
    // Same dump as the per-backend "copy"/"download": label + prior transitions only.
    const lines = (sentBody.text as string).split("\n");
    expect(lines[0]).toBe("Fal");
    expect(lines[1]).toBe(`offline · ${new Date(prov.healthHistory[1].at).toLocaleString()}`);
    expect(lines[2]).toBe(`online · ${new Date(prov.healthHistory[2].at).toLocaleString()}`);
    expect(lines.length).toBe(3);
    // No all-backends report header leaked in.
    expect(sentBody.text).not.toMatch(/Backend downtime report/);
  });

  it("shows the delivered channels on success", async () => {
    await renderWith([withHistory()]);
    onIncidentReport(() => json({ delivered: ["discord", "email"] }));
    await act(async () => { logButton()!.click(); });
    await act(async () => { perBackendSendButton()!.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(text()).toContain("Sent (discord + email)");
  });

  it("shows 'No channel set up' when the server has no incident channel (503)", async () => {
    await renderWith([withHistory()]);
    onIncidentReport(() => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) }));
    await act(async () => { logButton()!.click(); });
    await act(async () => { perBackendSendButton()!.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(text()).toContain("No channel set up");
  });

  it("shows 'Send failed' on a generic error", async () => {
    await renderWith([withHistory()]);
    onIncidentReport(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }));
    await act(async () => { logButton()!.click(); });
    await act(async () => { perBackendSendButton()!.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(text()).toContain("Send failed");
  });
});
