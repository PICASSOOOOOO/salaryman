// @vitest-environment jsdom
//
// Guards the self-contained notification bell + portaled dropdown panel
// (extracted so it can be reused in both the desktop NavBar and the mobile
// module bar). A regression here breaks notifications everywhere it's mounted.
//
// Contract:
//   1. The panel is closed by default; clicking the bell opens the portaled
//      panel (rendered to <body>, not inside the component subtree), and a
//      second click closes it. An outside mousedown also closes it.
//   2. The unread badge renders the count when > 0, caps at "99+", and is
//      absent when there are no unread.
//   3. "Mark all read" -> markRead() (no ids); "Clear all" -> clearAll();
//      the per-item "×" -> dismiss(id).
//   4. Clicking an unread item with a link marks just that id read, navigates
//      to the link, and closes the panel.
//
// useNotifications is isolated via hoisted mock state; wouter's navigate is a
// spy so we can assert link navigation without a router.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  notifState: {
    notifications: [] as any[],
    unreadCount: 0,
    loading: false,
    markRead: vi.fn(),
    dismiss: vi.fn(),
    clearAll: vi.fn(),
  },
  navigate: vi.fn(),
}));

vi.mock("@/hooks/use-notifications", () => ({
  useNotifications: () => h.notifState,
}));
vi.mock("wouter", () => ({ useLocation: () => ["/", h.navigate] }));

import { NotificationBell } from "./NotificationBell";

let idSeq = 1;
function makeNotif(over: Partial<any> = {}) {
  return {
    id: idSeq++,
    userId: "me",
    type: "org_invite",
    title: "New invite",
    body: "You were invited to OMBRA CORP",
    link: "/comms",
    read: false,
    createdAt: new Date().toISOString(),
    ...over,
  };
}

let root: Root;
let container: HTMLDivElement;

async function render() {
  await act(async () => {
    root.render(<NotificationBell />);
  });
}

function bellButton(): HTMLButtonElement {
  // The trigger is the only button inside the component's own container; the
  // panel (and its buttons) are portaled to <body>.
  const btn = container.querySelector("button");
  if (!btn) throw new Error("no bell button rendered");
  return btn as HTMLButtonElement;
}

// The panel is portaled to <body>; find it by its title row text.
function panel(): HTMLElement | null {
  const headers = Array.from(document.body.querySelectorAll("span")).filter(s =>
    (s.textContent ?? "").toUpperCase() === "NOTIFICATIONS"
  );
  for (const hdr of headers) {
    const fixed = hdr.closest("div.fixed");
    if (fixed) return fixed as HTMLElement;
  }
  return null;
}

function panelButtonByText(text: string): HTMLButtonElement {
  const p = panel();
  if (!p) throw new Error("panel is not open");
  const btn = Array.from(p.querySelectorAll("button")).find(b =>
    (b.textContent ?? "").includes(text)
  ) as HTMLButtonElement | undefined;
  if (!btn) throw new Error(`no panel button containing "${text}"`);
  return btn;
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.click();
  });
}

