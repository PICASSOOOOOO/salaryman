import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isDevelopmentHost,
  resolveGithubCreds,
  githubConfigured,
} from "../lib/github-auth";

// A GitHub OAuth App allows exactly ONE callback URL, so dev (*.replit.dev) and
// the published prod host need different OAuth Apps. resolveGithubCreds picks
// the right credential pair per host; these tests lock that selection in.

const ENV_KEYS = [
  "GITHUB_OAUTH_CLIENT_ID",
  "GITHUB_OAUTH_CLIENT_SECRET",
  "GITHUB_OAUTH_CLIENT_ID_PROD",
  "GITHUB_OAUTH_CLIENT_SECRET_PROD",
] as const;

describe("isDevelopmentHost", () => {
  it("treats localhost and Replit dev domains as development", () => {
    expect(isDevelopmentHost("localhost")).toBe(true);
    expect(isDevelopmentHost("localhost:5000")).toBe(true);
    expect(isDevelopmentHost("127.0.0.1")).toBe(true);
    expect(isDevelopmentHost("abc-123.worf.replit.dev")).toBe(true);
    expect(isDevelopmentHost("myrepl.username.repl.co")).toBe(true);
    expect(isDevelopmentHost("")).toBe(true);
  });

  it("treats custom domains and deployment hosts as production", () => {
    expect(isDevelopmentHost("picassoo.app")).toBe(false);
    expect(isDevelopmentHost("salaryman.replit.app")).toBe(false);
    expect(isDevelopmentHost("www.example.com")).toBe(false);
  });
});

describe("resolveGithubCreds", () => {
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

  it("returns the default pair for dev hosts", () => {
    process.env.GITHUB_OAUTH_CLIENT_ID = "dev-id";
    process.env.GITHUB_OAUTH_CLIENT_SECRET = "dev-secret";
    process.env.GITHUB_OAUTH_CLIENT_ID_PROD = "prod-id";
    process.env.GITHUB_OAUTH_CLIENT_SECRET_PROD = "prod-secret";

    expect(resolveGithubCreds("abc.worf.replit.dev")).toEqual({
      clientId: "dev-id",
      clientSecret: "dev-secret",
    });
  });

  it("returns the prod pair for production hosts when set", () => {
    process.env.GITHUB_OAUTH_CLIENT_ID = "dev-id";
    process.env.GITHUB_OAUTH_CLIENT_SECRET = "dev-secret";
    process.env.GITHUB_OAUTH_CLIENT_ID_PROD = "prod-id";
    process.env.GITHUB_OAUTH_CLIENT_SECRET_PROD = "prod-secret";

    expect(resolveGithubCreds("picassoo.app")).toEqual({
      clientId: "prod-id",
      clientSecret: "prod-secret",
    });
  });

  it("falls back to the default pair on prod when no prod app is configured", () => {
    process.env.GITHUB_OAUTH_CLIENT_ID = "dev-id";
    process.env.GITHUB_OAUTH_CLIENT_SECRET = "dev-secret";

    expect(resolveGithubCreds("picassoo.app")).toEqual({
      clientId: "dev-id",
      clientSecret: "dev-secret",
    });
  });

  it("does NOT use the prod app for a dev host even if prod is set", () => {
    process.env.GITHUB_OAUTH_CLIENT_ID_PROD = "prod-id";
    process.env.GITHUB_OAUTH_CLIENT_SECRET_PROD = "prod-secret";

    // No dev pair set, so a dev host has nothing to fall back to.
    expect(resolveGithubCreds("abc.worf.replit.dev")).toBeNull();
  });

  it("returns null (login disabled) when nothing is configured", () => {
    expect(resolveGithubCreds("picassoo.app")).toBeNull();
    expect(resolveGithubCreds("abc.worf.replit.dev")).toBeNull();
    expect(githubConfigured("picassoo.app")).toBe(false);
  });

  it("githubConfigured reflects the resolved pair per host", () => {
    process.env.GITHUB_OAUTH_CLIENT_ID = "dev-id";
    process.env.GITHUB_OAUTH_CLIENT_SECRET = "dev-secret";

    expect(githubConfigured("abc.worf.replit.dev")).toBe(true);
    // prod falls back to the default pair, so it's also "configured".
    expect(githubConfigured("picassoo.app")).toBe(true);
  });
});
