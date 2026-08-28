import { describe, expect, it } from "vitest";
import {
  DEFAULT_OFFICE_PROPERTY_KEY,
  OFFICE_PROPERTY_LAYOUTS,
  getOfficePropertyLayout,
  loadOfficePose,
  officePoseStorageKey,
  saveOfficePose,
  validateOfficePose,
} from "./office-property-layouts";

describe("office property layouts", () => {
  const layouts = Object.values(OFFICE_PROPERTY_LAYOUTS);

  it("defines all seven purchased-office interiors", () => {
    expect(layouts).toHaveLength(7);
    expect(getOfficePropertyLayout("missing").propertyKey).toBe(DEFAULT_OFFICE_PROPERTY_KEY);
  });

  it("grows floor scale and working capacity with each listing", () => {
    for (let i = 1; i < layouts.length; i++) {
      expect(layouts[i].cols * layouts[i].rows).toBeGreaterThan(layouts[i - 1].cols * layouts[i - 1].rows);
      expect(layouts[i].deskCols * layouts[i].deskRows).toBeGreaterThan(layouts[i - 1].deskCols * layouts[i - 1].deskRows);
    }
  });

  it("keeps every spawn and station inside its authored floor", () => {
    for (const layout of layouts) {
      expect(validateOfficePose(layout, layout.spawn), layout.propertyKey).toEqual(layout.spawn);
      for (const station of layout.stations) {
        expect(station.col, `${layout.propertyKey}:${station.id}:col`).toBeGreaterThanOrEqual(0);
        expect(station.col, `${layout.propertyKey}:${station.id}:col`).toBeLessThan(layout.cols);
        expect(station.row, `${layout.propertyKey}:${station.id}:row`).toBeGreaterThanOrEqual(0);
        expect(station.row, `${layout.propertyKey}:${station.id}:row`).toBeLessThan(layout.rows);
      }
    }
  });

  it("rejects stale or impossible poses and scopes saved keys by slot and property", () => {
    const layout = layouts[0];
    expect(validateOfficePose(layout, { x: -1, y: 20, facing: "right" })).toBeNull();
    expect(validateOfficePose(layout, { x: Number.NaN, y: 20, facing: "right" })).toBeNull();
    expect(officePoseStorageKey(1, layout.propertyKey)).not.toBe(officePoseStorageKey(2, layout.propertyKey));
    expect(officePoseStorageKey(1, layout.propertyKey)).not.toBe(officePoseStorageKey(1, layouts[1].propertyKey));
  });

  it("restores a valid pose only for the same slot and property", () => {
    const layout = layouts[0];
    const pose = { x: 8 * 16, y: 9 * 16, facing: "left" as const };
    saveOfficePose(2, layout, pose);
    expect(loadOfficePose(2, layout)).toEqual(pose);
    expect(loadOfficePose(3, layout)).toEqual(layout.spawn);
    expect(loadOfficePose(2, layouts[1])).toEqual(layouts[1].spawn);
  });
});