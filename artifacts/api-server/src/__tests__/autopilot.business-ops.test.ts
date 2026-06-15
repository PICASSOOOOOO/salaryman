import { describe, it, expect } from "vitest";
import {
  nextTaskStatus,
  pickTasksToAdvance,
  pickStaleTimeEntries,
  nextApplicantStage,
  decideStaffingAction,
  shouldPostAnnouncement,
  buildRoutineAnnouncement,
  genCandidateName,
  DEFAULT_STAFF_TARGET,
  ANNOUNCEMENT_INTERVAL_MS,
  AUTOPILOT_ANNOUNCEMENT_CATEGORY,
} from "../lib/autopilot/business-ops-handler";

// The Business Ops autopilot's decision logic is factored into pure helpers so
// the per-tick behavior is pinned without touching the DB. The handler itself
// only wires these to the shared service functions + ctx guardrails.

describe("task progression", () => {
  it("walks the board flow forward and stops at done", () => {
    expect(nextTaskStatus("todo")).toBe("in_progress");
    expect(nextTaskStatus("in_progress")).toBe("review");
    expect(nextTaskStatus("review")).toBe("done");
    expect(nextTaskStatus("done")).toBeNull();
    expect(nextTaskStatus("bogus")).toBeNull();
  });

  it("advances the oldest-touched non-done tasks up to the limit", () => {
    const tasks = [
      { id: 1, title: "A", status: "done", updatedAt: "2026-01-01T00:00:00Z" },
      { id: 2, title: "B", status: "todo", updatedAt: "2026-01-03T00:00:00Z" },
      { id: 3, title: "C", status: "review", updatedAt: "2026-01-02T00:00:00Z" },
      { id: 4, title: "D", status: "in_progress", updatedAt: "2026-01-04T00:00:00Z" },
    ];
    const picked = pickTasksToAdvance(tasks, 2);
    expect(picked.map((t) => t.id)).toEqual([3, 2]); // done excluded, oldest first
  });

  it("never returns done tasks even when under the limit", () => {
    const tasks = [{ id: 1, title: "A", status: "done", updatedAt: "2026-01-01T00:00:00Z" }];
    expect(pickTasksToAdvance(tasks, 5)).toEqual([]);
  });
});

describe("stale time entries", () => {
  it("closes only prior-day active entries, never today's live session", () => {
    const entries = [
      { id: 1, date: "2026-06-14", status: "active", clockOut: null, employeeName: "X" },
      { id: 2, date: "2026-06-15", status: "active", clockOut: null, employeeName: "Y" }, // today
      { id: 3, date: "2026-06-13", status: "completed", clockOut: "17:00", employeeName: "Z" },
    ];
    const stale = pickStaleTimeEntries(entries, "2026-06-15");
    expect(stale.map((e) => e.id)).toEqual([1]);
  });
});

