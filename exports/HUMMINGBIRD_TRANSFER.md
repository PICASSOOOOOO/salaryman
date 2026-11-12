# SALARYMAN Hummingbird Transfer Bundle

Hummingbird is SALARYMAN's persistent personal music library and player. It is
separate from the Shadow Radio station: Hummingbird plays user-owned tracks and
can be attached as backing audio to creative tools.

## Core entry points

- Page: `artifacts/interview-helper/src/pages/MusicJukebox.tsx`
- Player UI: `artifacts/interview-helper/src/components/PabloWinampPlayer.tsx`
- State/provider: `artifacts/interview-helper/src/contexts/MusicPlayerContext.tsx`
- Track picker: `artifacts/interview-helper/src/components/TrackPicker.tsx`
- Attach control: `artifacts/interview-helper/src/components/HummingBirdAttachStrip.tsx`
- Export bridge: `artifacts/interview-helper/src/lib/hummingbird-bridge.ts`
- Navigation shortcut: `HummingbirdNavButton.tsx`
- Persistent mini-player: `GlobalMusicMiniIndicator.tsx`
- Branding icon: `HummingbirdIcon.tsx`

## Features included

- Persistent HTML audio playback across route changes.
- Play, pause, stop, next, previous, seek, volume, shuffle, repeat-all, and repeat-one.
- Local named playlists with add/remove/rename/delete behavior.
- Drag-and-drop file staging with preview, conversion, progress, save, and download.
- Authenticated user-owned track library with a 50-track / 2 GB server limit.
- Object-storage audio streaming with HTTP Range support.
- Import from direct audio URLs and the app's media library.
- MusicBrainz title/artist/album/year/artwork auto-tagging.
- Track picker reuse in SoundLab and creative tools, Pablo, and voicemail.
- Export generated audio blobs back into Hummingbird through the bridge hook.
- Central audio channels and background ownership so Hummingbird yields to calls,
  radio, world music, and other higher-priority audio tiers.
- Phone-aware mute/duck behavior and global settings controls.

## Wiring checklist

1. Mount `MusicPlayerProvider` around the destination app's authenticated UI.
2. Add a route for `MusicJukebox`, normally `/creative/music`.
3. Mount the music API router from the destination API root.
4. Port `lib/db/src/schema/music-tracks.ts` and export it from the destination DB schema index.
5. Provide authenticated object storage and adapt the `@workspace/object-storage-web`
   upload hook used by the provider.
6. Adapt the `@/` import alias, auth hook, API client, Wouter navigation, and Lucide dependency.
7. Port `audio-bus.ts`, `audio-settings.ts`, and `phone-busy.ts` together. They prevent
   competing audio sources from playing simultaneously.
8. Add `HummingbirdNavButton` and `GlobalMusicMiniIndicator` wherever the destination
   app renders global navigation/overlays.
9. Use `HummingBirdAttachStrip` as the reusable backing-track control in other tools.

## Server endpoints

- `GET /api/music/tracks`
- `POST /api/music/tracks`
- `DELETE /api/music/tracks/:id`
- `GET /api/music/stream/:id`
- `POST /api/music/tracks/:id/autotag`
- `POST /api/music/import-url`
- `POST /api/music/convert-stream-url`
- `POST /api/music/import-from-library`

AI generation is separate and uses `suno-connector.ts`; configure
`REPLICATE_API_TOKEN` only as a destination-app secret if needed. No credentials are
included in this bundle.

## Security

Keep every library query scoped to the authenticated user. Preserve upload size,
track-count, object-path, URL validation, and rate-limit protections. Do not place API
keys in client code.

The bundled Call Home MP3 tracks are in the separate audio packs delivered with the
music handoff. Hummingbird itself can start empty and load user uploads, so those
tracks are optional.
