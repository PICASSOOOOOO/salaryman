import { describe, it, expect } from "vitest";
import {
  chargeUnitsForCostCents,
  fiatCostForChargeUnits,
  batteryCapacity,
  isBattery,
  STARTER_BATTERY_ID,
  SELL_REFUND_PCT,
  ASSISTANT_TARGET_ID,
} from "../lib/battery";
import { PABLO_TAX_MARKUP, FIAT_PER_USD } from "../lib/pablo-tax";
import { ELECTRICITY_RATE_FIAT_PER_UNIT } from "../lib/utility-catalog";

// These are the pure conversion + spec helpers at the heart of the battery
// system. They must stay tied to the SAME markup the legacy meter used so a
// burned charge settles the metered AI cost exactly (no separate Pablo Tax).
describe("chargeUnitsForCostCents", () => {
  it("converts a raw provider cost into charge units worth the marked-up ƒ", () => {
    // markedUp$ = cents * markup / 100; ƒ = markedUp$ * FIAT_PER_USD; units = ƒ / rate.
    const cents = 100;
    const expected = ((cents * PABLO_TAX_MARKUP) / 100) * FIAT_PER_USD / ELECTRICITY_RATE_FIAT_PER_UNIT;
    expect(chargeUnitsForCostCents(cents)).toBeCloseTo(expected, 6);
  });

  it("is exactly the inverse of fiatCostForChargeUnits at the electricity rate (round-trip ƒ)", () => {
    // The ƒ a player pays to buy N units must equal the marked-up cost the burn
    // of N units settles — that is the whole 'charge IS the AI bill' contract.
    const cents = 50;
    const units = chargeUnitsForCostCents(cents);
    const markedUpFiat = (cents * PABLO_TAX_MARKUP) / 100 * FIAT_PER_USD;
    // fiatCostForChargeUnits ceils, so it is within 1 ƒ of the marked-up cost.
    expect(fiatCostForChargeUnits(units)).toBeGreaterThanOrEqual(Math.floor(markedUpFiat));
    expect(fiatCostForChargeUnits(units)).toBeLessThanOrEqual(Math.ceil(markedUpFiat));
  });

  it("clamps a negative cost to zero units", () => {
    expect(chargeUnitsForCostCents(-10)).toBe(0);
  });

  it("honours a custom markup override", () => {
    const cents = 100;
    expect(chargeUnitsForCostCents(cents, 1)).toBeCloseTo(
      (cents / 100) * FIAT_PER_USD / ELECTRICITY_RATE_FIAT_PER_UNIT,
      6,
    );
  });
});

describe("fiatCostForChargeUnits", () => {
  it("charges the electricity rate per unit, rounded up", () => {
    expect(fiatCostForChargeUnits(20)).toBe(Math.ceil(20 * ELECTRICITY_RATE_FIAT_PER_UNIT));
  });
  it("is zero for zero or negative units", () => {
    expect(fiatCostForChargeUnits(0)).toBe(0);
    expect(fiatCostForChargeUnits(-5)).toBe(0);
  });
});

describe("battery specs", () => {
  it("reports capacity for known batteries and 0 otherwise", () => {
    expect(batteryCapacity("batt_aa")).toBe(20);
    expect(batteryCapacity("batt_cell")).toBe(120);
    expect(batteryCapacity("batt_fusion")).toBe(1200);
    expect(batteryCapacity("not_a_battery")).toBe(0);
  });

  it("identifies batteries vs non-batteries", () => {
    expect(isBattery("batt_aa")).toBe(true);
    expect(isBattery("batt_fusion")).toBe(true);
    expect(isBattery("fuel_can")).toBe(false);
    expect(isBattery("")).toBe(false);
  });

  it("exposes the starter cell + sell-refund constants", () => {
    expect(STARTER_BATTERY_ID).toBe("batt_aa");
    expect(batteryCapacity(STARTER_BATTERY_ID)).toBeGreaterThan(0);
    expect(SELL_REFUND_PCT).toBeGreaterThan(0);
    expect(SELL_REFUND_PCT).toBeLessThanOrEqual(1);
    expect(ASSISTANT_TARGET_ID).toBe("assistant");
  });
});
