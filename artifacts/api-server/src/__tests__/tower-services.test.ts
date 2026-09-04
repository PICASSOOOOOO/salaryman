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
});