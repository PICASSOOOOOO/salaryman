import type { NextFunction, Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ANONYMOUS_ACCESS_COOKIE,
  ANONYMOUS_ACCESS_MS,
  anonymousAccessMiddleware,
  getAnonymousAccessCookieStatus,
} from "../middlewares/anonymousAccess";

type MockResponse = Response & {
  cookie: ReturnType<typeof vi.fn>;
};

function invokeMiddleware(path: string, cookieValue?: string) {
  const req = {
    isAuthenticated: () => false,
    path,
    cookies: cookieValue ? { [ANONYMOUS_ACCESS_COOKIE]: cookieValue } : {},
    headers: {},
    secure: true,
  } as unknown as Request;
  const responseState: { statusCode?: number; body?: unknown } = {};
  const res = {
    cookie: vi.fn(),
    status(code: number) {
      responseState.statusCode = code;
      return res;
    },
    json(body: unknown) {
      responseState.body = body;
      return res;
    },
  } as unknown as MockResponse;
  const next = vi.fn() as unknown as NextFunction;

  anonymousAccessMiddleware(req, res, next);
  return { req, res, next, responseState };
}

afterEach(() => vi.restoreAllMocks());

describe("anonymous access window", () => {
  it("keeps the first visit timestamp fixed and blocks at five days", () => {
    const startedAt = Date.UTC(2026, 0, 1);
    vi.spyOn(Date, "now").mockReturnValue(startedAt);

    const firstVisit = invokeMiddleware("/api/private");
    expect(firstVisit.next).toHaveBeenCalledOnce();
    expect(firstVisit.res.cookie).toHaveBeenCalledOnce();
    const cookieValue = firstVisit.res.cookie.mock.calls[0][1] as string;

    vi.mocked(Date.now).mockReturnValue(startedAt + 24 * 60 * 60 * 1000);
    const laterRequest = invokeMiddleware("/private", cookieValue);
    expect(laterRequest.next).toHaveBeenCalledOnce();
    expect(laterRequest.res.cookie).not.toHaveBeenCalled();
    expect(getAnonymousAccessCookieStatus(
      `${ANONYMOUS_ACCESS_COOKIE}=${cookieValue}`,
      startedAt + 24 * 60 * 60 * 1000,
    )).toMatchObject({ valid: true, startedAt, expired: false });

    vi.mocked(Date.now).mockReturnValue(startedAt + ANONYMOUS_ACCESS_MS);
    const expiredRequest = invokeMiddleware("/private", cookieValue);
    expect(expiredRequest.responseState.statusCode).toBe(403);
    expect(expiredRequest.responseState.body).toMatchObject({ error: "ANONYMOUS_ACCESS_EXPIRED" });
    expect(expiredRequest.next).not.toHaveBeenCalled();
  });

  it("keeps the visitor status and legal paths available after expiry", () => {
    const startedAt = Date.UTC(2026, 0, 1);
    vi.spyOn(Date, "now").mockReturnValue(startedAt);
    const firstVisit = invokeMiddleware("/private");
    const cookieValue = firstVisit.res.cookie.mock.calls[0][1] as string;

    vi.mocked(Date.now).mockReturnValue(startedAt + ANONYMOUS_ACCESS_MS);
    const statusRequest = invokeMiddleware("/api/visitor-access", cookieValue);
    expect(statusRequest.next).toHaveBeenCalledOnce();
    expect(statusRequest.req.anonymousAccess?.expired).toBe(true);

    const legalRequest = invokeMiddleware("/legal/privacy", cookieValue);
    expect(legalRequest.next).toHaveBeenCalledOnce();
    expect(legalRequest.responseState.statusCode).toBeUndefined();
  });

  it("keeps Replit OIDC login and callback routes available after expiry", () => {
    const startedAt = Date.UTC(2026, 0, 1);
    vi.spyOn(Date, "now").mockReturnValue(startedAt);
    const firstVisit = invokeMiddleware("/private");
    const cookieValue = firstVisit.res.cookie.mock.calls[0][1] as string;

    vi.mocked(Date.now).mockReturnValue(startedAt + ANONYMOUS_ACCESS_MS);

    for (const path of ["/login", "/callback", "/api/callback", "/logout", "/auth/user"]) {
      const request = invokeMiddleware(path, cookieValue);
      expect(request.next, `${path} should continue to the auth route`).toHaveBeenCalledOnce();
      expect(request.responseState.statusCode, `${path} should not return an expired-access error`).toBeUndefined();
    }
  });
});