import { describe, it, expect } from "vitest";
import {
  shouldResumeScene1,
  rebuildScene1SceneRun,
  snapshotScene1Checkpoint,
  canReachScene1Descent,
  canStartScene1Battle,
  canClaimScene1Camp,
  canFinalizeScene1Claim,
  applyScene1ClaimReward,
  SCENE1_DEVICE_GRANT,
  advanceScene1FromIntro,
  sceneTightZoom,
  restoreSceneZoom,
  stepScene1EscapeFrame,
  SCENE1_ZOOM_MULT,
  SCENE1_ZOOM_MIN,
  shouldReplayMilaHandoff,
  clearMilaHandoffFlag,
  isMilaHandoffCutscene,
  canContactStoryBeacon,
  isStoryContactEligible,
  inStoryCorridor,
  decideStoryBegin,
  isUndergroundCampHome,
  STORY_HOME,
  STORY_TRIGGER,
  STORY_CORRIDOR,
  SCENE1_CLAIM_RADIUS,
  SCENE1_DESCENT_CAMP_RADIUS,
  SCENE1_ID,
  MILA_HANDOFF_PENDING,
  MILA_HANDOFF_KEY,
  MILA_HANDOFF_CUTSCENE_ID,
  type Scene1Checkpoint,
} from "./story-scene1";

// SCENE 1 ("AND IT ALL FALLS DOWN") persists mid-escape progress onto the
// data.story save blob so a reload mid-escape resumes instead of replaying the
// breakout. The reload-resume backstop in WorldPlay calls these pure helpers;
// the branches below are easy to regress, so pin them.

describe("isStoryContactEligible (player has finished their first project)", () => {
  it("is eligible when employed at a job", () => {
    expect(isStoryContactEligible("acme-corp", 0)).toBe(true);
  });

  it("is eligible when owning at least one business", () => {
    expect(isStoryContactEligible(null, 1)).toBe(true);
    expect(isStoryContactEligible("", 3)).toBe(true);
  });

  it("is NOT eligible with no job and no business", () => {
    expect(isStoryContactEligible(null, 0)).toBe(false);
    expect(isStoryContactEligible("", 0)).toBe(false);
    expect(isStoryContactEligible(undefined, undefined)).toBe(false);
    // An empty-string employer is not a real job.
    expect(isStoryContactEligible("", null)).toBe(false);
  });
});

describe("inStoryCorridor (the story is confined to one corridor)", () => {
  it("is inside within the corridor bounds (inclusive edges)", () => {
    expect(inStoryCorridor(STORY_CORRIDOR.x, STORY_CORRIDOR.y)).toBe(true);
    expect(
      inStoryCorridor(
        STORY_CORRIDOR.x + STORY_CORRIDOR.w,
        STORY_CORRIDOR.y + STORY_CORRIDOR.h,
      ),
    ).toBe(true);
    // The beacon itself must live inside the corridor.
    expect(inStoryCorridor(STORY_TRIGGER.x, STORY_TRIGGER.y)).toBe(true);
  });

  it("is outside beyond any corridor edge", () => {
    expect(inStoryCorridor(STORY_CORRIDOR.x - 1, STORY_CORRIDOR.y)).toBe(false);
    expect(inStoryCorridor(STORY_CORRIDOR.x, STORY_CORRIDOR.y - 1)).toBe(false);
    expect(inStoryCorridor(STORY_CORRIDOR.x + STORY_CORRIDOR.w + 1, STORY_CORRIDOR.y)).toBe(false);
    expect(inStoryCorridor(STORY_CORRIDOR.x, STORY_CORRIDOR.y + STORY_CORRIDOR.h + 1)).toBe(false);
  });
});

