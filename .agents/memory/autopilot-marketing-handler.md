---
name: Marketing autopilot handler
description: How the Marketing domain of Bot Autopilot drafts + publishes social posts, and the PRIME/credit gating it must enforce.
---

# Marketing autopilot handler

The Marketing autopilot domain auto-drafts and publishes an org's social posts on
a recurring cadence, built on the Bot Autopilot Foundation. It MUST call the same
service functions the manual Marketing Command Center screens call — never
re-implement the logic — so manual and automatic paths can't diverge.

## Shared service layer (the contract enforcer)
`lib/social-service.ts` holds the single implementation of `generateSocialCopy`,
`publishSocialPost`, `SOCIAL_PLATFORMS`, `isSocialPlatform`, `SocialPost`. Both
`routes/social-media.ts` and the autopilot handler import from it. If you change
social generation/publishing behavior, change it here once.

- `generate-variants` in social-media.ts still calls `openai` directly (separate
  feature, out of the autopilot publish flow) — that's why the openai import
  remains in the route file.

## Gating (the easy mistake)
**Why:** `/social/generate` is HARD PRIME-gated (`requireClaw`) and is NOT
Pablo-Tax-metered. `/social/posts/:id/publish` is open and `publishSocialPost`
does its own PRIME check (real post only if PRIME + connected, else simulated).

**How to apply:** before generating, the handler must call BOTH
`ctx.ensureEntitlement("claw_bot")` (mirrors requireClaw) AND `ctx.ensureCredit()`
(Pablo-Tax preflight). Skipping ensureEntitlement would let a non-PRIME org leak
free AI generation through autopilot — a gate bypass, not just a billing miss.
Publishing itself relies on publishSocialPost's internal fallback, so it never
hard-fails; a downgraded/unconnected org gets a simulated post + `needsConnection`.

## Handler shape
One post per tick (avoid spam): `claimAction()` → entitlement+credit → pick
platform by rotating the owner's *connected* accounts (evergreen default set
twitter/linkedin/instagram if none) → topic grounded in org name +
`getBrandKit`/`buildBrandContext` (studio-gen) + rotating evergreen angle →
`generateSocialCopy` → insert draft (`userId=ownerId`, `aiGenerated="yes"`,
status `draft`, lands in the human's posts list) → `log draft_post` →
`publishSocialPost` → `log publish_live` or `publish_simulated`. Autopilot acts as
the org OWNER; social_connections are per-userId, queried by `userId=ownerId`,
`status="connected"`.

Registered in `index.ts` via `registerAutopilotHandler("marketing", ...)` BEFORE
`startAutopilotScheduler()`.

## Owner-tunable prefs (platforms / tone / topics)
Per-org marketing prefs live in the GENERIC `autopilot_configs.prefs` jsonb (one
column shared by all domains; only marketing has a defined shape today —
`MarketingAutopilotPrefs` in lib/db). Pure validate/resolve helpers are in
`lib/autopilot/marketing-prefs.ts` (unit-tested): `sanitizeMarketingPrefs`
(only known platforms, allowed tone else default "professional", topics
trimmed/capped) and `resolveMarketingTargets` (allow-list ∩ connected, else
allow-list, else connected, else DEFAULT_PLATFORMS). Handler reads via
`readMarketingPrefs(ctx.config.prefs)`; empty prefs == old evergreen behavior.
**Why:** platform validation needs `isSocialPlatform` (social-service, api-server)
so the sanitizer CANNOT live in lib/db — db only holds the type + tone/topic
constants. PUT route merges incoming partial over stored prefs then sanitizes,
gated on `domain==="marketing"`. UI = `MarketingPrefsEditor` on the marketing
card in `pages/Autopilot.tsx` (the `/business/l` page, NOT MarketingCommandCenter
despite the task wording — that's where the autopilot toggle actually is).
