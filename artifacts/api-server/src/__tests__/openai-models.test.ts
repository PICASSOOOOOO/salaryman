import { afterEach, describe, expect, it } from "vitest";
import {
  getOpenAiTextModel,
  OPENAI_ASTRA_MODEL,
  OPENAI_FALLBACK_TEXT_MODEL,
} from "../lib/openai-models";

const originalOverride = process.env.OPENAI_TEXT_MODEL;

afterEach(() => {
  if (originalOverride === undefined) delete process.env.OPENAI_TEXT_MODEL;
  else process.env.OPENAI_TEXT_MODEL = originalOverride;
});

describe("OpenAI text model selection", () => {
  it("prefers Astra by default", () => {
    delete process.env.OPENAI_TEXT_MODEL;
    expect(getOpenAiTextModel()).toBe(OPENAI_ASTRA_MODEL);
  });

  it("supports a controlled rollout override", () => {
    process.env.OPENAI_TEXT_MODEL = OPENAI_FALLBACK_TEXT_MODEL;
    expect(getOpenAiTextModel()).toBe(OPENAI_FALLBACK_TEXT_MODEL);
  });
});