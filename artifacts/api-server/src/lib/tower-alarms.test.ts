import { describe, expect, it } from "vitest";
import {
  getDailyTowerIncident,
  isAlarmLocalToArea,
  towerAlarmSoundActive,
  TOWER_ALARM_MODES,
} from "./tower-alarms";

describe("Tower alarm defaults", () => {
  it("keeps daily rare incidents deterministic and localized to their response zone", () => {
    const date = new Date("2026-10-25T12:00:00.000Z");
    const incident = getDailyTowerIncident(date);
    expect(getDailyTowerIncident(new Date("2026-10-25T23:59:00.000Z"))).toEqual(incident);
    if (incident) {
      expect(incident.eventKey).toBe("tower-rare-incident:2026-10-25");
      expect(["B2", "B3", "B4", "B6"]).toContain(incident.floorKey);
      expect(incident.zoneKey).toMatch(/^b[2-6]-/);
    }
  });

  it("keeps rare incident frequency bounded while covering every incident type", () => {
    const dates = Array.from({ length: 2_000 }, (_, index) =>
      new Date(Date.UTC(2020, 0, 1 + index)),
    );
    const incidents = dates
      .map(getDailyTowerIncident)
      .filter((incident) => incident !== null);
    expect(incidents.length).toBeGreaterThan(60);
    expect(incidents.length).toBeLessThan(100);
    expect(new Set(incidents.map((incident) => incident.alarmType))).toEqual(
      new Set(["fire", "smoke", "flood", "poison", "crime_scene"]),
    );
  });

  it("stops sound on silent/lights-only modes and when the short sounder timer expires", () => {
    const now = new Date("2026-10-25T12:00:00.000Z");
    const future = new Date(now.getTime() + 1_000);
    const past = new Date(now.getTime() - 1_000);
    expect(TOWER_ALARM_MODES).toEqual(["silent", "lights_only", "quiet", "medium", "loud"]);
    expect(towerAlarmSoundActive("loud", future, now)).toBe(true);
    expect(towerAlarmSoundActive("quiet", past, now)).toBe(false);
    expect(towerAlarmSoundActive("silent", future, now)).toBe(false);
    expect(towerAlarmSoundActive("lights_only", future, now)).toBe(false);
  });

  it("keeps local alerts on the affected floor and within the affected zone radius", () => {
    const alarm = { floorKey: "B3", x: 2_000, y: 4_000, radius: 1_500 };
    expect(isAlarmLocalToArea(alarm, 3, 3_000, 4_000)).toBe(true);
    expect(isAlarmLocalToArea(alarm, 2, 2_000, 4_000)).toBe(false);
    expect(isAlarmLocalToArea(alarm, 3, 4_000, 4_000)).toBe(false);
  });
});
