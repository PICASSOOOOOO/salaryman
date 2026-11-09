import { describe, expect, it } from "vitest";
import { parseNineteenNinetyNineProject } from "../lib/1999-project";

const legacyProject = {
  schemaVersion: 1,
  name: "First loop",
  bpm: 92,
  tracks: [{
    id: "trk-1",
    name: "Pulse",
    kind: "instrument",
    machineId: "op1",
    steps: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    audioTrackId: null,
    muted: false,
    volume: 72,
  }],
};

describe("1999 project validation", () => {
  it("continues to accept saved projects without newer sound state", () => {
    expect(parseNineteenNinetyNineProject(JSON.stringify(legacyProject))).not.toBeNull();
  });

  it("accepts bounded track controls and selected emulator firmware", () => {
    const project = {
      ...legacyProject,
      emulatorState: { firmwareIds: { fm1: "factory-1", smk37: "warm-pad" } },
      tracks: [{ ...legacyProject.tracks[0], soundState: { tone: 65, decayMs: 420 } }],
    };
    expect(parseNineteenNinetyNineProject(JSON.stringify(project))).not.toBeNull();
  });

  it("rejects out-of-range sound controls and malformed firmware state", () => {
    const badSound = {
      ...legacyProject,
      tracks: [{ ...legacyProject.tracks[0], soundState: { tone: 101, decayMs: 420 } }],
    };
    const badFirmware = {
      ...legacyProject,
      emulatorState: { firmwareIds: { fm1: "not valid\u0000firmware" } },
    };
    expect(parseNineteenNinetyNineProject(JSON.stringify(badSound))).toBeNull();
    expect(parseNineteenNinetyNineProject(JSON.stringify(badFirmware))).toBeNull();
  });
});
