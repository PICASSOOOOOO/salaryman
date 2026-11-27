import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  actAs,
  buildApp,
  cleanupTestData,
  createUser,
  setAuthed,
} from "./helpers/commsTestApp";

let app: Express;

beforeAll(() => {
  app = buildApp();
});

afterAll(async () => {
  await cleanupTestData();
});

describe("GET /account/workspace", () => {
  it("requires an authenticated account", async () => {
    const user = await createUser();
    actAs(user);
    setAuthed(false);

    const response = await request(app).get("/api/account/workspace");

    expect(response.status).toBe(401);
  });

  it("returns null before the account has a saved layout", async () => {
    const user = await createUser();
    actAs(user);

    const response = await request(app).get("/api/account/workspace");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ layout: null });
  });
});

describe("PUT /account/workspace", () => {
  it("requires an authenticated account", async () => {
    const user = await createUser();
    actAs(user);
    setAuthed(false);

    const response = await request(app)
      .put("/api/account/workspace")
      .send({ version: 2, slots: ["/pablo"] });

    expect(response.status).toBe(401);
  });

  it("validates and round-trips an account layout", async () => {
    const user = await createUser();
    actAs(user);
    const layout = {
      version: 2,
      slots: ["/pablo", "/workspace/notepad", null, "/creative/scene"],
    };

    const put = await request(app).put("/api/account/workspace").send(layout);
    const get = await request(app).get("/api/account/workspace");

    expect(put.status).toBe(200);
    expect(put.body).toEqual({ layout });
    expect(get.status).toBe(200);
    expect(get.body).toEqual({ layout });
  });

  it("rejects layouts outside the supported slot limit", async () => {
    const user = await createUser();
    actAs(user);

    const response = await request(app)
      .put("/api/account/workspace")
      .send({ version: 2, slots: Array.from({ length: 10 }, () => null) });

    expect(response.status).toBe(400);
  });

  it("keeps layouts isolated between accounts", async () => {
    const owner = await createUser();
    const other = await createUser();
    const layout = { version: 2, slots: ["/workspace/notepad"] };
    actAs(owner);
    await request(app).put("/api/account/workspace").send(layout).expect(200);

    actAs(other);
    const otherLayout = await request(app).get("/api/account/workspace");

    expect(otherLayout.status).toBe(200);
    expect(otherLayout.body).toEqual({ layout: null });
  });
});
