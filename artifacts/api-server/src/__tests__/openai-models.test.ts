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
  it("uses the known-good fallback by default", () => {
    delete process.env.OPENAI_TEXT_MODEL;
    expect(getOpenAiTextModel()).toBe(OPENAI_FALLBACK_TEXT_MODEL);
  });

  it("supports a controlled Astra rollout override", () => {
    process.env.OPENAI_TEXT_MODEL = OPENAI_ASTRA_MODEL;
    expect(getOpenAiTextModel()).toBe(OPENAI_FALLBACK_TEXT_MODEL);
  });

  it("does not activate Astra from a model-name override alone", () => {
    process.env.OPENAI_TEXT_MODEL = OPENAI_ASTRA_MODEL;
    process.env.PABLO_ASTRA_ENABLED = "1";
    expect(getOpenAiTextModel()).toBe(OPENAI_FALLBACK_TEXT_MODEL);
  });
});