describe("canContactStoryBeacon (first gate: light the uplink to BEGIN the story)", () => {
  // On the beacon, just inside it, and just outside its radius.
  const ON = { x: STORY_TRIGGER.x, y: STORY_TRIGGER.y };
  const JUST_INSIDE = { x: STORY_TRIGGER.x + (STORY_TRIGGER.r - 1), y: STORY_TRIGGER.y };
  const JUST_OUTSIDE = { x: STORY_TRIGGER.x + (STORY_TRIGGER.r + 1), y: STORY_TRIGGER.y };
  // A point well inside the corridor but far from the beacon.
  const FAR_IN_CORRIDOR = { x: STORY_CORRIDOR.x + 10, y: STORY_CORRIDOR.y + 10 };
  // A point outside the corridor entirely.
  const OUTSIDE_CORRIDOR = { x: STORY_CORRIDOR.x - 100, y: STORY_CORRIDOR.y - 100 };

  it("FIRES for an eligible player inside the corridor near the beacon", () => {
    // Eligible via a job...
    expect(canContactStoryBeacon(false, "acme-corp", 0, ON.x, ON.y)).toBe(true);
    // ...or via owning a business, anywhere within the trigger radius.
    expect(canContactStoryBeacon(false, null, 1, JUST_INSIDE.x, JUST_INSIDE.y)).toBe(true);
  });

  it("does NOT fire for an INELIGIBLE player (no job, no business), even on the beacon", () => {
    expect(canContactStoryBeacon(false, null, 0, ON.x, ON.y)).toBe(false);
    expect(canContactStoryBeacon(false, "", 0, ON.x, ON.y)).toBe(false);
    expect(canContactStoryBeacon(false, undefined, undefined, ON.x, ON.y)).toBe(false);
  });

  it("does NOT fire BEYOND the trigger radius, even for an eligible player in the corridor", () => {
    // Eligible and still inside the corridor, but a step past the radius.
    expect(inStoryCorridor(JUST_OUTSIDE.x, JUST_OUTSIDE.y)).toBe(true);
    expect(canContactStoryBeacon(false, "acme-corp", 0, JUST_OUTSIDE.x, JUST_OUTSIDE.y)).toBe(false);
    expect(canContactStoryBeacon(false, "acme-corp", 0, FAR_IN_CORRIDOR.x, FAR_IN_CORRIDOR.y)).toBe(false);
  });

  it("does NOT fire OUTSIDE the corridor, even for an eligible player", () => {
    expect(canContactStoryBeacon(false, "acme-corp", 2, OUTSIDE_CORRIDOR.x, OUTSIDE_CORRIDOR.y)).toBe(false);
  });

  it("does NOT fire once the story is already active (the contact is one-way)", () => {
    // Eligible, on the beacon — but the story is already begun, so no re-prompt.
    expect(canContactStoryBeacon(true, "acme-corp", 1, ON.x, ON.y)).toBe(false);
  });
});

describe("decideStoryBegin (making contact actually BEGINS the story)", () => {
  // A canonical successful server begin response: an active story whose home base
  // has been relocated to the UNDERGROUND CAMP (server is the authority on this).
  const OK_BEGIN = {
    ok: true,
    story: { active: true, missionIndex: 0, mx75Granted: true, homeBase: { ...STORY_HOME } },
  };

  it("BEGINS when the server confirms, returning the server's active story", () => {
    const decision = decideStoryBegin(false, true, OK_BEGIN);
    expect(decision.begin).toBe(true);
    if (decision.begin) {
      // The begun story is taken verbatim from the server — the client never
      // fabricates it.
      expect(decision.story).toBe(OK_BEGIN.story);
      expect(decision.story.active).toBe(true);
      // ...and the home base has relocated to the underground camp.
      expect(isUndergroundCampHome(decision.story.homeBase)).toBe(true);
    }
  });

  it("does NOT begin when the story is already active (one-way: no second relocation)", () => {
    // Even a fully valid OK response must be ignored once the story is active, so
    // the home base can never be relocated a second time.
    const decision = decideStoryBegin(true, true, OK_BEGIN);
    expect(decision).toEqual({ begin: false, reason: "already-active" });
  });

  it("does NOT begin on a non-2xx HTTP response (server rejected the commit)", () => {
    const decision = decideStoryBegin(false, false, { error: "Complete your first project first." });
    expect(decision.begin).toBe(false);
    if (!decision.begin) {
      expect(decision.reason).toBe("rejected");
      expect(decision.error).toBe("Complete your first project first.");
    }
  });

  it("does NOT begin when the body says ok:false, surfacing its error", () => {
    const decision = decideStoryBegin(false, true, { ok: false, error: "The beacon stays dark." });
    expect(decision).toEqual({ begin: false, reason: "rejected", error: "The beacon stays dark." });
  });

  it("does NOT begin when the response is missing a story (no local fabrication)", () => {
    expect(decideStoryBegin(false, true, { ok: true }).begin).toBe(false);
    expect(decideStoryBegin(false, true, { ok: true, story: null }).begin).toBe(false);
  });

  it("does NOT begin when the returned story is not active (never flips it locally)", () => {
    const decision = decideStoryBegin(false, true, { ok: true, story: { active: false, homeBase: { ...STORY_HOME } } });
    expect(decision.begin).toBe(false);
    if (!decision.begin) expect(decision.reason).toBe("rejected");
  });

  it("does NOT begin on a null/unparseable response body", () => {
    expect(decideStoryBegin(false, true, null).begin).toBe(false);
    expect(decideStoryBegin(false, true, undefined).begin).toBe(false);
    expect(decideStoryBegin(false, false, null)).toEqual({ begin: false, reason: "rejected", error: undefined });
  });

  it("relocates the home base to the underground camp EXACTLY ONCE across repeated contact", () => {
    // Model the live one-way commitment: the first [E] begins the story (applying
    // the server's relocated home base); any further [E] is a silent no-op because
    // the story is now active. The relocation must fire exactly once.
    const state: { storyActive: boolean; homeBase: typeof STORY_HOME | null } = {
      storyActive: false,
      homeBase: null,
    };
    let relocations = 0;
    const makeContact = () => {
      const decision = decideStoryBegin(state.storyActive, true, OK_BEGIN);
      if (!decision.begin) return;
      // Mirror the live begin's terminal mutations: adopt the server's story.
      state.storyActive = !!decision.story.active;
      state.homeBase = (decision.story.homeBase as typeof STORY_HOME) ?? null;
      relocations++;
    };
    makeContact();
    makeContact();
    makeContact();
    expect(relocations).toBe(1);
    expect(state.storyActive).toBe(true);
    expect(isUndergroundCampHome(state.homeBase)).toBe(true);
  });
});

