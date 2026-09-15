---
name: Pablo front-door controls (/pablo)
description: How the /pablo nebula interaction surfaces a usable talk/type control and the bottom "safe lane" layout invariant.
---

# Pablo front-door (/pablo) interaction clarity

The nebula is a full-bleed background; tapping it (`onOrbClick`) starts/stops the
mic. That tap target is INVISIBLE, so voice-first users who don't know to tap the
background appear stuck ("can't get past Pablo"). The fix that works: an explicit,
always-visible, labeled **"Tap to talk"** button wired to `onOrbClick` — present in
BOTH the intro (`showIntro`) and post-onboarding (`!showIntro && mode !== "text"`)
states. The intro also has the bordered text input + "Send"; the cryptic tiny
monospace hints/intake chip were removed in favor of one plain instruction line.

**Why:** assume every user reads slowly / has a learning disability — one clear
primary action beats hidden gestures + duplicated cryptic prompts. (NOT age-based
conditional styling; the owner explicitly rejected that framing.)

## Bottom "safe lane" invariant
Post-onboarding voice mode stacks three absolutely-positioned things at the bottom,
anchored by `bottom: env(safe-area-inset-bottom) + Npx`:
- talk-button control container (button + instruction) — lowest, ~24px, `z-20`
- reply/transcript bubble — must sit well ABOVE it (voice offset ~140px)
- idle lore bubble — higher still (`bottom-44 sm:bottom-48`)

**How to apply:** if you add/resize any bottom control here, keep a real gap (not
near-equal offsets) between the talk control and the bubbles, and keep the talk
control at a higher z-index than the `z-10` bubble wrappers, or the bubbles overlap
and intercept taps. Reply bubble offset is mode-split (`mode === "text" ? 96 : 140`).
Text mode has its own separate input form; voice and text controls are mutually
exclusive by `mode`.

The header must keep a visible chat escape hatch on mobile. The chat control
switches directly to text mode; it must not call the voice/orb handler, and it
must not be hidden behind a desktop-only secondary-control rule.

TTS output is NOT gated to voice mode (replies speak in text mode too); only
auto-listen is mode-gated. See pablo-voice-output-gating.md.

## Top-edge overlap with the global alpha banner
PabloTerminal's root is a full-screen fixed/absolute layout, so the global
desktop-only sticky `AlphaWipeBanner` (z-[10000], `hidden sm:flex`) draws OVER
the top of the page instead of pushing it down. A multi-line banner overlaps the
SALARYMAN logo and occludes the fixed top pills (GFX/status at `top: inset+12px`).
**Keep the banner copy to a single line** (`truncate min-w-0`) so it stays ~36px
and clears the header's `paddingTop: inset+48px`. Don't let banner copy grow back
to two lines without also re-checking this overlap.

