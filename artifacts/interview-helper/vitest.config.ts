import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// Lightweight test runner for the web client. Most tests render small slices of
// React state in jsdom; a few exercise the procedural audio helpers against a
// stubbed Web Audio API. The Vite React plugin handles the JSX/TS transform and
// the "@" alias mirrors vite.config.ts so test imports resolve identically.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // Pin react/react-dom to this artifact's copy so tests that import a
      // workspace lib's *source* (which lists react as a peer dep, not a local
      // one) resolve to a single react instance instead of failing to resolve.
      react: path.resolve(import.meta.dirname, "node_modules/react"),
      "react-dom": path.resolve(import.meta.dirname, "node_modules/react-dom"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
