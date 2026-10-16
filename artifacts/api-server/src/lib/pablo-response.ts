export const PABLO_COMMAND_RESPONSE_FALLBACK =
  "I couldn't form a clear reply. Please try again.";

function parseObject(candidate: string): { say: string; action: unknown } | null {
  try {
    const parsed: unknown = JSON.parse(candidate);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const response = parsed as { say?: unknown; action?: unknown };
    const say =
      typeof response.say === "string" && response.say.trim()
        ? response.say.trim()
        : "I'm here.";
    return { say, action: response.action ?? null };
  } catch {
    return null;
  }
}

/**
 * Find complete JSON objects embedded in provider formatting. This accepts
 * fenced JSON and short preambles/postambles, but never treats arbitrary model
 * prose as a command or exposes it as a reply.
 */
function extractResponse(raw: string): { say: string; action: unknown } | null {
  const text = raw.trim();
  const candidates = [text];

  for (const match of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]) candidates.push(match[1].trim());
  }

  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let end = start; end < text.length; end += 1) {
      const char = text[end];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === "\"") inString = false;
        continue;
      }
      if (char === "\"") inString = true;
      else if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          candidates.push(text.slice(start, end + 1));
          break;
        }
      }
    }
  }

  for (const candidate of candidates) {
    const result = parseObject(candidate);
    if (result) return result;
  }
  return null;
}

/**
 * Parse terminal-mode output without ever exposing malformed raw model text.
 */
export function parsePabloCommandResponse(raw: string): {
  say: string;
  action: unknown;
} {
  return extractResponse(raw) ?? {
    say: PABLO_COMMAND_RESPONSE_FALLBACK,
    action: null,
  };
}
