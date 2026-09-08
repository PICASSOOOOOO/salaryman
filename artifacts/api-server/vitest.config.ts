import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/__tests__/setup.ts"],
    pool: "forks",
    // The phone routes write to the shared dev database scoped by a unique
    // synthetic userId per test file. Run files serially so concurrent
    // suites can't interfere with each other's rows.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
