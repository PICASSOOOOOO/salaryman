---
name: Camera / game-settings bridge
description: How game settings reach the WorldPlay canvas engine, and the camera zoom defaults
---

# Settings → WorldPlay bridge

WorldPlay.tsx does NOT read `sm_game_settings_v1` reactively (no hook/context).
Most settings keys (reducedMotion/bloom/cinematic/controlScheme) are currently
NOT consumed by the game loop at all — only `uiScale` (CSS var) and the new
`cameraZoom` are wired through.

**Camera zoom:** `computeDefaultZoom()` (module-level, ~line 160) reads
`cameraZoom` straight from localStorage `sm_game_settings_v1` and clamps to
`ISO_ZOOM_MIN..MAX`. This is the bridge. It only runs at zoom seeding
(useRef init / resize), so a settings change applies on (re)entering the city,
not live. Live zoom = pinch/wheel/buttons.

**Why:** the engine has no reactive settings subscription, so reading
localStorage directly inside the module function is the lowest-risk bridge
without rewiring 23k lines.

**How to apply:** to make a NEW game setting actually affect the canvas, you
must add an explicit consumer in WorldPlay — adding it to Settings.tsx alone
does nothing. Default start zoom is fixed CLOSE (ISO_ZOOM_DEFAULT 3.2, narrow
phone floor 2.6); the old width-scaling that made it "too wide" on mobile was
removed.

# Global display prefs

CRT/scanline grade toggle lives in `lib/display-prefs.ts` (mirrors lowGfx.ts):
toggles `no-crt` on <html>, applied at boot in main.tsx and live from Settings.
Terminal boot-animation toggle is gated centrally inside
`TerminalBootAnimation.tsx` (reads `terminalBoot`), not at each call site.
