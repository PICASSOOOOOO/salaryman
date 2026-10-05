import { beforeEach, describe, expect, it } from "vitest";
import { commsAlertsEnabled, setCommsAlertsEnabled } from "./commsAlerts";

describe("COMMS pop-up alert preference", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("keeps automatic pop-up alerts off until the user opts in", () => {
    expect(commsAlertsEnabled()).toBe(false);
    expect(window.localStorage.getItem("salaryman_comms_alerts")).toBeNull();
  });

  it("persists an explicit opt-in and opt-out", () => {
    setCommsAlertsEnabled(true);
    expect(commsAlertsEnabled()).toBe(true);

    setCommsAlertsEnabled(false);
    expect(commsAlertsEnabled()).toBe(false);
  });

  it("fails closed for legacy or invalid stored values", () => {
    window.localStorage.setItem("salaryman_comms_alerts", "legacy");
    expect(commsAlertsEnabled()).toBe(false);
  });
});
