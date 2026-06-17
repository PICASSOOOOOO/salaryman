---
name: Landing trailer media pipeline
description: Environment quirks and workarounds for baking the ScrollLanding trailer (ffmpeg, tsx, ElevenLabs VO)
---

# Landing Trailer Pipeline

## Baked assets live at
`artifacts/interview-helper/public/brand/landing/`:
- `trailer.mp4` — scroll-scrubbed video (currently lavfi dark bg placeholder)
- `trailer-vo.mp3` — Pablo VO (27.6s, ElevenLabs, 7 narration lines)
- `trailer-captions.json` — `{ durationSec, captions: [{text,start,end}] }`

Audio and video are **separate files** on purpose — combined lavfi+mp3 ffmpeg streams hang (see below).

## Environment quirks (Nix build)

### tsx shell wrapper hangs
`./node_modules/.bin/tsx` hangs without output when called from bash tool.
**Fix**: Call tsx's CJS dist directly: `node node_modules/tsx/dist/cli.cjs script.ts`
Or: write pure ESM Node.js (`/tmp/assemble-trailer*.mjs`) and run with `node`.

### ffprobe hangs on mp3/webm
`ffprobe -v error ... file.mp3` hangs indefinitely even with `-nostdin`.
**Fix**: Estimate duration from file size: `bytes / (128*1000/8)` for ElevenLabs 128kbps mono mp3.

### ffmpeg hangs on WebM input (VP8/VP9)
`ffmpeg -i office.webm ...` hangs — Nix ffmpeg build can't decode WebM.
**Fix**: Either re-encode footage as mp4 during capture, or use a placeholder.

### ffmpeg lavfi + audio combined stream hangs
`ffmpeg -f lavfi -i color=... -i audio.mp3 ...` hangs even with -nostdin.
**Fix**: Generate video-only mp4 (`ffmpeg -f lavfi -t 28.1 ... -c:v libx264 video.mp4`), 
then serve audio separately. Use 1fps for solid-color videos to encode in <2s.

### ffmpeg lavfi video-only works
`ffmpeg -y -nostdin -f lavfi -i "color=c=0x050810:s=1280x720:r=1" -t 28.1 -c:v libx264 -preset ultrafast -crf 51 output.mp4`
Works fine (exit=0). Use **r=1** (1fps) + **ultrafast** to keep encoding time <5s.

### ffmpeg concat demuxer works
`ffmpeg -f concat -safe 0 -i list.txt -c:a libmp3lame ...` works for mp3 concat.
Use this for combining VO lines + silence gaps.

## Why city capture was blocked
Capture bot had no row in `player_city_visas` table — world WS disconnected immediately.
**Fix**: `ensureCaptureBot()` now upserts both minx_city and huda_city visas via `playerCityVisasTable`.

## Re-bake instructions (for when environment is healthy)
```
node node_modules/tsx/dist/cli.cjs src/scripts/bake-landing-trailer.ts capture office
node node_modules/tsx/dist/cli.cjs src/scripts/bake-landing-trailer.ts capture city
node node_modules/tsx/dist/cli.cjs src/scripts/bake-landing-trailer.ts capture terminal
node node_modules/tsx/dist/cli.cjs src/scripts/bake-landing-trailer.ts assemble
```

**Why:** `pnpm tsx` and `./node_modules/.bin/tsx` hang.
