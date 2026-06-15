import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
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

describe("GET /account/settings", () => {
  it("401 when not authenticated", async () => {
    const user = await createUser();
    actAs(user);
    setAuthed(false);
    const res = await request(app).get("/api/account/settings").send();
    expect(res.status).toBe(401);
  });

  it("returns nulls for a player who has never synced", async () => {
    const user = await createUser();
    actAs(user);
    const res = await request(app).get("/api/account/settings").send();
    expect(res.status).toBe(200);
    expect(res.body.settings).toBeNull();
    expect(res.body.lowGfx).toBeNull();
  });
});

describe("PUT /account/settings", () => {
  it("401 when not authenticated", async () => {
    const user = await createUser();
    actAs(user);
    setAuthed(false);
    const res = await request(app)
      .put("/api/account/settings")
      .send({ settings: { bloom: false }, lowGfx: true });
    expect(res.status).toBe(401);
  });

  it("400 when neither settings nor lowGfx is provided", async () => {
    const user = await createUser();
    actAs(user);
    const res = await request(app).put("/api/account/settings").send({});
    expect(res.status).toBe(400);
  });

  it("persists the settings blob and reads it back", async () => {
    const user = await createUser();
    actAs(user);
    const settings = { bloom: false, groundGlow: false, cameraZoom: 2.4, master: 0.5 };
    const put = await request(app).put("/api/account/settings").send({ settings, lowGfx: true });
    expect(put.status).toBe(200);
    expect(put.body.ok).toBe(true);
    expect(put.body.settings).toEqual(settings);
    expect(put.body.lowGfx).toBe(true);

    const get = await request(app).get("/api/account/settings").send();
    expect(get.status).toBe(200);
    expect(get.body.settings).toEqual(settings);
    expect(get.body.lowGfx).toBe(true);
  });

  it("partial update keeps the previously stored field", async () => {
    const user = await createUser();
    actAs(user);
    const settings = { nightLighting: false };
    await request(app).put("/api/account/settings").send({ settings, lowGfx: true });

    // Push lowGfx only — the settings blob must survive.
    const put = await request(app).put("/api/account/settings").send({ lowGfx: false });
    expect(put.status).toBe(200);
    expect(put.body.settings).toEqual(settings);
    expect(put.body.lowGfx).toBe(false);

    // Push settings only — lowGfx must survive.
    const settings2 = { nightLighting: true, bloom: false };
    const put2 = await request(app).put("/api/account/settings").send({ settings: settings2 });
    expect(put2.status).toBe(200);
    expect(put2.body.settings).toEqual(settings2);
    expect(put2.body.lowGfx).toBe(false);
  });

  it("413 when the settings blob is too large", async () => {
    const user = await createUser();
    actAs(user);
    const big: Record<string, string> = {};
    for (let i = 0; i < 1000; i++) big[`k${i}`] = "x".repeat(20);
    const res = await request(app).put("/api/account/settings").send({ settings: big });
    expect(res.status).toBe(413);
  });
});
