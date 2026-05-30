---
name: Hummingbird auto-tag (MusicBrainz / beets idea)
description: How the music-library auto-tagging works and the rules for adding outbound third-party metadata lookups
---

# Hummingbird auto-tag

The Hummingbird jukebox can enrich a track's metadata + cover art from
MusicBrainz + Cover Art Archive — a native rebuild of the *beets* idea (the
Python tagger itself is NOT vendored). POST /music/tracks/:id/autotag, userId
scoped, fills artist/album/year/artworkUrl, falling back to existing values.

## Why beets/SoundJS/SoundManager2/cashmusic were NOT ported
Owner pasted them as "music feature" upgrades. Triage outcome: beets = Python
CLI (port the *idea* = MusicBrainz lookup, not the tool); SoundJS + SoundManager2
= browser audio libs already superseded by this app's Web Audio `soundEngine` +
HTML5 audio + audio-bus (redundant, SM2 is Flash-era dead); cashmusic = abandoned
PHP platform (wrong stack). Only beets' metadata concept had real fit. See
github-upgrade-requests.md for the general triage pattern.

## Outbound-lookup rules (learned here)
- **No API key**: MusicBrainz + Cover Art Archive are free; MB wants a
  descriptive User-Agent and ~1 req/sec (fine for user-triggered single calls).
- **Always bound external fetches** with `AbortSignal.timeout(...)` and return a
  deterministic 502/504 — a raw `fetch` to a third party can hang the Express
  route indefinitely under upstream stalls (availability/DoS-by-stall).
- **Escape user input in Lucene queries**: track title/artist go into a
  MusicBrainz `recording:"..." AND artist:"..."` query; strip Lucene specials
  then URL-encode.
- Cover Art Archive `release/{mbid}/front-500` 302-redirects to the image; store
  that canonical URL only after confirming it 200s. No CSP blocks external
  `<img>` in this web app, so the redirected archive.org image renders directly.
