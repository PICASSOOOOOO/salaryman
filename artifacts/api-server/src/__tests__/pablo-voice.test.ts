import { describe, expect, it } from "vitest";
import { MILA_VOICE_ID } from "../lib/mila-voice";
import { PABLO_VOICE_ID } from "../lib/pablo-voice";

describe("Pablo ElevenLabs voice", () => {
  it("keeps the approved canonical voice ID", () => {
    expect(PABLO_VOICE_ID).toBe("FMgBdHe1YV2Xi0B9anXW");
  });
});

describe("Mila ElevenLabs voice", () => {
  it("keeps the operational assistant voice connected", () => {
    expect(MILA_VOICE_ID).toBe("zNk6QuA4ZKSf5GTyAPuF");
  });
});