import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import {
  bankAccountsTable,
  bankTransactionsTable,
  db,
  desktopWorkClaimsTable,
  desktopWorkLeasesTable,
  deviceLinksTable,
  usersTable,
} from "@workspace/db";
import desktopWorkRouter from "../routes/desktop-work";

const app = express();
app.use(express.json());
app.use("/api", desktopWorkRouter);

const userIds: string[] = [];
const linkIds: string[] = [];
let userId = "";
let deviceId = "";
let token = "";

function desktopPost(path: string) {
  return request(app).post(path)
    .set("Authorization", `Bearer ${token}`)
    .set("x-salaryman-device-id", deviceId);
}

beforeAll(async () => {
  const email = `desktop-work-${randomUUID()}@test.local`;
  const [user] = await db.insert(usersTable).values({ email }).returning();
  userId = user.id;
  userIds.push(userId);
  await db.insert(bankAccountsTable).values({
    userId,
    kind: "checking",
    label: "CHECKING",
    balance: 0,
  });

  deviceId = `desktop-${randomUUID()}`;
  token = `test-token-${randomUUID()}`;
  const [link] = await db.insert(deviceLinksTable).values({
    userId,
    desktopDeviceId: deviceId,
    desktopName: "Desktop work test",
    status: "linked",
    linkedAt: new Date(),
    desktopAccessTokenHash: createHash("sha256").update(token).digest("hex"),
    scopes: ["salaryman_app"],
  }).returning();
  linkIds.push(link.id);
});

afterAll(async () => {
  if (linkIds.length) {
    await db.delete(desktopWorkClaimsTable).where(inArray(desktopWorkClaimsTable.linkId, linkIds));
    await db.delete(desktopWorkLeasesTable).where(inArray(desktopWorkLeasesTable.linkId, linkIds));
    await db.delete(deviceLinksTable).where(inArray(deviceLinksTable.id, linkIds));
  }
  if (userIds.length) {
    await db.delete(bankTransactionsTable).where(inArray(bankTransactionsTable.userId, userIds));
    await db.delete(bankAccountsTable).where(inArray(bankAccountsTable.userId, userIds));
    await db.delete(usersTable).where(inArray(usersTable.id, userIds));
  }
});

describe("desktop office work settlement", () => {
  it("reuses one active lease and caps rewards to server elapsed time", async () => {
    const firstLease = await desktopPost("/api/desktop-work/lease").send({});
    expect(firstLease.status).toBe(200);
    const retryLease = await desktopPost("/api/desktop-work/lease").send({});
    expect(retryLease.status).toBe(200);
    expect(retryLease.body.leaseId).toBe(firstLease.body.leaseId);

    const leaseId = firstLease.body.leaseId as string;
    const earlyEvent = `claim-${randomUUID()}`;
    const early = await desktopPost("/api/desktop-work/claims").send({
      eventId: earlyEvent,
      leaseId,
      workType: "office_shift",
      workMinutes: 1,
      reportedAt: new Date().toISOString(),
    });
    expect(early.status).toBe(422);
    expect(early.body.reason).toBe("work_time_not_elapsed");

    await db.update(desktopWorkLeasesTable)
      .set({ issuedAt: new Date(Date.now() - 3 * 60_000) })
      .where(eq(desktopWorkLeasesTable.id, leaseId));

    const eventId = `claim-${randomUUID()}`;
    const claim = {
      eventId,
      leaseId,
      workType: "office_shift",
      workMinutes: 3,
      reportedAt: new Date().toISOString(),
    };
    const settled = await desktopPost("/api/desktop-work/claims").send(claim);
    expect(settled.status).toBe(200);
    expect(settled.body).toMatchObject({ ok: true, status: "accepted", amountFiat: 15, balance: 15 });

    const duplicate = await desktopPost("/api/desktop-work/claims").send(claim);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body).toMatchObject({ ok: true, duplicate: true, status: "accepted", amountFiat: 15 });

    const overClaim = await desktopPost("/api/desktop-work/claims").send({
      ...claim,
      eventId: `claim-${randomUUID()}`,
      workMinutes: 1,
    });
    expect(overClaim.status).toBe(422);
    expect(overClaim.body.reason).toBe("work_time_not_elapsed");

    const [account] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.userId, userId));
    expect(account.balance).toBe(15);
  });
});