describe("staffing decisions (capacity = open requisitions)", () => {
  it("does nothing when there are no open seats and the team is at/above the baseline floor", () => {
    expect(decideStaffingAction({ activeStaff: DEFAULT_STAFF_TARGET, fallbackTarget: DEFAULT_STAFF_TARGET, openJobIds: [], applicants: [] }))
      .toEqual({ type: "none" });
  });

  it("never advances a candidate whose seat is closed (not an open requisition)", () => {
    // The applicant is on a closed job (99), so it's not an unfilled seat. With
    // the team at the floor, there's nothing to do — the closed-job offer is NOT
    // advanced toward hire.
    expect(decideStaffingAction({
      activeStaff: 5,
      fallbackTarget: 5,
      openJobIds: [],
      applicants: [{ id: 1, jobId: 99, stage: "offer", stageUpdatedAt: "2026-01-01T00:00:00Z" }],
    })).toEqual({ type: "none" });
  });

  it("advances the furthest-along applicant on an OPEN seat toward hire", () => {
    const action = decideStaffingAction({
      activeStaff: 0,
      fallbackTarget: 5,
      openJobIds: [10],
      applicants: [
        { id: 1, jobId: 10, stage: "applied", stageUpdatedAt: "2026-01-01T00:00:00Z" },
        { id: 2, jobId: 10, stage: "offer", stageUpdatedAt: "2026-01-01T00:00:00Z" },
      ],
    });
    expect(action).toEqual({ type: "advance", applicantId: 2, fromStage: "offer", toStage: "hired" });
  });

  it("ignores applicants attached to closed (non-open) listings", () => {
    // Open seat 10 has only a rejected applicant (unworked) → source for it;
    // the offer on closed seat 20 is irrelevant since that seat isn't open.
    const action = decideStaffingAction({
      activeStaff: 0,
      fallbackTarget: 5,
      openJobIds: [10],
      applicants: [
        { id: 1, jobId: 10, stage: "rejected", stageUpdatedAt: "2026-01-01T00:00:00Z" },
        { id: 2, jobId: 20, stage: "offer", stageUpdatedAt: "2026-01-01T00:00:00Z" },
      ],
    });
    expect(action).toEqual({ type: "source", jobId: 10 });
  });

  it("sources at most one candidate per open seat (never hires beyond capacity)", () => {
    // Seat 10 already has a hired person → considered filled; seat 11 is unworked
    // → source for 11 only. The filled seat does not get a second candidate.
    const action = decideStaffingAction({
      activeStaff: 0,
      fallbackTarget: 5,
      openJobIds: [10, 11],
      applicants: [{ id: 1, jobId: 10, stage: "hired", stageUpdatedAt: "2026-01-01T00:00:00Z" }],
    });
    expect(action).toEqual({ type: "source", jobId: 11 });
  });

  it("does nothing when the only open seat is filled and no fallback applies", () => {
    // Seat 10 has a hired person (filled), so no advance, no source; an open seat
    // exists so the fallback post_job branch is gated off → nothing to do.
    const action = decideStaffingAction({
      activeStaff: 0,
      fallbackTarget: 5,
      openJobIds: [10],
      applicants: [{ id: 1, jobId: 10, stage: "hired", stageUpdatedAt: "2026-01-01T00:00:00Z" }],
    });
    expect(action).toEqual({ type: "none" });
  });

  it("opens a fallback requisition only when below the floor with zero open seats", () => {
    expect(decideStaffingAction({ activeStaff: 1, fallbackTarget: 5, openJobIds: [], applicants: [] }))
      .toEqual({ type: "post_job", fallback: true });
  });

  it("nextApplicantStage stops at hired", () => {
    expect(nextApplicantStage("applied")).toBe("screening");
    expect(nextApplicantStage("offer")).toBe("hired");
    expect(nextApplicantStage("hired")).toBeNull();
    expect(nextApplicantStage("rejected")).toBeNull();
  });
});

describe("routine announcements", () => {
  it("posts when none exists, then rate-limits within the window", () => {
    const now = Date.now();
    expect(shouldPostAnnouncement(null, now, ANNOUNCEMENT_INTERVAL_MS)).toBe(true);
    expect(shouldPostAnnouncement(new Date(now - 1000), now, ANNOUNCEMENT_INTERVAL_MS)).toBe(false);
    expect(shouldPostAnnouncement(new Date(now - ANNOUNCEMENT_INTERVAL_MS - 1), now, ANNOUNCEMENT_INTERVAL_MS)).toBe(true);
  });

  it("builds an operations announcement stamped with the bot name", () => {
    const ann = buildRoutineAnnouncement("Pablo Jr", Date.now());
    expect(ann.category).toBe(AUTOPILOT_ANNOUNCEMENT_CATEGORY);
    expect(ann.authorName).toBe("Pablo Jr");
    expect(ann.title.length).toBeGreaterThan(0);
    expect(ann.content.length).toBeGreaterThan(0);
  });
});

describe("candidate sourcing", () => {
  it("is deterministic for the same seed and produces a two-part name", () => {
    expect(genCandidateName(42)).toBe(genCandidateName(42));
    expect(genCandidateName(42).split(" ")).toHaveLength(2);
  });
});