describe("isUndergroundCampHome (home base landed on the camp)", () => {
  it("is true only when the home base matches the underground camp position", () => {
    expect(isUndergroundCampHome({ ...STORY_HOME })).toBe(true);
    expect(isUndergroundCampHome({ x: STORY_HOME.x, y: STORY_HOME.y })).toBe(true);
  });

  it("is false for any other position or a missing home base", () => {
    expect(isUndergroundCampHome({ x: STORY_HOME.x + 1, y: STORY_HOME.y })).toBe(false);
    expect(isUndergroundCampHome({ x: STORY_HOME.x, y: STORY_HOME.y + 1 })).toBe(false);
    expect(isUndergroundCampHome(null)).toBe(false);
    expect(isUndergroundCampHome(undefined)).toBe(false);
  });
});

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

describe("canReachScene1Descent (descent-reached / alleyReached eligibility)", () => {
  const VENT_R = 78; // STORY_ALLEY.r in WorldPlay

  it("FIRES when the player reaches the service-vent waypoint", () => {
    // Inside the vent radius, far from the camp — the vent path triggers it.
    expect(canReachScene1Descent({ alleyReached: false }, VENT_R - 1, VENT_R, 9999)).toBe(true);
    expect(canReachScene1Descent({ alleyReached: false }, 0, VENT_R, 9999)).toBe(true);
  });

  it("FIRES when the player beelines to the camp without passing the vent", () => {
    // Outside the vent radius but within the camp-approach radius — a beeliner
    // still trips the descent beat (no soft-lock).
    expect(canReachScene1Descent({ alleyReached: false }, 9999, VENT_R, SCENE1_DESCENT_CAMP_RADIUS - 1)).toBe(true);
    expect(canReachScene1Descent({ alleyReached: false }, 9999, VENT_R, 0)).toBe(true);
  });

  it("does NOT fire when the player is far from BOTH the vent and the camp", () => {
    expect(canReachScene1Descent({ alleyReached: false }, VENT_R, VENT_R, SCENE1_DESCENT_CAMP_RADIUS)).toBe(false);
    expect(canReachScene1Descent({ alleyReached: false }, 9999, VENT_R, 9999)).toBe(false);
  });

  it("does NOT re-fire once the descent is already reached", () => {
    // Even standing right on the vent / camp, an already-reached run is a no-op.
    expect(canReachScene1Descent({ alleyReached: true }, 0, VENT_R, 0)).toBe(false);
  });

  it("never fires without a sceneRun", () => {
    expect(canReachScene1Descent(null, 0, VENT_R, 0)).toBe(false);
    expect(canReachScene1Descent(undefined, 0, VENT_R, 0)).toBe(false);
  });
});

