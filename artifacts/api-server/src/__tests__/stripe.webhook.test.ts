import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { db, fiatTopupsTable, phoneNumberPurchasesTable, usersTable, bankAccountsTable, bankTransactionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

// ─── Hoisted mock handles ─────────────────────────────────────────────────────
// vi.hoisted runs before module resolution so these refs are available inside
// every vi.mock factory below (factories are hoisted before imports).
const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  subscriptionsRetrieve: vi.fn(),
  grantFeature: vi.fn().mockResolvedValue(undefined),
  revokeFeatureBySubscription: vi.fn().mockResolvedValue(null),
  handlePledgeWebhookEvent: vi.fn().mockResolvedValue(undefined),
  handleMerchWebhookEvent: vi.fn().mockResolvedValue(undefined),
  handleSeasonPassWebhookEvent: vi.fn().mockResolvedValue(undefined),
  handleItemWebhookEvent: vi.fn().mockResolvedValue(undefined),
  provisionPaidPhoneNumber: vi.fn().mockResolvedValue({ sid: "PNpaid", phoneNumber: "+15558881111" }),
  assertPhoneNumberAvailable: vi.fn().mockResolvedValue(undefined),
  canUsePlatformTwilio: vi.fn().mockResolvedValue(false),
  hasFeature: vi.fn().mockResolvedValue(true),
  checkoutCreate: vi.fn(),
}));

// ─── Module mocks ─────────────────────────────────────────────────────────────

// Stripe SDK: use a real function (not an arrow) so `new Stripe(key)` returns
// the mock instance without a "function or class" vitest warning.
vi.mock("stripe", () => ({
  default: vi.fn(function StripeConstructor() {
    return {
      webhooks: { constructEvent: mocks.constructEvent },
      subscriptions: { retrieve: mocks.subscriptionsRetrieve },
      checkout: { sessions: { create: mocks.checkoutCreate } },
      products: {
        search: vi.fn().mockResolvedValue({ data: [{ id: "prod_phone" }] }),
        create: vi.fn(),
      },
      prices: {
        list: vi.fn().mockResolvedValue({ data: [{ id: "price_phone", currency: "usd", unit_amount: 1000 }] }),
        create: vi.fn(),
      },
    };
  }),
}));

// plan.ts: spy on the write paths while keeping pure helpers (resolveFeatureKey,
// FEATURE_CATALOG, FEATURE_KEYS, etc.) from the real module.
vi.mock("../lib/plan", async (importActual) => {
  const actual = await importActual<typeof import("../lib/plan")>();
  return {
    ...actual,
    grantFeature: mocks.grantFeature,
    revokeFeatureBySubscription: mocks.revokeFeatureBySubscription,
    hasFeature: mocks.hasFeature,
  };
});

// Route handler mocks: replace only the named exports that the stripe router
// calls. Using plain objects avoids loading the full route module (with its
// Stripe / DB side-effects) during stripe.ts's import phase.
vi.mock("../routes/pledge", () => ({
  handlePledgeWebhookEvent: mocks.handlePledgeWebhookEvent,
  default: express.Router(),
}));

vi.mock("../routes/merch", () => ({
  handleMerchWebhookEvent: mocks.handleMerchWebhookEvent,
  default: express.Router(),
}));

vi.mock("../routes/salaryman-season", () => ({
  handleSeasonPassWebhookEvent: mocks.handleSeasonPassWebhookEvent,
  default: express.Router(),
}));

vi.mock("../routes/items", () => ({
  handleItemWebhookEvent: mocks.handleItemWebhookEvent,
  default: express.Router(),
}));

vi.mock("../lib/phone-number-service", () => ({
  provisionPaidPhoneNumber: mocks.provisionPaidPhoneNumber,
  assertPhoneNumberAvailable: mocks.assertPhoneNumberAvailable,
}));

vi.mock("../lib/platform-twilio-access", () => ({
  canUsePlatformTwilio: mocks.canUsePlatformTwilio,
}));

// ─── Test app ─────────────────────────────────────────────────────────────────

