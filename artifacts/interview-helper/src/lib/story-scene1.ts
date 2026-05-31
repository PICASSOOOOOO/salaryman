// SCENE 1 ("AND IT ALL FALLS DOWN") mid-escape resume logic, extracted as pure
// helpers so the reload-resume backstop in WorldPlay can be unit-tested.
//
// The per-run `sceneRun` (phase/cinematic) is ephemeral and is lost on a page
// reload, but the coarse breakout milestones are mirrored onto the durable
// `data.story.scene1` checkpoint. On reload the resume backstop rebuilds the
// ephemeral `sceneRun` from that checkpoint so the player drops straight back
// into the playable ESCAPE phase instead of replaying the breakout from the top.

// Durable checkpoint stored on the save blob (data.story.scene1).
export type Scene1Checkpoint = {
  alleyReached?: boolean;
  battleStarted?: boolean;
  battleDone?: boolean;
};

// Ephemeral per-run scene state (matches the shape used in WorldPlay).
export type Scene1SceneRun = {
  id: string;
  phase: 'intro' | 'escape' | 'claim' | 'done';
  startTime: number;
  alleyReached: boolean;
  battleStarted?: boolean;
  battleDone?: boolean;
};

// Minimal story shape the resume gate needs.
type Scene1Story = {
  active?: boolean;
  missionIndex?: number;
  scene1?: Scene1Checkpoint;
};

export const SCENE1_ID = 'and_it_all_falls_down';

// Whether the reload-resume backstop should fire: the story is active, Scene 1
// has not yet completed (missionIndex < 1), and the ephemeral run was lost.
export function shouldResumeScene1(
  story: Scene1Story | null | undefined,
  hasSceneRun: boolean,
): boolean {
  return !!story?.active && (story.missionIndex ?? 0) < 1 && !hasSceneRun;
}

// Rebuild the ephemeral sceneRun from the durable checkpoint.
//
// `battleStarted` is intentionally DERIVED from `battleDone` (not restored from
// the checkpoint's raw `battleStarted`): a battle that began but never finished
// must be allowed to re-arm, otherwise the camp claim (gated on `battleDone`)
// would soft-lock. So an interrupted battle replays just the battle, while a won
// battle skips straight to the camp run.
export function rebuildScene1SceneRun(
  checkpoint: Scene1Checkpoint | null | undefined,
  now: number = Date.now(),
): Scene1SceneRun {
  const alleyReached = !!checkpoint?.alleyReached;
  const battleDone = !!checkpoint?.battleDone;
  return {
    id: SCENE1_ID,
    phase: 'escape',
    startTime: now,
    alleyReached,
    battleStarted: battleDone,
    battleDone,
  };
}

// Proximity radius (world units) within which the player may CLAIM the camp.
export const SCENE1_CLAIM_RADIUS = 70;

// Whether the player may transition the ESCAPE phase into the CLAIM cinematic.
//
// The camp claim is HARD-GATED on `battleDone`: the staged PABLO CORP breakout
// battle must be won (its onComplete flips battleDone) before reaching the camp
// can trigger the claim. Without this gate a player who beelines past the
// (unfinished) battle to the camp would claim early and skip the battle.
export function canClaimScene1Camp(
  sceneRun: { phase?: string; battleDone?: boolean } | null | undefined,
  distToCamp: number,
  radius: number = SCENE1_CLAIM_RADIUS,
): boolean {
  return (
    !!sceneRun &&
    sceneRun.phase === 'escape' &&
    !!sceneRun.battleDone &&
    distToCamp < radius
  );
}

// Whether the camp-claim finalize is allowed to RUN. The finalize grants the
// MX-75, restores the cached pre-scene zoom and marks the scene complete; it
// must be idempotent so a double click / key-repeat can't re-run it (a re-run
// would zero the cached `sceneZoomPrev` and re-grant the device). Once the run
// reaches phase 'done' OR the mission has advanced (missionIndex >= 1) the
// finalize is a no-op.
export function canFinalizeScene1Claim(
  sceneRun: { phase?: string } | null | undefined,
  story: { missionIndex?: number } | null | undefined,
): boolean {
  return sceneRun?.phase !== 'done' && (story?.missionIndex ?? 0) < 1;
}

// Snapshot the live sceneRun milestones into the durable checkpoint shape.
export function snapshotScene1Checkpoint(sceneRun: {
  alleyReached?: boolean;
  battleStarted?: boolean;
  battleDone?: boolean;
}): Scene1Checkpoint {
  return {
    alleyReached: !!sceneRun.alleyReached,
    battleStarted: !!sceneRun.battleStarted,
    battleDone: !!sceneRun.battleDone,
  };
}