describe("canStartScene1Battle (staged breakout battle-start gate)", () => {
  it("FIRES once the descent is reached and no battle has run yet", () => {
    expect(
      canStartScene1Battle({ alleyReached: true, battleStarted: false, battleDone: false }, false),
    ).toBe(true);
    // alleyReached alone (other flags absent) is enough to arm.
    expect(canStartScene1Battle({ alleyReached: true }, false)).toBe(true);
  });

  it("does NOT fire before the descent is reached", () => {
    expect(
      canStartScene1Battle({ alleyReached: false, battleStarted: false, battleDone: false }, false),
    ).toBe(false);
    expect(canStartScene1Battle({}, false)).toBe(false);
  });

  it("does NOT re-fire while a battle is already running (battleStarted)", () => {
    expect(
      canStartScene1Battle({ alleyReached: true, battleStarted: true, battleDone: false }, false),
    ).toBe(false);
  });

  it("does NOT re-fire while a battle overlay is currently active", () => {
    // Guards against a second start within the same frame the battle mounts but
    // before battleStarted has been observed downstream.
    expect(
      canStartScene1Battle({ alleyReached: true, battleStarted: false, battleDone: false }, true),
    ).toBe(false);
  });

  it("does NOT re-fire once the battle has already been won (battleDone)", () => {
    expect(
      canStartScene1Battle({ alleyReached: true, battleStarted: true, battleDone: true }, false),
    ).toBe(false);
  });

  it("never fires without a sceneRun", () => {
    expect(canStartScene1Battle(null, false)).toBe(false);
    expect(canStartScene1Battle(undefined, false)).toBe(false);
  });

  it("RE-ARMS after an interrupted (not-won) battle on reload-resume", () => {
    // A battle that started but never finished is persisted with
    // battleStarted=true, battleDone=false. On reload, rebuildScene1SceneRun
    // DERIVES battleStarted from battleDone, so the resumed run comes back armed
    // and the gate re-fires the battle instead of soft-locking the camp claim.
    const interrupted: Scene1Checkpoint = { alleyReached: true, battleStarted: true, battleDone: false };
    // Pre-resume: the live run is mid-battle, so the gate is (correctly) closed.
    expect(canStartScene1Battle(interrupted, true)).toBe(false);
    // After reload-resume the run is rebuilt from the checkpoint...
    const resumed = rebuildScene1SceneRun(interrupted);
    expect(resumed.battleStarted).toBe(false);
    // ...and the gate re-arms (no battle active after a reload).
    expect(canStartScene1Battle(resumed, false)).toBe(true);
  });

  it("does NOT re-arm a WON battle on reload-resume (battle is skipped)", () => {
    const won: Scene1Checkpoint = { alleyReached: true, battleStarted: true, battleDone: true };
    const resumed = rebuildScene1SceneRun(won);
    expect(resumed.battleDone).toBe(true);
    expect(canStartScene1Battle(resumed, false)).toBe(false);
  });
});

