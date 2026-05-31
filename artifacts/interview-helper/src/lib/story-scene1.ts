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

// Whether the culminating staged PABLO CORP breakout battle is eligible to FIRE.
//
// The battle fires once the player reaches the descent (`alleyReached`) and no
// battle has started/finished and none is currently active. `battleStarted` is
// derived from `battleDone` on reload-resume (see rebuildScene1SceneRun), so an
// interrupted (not-won) battle re-arms here instead of soft-locking: a battle
// that began but never finished comes back with battleStarted=false and re-fires,
// while a won battle (battleDone=true) keeps battleStarted=true and is skipped.
export function canStartScene1Battle(
  sceneRun:
    | { alleyReached?: boolean; battleStarted?: boolean; battleDone?: boolean }
    | null
    | undefined,
  battleActive: boolean,
): boolean {
  return (
    !!sceneRun &&
    !!sceneRun.alleyReached &&
    !sceneRun.battleStarted &&
    !sceneRun.battleDone &&
    !battleActive
  );
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

// localStorage flag value written when the MX-75 is claimed and the Mila handoff
// cutscene is queued; the cutscene page clears it once the handoff is shown.
export const MILA_HANDOFF_PENDING = 'pending';

// localStorage key holding the one-time Mila handoff cutscene delivery flag.
// WorldPlay writes MILA_HANDOFF_PENDING here at the MX-75 claim and the cutscene
// page clears it once the handoff is shown.
export const MILA_HANDOFF_KEY = 'salaryman.milaHandoff';

// The cutscene library id for the one-time Mila handoff.
export const MILA_HANDOFF_CUTSCENE_ID = 'mila-handoff';

// Whether a given cutscene id is the one-time Mila handoff.
export function isMilaHandoffCutscene(id: string | null | undefined): boolean {
  return id === MILA_HANDOFF_CUTSCENE_ID;
}

// Clear the pending Mila handoff flag once its cutscene is shown.
//
// The handoff is delivered "at least once": WorldPlay marks it pending at the
// MX-75 claim and replays it on reload (see shouldReplayMilaHandoff) until the
// cutscene page is reached. Reaching the page IS the delivery, so the page must
// clear the flag to stop any further replays. If this clear ever regresses the
// cutscene would replay forever on every load.
//
// Returns true when the id was the Mila handoff (a clear was attempted). Storage
// errors (e.g. blocked localStorage) are swallowed so the cutscene still runs.
export function clearMilaHandoffFlag(
  id: string | null | undefined,
  storage: Pick<Storage, 'removeItem'> | null | undefined,
): boolean {
  if (!isMilaHandoffCutscene(id)) return false;
  try {
    storage?.removeItem(MILA_HANDOFF_KEY);
  } catch {
    /* ignore */
  }
  return true;
}

// Durable backstop for the one-time Mila handoff cutscene: if the MX-75 was
// already claimed (missionIndex >= 1) but the handoff cutscene never got shown
// (its navigation was lost to a reload/unmount), it must replay on next load.
//
// The handoff is delivered "at least once": the camp-claim finalize sets the
// pending flag and navigates in the same tick, but if that navigation is ever
// lost the cutscene would be skipped forever because the finalize idempotency
// guard (missionIndex >= 1) blocks any re-fire. So on mount we replay when ALL
// hold:
//   - the story is active,
//   - Scene 1 is COMPLETE (missionIndex >= 1) — never fire before the claim,
//   - the durable flag is still 'pending' — the cutscene page clears it once
//     shown, so a delivered handoff never replays (at-most-once).
export function shouldReplayMilaHandoff(
  story: Scene1Story | null | undefined,
  milaHandoffFlag: string | null | undefined,
): boolean {
  return (
    !!story?.active &&
    (story.missionIndex ?? 0) >= 1 &&
    milaHandoffFlag === MILA_HANDOFF_PENDING
  );
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
