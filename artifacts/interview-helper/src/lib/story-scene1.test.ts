import { describe, it, expect } from "vitest";
import {
  shouldResumeScene1,
  rebuildScene1SceneRun,
  snapshotScene1Checkpoint,
  canClaimScene1Camp,
  canFinalizeScene1Claim,
  SCENE1_CLAIM_RADIUS,
  shouldReplayMilaHandoff,
  SCENE1_ID,
  MILA_HANDOFF_PENDING,
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

describe("shouldReplayMilaHandoff (one-time handoff cutscene backstop)", () => {
  it("fires when the MX-75 is claimed (missionIndex >= 1) and the flag is pending", () => {
    expect(shouldReplayMilaHandoff({ active: true, missionIndex: 1 }, MILA_HANDOFF_PENDING)).toBe(true);
    // also fires for later missions while the flag is still pending
    expect(shouldReplayMilaHandoff({ active: true, missionIndex: 3 }, "pending")).toBe(true);
  });

  it("does NOT fire while still in Scene 1 (missionIndex < 1)", () => {
    expect(shouldReplayMilaHandoff({ active: true, missionIndex: 0 }, MILA_HANDOFF_PENDING)).toBe(false);
    // missing missionIndex is treated as 0 (still in Scene 1)
    expect(shouldReplayMilaHandoff({ active: true }, MILA_HANDOFF_PENDING)).toBe(false);
  });

  it("does NOT fire when the story is not active", () => {
    expect(shouldReplayMilaHandoff({ active: false, missionIndex: 1 }, MILA_HANDOFF_PENDING)).toBe(false);
    expect(shouldReplayMilaHandoff(null, MILA_HANDOFF_PENDING)).toBe(false);
    expect(shouldReplayMilaHandoff(undefined, MILA_HANDOFF_PENDING)).toBe(false);
  });

  it("does NOT fire when the flag is absent or already cleared", () => {
    expect(shouldReplayMilaHandoff({ active: true, missionIndex: 1 }, null)).toBe(false);
    expect(shouldReplayMilaHandoff({ active: true, missionIndex: 1 }, undefined)).toBe(false);
    expect(shouldReplayMilaHandoff({ active: true, missionIndex: 1 }, "")).toBe(false);
    expect(shouldReplayMilaHandoff({ active: true, missionIndex: 1 }, "done")).toBe(false);
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

describe("canClaimScene1Camp (camp claim is gated on battleDone)", () => {
  it("allows the claim once the breakout battle is won and the player is at the camp", () => {
    const sceneRun = { phase: "escape", battleDone: true };
    expect(canClaimScene1Camp(sceneRun, 0)).toBe(true);
    expect(canClaimScene1Camp(sceneRun, SCENE1_CLAIM_RADIUS - 1)).toBe(true);
  });

  it("BLOCKS the claim before the staged battle is won, even standing on the camp", () => {
    // Player beelines to the camp but the battle never finished — the gate must
    // hold so the claim cannot fire early and skip the battle.
    expect(canClaimScene1Camp({ phase: "escape", battleDone: false }, 0)).toBe(false);
    expect(canClaimScene1Camp({ phase: "escape" }, 0)).toBe(false);
  });

  it("BLOCKS the claim when the player is outside the camp radius even after the battle", () => {
    expect(canClaimScene1Camp({ phase: "escape", battleDone: true }, SCENE1_CLAIM_RADIUS)).toBe(false);
    expect(canClaimScene1Camp({ phase: "escape", battleDone: true }, 999)).toBe(false);
  });

  it("only fires during the ESCAPE phase (not intro/claim/done) and never without a run", () => {
    expect(canClaimScene1Camp({ phase: "intro", battleDone: true }, 0)).toBe(false);
    expect(canClaimScene1Camp({ phase: "claim", battleDone: true }, 0)).toBe(false);
    expect(canClaimScene1Camp({ phase: "done", battleDone: true }, 0)).toBe(false);
    expect(canClaimScene1Camp(null, 0)).toBe(false);
    expect(canClaimScene1Camp(undefined, 0)).toBe(false);
  });
});

describe("canFinalizeScene1Claim (idempotency guard)", () => {
  it("allows the finalize the first time (run still in claim, mission not yet advanced)", () => {
    expect(canFinalizeScene1Claim({ phase: "claim" }, { missionIndex: 0 })).toBe(true);
    expect(canFinalizeScene1Claim({ phase: "claim" }, {})).toBe(true);
    expect(canFinalizeScene1Claim({ phase: "claim" }, null)).toBe(true);
  });

  it("BLOCKS a re-run once the run has reached phase 'done'", () => {
    expect(canFinalizeScene1Claim({ phase: "done" }, { missionIndex: 0 })).toBe(false);
  });

  it("BLOCKS a re-run once the mission has advanced (missionIndex >= 1)", () => {
    expect(canFinalizeScene1Claim({ phase: "claim" }, { missionIndex: 1 })).toBe(false);
    expect(canFinalizeScene1Claim({ phase: "claim" }, { missionIndex: 2 })).toBe(false);
  });

  it("the camp-claim finalize runs EXACTLY ONCE even when triggered twice in a row", () => {
    // Model the durable state the live sceneClaimFinalize mutates, gated by the
    // same helper the live path calls. A double click / key-repeat fires the
    // finalize twice; the guard must let the effects run only on the first call.
    const state: {
      sceneRun: { phase: string };
      story: { missionIndex: number };
    } = { sceneRun: { phase: "claim" }, story: { missionIndex: 0 } };
    let grants = 0;
    const finalize = () => {
      if (!canFinalizeScene1Claim(state.sceneRun, state.story)) return;
      grants++;
      // Mirror the live finalize's terminal mutations.
      state.story.missionIndex = Math.max(state.story.missionIndex ?? 0, 1);
      state.sceneRun = { phase: "done" };
    };
    finalize();
    finalize();
    expect(grants).toBe(1);
    expect(state.story.missionIndex).toBe(1);
    expect(state.sceneRun.phase).toBe("done");
  });
});
