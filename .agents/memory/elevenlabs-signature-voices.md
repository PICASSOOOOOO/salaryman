---
name: ElevenLabs credential and signature voices
description: Authentication and fallback rules for Pablo and Mila voice output.
---

ElevenLabs API authentication requires the actual secret shown once when a key is created or rotated. The dashboard key ID is not a credential, even if it is labeled or displayed beside the key. A valid key can still be blocked from library voices on the Free plan (`402 paid_plan_required`). Pablo now fails closed on provider rejection or missing configuration instead of falling back to OpenAI Onyx; his written reply remains visible.

**Why:** ElevenLabs can reject a library voice even when the configured credential is valid. For Pablo, preserving voice identity is preferred over generic spoken output.

**How to apply:** Store only the provider-issued `sk_...` secret in `ELEVENLABS_API_KEY`. Keep the character selection explicit. If the user reports the voice identity is wrong, check `X-TTS-Provider` and the provider error before changing the voice mapping; explain plan/voice access limits without requesting credentials. Do not enable generic Pablo fallback unless the user asks for it.