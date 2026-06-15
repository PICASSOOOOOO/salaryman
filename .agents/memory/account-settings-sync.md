---
name: Account settings cross-device sync
description: How UI/display preferences (graphics quality, audio, camera zoom, low-gfx) sync to the account so they follow players across devices.
---

# Account settings cross-device sync

UI/display preferences are no longer device-only. They mirror to the signed-in
account so they follow players across devices.

- **Storage:** `users.gameSettings` JSONB (lib/db/src/schema/auth.ts). Shape:
  `{ settings: <sm_game_settings_v1 blob>, lowGfx: boolean }`. Null = never synced.
- **API:** `GET/PUT /account/settings` (api-server routes/account.ts). PUT does a
  read-merge so a partial body (only `settings` OR only `lowGfx`) keeps the other
  field. Blob capped at 8KB (413). Login required (401 otherwise).
- **Client:** `interview-helper/src/lib/settings-sync.ts`
  - `hydrateSettingsFromServer()` — pulls + MERGES into local (`{...local, ...server}`,
    server wins per-key) and calls `setLowGfx`; fires `sm-settings-changed`.
  - `initSettingsSync()` — debounce-pushes (1s) on `sm-settings-changed` +
    `salaryman:lowgfx-changed`. Both wired in App.tsx, gated on `isAuthenticated`.

**Why:** local-only localStorage (`sm_game_settings_v1` + `salaryman_low_gfx`)
meant switching phone/laptop or clearing the browser wiped every tuning choice.

**How to apply:** the `settings` blob is the WHOLE sm_game_settings_v1 (game +
audio keys), so audio volumes ride along too. WorldPlay's readGfxQuality()/
readCameraZoomPref() still read localStorage — hydration writes there first, so no
renderer change was needed. Logged-out players never call sync; a 401 PUT no-ops.
