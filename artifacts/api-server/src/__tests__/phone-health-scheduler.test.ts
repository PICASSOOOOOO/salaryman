import { afterEach, describe, expect, it, vi } from "vitest";
import {
  millisecondsUntilNextDaNangReminder,
  startPhoneHealthScheduler,
} from "../lib/phone-health-scheduler";

describe("phone health scheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("starts in production and runs again every 19 minutes without overlap", async () => {
    vi.useFakeTimers();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETA_HOSTING_PROVIDER", "selected");
    let finishFirstCheck!: () => void;
    const runCheck = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => { finishFirstCheck = resolve; }))
      .mockResolvedValue(undefined);

    startPhoneHealthScheduler(runCheck, vi.fn().mockResolvedValue(undefined));
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

    startPhoneHealthScheduler(runCheck, vi.fn());
    expect(runCheck).not.toHaveBeenCalled();
  });

  it("calculates the next reminder at 9 AM Da Nang time", () => {
    const beforeNine = new Date("2026-11-13T01:00:00.000Z"); // 8 AM in Da Nang.
    const atNine = new Date("2026-11-13T02:00:00.000Z"); // 9 AM in Da Nang.

    expect(millisecondsUntilNextDaNangReminder(beforeNine)).toBe(60 * 60 * 1000);
    expect(millisecondsUntilNextDaNangReminder(atNine)).toBe(24 * 60 * 60 * 1000);
  });

  it("sends one daily reminder at 9 AM while the hosting provider is undecided", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-13T01:00:00.000Z")); // 8 AM in Da Nang.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETA_HOSTING_PROVIDER", "");
    const runCheck = vi.fn().mockResolvedValue(undefined);
    const runReminder = vi.fn().mockResolvedValue(undefined);

    startPhoneHealthScheduler(runCheck, runReminder);
    expect(runReminder).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(runReminder).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(runReminder).toHaveBeenCalledTimes(2);
  });

  it("does not send the daily reminder after a host is selected", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-13T01:00:00.000Z"));
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETA_HOSTING_PROVIDER", "aws");
    const runReminder = vi.fn().mockResolvedValue(undefined);

    startPhoneHealthScheduler(vi.fn().mockResolvedValue(undefined), runReminder);
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);

    expect(runReminder).not.toHaveBeenCalled();
  });
});
