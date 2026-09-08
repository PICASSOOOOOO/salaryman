import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import legacy from "@vitejs/plugin-legacy";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { createRequire } from "module";

const _require = createRequire(import.meta.url);
const { getFormattedVersion, bumpVersion } = _require(path.resolve(__dirname, "../../version-utils.cjs"));

const isBuild = process.argv.includes("build");

if (isBuild) {
  try { bumpVersion(); } catch {}
}
const rawPort = process.env.PORT;

if (!rawPort && !isBuild) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = rawPort ? Number(rawPort) : 3000;

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss({ optimize: false }),
    runtimeErrorOverlay(),
    // Ship a parallel "legacy" bundle (with polyfills) for older browsers
    // — older Safari/iOS, older Edge, older Android Chrome. Modern browsers
    // still get the lean modern bundle via <script type="module">; legacy
    // browsers fall back to nomodule. Targets chosen to cover macOS Big Sur
    // Safari 14, iOS 14, Android 7 Chrome, Windows 7 Edge/Chrome.
    legacy({
      targets: [
        "defaults",
        "Safari >= 12",
        "iOS >= 12",
        "Chrome >= 64",
        "Firefox >= 67",
        "Edge >= 79",
        "not dead",
      ],
      modernPolyfills: true,
      renderLegacyChunks: true,
    }),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  define: {
    "__BUILD_VERSION__": JSON.stringify(getFormattedVersion()),
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // NOTE: plugin-legacy controls `build.target` for the modern chunk via its
    // own `targets` option (see plugins above). Setting it here would just be
    // overridden with a warning. We *do* still set cssTarget — plugin-legacy
    // doesn't manage CSS compatibility.
    cssTarget: ["chrome64", "safari12", "firefox67", "edge79"],
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("framer-motion")) {
              return "vendor-framer";
            }
            if (id.includes("@tanstack")) {
              return "vendor-tanstack";
            }
            if (
              id.includes("/react-dom/") ||
              id.includes("/react/")
            ) {
              return "vendor-react";
            }
          }
        },
      },
    },
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:8080",
        ws: true,
      },
      "/sites": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
