/**
 * Known-noise filter for the auto-error pipeline. Browsers (especially
 * Chromium) and a few extensions emit "errors" that aren't real bugs —
 * they're either platform quirks, third-party script noise, or transient
 * conditions outside the app's control. Letting these into the inbox
 * trains triagers to ignore it; suppress them at ingest instead.
 *
 * Each pattern is matched against (message, stack, source). If ANY
 * pattern matches, the report is dropped silently — the client still
 * gets a 200 so it doesn't loop trying to re-report.
 *
 * Add to this list when you spot a recurring report you don't want to
 * see. Removing patterns is also fine; nothing here is load-bearing.
 */

export interface NoiseInput {
  message: string;
  stack?: string | null;
  source?: string | null;
}

interface NoiseRule {
  // Human-readable label so log output is greppable.
  label: string;
  // Pattern matched against message + stack joined with a newline.
  match: RegExp;
}

const RULES: NoiseRule[] = [
  // Cosmetic browser quirk — fires when a ResizeObserver callback queues
  // another layout in the same frame. Harmless. Chrome/FF both throw.
  { label: "resize_observer_loop", match: /ResizeObserver loop (limit exceeded|completed with undelivered notifications)/i },
  // User navigated away mid-fetch. Not a bug; just an aborted request.
  { label: "abort_error", match: /\b(AbortError|The user aborted a request|signal is aborted without reason)\b/i },
  // Network blip — DNS, offline, captive portal. Not actionable from here.
  { label: "network_failed", match: /\b(NetworkError when attempting to fetch resource|Failed to fetch|Load failed|net::ERR_)/i },
  // Safari/iOS WebKit emits this for benign script-tag failures.
  { label: "script_error_opaque", match: /^Script error\.?$/i },
  // Browser extensions injecting their own promise rejections.
  { label: "extension_runtime", match: /chrome-extension:\/\/|moz-extension:\/\/|safari-extension:\/\//i },
  // Service-worker stale-cache window — auto-recovers on reload.
  { label: "sw_stale_chunk", match: /Loading chunk \d+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i },
  // Quota errors from private-browsing localStorage. App degrades gracefully.
  { label: "storage_quota", match: /QuotaExceededError|The quota has been exceeded/i },
];

export function classifyNoise(input: NoiseInput): string | null {
  const haystack = `${input.message ?? ""}\n${input.stack ?? ""}`;
  for (const rule of RULES) {
    if (rule.match.test(haystack)) return rule.label;
  }
  return null;
}
