---
name: ElevenLabs credential and signature voices
description: Authentication and fallback rules for Pablo and Mila voice output.
---

ElevenLabs API authentication requires the actual secret shown once when a key is created or rotated. The dashboard key ID is not a credential, even if it is labeled or displayed beside the key.

**Why:** ElevenLabs can reject a library voice even when the configured credential is valid. A hard failure makes the assistant appear unavailable, so audible output is more important than preserving the exact assigned accent during provider outages.

**How to apply:** Store only the provider-issued `sk_...` secret in `ELEVENLABS_API_KEY`. Try the assigned ElevenLabs voice first; if it fails, use the existing managed speech fallback so Pablo/Mila still speak, while keeping the character selection explicit in the request.