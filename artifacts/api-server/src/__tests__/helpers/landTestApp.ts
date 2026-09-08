import express, { type Express } from "express";
import { randomUUID } from "crypto";
import {
  db,
  constructionProjectsTable,
  constructionLaborLogTable,
  usersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import landRouter from "../../routes/land";

// Track seeded users so we can clean them up after the suite.
const createdUserIds = new Set<string>();

// A throwaway player, unique per test file. The construction tables' owner_id /
// laborer_id columns are plain varchar with no hard FK, so we don't seed a
// `users` row — we just scope every created row by this id and delete them
// after the suite.
export const LAND_USER = {
  id: `test-land-${randomUUID()}`,
  email: "land-tester@example.test",
};

// Mutable auth state the injected middleware reads on every request. Tests flip
// `authed` to false to exercise the 401 path, and swap `user` to exercise the
// 403 (non-owner) path.
export const authState: { authed: boolean; user: { id: string; email: string } } = {
  authed: true,
  user: LAND_USER,
};

export function resetAuthState() {
  authState.authed = true;
  authState.user = LAND_USER;
}

// Build an Express app that mirrors the real mount: the land router lives under
// "/api" (its own paths are "/construction/..."). A middleware injects the
// passport-style `req.isAuthenticated()` and `req.user` the route guards need.
export function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => authState.authed;
    (req as unknown as { user: { id: string; email: string } }).user = authState.user;
    next();
  });
  app.use("/api", landRouter);
  return app;
}

// Create a construction project owned by the test user so the labor-summary
// owner-authorization check passes. Returns the new project id.
export async function seedProject(opts?: {
  ownerId?: string;
  status?: string;
}): Promise<number> {
  const [proj] = await db
    .insert(constructionProjectsTable)
    .values({
      plotId: Math.floor(Math.random() * 1_000_000) + 1,
      ownerId: opts?.ownerId ?? LAND_USER.id,
      label: "TEST BUILD",
      status: opts?.status ?? "in_progress",
    })
    .returning({ id: constructionProjectsTable.id });
  return proj.id;
}

// Insert a single labor-log shift for a project.
export async function seedShift(opts: {
  projectId: number;
  laborerId: string;
  units: number;
  reward: number;
  wasDebtor: boolean;
}): Promise<void> {
  await db.insert(constructionLaborLogTable).values({
    projectId: opts.projectId,
    laborerId: opts.laborerId,
    units: opts.units,
    reward: opts.reward,
    wasDebtor: opts.wasDebtor,
  });
}

// Seed a users row so the per-laborer breakdown join can resolve a display name
// (and so name search can match on username / firstName).
export async function seedUser(opts: { id: string; username?: string; firstName?: string }): Promise<void> {
  await db.insert(usersTable).values({
    id: opts.id,
    email: `${opts.id}@example.test`,
    username: opts.username ?? null,
    firstName: opts.firstName ?? null,
  });
  createdUserIds.add(opts.id);
}

// Wipe every project + labor-log row this user may have created. Labor rows are
// deleted by their parent project ids so non-owner laborer ids are cleaned too.
export async function cleanupTestData(): Promise<void> {
  const projects = await db
    .select({ id: constructionProjectsTable.id })
    .from(constructionProjectsTable)
    .where(eq(constructionProjectsTable.ownerId, LAND_USER.id));
  await Promise.allSettled(
    projects.map((p) =>
      db.delete(constructionLaborLogTable).where(eq(constructionLaborLogTable.projectId, p.id)),
    ),
  );
  await db.delete(constructionProjectsTable).where(eq(constructionProjectsTable.ownerId, LAND_USER.id));
  for (const uid of createdUserIds) {
    await db.delete(usersTable).where(eq(usersTable.id, uid)).catch(() => {});
  }
  createdUserIds.clear();
}