beforeEach(() => {
  idSeq = 1;
  h.notifState = {
    notifications: [],
    unreadCount: 0,
    loading: false,
    markRead: vi.fn(),
    dismiss: vi.fn(),
    clearAll: vi.fn(),
  };
  h.navigate.mockClear();
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

describe("open / close", () => {
  it("is closed by default and opens the portaled panel on click", async () => {
    await render();
    expect(panel()).toBeNull();

    await click(bellButton());
    expect(panel()).not.toBeNull();
  });

  it("toggles closed on a second bell click", async () => {
    await render();
    await click(bellButton());
    expect(panel()).not.toBeNull();

    await click(bellButton());
    expect(panel()).toBeNull();
  });

  it("closes when an outside mousedown occurs", async () => {
    await render();
    await click(bellButton());
    expect(panel()).not.toBeNull();

    await act(async () => {
      document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(panel()).toBeNull();
  });
});

describe("unread badge", () => {
  it("shows no badge when there are no unread", async () => {
    await render();
    expect(bellButton().textContent ?? "").toBe("");
  });

  it("renders the unread count", async () => {
    h.notifState = { ...h.notifState, unreadCount: 5 };
    await render();
    expect((bellButton().textContent ?? "").trim()).toBe("5");
  });

  it("caps the badge at 99+", async () => {
    h.notifState = { ...h.notifState, unreadCount: 250 };
    await render();
    expect((bellButton().textContent ?? "").trim()).toBe("99+");
  });
});

describe("empty state", () => {
  it('shows "No notifications" and offers neither mark-read nor clear', async () => {
    await render();
    await click(bellButton());
    const p = panel()!;
    expect(p.textContent).toContain("No notifications");
    expect(
      Array.from(p.querySelectorAll("button")).some(b =>
        (b.textContent ?? "").includes("Mark all read")
      )
    ).toBe(false);
    expect(
      Array.from(p.querySelectorAll("button")).some(b =>
        (b.textContent ?? "").includes("Clear all")
      )
    ).toBe(false);
  });
});

describe("header actions", () => {
  it("Mark all read calls markRead() with no ids", async () => {
    h.notifState = {
      ...h.notifState,
      notifications: [makeNotif(), makeNotif()],
      unreadCount: 2,
    };
    await render();
    await click(bellButton());

    await click(panelButtonByText("Mark all read"));
    expect(h.notifState.markRead).toHaveBeenCalledTimes(1);
    expect(h.notifState.markRead).toHaveBeenCalledWith();
  });

  it("hides Mark all read when nothing is unread but still offers Clear all", async () => {
    h.notifState = {
      ...h.notifState,
      notifications: [makeNotif({ read: true })],
      unreadCount: 0,
    };
    await render();
    await click(bellButton());

    const p = panel()!;
    expect(
      Array.from(p.querySelectorAll("button")).some(b =>
        (b.textContent ?? "").includes("Mark all read")
      )
    ).toBe(false);
    expect(
      Array.from(p.querySelectorAll("button")).some(b =>
        (b.textContent ?? "").includes("Clear all")
      )
    ).toBe(true);
  });

  it("Clear all calls clearAll()", async () => {
    h.notifState = {
      ...h.notifState,
      notifications: [makeNotif()],
      unreadCount: 1,
    };
    await render();
    await click(bellButton());

    await click(panelButtonByText("Clear all"));
    expect(h.notifState.clearAll).toHaveBeenCalledTimes(1);
  });
});

describe("per-item actions", () => {
  it("dismiss (×) calls dismiss(id)", async () => {
    const n = makeNotif({ id: 42 });
    h.notifState = { ...h.notifState, notifications: [n], unreadCount: 1 };
    await render();
    await click(bellButton());

    const dismissBtn = panel()!.querySelector(
      '[aria-label="Dismiss notification"]'
    ) as HTMLButtonElement;
    expect(dismissBtn).toBeTruthy();
    await click(dismissBtn);
    expect(h.notifState.dismiss).toHaveBeenCalledWith(42);
  });

  it("clicking an unread item with a link marks it read, navigates, and closes", async () => {
    const n = makeNotif({ id: 7, link: "/comms", read: false });
    h.notifState = { ...h.notifState, notifications: [n], unreadCount: 1 };
    await render();
    await click(bellButton());

    const itemBtn = panelButtonByText("New invite");
    await click(itemBtn);

    expect(h.notifState.markRead).toHaveBeenCalledWith([7]);
    expect(h.navigate).toHaveBeenCalledWith("/tower/mezzanine?focus=phone");
    expect(panel()).toBeNull();
  });

  it("clicking an already-read item with a link navigates without marking read", async () => {
    const n = makeNotif({ id: 8, link: "/comms", read: true });
    h.notifState = { ...h.notifState, notifications: [n], unreadCount: 0 };
    await render();
    await click(bellButton());

    await click(panelButtonByText("New invite"));
    expect(h.notifState.markRead).not.toHaveBeenCalled();
    expect(h.navigate).toHaveBeenCalledWith("/tower/mezzanine?focus=phone");
  });

  it("clicking an unread item without a link marks read but does not navigate or close", async () => {
    const n = makeNotif({ id: 9, link: null, read: false });
    h.notifState = { ...h.notifState, notifications: [n], unreadCount: 1 };
    await render();
    await click(bellButton());

    await click(panelButtonByText("New invite"));
    expect(h.notifState.markRead).toHaveBeenCalledWith([9]);
    expect(h.navigate).not.toHaveBeenCalled();
    expect(panel()).not.toBeNull();
  });
});
