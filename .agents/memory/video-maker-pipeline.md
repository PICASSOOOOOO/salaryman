---
name: Video Maker pipeline (MoneyPrinterTurbo rebuild)
description: Durable design constraints for the AI short-video feature (Video Studio at /creative/video).
---

The Video Studio is an in-memory async job pipeline (no DB persistence): topic -> LLM script -> per-scene TTS + AI image -> ffmpeg captioned clips -> concat. Jobs live in a `Map`, polled by id, mp4 streamed from the OS temp dir.

**Bounded execution is mandatory, not optional.**
- **Why:** code review flagged that unbounded job starts + per-job `Promise.all` over all scenes fans out concurrent ffmpeg + paid AI (ElevenLabs/Nano Banana/OpenAI) calls = trivial DoS / cost blowup for any authed user.
- **How to apply:** keep the per-user (1) + global (3) active-job caps and the scene-level concurrency cap (mapLimit, 2 at a time). If you raise sceneCount max or add features, keep these caps in lockstep. The POST route maps the cap rejection to HTTP 429.

**Every terminal job state must schedule eviction from the Map.**
- **Why:** success path schedules deletion after TTL, but an errored job that is never evicted leaks memory forever under repeated failures.
- **How to apply:** done -> evict after long TTL (also rm workdir); error -> evict after a short grace TTL so the client can still read the error. Don't add a new terminal path without an eviction timer (`.unref()` it).

TTS prefers ElevenLabs (`eleven_turbo_v2_5`) and falls back to OpenAI `tts-1` if the key is missing or the call fails — keep the fallback so a missing/expired ELEVENLABS_API_KEY degrades instead of breaking the whole job.
