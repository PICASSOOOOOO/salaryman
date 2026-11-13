import { describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

const mocks = vi.hoisted(() => ({
  isPlatformAdminEmail: vi.fn(() => false),
  isPicassoOrgOwner: vi.fn(async () => false),
}));

vi.mock("../lib/plan", async (importActual) => ({
  ...(await importActual<typeof import("../lib/plan")>()),
  isPlatformAdminEmail: mocks.isPlatformAdminEmail,
  isPicassoOrgOwner: mocks.isPicassoOrgOwner,
}));

import alphaRouter from "./alpha";

function buildApp(): Express {
  const app = express();
  app.use((req, _res, next) => {
    (req as any).isAuthenticated = () => true;
    (req as any).user = { id: "tester-only", email: "dcmthree86@gmail.com" };
    next();
  });
  app.use("/api", alphaRouter);
  return app;
}

describe("alpha tester administration authorization", () => {
  it("denies global tester management to owner-bypass-only accounts", async () => {
    const response = await request(buildApp()).get("/api/alpha/applications");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "Picasso admin access required" });
  });
});
