import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  db,
  towerOperationsLedgerTable,
  towerOperationsStateTable,
} from "@workspace/db";
import { ensureTowerShopWorkingCapitalTx } from "./tower-shop-finance";

describe("ensureTowerShopWorkingCapitalTx", () => {
  it("records shop opening funds with the event type accepted by production", async () => {
    const now = new Date();
    const businessKey = `test-shop-${randomUUID()}`;
    const eventKey = `tower-shop-capital:${businessKey}:v1`;
    const rollbackMarker = new Error("rollback test transaction");
    let transactionError: unknown;

    try {
      await db.transaction(async (tx) => {
        await tx.insert(towerOperationsStateTable).values({
          buildingKey: "shadow_tower",
          operatingBalanceFiat: 250_000,
          lastUtilityBillAt: now,
          updatedAt: now,
        }).onConflictDoUpdate({
          target: towerOperationsStateTable.buildingKey,
          set: {
            operatingBalanceFiat: 250_000,
            powerBillDueFiat: 0,
            waterBillDueFiat: 0,
            lastUtilityBillAt: now,
            updatedAt: now,
          },
        });

        const funding = await ensureTowerShopWorkingCapitalTx(tx, businessKey, now);
        expect(funding.ok).toBe(true);
        const [event] = await tx.select({ eventType: towerOperationsLedgerTable.eventType })
          .from(towerOperationsLedgerTable)
          .where(eq(towerOperationsLedgerTable.eventKey, eventKey))
          .limit(1);
        expect(event?.eventType).toBe("opening_capital");

        throw rollbackMarker;
      });
    } catch (error) {
      transactionError = error;
    }

    expect(transactionError).toBe(rollbackMarker);
  });
});
