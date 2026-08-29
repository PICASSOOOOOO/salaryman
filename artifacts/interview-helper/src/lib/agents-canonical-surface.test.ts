import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const app = source("src/App.tsx");
const modules = source("src/lib/modules.ts");
const pledge = source("src/pages/PledgeStore.tsx");
const botFactory = source("src/pages/BotFactory.tsx");

describe("canonical agent management surface", () => {
  it("opens the AGENTS module at BotFactory without a Pledge Store tab", () => {
    const agentsModule = modules.slice(modules.indexOf("id: 'bots'"), modules.indexOf("id: 'console'"));
    expect(agentsModule).toContain("defaultPath: '/bots'");
    expect(agentsModule).toContain("AGENT COMMAND CENTER");
    expect(agentsModule).not.toContain("PLEDGE STORE");
  });

  it.each([
    "/console/agents",
    "/intel/agents",
    "/store/bots/vending",
    "/agents",
    "/pledge/agents",
  ])("redirects legacy agent link %s to /bots", (path) => {
    const routeAt = app.indexOf(`path="${path}"`);
    expect(routeAt).toBeGreaterThan(-1);
    expect(app.slice(routeAt, routeAt + 160)).toContain('to="/bots"');
  });

  it("redirects the legacy pledge agents query and keeps normal store rendering", () => {
    expect(app).toContain('params.get("view") === "agents"');
    expect(app).toContain('return <Redirect to="/bots" />');
    expect(app).toContain("return <PledgeStore />");
  });

  it("keeps Pledge Store commerce-only", () => {
    expect(pledge).not.toContain('PixelAgents');
    expect(pledge).not.toContain('switchView("agents")');
    expect(pledge).not.toContain('Meet the Agents');
    expect(pledge).toContain('switchView("store")');
    expect(pledge).toContain('switchView("prime")');
    expect(pledge).toContain('/api/pledge/checkout');
  });

  it("merges agent network status into the management hub", () => {
    expect(botFactory).toContain("import AgentTeam from './AgentTeam'");
    expect(botFactory).toContain("<AgentTeam embedded />");
    expect(botFactory).toContain("AGENT COMMAND CENTER");
  });
});