import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";
import {
  bankAccountsTable,
  bankTransactionsTable,
  db,
  serviceListingsTable,
  usersTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import servicesRouter from "../routes/services";

const authState: { authed: boolean; user: { id: string; email: string } } = {
  authed: true,
  user: { id: "", email: "" },
};

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => authState.authed;
    (req as unknown as { user: { id: string; email: string } }).user = authState.user;
    next();
  });
  app.use("/api", servicesRouter);
  return app;
}

const createdUserIds: string[] = [];
const createdListingIds: number[] = [];
let app: Express;

async function createUser() {
  const email = `tower-services-${randomUUID().slice(0, 8)}@example.test`;
  const [user] = await db.insert(usersTable).values({ email }).returning();
  createdUserIds.push(user.id);
  return user;
}

async function createCheckingAccount(userId: string, balance: number) {
  return db.insert(bankAccountsTable).values({
    userId,
    kind: "checking",
    label: "Checking",
    balance,
  }).returning();
}

function authenticateAs(user: { id: string; email: string | null }) {
  authState.user = { id: user.id, email: user.email ?? "" };
}

async function publishTenantListing(
  poster: { id: string; email: string | null },
  title: string,
  payFiat: number,
) {
  authenticateAs(poster);
  const response = await request(app).post("/api/services").send({
    category: "Other",
    title,
    description: "A tenant-scoped service listing for lifecycle coverage.",
    payFiat,
    businessKey: "tower_restaurant",
  });
  expect(response.status).toBe(201);
  expect(response.body.listing.businessKey).toBe("tower_restaurant");
  createdListingIds.push(response.body.listing.id);
  return response.body.listing;
}

beforeAll(() => {
  app = buildApp();
});


