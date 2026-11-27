// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getPabloAutomationCapability } from "./PabloAutomationWorkspace";

describe("PABLO PRIME in-page capabilities", () => {
  it("resolves each existing capability on the shared workspace route", () => {
    expect(getPabloAutomationCapability("?cap=workflows")).toBe("workflows");
    expect(getPabloAutomationCapability("?cap=agents")).toBe("agents");
    expect(getPabloAutomationCapability("?cap=ads")).toBe("ads");
    expect(getPabloAutomationCapability("?cap=secretary")).toBe("secretary");
  });

  it("defaults legacy /business/autopilot links to workflows", () => {
    expect(getPabloAutomationCapability("")).toBe("workflows");
    expect(getPabloAutomationCapability("?cap=unknown")).toBe("workflows");
  });
});