describe("clearMilaHandoffFlag (cutscene page clears the one-time pending flag)", () => {
  // A minimal Storage-like recorder so the pure clear helper can be exercised
  // without a real localStorage. Only removeItem is needed by the helper.
  function makeStorage(initial: Record<string, string> = {}) {
    const store = new Map(Object.entries(initial));
    return {
      store,
      removeItem(key: string) {
        store.delete(key);
      },
    };
  }

  it("clears the pending flag once the Mila handoff cutscene is shown", () => {
    const storage = makeStorage({ [MILA_HANDOFF_KEY]: MILA_HANDOFF_PENDING });
    const cleared = clearMilaHandoffFlag(MILA_HANDOFF_CUTSCENE_ID, storage);
    expect(cleared).toBe(true);
    // The flag is gone, so the WorldPlay backstop no longer sees 'pending' and
    // the cutscene stops replaying on every load.
    expect(storage.store.has(MILA_HANDOFF_KEY)).toBe(false);
    expect(shouldReplayMilaHandoff({ active: true, missionIndex: 1 }, storage.store.get(MILA_HANDOFF_KEY) ?? null)).toBe(false);
  });

  it("is a no-op (and returns false) for any other cutscene id", () => {
    const storage = makeStorage({ [MILA_HANDOFF_KEY]: MILA_HANDOFF_PENDING });
    for (const id of ["lobby-receptionist", "bot:7", "", null, undefined] as const) {
      expect(clearMilaHandoffFlag(id, storage)).toBe(false);
    }
    // The pending flag must survive — those scenes are unrelated to the handoff.
    expect(storage.store.get(MILA_HANDOFF_KEY)).toBe(MILA_HANDOFF_PENDING);
  });

  it("swallows storage errors so the cutscene still runs", () => {
    const throwingStorage = {
      removeItem() {
        throw new Error("localStorage blocked");
      },
    };
    expect(() => clearMilaHandoffFlag(MILA_HANDOFF_CUTSCENE_ID, throwingStorage)).not.toThrow();
    expect(clearMilaHandoffFlag(MILA_HANDOFF_CUTSCENE_ID, throwingStorage)).toBe(true);
    // A missing/blocked storage must not throw either.
    expect(clearMilaHandoffFlag(MILA_HANDOFF_CUTSCENE_ID, null)).toBe(true);
    expect(clearMilaHandoffFlag(MILA_HANDOFF_CUTSCENE_ID, undefined)).toBe(true);
  });

  it("only removes the handoff key, leaving other keys untouched", () => {
    const storage = makeStorage({
      [MILA_HANDOFF_KEY]: MILA_HANDOFF_PENDING,
      "salaryman.other": "keep-me",
    });
    clearMilaHandoffFlag(MILA_HANDOFF_CUTSCENE_ID, storage);
    expect(storage.store.has(MILA_HANDOFF_KEY)).toBe(false);
    expect(storage.store.get("salaryman.other")).toBe("keep-me");
  });

  it("isMilaHandoffCutscene matches only the canonical handoff id", () => {
    expect(isMilaHandoffCutscene(MILA_HANDOFF_CUTSCENE_ID)).toBe(true);
    expect(isMilaHandoffCutscene("mila-handoff")).toBe(true);
    expect(isMilaHandoffCutscene("mila")).toBe(false);
    expect(isMilaHandoffCutscene(null)).toBe(false);
    expect(isMilaHandoffCutscene(undefined)).toBe(false);
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

describe("shouldReplayMilaHandoff (cutscene 'exactly once' backstop)", () => {
  it("replays when the flag is pending AFTER Scene 1 completes (lost navigation)", () => {
    // The claim finalized (missionIndex >= 1) and set the pending flag, but the
    // navigation was lost; the mount backstop must re-fire it.
    expect(shouldReplayMilaHandoff({ active: true, missionIndex: 1 }, "pending")).toBe(true);
    expect(shouldReplayMilaHandoff({ active: true, missionIndex: 2 }, "pending")).toBe(true);
  });

  it("does NOT replay once the flag is cleared (cutscene already shown)", () => {
    // The cutscene page clears the flag on delivery — at-most-once.
    expect(shouldReplayMilaHandoff({ active: true, missionIndex: 1 }, null)).toBe(false);
    expect(shouldReplayMilaHandoff({ active: true, missionIndex: 1 }, undefined)).toBe(false);
    expect(shouldReplayMilaHandoff({ active: true, missionIndex: 1 }, "")).toBe(false);
    expect(shouldReplayMilaHandoff({ active: true, missionIndex: 1 }, "shown")).toBe(false);
  });

  it("does NOT fire before Scene 1 is complete, even if a flag is somehow pending", () => {
    // The MX-75 isn't claimed yet (missionIndex < 1), so the handoff is not owed.
    expect(shouldReplayMilaHandoff({ active: true, missionIndex: 0 }, "pending")).toBe(false);
    expect(shouldReplayMilaHandoff({ active: true }, "pending")).toBe(false);
  });

  it("does NOT fire when the story is not active", () => {
    expect(shouldReplayMilaHandoff({ active: false, missionIndex: 1 }, "pending")).toBe(false);
    expect(shouldReplayMilaHandoff(null, "pending")).toBe(false);
    expect(shouldReplayMilaHandoff(undefined, "pending")).toBe(false);
  });

  it("fires EXACTLY ONCE across a finalize -> reload -> delivery lifecycle", () => {
    // Model the durable localStorage flag the live path mutates. The flag is set
    // at finalize; the mount backstop replays only while pending; reaching the
    // cutscene page clears it. Simulate several mounts (reloads) and confirm the
    // navigation fires exactly once total.
    let flag: string | null = null;
    const story = { active: true, missionIndex: 1 };
    let navigations = 0;

    // (1) Camp claim finalize sets the pending flag.
    flag = "pending";

    // (2) Several WorldPlay mounts. The first replays the handoff; the cutscene
    //     page clears the flag, so later mounts must NOT replay it.
    const mount = () => {
      if (shouldReplayMilaHandoff(story, flag)) {
        navigations++;
        // Reaching the cutscene page clears the flag (delivery).
        flag = null;
      }
    };
    mount();
    mount();
    mount();

    expect(navigations).toBe(1);
    expect(flag).toBe(null);
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

describe("applyScene1ClaimReward (camp-claim reward: device + mission + assignment)", () => {
  it("grants the working MX-75, flips mx75Granted, advances the mission and records the assignment", () => {
    const { story, device } = applyScene1ClaimReward({ missionIndex: 0, mx75Granted: false });
    // Device grant: a fresh, undamaged, full-durability MX-75.
    expect(device).toEqual({ hasDevice: true, deviceBroken: false, deviceDurability: 100 });
    expect(device).toEqual(SCENE1_DEVICE_GRANT);
    // Story side effects: mission past Scene 1, mx75 granted, assignment recorded once.
    expect(story.missionIndex).toBe(1);
    expect(story.mx75Granted).toBe(true);
    expect(story.assignmentsCompleted).toEqual([SCENE1_ID]);
  });

  it("does NOT mutate the input story (pure)", () => {
    const input = { missionIndex: 0, mx75Granted: false, assignmentsCompleted: [] as string[] };
    const { story } = applyScene1ClaimReward(input);
    // The input is untouched; a new story is returned.
    expect(input.missionIndex).toBe(0);
    expect(input.mx75Granted).toBe(false);
    expect(input.assignmentsCompleted).toEqual([]);
    expect(story).not.toBe(input);
    expect(story.assignmentsCompleted).not.toBe(input.assignmentsCompleted);
  });

  it("preserves unrelated story fields untouched", () => {
    const input = {
      active: true,
      quarter: 2,
      homeBase: { kind: "campsite", x: 6620, y: 6520, label: "UNDERGROUND CAMP" },
      missionIndex: 0,
    };
    const { story } = applyScene1ClaimReward(input);
    expect(story.active).toBe(true);
    expect(story.quarter).toBe(2);
    expect(story.homeBase).toEqual(input.homeBase);
  });

  it("adds the Scene 1 assignment EXACTLY ONCE — never duplicates it on re-apply", () => {
    // First application records the assignment.
    const first = applyScene1ClaimReward({ missionIndex: 0 });
    expect(first.story.assignmentsCompleted).toEqual([SCENE1_ID]);
    // Re-applying to the already-rewarded story does not duplicate it.
    const second = applyScene1ClaimReward(first.story);
    expect(second.story.assignmentsCompleted).toEqual([SCENE1_ID]);
    // A pre-existing (unrelated) assignment is preserved and the id appended once.
    const withOther = applyScene1ClaimReward({ missionIndex: 0, assignmentsCompleted: ["intro_done"] });
    expect(withOther.story.assignmentsCompleted).toEqual(["intro_done", SCENE1_ID]);
  });

  it("is IDEMPOTENT: applying it repeatedly converges (no double-grant on key-repeat)", () => {
    // Model the live finalize re-running the reward (e.g. a key-repeat that slips
    // past the guard): the mission never overshoots past 1, mx75 stays granted,
    // and the assignment list never grows beyond a single id.
    let acc = applyScene1ClaimReward({ missionIndex: 0, mx75Granted: false }).story;
    for (let i = 0; i < 5; i++) acc = applyScene1ClaimReward(acc).story;
    expect(acc.missionIndex).toBe(1);
    expect(acc.mx75Granted).toBe(true);
    expect(acc.assignmentsCompleted).toEqual([SCENE1_ID]);
  });

  it("never regresses an already-advanced mission (Math.max floors at the current index)", () => {
    // A later scene (missionIndex 3) re-running the Scene 1 reward must not pull
    // the mission back to 1.
    const { story } = applyScene1ClaimReward({ missionIndex: 3 });
    expect(story.missionIndex).toBe(3);
  });

  it("treats a missing missionIndex as 0 and advances to 1", () => {
    const { story } = applyScene1ClaimReward({});
    expect(story.missionIndex).toBe(1);
    expect(story.assignmentsCompleted).toEqual([SCENE1_ID]);
  });

  it("returns a fresh device object each call (re-grant can't be aliased/mutated)", () => {
    const a = applyScene1ClaimReward({ missionIndex: 0 });
    const b = applyScene1ClaimReward({ missionIndex: 0 });
    expect(a.device).not.toBe(b.device);
    expect(a.device).not.toBe(SCENE1_DEVICE_GRANT);
  });

  it("models the live finalize: reward applies once, gated by canFinalizeScene1Claim", () => {
    // Mirror sceneClaimFinalize's terminal side effects driven by the helper, with
    // a double-trigger. The guard lets the reward run only on the first call, so
    // the device is granted once and the assignment is never duplicated.
    const state: {
      sceneRun: { phase: string };
      story: { missionIndex: number; mx75Granted: boolean; assignmentsCompleted: string[] };
      hasDevice: boolean;
    } = {
      sceneRun: { phase: "claim" },
      story: { missionIndex: 0, mx75Granted: false, assignmentsCompleted: [] },
      hasDevice: false,
    };
    let grants = 0;
    const finalize = () => {
      if (!canFinalizeScene1Claim(state.sceneRun, state.story)) return;
      const reward = applyScene1ClaimReward(state.story);
      state.story = reward.story;
      state.hasDevice = reward.device.hasDevice;
      grants++;
      state.sceneRun = { phase: "done" };
    };
    finalize();
    finalize();
    expect(grants).toBe(1);
    expect(state.hasDevice).toBe(true);
    expect(state.story.missionIndex).toBe(1);
    expect(state.story.mx75Granted).toBe(true);
    expect(state.story.assignmentsCompleted).toEqual([SCENE1_ID]);
  });
});

describe("advanceScene1FromIntro (intro cinematic -> playable ESCAPE)", () => {
  it("flips an intro run into the ESCAPE phase", () => {
    const run = advanceScene1FromIntro({
      id: SCENE1_ID,
      phase: "intro",
      startTime: 1000,
      alleyReached: false,
    });
    expect(run).not.toBeNull();
    expect(run!.phase).toBe("escape");
  });

  it("preserves the run's identity and milestones (only the phase changes)", () => {
    const run = advanceScene1FromIntro({
      id: SCENE1_ID,
      phase: "intro",
      startTime: 1234,
      alleyReached: true,
      battleStarted: true,
      battleDone: false,
    });
    expect(run).toEqual({
      id: SCENE1_ID,
      phase: "escape",
      startTime: 1234,
      alleyReached: true,
      battleStarted: true,
      battleDone: false,
    });
  });

  it("does not mutate the input run (returns a fresh object)", () => {
    const input = {
      id: SCENE1_ID,
      phase: "intro" as const,
      startTime: 1,
      alleyReached: false,
    };
    const out = advanceScene1FromIntro(input);
    expect(input.phase).toBe("intro");
    expect(out).not.toBe(input);
  });

  it("passes a missing run through as null (no crash)", () => {
    expect(advanceScene1FromIntro(null)).toBeNull();
    expect(advanceScene1FromIntro(undefined)).toBeNull();
  });
});

describe("scene tight zoom (cache on begin, restore once on finalize)", () => {
  it("snaps in by the scene multiplier for an already-close player", () => {
    // A player zoomed in past the floor: the multiplier dominates.
    expect(sceneTightZoom(5)).toBe(5 * SCENE1_ZOOM_MULT);
  });

  it("floors at the scene minimum for a zoomed-out player", () => {
    // multiplier * 1 would be below the floor, so the floor wins — even a
    // fully zoomed-out player snaps close.
    expect(sceneTightZoom(1)).toBe(SCENE1_ZOOM_MIN);
    expect(sceneTightZoom(0)).toBe(SCENE1_ZOOM_MIN);
  });

  it("restore returns the cached pre-scene zoom when one was stored", () => {
    expect(restoreSceneZoom(2.4, 1.8)).toBe(2.4);
  });

  it("restore falls back to the default when no zoom was cached (cache 0)", () => {
    expect(restoreSceneZoom(0, 1.8)).toBe(1.8);
  });

  it("caches on begin and restores EXACTLY the pre-scene zoom on finalize", () => {
    // Model the live begin/finalize zoom lifecycle: begin caches the current zoom
    // and snaps in tight; finalize restores the cached zoom and zeroes the cache.
    const DEFAULT = 1.8;
    const state = { zoom: 2.4, zoomPrev: 0 };

    // begin:
    state.zoomPrev = state.zoom;
    state.zoom = sceneTightZoom(state.zoom);
    expect(state.zoom).toBe(sceneTightZoom(2.4));
    expect(state.zoom).toBeGreaterThan(2.4); // snapped in close

    // finalize (idempotency guard lets it run once):
    let finalized = false;
    const finalize = () => {
      if (finalized) return; // mirrors canFinalizeScene1Claim's once-only guard
      finalized = true;
      state.zoom = restoreSceneZoom(state.zoomPrev, DEFAULT);
      state.zoomPrev = 0;
    };
    finalize();
    expect(state.zoom).toBe(2.4); // restored to EXACTLY the pre-scene zoom

    // A double-finalize must NOT clobber the restored zoom (the guard blocks it;
    // and even if it ran, the cache is now 0 and would fall back to default).
    finalize();
    expect(state.zoom).toBe(2.4);
  });
});

describe("stepScene1EscapeFrame (escape-phase milestone ordering)", () => {
  const VENT_R = 78; // STORY_ALLEY.r in WorldPlay
  const ESCAPE = {
    id: SCENE1_ID,
    phase: "escape" as const,
    startTime: 0,
    alleyReached: false,
  };

  it("is a no-op outside the ESCAPE phase", () => {
    for (const phase of ["intro", "claim", "done"] as const) {
      const res = stepScene1EscapeFrame({
        sceneRun: { ...ESCAPE, phase },
        distToVent: 0,
        ventRadius: VENT_R,
        distToCamp: 0,
        battleActive: false,
      });
      expect(res.events).toEqual([]);
      expect(res.sceneRun.phase).toBe(phase);
    }
  });

  it("fires the descent alone when reaching the vent far from the camp", () => {
    const res = stepScene1EscapeFrame({
      sceneRun: ESCAPE,
      distToVent: VENT_R - 1,
      ventRadius: VENT_R,
      distToCamp: 9999,
      battleActive: false,
    });
    // Descent and battle-start both fire: reaching the descent arms the battle in
    // the same frame, but the camp is far away so no claim.
    expect(res.events).toEqual(["descent", "battle-start"]);
    expect(res.sceneRun.alleyReached).toBe(true);
    expect(res.sceneRun.battleStarted).toBe(true);
  });

  it("a beeliner trips descent AND battle-start in the SAME frame (battle never skipped)", () => {
    // Player runs straight onto the camp without ever touching the vent: the
    // camp-approach radius still trips the descent, which arms the staged battle
    // the same frame — so the claim cannot fire (battleDone is still false).
    const res = stepScene1EscapeFrame({
      sceneRun: ESCAPE,
      distToVent: 9999,
      ventRadius: VENT_R,
      distToCamp: 0,
      battleActive: false,
    });
    expect(res.events).toEqual(["descent", "battle-start"]);
    // Crucially, NO claim in the same frame — the battle must be fought first.
    expect(res.events).not.toContain("claim");
    expect(res.sceneRun.phase).toBe("escape");
  });

  it("does NOT start a second battle while one is already active", () => {
    // alleyReached already set and a battle overlay is live: nothing new fires.
    const res = stepScene1EscapeFrame({
      sceneRun: { ...ESCAPE, alleyReached: true, battleStarted: true },
      distToVent: 0,
      ventRadius: VENT_R,
      distToCamp: 9999,
      battleActive: true,
    });
    expect(res.events).toEqual([]);
  });

  it("claims ONLY after the battle is won (battleDone) and at the camp", () => {
    const res = stepScene1EscapeFrame({
      sceneRun: { ...ESCAPE, alleyReached: true, battleStarted: true, battleDone: true },
      distToVent: 9999,
      ventRadius: VENT_R,
      distToCamp: SCENE1_CLAIM_RADIUS - 1,
      battleActive: false,
    });
    expect(res.events).toEqual(["claim"]);
    expect(res.sceneRun.phase).toBe("claim");
  });

  it("does NOT claim at the camp while the battle is unwon (no early claim)", () => {
    const res = stepScene1EscapeFrame({
      sceneRun: { ...ESCAPE, alleyReached: true, battleStarted: true, battleDone: false },
      distToVent: 9999,
      ventRadius: VENT_R,
      distToCamp: SCENE1_CLAIM_RADIUS - 1,
      battleActive: false,
    });
    expect(res.events).toEqual([]);
    expect(res.sceneRun.phase).toBe("escape");
  });

  it("models the full escape across frames: descent+battle -> (win) -> claim, in order", () => {
    // Frame A: player reaches the camp approach. Descent + battle-start fire; the
    // claim is held back because the battle has only just started (not won).
    let run = { ...ESCAPE };
    const a = stepScene1EscapeFrame({
      sceneRun: run,
      distToVent: 9999,
      ventRadius: VENT_R,
      distToCamp: 0,
      battleActive: false,
    });
    expect(a.events).toEqual(["descent", "battle-start"]);
    run = a.sceneRun;

    // Frame B: the battle is still running (active). No new milestones, no claim.
    const b = stepScene1EscapeFrame({
      sceneRun: run,
      distToVent: 9999,
      ventRadius: VENT_R,
      distToCamp: 0,
      battleActive: true,
    });
    expect(b.events).toEqual([]);
    run = b.sceneRun;

    // The battle's async onComplete wins it (mirrors the live startBattle callback).
    run = { ...run, battleDone: true };

    // Frame C: battle won and standing on the camp -> the claim finally fires.
    const c = stepScene1EscapeFrame({
      sceneRun: run,
      distToVent: 9999,
      ventRadius: VENT_R,
      distToCamp: 0,
      battleActive: false,
    });
    expect(c.events).toEqual(["claim"]);
    expect(c.sceneRun.phase).toBe("claim");
  });

  it("does not mutate the input sceneRun (returns a fresh run)", () => {
    const input = { ...ESCAPE };
    const res = stepScene1EscapeFrame({
      sceneRun: input,
      distToVent: 0,
      ventRadius: VENT_R,
      distToCamp: 9999,
      battleActive: false,
    });
    expect(input.alleyReached).toBe(false);
    expect(input.phase).toBe("escape");
    expect(res.sceneRun).not.toBe(input);
  });
});
