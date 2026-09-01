import express, { type Express } from "express";
import { randomUUID } from "crypto";
import {
  db,
  usersTable,
  organizationsTable,
  orgMembersTable,
  autopilotConfigsTable,
  botsTable,
  userFeaturesTable,
  type OrgRole,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import autopilotRouter from "../../routes/autopilot";

// Mutable auth state the injected middleware reads on every request. Tests flip
// `authed` to false to exercise the 401 path and swap `user` to act as the org
// owner, a privileged manager, or an under-privileged specialist.
export const authState: { authed: boolean; user: { id: string; email: string } } = {
  authed: true,
  user: { id: "", email: "" },
};

export function actAs(user: { id: string; email: string }) {
  authState.authed = true;
  authState.user = user;
}

export function setAuthed(authed: boolean) {
  authState.authed = authed;
}

// Everything created during a test file, so cleanup can scope deletes precisely.
const createdUserIds: string[] = [];
const createdOrgIds: number[] = [];
const createdBotIds: number[] = [];

// Build an Express app that mirrors the real mount: the autopilot router lives
// under "/api" (its own paths are "/autopilot/..."). A middleware injects the
// passport-style `req.isAuthenticated()` and `req.user` the route guards depend
// on.
export function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => authState.authed;
    (req as unknown as { user: { id: string; email: string } }).user = authState.user;
    next();
  });
  app.use("/api", autopilotRouter);
  return app;
}

export async function createUser(): Promise<{ id: string; email: string }> {
  const suffix = randomUUID().slice(0, 8);
  const email = `autopilot-${suffix}@example.test`;
  const [row] = await db
    .insert(usersTable)
    .values({ email })
    .returning({ id: usersTable.id, email: usersTable.email });
  createdUserIds.push(row.id);
  await db.insert(userFeaturesTable).values({
    userId: row.id,
    featureKey: "claw_bot",
    grantedBy: "stripe-test",
    stripeSubscriptionId: `sub_test_${suffix}`,
  });
  return { id: row.id, email: row.email ?? email };
}

// Create an org owned by `ownerId`, plus any additional members with explicit
// roles. The owner's user row is pointed at the org via current_org_id so
// resolveCurrentOrgId() lands on it deterministically; each member's
// current_org_id is set the same way.
export async function createOrg(
  ownerId: string,
  members: { userId: string; role: OrgRole }[] = [],
): Promise<number> {
  const [org] = await db
    .insert(organizationsTable)
    .values({ name: `Autopilot Test Org ${randomUUID().slice(0, 8)}`, ownerUserId: ownerId })
    .returning({ id: organizationsTable.id });
  createdOrgIds.push(org.id);

  const rows = [
    { orgId: org.id, userId: ownerId, role: "owner" as const, status: "active" as const },
    ...members.map((m) => ({
      orgId: org.id,
      userId: m.userId,
      role: m.role,
      status: "active" as const,
    })),
  ];
  await db.insert(orgMembersTable).values(rows);

  const allIds = [ownerId, ...members.map((m) => m.userId)];
  for (const userId of allIds) {
    await db.update(usersTable).set({ currentOrgId: String(org.id) }).where(eq(usersTable.id, userId));
  }
  return org.id;
}

// Seed a bot row. Defaults the owner to the org's owner and ties it to `orgId`
// so the cross-org assignment guard can be exercised: a bot belonging to a
// *different* org must be rejected by PUT /api/autopilot/:domain.
export async function createBot(opts: {
  orgId: number | null;
  ownerId: string;
  name?: string;
}): Promise<number> {
  const [row] = await db
    .insert(botsTable)
    .values({
      ownerId: opts.ownerId,
      orgId: opts.orgId,
      name: opts.name ?? `Autopilot Test Bot ${randomUUID().slice(0, 8)}`,
    })
    .returning({ id: botsTable.id });
  createdBotIds.push(row.id);
  return row.id;
}

// Read back a domain's stored config row (or null) so assertions can inspect
// exactly what landed in the database, not just the HTTP response.
export async function getStoredConfig(orgId: number, domain: string) {
  const [row] = await db
    .select()
    .from(autopilotConfigsTable)
    .where(and(eq(autopilotConfigsTable.orgId, orgId), eq(autopilotConfigsTable.domain, domain)));
  return row ?? null;
}

export async function cleanupTestData() {
  if (createdBotIds.length) {
    await db.delete(botsTable).where(inArray(botsTable.id, createdBotIds));
  }
  for (const orgId of createdOrgIds) {
    await db.delete(autopilotConfigsTable).where(eq(autopilotConfigsTable.orgId, orgId));
    // Cascades org members and org permissions.
    await db.delete(organizationsTable).where(eq(organizationsTable.id, orgId));
  }
  if (createdUserIds.length) {
    await db.delete(userFeaturesTable).where(inArray(userFeaturesTable.userId, createdUserIds));
    await db.delete(orgMembersTable).where(inArray(orgMembersTable.userId, createdUserIds));
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
  createdUserIds.length = 0;
  createdOrgIds.length = 0;
  createdBotIds.length = 0;
}
