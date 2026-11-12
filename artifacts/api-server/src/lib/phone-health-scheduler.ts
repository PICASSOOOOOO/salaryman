import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const PHONE_HEALTH_INTERVAL_MS = 19 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 60 * 1000;
const BETA_HOSTING_REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;
const BETA_HOSTING_REMINDER_HOUR = 9;
const BETA_HOSTING_TIME_ZONE = "Asia/Ho_Chi_Minh";

export function millisecondsUntilNextDaNangReminder(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BETA_HOSTING_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value ?? 0);
  const currentSeconds =
    part("hour") * 60 * 60 +
    part("minute") * 60 +
    part("second") +
    now.getMilliseconds() / 1000;
  const targetSeconds = BETA_HOSTING_REMINDER_HOUR * 60 * 60;
  const secondsUntil =
    currentSeconds < targetSeconds
      ? targetSeconds - currentSeconds
      : targetSeconds + 24 * 60 * 60 - currentSeconds;
  return Math.round(secondsUntil * 1000);
}

function runPhoneHealthScript(healthCheckPath: string, args: string[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [healthCheckPath, ...args],
      {
        cwd: path.dirname(healthCheckPath),
        env: {
          ...process.env,
          NODE_PATH: [
            path.resolve(path.dirname(healthCheckPath), "runtime/node_modules"),
            process.env.NODE_PATH,
          ].filter(Boolean).join(path.delimiter),
          PHONE_HEALTH_ALWAYS_EMAIL: "0",
        },
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

function runPhoneHealthCheck(healthCheckPath: string): Promise<void> {
  return runPhoneHealthScript(healthCheckPath);
}

function runBetaHostingReminder(healthCheckPath: string): Promise<void> {
  return runPhoneHealthScript(healthCheckPath, ["--beta-host-reminder"]);
}

/**
 * Run the existing live Twilio health check from the always-on production API
 * process. Replit Scheduled Deployments have an hourly minimum, so this timer
 * provides the 19-minute check cadence while the VM is running. The beta-host
 * decision reminder is a separate daily email at 9:00 AM Da Nang time.
 */
export function startPhoneHealthScheduler(
  runCheckImpl: (apiRoot: string) => Promise<void> = runPhoneHealthCheck,
  runReminderImpl: (apiRoot: string) => Promise<void> = runBetaHostingReminder,
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
    console.error("[Phone Health Scheduler] Could not locate the phone health check");
    return;
  }
  const healthCheckPath = path.join(apiRoot, "dist/phone-health-check.cjs");
  if (runCheckImpl === runPhoneHealthCheck && !existsSync(healthCheckPath)) {
    console.error("[Phone Health Scheduler] Could not locate the built phone health check");
    return;
  }
  const checkTarget = existsSync(healthCheckPath) ? healthCheckPath : apiRoot;

  let running = false;
  const runCheck = () => {
    if (running) {
      console.warn("[Phone Health Scheduler] Previous check is still running; skipping this tick");
      return;
    }

    running = true;
    console.log("[Phone Health Scheduler] Starting Twilio health check");
    void runCheckImpl(checkTarget)
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

  let reminderRunning = false;
  const runReminder = () => {
    if (process.env.BETA_HOSTING_PROVIDER?.trim()) {
      console.log("[Beta Host Reminder] Stopped: hosting provider is selected");
      return;
    }
    if (reminderRunning) {
      console.warn("[Beta Host Reminder] Previous reminder is still running; skipping this tick");
      return;
    }

    reminderRunning = true;
    console.log("[Beta Host Reminder] Sending daily beta-host reminder");
    void runReminderImpl(checkTarget).then(
      () => {
        reminderRunning = false;
        console.log("[Beta Host Reminder] Reminder sent");
      },
      (error) => {
        reminderRunning = false;
        console.error("[Beta Host Reminder] Reminder failed:", error);
      },
    );
  };

  const reminderDelay = millisecondsUntilNextDaNangReminder();
  const firstReminder = setTimeout(() => {
    runReminder();
    const interval = setInterval(runReminder, BETA_HOSTING_REMINDER_INTERVAL_MS);
    interval.unref();
  }, reminderDelay);
  firstReminder.unref();
  console.log("[Beta Host Reminder] Scheduled daily for 9:00 AM Da Nang time while host is undecided");
}
