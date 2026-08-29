import { describe, expect, it } from "vitest";
import { PABLO_VOICE_ID } from "../lib/pablo-voice";

describe("Pablo ElevenLabs voice", () => {
  it("keeps the approved canonical voice ID", () => {
    expect(PABLO_VOICE_ID).toBe("FMgBdHe1YV2Xi0B9anXW");
  });
});