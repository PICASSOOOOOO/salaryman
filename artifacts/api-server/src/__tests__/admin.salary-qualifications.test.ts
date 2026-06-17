import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { randomUUID } from "crypto";
import { db, usersTable, worldBusinessesTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

// Authorize the test caller as a platform admin via the OWNER_EMAILS allow-list
// (isOwnerEmail reads it at call time). MUST be set before importing the admin
// router so requirePicassoAdmin's email check passes for our synthetic admin.
const ADMIN_EMAIL = `salary-qual-admin-${randomUUID().slice(0, 8)}@example.test`;
process.env.OWNER_EMAILS = ADMIN_EMAIL;

// eslint-disable-next-line @typescript-eslint/no-var-requires
import adminRouter from "../routes/admin";

const authState: { authed: boolean; user: { id: string; email: string } } = {
  authed: true,
  user: { id: "", email: "" },
};
function actAs(user: { id: string; email: string }) {
  authState.authed = true;
  authState.user = user;
}

const createdUserIds: string[] = [];
const createdBizIds: number[] = [];

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => authState.authed;
    (req as unknown as { user: { id: string; email: string } }).user = authState.user;
    next();
  });
  app.use("/api", adminRouter);
  return app;
}

async function createUser(email: string): Promise<string> {
  const [row] = await db.insert(usersTable).values({ email }).returning({ id: usersTable.id });
  createdUserIds.push(row.id);
  return row.id;
}

async function createRealBiz(userId: string, monthly: number, opts: { verified?: boolean; pending?: boolean } = {}): Promise<number> {
  const [row] = await db
    .insert(worldBusinessesTable)
    .values({
      playerName: `QUAL${randomUUID().slice(0, 6).toUpperCase()}`,
      userId,
      businessType: "real",
      companyName: "Acme Test Co",
      declaredMonthlyIncome: monthly,
      incomeVerified: opts.verified ?? false,
      pendingOwnerVerification: opts.pending ?? true,
    })
    .returning({ id: worldBusinessesTable.id });
  createdBizIds.push(row.id);
  return row.id;
}

let app: Express;
let adminId: string;

beforeAll(async () => {
  app = buildApp();
  adminId = await createUser(ADMIN_EMAIL);
});

afterAll(async () => {
  if (createdBizIds.length) await db.delete(worldBusinessesTable).where(inArray(worldBusinessesTable.id, createdBizIds));
  if (createdUserIds.length) await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
});

describe("admin salary qualifications portal", () => {
  it("lists real, unverified, declared-income businesses and approval flips incomeVerified", async () => {
    actAs({ id: adminId, email: ADMIN_EMAIL });
    const playerId = await createUser(`qual-player-${randomUUID().slice(0, 8)}@example.test`);
    const bizId = await createRealBiz(playerId, 72_000);

    const list = await request(app).get("/api/admin/salary-qualifications");
    expect(list.status).toBe(200);
    expect((list.body.qualifications as { id: number }[]).some((q) => q.id === bizId)).toBe(true);

    const decide = await request(app)
      .post(`/api/admin/salary-qualifications/${bizId}/decide`)
      .send({ approve: true });
    expect(decide.status).toBe(200);
    expect(decide.body.approved).toBe(true);

    const [row] = await db
      .select()
      .from(worldBusinessesTable)
      .where(eq(worldBusinessesTable.id, bizId))
      .limit(1);
    expect(row.incomeVerified).toBe(true);
    expect(row.pendingOwnerVerification).toBe(false);
    expect(row.ownerVerifiedBy).toBe(adminId);
    expect(row.ownerVerifiedAt).not.toBeNull();

    // A verified row drops out of the queue.
    const after = await request(app).get("/api/admin/salary-qualifications");
    expect((after.body.qualifications as { id: number }[]).some((q) => q.id === bizId)).toBe(false);

    // Re-approving a verified row is an explicit no-op (409).
    const again = await request(app)
      .post(`/api/admin/salary-qualifications/${bizId}/decide`)
      .send({ approve: true });
    expect(again.status).toBe(409);
  });

  it("rejection marks meta.qualificationStatus and removes it from the queue without verifying", async () => {
    actAs({ id: adminId, email: ADMIN_EMAIL });
    const playerId = await createUser(`qual-reject-${randomUUID().slice(0, 8)}@example.test`);
    const bizId = await createRealBiz(playerId, 50_000);

    const decide = await request(app)
      .post(`/api/admin/salary-qualifications/${bizId}/decide`)
      .send({ approve: false });
    expect(decide.status).toBe(200);
    expect(decide.body.approved).toBe(false);

    const [row] = await db
      .select()
      .from(worldBusinessesTable)
      .where(eq(worldBusinessesTable.id, bizId))
      .limit(1);
    expect(row.incomeVerified).toBe(false);
    expect(row.pendingOwnerVerification).toBe(false);
    expect((row.meta as { qualificationStatus?: string } | null)?.qualificationStatus).toBe("rejected");

    const after = await request(app).get("/api/admin/salary-qualifications");
    expect((after.body.qualifications as { id: number }[]).some((q) => q.id === bizId)).toBe(false);
  });

  it("rejects unauthenticated callers", async () => {
    authState.authed = false;
    const res = await request(app).get("/api/admin/salary-qualifications");
    expect(res.status).toBe(401);
    authState.authed = true;
  });
});
