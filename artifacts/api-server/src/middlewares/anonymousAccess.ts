import { createHmac, timingSafeEqual } from "node:crypto";
import { type NextFunction, type Request, type Response } from "express";

export const ANONYMOUS_ACCESS_DAYS = 5;
export const ANONYMOUS_ACCESS_MS = ANONYMOUS_ACCESS_DAYS * 24 * 60 * 60 * 1000;
export const ANONYMOUS_ACCESS_COOKIE = "salaryman_anon_since";

declare global {
  namespace Express {
    interface Request {
      anonymousAccess?: {
        startedAt: number;
        expiresAt: number;
        expired: boolean;
      };
    }
  }
}

function cookieSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required to sign anonymous-access cookies");
  }
  return "development-only-anonymous-access-cookie";
}

function signature(timestamp: string): string {
  return createHmac("sha256", cookieSecret()).update(timestamp).digest("base64url");
}

function readStartedAt(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const [timestamp, suppliedSignature, ...extra] = value.split(".");
  if (!timestamp || !suppliedSignature || extra.length > 0 || !/^\d{10,16}$/.test(timestamp)) return null;
  const expected = Buffer.from(signature(timestamp));
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  const startedAt = Number(timestamp);
  if (!Number.isSafeInteger(startedAt) || startedAt > Date.now() + 5 * 60 * 1000) return null;
  return startedAt;
}

function isAlwaysAllowed(path: string): boolean {
  return path === "/visitor-access"
    || path === "/healthz"
    || path === "/version"
    || path === "/login"
    || path === "/logout"
    || path === "/legal"
    || path.startsWith("/legal/")
    || path === "/auth"
    || path.startsWith("/auth/")
    || path === "/stripe/webhook"
    || path.startsWith("/bots/webhook/")
    || path.startsWith("/twilio/webhook/");
}

export function anonymousAccessMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.isAuthenticated?.() || isAlwaysAllowed(req.path)) {
    next();
    return;
  }

  const now = Date.now();
  const existing = readStartedAt(req.cookies?.[ANONYMOUS_ACCESS_COOKIE]);
  const startedAt = existing ?? now;
  const expiresAt = startedAt + ANONYMOUS_ACCESS_MS;

  if (!existing) {
    const forwardedProto = req.headers["x-forwarded-proto"];
    const secure = req.secure || forwardedProto === "https";
    res.cookie(ANONYMOUS_ACCESS_COOKIE, `${startedAt}.${signature(String(startedAt))}`, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 365 * 24 * 60 * 60 * 1000,
    });
  }

  req.anonymousAccess = { startedAt, expiresAt, expired: now >= expiresAt };
  if (req.anonymousAccess.expired) {
    res.status(403).json({
      error: "ANONYMOUS_ACCESS_EXPIRED",
      message: "Sign in to continue using SALARYMAN.",
      expiresAt: new Date(expiresAt).toISOString(),
    });
    return;
  }
  next();
}