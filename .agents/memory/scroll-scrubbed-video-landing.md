---
name: Scroll-scrubbed video landing
description: Design rules for the "/" anon landing that scrubs a gameplay trailer by scroll with a Pablo voice-over (ScrollLanding.tsx).
---

# Scroll-scrubbed gameplay-trailer landing

The anon front door (`ScrollLanding.tsx`, route `/`) plays a real gameplay trailer
scrubbed by page scroll, with a Pablo voice-over and captions, ending on the
existing terminal power-on → `/pablo` beat.

## Durable rules (easy to regress)
- **Re-encode the clip for seeking, not playback.** A scrubbed `<video>` seeks via
  `currentTime`; default GOPs scrub choppily. Encode with a dense GOP + faststart +
  muted (e.g. `-g 6 -keyint_min 6 -sc_threshold 0 -movflags +faststart -an`). This
  trades file size (≈15MB for ~42s @720p) for smooth seeking — that's expected.
- **Voice-over is a SEPARATE `<audio>` track, never muxed.** The video is scrubbed,
  so its own audio would be unusable. The VO plays continuously on its own clock.
- **Captions must NOT be driven by the audio's `timeupdate` alone.** When the VO is
  muted (site mute setting) or autoplay-blocked, `timeupdate` never fires and
  captions vanish. Drive captions off a clock started on the first user gesture:
  prefer `audio.currentTime` only while the VO is actually playing, else fall back
  to elapsed wall-clock time. **Why:** captions are the muted/scrubbing fallback —
  they are the whole accessibility story and must always run.
- **Loading state shows the real poster frame, not an abstract wash.** Keep the
  on-brand neon wash strictly for an actual video load failure (`videoFailed`),
  never during normal buffering — the `<video>`/`<img>` poster covers the gap.
- The screenshot/headless browser forces reduce-motion and often won't decode the
  mp4, so `/` screenshots show the poster image, not a scrubbing video — verify
  scrub/VO behavior by reasoning + asset checks, not by screenshot.
