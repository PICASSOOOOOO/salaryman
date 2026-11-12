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

  it("preserves recorded-loop library IDs and mix settings across project serialization", () => {
    const project = {
      ...legacyProject,
      tracks: [
        legacyProject.tracks[0],
        {
          id: "trk-loop",
          name: "Mic loop",
          kind: "recording",
          machineId: "op1",
          steps: Array(16).fill(0),
          audioTrackId: 501,
          overdubTrackIds: [502, 503],
          loopBars: 2,
          loopBpm: 92,
          muted: true,
          volume: 68,
          soundState: { tone: 72, decayMs: 240 },
        },
      ],
    };

    expect(parseNineteenNinetyNineProject(JSON.stringify(project))).toEqual(project);
  });

  it("rejects invalid, duplicate, or instrument-lane overdub references", () => {
    const recording = {
      id: "trk-loop",
      name: "Mic loop",
      kind: "recording",
      machineId: "op1",
      steps: Array(16).fill(0),
      audioTrackId: 501,
      muted: false,
      volume: 68,
    };
    const invalidProjects = [
      { ...legacyProject, tracks: [{ ...recording, overdubTrackIds: [0] }] },
      { ...legacyProject, tracks: [{ ...recording, overdubTrackIds: [502, 502] }] },
      { ...legacyProject, tracks: [{ ...recording, audioTrackId: null, overdubTrackIds: [502] }] },
      { ...legacyProject, tracks: [{ ...legacyProject.tracks[0], overdubTrackIds: [502] }] },
      { ...legacyProject, tracks: [{ ...recording, overdubTrackIds: Array(51).fill(502).map((id, i) => id + i) }] },
      { ...legacyProject, tracks: [{ ...recording, loopBars: 2 }] },
      { ...legacyProject, tracks: [{ ...recording, loopBars: 8, loopBpm: 92 }] },
      { ...legacyProject, tracks: [{ ...recording, loopBars: 2, loopBpm: 400 }] },
    ];

    for (const project of invalidProjects) {
      expect(parseNineteenNinetyNineProject(JSON.stringify(project))).toBeNull();
    }
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
