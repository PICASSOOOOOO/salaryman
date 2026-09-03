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

  it("keeps unemployment onboarding out of the business registry", () => {
    const route = source.slice(source.indexOf('router.post("/world/register"'));
    expect(route).toContain("Unemployment onboarding does not create a registry entry");
  });
});