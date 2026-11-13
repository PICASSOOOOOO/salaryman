import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

const mocks = vi.hoisted(() => ({
  isPlatformAdminEmail: vi.fn(() => false),
  isPicassoOrgOwner: vi.fn(async () => false),
  moderatorRows: [] as Array<{ id: string }>,
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => mocks.moderatorRows),
        })),
      })),
    })),
  },
  alphaApplicationsTable: {
    id: "id",
    userId: "userId",
    role: "role",
    status: "status",
  },
}));

vi.mock("../lib/plan", () => ({
  isPlatformAdminEmail: mocks.isPlatformAdminEmail,
  isPicassoOrgOwner: mocks.isPicassoOrgOwner,
}));

import desktopDownloadRouter from "./desktop-download";

beforeEach(() => {
  mocks.isPlatformAdminEmail.mockReturnValue(false);
  mocks.isPicassoOrgOwner.mockResolvedValue(false);
  mocks.moderatorRows = [];
});

function buildApp(authenticated: boolean, email = "tester@example.com"): Express {
  const app = express();
  app.use((req, _res, next) => {
    (req as any).isAuthenticated = () => authenticated;
    if (authenticated) (req as any).user = { id: "user-1", email };
    next();
  });
  app.use("/api", desktopDownloadRouter);
  return app;
}

describe("desktop download platform allowlist", () => {
  it("does not grant release access through owner-bypass alone", async () => {
    const response = await request(buildApp(true, "dcmthree86@gmail.com")).get("/api/desktop/access");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "Admin or approved moderator access required" });
  });

  it("retains release access for an approved moderator", async () => {
    mocks.moderatorRows = [{ id: "approved-tester" }];
    const response = await request(buildApp(true)).get("/api/desktop/access");

    expect(response.status).toBe(200);
    expect(response.body.allowed).toBe(true);
    expect(response.body.availablePlatforms).toEqual([]);
  });

  it("retains release access for Picasso organization owners", async () => {
    mocks.isPicassoOrgOwner.mockResolvedValue(true);
    const response = await request(buildApp(true)).get("/api/desktop/access");

    expect(response.status).toBe(200);
    expect(response.body.allowed).toBe(true);
  });

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