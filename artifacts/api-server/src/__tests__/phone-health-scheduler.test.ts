import { afterEach, describe, expect, it, vi } from "vitest";
import { startPhoneHealthScheduler } from "../lib/phone-health-scheduler";

describe("phone health scheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("starts in production and runs again every 19 minutes without overlap", async () => {
    vi.useFakeTimers();
    vi.stubEnv("NODE_ENV", "production");
    let finishFirstCheck!: () => void;
    const runCheck = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => { finishFirstCheck = resolve; }))
      .mockResolvedValue(undefined);

    startPhoneHealthScheduler(runCheck);
    expect(runCheck).not.toHaveBeenCalled();

    vi.advanceTimersByTime(60_000);
    expect(runCheck).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(19 * 60 * 1000);
    expect(runCheck).toHaveBeenCalledTimes(1);
    finishFirstCheck();
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(19 * 60 * 1000);
    expect(runCheck).toHaveBeenCalledTimes(2);
  });

  it("does not schedule live Twilio checks in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    const runCheck = vi.fn();

    startPhoneHealthScheduler(runCheck);
    expect(runCheck).not.toHaveBeenCalled();
  });
});