import stripeRouter from "../routes/stripe";

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).isAuthenticated = () => true;
    (req as any).user = { id: TEST_USER, email: "test@example.com" };
    next();
  });
  app.use("/api", stripeRouter);
  // Surface unhandled errors as JSON so we can read them in test assertions.
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: err.message });
  });
  return app;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(type: string, sessionObj: Record<string, unknown>) {
  return {
    id: `evt_test_${Math.random().toString(36).slice(2)}`,
    object: "event",
    type,
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    pending_webhooks: 1,
    request: null,
    data: { object: sessionObj },
  };
}

function sendWebhook(app: Express, event: unknown) {
  // The webhook route uses the `raw` body-parser middleware; supertest's
  // .send(Buffer) delivers raw bytes so the existing signature path runs
  // (signature itself is bypassed via the constructEvent mock).
  const body = Buffer.from(JSON.stringify(event));
  return request(app)
    .post("/api/stripe/webhook")
    .set("Content-Type", "application/json")
    .set("stripe-signature", "t=1,v1=test_sig")
    .send(body);
}

const TEST_USER = "user_webhook_test_001";
const TEST_SUB  = "sub_webhook_test_001";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /stripe/webhook", () => {
  let app: Express;

  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY      = "sk_test_placeholder";
    process.env.STRIPE_WEBHOOK_SECRET  = "whsec_test_placeholder";
    // Feature price env vars — used both to verify FEATURE_PRICE_ENV wiring
    // and to drive event metadata throughout the tests.
    process.env.STRIPE_PRICE_CLAW_BOT     = "price_test_claw_bot";
    process.env.STRIPE_PRICE_PHONE_SYSTEM = "price_test_phone_system";
    process.env.STRIPE_PRICE_LIVE_LISTEN  = "price_test_live_listen";
    await db.insert(usersTable).values({ id: TEST_USER, email: "stripe-phone-test@example.invalid" }).onConflictDoNothing();
    app = buildApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Restore defaults that clearAllMocks() would have cleared.
    mocks.grantFeature.mockResolvedValue(undefined);
    mocks.revokeFeatureBySubscription.mockResolvedValue(null);
    mocks.handlePledgeWebhookEvent.mockResolvedValue(undefined);
    mocks.handleMerchWebhookEvent.mockResolvedValue(undefined);
    mocks.handleSeasonPassWebhookEvent.mockResolvedValue(undefined);
    mocks.handleItemWebhookEvent.mockResolvedValue(undefined);
    mocks.provisionPaidPhoneNumber.mockResolvedValue({ sid: "PNpaid", phoneNumber: "+15558881111" });
    mocks.hasFeature.mockResolvedValue(true);
    mocks.canUsePlatformTwilio.mockResolvedValue(true);
    mocks.checkoutCreate.mockResolvedValue({ id: `cs_checkout_${Date.now()}`, url: "https://checkout.example/session" });
    // Default: constructEvent succeeds and returns a minimal no-op event so
    // tests that don't need a specific event still get a 200.
    mocks.constructEvent.mockReturnValue(makeEvent("unknown.event", {}));
  });

  // ── Guard rails ─────────────────────────────────────────────────────────────

  it("400 when stripe-signature header is absent", async () => {
    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("Content-Type", "application/json")
      .send(Buffer.from("{}"));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/signature/i);
  });

  it("400 when constructEvent throws (tampered payload / bad signature)", async () => {
    mocks.constructEvent.mockImplementationOnce(function () {
      throw new Error("No signatures found matching the expected signature for payload");
    });
    const res = await sendWebhook(app, makeEvent("checkout.session.completed", {}));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/signature/i);
  });

  it("200 { received: true } for an acknowledged but unhandled event type", async () => {
    const event = makeEvent("payment_intent.created", { id: "pi_test" });
    mocks.constructEvent.mockReturnValueOnce(event);
    const res = await sendWebhook(app, event);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  // ── Subscription feature grant ───────────────────────────────────────────────

  it("rejects number checkout for a subscribed but platform-unauthorized user", async () => {
    mocks.canUsePlatformTwilio.mockResolvedValueOnce(false);
    const res = await request(app).post("/api/stripe/create-phone-number-session").send({
      phoneNumber: "+15558881111",
      countryCode: "US",
      requestId: "request-unauthorized-1",
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("TWILIO_ORG_RESTRICTED");
    expect(mocks.assertPhoneNumberAvailable).not.toHaveBeenCalled();
  });

  it("allows only one outstanding checkout reservation per number", async () => {
    const phoneNumber = "+15558882222";
    const previousBaseUrl = process.env.APP_BASE_URL;
    process.env.APP_BASE_URL = "https://phone.example";
    mocks.canUsePlatformTwilio.mockResolvedValue(true);
    const first = await request(app).post("/api/stripe/create-phone-number-session").send({
      phoneNumber,
      countryCode: "US",
      requestId: "request-reserve-first",
    });
    const second = await request(app).post("/api/stripe/create-phone-number-session").send({
      phoneNumber,
      countryCode: "US",
      requestId: "request-reserve-second",
    });
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(second.status).toBe(409);
    expect(mocks.checkoutCreate).toHaveBeenCalledTimes(1);
    await db.delete(phoneNumberPurchasesTable).where(eq(phoneNumberPurchasesTable.phoneNumber, phoneNumber));
    if (previousBaseUrl === undefined) delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = previousBaseUrl;
  });

  it("fulfils a paid custom number exactly once across duplicate webhooks", async () => {
    const sessionId = `cs_phone_${Date.now()}`;
    const event = makeEvent("checkout.session.completed", {
      id: sessionId,
      payment_status: "paid",
      amount_total: 1000,
      currency: "usd",
      client_reference_id: TEST_USER,
      metadata: {
        type: "phone_number",
        userId: TEST_USER,
        phoneNumber: "+15558881111",
        countryCode: "US",
        label: "sales",
      },
    });
    mocks.constructEvent.mockReturnValue(event);
    expect((await sendWebhook(app, event)).status).toBe(200);
    expect((await sendWebhook(app, event)).status).toBe(200);
    expect(mocks.provisionPaidPhoneNumber).toHaveBeenCalledTimes(1);
    const [row] = await db.select().from(phoneNumberPurchasesTable)
      .where(eq(phoneNumberPurchasesTable.stripeSessionId, sessionId));
    expect(row.status).toBe("completed");
    expect(row.twilioSid).toBe("PNpaid");
    await db.delete(phoneNumberPurchasesTable)
      .where(eq(phoneNumberPurchasesTable.stripeSessionId, sessionId));
  });

  it.each([
    ["checkout.session.expired", "cancelled"],
    ["checkout.session.async_payment_failed", "failed"],
  ])("releases a number reservation when %s", async (eventType, expectedStatus) => {
    const sessionId = `cs_terminal_${eventType}_${Date.now()}`;
    await db.insert(phoneNumberPurchasesTable).values({
      userId: TEST_USER,
      stripeSessionId: sessionId,
      phoneNumber: "+15558885555",
      countryCode: "US",
    });
    const event = makeEvent(eventType, {
      id: sessionId,
      metadata: { type: "phone_number", userId: TEST_USER },
    });
    mocks.constructEvent.mockReturnValue(event);
    expect((await sendWebhook(app, event)).status).toBe(200);
    const [row] = await db.select().from(phoneNumberPurchasesTable)
      .where(eq(phoneNumberPurchasesTable.stripeSessionId, sessionId));
    expect(row.status).toBe(expectedStatus);
    await db.delete(phoneNumberPurchasesTable)
      .where(eq(phoneNumberPurchasesTable.stripeSessionId, sessionId));
  });

  it("does not provision after Phone System authorization is revoked", async () => {
    const sessionId = `cs_revoked_${Date.now()}`;
    const event = makeEvent("checkout.session.completed", {
      id: sessionId,
      payment_status: "paid",
      amount_total: 1000,
      currency: "usd",
      client_reference_id: TEST_USER,
      metadata: {
        type: "phone_number", userId: TEST_USER, phoneNumber: "+15558886666",
        countryCode: "US", label: "sales",
      },
    });
    mocks.hasFeature.mockResolvedValueOnce(false);
    mocks.constructEvent.mockReturnValue(event);
    expect((await sendWebhook(app, event)).status).toBe(200);
    expect(mocks.provisionPaidPhoneNumber).not.toHaveBeenCalled();
    const [row] = await db.select().from(phoneNumberPurchasesTable)
      .where(eq(phoneNumberPurchasesTable.stripeSessionId, sessionId));
    expect(row.status).toBe("authorization_failed");
    await db.delete(phoneNumberPurchasesTable)
      .where(eq(phoneNumberPurchasesTable.stripeSessionId, sessionId));
  });

  it("resumes an interrupted processing purchase whose Twilio SID was already persisted", async () => {
    const sessionId = `cs_resume_${Date.now()}`;
    await db.insert(phoneNumberPurchasesTable).values({
      userId: TEST_USER,
      stripeSessionId: sessionId,
      phoneNumber: "+15558887777",
      countryCode: "US",
      status: "processing",
      twilioSid: "PNalready-acquired",
    });
    const event = makeEvent("checkout.session.completed", {
      id: sessionId,
      payment_status: "paid",
      amount_total: 1000,
      currency: "usd",
      client_reference_id: TEST_USER,
      metadata: {
        type: "phone_number", userId: TEST_USER, phoneNumber: "+15558887777",
        countryCode: "US", label: "recovered",
      },
    });
    mocks.provisionPaidPhoneNumber.mockResolvedValueOnce({
      sid: "PNalready-acquired",
      phoneNumber: "+15558887777",
    });
    mocks.constructEvent.mockReturnValue(event);
    expect((await sendWebhook(app, event)).status).toBe(200);
    expect(mocks.provisionPaidPhoneNumber).toHaveBeenCalledWith(expect.objectContaining({
      stripeSessionId: sessionId,
      phoneNumber: "+15558887777",
    }));
    const [row] = await db.select().from(phoneNumberPurchasesTable)
      .where(eq(phoneNumberPurchasesTable.stripeSessionId, sessionId));
    expect(row.status).toBe("completed");
    expect(row.twilioSid).toBe("PNalready-acquired");
    await db.delete(phoneNumberPurchasesTable)
      .where(eq(phoneNumberPurchasesTable.stripeSessionId, sessionId));
  });

  describe("checkout.session.completed — subscription feature grant", () => {
    it("calls grantFeature(userId, 'claw_bot', ...) for a PABLO PRIME subscription", async () => {
      const event = makeEvent("checkout.session.completed", {
        id: "cs_test_prime",
        payment_status: "paid",
        mode: "subscription",
        client_reference_id: TEST_USER,
        // A string subscription ID is the common case for checkout sessions.
        subscription: TEST_SUB,
        metadata: {
          // No `type` key → bypasses pledge / merch / item branches and reaches
          // the feature-grant branch (userId + feature + FEATURE_KEYS check).
          feature: "claw_bot",
        },
      });
      mocks.constructEvent.mockReturnValueOnce(event);

      const res = await sendWebhook(app, event);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
      expect(mocks.grantFeature).toHaveBeenCalledOnce();
      expect(mocks.grantFeature).toHaveBeenCalledWith(
        TEST_USER,
        "claw_bot",
        expect.any(String),   // grantedBy (defaults to "stripe")
        TEST_SUB,
      );
    });

    it("uses metadata.userId when client_reference_id is absent", async () => {
      const event = makeEvent("checkout.session.completed", {
        id: "cs_test_meta_uid",
        payment_status: "paid",
        mode: "subscription",
        client_reference_id: null,
        subscription: TEST_SUB,
        metadata: { userId: TEST_USER, feature: "claw_bot" },
      });
      mocks.constructEvent.mockReturnValueOnce(event);

      await sendWebhook(app, event);

      expect(mocks.grantFeature).toHaveBeenCalledWith(
        TEST_USER, "claw_bot", expect.any(String), TEST_SUB,
      );
    });

    it("calls grantFeature with 'phone_system' — driven by STRIPE_PRICE_PHONE_SYSTEM env var", async () => {
      // The price ID stored in process.env.STRIPE_PRICE_PHONE_SYSTEM is the
      // identifier Stripe sends back; using it here keeps the mock event
      // consistent with how real checkout sessions are created.
      expect(process.env.STRIPE_PRICE_PHONE_SYSTEM).toBe("price_test_phone_system");

      const event = makeEvent("checkout.session.completed", {
        id: "cs_test_phone",
        payment_status: "paid",
        mode: "subscription",
        client_reference_id: TEST_USER,
        subscription: TEST_SUB,
        metadata: { feature: "phone_system" },
      });
      mocks.constructEvent.mockReturnValueOnce(event);

      await sendWebhook(app, event);

      expect(mocks.grantFeature).toHaveBeenCalledWith(
        TEST_USER, "phone_system", expect.any(String), TEST_SUB,
      );
    });

    it("calls grantFeature with 'live_listen' — driven by STRIPE_PRICE_LIVE_LISTEN env var", async () => {
      expect(process.env.STRIPE_PRICE_LIVE_LISTEN).toBe("price_test_live_listen");

      const event = makeEvent("checkout.session.completed", {
        id: "cs_test_live",
        payment_status: "paid",
        mode: "subscription",
        client_reference_id: TEST_USER,
        subscription: TEST_SUB,
        metadata: { feature: "live_listen" },
      });
      mocks.constructEvent.mockReturnValueOnce(event);

      await sendWebhook(app, event);

      expect(mocks.grantFeature).toHaveBeenCalledWith(
        TEST_USER, "live_listen", expect.any(String), TEST_SUB,
      );
    });

    it("does NOT call grantFeature when userId is missing", async () => {
      const event = makeEvent("checkout.session.completed", {
        id: "cs_test_no_uid",
        payment_status: "paid",
        mode: "subscription",
        client_reference_id: null,
        subscription: TEST_SUB,
        metadata: { feature: "claw_bot" },
        // No metadata.userId either
      });
      mocks.constructEvent.mockReturnValueOnce(event);

      const res = await sendWebhook(app, event);

      expect(res.status).toBe(200);
      expect(mocks.grantFeature).not.toHaveBeenCalled();
    });

    it("passes a custom grantedBy value from session metadata", async () => {
      const event = makeEvent("checkout.session.completed", {
        id: "cs_test_grantedby",
        payment_status: "paid",
        mode: "subscription",
        client_reference_id: TEST_USER,
        subscription: TEST_SUB,
        metadata: { feature: "claw_bot", grantedBy: "admin-override" },
      });
      mocks.constructEvent.mockReturnValueOnce(event);

      await sendWebhook(app, event);

      expect(mocks.grantFeature).toHaveBeenCalledWith(
        TEST_USER, "claw_bot", "admin-override", TEST_SUB,
      );
    });
  });

  // ── One-time pledge purchase ─────────────────────────────────────────────────

  describe("checkout.session.completed — one-time pledge purchase", () => {
    it("routes type=pledge to handlePledgeWebhookEvent and never calls grantFeature", async () => {
      const event = makeEvent("checkout.session.completed", {
        id: "cs_test_pledge",
        payment_status: "paid",
        mode: "payment",
        client_reference_id: TEST_USER,
        metadata: {
          type: "pledge",
          userId: TEST_USER,
          itemId: "prop_corner_office",
          category: "property",
          limited: "0",
        },
      });
      mocks.constructEvent.mockReturnValueOnce(event);

      const res = await sendWebhook(app, event);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
      // Fulfillment delegated to the dedicated pledge handler.
      expect(mocks.handlePledgeWebhookEvent).toHaveBeenCalledOnce();
      expect(mocks.handlePledgeWebhookEvent).toHaveBeenCalledWith(event);
      // No direct feature grant — pledge grants entitlements internally.
      expect(mocks.grantFeature).not.toHaveBeenCalled();
    });

    it("type=pledge branch takes priority even when metadata.feature is also present", async () => {
      // Edge-case: a rogue `feature` key on a pledge session must not trigger a
      // free feature grant — the explicit `type` dispatch runs first.
      const event = makeEvent("checkout.session.completed", {
        id: "cs_test_pledge_feat",
        payment_status: "paid",
        mode: "payment",
        client_reference_id: TEST_USER,
        metadata: { type: "pledge", itemId: "furn_standing_desks", feature: "claw_bot" },
      });
      mocks.constructEvent.mockReturnValueOnce(event);

      await sendWebhook(app, event);

      expect(mocks.handlePledgeWebhookEvent).toHaveBeenCalledOnce();
      expect(mocks.grantFeature).not.toHaveBeenCalled();
    });

    it("checkout.session.async_payment_succeeded (type=pledge) also routes to handlePledgeWebhookEvent", async () => {
      const event = makeEvent("checkout.session.async_payment_succeeded", {
        id: "cs_test_async_pledge",
        payment_status: "paid",
        client_reference_id: TEST_USER,
        metadata: { type: "pledge", itemId: "sup_espresso" },
      });
      mocks.constructEvent.mockReturnValueOnce(event);

      const res = await sendWebhook(app, event);

      expect(res.status).toBe(200);
      expect(mocks.handlePledgeWebhookEvent).toHaveBeenCalledWith(event);
      expect(mocks.grantFeature).not.toHaveBeenCalled();
    });
  });

  // ── Subscription cancellation / revocation ───────────────────────────────────

  describe("customer.subscription.deleted — feature revocation", () => {
    it("calls revokeFeatureBySubscription with the subscription ID", async () => {
      // deactivateBotSubscription (internal to stripe.ts) queries the DB; when
      // TEST_SUB doesn't exist in botSubscriptionsTable it returns null and
      // falls through to revokeFeatureBySubscription (which is mocked).
      mocks.revokeFeatureBySubscription.mockResolvedValueOnce(TEST_USER);

      const event = makeEvent("customer.subscription.deleted", {
        id: TEST_SUB,
        object: "subscription",
        status: "canceled",
      });
      mocks.constructEvent.mockReturnValueOnce(event);

      const res = await sendWebhook(app, event);

      expect(res.status).toBe(200);
      expect(mocks.revokeFeatureBySubscription).toHaveBeenCalledWith(TEST_SUB);
    });

    it("returns 200 when the subscription ID is not found in either ledger", async () => {
      mocks.revokeFeatureBySubscription.mockResolvedValueOnce(null);

      const event = makeEvent("customer.subscription.deleted", {
        id: "sub_completely_unknown",
        object: "subscription",
        status: "canceled",
      });
      mocks.constructEvent.mockReturnValueOnce(event);

      const res = await sendWebhook(app, event);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });
  });

  // ── Real-money FIAT top-up fulfilment (real dev DB, like sub.deleted) ─────────
  // fulfilFiatTopup (internal to stripe.ts) credits the server bank against the
  // real DB, so this exercises actual rows under a synthetic, scoped userId and
  // cleans up after itself. Proves: credits checking ƒ exactly once and is
  // idempotent across duplicate webhook deliveries.
  describe("checkout.session.completed — fiat_topup", () => {
    const TOPUP_USER = `test-topup-user-${Date.now()}`;
    const SESSION_ID = `cs_test_topup_${Date.now()}`;
    const FIAT_AMOUNT = 5000;

    afterAll(async () => {
      // accountId of any checking row we created, then purge tx + account + topup.
      const accts = await db
        .select()
        .from(bankAccountsTable)
        .where(eq(bankAccountsTable.userId, TOPUP_USER));
      for (const a of accts) {
        await db.delete(bankTransactionsTable).where(eq(bankTransactionsTable.accountId, a.id));
      }
      await db.delete(bankAccountsTable).where(eq(bankAccountsTable.userId, TOPUP_USER));
      await db.delete(fiatTopupsTable).where(eq(fiatTopupsTable.userId, TOPUP_USER));
    });

    function topupEvent() {
      return makeEvent("checkout.session.completed", {
        id: SESSION_ID,
        object: "checkout.session",
        client_reference_id: TOPUP_USER,
        payment_status: "paid",
        metadata: { userId: TOPUP_USER, type: "fiat_topup", packId: "topup_5000", fiatAmount: String(FIAT_AMOUNT) },
      });
    }

    async function checkingBalance(): Promise<number | null> {
      const [acct] = await db
        .select()
        .from(bankAccountsTable)
        .where(and(eq(bankAccountsTable.userId, TOPUP_USER), eq(bankAccountsTable.kind, "checking")))
        .limit(1);
      return acct ? acct.balance : null;
    }

    it("credits the server bank checking account exactly once and marks the row completed", async () => {
      // Pre-insert the pending row the create-topup-session route would have made.
      await db.insert(fiatTopupsTable).values({
        userId: TOPUP_USER,
        stripeSessionId: SESSION_ID,
        packId: "topup_5000",
        amountCents: 500,
        fiatAmount: FIAT_AMOUNT,
        status: "pending",
      });

      const event = topupEvent();
      mocks.constructEvent.mockReturnValueOnce(event);
      const res = await sendWebhook(app, event);

      expect(res.status).toBe(200);
      expect(await checkingBalance()).toBe(200_000 + FIAT_AMOUNT);

      const [row] = await db
        .select()
        .from(fiatTopupsTable)
        .where(eq(fiatTopupsTable.stripeSessionId, SESSION_ID));
      expect(row.status).toBe("completed");
      expect(row.completedAt).not.toBeNull();
    });

    it("is idempotent: a duplicate webhook delivery does not double-credit", async () => {
      const event = topupEvent();
      mocks.constructEvent.mockReturnValueOnce(event);
      const res = await sendWebhook(app, event);

      expect(res.status).toBe(200);
      // Still exactly one credit's worth — the conditional pending→completed
      // update no longer matches, so no second credit fires.
      expect(await checkingBalance()).toBe(200_000 + FIAT_AMOUNT);
    });

    it("leaves an unpaid completed checkout pending until async settlement succeeds", async () => {
      const delayedId = `${SESSION_ID}_delayed`;
      await db.insert(fiatTopupsTable).values({
        userId: TOPUP_USER,
        stripeSessionId: delayedId,
        packId: "topup_5000",
        amountCents: 500,
        fiatAmount: FIAT_AMOUNT,
        status: "pending",
      });
      const before = await checkingBalance();
      const unpaid = makeEvent("checkout.session.completed", {
        id: delayedId,
        object: "checkout.session",
        client_reference_id: TOPUP_USER,
        payment_status: "unpaid",
        metadata: { userId: TOPUP_USER, type: "fiat_topup" },
      });
      mocks.constructEvent.mockReturnValueOnce(unpaid);
      expect((await sendWebhook(app, unpaid)).status).toBe(200);
      expect(await checkingBalance()).toBe(before);

      const settled = makeEvent("checkout.session.async_payment_succeeded", {
        id: delayedId,
        object: "checkout.session",
        client_reference_id: TOPUP_USER,
        payment_status: "paid",
        metadata: { userId: TOPUP_USER, type: "fiat_topup" },
      });
      mocks.constructEvent.mockReturnValueOnce(settled);
      expect((await sendWebhook(app, settled)).status).toBe(200);
      expect(await checkingBalance()).toBe((before ?? 0) + FIAT_AMOUNT);
    });

    it("marks delayed failures and expired checkouts terminal without crediting FIAT", async () => {
      const before = await checkingBalance();
      for (const [suffix, eventType, expectedStatus] of [
        ["failed", "checkout.session.async_payment_failed", "failed"],
        ["expired", "checkout.session.expired", "cancelled"],
      ] as const) {
        const id = `${SESSION_ID}_${suffix}`;
        await db.insert(fiatTopupsTable).values({
          userId: TOPUP_USER,
          stripeSessionId: id,
          packId: "topup_500",
          amountCents: 50,
          fiatAmount: 500,
          status: "pending",
        });
        const event = makeEvent(eventType, {
          id,
          object: "checkout.session",
          client_reference_id: TOPUP_USER,
          payment_status: "unpaid",
          metadata: { userId: TOPUP_USER, type: "fiat_topup" },
        });
        mocks.constructEvent.mockReturnValueOnce(event);
        expect((await sendWebhook(app, event)).status).toBe(200);
        const [row] = await db.select().from(fiatTopupsTable).where(eq(fiatTopupsTable.stripeSessionId, id));
        expect(row.status).toBe(expectedStatus);
      }
      expect(await checkingBalance()).toBe(before);
    });

    it("reconciles and credits a paid signed session even if its pending row was missing", async () => {
      const before = await checkingBalance();
      const id = `${SESSION_ID}_reconcile`;
      const event = makeEvent("checkout.session.completed", {
        id,
        object: "checkout.session",
        client_reference_id: TOPUP_USER,
        payment_status: "paid",
        amount_total: 500,
        currency: "usd",
        metadata: { userId: TOPUP_USER, packId: "topup_5000", type: "fiat_topup" },
      });
      mocks.constructEvent.mockReturnValueOnce(event);
      expect((await sendWebhook(app, event)).status).toBe(200);
      expect(await checkingBalance()).toBe((before ?? 0) + FIAT_AMOUNT);
      const [row] = await db.select().from(fiatTopupsTable).where(eq(fiatTopupsTable.stripeSessionId, id));
      expect(row.status).toBe("completed");
    });
  });
});
