// @vitest-environment jsdom
//
// Guards the sign-in redirect in `apiFetch`. Background 401 reads must not force
// guests to sign in; writes or explicitly opted-in feature reads may preserve the
// current destination when authentication is required.
//
// Contract:
//   1. A default GET 401 → NO redirect.
//   2. A write 401 on a protected feature → redirect with returnTo.
//   3. An explicitly opted-in GET 401 → redirect with returnTo.
//   4. A 401 on public/auth routes or auth-polling skip paths → NO redirect.
//   5. A non-401 response → NO redirect.
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

describe("apiFetch unauthorized redirect", () => {
  it("redirects after a rejected write and preserves the current route", async () => {
    setLocation("/office", "?tab=desk");
    global.fetch = vi.fn(() => Promise.resolve(status401()));
    const apiFetch = await freshApiFetch();
    await settle(apiFetch("/api/business/summary", { method: "POST" }));
    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith(
      `/sign-in?returnTo=${encodeURIComponent("/office?tab=desk")}`,
    );
  });

  it("does NOT redirect after a background GET 401 on a non-public route", async () => {
    setLocation("/business", "?tab=overview");
    global.fetch = vi.fn(() => Promise.resolve(status401()));
    const apiFetch = await freshApiFetch();
    await settle(apiFetch("/api/business/summary"));
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("redirects a GET only when its feature opts in", async () => {
    setLocation("/business/status", "?tab=overview");
    global.fetch = vi.fn(() => Promise.resolve(status401()));
    const apiFetch = await freshApiFetch();
    await settle(apiFetch("/api/business/status", { redirectOnUnauthorized: true }));
    expect(replaceMock).toHaveBeenCalledWith(
      `/sign-in?returnTo=${encodeURIComponent("/business/status?tab=overview")}`,
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
      "/1999",
      "/onboarding",
      "/onboarding/legal",
      "/sms-opt-in",
      "/sms-opt-in/consent",
      "/meet",
      "/meet/room-123",
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

  it("does NOT redirect a failed write on a public feature route", async () => {
    setLocation("/1999");
    global.fetch = vi.fn(() => Promise.resolve(status401()));
    const apiFetch = await freshApiFetch();
    await settle(apiFetch("/api/vault/entries", { method: "POST" }));
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("does NOT redirect for a non-401 response", async () => {
    setLocation("/office");
    global.fetch = vi.fn(() => Promise.resolve(status200()));
    const apiFetch = await freshApiFetch();
    await settle(apiFetch("/api/business/summary"));
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("does NOT redirect when a bootstrap read explicitly suppresses expiry handling", async () => {
    setLocation("/business");
    global.fetch = vi.fn(() => Promise.resolve(status401()));
    const apiFetch = await freshApiFetch();
    await settle(apiFetch("/api/salaryman/saves", { method: "POST", skipSessionExpiryRedirect: true }));
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
