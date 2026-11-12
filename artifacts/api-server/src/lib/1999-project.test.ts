import { describe, expect, it } from "vitest";
import { parseNineteenNinetyNineProject } from "./1999-project";

const validProject = {
  schemaVersion: 1,
  name: "Night Shift",
  bpm: 96,
  tracks: [{
    id: "track-1",
    name: "Tape",
    kind: "instrument",
    machineId: "op1",
    steps: [60, 0, 64, 0, 67, 0, 64, 0, 60, 0, 64, 0, 67, 0, 64, 0],
    audioTrackId: null,
    muted: false,
    volume: 80,
  }],
};

describe("1999 project data validation", () => {
  it("accepts a bounded, versioned session with supported machine IDs", () => {
    expect(parseNineteenNinetyNineProject(JSON.stringify(validProject))).toEqual(validProject);
  });

  it("preserves valid shared master-effect settings and rejects invalid ranges", () => {
    const lofiFx = {
      enabled: true,
      input: 100,
      output: 100,
      mix: 72,
      filter: 45,
      bits: 12,
      rate: 24_000,
      drive: 18,
      alias: 40,
      noise: 8,
      drunk: 5,
      character: 20,
      bassBoost: true,
      bassFrequency: 120,
      stereoMode: "stereo",
    };
    expect(parseNineteenNinetyNineProject(JSON.stringify({ ...validProject, lofiFx })))
      .toMatchObject({ lofiFx });
    expect(parseNineteenNinetyNineProject(JSON.stringify({
      ...validProject,
      lofiFx: { ...lofiFx, bits: 10 },
    }))).toBeNull();
    expect(parseNineteenNinetyNineProject(JSON.stringify({
      ...validProject,
      lofiFx: { ...lofiFx, rate: 120 },
    }))).toBeNull();
  });

  it("rejects malformed JSON, unsupported machines, and invalid tempo", () => {
    expect(parseNineteenNinetyNineProject("{")).toBeNull();
    expect(parseNineteenNinetyNineProject(JSON.stringify({
      ...validProject,
      bpm: 500,
    }))).toBeNull();
    expect(parseNineteenNinetyNineProject(JSON.stringify({
      ...validProject,
      tracks: [{ ...validProject.tracks[0], machineId: "unknown" }],
    }))).toBeNull();
  });

  it("rejects oversized projects and more than eight tracks", () => {
    expect(parseNineteenNinetyNineProject(" ".repeat(256 * 1024 + 1))).toBeNull();
    expect(parseNineteenNinetyNineProject(JSON.stringify({
      ...validProject,
      tracks: Array.from({ length: 9 }, (_, index) => ({
        ...validProject.tracks[0],
        id: `track-${index}`,
      })),
    }))).toBeNull();
  });
});
