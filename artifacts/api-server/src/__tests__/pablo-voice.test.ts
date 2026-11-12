import { describe, expect, it } from "vitest";
import { MILA_VOICE_ID } from "../lib/mila-voice";
import { PABLO_VOICE_ID } from "../lib/pablo-voice";
import { allowsPabloVoiceFromFacts } from "../lib/pablo-voice-access";
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
    expect(route).toContain(`res.status(502).json({ error: "Pablo's assigned voice is unavailable" })`);
    expect(route.indexOf('if (isPabloCharacter(character))')).toBeLessThan(
      route.indexOf('const openaiKey = process.env.OPENAI_API_KEY'),
    );
    expect(route).toContain('res.setHeader("X-TTS-Provider", "elevenlabs")');
  });

  it("gates the resolved Pablo voice before either TTS route can call a provider", () => {
    const route = readFileSync(
      resolve(process.cwd(), "src/routes/openai/index.ts"),
      "utf8",
    );
    const voiceGate = route.indexOf("const requestsPabloVoice =");
    const providerCall = route.indexOf("const elevenLabsKey = process.env.ELEVENLABS_API_KEY");

    expect(voiceGate).toBeGreaterThan(-1);
    expect(voiceGate).toBeLessThan(providerCall);
    expect(route).toContain("voiceId === PABLO_VOICE_ID");
    expect(route).toContain("await hasPabloVoiceAccess(userId)");
    expect(route).toContain('router.post("/tts", handleTts)');
    expect(route).toContain('router.post("/game-tts", async (req, res) => {');
    expect(route).toContain("return handleTts(req, res)");
  });
});

describe("Pablo paid voice access policy", () => {
  const denied = {
    paidFeatureGrants: [],
    activePaidPhoneNumber: false,
    approvedTester: false,
  };

  it.each(["claw_bot", "phone_system"])("allows an active Stripe-backed %s grant", (featureKey) => {
    expect(
      allowsPabloVoiceFromFacts({
        ...denied,
        paidFeatureGrants: [{ featureKey, stripeSubscriptionId: "sub_active" }],
      }),
    ).toBe(true);
  });

  it("allows a completed active custom-number purchase", () => {
    expect(
      allowsPabloVoiceFromFacts({ ...denied, activePaidPhoneNumber: true }),
    ).toBe(true);
  });

  it("allows an approved tester/moderator", () => {
    expect(
      allowsPabloVoiceFromFacts({ ...denied, approvedTester: true }),
    ).toBe(true);
  });

  it("rejects unpaid grants, unrelated features, and users without an approved tester record", () => {
    expect(
      allowsPabloVoiceFromFacts({
        ...denied,
        paidFeatureGrants: [
          { featureKey: "claw_bot", stripeSubscriptionId: null },
          { featureKey: "say_this", stripeSubscriptionId: "sub_other" },
        ],
      }),
    ).toBe(false);
  });
});

describe("Mila ElevenLabs voice", () => {
  it("keeps the operational assistant voice connected", () => {
    expect(MILA_VOICE_ID).toBe("zNk6QuA4ZKSf5GTyAPuF");
  });
});