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
- **Art:** frames use art-kit keys `life_*` (SALARYMAN_ART_KIT). They render via
  `useArtAsset` with a graceful breathing-gradient placeholder while pending.
  Kit entries carry `backend:"unreal"` / `jobType:"landscape"`; `upsertAssetRow`
  persists those columns, and `kickoff` auto-falls-back unreal→nano-banana when
  UNREAL_RENDER_URL isn't set. `402 Insufficient credit` from apipass is an
  account-credit limit, NOT a bug — placeholders cover it.
- **framer useScroll quirk:** the scroll target is in the keep-alive
  `display:none` subtree at init, so framer logs a one-time "container has a
  non-static position" warning even though the target IS `relative`. Cosmetic;
  scroll re-measures once the home subtree is visible.
- **AudioControl FAB** is now also suppressed on `/` (added `!isRootRoute`) to
  keep the wordless door uncluttered.

**Why:** Director-scoped (#704) — exact scope, no over-build. Keep it wordless;
any new on-screen text breaks the core constraint.
