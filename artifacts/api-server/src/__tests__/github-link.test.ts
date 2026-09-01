import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

// GitHub OAuth helpers are mocked so the routes behave as if GitHub is
// configured without reaching out to GitHub. We only exercise the link
// status/disconnect surface here (no real OAuth round-trip).
vi.mock("../lib/github-auth", async (importActual) => ({
  ...(await importActual<typeof import("../lib/github-auth")>()),
  githubConfigured: vi.fn((_host: string) => true),
  resolveGithubCreds: vi.fn((_host: string) => ({
    clientId: "test-client",
    clientSecret: "test-secret",
  })),
}));

import request from "supertest";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import { randomUUID } from "crypto";
import { db, accountIdentitiesTable, usersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import authRouter from "../routes/auth";

const TEST_USER = {
  id: `test-ghlink-${randomUUID()}`,
  email: "ghlink-tester@example.test",
};

const authState: { authed: boolean; user: { id: string; email: string } } = {
  authed: true,
  user: TEST_USER,
};

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use((req, _res, next) => {
    // Mirror authMiddleware: authorization comes from the resolved local row.
    (req as any).dbUser = authState.authed ? authState.user : undefined;
    (req as any).user = (req as any).dbUser;
    (req as any).isAuthenticated = () => !!(req as any).dbUser;
    next();
  });
  app.use("/api", authRouter);
  return app;
}

async function clearLinks() {
  await db
    .delete(accountIdentitiesTable)
    .where(eq(accountIdentitiesTable.userId, TEST_USER.id));
}

let app: Express;

beforeAll(async () => {
  app = buildApp();
  // account_identities.user_id has a real FK to users, so seed a row.
  await db
    .insert(usersTable)
    .values({ id: TEST_USER.id, email: TEST_USER.email })
    .onConflictDoNothing();
});
beforeEach(async () => {
  authState.authed = true;
  authState.user = TEST_USER;
  vi.clearAllMocks();
  await clearLinks();
});
afterAll(async () => {
  await clearLinks();
  await db.delete(usersTable).where(eq(usersTable.id, TEST_USER.id));
});

describe("GitHub account linking", () => {
  it("status returns 401 when unauthenticated", async () => {
    authState.authed = false;
    const res = await request(app).get("/api/auth/github/status").send();
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Login required");
  });

  it("disconnect returns 401 when unauthenticated", async () => {
    authState.authed = false;
    const res = await request(app).post("/api/auth/github/disconnect").send();
    expect(res.status).toBe(401);
  });

  it("connect redirects with login_required when unauthenticated", async () => {
    authState.authed = false;
    const res = await request(app).get("/api/auth/github/connect?returnTo=/profile").send();
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/profile?github_link_error=login_required");
  });

  it("rejects a callback when the Clerk-local row is no longer present", async () => {
    const start = await request(app).get("/api/auth/github/connect?returnTo=/profile");
    const state = new URL(start.headers.location as string).searchParams.get("state");
    const cookies = (start.headers["set-cookie"] as unknown as string[]).map((value) => value.split(";")[0]);
    authState.authed = false;

    const callback = await request(app)
      .get(`/api/auth/github/callback?code=unused&state=${state}`)
      .set("Cookie", cookies);

    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe("/profile?github_link_error=session");
  });

  it("reports not linked for an account with no GitHub identity", async () => {
    const res = await request(app).get("/api/auth/github/status").send();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ configured: true, linked: false, githubLogin: null });
  });

  it("reports linked with the GitHub login once an identity row exists", async () => {
    await db.insert(accountIdentitiesTable).values({
      userId: TEST_USER.id,
      provider: "github",
      providerUserId: `gh-${randomUUID()}`,
      providerUsername: "octocat",
    });
    const res = await request(app).get("/api/auth/github/status").send();
    expect(res.status).toBe(200);
    expect(res.body.linked).toBe(true);
    expect(res.body.githubLogin).toBe("octocat");
    expect(res.body.linkedAt).toBeTruthy();
  });

  it("disconnect removes the linked identity", async () => {
    await db.insert(accountIdentitiesTable).values({
      userId: TEST_USER.id,
      provider: "github",
      providerUserId: `gh-${randomUUID()}`,
      providerUsername: "octocat",
    });

    const res = await request(app).post("/api/auth/github/disconnect").send();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });

    const rows = await db
      .select()
      .from(accountIdentitiesTable)
      .where(
        and(
          eq(accountIdentitiesTable.userId, TEST_USER.id),
          eq(accountIdentitiesTable.provider, "github"),
        ),
      );
    expect(rows).toHaveLength(0);

    // Reflected in status afterward.
    const status = await request(app).get("/api/auth/github/status").send();
    expect(status.body.linked).toBe(false);
  });
});
