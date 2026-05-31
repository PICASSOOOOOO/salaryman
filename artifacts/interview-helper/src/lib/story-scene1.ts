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

// ── STORY CONTACT (the very first gate: lighting the uplink beacon) ──────────
// The dormant MX-75 uplink beacon sits in the central plaza. Making contact is a
// deliberate, ONE-WAY commitment that begins the story; the server is the sole
// authority on whether the story may begin (this is just the in-world prompt
// gate). The beacon — and the whole story — is confined to the city-center ->
// underground corridor, so the beacon must never light up beyond that boundary.
export const STORY_TRIGGER = { x: 6960, y: 6300, r: 46, label: 'MX-75 UPLINK BEACON' };
export const STORY_CORRIDOR = { x: 6180, y: 5780, w: 1080, h: 1720 };

// Whether a world position falls inside the story corridor.
export function inStoryCorridor(px: number, py: number): boolean {
  return px >= STORY_CORRIDOR.x && px <= STORY_CORRIDOR.x + STORY_CORRIDOR.w
    && py >= STORY_CORRIDOR.y && py <= STORY_CORRIDOR.y + STORY_CORRIDOR.h;
}

// Whether the player has completed their first project and is therefore eligible
// to BEGIN the story: employed at a job OR owns at least one business.
export function isStoryContactEligible(
  employedAt: string | null | undefined,
  businessCount: number | null | undefined,
): boolean {
  return (employedAt != null && employedAt !== '') || ((businessCount ?? 0) > 0);
}

// Whether the dormant uplink beacon should light up and offer contact to BEGIN
// the story. Fires only when ALL hold:
//   - the story is NOT already active (the contact is a one-way door),
//   - the player is eligible (has a job or a business),
//   - the player is inside the story corridor,
//   - the player is within the beacon's trigger radius.
// This is easy to regress — an ineligible player must never see the prompt, and
// the beacon must never light up outside the corridor or beyond its radius.
export function canContactStoryBeacon(
  storyActive: boolean | null | undefined,
  employedAt: string | null | undefined,
  businessCount: number | null | undefined,
  px: number,
  py: number,
): boolean {
  if (storyActive) return false;
  if (!isStoryContactEligible(employedAt, businessCount)) return false;
  if (!inStoryCorridor(px, py)) return false;
  return Math.hypot(px - STORY_TRIGGER.x, py - STORY_TRIGGER.y) < STORY_TRIGGER.r;
}

// ── MAKING CONTACT actually BEGINS the story (the one-way door closing) ──────
// Pressing [E] on the LIT beacon commits the story: it calls the server begin
// endpoint and, on success, relocates the player's permanent home base to the
// UNDERGROUND CAMP and flips story.active. This is the highest-impact moment in
// Scene 1 — a regression here could begin the story without the server commit,
// or relocate the home base before the server confirms — so the decision is
// pulled out as a pure helper.

// The UNDERGROUND CAMP — the permanent home base the story relocates the player
// to once contact is made. Single source of truth on the client; it MUST stay
// in lockstep with the server's STORY_HOME (routes/salaryman-saves.ts), which is
// the authority that actually writes homeBase into the begun story.
export const STORY_HOME = { kind: 'campsite' as const, x: 6620, y: 6520, label: 'UNDERGROUND CAMP' };

export type StoryHomeBase = { kind?: string; x: number; y: number; label?: string };

// The minimal shape of the story the server returns from the begin endpoint.
export type StoryBeginState = {
  active?: boolean;
  homeBase?: StoryHomeBase | null;
  missionIndex?: number;
  mx75Granted?: boolean;
};

// The parsed JSON body of POST /salaryman/story/:slot/begin (or null if the
// response body failed to parse).
export type StoryBeginResponse =
  | { ok?: boolean; story?: StoryBeginState | null; error?: string | null }
  | null
  | undefined;

// The decision the begin handler acts on: either begin with the server's story,
// or do not begin (with the reason so the caller can narrate / stay silent).
export type StoryBeginDecision =
  | { begin: true; story: StoryBeginState }
  | { begin: false; reason: 'already-active' | 'rejected'; error?: string };

// Decide whether making contact actually BEGINS the story.
//
// Three invariants, each easy to regress and high-impact:
//   - ONE-WAY: if the story is already active, begin is a NO-OP. The home base
//     can therefore never be relocated a second time (begin fires exactly once).
//   - SERVER-AUTHORITATIVE: the story only begins when the begin endpoint
//     succeeds (httpOk) AND returns an ACTIVE story. A network failure, a non-2xx
//     response, or an `ok:false`/missing-story body must NOT flip the story active
//     or relocate the home base locally — the beacon stays dark.
//   - The begun story (including its home-base relocation to the UNDERGROUND
//     CAMP) is taken verbatim from the server response; the client never
//     fabricates it.
export function decideStoryBegin(
  currentStoryActive: boolean | null | undefined,
  httpOk: boolean,
  response: StoryBeginResponse,
): StoryBeginDecision {
  // One-way guard — already begun, do nothing (no second relocation).
  if (currentStoryActive) return { begin: false, reason: 'already-active' };
  // Server-authoritative: only a successful, active story may begin.
  if (!httpOk || !response?.ok || !response.story || !response.story.active) {
    return { begin: false, reason: 'rejected', error: response?.error ?? undefined };
  }
  return { begin: true, story: response.story };
}

