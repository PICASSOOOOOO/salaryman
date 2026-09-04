# SALARYMAN 1999 + Music Transfer Bundle

This is the music technology slice of SALARYMAN for moving into another app.

## The 1999 surface

- Browser route: `/creative/lab`
- Main UI: `artifacts/interview-helper/src/pages/SoundLab.tsx`
- Audio workstation: Web Audio API synth voices, drum sequencer, effects, mixer,
  analyser/visualization, backing-track picker, and Terrence assistant integration.
- `MusicJukebox.tsx` is the library/player surface for uploads, URL imports, media
  library imports, playlists, drag-and-drop staging, conversion, metadata tagging,
  previews, and downloads.

## Music systems included

- `MusicPlayerContext.tsx`: persistent player state, queue, shuffle/repeat, playlists,
  upload/stage/convert/save flows, previews, and downloads.
- `OfficeRadio.tsx` and `RadioPlayer.tsx`: one global Shadow Radio station, 31 Call Home
  tracks, saved playback position, DJ voice lines, route/call ducking, and background
  audio ownership.
- `audio-bus.ts` and `audio-settings.ts`: master/music/soundtrack/voice channels,
  muting, volume, priority, and cross-route coordination.
- `soundEngine.ts`: UI/game music and procedural audio helpers.
- `routes/music.ts`: authenticated track library, object-storage streaming with ranges,
  URL/library imports, MusicBrainz auto-tagging, and deletion.
- `suno-connector.ts`: Replicate MusicGen generation adapter. The filename is retained
  for compatibility; the provider is Replicate.
- `routes/platform-api.ts`: authenticated music-generation API surface and feature gate.
- `music-tracks.ts`: PostgreSQL/Drizzle schema for user-owned track metadata.

## Required integration pieces in the destination app

1. Copy the selected source files while adapting aliases such as `@/` and
   `@workspace/db` to the destination app.
2. Mount the music router from the destination API router.
3. Port the `music_tracks` schema and apply it through the destination database workflow.
4. Provide object storage for uploaded audio; the API stores object paths and metadata,
   not audio bytes in PostgreSQL.
5. Configure the destination app's Replicate credential as a secret named
   `REPLICATE_API_TOKEN` if AI generation is wanted. No credential is included here.
6. Review authentication, ownership checks, upload limits, rate limits, and billing
   gates before exposing the routes in the new app.

## Bundled audio

`artifacts/interview-helper/public/callhome/track-01.mp3` through `track-31.mp3` are
included for the Shadow Radio sample station. Confirm you own or have redistribution
rights for these recordings before committing them to a public GitHub repository.

The full app source archive intentionally excludes the raw `attached_assets` collection,
which contains large uploads and source materials. It does include the tracked public
application assets needed by the current web build.
