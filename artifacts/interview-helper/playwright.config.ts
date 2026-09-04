import { defineConfig, devices } from "@playwright/test";

const port = process.env.PORT ?? "3000";
// Real-Clerk smoke runs may target a dedicated controlled environment rather
// than the local workflow. Credentials are intentionally not part of config.
const baseURL = process.env.TOWER_E2E_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL,
    headless: true,
    // Accept all certs (dev server may use self-signed)
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Do not spin up a web server — tests expect the dev workflow to already be
  // running (via "artifacts/interview-helper: web" workflow).
});
