import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

// Discord OAuth helpers are mocked so the routes behave as if Discord is
// configured without reaching out to Discord. We only exercise the link
// status/disconnect surface here (no real OAuth round-trip).
vi.mock("../lib/discord-auth", async (importActual) => ({
  ...(await importActual<typeof import("../lib/discord-auth")>()),
  discordConfigured: vi.fn(() => true),
}));

import request from "supertest";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import { randomUUID } from "crypto";
import { db, accountIdentitiesTable, usersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import authRouter from "../routes/auth";

const TEST_USER = {
  id: `test-dclink-${randomUUID()}`,
  email: "dclink-tester@example.test",
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
  // users.email is unique, so a leftover row from a prior aborted run would make
  // the onConflictDoNothing seed below silently skip (id never inserted) and the
  // FK insert tests would fail. Clear by email first, then seed.
  await db.delete(usersTable).where(eq(usersTable.email, TEST_USER.email));
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

describe("Discord account linking", () => {
  it("status returns 401 when unauthenticated", async () => {
    authState.authed = false;
    const res = await request(app).get("/api/auth/discord/status").send();
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Login required");
  });

  it("disconnect returns 401 when unauthenticated", async () => {
    authState.authed = false;
    const res = await request(app).post("/api/auth/discord/disconnect").send();
    expect(res.status).toBe(401);
  });

  it("connect redirects with login_required when unauthenticated", async () => {
    authState.authed = false;
    const res = await request(app).get("/api/auth/discord/connect?returnTo=/profile").send();
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/profile?discord_link_error=login_required");
  });

  it("rejects a callback when the Clerk-local row is no longer present", async () => {
    const start = await request(app).get("/api/auth/discord/connect?returnTo=/profile");
    const state = new URL(start.headers.location as string).searchParams.get("state");
    const cookies = (start.headers["set-cookie"] as unknown as string[]).map((value) => value.split(";")[0]);
    authState.authed = false;

    const callback = await request(app)
      .get(`/api/auth/discord/callback?code=unused&state=${state}`)
      .set("Cookie", cookies);

    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe("/profile?discord_link_error=session");
  });

  it("reports not linked for an account with no Discord identity", async () => {
    const res = await request(app).get("/api/auth/discord/status").send();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ configured: true, linked: false, discordUsername: null });
  });

  it("reports linked with the Discord username once an identity row exists", async () => {
    await db.insert(accountIdentitiesTable).values({
      userId: TEST_USER.id,
      provider: "discord",
      providerUserId: `dc-${randomUUID()}`,
      providerUsername: "neo",
    });
    const res = await request(app).get("/api/auth/discord/status").send();
    expect(res.status).toBe(200);
    expect(res.body.linked).toBe(true);
    expect(res.body.discordUsername).toBe("neo");
    expect(res.body.linkedAt).toBeTruthy();
  });

  it("disconnect removes the linked identity", async () => {
    await db.insert(accountIdentitiesTable).values({
      userId: TEST_USER.id,
      provider: "discord",
      providerUserId: `dc-${randomUUID()}`,
      providerUsername: "neo",
    });

    const res = await request(app).post("/api/auth/discord/disconnect").send();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });

    const rows = await db
      .select()
      .from(accountIdentitiesTable)
      .where(
        and(
          eq(accountIdentitiesTable.userId, TEST_USER.id),
          eq(accountIdentitiesTable.provider, "discord"),
        ),
      );
    expect(rows).toHaveLength(0);

    // Reflected in status afterward.
    const status = await request(app).get("/api/auth/discord/status").send();
    expect(status.body.linked).toBe(false);
  });
});
