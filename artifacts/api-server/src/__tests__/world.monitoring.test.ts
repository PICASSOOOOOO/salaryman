import express, { type Express } from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  alphaApplicationsTable,
  bansTable,
  db,
  feedbackReportsTable,
  flaggedUsersTable,
  loginAttemptsTable,
  orgMembersTable,
  organizationsTable,
  usersTable,
} from "@workspace/db";

const { onlinePlayersMock } = vi.hoisted(() => ({
  onlinePlayersMock: vi.fn(),
}));

vi.mock("../worldServer", () => ({
  getOnlinePlayers: onlinePlayersMock,
  getServerStatus: () => ({}),
  getLiberationProgress: () => ({}),
  recordHeartbeat: () => {},
  SERVER_CITY_ID: "test-city",
  SERVER_REGION: "test-region",
  MAX_PLAYERS: 100,
  getWorldPlayerCount: () => 0,
}));

import worldRouter from "../routes/world";

let app: Express;
const auth = { user: { id: "", email: "" } };
const userIds: string[] = [];
const orgIds: number[] = [];

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.defineProperty(req, "isAuthenticated", { configurable: true, value: () => true });
    Object.defineProperty(req, "user", { configurable: true, value: auth.user });
    next();
  });
  app.use("/api", worldRouter);
});

beforeEach(() => {
  auth.user = { id: "", email: "" };
});

afterAll(async () => {
  if (userIds.length) {
    await db.delete(bansTable).where(inArray(bansTable.userId, userIds));
    await db.delete(flaggedUsersTable).where(inArray(flaggedUsersTable.userId, userIds));
    await db.delete(feedbackReportsTable).where(inArray(feedbackReportsTable.userId, userIds));
    await db.delete(loginAttemptsTable).where(inArray(loginAttemptsTable.email, userIds.map((id) => `${id}@example.test`)));
    await db.delete(alphaApplicationsTable).where(inArray(alphaApplicationsTable.userId, userIds));
    await db.delete(orgMembersTable).where(inArray(orgMembersTable.userId, userIds));
  }
  if (orgIds.length) {
    await db.delete(organizationsTable).where(inArray(organizationsTable.id, orgIds));
  }
  if (userIds.length) await db.delete(usersTable).where(inArray(usersTable.id, userIds));
});

async function createUser(label: string) {
  const id = `monitor-${label}-${randomUUID()}`;
  const email = `${id}@example.test`;
  const [user] = await db.insert(usersTable).values({ id, email, firstName: label }).returning();
  userIds.push(user.id);
  return { id: user.id, email: user.email! };
}

describe("world monitoring scope and security metadata", () => {
  it("limits organization owners to their own active members and returns metadata-only security counts", async () => {
    const owner = await createUser("owner");
    const employee = await createUser("employee");
    const outsider = await createUser("outsider");
    const moderator = await createUser("moderator");
    const [org] = await db.insert(organizationsTable).values({
      name: `Monitor org ${owner.id}`,
      ownerUserId: owner.id,
    }).returning({ id: organizationsTable.id });
    orgIds.push(org.id);
    await db.insert(orgMembersTable).values([
      { orgId: org.id, userId: owner.id, role: "owner", status: "active" },
      { orgId: org.id, userId: employee.id, role: "employee", status: "active" },
    ]);
    await db.insert(alphaApplicationsTable).values({
      userId: moderator.id,
      role: "alpha_tester",
      status: "approved",
    });

    await db.insert(flaggedUsersTable).values([
      { userId: employee.id, email: employee.email, reason: "security_signal", details: "private detail" },
      { userId: outsider.id, email: outsider.email, reason: "security_signal", details: "other private detail" },
    ]);
    await db.insert(bansTable).values([
      { userId: employee.id, bannedBy: owner.id, reason: "private ban reason", active: true },
      { userId: outsider.id, bannedBy: owner.id, reason: "another private reason", active: true },
    ]);
    await db.insert(feedbackReportsTable).values([
      { userId: employee.id, title: "Private report", description: "Do not reveal this content", status: "open" },
      { userId: outsider.id, title: "Other report", description: "Do not reveal this either", status: "open" },
    ]);
    await db.insert(loginAttemptsTable).values([
      { email: employee.email, ipAddress: "192.0.2.10", blocked: true, blockReason: "private security detail" },
      { email: outsider.email, ipAddress: "192.0.2.11", blocked: false },
    ]);

    onlinePlayersMock.mockReturnValue([
      {
        userId: owner.id,
        username: "Owner",
        firstName: "Owner",
        profileImageUrl: "/owner.png",
        status: "active",
        x: 25,
        y: 50,
        level: 99,
        speaking: true,
      },
      {
        userId: employee.id,
        username: "Employee",
        firstName: "Employee",
        profileImageUrl: "/employee.png",
        status: "active",
        x: 30,
        y: 55,
        level: 7,
        speaking: false,
      },
      {
        userId: outsider.id,
        username: "Outsider",
        firstName: "Outsider",
        profileImageUrl: "/outsider.png",
        status: "active",
        x: 90,
        y: 110,
        level: 3,
        speaking: false,
      },
    ]);

    auth.user = owner;
    const ownerPresence = await request(app).get("/api/world/online");
    expect(ownerPresence.status).toBe(200);
    expect(ownerPresence.body.scope).toBe("organization");
    expect(ownerPresence.body.players.map((player: { userId: string }) => player.userId).sort())
      .toEqual([employee.id]);
    expect(ownerPresence.body.players[0]).not.toHaveProperty("x");
    expect(ownerPresence.body.players[0]).not.toHaveProperty("level");
    expect(ownerPresence.body.players[0]).not.toHaveProperty("speaking");
    expect(ownerPresence.body.players[0]).not.toHaveProperty("email");

    const ownerSecurity = await request(app).get("/api/world/monitoring-security");
    expect(ownerSecurity.status).toBe(200);
    expect(ownerSecurity.body.security).toEqual({
      activeFlags: 1,
      activeBans: 1,
      openReports: 1,
      loginAttempts24h: 1,
      blockedLogins24h: 1,
    });
    expect(ownerSecurity.body).not.toHaveProperty("reports");
    expect(ownerSecurity.body).not.toHaveProperty("loginAttempts");

    auth.user = moderator;
    const moderatorPresence = await request(app).get("/api/world/online");
    expect(moderatorPresence.status).toBe(200);
    expect(moderatorPresence.body.scope).toBe("moderator");
    expect(moderatorPresence.body.players).toHaveLength(3);

    const moderatorSecurity = await request(app).get("/api/world/monitoring-security");
    expect(moderatorSecurity.status).toBe(200);
    expect(moderatorSecurity.body.security).toEqual({
      activeFlags: 2,
      activeBans: 2,
      openReports: 2,
      loginAttempts24h: 2,
      blockedLogins24h: 1,
    });
    expect(moderatorSecurity.body.detailAccess).toBe(false);
    expect(JSON.stringify(moderatorSecurity.body)).not.toContain("private detail");
    expect(JSON.stringify(moderatorSecurity.body)).not.toContain("192.0.2.");
  });
});
