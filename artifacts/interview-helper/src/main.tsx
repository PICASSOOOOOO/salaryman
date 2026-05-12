import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n";
import { initLowGfx } from "./lib/lowGfx";
import { installGlobalErrorHandlers } from "./lib/errorReporter";

initLowGfx();
// Auto-report window.onerror + unhandledrejection to /api/feedback/error-report.
// React render errors are caught separately by ErrorBoundary.
installGlobalErrorHandlers();
createRoot(document.getElementById("root")!).render(<App />);
