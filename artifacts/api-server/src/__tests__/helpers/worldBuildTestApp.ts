import express, { type Express } from "express";
import { randomUUID } from "crypto";
import {
  db,
  worldBuildPlansTable,
  worldBuildContributionsTable,
  usersTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import worldBuildRouter from "../../routes/world-build";

// A throwaway admin player, unique per test file. The world-build tables'
// user_id / created_by_user_id columns are plain varchar with no hard FK, so we
// scope every created row by ids we track and delete them after the suite.
export const WB_USER = {
  id: `test-wb-${randomUUID()}`,
  email: "wb-tester@example.test",
};

// Mutable auth state the injected middleware reads on every request. Tests flip
// `authed` to false to exercise the 401 path, and swap `user` to exercise the
// 403 (non-admin) path.
export const authState: { authed: boolean; user: { id: string; email: string } } = {
  authed: true,
  user: WB_USER,
};

export function resetAuthState() {
  authState.authed = true;
  authState.user = WB_USER;
}

// Build an Express app that mirrors the real mount: the world-build router lives
// under "/api" (its own paths are "/world-build/..."). A middleware injects the
// passport-style `req.isAuthenticated()` and `req.user` the route guards need.
export function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => authState.authed;
    (req as unknown as { user: { id: string; email: string } }).user = authState.user;
    next();
  });
  app.use("/api", worldBuildRouter);
  return app;
}

// Track plan ids created during a suite so cleanup deletes their contributions.
const createdPlanIds = new Set<number>();
const createdUserIds = new Set<string>();

// Create a Pablo (no owning org) world-build plan. Admin callers can view its
// labor-summary, which is what the test user is mocked to be. Returns the id.
export async function seedPlan(opts?: { status?: string }): Promise<number> {
  const [plan] = await db
    .insert(worldBuildPlansTable)
    .values({
      slug: `test-plan-${randomUUID()}`,
      title: "TEST PLAN",
      status: opts?.status ?? "active",
      createdByUserId: WB_USER.id,
    })
    .returning({ id: worldBuildPlansTable.id });
  createdPlanIds.add(plan.id);
  return plan.id;
}

// Insert a single completed-task contribution (one debtor shift) for a plan.
export async function seedContribution(opts: {
  planId: number;
  userId: string;
  payoff: number;
  taskId?: string;
}): Promise<void> {
  await db.insert(worldBuildContributionsTable).values({
    planId: opts.planId,
    taskId: opts.taskId ?? `task-${randomUUID()}`,
    userId: opts.userId,
    payoff: opts.payoff,
  });
}

// Seed a users row so the per-laborer breakdown join can resolve a display name.
export async function seedUser(opts: { id: string; username?: string; firstName?: string }): Promise<void> {
  await db.insert(usersTable).values({
    id: opts.id,
    email: `${opts.id}@example.test`,
    username: opts.username ?? null,
    firstName: opts.firstName ?? null,
  });
  createdUserIds.add(opts.id);
}

// Wipe every plan + contribution + seeded user this suite created.
export async function cleanupTestData(): Promise<void> {
  const ids = [...createdPlanIds];
  if (ids.length > 0) {
    await db.delete(worldBuildContributionsTable).where(inArray(worldBuildContributionsTable.planId, ids));
    await db.delete(worldBuildPlansTable).where(inArray(worldBuildPlansTable.id, ids));
  }
  createdPlanIds.clear();
  for (const uid of createdUserIds) {
    await db.delete(usersTable).where(eq(usersTable.id, uid)).catch(() => {});
  }
  createdUserIds.clear();
}
