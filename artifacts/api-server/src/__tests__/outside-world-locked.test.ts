import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import eventsRouter from "../routes/events";
import subwayRouter from "../routes/subway";
import { OUTSIDE_WORLD_ENABLED } from "../lib/outside-world";

function appWith(router: express.Router) {
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  return app;
}

describe("building-only mode", () => {
  it("keeps the exterior runtime disabled by default", () => {
    expect(OUTSIDE_WORLD_ENABLED).toBe(false);
  });

  it("rejects exterior event actions before touching world state", async () => {
    const res = await request(appWith(eventsRouter)).get("/api/events/history");
    expect(res.status).toBe(410);
    expect(res.body.code).toBe("OUTSIDE_WORLD_LOCKED");
  });

  it("rejects transit actions before touching the database", async () => {
    const res = await request(appWith(subwayRouter)).get("/api/subway/stations");
    expect(res.status).toBe(410);
    expect(res.body.code).toBe("OUTSIDE_WORLD_LOCKED");
  });
});