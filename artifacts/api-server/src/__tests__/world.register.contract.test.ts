import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/routes/world.ts"), "utf8");

describe("world registration auth contract", () => {
  it("requires authentication before checking or writing registry names", () => {
    const route = source.slice(source.indexOf('router.post("/world/register"'));
    const authIndex = route.indexOf("if (!req.user?.id)");
    const registryCheckIndex = route.indexOf('if (finalBizType === "minx" && companyName)');

    expect(authIndex).toBeGreaterThan(-1);
    expect(registryCheckIndex).toBeGreaterThan(authIndex);
    expect(route).toContain('res.status(401).json({ error: "Login required" })');
  });

  it("rejects blank names for business registrations", () => {
    const route = source.slice(source.indexOf('router.post("/world/register"'));
    expect(route).toContain("companyName required for business registration");
  });

  it("requires an industry for real-business registration", () => {
    const route = source.slice(source.indexOf('router.post("/world/register"'));
    expect(route).toContain('finalBizType === "real"');
    expect(route).toContain("A business industry between 1 and 60 characters is required");
  });

  it("saves the selected industry to both the business registry and new organization", () => {
    const route = source.slice(source.indexOf('router.post("/world/register"'));
    expect(route).toContain('industry: finalBizType === "unemployed" ? null');
    expect(route).toContain("industry: industry ? String(industry).trim().slice(0, 60) : null");
  });

  it("keeps a registry row as the unemployment onboarding-complete signal", () => {
    const route = source.slice(source.indexOf('router.post("/world/register"'));
    expect(route).toContain("Unemployed arrivals still need a registry row");
    expect(route).toContain('companyName: finalBizType === "unemployed" ? null');
  });
});