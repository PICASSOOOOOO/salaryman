---
name: Scroll-landing public front door
description: The wordless birth→work→death cinematic at "/" that sits in front of /pablo as the SEO front door.
---

# Scroll-landing front door (`/`)

The logged-out root route renders `ScrollLanding.tsx` (interview-helper), a
**100% visually text-free** scroll-driven cinematic: a salaryman's life
birth→childhood→school→first job→prime→burnout→death→open position→dormant
terminal. The final frame's power-button (icon only) runs a power-on→boot→
"enter the screen" zoom and routes to `/pablo`. It sits IN FRONT of /pablo as
the public SEO door.

- **Routing:** `HomeOrCover` in `App.tsx` returns `<ScrollLanding/>` for
  logged-out visitors at `/` (was a redirect to /pablo). Authed-uncleared still
  → /immigration, onboarded → /office. The global anon gate already allows `/`.
- **SEO without visible text:** all copy lives in an `sr-only` block (h1 +
  ordered `<h2>`/alt list); on-screen meaning is art-only. Head metadata for `/`
  comes from the existing `usePageMeta` + page-meta-data.json (unchanged).
- **Art:** frames use art-kit keys `life_*` (SALARYMAN_ART_KIT) on the DEFAULT
  `nano-banana` backend. They originally carried `backend:"unreal"` /
  `jobType:"landscape"`, which stranded them: `unreal` is unconfigured
  (no UNREAL_RENDER_URL) AND once a row baked `failed` the GET path left it
  untouched forever → permanent dead-black. Two-part fix that must stay paired:
  (1) kit entries dropped back to default nano-banana; (2) GET self-heals a
  `failed` row by re-running `kickoff` when polled, cooldown-gated
  (`shouldRetryFailedAsset`, ~3min via `updatedAt`) so a still-broken backend
  isn't hammered. The endpoint ALWAYS returns 200, so backend failure never
  breaks the page. Client mirrors this: `useArtAsset(key, 4000, {retryOnFail:true})`
  retries failed with capped exponential backoff.
- **Graceful fallback:** missing/failed frames render an on-brand neon-noir wash
  (per-index pink+cyan radial glows on #06070b + faint CRT scanlines), NOT the
  old near-black gradient — so a blank frame reads as intentional, never broken.
- **External block:** `402 Insufficient credit` from apipass (Nano Banana) is an
  account billing limit, NOT a code bug — images stay `failed` until credit is
  restored, then the self-heal/retry auto-bakes them on the next poll.
- **Ambient audio:** a soft procedural bed (`startOfficeAmbient`/`stopOfficeAmbient`
  from soundEngine, routed through the central audio chokepoint so it honors
  master-mute + `ambianceEnabled`) starts on the visitor's FIRST gesture
  (pointer/touch/key/wheel/scroll, autoplay policy), skips entirely under
  reduce-motion, reads `getAudioSettings()` once at gesture time (skip if
  muted/ambiance-off), and only stops on unmount the bed IT started.
- **framer useScroll quirk:** the scroll target is in the keep-alive
  `display:none` subtree at init, so framer logs a one-time "container has a
  non-static position" warning even though the target IS `relative`. Cosmetic;
  scroll re-measures once the home subtree is visible.
- **AudioControl FAB** is now also suppressed on `/` (added `!isRootRoute`) to
  keep the wordless door uncluttered.

**Why:** Director-scoped (#704) — exact scope, no over-build. Keep it wordless;
any new on-screen text breaks the core constraint.
