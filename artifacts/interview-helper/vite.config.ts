import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const BUILD_NUMBER_FILE = path.resolve(__dirname, "BUILD_NUMBER");

function getBuildNumber(bump: boolean): number {
  let num = 1;
  try { num = parseInt(readFileSync(BUILD_NUMBER_FILE, "utf-8").trim(), 10) || 1; } catch {}
  if (bump) { num++; try { writeFileSync(BUILD_NUMBER_FILE, String(num), "utf-8"); } catch {} }
  return num;
}

function getVersionStamp(): string {
  const isBuildCmd = process.argv.includes("build");
  const buildNum = getBuildNumber(isBuildCmd);
  let gitHash = "unknown";
  try {
    gitHash = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {}
  return `v${buildNum} · ${gitHash}`;
}

const isBuild = process.argv.includes("build");
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
    tailwindcss(),
    runtimeErrorOverlay(),
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
    "__BUILD_VERSION__": JSON.stringify(getVersionStamp()),
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react/jsx-runtime"],
          "vendor-tanstack": ["@tanstack/react-query"],
        },
      },
    },
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
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
