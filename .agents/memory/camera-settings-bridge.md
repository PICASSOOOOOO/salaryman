---
name: Camera / game-settings bridge
description: How game settings reach the WorldPlay canvas engine, and the camera zoom defaults
---

# Settings → WorldPlay bridge

WorldPlay.tsx does NOT read `sm_game_settings_v1` reactively (no hook/context).
Many settings keys (reducedMotion/cinematic/controlScheme) are still NOT
consumed by the game loop at all — `uiScale` (CSS var) and `cameraZoom` are
wired through, plus the heavy-effect quality trio below.

**Heavy-effect quality (perf toggles):** `bloom`/`groundGlow`/`nightLighting`
ARE now consumed. `readGfxQuality()` (module-level, near readCameraZoomPref)
reads those 3 keys from `sm_game_settings_v1` AND folds in low-graphics mode
(`salaryman_low_gfx` = "1" forces all 3 off). The result is cached in
`gfxQualityRef`, refreshed by an effect listening on `storage` +
`sm-settings-changed` (Settings.tsx dispatches this on every save, since
same-tab `storage` events don't fire) + `salaryman:lowgfx-changed`. The loop
reads the ref, never localStorage per-frame. Gated passes live in the
night-atmosphere block (~line 19600): bloom→per-building neon glow radial,
groundGlow→ground-glow pools, nightLighting→whole vignette/lantern block AND
the flat post-restore night/dusk/dawn tint. Neon/ground glow are nested inside
the nightLighting gate (they only render in darkness anyway).

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
