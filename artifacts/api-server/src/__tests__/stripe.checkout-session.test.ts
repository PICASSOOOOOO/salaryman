import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

const { hasFeatureMock } = vi.hoisted(() => ({
  hasFeatureMock: vi.fn(),
}));

vi.mock("../lib/plan", () => ({
  hasFeature: hasFeatureMock,
  grantFeature: vi.fn(),
  revokeFeatureBySubscription: vi.fn(),
  FEATURE_CATALOG: {
    claw_bot: { name: "Automation Pixel Agents", price: 149 },
  },
  isUsdPaidFeature: (value: string) => value === "claw_bot" || value === "phone_system",
  resolveFeatureKey: (value: string) => value === "claw_bot" ? "claw_bot" : undefined,
  PICASSO_START_FIAT: 999_999_999,
}));

vi.mock("@workspace/db", () => ({
  FEATURE_KEYS: ["claw_bot"],
  db: {},
  donationsTable: {},
  fiatTopupsTable: {},
  bankAccountsTable: {},
  bankTransactionsTable: {},
  orgMembersTable: {},
  organizationsTable: {},
  orgFeatureGrantsTable: {},
  botMarketplaceTable: {},
  botSubscriptionsTable: {},
  botsTable: {},
}));

vi.mock("../routes/merch", () => ({ handleMerchWebhookEvent: vi.fn() }));
vi.mock("../routes/salaryman-season", () => ({ handleSeasonPassWebhookEvent: vi.fn() }));
vi.mock("../routes/pledge", () => ({ handlePledgeWebhookEvent: vi.fn() }));
vi.mock("../routes/items", () => ({ handleItemWebhookEvent: vi.fn() }));

import stripeRouter from "../routes/stripe";

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: "prime-user", email: "prime@example.test" };
    (req as any).isAuthenticated = () => true;
    next();
  });
  app.use("/api", stripeRouter);
  return app;
}

describe("POST /stripe/create-checkout-session", () => {
  beforeEach(() => {
    hasFeatureMock.mockReset();
  });

  it("blocks a second PABLO PRIME subscription for an active member", async () => {
    hasFeatureMock.mockResolvedValue(true);

    const res = await request(buildApp())
      .post("/api/stripe/create-checkout-session")
      .send({ feature: "claw_bot" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("already_active");
    expect(hasFeatureMock).toHaveBeenCalledWith("prime-user", "prime@example.test", "claw_bot");
  });
});