import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n";
import { initLowGfx } from "./lib/lowGfx";
import { installGlobalErrorHandlers } from "./lib/errorReporter";
import { installGlobalUiSound } from "./lib/global-ui-sound";

// Canonical front door: picassoo.app is THE domain. In production, anyone who
// lands on the deployment's *.replit.app host (e.g. salaryman.replit.app) or
// the www. alias is routed straight to https://picassoo.app, preserving the
// path/query/hash so the Pablo-nebula front-door funnel and any deep link still
// resolve. Runs synchronously before render to avoid a flash, and is gated on
// PROD so the workspace dev preview (*.replit.dev / localhost) is untouched.
(() => {
  if (!import.meta.env.PROD || typeof window === "undefined") return;
  const CANONICAL_HOST = "picassoo.app";
  const host = window.location.hostname;
  if (host === CANONICAL_HOST) return;
  if (host.endsWith(".replit.app") || host === "www.picassoo.app") {
    window.location.replace(
      `https://${CANONICAL_HOST}${window.location.pathname}${window.location.search}${window.location.hash}`,
    );
  }
})();

initLowGfx();
// One document-level listener gives every button / dropdown / toggle a click
// sound without touching individual call sites.
installGlobalUiSound();
// Auto-report window.onerror + unhandledrejection to /api/feedback/error-report.
// React render errors are caught separately by ErrorBoundary.
installGlobalErrorHandlers();
createRoot(document.getElementById("root")!).render(<App />);
