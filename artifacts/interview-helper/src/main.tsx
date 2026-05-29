import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n";
import { initLowGfx } from "./lib/lowGfx";
import { installGlobalErrorHandlers } from "./lib/errorReporter";
import { installGlobalUiSound } from "./lib/global-ui-sound";

initLowGfx();
// One document-level listener gives every button / dropdown / toggle a click
// sound without touching individual call sites.
installGlobalUiSound();
// Auto-report window.onerror + unhandledrejection to /api/feedback/error-report.
// React render errors are caught separately by ErrorBoundary.
installGlobalErrorHandlers();
createRoot(document.getElementById("root")!).render(<App />);
