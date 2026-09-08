/**
 * Central OpenAI text-model selection.
 *
 * Astra is never activated by an arbitrary model-name override. Pablo must
 * explicitly opt into the rollout, then pass a provider-only readiness probe
 * before any user content is sent to it. All other callers stay on the
 * verified fallback model.
 */
export const OPENAI_ASTRA_MODEL = "gpt-6-astra";
export const OPENAI_FALLBACK_TEXT_MODEL = "gpt-5";

let astraVerifiedUntil = 0;

export function isAstraRequested(): boolean {
  return process.env.PABLO_ASTRA_ENABLED === "1";
}

export function isAstraVerified(): boolean {
  return astraVerifiedUntil > Date.now();
}

export function markAstraVerified(ttlMs = 5 * 60_000): void {
  astraVerifiedUntil = Date.now() + ttlMs;
}

export function markAstraUnverified(): void {
  astraVerifiedUntil = 0;
}

export function getOpenAiTextModel(): string {
  const configured = process.env.OPENAI_TEXT_MODEL?.trim();
  if (configured === OPENAI_ASTRA_MODEL && isAstraRequested() && isAstraVerified()) {
    return OPENAI_ASTRA_MODEL;
  }
  if (configured && configured !== OPENAI_ASTRA_MODEL) return configured;
  return OPENAI_FALLBACK_TEXT_MODEL;
}