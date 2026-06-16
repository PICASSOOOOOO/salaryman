// CF LABOR SOURCES — service listing integration
//
// Closes the loop between POST /api/services (listing creation + escrow debit)
// and GET /api/cf/labor-sources (debtor discovery of for-hire work).
//
// Tests:
//   1. Happy path — a Construction listing created via POST /services surfaces
//      in forHire.serviceListings on the next GET /cf/labor-sources call.
//   2. Auth guard — unauthenticated callers are rejected with 401 on both routes.
//   3. Missing title — returns 400 with a descriptive error.
//   4. Zero reward — returns 400 because payFiat is required to be > 0.
//   5. Insufficient balance — returns 402 when the poster cannot cover escrow.
//   6. Non-Construction listings do NOT appear in forHire.serviceListings
//      (the CF pool only surfaces Construction work to debtors).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { randomUUID } from "crypto";
import {
  db,
  usersTable,
  serviceListingsTable,
  bankAccountsTable,
  bankTransactionsTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

import servicesRouter from "../routes/services";
import cfRouter from "../routes/cf";

// ── Auth harness ──────────────────────────────────────────────────────────────

const authState: { authed: boolean; user: { id: string; email: string } } = {
  authed: true,
  user: { id: "", email: "" },
};
function actAs(user: { id: string; email: string }) {
  authState.authed = true;
  authState.user = user;
}
function actAsGuest() {
  authState.authed = false;
  authState.user = { id: "", email: "" };
}

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated =
      () => authState.authed;
    (req as unknown as { user: { id: string; email: string } }).user =
      authState.user;
    next();
  });
  app.use("/api", servicesRouter);
  app.use("/api", cfRouter);
  return app;
}

// ── Seed helpers ──────────────────────────────────────────────────────────────

const createdUserIds: string[] = [];
const createdListingIds: number[] = [];

async function createUser(): Promise<{ id: string; email: string }> {
  const email = `cf-labor-svc-${randomUUID().slice(0, 8)}@example.test`;
  const [row] = await db
    .insert(usersTable)
    .values({ email })
    .returning({ id: usersTable.id, email: usersTable.email });
  createdUserIds.push(row.id);
  return { id: row.id, email: row.email ?? email };
}

async function seedBankAccount(
  userId: string,
  balance: number,
): Promise<number> {
  const [acct] = await db
    .insert(bankAccountsTable)
    .values({ userId, kind: "checking", label: "Checking", balance })
    .returning({ id: bankAccountsTable.id });
  return acct.id;
}

// ── Global state ──────────────────────────────────────────────────────────────

let app: Express;

beforeAll(() => {
  app = buildApp();
});

afterAll(async () => {
  if (createdListingIds.length) {
    await db
      .delete(serviceListingsTable)
      .where(inArray(serviceListingsTable.id, createdListingIds));
  }
  if (createdUserIds.length) {
    await db
      .delete(bankTransactionsTable)
      .where(inArray(bankTransactionsTable.userId, createdUserIds));
    await db
      .delete(bankAccountsTable)
      .where(inArray(bankAccountsTable.userId, createdUserIds));
    await db
      .delete(serviceListingsTable)
      .where(inArray(serviceListingsTable.posterUserId, createdUserIds));
    await db
      .delete(usersTable)
      .where(inArray(usersTable.id, createdUserIds));
  }
});

// ── 1. Happy path ─────────────────────────────────────────────────────────────

describe("POST /api/services → GET /api/cf/labor-sources integration", () => {
  it("a newly created Construction listing appears in forHire.serviceListings", async () => {
    const poster = await createUser();
    await seedBankAccount(poster.id, 50_000);

    actAs(poster);

    const postRes = await request(app).post("/api/services").send({
      category: "Construction",
      title: "Build the eastern wall",
      description: "Heavy masonry required.",
      payFiat: 10_000,
      payType: "flat",
      cityId: "minx_prime",
      location: "city",
    });

    expect(postRes.status).toBe(201);
    expect(postRes.body.listing).toMatchObject({
      category: "Construction",
      title: "Build the eastern wall",
      payFiat: 10_000,
      status: "open",
    });

    const listingId = postRes.body.listing.id as number;
    createdListingIds.push(listingId);

    const getRes = await request(app).get("/api/cf/labor-sources");

    expect(getRes.status).toBe(200);
    expect(getRes.body).toHaveProperty("forHire");
    expect(Array.isArray(getRes.body.forHire.serviceListings)).toBe(true);

    const found = getRes.body.forHire.serviceListings.find(
      (s: { id: number }) => s.id === listingId,
    );
    expect(found).toBeDefined();
    expect(found).toMatchObject({
      id: listingId,
      title: "Build the eastern wall",
      category: "Construction",
      payFiat: 10_000,
    });

    expect(getRes.body.hasForHire).toBe(true);
  });

  it("escrow is debited from the poster's checking account after posting", async () => {
    const poster = await createUser();
    await seedBankAccount(poster.id, 20_000);

    actAs(poster);

    const postRes = await request(app).post("/api/services").send({
      category: "Construction",
      title: "Dig the foundation",
      payFiat: 5_000,
      cityId: "minx_prime",
    });

    expect(postRes.status).toBe(201);
    createdListingIds.push(postRes.body.listing.id as number);

    const [acct] = await db
      .select({ balance: bankAccountsTable.balance })
      .from(bankAccountsTable)
      .where(eq(bankAccountsTable.userId, poster.id))
      .limit(1);

    expect(acct.balance).toBe(15_000); // 20_000 − 5_000 escrow
  });
});

