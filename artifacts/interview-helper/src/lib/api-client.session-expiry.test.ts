// @vitest-environment jsdom
//
// Guards the session-expiry redirect in `apiFetch`. When a background API call
// comes back 401 it usually means the session lapsed, so the handler bounces the
// visitor to /pablo?returnTo=<path> to sign in and return. BUT on public /
// anonymous routes a 401 is EXPECTED (the visitor simply isn't signed in) and
// must NOT hijack navigation — otherwise the public scroll-cinematic landing at
// "/" never renders because a background 401 jumps straight to /pablo.
//
// Contract:
//   1. A 401 on a genuinely protected page (e.g. /office, /business) →
//      redirect to /pablo?returnTo=<encoded path+search>.
//   2. A 401 on a public route ("/", "/pablo", "/immigration", "/sms-opt-in",
//      auth pages and their
//      subpaths) → NO redirect.
//   3. A 401 on the auth-polling skip paths (/auth/user, /auth/providers) →
//      NO redirect (regardless of current page).
//   4. A non-401 response → NO redirect.
//
// The module holds a one-shot `_sessionExpiredRedirecting` latch that survives
// the page lifetime, so each test re-imports the module fresh via resetModules.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let replaceMock: ReturnType<typeof vi.fn>;
const realLocation = window.location;

function setLocation(pathname: string, search = "") {
  replaceMock = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { pathname, search, replace: replaceMock },
  });
}

function status401(): Response {
  return { ok: false, status: 401 } as Response;
}
function status200(): Response {
  return { ok: true, status: 200 } as Response;
}

// Let the returned promise settle AND the separately-attached redirect `.then`
// run (a microtask chained off the same fetch promise).
async function settle(p: Promise<unknown>) {
  await p.catch(() => {});
  await Promise.resolve();
  await Promise.resolve();
}

// Re-import apiFetch with a fresh module so the one-shot redirect latch resets.
async function freshApiFetch() {
  vi.resetModules();
  return (await import("./api-client")).apiFetch;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: realLocation,
  });
});

describe("apiFetch session-expiry redirect", () => {
  it("redirects to /pablo?returnTo=<path> on a 401 from a protected page", async () => {
    setLocation("/office", "?tab=desk");
    global.fetch = vi.fn(() => Promise.resolve(status401()));
    const apiFetch = await freshApiFetch();
    await settle(apiFetch("/api/business/summary"));
    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith(
      `/pablo?returnTo=${encodeURIComponent("/office?tab=desk")}`,
    );
  });

  it("does NOT redirect on a 401 at the public root landing '/'", async () => {
    setLocation("/");
    global.fetch = vi.fn(() => Promise.resolve(status401()));
    const apiFetch = await freshApiFetch();
    await settle(apiFetch("/api/world/state"));
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("does NOT redirect on a 401 while already on a public or auth route", async () => {
    for (const path of [
      "/pablo",
      "/immigration",
      "/immigration/legal",
      "/sms-opt-in",
      "/sms-opt-in/consent",
      "/sign-in",
      "/sign-in/factor-one",
      "/sign-up",
      "/sign-up/sso-callback",
    ]) {
      setLocation(path);
      global.fetch = vi.fn(() => Promise.resolve(status401()));
      const apiFetch = await freshApiFetch();
      await settle(apiFetch("/api/world/state"));
      expect(replaceMock, path).not.toHaveBeenCalled();
    }
  });

  it("does NOT redirect for the auth-polling skip paths even off a protected page", async () => {
    for (const reqPath of ["/api/auth/user", "/api/auth/providers"]) {
      setLocation("/office");
      global.fetch = vi.fn(() => Promise.resolve(status401()));
      const apiFetch = await freshApiFetch();
      await settle(apiFetch(reqPath));
      expect(replaceMock, reqPath).not.toHaveBeenCalled();
    }
  });

  it("does NOT redirect for a non-401 response", async () => {
    setLocation("/office");
    global.fetch = vi.fn(() => Promise.resolve(status200()));
    const apiFetch = await freshApiFetch();
    await settle(apiFetch("/api/business/summary"));
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
