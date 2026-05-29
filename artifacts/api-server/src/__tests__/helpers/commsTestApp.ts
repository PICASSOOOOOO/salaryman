import express, { type Express } from "express";
import { randomUUID } from "crypto";
import {
  db,
  usersTable,
  organizationsTable,
  orgMembersTable,
  colleaguesTable,
  filesFoldersTable,
  chatChannelsTable,
  chatMessagesTable,
  notificationsTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import accountRouter from "../../routes/account";
import colleaguesRouter from "../../routes/colleagues";
import chatRouter from "../../routes/chat";

// Mutable auth state read by the injected middleware on every request. Tests
// flip `authed` to false to exercise the 401 path, and swap `user` to act as a
// different participant (sender vs. recipient vs. outsider).
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

// Build an Express app that mirrors the real mount: all three routers live
// under "/api" (their own paths are "/account/...", "/colleagues/...",
// "/chat/..."). A middleware injects the passport-style `req.isAuthenticated()`
// and `req.user` the route guards depend on.
export function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => authState.authed;
    (req as unknown as { user: { id: string; email: string } }).user = authState.user;
    next();
  });
  app.use("/api", accountRouter);
  app.use("/api", colleaguesRouter);
  app.use("/api", chatRouter);
  return app;
}

export async function createUser(opts: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  username?: string | null;
} = {}): Promise<{ id: string; email: string }> {
  const suffix = randomUUID().slice(0, 8);
  const email = opts.email ?? `comms-${suffix}@example.test`;
  const [row] = await db
    .insert(usersTable)
    .values({
      email,
      firstName: opts.firstName ?? null,
      lastName: opts.lastName ?? null,
      username: opts.username ?? null,
    })
    .returning({ id: usersTable.id, email: usersTable.email });
  createdUserIds.push(row.id);
  return { id: row.id, email: row.email ?? email };
}

export async function createOrgWithMembers(
  ownerId: string,
  memberIds: string[] = [],
): Promise<number> {
  const [org] = await db
    .insert(organizationsTable)
    .values({ name: `Comms Test Org ${randomUUID().slice(0, 8)}`, ownerUserId: ownerId })
    .returning({ id: organizationsTable.id });
  createdOrgIds.push(org.id);
  const ids = [ownerId, ...memberIds];
  await db.insert(orgMembersTable).values(
    ids.map((userId, i) => ({
      orgId: org.id,
      userId,
      role: i === 0 ? "owner" : "specialist",
      status: "active" as const,
    })),
  );
  return org.id;
}

// Set the heartbeat (lastSeenAt) for a member row so presence tests can place
// a user inside or outside the 90s online window, or in a specific org when
// exercising the cross-org MAX behaviour.
export async function setLastSeenAt(orgId: number, userId: string, when: Date | null) {
  await db
    .update(orgMembersTable)
    .set({ lastSeenAt: when })
    .where(and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.userId, userId)));
}

export async function makeAccepted(a: string, b: string) {
  const { canonicalPair } = await import("@workspace/db");
  const { userAId, userBId } = canonicalPair(a, b);
  await db
    .insert(colleaguesTable)
    .values({ userAId, userBId, requesterId: a, status: "accepted", respondedAt: new Date() });
}

export async function createFile(ownerId: string, name = "report.pdf"): Promise<number> {
  const [file] = await db
    .insert(filesFoldersTable)
    .values({
      userId: ownerId,
      name,
      isFolder: false,
      objectPath: `/objects/${randomUUID()}`,
      mimeType: "application/pdf",
      fileSize: 12345,
    })
    .returning({ id: filesFoldersTable.id });
  return file.id;
}

export async function createPrivateChannel(u1: string, u2: string): Promise<number> {
  const [a, b] = [u1, u2].sort();
  const [ch] = await db
    .insert(chatChannelsTable)
    .values({ type: "private", user1Id: a, user2Id: b })
    .returning({ id: chatChannelsTable.id });
  return ch.id;
}

export async function cleanupTestData() {
  if (createdUserIds.length) {
    await db.delete(filesFoldersTable).where(inArray(filesFoldersTable.userId, createdUserIds));
    await db.delete(orgMembersTable).where(inArray(orgMembersTable.userId, createdUserIds));
    await db.delete(notificationsTable).where(inArray(notificationsTable.userId, createdUserIds));
  }
  for (const orgId of createdOrgIds) {
    // Cascades company channels (+ their messages) and remaining org members.
    await db.delete(organizationsTable).where(eq(organizationsTable.id, orgId));
  }
  for (const userId of createdUserIds) {
    // Cascades private channels, their messages, colleagues and read cursors.
    await db.delete(usersTable).where(eq(usersTable.id, userId));
  }
  createdUserIds.length = 0;
  createdOrgIds.length = 0;
}
