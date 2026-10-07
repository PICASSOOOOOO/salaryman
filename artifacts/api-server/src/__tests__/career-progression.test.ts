import { describe, expect, it } from "vitest";
import {
  calculateCareerPerformance,
  nextRandomTurnoverAt,
} from "../lib/career-progression";
import { utilityNpcLocation, wasteNpcLocation } from "../lib/tower-operations";

describe("fictional career progression", () => {
  it("schedules turnover independently with a 20% chance each game month", () => {
    const values = [0.9, 0.1, 0, 0];
    let index = 0;
    const next = nextRandomTurnoverAt(
      new Date(Date.UTC(2026, 0, 31)),
      () => values[index++] ?? 0,
    );
    expect(next.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("requires verified output, reliability, and attendance before promotion", () => {
    const baseline = {
      baselineOutputUnits: 36,
      baselineAttendanceDays: 18,
      baselineReliabilityPct: 100,
    };
    const events = Array.from({ length: 18 }, (_, day) => ({
      status: "completed",
      outputUnits: 2,
      completedAt: new Date(Date.UTC(2026, 0, day + 1)),
    }));
    expect(calculateCareerPerformance(events, baseline).outperformed).toBe(false);

    const aboveOutput = events.map((event, index) => ({
      ...event,
      outputUnits: index === 0 ? 3 : event.outputUnits,
    }));
    expect(calculateCareerPerformance(aboveOutput, baseline).outperformed).toBe(true);

    const unreliable = [...events, {
      status: "missed",
      outputUnits: 0,
      completedAt: null,
    }];
    expect(calculateCareerPerformance(unreliable, baseline).outperformed).toBe(false);
  });

  it("routes utility staff through the B5/B6 service elevator between work sites", () => {
    const morningTransit = utilityNpcLocation(new Date(Date.UTC(2026, 0, 1, 7, 45)));
    const pumpShift = utilityNpcLocation(new Date(Date.UTC(2026, 0, 1, 13, 30)));
    expect(morningTransit).toMatchObject({
      floorNumber: 1,
      route: "service_elevator",
      destinationFloor: 5,
    });
    expect(pumpShift).toMatchObject({ floorNumber: 6, action: "pumping", route: "at_station" });
  });

  it("routes the waste porter from F6 through the service elevator to rear B1 waste", () => {
    expect(wasteNpcLocation(new Date(Date.UTC(2026, 0, 1, 9, 30)))).toMatchObject({
      floorNumber: 6,
      route: "service_elevator",
      destinationFloor: 1,
    });
    expect(wasteNpcLocation(new Date(Date.UTC(2026, 0, 1, 10, 30)))).toMatchObject({
      floorNumber: 1,
      action: "hauling_trash",
      route: "waste_station",
    });
  });
});
