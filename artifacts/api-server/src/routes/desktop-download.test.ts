import { describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

const mocks = vi.hoisted(() => ({
  isOwnerEmail: vi.fn(() => false),
  isPicassoOrgOwner: vi.fn(async () => false),
}));

vi.mock("@workspace/db", () => ({
  db: { select: vi.fn() },
  alphaApplicationsTable: {
    id: "id",
    userId: "userId",
    role: "role",
    status: "status",
  },
}));

vi.mock("../lib/plan", () => ({
  isOwnerEmail: mocks.isOwnerEmail,
  isPicassoOrgOwner: mocks.isPicassoOrgOwner,
}));

import desktopDownloadRouter from "./desktop-download";

function buildApp(authenticated: boolean): Express {
  const app = express();
  app.use((req, _res, next) => {
    (req as any).isAuthenticated = () => authenticated;
    if (authenticated) (req as any).user = { id: "user-1", email: "tester@example.com" };
    next();
  });
  app.use("/api", desktopDownloadRouter);
  return app;
}

describe("desktop download platform allowlist", () => {
  it.each(["windows", "macos", "linux"])("requires the existing access gate for %s downloads", async (platform) => {
    const response = await request(buildApp(false)).get(`/api/desktop/download?platform=${platform}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Login required" });
  });

  it("rejects platforms outside the fixed allowlist", async () => {
    const response = await request(buildApp(false)).get("/api/desktop/download?platform=../../secret");

    expect(response.status).toBe(400);
    expect(response.body.availablePlatforms).toEqual(["windows", "macos", "linux"]);
  });

  it("uses the same access gate for release availability", async () => {
    const response = await request(buildApp(false)).get("/api/desktop/access");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Login required" });
  });
});