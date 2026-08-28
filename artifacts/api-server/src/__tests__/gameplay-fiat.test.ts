import { beforeAll, describe, expect, it } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import gameplayFiatRouter, {
  GAMEPLAY_FIAT_ACTIONS,
  creditClaimPolicy,
  isCreditClaimBlocked,
  resolveGameplayFiatAction,
} from "../routes/gameplay-fiat";
import { applyAuthoritativeSalarySnapshot } from "../routes/salaryman-saves";

describe("salary save wallet projection", () => {
  it("replaces forged top-level/blob salary with the authoritative wallet balance", () => {
    const blob = { salary: 9_999_999_999, unrelatedState: "preserved" };
    const column = applyAuthoritativeSalarySnapshot(blob, 200_000);
    expect(column).toBe(200_000);
    expect(blob).toEqual({ salary: 200_000, unrelatedState: "preserved" });
  });
});

describe("gameplay FIAT allowlist", () => {
  let app: Express;
  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).isAuthenticated = () => true;
      (req as any).user = { id: "test-user" };
      next();
    });
    app.use(gameplayFiatRouter);
  });

  it("rejects an unknown action before it can touch a wallet", async () => {
    const response = await request(app).post("/gameplay/fiat/action")
      .send({ actionId: "credit_everything", idempotencyKey: "request-12345" });
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/unknown/i);
  });

  it("contains only positive fixed amounts and explicit directions", () => {
    for (const action of Object.values(GAMEPLAY_FIAT_ACTIONS)) {
      expect(action.amountFiat).toBeGreaterThan(0);
      expect(["credit", "debit"]).toContain(action.direction);
    }
  });

  it("resolves dynamic item, costume, and keyed commodity prices on the server", () => {
    expect(resolveGameplayFiatAction("world_item_power_pellet")?.amountFiat).toBe(800);
    expect(resolveGameplayFiatAction("world_costume_cyberpunk")?.amountFiat).toBe(18_000);
    expect(resolveGameplayFiatAction("world_commodity_buy_city_data")?.amountFiat).toBe(8_000);
    expect(resolveGameplayFiatAction("world_commodity_sell_waste_data")?.amountFiat).toBe(15_000);
    expect(resolveGameplayFiatAction("world_item_not_allowlisted")).toBeNull();
  });

  it("ignores a forged client amount when resolving an action", () => {
    const forgedBody = { actionId: "world_item_power_pellet", amountFiat: 1 };
    expect(resolveGameplayFiatAction(forgedBody.actionId)?.amountFiat).toBe(800);
  });

  it("assigns every fixed credit a non-repeatable or bounded claim policy", () => {
    for (const [actionId, action] of Object.entries(GAMEPLAY_FIAT_ACTIONS)) {
      if (action.direction !== "credit") continue;
      const policy = creditClaimPolicy(actionId);
      expect(["once", "cooldown", "disabled"]).toContain(policy.type);
      if (policy.type === "cooldown") expect(policy.cooldownMs).toBeGreaterThan(0);
    }
  });

  it("uses the exact server-owned office tier debit", () => {
    expect(resolveGameplayFiatAction("office_lease_hot_desk")?.amountFiat).toBe(50);
    expect(resolveGameplayFiatAction("office_lease_exec_floor")?.amountFiat).toBe(1_500);
    expect(resolveGameplayFiatAction("office_lease_unknown")).toBeNull();
  });

  it("blocks unlimited one-time credits regardless of new request keys", () => {
    const policy = { type: "once" as const };
    const creditedAt = new Date("2026-01-01T00:00:00Z");
    let balance = 200_000;
    for (const _newKey of ["request-key-1", "request-key-2", "request-key-3"]) {
      if (!isCreditClaimBlocked(policy, creditedAt, creditedAt.getTime() + 1000)) balance += 500;
    }
    expect(balance).toBe(200_000);
  });
});