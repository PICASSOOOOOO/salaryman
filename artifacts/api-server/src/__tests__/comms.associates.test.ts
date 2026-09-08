import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { db, colleaguesTable, canonicalPair } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  buildApp,
  actAs,
  setAuthed,
  createUser,
  createOrgWithMembers,
  cleanupTestData,
} from "./helpers/commsTestApp";

let app: Express;

beforeAll(() => {
  app = buildApp();
});
afterAll(async () => {
  await cleanupTestData();
});

async function pairStatus(a: string, b: string) {
  const { userAId, userBId } = canonicalPair(a, b);
  const [row] = await db
    .select()
    .from(colleaguesTable)
    .where(and(eq(colleaguesTable.userAId, userAId), eq(colleaguesTable.userBId, userBId)));
  return row ?? null;
}

describe("POST /colleagues/request", () => {
  it("401 when not authenticated", async () => {
    const me = await createUser();
    actAs(me);
    setAuthed(false);
    const res = await request(app).post("/api/colleagues/request").send({ username: "anyone" });
    expect(res.status).toBe(401);
  });

  it("400 when neither @username nor email is provided", async () => {
    const me = await createUser();
    actAs(me);
    const res = await request(app).post("/api/colleagues/request").send({});
    expect(res.status).toBe(400);
  });

  it("adds an associate by @handle and stores a pending request", async () => {
    const handle = `assoc_${Date.now().toString(36)}`;
    const target = await createUser({ username: handle });
    const me = await createUser();
    actAs(me);

    const res = await request(app).post("/api/colleagues/request").send({ username: `@${handle}` });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("pending");

    const row = await pairStatus(me.id, target.id);
    expect(row?.status).toBe("pending");
    expect(row?.requesterId).toBe(me.id);
  });

  it("adds an associate by email", async () => {
    const target = await createUser();
    const me = await createUser();
    actAs(me);

    const res = await request(app).post("/api/colleagues/request").send({ email: target.email });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("pending");
    const row = await pairStatus(me.id, target.id);
    expect(row?.status).toBe("pending");
  });

  it("404 for an unknown @handle", async () => {
    const me = await createUser();
    actAs(me);
    const res = await request(app)
      .post("/api/colleagues/request")
      .send({ username: `nope_${Date.now().toString(36)}` });
    expect(res.status).toBe(404);
  });

  it("404 for an unknown email", async () => {
    const me = await createUser();
    actAs(me);
    const res = await request(app)
      .post("/api/colleagues/request")
      .send({ email: `ghost-${Date.now().toString(36)}@example.test` });
    expect(res.status).toBe(404);
  });

  it("400 when adding yourself by handle", async () => {
    const handle = `self_${Date.now().toString(36)}`;
    const me = await createUser({ username: handle });
    actAs(me);
    const res = await request(app).post("/api/colleagues/request").send({ username: handle });
    expect(res.status).toBe(400);
  });

  it("400 when a request is already pending", async () => {
    const handle = `dup_${Date.now().toString(36)}`;
    const target = await createUser({ username: handle });
    const me = await createUser();
    actAs(me);
    const first = await request(app).post("/api/colleagues/request").send({ username: handle });
    expect(first.status).toBe(200);
    const second = await request(app).post("/api/colleagues/request").send({ username: handle });
    expect(second.status).toBe(400);
  });

  it("400 when the target is already a coworker (sharing is automatic)", async () => {
    const handle = `cow_${Date.now().toString(36)}`;
    const coworker = await createUser({ username: handle });
    const me = await createUser();
    await createOrgWithMembers(me.id, [coworker.id]);
    actAs(me);
    const res = await request(app).post("/api/colleagues/request").send({ username: handle });
    expect(res.status).toBe(400);
    // No colleague row should be created for coworkers.
    expect(await pairStatus(me.id, coworker.id)).toBeNull();
  });

  it("auto-accepts when the other party already requested you", async () => {
    const target = await createUser();
    const me = await createUser();
    // Seed the reverse pending request (target -> me).
    const { userAId, userBId } = canonicalPair(target.id, me.id);
    await db.insert(colleaguesTable).values({ userAId, userBId, requesterId: target.id, status: "pending" });

    actAs(me);
    const res = await request(app).post("/api/colleagues/request").send({ email: target.email });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("accepted");
    const row = await pairStatus(me.id, target.id);
    expect(row?.status).toBe("accepted");
  });
});
