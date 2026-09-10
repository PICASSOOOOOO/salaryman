import { apiFetch } from "./api-client";

type ErrorSource = "react" | "window.onerror" | "unhandledrejection";
type Report = {
  source: ErrorSource;
  message: string;
  stack?: string;
  componentStack?: string;
  url?: string;
  userAgent?: string;
};

const recent = new Map<string, number>();
let installed = false;

function reportKey(message: string, stack?: string) {
  return `${message.slice(0, 160)}::${(stack ?? "").split("\n").slice(0, 2).join("|").slice(0, 200)}`;
}

export function sendReport(report: Report): void {
  const key = reportKey(report.message, report.stack);
  const now = Date.now();
  for (const [storedKey, timestamp] of recent) {
    if (now - timestamp > 30_000) recent.delete(storedKey);
  }
  if (recent.has(key)) return;
  recent.set(key, now);
  void apiFetch("/api/feedback/error-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...report,
      url: report.url ?? window.location.href,
      userAgent: report.userAgent ?? navigator.userAgent,
      appVersion: typeof __BUILD_VERSION__ !== "undefined" ? __BUILD_VERSION__ : undefined,
    }),
  }).catch(() => {});
}

export function installGlobalErrorHandlers(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (event) => {
    if (event.error instanceof Error || event.message) {
      sendReport({
        source: "window.onerror",
        message: event.error?.message ?? event.message ?? "Window error",
        stack: event.error?.stack,
      });
    }
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    sendReport({
      source: "unhandledrejection",
      message: reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "Unhandled promise rejection",
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}