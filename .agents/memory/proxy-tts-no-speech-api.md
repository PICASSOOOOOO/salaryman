---
name: Proxy TTS — no OpenAI speech API
description: Replit AI Integrations proxy does not support OpenAI's speech API; the only supported TTS path is the gpt-audio helper.
---

The Replit AI Integrations OpenAI proxy does NOT support the OpenAI Speech API
(`openai.audio.speech.create(...)`), and `tts-1` / `tts-1-hd` are NOT in the
supported proxy model list. Any `openai.audio.speech.create({ model: "tts-1" })`
that goes through `@workspace/integrations-openai-ai-server` is silently broken
on the proxy.

**Rule:** for TTS through the proxy, use `textToSpeech(text, voice, format)` from
`@workspace/integrations-openai-ai-server/audio`, which wraps `gpt-audio` via
chat-completions `modalities: ["text","audio"]`. That is the ONLY supported
synthesis path. `gpt-audio` cannot be passed to `audio.speech.create`.

**Why:** the openai integration SKILL lists "speech API" under Unsupported
Capabilities and supported audio models are only gpt-audio / gpt-audio-mini
(speech) and gpt-4o-mini-transcribe (STT).

**How to apply:** swapping the model string alone (tts-1 -> gpt-audio) is NOT
enough — the API surface must change too. Direct `api.openai.com` calls using the
user's own OPENAI_API_KEY are a separate path where tts-1 is still valid.
