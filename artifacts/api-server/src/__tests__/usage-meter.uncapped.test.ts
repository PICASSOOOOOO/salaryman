import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: [] as Array<{ userId: string; periodYearMonth: string; kind: string; count: number }>,
  execute: vi.fn(),
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return {
    ...actual,
    db: {
      select: () => ({
        from: () => ({
          where: async () => mocks.rows,
        }),
      }),
      insert: () => ({
        values: (value: { userId: string; periodYearMonth: string; kind: string; count: number }) => ({
          onConflictDoUpdate: async () => {
            const existing = mocks.rows.find(row =>
              row.userId === value.userId &&
              row.periodYearMonth === value.periodYearMonth &&
              row.kind === value.kind,
            );
            if (existing) existing.count += value.count;
            else mocks.rows.push(value);
          },
        }),
      }),
      execute: mocks.execute,
    },
  };
});
vi.mock("../lib/plan", () => ({
  isOwnerEmail: () => false,
  isActiveDeveloperOrgMember: async () => false,
}));

import { consumeUsage, getAllUsage } from "../lib/usage-meter";

describe("uncapped prep usage meters", () => {
  beforeEach(() => {
    mocks.rows = [{
      userId: "prep-meter-user",
      periodYearMonth: new Date().toISOString().slice(0, 7),
      kind: "prep_meeting",
      count: 50_001,
    }];
    mocks.execute.mockClear();
  });

  it("reports estimated prep usage without a customer quota", async () => {
    const usage = await getAllUsage("prep-meter-user");

    expect(usage.prep_meeting).toEqual({
      used: 50_001,
      limit: null,
      remaining: null,
      throttled: false,
    });
  });

  it("records prep usage above the former estimate without blocking", async () => {
    const result = await consumeUsage("prep-meter-user", null, "prep_meeting");

    expect(result).toEqual({ allowed: true, used: 50_002, limit: null });
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
