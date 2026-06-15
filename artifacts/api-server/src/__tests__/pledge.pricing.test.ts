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
    // prop_corner_office cost basis is $49 → retail $196 at the default markup.
    const office = catalog.items.find((i) => i.id === "prop_corner_office");
    expect(office).toBeTruthy();
    expect(office.priceUsd).toBe(196);
  });

  it("exposes the gear and bundles categories", () => {
    expect(catalog.categories).toContain("gear");
    expect(catalog.categories).toContain("bundles");
  });

  it("lists consolidated Armory gear and bundle products", () => {
    const gear = catalog.items.filter((i) => i.category === "gear");
    const bundles = catalog.items.filter((i) => i.category === "bundles");
    expect(gear.length).toBeGreaterThan(0);
    expect(bundles.length).toBeGreaterThan(0);
    // Bundles describe their member items in the effect copy.
    const founder = bundles.find((b) => b.id === "bundle_founder");
    expect(founder).toBeTruthy();
    expect(founder.effect).toContain("Includes:");
  });

  it("prices bundles below the sum of their members (bundle discount)", () => {
    const founder = catalog.items.find((i) => i.id === "bundle_founder");
    const members = ["prop_corner_office", "furn_standing_desks", "sup_espresso", "decor_neon"];
    const sumMembers = members.reduce((t, id) => {
      const m = catalog.items.find((i) => i.id === id);
      expect(m).toBeTruthy();
      return t + m.priceUsd;
    }, 0);
    expect(founder.priceUsd).toBeLessThan(sumMembers);
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
