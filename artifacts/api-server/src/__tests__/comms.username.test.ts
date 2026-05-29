import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  buildApp,
  actAs,
  setAuthed,
  createUser,
  cleanupTestData,
} from "./helpers/commsTestApp";

let app: Express;

beforeAll(() => {
  app = buildApp();
});
afterAll(async () => {
  await cleanupTestData();
});

describe("GET /account/username", () => {
  it("401 when not authenticated", async () => {
    const user = await createUser();
    actAs(user);
    setAuthed(false);
    const res = await request(app).get("/api/account/username").send();
    expect(res.status).toBe(401);
  });

  it("derives a handle from the user's name on first read (no cooldown consumed)", async () => {
    const user = await createUser({ firstName: "Ada", lastName: "Lovelace" });
    actAs(user);
    const res = await request(app).get("/api/account/username").send();
    expect(res.status).toBe(200);
    expect(typeof res.body.username).toBe("string");
    expect(res.body.username.startsWith("adalovelace")).toBe(true);
    // First derivation must NOT consume the change cooldown.
    expect(res.body.usernameChangedAt).toBeNull();
    expect(res.body.canChangeNow).toBe(true);

    // The derived handle persists.
    const again = await request(app).get("/api/account/username").send();
    expect(again.body.username).toBe(res.body.username);
  });
});

describe("POST /account/username", () => {
  it("400 when username is missing/blank", async () => {
    const user = await createUser();
    actAs(user);
    const missing = await request(app).post("/api/account/username").send({});
    expect(missing.status).toBe(400);
    const blank = await request(app).post("/api/account/username").send({ username: "   " });
    expect(blank.status).toBe(400);
  });

  it("400 on bad format (too short / bad start char)", async () => {
    const user = await createUser();
    actAs(user);
    const tooShort = await request(app).post("/api/account/username").send({ username: "ab" });
    expect(tooShort.status).toBe(400);
    const badStart = await request(app).post("/api/account/username").send({ username: "1abc" });
    expect(badStart.status).toBe(400);
    const badChars = await request(app).post("/api/account/username").send({ username: "Bad Name!" });
    expect(badChars.status).toBe(400);
  });

  it("enforces the 60-day cooldown after the first explicit change", async () => {
    const user = await createUser();
    actAs(user);
    const first = await request(app)
      .post("/api/account/username")
      .send({ username: `cooldown_${Date.now().toString(36)}` });
    expect(first.status).toBe(200);
    expect(first.body.usernameChangedAt).not.toBeNull();
    expect(first.body.canChangeNow).toBe(false);

    const second = await request(app)
      .post("/api/account/username")
      .send({ username: `cooldown2_${Date.now().toString(36)}` });
    expect(second.status).toBe(429);
    expect(second.body.canChangeAt).toBeTruthy();
  });

  it("allows changing to the same handle (no-op) even within cooldown", async () => {
    const user = await createUser();
    actAs(user);
    const handle = `samehandle_${Date.now().toString(36)}`;
    const first = await request(app).post("/api/account/username").send({ username: handle });
    expect(first.status).toBe(200);
    // Re-submitting the identical handle is a no-op and must not be rate-limited.
    const same = await request(app).post("/api/account/username").send({ username: handle.toUpperCase() });
    expect(same.status).toBe(200);
    expect(same.body.username).toBe(handle);
  });

  it("409 when the handle is already taken by another user", async () => {
    const taken = `taken_${Date.now().toString(36)}`;
    const owner = await createUser({ username: taken });
    const other = await createUser();
    actAs(other);
    const res = await request(app).post("/api/account/username").send({ username: taken });
    expect(res.status).toBe(409);
    // The owner still holds the handle.
    const [row] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, owner.id));
    expect(row.username).toBe(taken);
  });
});
