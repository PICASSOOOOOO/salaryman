---
name: Office quiet meditative ambient bed
description: How the /office scene gets its own calm ambient soundtrack, separate from the city synthwave score, and the gating + node-lifecycle rules that keep it safe.
---

# Office ambient bed

The OFFICE (/office, PabloOffice) has a dedicated quiet/meditative ambient bed
(`startOfficeAmbient`/`stopOfficeAmbient`/`isOfficeAmbientRunning` in
soundEngine). It is deliberately NOT the city's aggressive synthwave score
(`startAmbient`, which only runs in WorldPlay): warm low drone + slow chord
swells + sparse soft chimes, on its own `_officeMaster` gain node.

## Gating: reuse the shared chokepoint, don't re-wire
- The bed's loudness tracks the SAME `_musicVol` value the synthwave bed uses.
- It is applied via `_applyOfficeAmbientVolume()` called inside the existing
  `_applyAmbientVolume()` chokepoint — which every mute / AMBIANCE-toggle /
  music-mute / voice-duck path already calls.

**Why:** the central audio store (`audio-settings.ts applyToEngine`) folds
master, mute, `ambianceEnabled`, and voice-ducking into `_musicVol`. Hanging the
office bed off that one value means all those controls reach it for free — no
separate subscription needed inside the engine.

**How to apply:** to make a new background bed obey the user's audio controls,
gate it on `_musicVol` and apply it from `_applyAmbientVolume`; do not invent a
parallel mute/duck path.

## Node lifecycle: track transient voices or they leak
The drone is persistent; the swell/chime voices are transient oscillators created
on timers. They MUST be registered (`_registerOfficeVoice`) into `_officeNodes`
(self-removing on `onended`) so `stopOfficeAmbient()` can force-stop them
immediately. If you forget, on stop they keep ringing (silently, until their
scheduled `o.stop`, up to ~11s) and accumulate across a long session — a real
temporary leak that compounds under mount/unmount churn.

**How to apply:** any new transient WebAudio voice on a self-scheduling loop
needs (a) a `_running`/generation guard so the loop stops scheduling, AND (b) a
registry so teardown can hard-stop voices already in flight. Guard regression
with a fake-AudioContext test that advances timers, stops, and asserts every
created oscillator was stopped and no new ones appear (see
`src/lib/office-ambient.notify.test.ts`).

## Page wiring
PabloOffice starts the bed on the first user gesture (WebAudio unlock), gated by
`getAmbianceEnabled()`, subscribes to audio settings to start/stop on a
mid-session AMBIANCE toggle, and stops it on unmount.
