---
name: Post-onboarding cutscene + TTS double-fire
description: PostOnboardingIntro is the one-time first-office cinematic; speakWithTTS fires BOTH onError and onEnd on failure, so any TTS-driven advance must be idempotent.
---

# Post-onboarding cutscene (PostOnboardingIntro)

`PostOnboardingIntro` is the one-time cinematic Immigration mounts after intake/stamping,
before navigating to `/office` (its `onComplete` -> `navigate('/office')` contract). It is the
player's FIRST office arrival, staged as scripted beats: `elevator` (Pablo tour) -> `time_skip`
("3 MONTHS LATER") -> `asleep` (player slumped at desk, wake cue) -> `controls` (interactive
PixelOffice) -> `power_on` (flash, then finish). Brief-but-impactful is the creative bar.

Pablo here = an elderly-Japanese-man SILHOUETTE (pure SVG: long coat, low hat brim, faint
glasses glint) — "shrouded in shadow," needs no new art. His spoken lines use `speakWithTTS`
with the DEFAULT voice — never pass a custom voice/override (Pablo voice must stay
byte-identical; see mila-pablo-persona). Cinematic SFX live in soundEngine (sfxElevatorChime /
sfxDoorSlide / sfxWakeAlarm) and reuse startOfficeAmbient as the ambient bed.

## TTS double-fire — the durable gotcha

**`speakWithTTS(text, onEnd, onError)` calls BOTH `onError(...)` AND `onEnd()` on every failure
path** (no-key, fetch fail, decode fail). So if you use the same advance callback for both — or
even just rely on `onEnd` — a failed/unavailable TTS line can fire your "next line" logic
twice.

**Why it matters:** a sequenced cutscene that advances on TTS completion will double-advance
(skip a line) or overshoot its line index and stall when TTS is down.

**How to apply:** make the per-line advance IDEMPOTENT. Pattern used here: a closure-local
`let advanced = false;` recreated per line/effect-run; the advance handler early-returns if
already advanced. Also floor each line's on-screen time with `max(ttsDuration, MIN_LINE_MS)` so
it paces well even when TTS returns instantly (or never speaks). Stop ambient + cancel the TTS
handle on both `finish()` and unmount.
