---
name: Streamer Mode + OBS WebSocket
description: In-game OBS control + the "hide sensitive info while live" display flag, and where masking must be applied.
---

# Streamer Mode + OBS WebSocket (interview-helper web)

OBS/Streamlabs record+stream control from in-game Settings via OBS WebSocket v5.

- Client: `src/lib/obs-websocket.ts` — singleton `obsClient`, useSyncExternalStore.
  Auth = `sha256Base64(sha256Base64(password+salt)+challenge)` (OBS v5 spec).
  `computeAuth`/`sha256Base64`/`formatTimecode` are exported for unit tests.
- OBS host/port persist via synced game settings (added to GameSettings DEFAULTS
  in Settings.tsx → auto-synced by settings-sync.ts). OBS **password is
  device-local only** (`sm_obs_password`), never synced.
- ws://localhost from https is allowed (localhost is a trustworthy origin); the
  setup guide tells users to keep host=localhost.

## Streamer Mode masking
- Flag lives in the SAME synced blob `sm_game_settings_v1` under `streamerMode`.
  Read it via `isStreamerMode()` (sync, pure) or `useStreamerMode()` hook
  (useSyncExternalStore on "sm-settings-changed"/"storage"); mask with
  `STREAMER_MASK` ("••••••") / `maskWhenStreaming(value,on)` — all in
  `src/lib/streamer-mode.ts`.
- **Rule: mask real-world identity + real-money USD only; leave in-game ƒ
  visible.** Any NEW surface that prints account email or a USD/real-money
  readout must wire masking. Already done: NavBar email, CurrencyTicker "YOU ƒ",
  Character.tsx email, Wallet.tsx email + USD subs (ProfileHero is a SEPARATE
  component — it calls isStreamerMode() itself, doesn't get streamerMode as prop).
