import { describe, expect, it } from "vitest";
import { MILA_VOICE_ID } from "../lib/mila-voice";
import { PABLO_VOICE_ID } from "../lib/pablo-voice";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Pablo ElevenLabs voice", () => {
  it("keeps the approved canonical voice ID", () => {
    expect(PABLO_VOICE_ID).toBe("FMgBdHe1YV2Xi0B9anXW");
  });

  it("suppresses generic speech when Pablo's assigned voice is unavailable", () => {
    const route = readFileSync(
      resolve(process.cwd(), "src/routes/openai/index.ts"),
      "utf8",
    );
    expect(route).toContain('return key === "PABLO" || key === "MILA"');
    expect(route).toContain('if (isSignatureVoice(character))');
    expect(route).toContain("function isPabloCharacter(character?: string)");
    expect(route).toContain('res.status(502).json({ error: "Pablo\\'s assigned voice is unavailable" })');
    expect(route.indexOf('if (isPabloCharacter(character))')).toBeLessThan(
      route.indexOf('const openaiKey = process.env.OPENAI_API_KEY'),
    );
    expect(route).toContain('res.setHeader("X-TTS-Provider", "elevenlabs")');
  });
});

describe("Mila ElevenLabs voice", () => {
  it("keeps the operational assistant voice connected", () => {
    expect(MILA_VOICE_ID).toBe("zNk6QuA4ZKSf5GTyAPuF");
  });
});