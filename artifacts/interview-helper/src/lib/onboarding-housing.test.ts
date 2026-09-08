import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  markPendingHousingAssessment,
  readPendingHousingAssessment,
  settlePendingHousingAssessment,
} from "./onboarding-housing";

describe("pending onboarding housing assessment", () => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
  };

  beforeEach(() => {
    vi.stubGlobal("localStorage", storage);
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("keeps a durable retry marker when settlement fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    markPendingHousingAssessment({ startingBalance: 200_000, officeTier: "capsule" });

    await expect(settlePendingHousingAssessment()).resolves.toBe(false);
    expect(readPendingHousingAssessment()).toEqual({
      startingBalance: 200_000,
      officeTier: "capsule",
    });
  });

  it("clears the marker only after the idempotent charge succeeds", async () => {
    localStorage.setItem("sm_save", JSON.stringify({ cityId: "huda_city", savings: 200_000 }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ alreadyCharged: false, remainingBalance: 198_000 }),
    }));
    markPendingHousingAssessment({ startingBalance: 200_000, officeTier: "capsule" });

    await expect(settlePendingHousingAssessment()).resolves.toBe(true);
    expect(readPendingHousingAssessment()).toBeNull();
    expect(JSON.parse(localStorage.getItem("sm_save") ?? "{}")).toMatchObject({
      cityId: "huda_city",
      savings: 198_000,
    });
  });
});