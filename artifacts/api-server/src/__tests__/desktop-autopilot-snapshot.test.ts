import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { db, deviceLinksTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import {
  actAs,
  buildApp,
  cleanupTestData,
  createOrg,
  createUser,
  setAuthed,
} from "./helpers/autopilotTestApp";

const issuedLinks: string[] = [];
let app: Express;

beforeAll(() => {
  app = buildApp();
});

beforeEach(() => {
  setAuthed(true);
});

afterAll(async () => {
  if (issuedLinks.length) {
    await db.delete(deviceLinksTable).where(inArray(deviceLinksTable.id, issuedLinks));
  }
  await cleanupTestData();
});

describe("GET /api/autopilot/desktop-snapshot", () => {
  it("rejects requests without a linked desktop credential", async () => {
    const response = await request(app).get("/api/autopilot/desktop-snapshot");
    expect(response.status).toBe(401);
  });

  it("returns only the user's permitted, read-only domain state", async () => {
    const user = await createUser();
    await createOrg(user.id);
    actAs(user);

    const credential = `sm_desktop_${"A".repeat(43)}`;
    const deviceId = "pygame-device-0001";
    const [link] = await db.insert(deviceLinksTable).values({
      userId: user.id,
      desktopDeviceId: deviceId,
      desktopName: "SALARYMAN game",
      status: "linked",
      linkedAt: new Date(),
      desktopAccessTokenHash: createHash("sha256").update(credential).digest("hex"),
      scopes: ["salaryman_app"],
    }).returning();
    issuedLinks.push(link.id);

    const response = await request(app)
      .get("/api/autopilot/desktop-snapshot")
      .set("Authorization", `Bearer ${credential}`)
      .set("X-Salaryman-Device-Id", deviceId);

    expect(response.status).toBe(200);
    expect(response.body.snapshotAt).toEqual(expect.any(String));
    expect(response.body.domains).toHaveLength(6);
    for (const domain of response.body.domains) {
      expect(Object.keys(domain).sort()).toEqual(["domain", "enabled", "lastRunAt"]);
      expect(typeof domain.enabled).toBe("boolean");
      expect(domain).not.toHaveProperty("orgId");
      expect(domain).not.toHaveProperty("prefs");
      expect(domain).not.toHaveProperty("budgetCapCents");
    }
  });
});
