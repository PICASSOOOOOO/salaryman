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

  it("keeps checkout inside the Pledge Store", () => {
    expect(pledge).toContain('switchView("store")');
    expect(pledge).toContain('switchView("prime")');
    expect(pledge).toContain('/api/pledge/checkout');
  });
});