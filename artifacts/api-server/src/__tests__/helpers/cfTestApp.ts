import express, { type Express } from "express";
import { randomUUID } from "crypto";
import {
  db,
  cfSubmissionsTable,
  constructionLaborLogTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import cfRouter from "../../routes/cf";

// Mutable auth state the injected middleware reads on every request. Tests
// flip `authed` to false to exercise the 401 path, and swap `user` to act as
// different participants.
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

export function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => authState.authed;
    (req as unknown as { user: { id: string; email: string } }).user = authState.user;
    next();
  });
  app.use("/api", cfRouter);
  return app;
}

// Synthetic user — no FK on the CF tables so we don't need a real users row.
export function makeUser(): { id: string; email: string } {
  const suffix = randomUUID().slice(0, 8);
  return { id: `test-cf-${suffix}`, email: `cf-${suffix}@example.test` };
}

// Track every userId created so we can delete their rows in afterAll.
const createdUserIds: string[] = [];

export function trackUser(user: { id: string }): void {
  createdUserIds.push(user.id);
}

// Seed a cf_submissions row with benefitingOrgId set (the "task" source).
export async function seedCfSubmission(opts: {
  userId: string;
  kind?: string;
  payoff: number;
  benefitingOrgId: string;
  benefitingOrgName?: string;
}): Promise<number> {
  const [row] = await db
    .insert(cfSubmissionsTable)
    .values({
      userId: opts.userId,
      kind: opts.kind ?? "build",
      payoff: opts.payoff,
      benefitingOrgId: opts.benefitingOrgId,
      benefitingOrgName: opts.benefitingOrgName ?? "Test Org",
    })
    .returning({ id: cfSubmissionsTable.id });
  return row.id;
}

// Seed a construction_labor_log row with wasDebtor=true and benefitingOrgId set.
export async function seedConstructionLabor(opts: {
  laborerId: string;
  reward: number;
  benefitingOrgId: string;
  benefitingOrgName?: string;
  projectId?: number;
}): Promise<number> {
  const [row] = await db
    .insert(constructionLaborLogTable)
    .values({
      projectId: opts.projectId ?? 1,
      laborerId: opts.laborerId,
      reward: opts.reward,
      units: 1,
      wasDebtor: true,
      benefitingOrgId: opts.benefitingOrgId,
      benefitingOrgName: opts.benefitingOrgName ?? "Test Org",
    })
    .returning({ id: constructionLaborLogTable.id });
  return row.id;
}

export async function cleanupTestData(): Promise<void> {
  if (!createdUserIds.length) return;
  await Promise.allSettled([
    db.delete(cfSubmissionsTable).where(inArray(cfSubmissionsTable.userId, createdUserIds)),
    db
      .delete(constructionLaborLogTable)
      .where(inArray(constructionLaborLogTable.laborerId, createdUserIds)),
  ]);
  createdUserIds.length = 0;
}
