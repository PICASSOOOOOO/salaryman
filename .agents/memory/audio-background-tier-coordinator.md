---
name: Audio background-tier coordinator
description: How SALARYMAN enforces "only one background music tier audible at a time" and how to add a new sustained audio source correctly.
---

# Background-tier audio coordinator (interview-helper)

`src/lib/audio-bus.ts` holds two independent layers:
1. **Voice priority / ducking** (pre-existing) — a speaking voice (TTS/phone) ducks all music channels to 0, restores on last release. Refcounted. Untouched by the tier work.
2. **Background-tier coordinator** (added) — at most ONE sustained "background music tier" may be audible at a time.

## The tiers (BG_OWNERS)
`worldScore`, `officeAmbient`, `radioOffice` (headless OfficeRadio), `radioWorld` (in-world RadioPlayer), `hummingbird` (global MusicPlayerContext).
- **Crowd murmur is NOT a tier** — it's a deliberate SFX-channel sub-layer of the world score. It must still stop on leaving the world and be inside `stopAllBackgroundAudio()`, but it does not claim/release.
- One-shot SFX never participate. The muted "drone" is mute-gated only, not a tier.

## The contract (how to add a new sustained source)
1. `registerBackgroundAudio(owner, stopFn)` in a mount effect; return its unregister on unmount. `stopFn` must pause/stop your source (idempotent, guard `!paused`).
2. When your source STARTS playing call `claimBackgroundAudio(owner)` — it sets ownership FIRST then calls every OTHER registered stopper.
3. When it STOPS call `releaseBackgroundAudio(owner)` — only nulls ownership if you still hold it (stale release is a no-op).
4. **No auto-resume** on handoff — cross-tier switching is user/page driven (mirrors phone/voice UX).

## Where claims live
- soundEngine `startAmbient`/`stopAmbient` (worldScore) + `startOfficeAmbient`/`stopOfficeAmbient` (officeAmbient) claim/release and self-register at module load. `pauseMusic`=stopAmbient. `startAmbient/stopAmbient` are INTERNAL — outside soundEngine use the exported `playMusic`/`pauseMusic`/`stopOfficeAmbient`/`stopCrowdMurmur`.
- `stopAllBackgroundAudio()` (soundEngine) = stopAmbient + stopOfficeAmbient + stopCrowdMurmur + _stopMutedAmbient.
- OfficeRadio/RadioPlayer/MusicPlayerContext claim/release in their play effects + register a pause stopper.

## Route-change backstop (App.tsx AppShell)
A `useEffect([pathname])` force-stops only the ENGINE procedural tiers the destination doesn't own (module singletons survive route changes and are the real leak risk):
- `allowsWorldScore` = `/world/play` only → else `pauseMusic()` + `stopCrowdMurmur()`.
- `allowsOfficeAmbient` = `/office`, `/immigration`, `/pablo` (+ subpaths) → else `stopOfficeAmbient()`.
**Why those three for office ambient:** it's the shared ONBOARDING bed (`lib/onboarding-score.ts` `ensureOnboardingScore`, reuses the office bed singleton). It must survive `/pablo`(PabloTerminal) → `/immigration`(Immigration + PostOnboardingIntro) → `/office`(PabloOffice) seamlessly. Narrowing this list breaks the onboarding score.
**Do NOT** use `stopBackgroundAudioExcept` in the backstop — it would pause Hummingbird on every nav, but Hummingbird is global-by-design and owned by no route. Radio/Hummingbird HTMLAudio tiers self-clean (OfficeRadio re-gates by route, RadioPlayer unmounts with WorldPlay) and rely on claim/release, not the backstop.

## Tests
`src/lib/audio-coordinator.notify.test.ts` (jsdom + FakeAudioContext + fake timers + vi.resetModules). audio-bus + soundEngine resolve to the SAME audio-bus module instance under resetModules, so engine module-load registrations land in the bus the test imports — assert exclusivity via `getBackgroundAudioOwner()`.
