/**
 * Central OpenAI text-model selection.
 *
 * Astra is the preferred reasoning/text model. Keeping the fallback here makes
 * the upgrade reversible without scattering model strings across routes.
 * OPENAI_TEXT_MODEL may override the preference for controlled rollout/testing.
 */
export const OPENAI_ASTRA_MODEL = "gpt-6-astra";
export const OPENAI_FALLBACK_TEXT_MODEL = "gpt-5";

export function getOpenAiTextModel(): string {
  return process.env.OPENAI_TEXT_MODEL?.trim() || OPENAI_ASTRA_MODEL;
}