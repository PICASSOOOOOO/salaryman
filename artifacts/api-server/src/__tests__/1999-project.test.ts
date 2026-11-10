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

  it("accepts Minimoog instrument lanes", () => {
    const project = {
      ...legacyProject,
      tracks: [{ ...legacyProject.tracks[0], machineId: "minimoog" }],
    };
    expect(parseNineteenNinetyNineProject(JSON.stringify(project))).not.toBeNull();
  });

  it("accepts bounded track controls and selected emulator firmware", () => {
    const project = {
      ...legacyProject,
      emulatorState: {
        firmwareIds: { fm1: "factory-1", smk37: "warm-pad" },
        patchSaves: {
          fm1: {
            objectPath: "/objects/1999-emulator-saves/123e4567-e89b-42d3-a456-426614174000",
            filename: "bright-lead.fm1save",
            sizeBytes: 8192,
          },
        },
      },
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
    const badPatchPath = {
      ...legacyProject,
      emulatorState: {
        firmwareIds: {},
        patchSaves: {
          fm1: {
            objectPath: "/objects/uploads/123e4567-e89b-42d3-a456-426614174000",
            filename: "bright-lead.fm1save",
            sizeBytes: 8192,
          },
        },
      },
    };
    const oversizedPatch = {
      ...legacyProject,
      emulatorState: {
        firmwareIds: {},
        patchSaves: {
          smk37: {
            objectPath: "/objects/1999-emulator-saves/123e4567-e89b-42d3-a456-426614174000",
            filename: "warm-pad.fm1save",
            sizeBytes: 16 * 1024 * 1024 + 1,
          },
        },
      },
    };
    expect(parseNineteenNinetyNineProject(JSON.stringify(badSound))).toBeNull();
    expect(parseNineteenNinetyNineProject(JSON.stringify(badFirmware))).toBeNull();
    expect(parseNineteenNinetyNineProject(JSON.stringify(badPatchPath))).toBeNull();
    expect(parseNineteenNinetyNineProject(JSON.stringify(oversizedPatch))).toBeNull();
  });
});
