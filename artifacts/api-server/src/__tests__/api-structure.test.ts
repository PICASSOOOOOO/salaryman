import { describe, it, expect, beforeAll } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

// Contract test for the API's structure. Mounts the REAL aggregate router (the
// same one index.ts serves under "/api") onto a bare app with NO authenticated
// session, then asserts:
//   - liveness route answers 200,
//   - representative auth-enforced routes answer 401 (mounted + auth enforced),
//   - critical routers are actually mounted (never 404).
// A 404 here means a router was dropped from routes/index.ts — a structural
// regression the unit tests can't catch. This is mocked: no auth session, real
// dev DB, no external calls (handlers short-circuit at the auth gate).

let app: Express;

beforeAll(async () => {
  const router = (await import("../routes/index")).default;
  app = express();
  app.use(express.json());
  // Inject a passport-style auth shim that always reports logged-out, so every
  // requireAuth gate takes its 401 branch instead of throwing.
  app.use((req, _res, next) => {
    (req as any).isAuthenticated = () => false;
    (req as any).user = undefined;
    next();
  });
  app.use("/api", router);
});

describe("API structure: liveness", () => {
  it("GET /api/healthz returns 200", async () => {
    const res = await request(app).get("/api/healthz");
    expect(res.status).toBe(200);
  });
});

describe("API structure: auth-enforced routes return 401 (not 404/500)", () => {
  const authRoutes: { method: "get" | "post"; path: string }[] = [
    { method: "get", path: "/api/account/settings" },
    { method: "post", path: "/api/salaryman/saves/ensure" },
    { method: "get", path: "/api/economy/bank/accounts" },
    { method: "get", path: "/api/autopilot" },
    { method: "post", path: "/api/twilio/call" },
    { method: "get", path: "/api/admin/connections/status" },
    { method: "get", path: "/api/bots" },
    { method: "post", path: "/api/bots/marketplace/activate" },
  ];

  it.each(authRoutes)("$method $path → 401", async ({ method, path }) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(401);
  });
});

describe("API structure: critical routers are mounted (never 404)", () => {
  // A representative endpoint per critical router. We only assert it is NOT 404
  // (i.e. the router is mounted); the exact status (200/401/400) is covered
  // elsewhere. This is the regression guard against a dropped router.use(...).
  const mounted: { method: "get" | "post"; path: string }[] = [
    { method: "get", path: "/api/healthz" }, // health
    { method: "get", path: "/api/version" }, // version
    { method: "get", path: "/api/account/settings" }, // account
    { method: "get", path: "/api/economy/bank/accounts" }, // bank
    { method: "post", path: "/api/twilio/call" }, // twilio
    { method: "get", path: "/api/autopilot" }, // autopilot
    { method: "get", path: "/api/admin/connections/status" }, // admin
    { method: "get", path: "/api/chat/channels" }, // chat
    { method: "post", path: "/api/gameplay/fiat/action" }, // gameplay fiat
    { method: "get", path: "/api/bots" }, // canonical Pixel Agent surface
    { method: "post", path: "/api/bots/marketplace/activate" }, // activation lifecycle
  ];

  it.each(mounted)("$method $path is mounted", async ({ method, path }) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).not.toBe(404);
  });
});
