---
name: Pablo voice output gating (text vs voice mode)
description: Why Pablo "replies in text but no sound" — voice OUTPUT was gated to voice INPUT mode, and voice mode needs a mic.
---

# Pablo voice "no sound" root cause

Symptom (recurring "Pablo's voice isn't working again"): the LLM reply renders as
text, but nothing is spoken — reported on BOTH desktop and mobile.

**Root cause:** voice OUTPUT was coupled to voice INPUT mode.
- The PabloTerminal chat-reply handler only spoke the reply when `mode === "voice"`.
- The mode default is `"text"` on mobile/coarse/touch/narrow screens.
- In **voice mode the ONLY way to send a message is the microphone** ("TAP TO
  SPEAK"); there is no text composer in voice mode. A user with no/denied mic
  (common on desktop, PWAs, many phones) is forced into **text mode** to type —
  and text mode never spoke. → "reply shows up as text, but there's no sound."
- The onboarding intake already spoke regardless of mode, so the gap was only the
  normal post-onboarding chat reply — an inconsistency, not an intentional silence.

**Fix:** decouple output from input — speak the reply on every device/mode; keep
mic / auto-listen (the `autoListen` flags) gated to voice mode so phones aren't
forced to open the mic. Matches the intake flow.

**Why:** the app is voice-first (Pablo nebula voice is the whole point) and there
is NO browser-SpeechSynthesis fallback (removed on purpose — ElevenLabs-only
mandate), so any path that doesn't call `/api/tts` is just silence.

**How to apply:** never gate Pablo/Mila spoken OUTPUT behind the input `mode`.
If you add a true mute control, gate speech on that, not on text-vs-voice input.

**Not the cause (verified):** backend is healthy — dev + live `/api/tts` return
valid mp3 for PABLO/MILA; direct ElevenLabs concurrent calls 200; client TTS
playback path (tts.ts) is robust with retry/decode. The voice/TTS code is
byte-identical between the live deploy and HEAD, so republishing alone does NOT
change voice behavior — the gating fix must ship.

## iOS Safari silent-output (separate, later bug)

Symptom: after the gating fix, desktop speaks but **iPhone Safari** still renders
reply as text with no sound.

**Root cause:** TTS played through **WebAudio** (`AudioBufferSourceNode`). On iOS
(all browsers are WebKit) WebAudio output is **silenced by the hardware ringer/mute
switch** and is generally flaky; an `HTMLAudioElement` plays through the media
channel and ignores the switch. This is the same reason howler.js falls back to
HTML5 `<audio>` on iOS.

**Fix:** in tts.ts `speakWithTTS`, route playback through the existing
`playViaElement` (`<audio>` + blob URL) path when `useElement = useSinkId ||
isIOS()` — previously the element path was only used for `setSinkId` speaker
pinning. Skip the WebAudio decode on the element path; guard `setSinkId()` to only
run when a real speaker is chosen; keep WebAudio context creation OUT of the iOS
path (moved `getAudioCtx()`/`ensureResumed()` into `playViaWebAudio` only).

**How to apply:** any new audio playback that must be audible on iPhone must use an
`HTMLAudioElement`, not WebAudio. The unlock (`unlockAudio`) already primes a silent
`<audio>` element on first gesture, so element playback works after any tap.