// Whether a home base lands on the UNDERGROUND CAMP (the relocation target). Used
// to confirm the server begin actually relocated the player home, not somewhere
// stale. Compares position only — the camp is identified by its coordinates.
export function isUndergroundCampHome(homeBase: StoryHomeBase | null | undefined): boolean {
  return !!homeBase && homeBase.x === STORY_HOME.x && homeBase.y === STORY_HOME.y;
}

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

// The BACK ALLEY service-vent waypoint — the "out the back" route from the plaza
// beacon down to the UNDERGROUND CAMP. Reaching the camp (STORY_HOME) is what
// claims the terminal; the alley is the guided midpoint the escape objective
// points at first. Client-only today, but kept here alongside the other story
// landmarks as the single source of truth so the story map stays easy to reason
// about (and can be held in lockstep if the server ever re-declares it).
export const STORY_ALLEY = { x: 6790, y: 6420, r: 78, label: 'BACK ALLEY' };

// Proximity radius (world units) within which approaching the UNDERGROUND CAMP
// counts as reaching the descent, even if the player never touched the vent
// waypoint. Larger than the claim radius so a beeliner trips the descent beat
// (and the staged battle) well before they could stand on the camp.
export const SCENE1_DESCENT_CAMP_RADIUS = 150;

// Whether the player has REACHED the descent (the `alleyReached` milestone).
//
// Fires once the player is either within the BACK ALLEY / service-vent waypoint
// radius OR within the camp-approach radius — so a player who beelines straight
// for the camp still trips the descent beat (and arms the staged battle) instead
// of soft-locking. Returns false once `alleyReached` is already set, so it does
// not re-fire.
export function canReachScene1Descent(
  sceneRun: { alleyReached?: boolean } | null | undefined,
  distToVent: number,
  ventRadius: number,
  distToCamp: number,
  campRadius: number = SCENE1_DESCENT_CAMP_RADIUS,
): boolean {
  return (
    !!sceneRun &&
    !sceneRun.alleyReached &&
    (distToVent < ventRadius || distToCamp < campRadius)
  );
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

// ── CAMP CLAIM REWARD (the terminal side effects of finalizing Scene 1) ─────
// Once the claim is allowed to run (canFinalizeScene1Claim) the finalize applies
// the reward: it grants a working MX-75 device, flips story.mx75Granted, advances
// the mission past Scene 1 (missionIndex >= 1) and records the Scene 1 assignment
// as complete EXACTLY ONCE. These were previously inline in WorldPlay; pulling
// them out makes the reward idempotent and testable. A regression here would
// silently break the reward moment (double-grant on key-repeat, or the mission /
// assignment failing to advance, which also gates downstream story eligibility).

// The working MX-75 the claim grants. Single source of truth; the finalize reads
// this so the grant can never drift from a hand-written copy.
export type Scene1DeviceState = {
  hasDevice: boolean;
  deviceBroken: boolean;
  deviceDurability: number;
};
export const SCENE1_DEVICE_GRANT: Scene1DeviceState = {
  hasDevice: true,
  deviceBroken: false,
  deviceDurability: 100,
};

// The minimal story shape the reward reads/writes.
export type Scene1ClaimRewardStory = {
  missionIndex?: number;
  mx75Granted?: boolean;
  assignmentsCompleted?: string[];
};

export type Scene1ClaimRewardResult<S extends Scene1ClaimRewardStory> = {
  story: S;
  device: Scene1DeviceState;
};

// Apply the camp-claim reward, returning the updated story plus the device grant.
//
// PURE + IDEMPOTENT: the input story is never mutated; a fresh story is returned
// with the reward applied. Calling it repeatedly (e.g. a double click / key-
// repeat that slips past the finalize guard) converges on the same result — the
// mission never advances past 1, mx75Granted stays true, and the Scene 1
// assignment id is added at most once (never duplicated). The device grant is a
// constant, so re-applying it is inherently idempotent.
export function applyScene1ClaimReward<S extends Scene1ClaimRewardStory>(
  story: S,
): Scene1ClaimRewardResult<S> {
  const prev = story.assignmentsCompleted ?? [];
  const assignmentsCompleted = prev.includes(SCENE1_ID) ? prev.slice() : [...prev, SCENE1_ID];
  return {
    story: {
      ...story,
      missionIndex: Math.max(story.missionIndex ?? 0, 1),
      mx75Granted: true,
      assignmentsCompleted,
    },
    device: { ...SCENE1_DEVICE_GRANT },
  };
}

// ── INTRO → ESCAPE advance ──────────────────────────────────────────────────
// The opening "intro" cinematic ("AND IT ALL FALLS DOWN") ends when the player
// dismisses the line crawl, dropping them into the playable ESCAPE phase. This
// is the only transition out of the frozen intro, so a regression (advancing to
// the wrong phase, or not advancing at all) would soft-lock the scene on the
// cinematic. Returns the sceneRun with phase flipped to 'escape', preserving the
// run's milestones; a missing run passes through unchanged.
export function advanceScene1FromIntro(
  sceneRun: Scene1SceneRun | null | undefined,
): Scene1SceneRun | null {
  if (!sceneRun) return null;
  return { ...sceneRun, phase: 'escape' };
}

// ── SCENE TIGHT ZOOM (cache on begin, restore on finalize) ──────────────────
// Beginning the story snaps the camera in close — "almost first person" — so the
// collapse feels claustrophobic; the player's pre-scene zoom is cached and then
// restored exactly once when the scene finalizes. A regression here would leave
// the camera stuck at the tight scene zoom after Scene 1 (zoom never restored).
export const SCENE1_ZOOM_MULT = 1.7;
export const SCENE1_ZOOM_MIN = 5.6;

// The tight scene zoom applied on begin: the player's current zoom pushed in by
// the scene multiplier, floored at the scene minimum so even a zoomed-out player
// snaps close. Intentionally may exceed ISO_ZOOM_MAX (the render path uses the
// unclamped zoom; only wheel/pinch clamp).
export function sceneTightZoom(currentZoom: number): number {
  return Math.max(currentZoom * SCENE1_ZOOM_MULT, SCENE1_ZOOM_MIN);
}

// The zoom to restore on finalize: the cached pre-scene zoom if one was stored
// (> 0), otherwise the default zoom fallback. The finalize zeroes the cache
// after calling this, and its idempotency guard (canFinalizeScene1Claim) ensures
// the restore runs exactly once — a second finalize would see cache 0 and must
// not clobber the just-restored zoom (hence the fallback is only a safety net).
export function restoreSceneZoom(prevZoom: number, fallbackZoom: number): number {
  return prevZoom > 0 ? prevZoom : fallbackZoom;
}

// ── ESCAPE-PHASE FRAME ORDERING (descent → battle → claim) ──────────────────
// Each frame of the playable ESCAPE phase runs three milestone gates IN ORDER
// against the (progressively mutated) sceneRun: reach the descent, start the
// staged breakout battle, then — only after the battle is won — claim the camp.
// The ordering is load-bearing:
//   - A beeliner who reaches the camp-approach radius trips BOTH the descent and
//     the battle-start in the SAME frame (descent sets alleyReached, which arms
//     the battle gate), so the staged battle can never be skipped.
//   - The claim is gated on battleDone, which only flips on the battle's async
//     onComplete (a LATER frame), so the claim can NEVER fire in the same frame
//     the battle starts — no early claim that skips the fight.
// This pure helper mirrors the live loop so the ordering can be regression-tested.
export type Scene1EscapeEvent = 'descent' | 'battle-start' | 'claim';

export type Scene1EscapeFrameInput = {
  sceneRun: Scene1SceneRun;
  distToVent: number;
  ventRadius: number;
  distToCamp: number;
  battleActive: boolean;
};

export type Scene1EscapeFrameResult = {
  events: Scene1EscapeEvent[];
  sceneRun: Scene1SceneRun;
};

export function stepScene1EscapeFrame(input: Scene1EscapeFrameInput): Scene1EscapeFrameResult {
  const sceneRun: Scene1SceneRun = { ...input.sceneRun };
  const events: Scene1EscapeEvent[] = [];
  // Gates only run during the playable escape; any other phase is a no-op frame.
  if (sceneRun.phase !== 'escape') return { events, sceneRun };

  if (canReachScene1Descent(sceneRun, input.distToVent, input.ventRadius, input.distToCamp)) {
    sceneRun.alleyReached = true;
    events.push('descent');
  }
  // Reads the now-mutated alleyReached, so a beeliner arms the battle same-frame.
  if (canStartScene1Battle(sceneRun, input.battleActive)) {
    sceneRun.battleStarted = true;
    events.push('battle-start');
  }
  // Gated on battleDone (set by the battle's async onComplete in a later frame),
  // so this never fires in the same frame the battle starts.
  if (canClaimScene1Camp(sceneRun, input.distToCamp)) {
    sceneRun.phase = 'claim';
    events.push('claim');
  }
  return { events, sceneRun };
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
