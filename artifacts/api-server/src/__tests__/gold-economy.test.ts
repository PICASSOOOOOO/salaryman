import express from "express";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  bankAccountsTable,
  bankTransactionsTable,
  db,
  goldConversionQuotesTable,
  goldConversionTransactionsTable,
  playerGoldAccountsTable,
  playerLedgerTable,
} from "@workspace/db";
import goldRouter from "../routes/gold-economy";
import {
  btcForOneUsd,
  buildGoldQuote,
  FIAT_PER_GOLD,
  isFreshExecutableMarket,
} from "../lib/gold-economy";

const USER = "gold-economy-test-user";
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).isAuthenticated = () => true;
  (req as any).user = { id: USER, email: "gold-test@example.invalid" };
  next();
});
app.use(goldRouter);

async function clean() {
  await db.delete(goldConversionTransactionsTable).where(eq(goldConversionTransactionsTable.userId, USER));
  await db.delete(goldConversionQuotesTable).where(eq(goldConversionQuotesTable.userId, USER));
  await db.delete(playerGoldAccountsTable).where(eq(playerGoldAccountsTable.userId, USER));
  await db.delete(bankTransactionsTable).where(eq(bankTransactionsTable.userId, USER));
  await db.delete(bankAccountsTable).where(eq(bankAccountsTable.userId, USER));
  await db.delete(playerLedgerTable).where(eq(playerLedgerTable.userId, USER));
}

async function seedQuote(side: "buy" | "sell", goldTenths: number) {
  const amounts = buildGoldQuote(side, goldTenths);
  const [quote] = await db.insert(goldConversionQuotesTable).values({
    userId: USER,
    slotIndex: 0,
    ...amounts,
    btcUsdCents: 10_000_000,
    marketSource: "test",
    marketAsOf: new Date(),
    expiresAt: new Date(Date.now() + 30_000),
  }).returning();
  return quote;
}

beforeEach(clean);
afterAll(clean);

describe("live GOLD quote math", () => {
  it("uses the canonical ƒ100 = 0.1 GOLD = $1 rail", () => {
    expect(FIAT_PER_GOLD).toBe(1_000);
    expect(buildGoldQuote("buy", 1)).toMatchObject({
      goldTenths: 1,
      grossFiat: 100,
      feeFiat: 2,
      settledFiat: 102,
    });
    expect(buildGoldQuote("sell", 1).settledFiat).toBe(98);
  });

  it("derives the BTC amount worth $1 from live BTC/USD", () => {
    expect(btcForOneUsd(100_000)).toBe(0.00001);
    expect(btcForOneUsd(0)).toBeNull();
  });

  it("rejects stale, unavailable, and invalid markets", () => {
    const now = Date.now();
    expect(isFreshExecutableMarket({ status: "live", asOf: now, btcUsd: 100_000 }, now)).toBe(true);
    expect(isFreshExecutableMarket({ status: "stale", asOf: now, btcUsd: 100_000 }, now)).toBe(false);
    expect(isFreshExecutableMarket({ status: "unavailable", asOf: now, btcUsd: 0 }, now)).toBe(false);
    expect(isFreshExecutableMarket({ status: "live", asOf: now - 61_000, btcUsd: 100_000 }, now)).toBe(false);
  });
});

describe("authoritative GOLD settlement", () => {
  it("settles once and replays the same idempotency key without minting", async () => {
    await db.insert(bankAccountsTable).values({ userId: USER, kind: "checking", label: "CHECKING", balance: 1_000 });
    const quote = await seedQuote("buy", 1);
    const body = { slot: 0, quoteId: quote.id, idempotencyKey: "same-request-123" };
    const first = await request(app).post("/economy/gold/convert").send(body);
    const replay = await request(app).post("/economy/gold/convert").send(body);
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.body.duplicate).toBe(true);
    const [gold] = await db.select().from(playerGoldAccountsTable)
      .where(and(eq(playerGoldAccountsTable.userId, USER), eq(playerGoldAccountsTable.slotIndex, 0)));
    expect(gold.balanceTenths).toBe(1);
  });

  it("allows only one of two concurrent executions of the same quote", async () => {
    await db.insert(bankAccountsTable).values({ userId: USER, kind: "checking", label: "CHECKING", balance: 1_000 });
    const quote = await seedQuote("buy", 1);
    const [a, b] = await Promise.all([
      request(app).post("/economy/gold/convert").send({ slot: 0, quoteId: quote.id, idempotencyKey: "concurrent-request-a" }),
      request(app).post("/economy/gold/convert").send({ slot: 0, quoteId: quote.id, idempotencyKey: "concurrent-request-b" }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const rows = await db.select().from(goldConversionTransactionsTable).where(eq(goldConversionTransactionsTable.userId, USER));
    expect(rows).toHaveLength(1);
  });

  it("rolls back both balances when FIAT is insufficient", async () => {
    await db.insert(bankAccountsTable).values({ userId: USER, kind: "checking", label: "CHECKING", balance: 50 });
    const quote = await seedQuote("buy", 1);
    const response = await request(app).post("/economy/gold/convert")
      .send({ slot: 0, quoteId: quote.id, idempotencyKey: "insufficient-request" });
    expect(response.status).toBe(409);
    const gold = await db.select().from(playerGoldAccountsTable).where(eq(playerGoldAccountsTable.userId, USER));
    expect(gold[0]?.balanceTenths ?? 0).toBe(0);
    const tx = await db.select().from(goldConversionTransactionsTable).where(eq(goldConversionTransactionsTable.userId, USER));
    expect(tx).toHaveLength(0);
  });
});