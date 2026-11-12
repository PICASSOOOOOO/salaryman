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
`HTMLAudioElement`, not WebAudio. `unlockAudio()` must call the silent element's
`play()` synchronously from the real gesture and count success only when that
element is actually unlocked; WebAudio success alone does not unlock iOS playback.

**iOS gesture timing:** Do not call `unlockAudio()` from a non-gesture mount
effect. If that asynchronous attempt is still pending when the user taps, the
gesture handler can reuse it, leaving the silent HTMLAudio prime outside the
user activation and preventing unlock waiters from draining.

**Why:** iOS Safari can reject `HTMLAudioElement.play()` when its unlock attempt
was started before the actual tap, leaving later ElevenLabs playback silent.

**How to apply:** On mount, arm `armAudioAutoUnlock()` only. Let the first real
pointer, touch, mouse, or key gesture start the unlock attempt.

## Paid voice access

Pablo's resolved voice is available only to authenticated users with an active
Stripe-backed `claw_bot` (Pablo Prime) or `phone_system` (CALLL HOME) grant, a
completed custom-number purchase matching an active owned number, or an approved
`alpha_tester` account (the tester/moderator role). Written replies and speech
input remain free. Gate the resolved Pablo voice ID before any provider call;
checking only the character label misses the default voice and client-supplied
voice-ID paths. Do not use `hasFeature()` or client plan flags for this policy,
because those include non-payment owner/developer and Pledge Store grants.

**Why:** Pablo text remains part of the free conversation, while ElevenLabs output
must not incur costs for unpaid accounts; approved testers still need it for QA.

**How to apply:** use the server-side Stripe grant ledger, the settled custom
number purchase/active ownership join, or the approved tester record. Keep the
check before ElevenLabs and fail closed if the access lookup is unavailable.
