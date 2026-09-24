---
name: ElevenLabs credential and signature voices
description: Authentication and fallback rules for Pablo and Mila voice output.
---

ElevenLabs API authentication requires the actual secret shown once when a key is created or rotated. The dashboard key ID is not a credential, even if it is labeled or displayed beside the key. A valid key can still be blocked from library voices on the Free plan (`402 paid_plan_required`); the current TTS route then falls back to OpenAI Onyx, which is audible but not the assigned character voice.

**Why:** ElevenLabs can reject a library voice even when the configured credential is valid. A generic fallback keeps audio available but can make a signature character sound wrong; the correct choice depends on whether the user prioritizes audibility or voice identity.

**How to apply:** Store only the provider-issued `sk_...` secret in `ELEVENLABS_API_KEY`. Keep the character selection explicit. If the user reports the voice identity is wrong, check `X-TTS-Provider` and the provider error before changing the voice mapping; explain plan/voice access limits without requesting credentials. Let the user choose between the generic fallback and waiting for an API-authorized signature voice.