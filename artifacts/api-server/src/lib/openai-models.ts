/**
 * Central OpenAI text-model selection.
 *
 * The proxy may expose Astra before it supports every OpenAI-compatible route.
 * Keep Astra available as an explicit rollout override, but use the known-good
 * fallback by default so direct callers do not turn a temporary model mismatch
 * into a user-facing outage.
 * OPENAI_TEXT_MODEL may override the preference for controlled rollout/testing.
 */
export const OPENAI_ASTRA_MODEL = "gpt-6-astra";
export const OPENAI_FALLBACK_TEXT_MODEL = "gpt-5";

export function getOpenAiTextModel(): string {
  return process.env.OPENAI_TEXT_MODEL?.trim() || OPENAI_FALLBACK_TEXT_MODEL;
}