// ── 2. Auth guards ────────────────────────────────────────────────────────────

describe("auth guards", () => {
  it("POST /api/services returns 401 when not authenticated", async () => {
    actAsGuest();
    const res = await request(app).post("/api/services").send({
      category: "Construction",
      title: "Should fail",
      payFiat: 1_000,
    });
    expect(res.status).toBe(401);
  });

  it("GET /api/cf/labor-sources returns 401 when not authenticated", async () => {
    actAsGuest();
    const res = await request(app).get("/api/cf/labor-sources");
    expect(res.status).toBe(401);
  });
});

// ── 3. Edge cases — validation ────────────────────────────────────────────────

describe("POST /api/services — validation edge cases", () => {
  it("returns 400 when title is missing", async () => {
    const poster = await createUser();
    await seedBankAccount(poster.id, 50_000);
    actAs(poster);

    const res = await request(app).post("/api/services").send({
      category: "Construction",
      payFiat: 5_000,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/i);
  });

  it("returns 400 when title is too short (fewer than 2 chars)", async () => {
    const poster = await createUser();
    await seedBankAccount(poster.id, 50_000);
    actAs(poster);

    const res = await request(app).post("/api/services").send({
      category: "Construction",
      title: "X",
      payFiat: 5_000,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/i);
  });

  it("returns 400 when payFiat is zero", async () => {
    const poster = await createUser();
    await seedBankAccount(poster.id, 50_000);
    actAs(poster);

    const res = await request(app).post("/api/services").send({
      category: "Construction",
      title: "Zero pay listing",
      payFiat: 0,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/payFiat/i);
  });

  it("returns 400 when payFiat is negative", async () => {
    const poster = await createUser();
    await seedBankAccount(poster.id, 50_000);
    actAs(poster);

    const res = await request(app).post("/api/services").send({
      category: "Construction",
      title: "Negative pay listing",
      payFiat: -500,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/payFiat/i);
  });

  it("returns 402 when the poster has insufficient balance to cover escrow", async () => {
    const poster = await createUser();
    await seedBankAccount(poster.id, 1_000); // only 1k available
    actAs(poster);

    const res = await request(app).post("/api/services").send({
      category: "Construction",
      title: "Too expensive listing",
      payFiat: 10_000,
    });

    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({
      error: expect.stringMatching(/insufficient/i),
      required: 10_000,
    });
  });

  it("returns 400 when category is invalid", async () => {
    const poster = await createUser();
    await seedBankAccount(poster.id, 50_000);
    actAs(poster);

    const res = await request(app).post("/api/services").send({
      category: "InvalidCategory",
      title: "Bad category listing",
      payFiat: 1_000,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/category/i);
  });
});

// ── 4. Non-Construction listings stay out of the CF pool ──────────────────────

describe("GET /api/cf/labor-sources — only Construction category surfaced", () => {
  it("a Delivery listing does NOT appear in forHire.serviceListings", async () => {
    const poster = await createUser();
    await seedBankAccount(poster.id, 50_000);
    actAs(poster);

    const postRes = await request(app).post("/api/services").send({
      category: "Delivery",
      title: "Deliver the packages",
      payFiat: 3_000,
      cityId: "minx_prime",
    });

    expect(postRes.status).toBe(201);
    const listingId = postRes.body.listing.id as number;
    createdListingIds.push(listingId);

    const getRes = await request(app).get("/api/cf/labor-sources");

    expect(getRes.status).toBe(200);
    const found = getRes.body.forHire.serviceListings.find(
      (s: { id: number }) => s.id === listingId,
    );
    expect(found).toBeUndefined();
  });
});
