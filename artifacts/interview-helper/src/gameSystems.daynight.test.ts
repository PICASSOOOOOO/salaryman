import { describe, it, expect } from "vitest";
import {
  VISUAL_MS_PER_GAME_DAY,
  getSkyState,
  SUNRISE_HOUR,
  SUNSET_HOUR,
  tickCalendar,
  initCalendar,
} from "./gameSystems";

describe("visual day length", () => {
  it("spans exactly one real hour", () => {
    expect(VISUAL_MS_PER_GAME_DAY).toBe(3_600_000);
  });

  it("advances the calendar by ~one real hour per in-game day", () => {
    // Feeding exactly one real hour of dt should roll the day over once and land
    // back on (close to) the same hour.
    let cal = initCalendar();
    const startDay = cal.day;
    const startHour = cal.hour;
    cal = tickCalendar(cal, VISUAL_MS_PER_GAME_DAY);
    // Day advanced by one (allowing month/year rollover bookkeeping).
    expect(cal.day === startDay + 1 || cal.day === 1).toBe(true);
    expect(Math.abs(((cal.hour - startHour) % 24)) < 0.001).toBe(true);
  });

  it("does not change at the framerate it is ticked", () => {
    // 60 ticks of one frame (16.6667ms) vs 1 tick of 60 frames should land on
    // the same hour — proving the clock is wall-clock driven, not frame driven.
    let a = initCalendar();
    for (let i = 0; i < 60; i++) a = tickCalendar(a, 16.6667);
    let b = initCalendar();
    b = tickCalendar(b, 60 * 16.6667);
    expect(Math.abs(a.hour - b.hour) < 0.001).toBe(true);
  });
});

describe("getSkyState", () => {
  it("shows the sun by day and the moon by night", () => {
    const noon = getSkyState(12);
    expect(noon.sun.visible).toBe(true);
    expect(noon.moon.visible).toBe(false);

    const midnight = getSkyState(0);
    expect(midnight.sun.visible).toBe(false);
    expect(midnight.moon.visible).toBe(true);
  });

  it("puts the sun at its zenith at solar noon and at the horizon at sunrise/sunset", () => {
    const solarNoon = (SUNRISE_HOUR + SUNSET_HOUR) / 2;
    const peak = getSkyState(solarNoon);
    expect(peak.sun.altitude).toBeGreaterThan(0.99);

    const dawn = getSkyState(SUNRISE_HOUR + 0.001);
    expect(dawn.sun.altitude).toBeLessThan(0.05);
    const dusk = getSkyState(SUNSET_HOUR - 0.001);
    expect(dusk.sun.altitude).toBeLessThan(0.05);
  });

  it("arcs the sun east (left) → west (right) across the day", () => {
    const morning = getSkyState(SUNRISE_HOUR + 1);
    const evening = getSkyState(SUNSET_HOUR - 1);
    expect(morning.sun.x).toBeLessThan(0.5);
    expect(evening.sun.x).toBeGreaterThan(0.5);
  });

  it("swings shadows right→left and shortens them toward noon", () => {
    const solarNoon = (SUNRISE_HOUR + SUNSET_HOUR) / 2;
    const morning = getSkyState(SUNRISE_HOUR + 1);
    const noon = getSkyState(solarNoon);
    const evening = getSkyState(SUNSET_HOUR - 1);

    // Morning sun in the east throws shadows to the right (+dx); evening to the left (−dx).
    expect(morning.shadow.dx).toBeGreaterThan(0);
    expect(evening.shadow.dx).toBeLessThan(0);
    // Shadows are shortest when the sun is highest.
    expect(noon.shadow.len).toBeLessThan(morning.shadow.len);
    expect(noon.shadow.len).toBeLessThan(evening.shadow.len);
  });

  it("lifts ambient brightness with the sun and drops it to zero at night", () => {
    const solarNoon = (SUNRISE_HOUR + SUNSET_HOUR) / 2;
    expect(getSkyState(solarNoon).sunBrightness).toBeGreaterThan(0.9);
    expect(getSkyState(0).sunBrightness).toBe(0);
  });
});
