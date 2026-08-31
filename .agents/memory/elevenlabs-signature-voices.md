---
name: ElevenLabs credential and signature voices
description: Authentication and fallback rules that preserve Pablo and Mila's assigned voices.
---

ElevenLabs API authentication requires the actual secret shown once when a key is created or rotated. The dashboard key ID is not a credential, even if it is labeled or displayed beside the key.

**Why:** ElevenLabs returns `api_key_id_used_as_api_key` when the ID is stored as the API key. A generic TTS fallback then makes Pablo appear to speak with the wrong accent, hiding the real configuration failure.

**How to apply:** Store only the provider-issued `sk_...` secret in `ELEVENLABS_API_KEY`. Treat Pablo and Mila as signature voices: if ElevenLabs is unavailable, keep the written response and fail voice synthesis explicitly rather than recasting either character through another provider.