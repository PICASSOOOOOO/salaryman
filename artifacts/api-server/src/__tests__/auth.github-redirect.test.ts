import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import authRouter from "../routes/auth";

// Route-level companion to github-auth.host-creds.test.ts. The unit test locks
// in resolveGithubCreds()'s per-host selection; this test proves the live
// GET /api/auth/github route actually wires that selection into the GitHub
// authorize redirect — the dev OAuth App on a dev host, the *_PROD app on a
// published host. A regression here silently breaks login on the live site.

const ENV_KEYS = [
  "GITHUB_OAUTH_CLIENT_ID",
  "GITHUB_OAUTH_CLIENT_SECRET",
  "GITHUB_OAUTH_CLIENT_ID_PROD",
  "GITHUB_OAUTH_CLIENT_SECRET_PROD",
] as const;

const DEV_HOST = "abc-123.worf.replit.dev";
const PROD_HOST = "picassoo.app";

let app: Express;

beforeAll(() => {
  // Mirror the real mount: the auth router lives under "/api" (its own paths
  // are "/auth/..."). The /auth/github redirect needs neither auth nor cookies
  // on the request side, so a bare express app is enough.
  app = express();
  app.use("/api", authRouter);
});

describe("GET /api/auth/github redirect picks the OAuth App per host", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    process.env.GITHUB_OAUTH_CLIENT_ID = "dev-client-id";
    process.env.GITHUB_OAUTH_CLIENT_SECRET = "dev-client-secret";
    process.env.GITHUB_OAUTH_CLIENT_ID_PROD = "prod-client-id";
    process.env.GITHUB_OAUTH_CLIENT_SECRET_PROD = "prod-client-secret";
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("redirects a dev host to GitHub with the DEV client_id + dev callback URL", async () => {
    const res = await request(app)
      .get("/api/auth/github")
      .set("Host", DEV_HOST)
      .set("x-forwarded-proto", "https");

    expect(res.status).toBe(302);
    const location = res.headers.location as string;
    expect(location.startsWith("https://github.com/login/oauth/authorize")).toBe(true);

    const url = new URL(location);
    expect(url.searchParams.get("client_id")).toBe("dev-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      `https://${DEV_HOST}/api/auth/github/callback`,
    );
    // A state nonce must be present (it's also stored in a cookie for CSRF).
    expect(url.searchParams.get("state")).toBeTruthy();
  });

  it("redirects a published host to GitHub with the PROD client_id + prod callback URL", async () => {
    const res = await request(app)
      .get("/api/auth/github")
      .set("Host", PROD_HOST)
      .set("x-forwarded-proto", "https");

    expect(res.status).toBe(302);
    const location = res.headers.location as string;
    expect(location.startsWith("https://github.com/login/oauth/authorize")).toBe(true);

    const url = new URL(location);
    expect(url.searchParams.get("client_id")).toBe("prod-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      `https://${PROD_HOST}/api/auth/github/callback`,
    );
    expect(url.searchParams.get("state")).toBeTruthy();
  });

  it("honors x-forwarded-host over the Host header when picking the app", async () => {
    // Behind the Replit proxy the published host arrives in x-forwarded-host
    // while the raw Host is an internal name; the prod app must still win.
    const res = await request(app)
      .get("/api/auth/github")
      .set("Host", "internal.local")
      .set("x-forwarded-host", PROD_HOST)
      .set("x-forwarded-proto", "https");

    expect(res.status).toBe(302);
    const url = new URL(res.headers.location as string);
    expect(url.searchParams.get("client_id")).toBe("prod-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      `https://${PROD_HOST}/api/auth/github/callback`,
    );
  });

  it("falls back to the default app on a prod host when no prod app is set", async () => {
    delete process.env.GITHUB_OAUTH_CLIENT_ID_PROD;
    delete process.env.GITHUB_OAUTH_CLIENT_SECRET_PROD;

    const res = await request(app)
      .get("/api/auth/github")
      .set("Host", PROD_HOST)
      .set("x-forwarded-proto", "https");

    expect(res.status).toBe(302);
    const url = new URL(res.headers.location as string);
    expect(url.searchParams.get("client_id")).toBe("dev-client-id");
  });

  it("redirects back with github_unavailable when nothing is configured", async () => {
    for (const k of ENV_KEYS) delete process.env[k];

    const res = await request(app)
      .get("/api/auth/github")
      .set("Host", PROD_HOST)
      .set("x-forwarded-proto", "https");

    expect(res.status).toBe(302);
    // No GitHub authorize redirect — bounce back to the app with an error flag.
    expect(res.headers.location).not.toContain("github.com");
    expect(res.headers.location).toContain("auth_error=github_unavailable");
  });
});
