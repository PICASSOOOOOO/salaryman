export const PABLO_COMMAND_RESPONSE_FALLBACK =
  "I couldn't form a clear reply. Please try again.";

/**
 * Parse terminal-mode output without ever exposing malformed raw model text.
 */
export function parsePabloCommandResponse(raw: string): {
  say: string;
  action: unknown;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { say: PABLO_COMMAND_RESPONSE_FALLBACK, action: null };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { say: PABLO_COMMAND_RESPONSE_FALLBACK, action: null };
  }

  const response = parsed as { say?: unknown; action?: unknown };
  const say =
    typeof response.say === "string" && response.say.trim()
      ? response.say.trim()
      : "I'm here.";

  return { say, action: response.action ?? null };
}
