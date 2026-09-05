import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n";
import { initLowGfx } from "./lib/lowGfx";
import { armAudioAutoUnlock } from "./lib/tts";
import { installDeferredGlobalUiSound, warmGlobalUiSound } from "./lib/deferred-ui-sound";

// Canonical front door: salaryman.io is THE domain. In production, anyone who
// lands on the deployment's *.replit.app host (e.g. salaryman.replit.app) or
// the www. alias is routed straight to https://picassoo.app, preserving the
// path/query/hash so the Pablo-nebula front-door funnel and any deep link still
// resolve. Runs synchronously before render to avoid a flash, and is gated on
// PROD so the workspace dev preview (*.replit.dev / localhost) is untouched.
(() => {
  if (!import.meta.env.PROD || typeof window === "undefined") return;
  const CANONICAL_HOST = "salaryman.io";
  const host = window.location.hostname;
  if (host === CANONICAL_HOST) return;
  if (host.endsWith(".replit.app") || host === "www.salaryman.io") {
    window.location.replace(
      `https://${CANONICAL_HOST}${window.location.pathname}${window.location.search}${window.location.hash}`,
    );
  }
})();

initLowGfx();
// Capture Chromium's one-shot install event at startup. The Profile screen is
// lazy-loaded, so listening only inside that screen can miss the event.
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  (window as Window & { __salarymanInstallPrompt?: Event }).__salarymanInstallPrompt = event;
  window.dispatchEvent(new Event("salaryman-install-ready"));
});
// AudioContext unlock must be armed synchronously: iOS requires the actual
// first user gesture, not a callback after an async chunk has loaded.
armAudioAutoUnlock();
installDeferredGlobalUiSound();
createRoot(document.getElementById("root")!).render(<App />);

// Keep the first render's dependency graph lean. These global listeners remain
// app-wide, but their audio/reporting implementations load after the browser has
// painted React once instead of blocking module evaluation and mount.
const afterFirstPaint = (start: () => void) => {
  requestAnimationFrame(() => window.setTimeout(start, 0));
};

afterFirstPaint(() => {
  if ("serviceWorker" in navigator) {
    const base = import.meta.env.BASE_URL;
    void navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base })
      .catch((error) => console.warn("[PWA] service worker registration failed:", error));
  }
  void import("./lib/errorReporter").then(({ installGlobalErrorHandlers }) => {
    installGlobalErrorHandlers();
  });
  warmGlobalUiSound();
});
