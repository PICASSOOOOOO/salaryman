import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { randomUUID } from "crypto";
import { inArray } from "drizzle-orm";
import {
  db,
  orgMembersTable,
  orgPaymentConnectionsTable,
  orgPaymentsTable,
  organizationsTable,
  usersTable,
} from "@workspace/db";

const stripeState = vi.hoisted(() => ({
  accountRetrieve: vi.fn(),
  checkoutCreate: vi.fn(),
  checkoutRetrieve: vi.fn(),
}));

vi.mock("../routes/stripe", () => ({
  getStripe: () => ({
    accounts: { retrieve: stripeState.accountRetrieve },
    checkout: {
      sessions: {
        create: stripeState.checkoutCreate,
        retrieve: stripeState.checkoutRetrieve,
      },
    },
  }),
}));

import orgPaymentsRouter from "../routes/org-payments";

process.env.SESSION_SECRET ||= "org-payments-route-tests";

const authState = { user: { id: "", email: "" } };
const createdUserIds: string[] = [];
const createdOrgIds: number[] = [];

function actAs(user: { id: string; email: string }) {
  authState.user = user;
}

async function createUser() {
  const email = `org-payments-${randomUUID()}@example.test`;
  const [user] = await db
    .insert(usersTable)
    .values({ email })
    .returning({ id: usersTable.id, email: usersTable.email });
  const result = { id: user.id, email: user.email ?? email };
  createdUserIds.push(result.id);
  return result;
}

async function createOrg(ownerId: string) {
  const [org] = await db
    .insert(organizationsTable)
    .values({
      name: `PAYMENTS TEST ${randomUUID()}`,
      ownerUserId: ownerId,
      isDeveloper: false,
    })
    .returning({ id: organizationsTable.id });
  createdOrgIds.push(org.id);
  await db.insert(orgMembersTable).values({
    orgId: org.id,
    userId: ownerId,
    role: "owner",
    status: "active",
  });
  return org;
}

let app: Express;
beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
    (req as unknown as { user: typeof authState.user }).user = authState.user;
    next();
  });
  app.use("/api", orgPaymentsRouter);
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  if (createdOrgIds.length) {
    await db.delete(orgPaymentsTable).where(inArray(orgPaymentsTable.orgId, createdOrgIds));
    await db.delete(orgPaymentConnectionsTable).where(inArray(orgPaymentConnectionsTable.orgId, createdOrgIds));
    await db.delete(orgMembersTable).where(inArray(orgMembersTable.orgId, createdOrgIds));
    await db.delete(organizationsTable).where(inArray(organizationsTable.id, createdOrgIds));
  }
  if (createdUserIds.length) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
});

describe("organization Stripe payment ledger", () => {
  it("creates a checkout once, safely reuses it, and isolates ledger reads by organization", async () => {
    const ownerA = await createUser();
    const ownerB = await createUser();
    const orgA = await createOrg(ownerA.id);
    const orgB = await createOrg(ownerB.id);
    const providerAccountId = `acct_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const account = {
      id: providerAccountId,
      metadata: { salarymanOrgId: String(orgA.id) },
      charges_enabled: true,
      details_submitted: true,
      payouts_enabled: true,
      capabilities: { transfers: "active" },
      requirements: { disabled_reason: null },
    };
    const requestKey = `invoice-${randomUUID().slice(0, 12)}`;
    const checkoutId = `cs_${randomUUID().replace(/-/g, "")}`;
    const checkoutUrl = `https://checkout.stripe.test/${checkoutId}`;
    const expiresAtSeconds = Math.floor(Date.now() / 1000) + 3600;

    stripeState.accountRetrieve.mockResolvedValue(account);
    stripeState.checkoutCreate.mockResolvedValue({
      id: checkoutId,
      url: checkoutUrl,
      expires_at: expiresAtSeconds,
      payment_intent: null,
    });
    stripeState.checkoutRetrieve.mockResolvedValue({
      id: checkoutId,
      status: "open",
      url: checkoutUrl,
      expires_at: expiresAtSeconds,
    });

    await db.insert(orgPaymentConnectionsTable).values({
      orgId: orgA.id,
      provider: "stripe",
      providerAccountId,
      accountStatus: "active",
      chargesEnabled: true,
      payoutsEnabled: true,
      connectedByUserId: ownerA.id,
    });

    actAs(ownerA);
    const body = {
      amountMinor: 12_500,
      description: "Invoice 224",
      requestKey,
    };
    const created = await request(app).post("/api/orgs/current/payments/checkout").send(body);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      payment: {
        provider: "stripe",
        amountMinor: 12_500,
        status: "pending",
        description: "Invoice 224",
      },
      checkoutUrl,
      expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
    });
    expect(stripeState.checkoutCreate).toHaveBeenCalledOnce();
    expect(stripeState.checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent_data: expect.objectContaining({
          transfer_data: { destination: providerAccountId },
        }),
        metadata: expect.objectContaining({
          organizationId: String(orgA.id),
          requestKey,
        }),
      }),
      { idempotencyKey: `organization-payment:${orgA.id}:${requestKey}` },
    );

    const replayed = await request(app).post("/api/orgs/current/payments/checkout").send(body);
    expect(replayed.status).toBe(201);
    expect(replayed.body.payment.id).toBe(created.body.payment.id);
    expect(replayed.body.checkoutUrl).toBe(checkoutUrl);
    expect(stripeState.checkoutCreate).toHaveBeenCalledOnce();
    expect(stripeState.checkoutRetrieve).toHaveBeenCalledWith(checkoutId);

    const changedReplay = await request(app)
      .post("/api/orgs/current/payments/checkout")
      .send({ ...body, description: "Different invoice" });
    expect(changedReplay.status).toBe(409);

    const ownerLedger = await request(app).get("/api/orgs/current/payments");
    expect(ownerLedger.status).toBe(200);
    expect(ownerLedger.body).toMatchObject({
      organizationId: orgA.id,
      connected: true,
      chargesEnabled: true,
      payoutsEnabled: true,
      summary: { confirmedMinor: 0, settledCount: 0 },
    });
    expect(ownerLedger.body.payments).toHaveLength(1);
    expect(ownerLedger.body.payments[0].id).toBe(created.body.payment.id);

    actAs(ownerB);
    const otherOrgLedger = await request(app).get("/api/orgs/current/payments");
    expect(otherOrgLedger.status).toBe(200);
    expect(otherOrgLedger.body.organizationId).toBe(orgB.id);
    expect(otherOrgLedger.body.connected).toBe(false);
    expect(otherOrgLedger.body.payments).toHaveLength(0);
  });
});
