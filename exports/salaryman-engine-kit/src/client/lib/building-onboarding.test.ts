import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  completeReceptionTask,
  completeWorkArrivalTask,
  getActivePlayerTask,
  getBuildingOnboardingStage,
  getPlayerTasks,
  resetBuildingOnboarding,
  startBuildingOnboarding,
  subscribeBuildingOnboarding,
} from "./building-onboarding";

describe("building onboarding tasks", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("does not lock existing players who never started the arrival flow", () => {
    expect(getBuildingOnboardingStage()).toBe("not_started");
    expect(getActivePlayerTask()).toBeNull();
  });

  it("requires reception before activating the work-floor task", () => {
    startBuildingOnboarding();
    expect(getBuildingOnboardingStage()).toBe("reception");
    expect(getActivePlayerTask()?.id).toBe("report-to-reception");
    expect(getPlayerTasks()[1].status).toBe("locked");

    completeReceptionTask();
    expect(getBuildingOnboardingStage()).toBe("work");
    expect(getActivePlayerTask()?.id).toBe("enter-work-floor");

    completeWorkArrivalTask();
    expect(getBuildingOnboardingStage()).toBe("complete");
    expect(getActivePlayerTask()).toBeNull();
  });

  it("notifies the compact task indicator when reception advances the task", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeBuildingOnboarding(listener);
    startBuildingOnboarding();
    completeReceptionTask();
    unsubscribe();
    expect(listener).toHaveBeenNthCalledWith(1, "reception");
    expect(listener).toHaveBeenNthCalledWith(2, "work");
  });

  it("can clear stale local progress after a server-side fresh start", () => {
    startBuildingOnboarding();
    completeReceptionTask();
    completeWorkArrivalTask();
    expect(getBuildingOnboardingStage()).toBe("complete");

    resetBuildingOnboarding();

    expect(getBuildingOnboardingStage()).toBe("not_started");
    expect(getActivePlayerTask()).toBeNull();
  });
});