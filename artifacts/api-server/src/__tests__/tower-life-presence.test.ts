import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import router, { getTowerResidentPresence } from "../routes/tower-life";

function buildApp(authenticated = true) {
  const app = express();
  app.use((req, _res, next) => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => authenticated;
    (req as unknown as { user: { id: string } }).user = { id: "tower-test-user" };
    next();
  });
  app.use("/api", router);
  return app;
}

describe("Tower resident elevator presence", () => {
  it("moves MENDER-9 from boarding at the lobby, through transit, to floor 2", () => {
    const boarding = getTowerResidentPresence(new Date(Date.UTC(2026, 0, 1, 11, 15)));
    expect(boarding.find((resident) => resident.id === 509)).toMatchObject({
      floor: "lobby",
      phase: "boarding",
      nextFloor: 2,
    });

    const inTransit = getTowerResidentPresence(new Date(Date.UTC(2026, 0, 1, 11, 20)));
    expect(inTransit.some((resident) => resident.id === 509)).toBe(false);

    const arriving = getTowerResidentPresence(new Date(Date.UTC(2026, 0, 1, 11, 23)));
    expect(arriving.find((resident) => resident.id === 509)).toMatchObject({
      floor: 2,
      phase: "arriving",
      nextFloor: 2,
    });
  });

  it("keeps one authoritative floor assignment per resident", () => {
    for (let minute = 0; minute < 24 * 60; minute += 1) {
      const at = new Date(Date.UTC(2026, 0, 1, 0, minute));
      const residents = getTowerResidentPresence(at);
      expect(new Set(residents.map((resident) => resident.id)).size).toBe(residents.length);
      expect(residents.every((resident) => ["lobby", 2, 3, 4].includes(resident.floor))).toBe(true);
    }
  });

  it("requires sign-in and returns only the requested floor's residents", async () => {
    const unauthorized = await request(buildApp(false))
      .get("/api/tower/resident-presence?cityId=minx_city&floor=2");
    expect(unauthorized.status).toBe(401);

    const response = await request(buildApp())
      .get("/api/tower/resident-presence?cityId=minx_city&floor=2");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.cityId).toBe("minx_city");
    expect(response.body.floor).toBe(2);
    expect(response.body.residents.every((resident: { floor: number }) => resident.floor === 2)).toBe(true);

    const invalid = await request(buildApp())
      .get("/api/tower/resident-presence?cityId=minx_city&floor=67");
    expect(invalid.status).toBe(400);
  });
});
