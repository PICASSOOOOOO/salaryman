import express, { type Express } from "express";
import { randomUUID } from "crypto";
import { db, artAssetsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import artRouter from "../../routes/art-assets";

// A throwaway admin user. isOwnerEmail is mocked to true in the test file so the
// exact email doesn't matter, but we keep a stable id/email for clarity.
export const TEST_ADMIN = {
  id: `test-art-${randomUUID()}`,
  email: "art-tester@example.test",
};

export const authState: { authed: boolean; user: { id: string; email: string } } = {
  authed: true,
  user: TEST_ADMIN,
};

export function resetAuthState() {
  authState.authed = true;
  authState.user = TEST_ADMIN;
}

// Mirror the real mount: art router lives under "/api" (paths are "/art/...").
export function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).isAuthenticated = () => authState.authed;
    (req as any).user = authState.user;
    next();
  });
  app.use("/api", artRouter);
  return app;
}

/** Remove every throwaway "__test__" smoke-test row this suite may have created. */
export async function cleanupTestData() {
  await db.delete(artAssetsTable).where(eq(artAssetsTable.category, "__test__"));
}
