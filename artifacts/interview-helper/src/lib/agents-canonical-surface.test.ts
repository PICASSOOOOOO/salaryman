import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const app = source("src/App.tsx");
const pledge = source("src/pages/PledgeStore.tsx");

describe("canonical Pixel Agents marketplace surface", () => {
  it.each([
    "/console/agents",
    "/intel/agents",
    "/store/bots/vending",
    "/agents",
    "/pledge/agents",
  ])("redirects legacy agent link %s to /pledge", (path) => {
    const routeAt = app.indexOf(`path="${path}"`);
    expect(routeAt).toBeGreaterThan(-1);
    expect(app.slice(routeAt, routeAt + 160)).toContain('to="/pledge"');
  });

  it("normalizes the legacy pledge agents query to the canonical store", () => {
    expect(app).toContain('params.get("view") === "agents"');
    expect(app).toContain('return <Redirect to="/pledge" />');
    expect(app).toContain("return <PledgeStore />");
  });

  it("keeps monthly membership checkout inside the Pledge Store", () => {
    expect(pledge).toContain('new URLSearchParams(window.location.search).get("view") === "prime"');
    expect(pledge).toContain('/api/stripe/create-checkout-session');
    expect(pledge).not.toContain('/api/pledge/checkout');
  });

  it("keeps /pricing public and returns buyers to the storefront after sign-in", () => {
    const anonymousRoutes = app.slice(
      app.indexOf("const ANON_ALLOWED_PREFIXES"),
      app.indexOf("const ANON_ALLOWED_EXACT"),
    );
    expect(anonymousRoutes).toContain('"/pricing"');
    expect(app).toContain('pathname === "/pricing"');
    expect(app).toContain('<Route path="/pricing" component={PledgeStoreRoute} />');
    expect(pledge).toContain('login(`${window.location.pathname}${window.location.search}`)');
  });
});