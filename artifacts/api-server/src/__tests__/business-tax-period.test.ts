import { describe, expect, it } from "vitest";
import { businessTaxPeriodKey } from "../lib/business-tax";

describe("business tax period persistence", () => {
  it("encodes YYYY-MM as a stable integer for world_kv", () => {
    expect(businessTaxPeriodKey("2026-09")).toBe(202609);
    expect(businessTaxPeriodKey("1999-12")).toBe(199912);
  });

  it("rejects malformed periods rather than corrupting audit state", () => {
    expect(() => businessTaxPeriodKey("2026-9")).toThrow("Invalid business tax period");
    expect(() => businessTaxPeriodKey("September")).toThrow("Invalid business tax period");
  });
});