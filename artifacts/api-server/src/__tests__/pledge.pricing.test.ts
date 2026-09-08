import { describe, it, expect, beforeAll } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import pledgeRouter from "../routes/pledge";

// The catalog + popup routes are public (no auth), so we can mount the pledge
// router bare and hit them directly. This suite is the contract test for the
// CONFIDENTIAL cost-plus pricing: it proves the SECRET cost basis and markup %
// NEVER reach the client, while the derived retail price does.
function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api", pledgeRouter);
  return app;
}

// Same router, but with a synthetic authenticated user injected so we can hit the
// auth-gated /pledge/checkout guard directly. The subscription-item guard returns
// before any DB access, so a fake user id is sufficient.
function buildAuthedApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: "test-pricing-user", email: "nobody@example.test" };
    (req as any).isAuthenticated = () => true;
    next();
  });
  app.use("/api", pledgeRouter);
  return app;
}

// Serialize the whole response and scan it as a string so a leak hidden in a
// nested field (spec, stock, …) is still caught.
function rawText(body: unknown): string {
  return JSON.stringify(body);
}

describe("Pledge Store pricing (cost-plus, secret basis)", () => {
  let app: Express;
  let catalog: { categories: string[]; items: any[] };

  beforeAll(async () => {
    app = buildApp();
    const res = await request(app).get("/api/pledge/catalog");
    expect(res.status).toBe(200);
    catalog = res.body;
  });

  it("never leaks the cost basis or markup to the client", () => {
    const text = rawText(catalog);
    expect(text).not.toContain("costUsd");
    expect(text.toLowerCase()).not.toContain("markup");
    // No internal fulfillment wiring should be serialized either.
    expect(text).not.toContain("bundleOf");
    expect(text).not.toContain("fulfill");
    expect(text).not.toContain("noMarkup");
  });

  it("serves a positive retail price on every item", () => {
    expect(catalog.items.length).toBeGreaterThan(0);
    for (const item of catalog.items) {
      expect(typeof item.priceUsd).toBe("number");
      expect(item.priceUsd).toBeGreaterThan(0);
    }
  });

  it("applies the default 300% markup (retail = cost × 4)", () => {
    // bot_extra_seat cost basis is $25 → retail $100 at the default markup.
    const seat = catalog.items.find((i) => i.id === "bot_extra_seat");
    expect(seat).toBeTruthy();
    expect(seat.priceUsd).toBe(100);
  });

  it("exposes Stripe-backed agents, feature passes, and membership categories", () => {
    expect(catalog.categories).toEqual(["bots", "terminals", "membership"]);
    expect(new Set(catalog.items.map((i) => i.category))).toEqual(new Set(["bots", "terminals", "membership"]));
    expect(catalog.items.find((i) => i.id === "term_pablo_pass")).toBeTruthy();
    expect(catalog.items.find((i) => i.id === "term_phone_pass")).toBeTruthy();
  });

  it("keeps non-agent game goods out of the dollar storefront", () => {
    const forbiddenCategories = new Set(["property", "vehicles", "gear", "bundles", "furniture", "decor"]);
    expect(catalog.items.some((i) => forbiddenCategories.has(i.category))).toBe(false);
    expect(catalog.items.find((i) => i.id === "prop_corner_office")).toBeUndefined();
    expect(catalog.items.find((i) => i.id === "bundle_founder")).toBeUndefined();
  });

  it("rejects direct dollar checkout for in-world goods", async () => {
    const authed = buildAuthedApp();
    const res = await request(authed)
      .post("/api/pledge/checkout")
      .send({ itemId: "prop_corner_office" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Unknown pledge item");
  });

  it("lists PABLO PRIME as an unmarked-up membership subscription", () => {
    expect(catalog.categories).toContain("membership");
    const prime = catalog.items.find((i) => i.id === "membership_pablo_prime");
    expect(prime).toBeTruthy();
    // Listed at face value — NO cost-plus markup applied.
    expect(prime.priceUsd).toBe(149);
    // Flagged so the storefront routes it to the subscription checkout.
    expect(prime.subscriptionFeature).toBe("claw_bot");
    // Still no secret cost/markup leak on this item.
    const text = rawText(prime);
    expect(text).not.toContain("costUsd");
    expect(text).not.toContain("noMarkup");
  });

  it("rejects PABLO PRIME through the one-time pledge checkout", async () => {
    // Subscription listings must go through the subscription checkout, not the
    // one-time pledge path. With an authenticated user the guard returns the
    // specific 400 subscription_item before any charge/free-grant happens.
    const authed = buildAuthedApp();
    const res = await request(authed)
      .post("/api/pledge/checkout")
      .send({ itemId: "membership_pablo_prime" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("subscription_item");
    expect(res.body.subscriptionFeature).toBe("claw_bot");
  });

  it("popup route is also client-safe", async () => {
    const res = await request(app).get("/api/pledge/popup");
    expect(res.status).toBe(200);
    const text = rawText(res.body);
    expect(text).not.toContain("costUsd");
    expect(text.toLowerCase()).not.toContain("markup");
    for (const item of res.body.items) {
      expect(item.priceUsd).toBeGreaterThan(0);
    }
  });
});
