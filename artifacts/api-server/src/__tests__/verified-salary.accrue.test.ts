import { describe, it, expect } from "vitest";
import { accrueWholeHours, REAL_MS_PER_HOUR, HOURS_PER_MONTH } from "../lib/verified-salary";

// The verified real-salary wage credits monthlySalary/720 ƒ per WHOLE real
// hour. The accrual cursor advances by whole hours only, so the engine is
// idempotent under polling (the office HUD calls it on a timer) and any
// sub-hour remainder rolls forward into the next tick. These are the rules the
// pure helper has to enforce — pin them so a refactor can't silently double-pay
// or start paying unverified players.

describe("accrueWholeHours", () => {
  const RATE = Math.floor(72_000 / HOURS_PER_MONTH); // $72k/mo → 100 ƒ/hr

  it("first touch (null cursor) pays nothing and anchors the cursor at now", () => {
    const now = 1_000_000_000_000;
    const r = accrueWholeHours(null, now, RATE);
    expect(r.paid).toBe(0);
    expect(r.hours).toBe(0);
    expect(r.newLastMs).toBe(now);
  });

  it("pays the hourly rate for each whole real hour elapsed", () => {
    const last = 0;
    const now = 3 * REAL_MS_PER_HOUR;
    const r = accrueWholeHours(last, now, RATE);
    expect(r.hours).toBe(3);
    expect(r.paid).toBe(3 * RATE);
    expect(r.newLastMs).toBe(3 * REAL_MS_PER_HOUR);
  });

  it("is idempotent under polling: a second immediate call pays nothing", () => {
    const last = 0;
    const first = accrueWholeHours(last, 2 * REAL_MS_PER_HOUR, RATE);
    expect(first.paid).toBe(2 * RATE);
    // poll again at the same instant from the advanced cursor → no double-pay
    const second = accrueWholeHours(first.newLastMs, 2 * REAL_MS_PER_HOUR, RATE);
    expect(second.paid).toBe(0);
    expect(second.newLastMs).toBe(first.newLastMs);
  });

  it("rolls a sub-hour remainder forward instead of paying or losing it", () => {
    const last = 0;
    const now = REAL_MS_PER_HOUR + 20 * 60_000; // 1h20m
    const r = accrueWholeHours(last, now, RATE);
    expect(r.hours).toBe(1);
    expect(r.paid).toBe(RATE);
    // cursor advances exactly one hour; the 20m remainder is preserved
    expect(r.newLastMs).toBe(REAL_MS_PER_HOUR);
    expect(now - r.newLastMs).toBe(20 * 60_000);
  });

  it("pays nothing before a full hour has elapsed", () => {
    const r = accrueWholeHours(0, 59 * 60_000, RATE);
    expect(r.paid).toBe(0);
    expect(r.newLastMs).toBe(0);
  });

  it("unverified / zero rate never pays even after many hours", () => {
    const r = accrueWholeHours(0, 100 * REAL_MS_PER_HOUR, 0);
    expect(r.paid).toBe(0);
    expect(r.hours).toBe(0);
    expect(r.newLastMs).toBe(0);
  });

  it("never pays for clock skew (now before the cursor)", () => {
    const last = 10 * REAL_MS_PER_HOUR;
    const r = accrueWholeHours(last, 5 * REAL_MS_PER_HOUR, RATE);
    expect(r.paid).toBe(0);
    expect(r.newLastMs).toBe(last);
  });
});
