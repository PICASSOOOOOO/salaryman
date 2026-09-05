import { describe, expect, it } from "vitest";
import { PROPERTY_CONTRACT_GRACE_PERIOD_DAYS, advancePropertyContractDueDate, propertyContractGraceEndsAt, propertyContractStatusAt } from "./property-market";

describe("property contract lifecycle primitives", () => {
  it("advances calendar months without drifting end-of-month due dates", () => {
    expect(advancePropertyContractDueDate(new Date("2024-01-31T12:00:00Z")).toISOString()).toBe("2024-02-29T12:00:00.000Z");
    expect(advancePropertyContractDueDate(new Date("2023-01-31T12:00:00Z")).toISOString()).toBe("2023-02-28T12:00:00.000Z");
  });
  it("transitions due contracts through grace and default, leaving closed records closed", () => {
    const due = new Date("2025-01-01T00:00:00Z");
    const grace = propertyContractGraceEndsAt(due);
    expect(grace.getTime() - due.getTime()).toBe(PROPERTY_CONTRACT_GRACE_PERIOD_DAYS * 86_400_000);
    expect(propertyContractStatusAt("active", due, null, new Date("2025-01-02T00:00:00Z"))).toBe("delinquent");
    expect(propertyContractStatusAt("delinquent", due, grace, grace)).toBe("defaulted");
    expect(propertyContractStatusAt("terminated", due, grace, new Date("2025-02-01T00:00:00Z"))).toBe("terminated");
  });
});