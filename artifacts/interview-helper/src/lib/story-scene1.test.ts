import { describe, it, expect } from "vitest";
import {
  shouldResumeScene1,
  rebuildScene1SceneRun,
  snapshotScene1Checkpoint,
  SCENE1_ID,
  type Scene1Checkpoint,
} from "./story-scene1";

// SCENE 1 ("AND IT ALL FALLS DOWN") persists mid-escape progress onto the
// data.story save blob so a reload mid-escape resumes instead of replaying the
// breakout. The reload-resume backstop in WorldPlay calls these pure helpers;
// the branches below are easy to regress, so pin them.

describe("shouldResumeScene1 (reload-resume gate)", () => {
  it("fires for an active story still in Scene 1 with no live sceneRun", () => {
    expect(shouldResumeScene1({ active: true, missionIndex: 0 }, false)).toBe(true);
  });

  it("does NOT fire when a sceneRun already exists (story is mid-play, not reloaded)", () => {
    expect(shouldResumeScene1({ active: true, missionIndex: 0 }, true)).toBe(false);
  });

  it("does NOT fire once Scene 1 is complete (missionIndex >= 1)", () => {
    expect(shouldResumeScene1({ active: true, missionIndex: 1 }, false)).toBe(false);
  });

  it("does NOT fire when the story is not active", () => {
    expect(shouldResumeScene1({ active: false, missionIndex: 0 }, false)).toBe(false);
    expect(shouldResumeScene1(null, false)).toBe(false);
    expect(shouldResumeScene1(undefined, false)).toBe(false);
  });

  it("treats a missing missionIndex as 0 (still in Scene 1)", () => {
    expect(shouldResumeScene1({ active: true }, false)).toBe(true);
  });
});

describe("rebuildScene1SceneRun (checkpoint -> ephemeral sceneRun)", () => {
  it("drops the player back into the playable ESCAPE phase", () => {
    const run = rebuildScene1SceneRun({}, 1000);
    expect(run.id).toBe(SCENE1_ID);
    expect(run.phase).toBe("escape");
    expect(run.startTime).toBe(1000);
  });

  it("restores alleyReached from the checkpoint", () => {
    expect(rebuildScene1SceneRun({ alleyReached: true }).alleyReached).toBe(true);
    expect(rebuildScene1SceneRun({ alleyReached: false }).alleyReached).toBe(false);
  });

  it("a won battle (battleDone) does NOT replay: battleStarted is derived true", () => {
    const run = rebuildScene1SceneRun({ alleyReached: true, battleStarted: true, battleDone: true });
    expect(run.battleDone).toBe(true);
    // battleStarted is derived from battleDone so the won battle is skipped, not replayed.
    expect(run.battleStarted).toBe(true);
  });

  it("an interrupted battle re-arms: battleStarted derived from battleDone, NOT restored raw", () => {
    // Checkpoint says the battle started but never finished. Restoring the raw
    // battleStarted=true would soft-lock (camp claim is gated on battleDone), so
    // the rebuild must DERIVE battleStarted from battleDone (false here) so the
    // battle re-arms.
    const checkpoint: Scene1Checkpoint = { alleyReached: true, battleStarted: true, battleDone: false };
    const run = rebuildScene1SceneRun(checkpoint);
    expect(run.battleDone).toBe(false);
    expect(run.battleStarted).toBe(false);
  });

  it("a fresh escape (empty/missing checkpoint) starts with everything false", () => {
    for (const cp of [undefined, null, {}] as const) {
      const run = rebuildScene1SceneRun(cp);
      expect(run.alleyReached).toBe(false);
      expect(run.battleStarted).toBe(false);
      expect(run.battleDone).toBe(false);
    }
  });
});

describe("snapshotScene1Checkpoint (sceneRun -> durable checkpoint)", () => {
  it("mirrors the live milestones and coerces to booleans", () => {
    expect(snapshotScene1Checkpoint({ alleyReached: true, battleStarted: true, battleDone: false })).toEqual({
      alleyReached: true,
      battleStarted: true,
      battleDone: false,
    });
    // Missing fields become explicit false, never undefined.
    expect(snapshotScene1Checkpoint({})).toEqual({
      alleyReached: false,
      battleStarted: false,
      battleDone: false,
    });
  });

  it("round-trips through a won-battle resume without replaying the battle", () => {
    const live = { alleyReached: true, battleStarted: true, battleDone: true };
    const resumed = rebuildScene1SceneRun(snapshotScene1Checkpoint(live));
    expect(resumed.battleDone).toBe(true);
    expect(resumed.battleStarted).toBe(true);
    expect(resumed.alleyReached).toBe(true);
  });
});
