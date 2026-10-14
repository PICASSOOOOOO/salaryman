import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const PHONE_HEALTH_INTERVAL_MS = 19 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 60 * 1000;

function runPhoneHealthCheck(apiRoot: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "src/scripts/phone-health-check.ts"],
      {
        cwd: apiRoot,
        env: { ...process.env, PHONE_HEALTH_ALWAYS_EMAIL: "0" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    child.stdout.on("data", (chunk: Buffer) => {
      process.stdout.write(`[Phone Health] ${chunk.toString()}`);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      process.stderr.write(`[Phone Health] ${chunk.toString()}`);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`health check exited with code ${code ?? "unknown"}`));
    });
  });
}

/**
 * Run the existing live Twilio health check from the always-on production API
 * process. Replit Scheduled Deployments have an hourly minimum, so this timer
 * provides the requested 19-minute cadence while the VM is running.
 */
export function startPhoneHealthScheduler(
  runCheckImpl: (apiRoot: string) => Promise<void> = runPhoneHealthCheck,
): void {
  if (process.env.NODE_ENV !== "production") return;

  const cwd = process.cwd();
  const candidates = [
    cwd,
    path.resolve(cwd, "artifacts/api-server"),
  ];
  const apiRoot = candidates.find((candidate) =>
    existsSync(path.join(candidate, "src/scripts/phone-health-check.ts")),
  );

  if (!apiRoot) {
    console.error("[Phone Health Scheduler] Could not locate phone-health-check.ts");
    return;
  }

  let running = false;
  const runCheck = () => {
    if (running) {
      console.warn("[Phone Health Scheduler] Previous check is still running; skipping this tick");
      return;
    }

    running = true;
    console.log("[Phone Health Scheduler] Starting Twilio health check");
    void runCheckImpl(apiRoot)
      .then(
        () => {
          running = false;
          console.log("[Phone Health Scheduler] Check passed");
        },
        (error) => {
          running = false;
          console.error("[Phone Health Scheduler] Check failed:", error);
        },
      );
  };

  const firstCheck = setTimeout(() => {
    runCheck();
    const interval = setInterval(runCheck, PHONE_HEALTH_INTERVAL_MS);
    interval.unref();
  }, FIRST_CHECK_DELAY_MS);
  firstCheck.unref();
  console.log("[Phone Health Scheduler] Twilio checks scheduled every 19 minutes");
}
