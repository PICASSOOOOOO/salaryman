import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  bankAccountsTable,
  bankTransactionsTable,
  db,
  playerLedgerTable,
  salarymanSavesTable,
} from "@workspace/db";
import vendingRouter, { applyFoodEffect } from "../routes/vending";

const userId = `test-vending-${randomUUID()}`;
const slotIndex = 0;

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).isAuthenticated = () => true;
  (req as any).user = { id: userId, email: "vending@example.test" };
  next();
});
app.use("/api", vendingRouter);

async function balance() {
  const rows = await db
    .select({ balance: bankAccountsTable.balance })
    .from(bankAccountsTable)
    .where(eq(bankAccountsTable.userId, userId));
  return rows.reduce((sum, row) => sum + row.balance, 0);
}

describe("server-authoritative food vending", () => {
  beforeAll(async () => {
    await db.insert(bankAccountsTable).values({
      userId,
      kind: "checking",
      label: "Checking",
      balance: 1_000,
      currency: "FIAT",
    });
    await db.insert(salarymanSavesTable).values({
      userId,
      slotIndex,
      charName: "TEST",
      charClass: "salaryman",
      salary: 999_999,
      data: { hp: 50, maxHp: 100, hunger: 20, thirst: 20, energy: 20, salary: 999_999 },
    });
  });

  afterAll(async () => {
    const accounts = await db.select({ id: bankAccountsTable.id })
      .from(bankAccountsTable)
      .where(eq(bankAccountsTable.userId, userId));
    for (const account of accounts) {
      await db.delete(bankTransactionsTable).where(eq(bankTransactionsTable.accountId, account.id));
    }
    await db.delete(salarymanSavesTable).where(eq(salarymanSavesTable.userId, userId));
    await db.delete(bankAccountsTable).where(eq(bankAccountsTable.userId, userId));
    await db.delete(playerLedgerTable).where(eq(playerLedgerTable.userId, userId));
  });

  it("commits the FIAT debit and food effect together", async () => {
    const response = await request(app)
      .post("/api/vending/food/purchase")
      .send({ itemId: "recycled_water", slotIndex, requestId: "water-request-001" });

    expect(response.status).toBe(200);
    expect(response.body.newBalance).toBe(600);
    expect(response.body.data.thirst).toBe(60);
    expect(response.body.data.salary).toBe(999_999);
    expect(await balance()).toBe(600);

    const [save] = await db.select().from(salarymanSavesTable)
      .where(and(eq(salarymanSavesTable.userId, userId), eq(salarymanSavesTable.slotIndex, slotIndex)));
    expect((save.data as any).thirst).toBe(60);
  });

  it("does not apply an effect when FIAT is insufficient", async () => {
    const response = await request(app)
      .post("/api/vending/food/purchase")
      .send({ itemId: "med_kit", slotIndex, requestId: "medkit-request-001" });

    expect(response.status).toBe(402);
    expect(await balance()).toBe(600);
    const [save] = await db.select().from(salarymanSavesTable)
      .where(and(eq(salarymanSavesTable.userId, userId), eq(salarymanSavesTable.slotIndex, slotIndex)));
    expect((save.data as any).hp).toBe(50);
  });

  it("keeps risky effects deterministic at the transaction boundary", () => {
    expect(applyFoodEffect({ hp: 50, maxHp: 100 }, "hprisk5", () => 0).hp).toBe(45);
    expect(applyFoodEffect({ hp: 50, maxHp: 100 }, "hprisk5", () => 1).hp).toBe(50);
  });

  it("does not charge or apply food twice when a request is retried", async () => {
    const payload = { itemId: "clean_water", slotIndex, requestId: "retry-request-001" };
    const first = await request(app).post("/api/vending/food/purchase").send(payload);
    const second = await request(app).post("/api/vending/food/purchase").send(payload);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.spendable).toBe(first.body.spendable);
    expect(second.body.data.thirst).toBe(first.body.data.thirst);
  });
});