import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, socialConnectionsTable } from "@workspace/db";
import { completeSocialOAuth, beginSocialOAuth } from "./social-oauth";

const USER_ID = `oauth-test-${randomUUID()}`;

beforeEach(async () => {
  await db.delete(socialConnectionsTable).where(eq(socialConnectionsTable.userId, USER_ID));
  vi.stubEnv("SOCIAL_CREDENTIALS_ENCRYPTION_KEY", "test-only-oauth-encryption-key");
  vi.stubEnv("APP_BASE_URL", "https://salaryman-oauth-test.example");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await db.delete(socialConnectionsTable).where(eq(socialConnectionsTable.userId, USER_ID));
});

describe("social OAuth flows", () => {
  it("requests X user-write scopes with PKCE", async () => {
    const flow = await beginSocialOAuth(USER_ID, "twitter", "x-client-id", "x-client-secret");
    const url = new URL(flow.authorizationUrl);
    const scopes = (url.searchParams.get("scope") ?? "").split(" ");

    expect(url.origin + url.pathname).toBe("https://x.com/i/oauth2/authorize");
    expect(flow.redirectUri).toBe("https://salaryman-oauth-test.example/api/social/oauth/callback");
    expect(scopes).toEqual(expect.arrayContaining(["tweet.read", "tweet.write", "users.read", "offline.access"]));
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("requests the LinkedIn member-post scope and stores the connected account", async () => {
    const flow = await beginSocialOAuth(USER_ID, "linkedin", "linkedin-client-id", "linkedin-client-secret");
    const authorization = new URL(flow.authorizationUrl);
    const scopes = (authorization.searchParams.get("scope") ?? "").split(" ");

    expect(authorization.origin + authorization.pathname).toBe("https://www.linkedin.com/oauth/v2/authorization");
    expect(scopes).toEqual(expect.arrayContaining(["openid", "profile", "w_member_social"]));

    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (calls.length === 1) {
        return new Response(JSON.stringify({
          access_token: "test-access-token",
          refresh_token: "test-refresh-token",
          expires_in: 3600,
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ sub: "member-123", name: "Test Member" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }));

    const state = authorization.searchParams.get("state");
    expect(state).toBeTruthy();
    await expect(completeSocialOAuth(state!, "linkedin-auth-code")).resolves.toEqual({
      provider: "linkedin",
      userId: USER_ID,
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("https://www.linkedin.com/oauth/v2/accessToken");
    expect(new URLSearchParams(calls[0].init?.body as string).get("grant_type")).toBe("authorization_code");
    expect(calls[1].url).toBe("https://api.linkedin.com/v2/userinfo");
    expect(new Headers(calls[1].init?.headers).get("authorization")).toBe("Bearer test-access-token");

    const [connection] = await db.select({
      status: socialConnectionsTable.status,
      accountHandle: socialConnectionsTable.accountHandle,
    }).from(socialConnectionsTable).where(and(
      eq(socialConnectionsTable.userId, USER_ID),
      eq(socialConnectionsTable.provider, "linkedin"),
    ));
    expect(connection).toMatchObject({ status: "connected", accountHandle: "Test Member" });
  });

  it("uses the stored X PKCE verifier for token exchange and resolves the account", async () => {
    const flow = await beginSocialOAuth(USER_ID, "twitter", "x-client-id", "x-client-secret");
    const authorization = new URL(flow.authorizationUrl);
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (calls.length === 1) {
        return new Response(JSON.stringify({
          access_token: "test-x-access-token",
          refresh_token: "test-x-refresh-token",
          expires_in: 3600,
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ data: { id: "x-user-123", username: "testuser", name: "Test X User" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }));

    const state = authorization.searchParams.get("state");
    expect(state).toBeTruthy();
    await expect(completeSocialOAuth(state!, "x-auth-code")).resolves.toEqual({
      provider: "twitter",
      userId: USER_ID,
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("https://api.x.com/2/oauth2/token");
    const tokenBody = new URLSearchParams(calls[0].init?.body as string);
    expect(tokenBody.get("grant_type")).toBe("authorization_code");
    expect(tokenBody.get("code_verifier")).toBeTruthy();
    expect(tokenBody.get("redirect_uri")).toBe(flow.redirectUri);
    expect(calls[1].url).toBe("https://api.x.com/2/users/me?user.fields=name,username");
    expect(new Headers(calls[1].init?.headers).get("authorization")).toBe("Bearer test-x-access-token");

    const [connection] = await db.select({
      status: socialConnectionsTable.status,
      accountHandle: socialConnectionsTable.accountHandle,
    }).from(socialConnectionsTable).where(and(
      eq(socialConnectionsTable.userId, USER_ID),
      eq(socialConnectionsTable.provider, "twitter"),
    ));
    expect(connection).toMatchObject({ status: "connected", accountHandle: "@testuser" });
  });
});
