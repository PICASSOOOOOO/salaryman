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
