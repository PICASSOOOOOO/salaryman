import { describe, it, expect, afterAll } from "vitest";
import {
  db,
  billsTable,
  invoicesTable,
  realEmployeesTable,
  payrollRunsTable,
  balanceSheetTxTable,
  autopilotActivityLogTable,
  type AutopilotConfig,
  type Bot,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { recordAutopilotActivity } from "../lib/autopilot/activity";
import type { AutopilotContext, AutopilotLogInput } from "../lib/autopilot/types";
import { accountingAutopilotHandler } from "../lib/autopilot/handlers/accounting";

// Real dev-DB integration test for the Accounting Autopilot handler. Each case
// uses its own synthetic owner/org so rows never collide, and cleans up after.

const RUN = `aptest_${Date.now()}`;
const userIds: string[] = [];
const orgIds: number[] = [];
let orgSeq = 900000 + Math.floor(Math.random() * 90000);

function newOwner(tag: string): { userId: string; orgId: number } {
  const userId = `${RUN}_${tag}`;
  const orgId = orgSeq++;
  userIds.push(userId);
  orgIds.push(orgId);
  return { userId, orgId };
}

function dateOffset(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

function makeCtx(
  orgId: number,
  ownerId: string,
  maxActions = 5
): { ctx: AutopilotContext; logs: AutopilotLogInput[] } {
  const logs: AutopilotLogInput[] = [];
  let budget = maxActions;
  const ctx: AutopilotContext = {
    orgId,
    domain: "accounting",
    config: { id: 1, orgId, domain: "accounting", botId: 1 } as unknown as AutopilotConfig,
    bot: { id: 1 } as unknown as Bot,
    ownerId,
    ownerEmail: null,
    maxActions,
    async log(input) {
      logs.push(input);
      await recordAutopilotActivity({ orgId, domain: "accounting", botId: 1, ...input });
    },
    claimAction() {
      if (budget <= 0) {
        logs.push({ action: "blocked", summary: "cap", outcome: "blocked" });
        return false;
      }
      budget -= 1;
      return true;
    },
    async ensureEntitlement() {
      return true;
    },
    async ensureCredit() {
      return true;
    },
  };
  return { ctx, logs };
}

// Seed spendable book cash via a PAID invoice (revenue = cash inflow).
async function seedCash(userId: string, amount: number) {
  await db.insert(invoicesTable).values({
    userId,
    clientName: "Cash Source",
    invoiceNumber: `CASH-${userId}`,
    issueDate: dateOffset(-10),
    dueDate: dateOffset(-10),
    lineItems: [{ quantity: 1, rate: amount }],
    status: "paid",
  });
}

afterAll(async () => {
  if (userIds.length) {
    await db.delete(billsTable).where(inArray(billsTable.userId, userIds));
    await db.delete(invoicesTable).where(inArray(invoicesTable.userId, userIds));
    await db.delete(realEmployeesTable).where(inArray(realEmployeesTable.userId, userIds));
    await db.delete(payrollRunsTable).where(inArray(payrollRunsTable.userId, userIds));
    await db.delete(balanceSheetTxTable).where(inArray(balanceSheetTxTable.userId, userIds));
  }
  if (orgIds.length) {
    await db.delete(autopilotActivityLogTable).where(inArray(autopilotActivityLogTable.orgId, orgIds));
  }
});

describe("accounting autopilot — idle books", () => {
  it("logs a single noop tick when nothing is due", async () => {
    const { userId, orgId } = newOwner("idle");
    const { ctx, logs } = makeCtx(orgId, userId);
    await accountingAutopilotHandler(ctx);

    expect(logs.length).toBe(1);
    expect(logs[0].action).toBe("tick");
    expect(logs[0].outcome).toBe("noop");

    const bills = await db.select().from(billsTable).where(eq(billsTable.userId, userId));
    const runs = await db.select().from(payrollRunsTable).where(eq(payrollRunsTable.userId, userId));
    expect(bills.length).toBe(0);
    expect(runs.length).toBe(0);
  });
});

describe("accounting autopilot — bill payment", () => {
  it("pays affordable due bills oldest-first and never overdraws", async () => {
    const { userId, orgId } = newOwner("bills");
    await seedCash(userId, 1000);
    const [cheap] = await db
      .insert(billsTable)
      .values({ userId, vendor: "Utilities", amount: "300", dueDate: dateOffset(-2), status: "pending" })
      .returning();
    const [pricey] = await db
      .insert(billsTable)
      .values({ userId, vendor: "Landlord", amount: "5000", dueDate: dateOffset(-1), status: "overdue" })
      .returning();

    const { ctx, logs } = makeCtx(orgId, userId);
    await accountingAutopilotHandler(ctx);

    const after = await db.select().from(billsTable).where(eq(billsTable.userId, userId));
    const cheapAfter = after.find((b) => b.id === cheap.id)!;
    const priceyAfter = after.find((b) => b.id === pricey.id)!;
    expect(cheapAfter.status).toBe("paid");
    expect(priceyAfter.status).not.toBe("paid"); // unaffordable → held, no overdraw

    // Exactly one balance-sheet outflow recorded for the paid bill.
    const tx = await db.select().from(balanceSheetTxTable).where(eq(balanceSheetTxTable.userId, userId));
    const billTx = tx.filter((t) => t.referenceType === "bill");
    expect(billTx.length).toBe(1);
    expect(Number(billTx[0].amount)).toBe(300);

    expect(logs.some((l) => l.action === "pay_bill" && l.outcome === "success")).toBe(true);
    expect(logs.some((l) => l.action === "pay_bill" && l.outcome === "skipped")).toBe(true);
  });
});

describe("accounting autopilot — collections", () => {
  it("chases overdue invoices once per cooldown (deduped across ticks)", async () => {
    const { userId, orgId } = newOwner("collections");
    await db.insert(invoicesTable).values({
      userId,
      clientName: "Slow Payer",
      invoiceNumber: `OVD-${userId}`,
      issueDate: dateOffset(-40),
      dueDate: dateOffset(-30),
      lineItems: [{ quantity: 1, rate: 500 }],
      status: "sent",
    });

    const first = makeCtx(orgId, userId);
    await accountingAutopilotHandler(first.ctx);
    const second = makeCtx(orgId, userId);
    await accountingAutopilotHandler(second.ctx);

    const reminders = await db
      .select()
      .from(autopilotActivityLogTable)
      .where(eq(autopilotActivityLogTable.orgId, orgId));
    const collected = reminders.filter((r) => r.action === "collections_reminder");
    expect(collected.length).toBe(1); // deduped on the second tick

    expect(first.logs.some((l) => l.action === "collections_reminder")).toBe(true);
    expect(second.logs.some((l) => l.action === "collections_reminder")).toBe(false);
  });
});

describe("accounting autopilot — payroll", () => {
  it("runs payroll once per period for active paid employees, cash-gated", async () => {
    const { userId, orgId } = newOwner("payroll");
    await seedCash(userId, 10000);
    await db.insert(realEmployeesTable).values({ userId, name: "Alice", role: "Eng", payRate: "2000", status: "active" });
    await db.insert(realEmployeesTable).values({ userId, name: "Bob", role: "Ops", payRate: "1500", status: "active" });
    await db.insert(realEmployeesTable).values({ userId, name: "Ghost", role: "Former", payRate: "9000", status: "inactive" });

    const first = makeCtx(orgId, userId);
    await accountingAutopilotHandler(first.ctx);

    let runs = await db.select().from(payrollRunsTable).where(eq(payrollRunsTable.userId, userId));
    expect(runs.length).toBe(1);
    expect(Number(runs[0].totalAmount)).toBe(3500); // active employees only
    expect((runs[0].breakdown as unknown[]).length).toBe(2);

    // Second tick within the same pay period must NOT run payroll again.
    const second = makeCtx(orgId, userId);
    await accountingAutopilotHandler(second.ctx);
    runs = await db.select().from(payrollRunsTable).where(eq(payrollRunsTable.userId, userId));
    expect(runs.length).toBe(1);
  });

  it("holds payroll when cash cannot cover it", async () => {
    const { userId, orgId } = newOwner("payroll_broke");
    await seedCash(userId, 100);
    await db.insert(realEmployeesTable).values({ userId, name: "Carol", role: "Eng", payRate: "5000", status: "active" });

    const { ctx, logs } = makeCtx(orgId, userId);
    await accountingAutopilotHandler(ctx);

    const runs = await db.select().from(payrollRunsTable).where(eq(payrollRunsTable.userId, userId));
    expect(runs.length).toBe(0);
    expect(logs.some((l) => l.action === "run_payroll" && l.outcome === "skipped")).toBe(true);
  });
});