afterAll(async () => {
  if (createdListingIds.length) {
    await db.delete(serviceListingsTable).where(inArray(serviceListingsTable.id, createdListingIds));
  }
  if (createdUserIds.length) {
    await db.delete(bankTransactionsTable).where(inArray(bankTransactionsTable.userId, createdUserIds));
    await db.delete(bankAccountsTable).where(inArray(bankAccountsTable.userId, createdUserIds));
    await db.delete(serviceListingsTable).where(inArray(serviceListingsTable.posterUserId, createdUserIds));
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
});

describe("Tower tenant Services Board scopes", () => {
  it("returns only listings published for the requested fixed-suite tenant", async () => {
    const marker = randomUUID();
    const [restaurantListing, doctorListing, sharedListing] = await db.insert(serviceListingsTable).values([
      {
        posterUserId: `tower-test-${marker}`,
        posterName: "Tower Test",
        category: "Other",
        title: `Restaurant ${marker}`,
        payFiat: 100,
        cityId: "minx_prime",
        status: "open",
        escrowFiat: 100,
        businessKey: "tower_restaurant",
      },
      {
        posterUserId: `tower-test-${marker}`,
        posterName: "Tower Test",
        category: "Other",
        title: `Doctor ${marker}`,
        payFiat: 100,
        cityId: "minx_prime",
        status: "open",
        escrowFiat: 100,
        businessKey: "tower_doctor",
      },
      {
        posterUserId: `tower-test-${marker}`,
        posterName: "Tower Test",
        category: "Other",
        title: `Shared ${marker}`,
        payFiat: 100,
        cityId: "minx_prime",
        status: "open",
        escrowFiat: 100,
      },
    ]).returning({ id: serviceListingsTable.id });
    createdListingIds.push(restaurantListing.id, doctorListing.id, sharedListing.id);

    const response = await request(app).get("/api/services")
      .query({ tenant: "tower_restaurant" });

    expect(response.status).toBe(200);
    expect(response.body.tenant).toMatchObject({
      businessKey: "tower_restaurant",
      name: "NOIR RESERVATION",
      floorNumber: 12,
    });
    expect(response.body.listings.map((listing: { id: number }) => listing.id))
      .toEqual([restaurantListing.id]);
  });

  it("returns an explicit empty scope for unavailable Tower categories", async () => {
    const response = await request(app).get("/api/services")
      .query({ tenant: "tower_vending" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ listings: [], tenant: null });
  });

  it("persists a valid tenant scope when a user publishes from its counter", async () => {
    const user = await createUser();
    await db.insert(bankAccountsTable).values({
      userId: user.id,
      kind: "checking",
      label: "Checking",
      balance: 10_000,
    });
    authState.user = { id: user.id, email: user.email ?? "" };

    const response = await request(app).post("/api/services").send({
      category: "Other",
      title: "Private dining setup",
      description: "Prepare the tenant counter.",
      payFiat: 1_000,
      businessKey: "tower_restaurant",
    });

    expect(response.status).toBe(201);
    expect(response.body.listing.businessKey).toBe("tower_restaurant");
    createdListingIds.push(response.body.listing.id);
  });

  it("rejects an unavailable tenant before taking escrow", async () => {
    const user = await createUser();
    const [account] = await db.insert(bankAccountsTable).values({
      userId: user.id,
      kind: "checking",
      label: "Checking",
      balance: 10_000,
    }).returning();
    authState.user = { id: user.id, email: user.email ?? "" };

    const response = await request(app).post("/api/services").send({
      category: "Other",
      title: "Should not exist",
      payFiat: 1_000,
      businessKey: "tower_vending",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/unavailable/i);
    const [after] = await db.select({ balance: bankAccountsTable.balance })
      .from(bankAccountsTable)
      .where(eq(bankAccountsTable.id, account.id));
    expect(after.balance).toBe(10_000);
  });

  it("claims and completes a tenant listing, releasing escrow while retaining its scope", async () => {
    const poster = await createUser();
    const claimer = await createUser();
    const [posterAccount] = await createCheckingAccount(poster.id, 10_000);
    const [claimerAccount] = await createCheckingAccount(claimer.id, 500);
    const listing = await publishTenantListing(poster, "Restaurant setup", 1_200);

    authenticateAs(claimer);
    const claimResponse = await request(app).post(`/api/services/${listing.id}/claim`);
    expect(claimResponse.status).toBe(200);
    expect(claimResponse.body.listing).toMatchObject({
      status: "claimed",
      claimerUserId: claimer.id,
      businessKey: "tower_restaurant",
      escrowFiat: 1_200,
    });

    authenticateAs(poster);
    const completeResponse = await request(app).post(`/api/services/${listing.id}/complete`);
    expect(completeResponse.status).toBe(200);
    expect(completeResponse.body.listing).toMatchObject({
      status: "complete",
      claimerUserId: claimer.id,
      businessKey: "tower_restaurant",
      escrowFiat: 0,
    });

    const [claimerAfter] = await db.select({ balance: bankAccountsTable.balance })
      .from(bankAccountsTable)
      .where(eq(bankAccountsTable.id, claimerAccount.id));
    expect(claimerAfter.balance).toBe(1_700);
    const [posterAfter] = await db.select({ balance: bankAccountsTable.balance })
      .from(bankAccountsTable)
      .where(eq(bankAccountsTable.id, posterAccount.id));
    expect(posterAfter.balance).toBe(8_800);
    const [release] = await db.select({
      kind: bankTransactionsTable.kind,
      amount: bankTransactionsTable.amount,
    }).from(bankTransactionsTable)
      .where(eq(bankTransactionsTable.userId, claimer.id));
    expect(release).toEqual({ kind: "escrow_release", amount: 1_200 });

    const [persisted] = await db.select()
      .from(serviceListingsTable)
      .where(eq(serviceListingsTable.id, listing.id));
    expect(persisted).toMatchObject({
      status: "complete",
      businessKey: "tower_restaurant",
      escrowFiat: 0,
    });
  });

  it("returns tenant-listing escrow to the poster after a dispute", async () => {
    const poster = await createUser();
    const claimer = await createUser();
    const [posterAccount] = await createCheckingAccount(poster.id, 10_000);
    const [claimerAccount] = await createCheckingAccount(claimer.id, 500);
    const listing = await publishTenantListing(poster, "Restaurant inventory review", 1_300);

    authenticateAs(claimer);
    const claimResponse = await request(app).post(`/api/services/${listing.id}/claim`);
    expect(claimResponse.status).toBe(200);
    expect(claimResponse.body.listing.businessKey).toBe("tower_restaurant");

    authenticateAs(poster);
    const disputeResponse = await request(app).post(`/api/services/${listing.id}/dispute`);
    expect(disputeResponse.status).toBe(200);
    expect(disputeResponse.body.listing).toMatchObject({
      status: "disputed",
      businessKey: "tower_restaurant",
      escrowFiat: 0,
    });

    const [posterAfter] = await db.select({ balance: bankAccountsTable.balance })
      .from(bankAccountsTable)
      .where(eq(bankAccountsTable.id, posterAccount.id));
    expect(posterAfter.balance).toBe(10_000);
    const [claimerAfter] = await db.select({ balance: bankAccountsTable.balance })
      .from(bankAccountsTable)
      .where(eq(bankAccountsTable.id, claimerAccount.id));
    expect(claimerAfter.balance).toBe(500);
    const [persisted] = await db.select()
      .from(serviceListingsTable)
      .where(eq(serviceListingsTable.id, listing.id));
    expect(persisted).toMatchObject({
      status: "disputed",
      businessKey: "tower_restaurant",
      escrowFiat: 0,
    });
    const returns = await db.select({
      kind: bankTransactionsTable.kind,
      amount: bankTransactionsTable.amount,
    }).from(bankTransactionsTable)
      .where(eq(bankTransactionsTable.userId, poster.id));
    expect(returns).toContainEqual({ kind: "escrow_return", amount: 1_300 });
  });

  it("returns tenant-listing escrow to the poster when a claimed listing is cancelled", async () => {
    const poster = await createUser();
    const claimer = await createUser();
    const [posterAccount] = await createCheckingAccount(poster.id, 10_000);
    const [claimerAccount] = await createCheckingAccount(claimer.id, 500);
    const listing = await publishTenantListing(poster, "Restaurant cleanup", 1_400);

    authenticateAs(claimer);
    const claimResponse = await request(app).post(`/api/services/${listing.id}/claim`);
    expect(claimResponse.status).toBe(200);
    expect(claimResponse.body.listing.businessKey).toBe("tower_restaurant");

    authenticateAs(poster);
    const cancelResponse = await request(app).post(`/api/services/${listing.id}/cancel`);
    expect(cancelResponse.status).toBe(200);
    expect(cancelResponse.body.listing).toMatchObject({
      status: "cancelled",
      businessKey: "tower_restaurant",
      escrowFiat: 0,
    });

    const [posterAfter] = await db.select({ balance: bankAccountsTable.balance })
      .from(bankAccountsTable)
      .where(eq(bankAccountsTable.id, posterAccount.id));
    expect(posterAfter.balance).toBe(10_000);
    const [claimerAfter] = await db.select({ balance: bankAccountsTable.balance })
      .from(bankAccountsTable)
      .where(eq(bankAccountsTable.id, claimerAccount.id));
    expect(claimerAfter.balance).toBe(500);
    const [persisted] = await db.select()
      .from(serviceListingsTable)
      .where(eq(serviceListingsTable.id, listing.id));
    expect(persisted).toMatchObject({
      status: "cancelled",
      businessKey: "tower_restaurant",
      escrowFiat: 0,
    });
    const returns = await db.select({
      kind: bankTransactionsTable.kind,
      amount: bankTransactionsTable.amount,
    }).from(bankTransactionsTable)
      .where(eq(bankTransactionsTable.userId, poster.id));
    expect(returns).toContainEqual({ kind: "escrow_return", amount: 1_400 });
  });
});
