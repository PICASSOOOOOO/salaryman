import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/pages/Game/Bank.tsx", "utf8");

describe("Banco Ombra debt workspace", () => {
  it("promotes debt to a dedicated terminal tab with a direct URL", () => {
    expect(source).toContain('["debt",       "DEBT",       FileWarning]');
    expect(source).toContain('requested === "debt"');
    expect(source).toContain('tab === "debt"');
    expect(source).not.toContain('["credit",     "CREDIT"');
  });

  it("offers the same server-backed debt management actions as the ATM", () => {
    expect(source).toContain('"/api/credit/plan/enroll"');
    expect(source).toContain('"/api/credit/plan/pay"');
    expect(source).toContain('"/api/credit/plan/payoff"');
    expect(source).toContain("PAY INSTALLMENT");
    expect(source).toContain("PAY OFF IN FULL");
  });

  it("refreshes both bank balances and debt state after mutations", () => {
    expect(source).toContain("Promise.all([refresh(), refreshCredit()])");
    expect(source).toContain("onChanged={refreshDebtWorkspace}");
  });
});