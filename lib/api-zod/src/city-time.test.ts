import { describe, expect, it } from "vitest";
import { getCityClock, isOfficeOpenAt } from "./city-time";

describe("city-local real-time clock", () => {
  it("converts the same instant into each city's local time", () => {
    const instant = new Date("2026-09-04T00:00:00.000Z");
    expect(getCityClock(instant, "minx_city")).toMatchObject({ localDate: "2026-09-03", hour: 17 });
    expect(getCityClock(instant, "huda_city")).toMatchObject({ localDate: "2026-09-04", hour: 7 });
  });

  it("handles overnight office hours against the previous local day", () => {
    expect(isOfficeOpenAt(new Date("2026-09-05T08:00:00.000Z"), "minx_city", "night")).toBe(true);
    expect(isOfficeOpenAt(new Date("2026-09-05T11:00:00.000Z"), "minx_city", "night")).toBe(false);
  });

  it("uses local weekdays rather than the server/browser weekday", () => {
    const instant = new Date("2026-09-06T00:30:00.000Z"); // Sunday UTC, Saturday in Los Angeles
    expect(isOfficeOpenAt(instant, "minx_city", "appointment")).toBe(true);
    expect(isOfficeOpenAt(instant, "huda_city", "appointment")).toBe(false); // Monday 07:30 Huda
  });
});