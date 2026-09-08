import { describe, it, expect } from "vitest";
import { mergeStoryOnSave, type StoryState } from "../routes/salaryman-saves";

// The one-way story merge runs on every PUT /salaryman/saves/:slot. It must
// preserve the server-authoritative commitment fields once the story is active
// AND let forward-progress fields (including the SCENE 1 mid-escape `scene1`
// checkpoint) pass through. Mission 1 relies on `scene1` riding this merge so a
// reload mid-escape resumes — if the merge ever drops it the reload would
// replay the breakout. These branches are easy to regress, so pin them.

function activeStory(overrides: Partial<StoryState> = {}): StoryState {
  return {
    active: true,
    startedAt: "2026-01-01T00:00:00.000Z",
    quarter: 1,
    chapter: 1,
    missionIndex: 0,
    homeBase: { kind: "campsite", x: 6620, y: 6520, label: "UNDERGROUND CAMP" },
    mx75Granted: true,
    assignmentsCompleted: [],
    ...overrides,
  };
}

describe("mergeStoryOnSave — SCENE 1 checkpoint survival", () => {
  it("passes a fresh scene1 checkpoint through the merge without dropping it", () => {
    const prior = activeStory({ scene1: undefined });
    const incoming = activeStory({
      scene1: { alleyReached: true, battleStarted: true, battleDone: false },
    });
    const merged = mergeStoryOnSave(prior, incoming);
    expect(merged?.scene1).toEqual({ alleyReached: true, battleStarted: true, battleDone: false });
  });

  it("passes an updated scene1 checkpoint through (won battle), overriding the prior", () => {
    const prior = activeStory({ scene1: { alleyReached: true, battleStarted: true, battleDone: false } });
    const incoming = activeStory({ scene1: { alleyReached: true, battleStarted: true, battleDone: true } });
    const merged = mergeStoryOnSave(prior, incoming);
    // The incoming (newer) checkpoint wins — the won battle is recorded.
    expect(merged?.scene1?.battleDone).toBe(true);
  });

  it("keeps the prior scene1 when a downgrade (inactive incoming) tries to wipe it", () => {
    const prior = activeStory({ scene1: { alleyReached: true, battleStarted: true, battleDone: true } });
    const incoming: StoryState = { ...activeStory(), active: false, scene1: undefined };
    const merged = mergeStoryOnSave(prior, incoming);
    // A stale/concurrent save that lost the story must NOT erase progress.
    expect(merged?.active).toBe(true);
    expect(merged?.scene1).toEqual({ alleyReached: true, battleStarted: true, battleDone: true });
  });
});

describe("mergeStoryOnSave — one-way commitment fields", () => {
  it("pins active/startedAt/homeBase/mx75Granted from the prior story", () => {
    const prior = activeStory({
      startedAt: "2025-12-31T12:00:00.000Z",
      homeBase: { kind: "campsite", x: 1, y: 2, label: "REAL CAMP" },
    });
    // A malicious/stale client tries to forge these immutable fields.
    const incoming = activeStory({
      startedAt: "2099-01-01T00:00:00.000Z",
      homeBase: { kind: "office", x: 999, y: 999, label: "FAKE" },
      mx75Granted: false,
      scene1: { alleyReached: true },
    });
    const merged = mergeStoryOnSave(prior, incoming);
    expect(merged?.active).toBe(true);
    expect(merged?.startedAt).toBe("2025-12-31T12:00:00.000Z");
    expect(merged?.homeBase).toEqual({ kind: "campsite", x: 1, y: 2, label: "REAL CAMP" });
    expect(merged?.mx75Granted).toBe(true);
    // Forward-progress fields (incl. scene1) still come from incoming.
    expect(merged?.scene1).toEqual({ alleyReached: true });
  });

  it("lets forward-progress fields (missionIndex/quarter/assignments) advance", () => {
    const prior = activeStory({ missionIndex: 0, quarter: 1, assignmentsCompleted: [] });
    const incoming = activeStory({ missionIndex: 1, quarter: 2, assignmentsCompleted: ["a1"] });
    const merged = mergeStoryOnSave(prior, incoming);
    expect(merged?.missionIndex).toBe(1);
    expect(merged?.quarter).toBe(2);
    expect(merged?.assignmentsCompleted).toEqual(["a1"]);
  });

  it("passes the incoming story through untouched when the prior story is not active", () => {
    const incoming = activeStory({ scene1: { alleyReached: true, battleDone: true } });
    expect(mergeStoryOnSave(undefined, incoming)).toBe(incoming);
    expect(mergeStoryOnSave({ ...activeStory(), active: false }, incoming)).toBe(incoming);
  });
});
