import { apiFetch } from "./api-client";

export type ErrorSource = "react" | "window.onerror" | "unhandledrejection" | "manual";

export interface CapturedError {
  source: ErrorSource;
  message: string;
  stack?: string;
  componentStack?: string;
  url?: string;
  userAgent?: string;
  fingerprint: string;
  capturedAt: number;
}

export interface ReportPayload extends Omit<CapturedError, "fingerprint" | "capturedAt"> {
  userNote?: string;
}

type Listener = (err: CapturedError) => void;
const listeners = new Set<Listener>();
const recentFingerprints = new Map<string, number>();
const DEDUPE_WINDOW_MS = 30_000;

function fingerprintOf(message: string, stack?: string): string {
  // Stable identity for dedupe: first stack frame + message head. Avoids
  // hammering the API when a single bug fires inside a render loop.
  const head = (stack ?? "").split("\n").slice(0, 2).join("|").slice(0, 200);
  return `${message.slice(0, 120)}::${head}`;
}

function shouldDrop(fp: string): boolean {
  const now = Date.now();
  for (const [k, t] of recentFingerprints) {
    if (now - t > DEDUPE_WINDOW_MS) recentFingerprints.delete(k);
  }
  if (recentFingerprints.has(fp)) return true;
  recentFingerprints.set(fp, now);
  return false;
}

export function subscribeErrors(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function captureError(input: Omit<CapturedError, "fingerprint" | "capturedAt" | "url" | "userAgent"> & { url?: string; userAgent?: string }): void {
  const message = (input.message || "Unknown error").slice(0, 500);
  const fp = fingerprintOf(message, input.stack);
  if (shouldDrop(fp)) return;
  const err: CapturedError = {
    source: input.source,
    message,
    stack: input.stack,
    componentStack: input.componentStack,
    url: input.url ?? (typeof window !== "undefined" ? window.location.href : undefined),
    userAgent: input.userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : undefined),
    fingerprint: fp,
    capturedAt: Date.now(),
  };
  // Auto-send the technical part right away. The UI layer can later POST
  // again with userNote attached if the user adds context — server keeps
  // both rows; that's acceptable while we're in alpha.
  void sendReport({
    source: err.source,
    message: err.message,
    stack: err.stack,
    componentStack: err.componentStack,
    url: err.url,
    userAgent: err.userAgent,
  });
  for (const fn of listeners) {
    try { fn(err); } catch { /* listener errors must not loop */ }
  }
}

export async function sendReport(payload: ReportPayload): Promise<boolean> {
  try {
    const res = await apiFetch("api/feedback/error-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    // Swallow — we never want the reporter itself to throw.
    return false;
  }
}

let installed = false;
export function installGlobalErrorHandlers(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    // Some "errors" are actually resource load failures (img/script). Skip
    // those — they're noisy and not actionable as runtime exceptions.
    if (event.error instanceof Error || typeof event.message === "string") {
      const err = event.error instanceof Error ? event.error : null;
      captureError({
        source: "window.onerror",
        message: err?.message ?? event.message ?? "Window error",
        stack: err?.stack,
      });
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = reason instanceof Error
      ? reason.message
      : typeof reason === "string"
        ? reason
        : (() => { try { return JSON.stringify(reason).slice(0, 300); } catch { return "Unhandled promise rejection"; } })();
    captureError({
      source: "unhandledrejection",
      message: message || "Unhandled promise rejection",
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}
