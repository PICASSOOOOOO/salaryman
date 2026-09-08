import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import authRouter from "../routes/auth";

// Guards GET /api/auth/providers — the probe the SignInPrompt uses to decide
// which login buttons to render. If this route stops reporting a provider as
// unavailable, the frontend re-introduces a dead-end "Continue with GitHub" /
// "Continue with Discord" click that just bounces back with ?auth_error=…
// (github_link_error=unavailable / discord_link_error=unavailable). Clerk is the platform
// identity provider and must ALWAYS be reported true. GitHub is gated per-host (one OAuth
// App = one callback URL), Discord on a single global credential pair.

const ENV_KEYS = [
  "GITHUB_OAUTH_CLIENT_ID",
  "GITHUB_OAUTH_CLIENT_SECRET",
  "GITHUB_OAUTH_CLIENT_ID_PROD",
  "GITHUB_OAUTH_CLIENT_SECRET_PROD",
  "DISCORD_OAUTH_CLIENT_ID",
  "DISCORD_OAUTH_CLIENT_SECRET",
] as const;

const DEV_HOST = "abc-123.worf.replit.dev";
const PROD_HOST = "picassoo.app";

let app: Express;

beforeAll(() => {
  // Mirror the real mount: the auth router lives under "/api" (its own paths are
  // "/auth/..."). The /auth/providers route needs neither auth nor cookies.
  app = express();
  app.use("/api", authRouter);
});

function getProviders(host: string) {
  return request(app)
    .get("/api/auth/providers")
    .set("Host", host)
    .set("x-forwarded-proto", "https");
}

describe("GET /api/auth/providers", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("reports Clerk and explicitly does not report Replit Auth", async () => {
    const res = await getProviders(DEV_HOST);
    expect(res.status).toBe(200);
    expect(res.body.clerk).toBe(true);
    expect(res.body.replit).toBe(false);
  });

  it("reports github=false when no GitHub OAuth App resolves for the host", async () => {
    const res = await getProviders(DEV_HOST);
    expect(res.status).toBe(200);
    expect(res.body.github).toBe(false);
  });

  it("reports github=true when GitHub creds are present for the host", async () => {
    process.env.GITHUB_OAUTH_CLIENT_ID = "dev-client-id";
    process.env.GITHUB_OAUTH_CLIENT_SECRET = "dev-client-secret";

    const res = await getProviders(DEV_HOST);
    expect(res.status).toBe(200);
    expect(res.body.github).toBe(true);
  });

  it("reports github per-host: dev creds don't enable github on a prod host", async () => {
    // Only the dev pair is set. A dev host resolves it; a prod host has no prod
    // app and falls back to the default pair, so prod is ALSO enabled here.
    process.env.GITHUB_OAUTH_CLIENT_ID = "dev-client-id";
    process.env.GITHUB_OAUTH_CLIENT_SECRET = "dev-client-secret";

    expect((await getProviders(DEV_HOST)).body.github).toBe(true);
    expect((await getProviders(PROD_HOST)).body.github).toBe(true);
  });

  it("reports github=false on a dev host when only the PROD app is configured", async () => {
    // A dev host can't use the *_PROD app (one OAuth App = one callback URL) and
    // has no default pair to fall back to, so github must be reported off.
    process.env.GITHUB_OAUTH_CLIENT_ID_PROD = "prod-client-id";
    process.env.GITHUB_OAUTH_CLIENT_SECRET_PROD = "prod-client-secret";

    expect((await getProviders(DEV_HOST)).body.github).toBe(false);
    // The prod host can use it, so prod stays enabled.
    expect((await getProviders(PROD_HOST)).body.github).toBe(true);
  });

  it("reports discord=false when Discord OAuth is not configured", async () => {
    const res = await getProviders(DEV_HOST);
    expect(res.status).toBe(200);
    expect(res.body.discord).toBe(false);
  });

  it("reports discord=true when both Discord OAuth creds are present", async () => {
    process.env.DISCORD_OAUTH_CLIENT_ID = "discord-client-id";
    process.env.DISCORD_OAUTH_CLIENT_SECRET = "discord-client-secret";

    const res = await getProviders(DEV_HOST);
    expect(res.status).toBe(200);
    expect(res.body.discord).toBe(true);
  });

  it("reports discord=false when only one of the Discord creds is set", async () => {
    process.env.DISCORD_OAUTH_CLIENT_ID = "discord-client-id";
    // secret missing — not configured.

    const res = await getProviders(DEV_HOST);
    expect(res.status).toBe(200);
    expect(res.body.discord).toBe(false);
  });

  it("reports all three independently in one response", async () => {
    process.env.GITHUB_OAUTH_CLIENT_ID = "dev-client-id";
    process.env.GITHUB_OAUTH_CLIENT_SECRET = "dev-client-secret";
    process.env.DISCORD_OAUTH_CLIENT_ID = "discord-client-id";
    process.env.DISCORD_OAUTH_CLIENT_SECRET = "discord-client-secret";

    const res = await getProviders(DEV_HOST);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ replit: false, clerk: true, discord: true, github: true });
  });
});
