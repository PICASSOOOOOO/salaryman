import { describe, expect, it } from "vitest";
import { BUSINESS_INDUSTRY_GROUPS, BUSINESS_INDUSTRY_OPTIONS, findBusinessIndustry } from "./business-industries";

describe("real-business industry catalog", () => {
  it("offers a detailed, unique selection that fits the organization industry field", () => {
    const values = BUSINESS_INDUSTRY_OPTIONS.map((option) => option.value);

    expect(values.length).toBeGreaterThan(50);
    expect(new Set(values).size).toBe(values.length);
    expect(values.every((value) => value.length <= 60)).toBe(true);
    expect(BUSINESS_INDUSTRY_OPTIONS.every((option) => option.description.trim().length > 20)).toBe(true);
  });

  it("includes real operating sub-industries in each group and supports descriptions", () => {
    expect(BUSINESS_INDUSTRY_GROUPS.length).toBeGreaterThan(15);
    expect(findBusinessIndustry("Technology & telecom — Software / SaaS")?.description).toContain("recurring revenue");
    expect(findBusinessIndustry("Healthcare & life sciences — Primary & specialty care")?.description).toContain("scheduling");
    expect(findBusinessIndustry("Other / multi-industry — Describe in company profile")).toBeDefined();
    expect(findBusinessIndustry("not in the catalog")).toBeUndefined();
  });
});