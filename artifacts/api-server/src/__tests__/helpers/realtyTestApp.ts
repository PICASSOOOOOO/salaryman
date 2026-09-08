import express, { type Express } from "express";
import { randomUUID } from "crypto";
import { db, salarymanSavesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import realEstateRouter from "../../routes/real-estate";

// A throwaway player, unique per test file. salaryman_saves.user_id is a plain
// varchar with no hard FK, so we don't seed a `users` row — we scope every
// created row by this id and delete them after the suite.
export const REALTY_USER = {
  id: `test-realty-${randomUUID()}`,
  email: "realty-tester@example.test",
};

// Mutable auth state the injected middleware reads on every request. Tests flip
// `authed` to false to exercise the 401 path.
export const authState: { authed: boolean; user: { id: string; email: string } } = {
  authed: true,
  user: REALTY_USER,
};

export function resetAuthState() {
  authState.authed = true;
  authState.user = REALTY_USER;
}

// Build an Express app that mirrors the real mount: the real-estate router lives
// under "/api" (its own paths are "/real-estate/..."). A middleware injects the
// passport-style `req.isAuthenticated()` and `req.user` the route guards need.
export function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => authState.authed;
    (req as unknown as { user: { id: string; email: string } }).user = authState.user;
    next();
  });
  app.use("/api", realEstateRouter);
  return app;
}

// Seed (or overwrite) the player's save row for `slot` with a starting fiat
// balance and an optional already-owned property record (data.office/data.home).
export async function seedSave(opts: {
  slot?: number;
  salary: number;
  owned?: { kind: "home" | "office"; artKey: string; tier?: string; name?: string };
}): Promise<void> {
  const slot = opts.slot ?? 0;
  const data: Record<string, unknown> = { salary: opts.salary };
  if (opts.owned) {
    const rec = {
      artKey: opts.owned.artKey,
      propertyKey: opts.owned.artKey,
      name: opts.owned.name ?? "TEST PROPERTY",
      kind: opts.owned.kind,
      tier: opts.owned.tier ?? "studio",
      tenure: "own",
      acquiredAt: new Date().toISOString(),
    };
    if (opts.owned.kind === "office") data.office = rec; else data.home = rec;
  }
  await db
    .insert(salarymanSavesTable)
    .values({
      userId: REALTY_USER.id,
      slotIndex: slot,
      charName: "Test Salaryman",
      charClass: "intern",
      salary: opts.salary,
      data,
    })
    .onConflictDoUpdate({
      target: [salarymanSavesTable.userId, salarymanSavesTable.slotIndex],
      set: { salary: opts.salary, data },
    });
}

// Read the current save row (salary + data) for assertions.
export async function readSave(slot = 0) {
  const [save] = await db
    .select()
    .from(salarymanSavesTable)
    .where(and(eq(salarymanSavesTable.userId, REALTY_USER.id), eq(salarymanSavesTable.slotIndex, slot)))
    .limit(1);
  return save ?? null;
}

// Wipe everything this user may have created so the suite is repeatable.
export async function cleanupTestData() {
  await db.delete(salarymanSavesTable).where(eq(salarymanSavesTable.userId, REALTY_USER.id));
}
