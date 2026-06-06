---
name: Pixel Agents showcase (interview-helper)
description: Canonical "Pixel Agents" naming/consolidation direction + how the Pledge Store agents page works (procedural faces).
---

# CANONICAL NAMING + CONSOLIDATION TARGET (owner directive)
**"Pixel Agents" is the canonical name for what was "Bot Factory."** The single page
for purchasing, editing, AND controlling bots/agents must be called **Pixel Agents**
(not "Bot Factory"/"Marketplace") and carry extensive artwork. It should be **tied to
the Pledge Store** and ultimately **consolidated into ONE massive SALARYMAN
marketplace** — a single commerce surface spanning agents + pledge-store goods —
instead of today's split `/bots` (BotFactory, nav label "MARKETPLACE"/boomer "BOT
FACTORY"), `/pledge` (PledgeStore), and `/pledge/agents` (PixelAgents showcase).
**Why:** owner brand/product decision (recorded in replit.md User Preferences too).
**How to apply:** when consolidating, fold buy/edit/control + pledge goods under the
Pixel Agents banner; update `lib/modules.ts` labels (the `marketplace` module at
`/bots` still says BOT FACTORY) and the App.tsx routes together. Confirm scope with
owner before the big merge — it's a far-reaching architectural change.

# Pledge Store agents showcase (current state)
Route `/pledge/agents` (`src/pages/PixelAgents.tsx`) is the spectacular "Meet the Pixel Agents" experience reached from the Pledge Store's PIXEL AGENTS card. It fetches the live roster from the public `GET /api/bots/marketplace/list`.

**Faces are procedural, not stored.** The `bot_marketplace` table has no image/avatar/portrait column, so `src/components/PixelAgentFace.tsx` renders a deterministic SVG pixel-art bust seeded by the bot `slug` (FNV-1a hash + mulberry32). All agents share one steel chassis; the division (category) accent color tints eyes/mouth/antenna glow.
**Why:** zero network cost, instant, never fails — and there is no per-bot art to load. (A user-bot portrait minting endpoint `POST /api/bots/:id/portrait` exists but is per-owned-bot and slow; not used here.)

**Teams = `category`.** `DIVISIONS` / `DIVISION_ORDER` / `divisionFor()` in PixelAgentFace.tsx map each category to a display label + accent + face theme.

**Pricing:** every per-bot `priceMonthly` is 0; the whole roster is gated behind the $149/mo PRIME / Jean Claw subscription. So the UI shows "Included with Prime", and CTAs are: "Go Prime" (Stripe link `PRIME_PAYMENT_LINK` + `client_reference_id`) and "Open in Factory" → `/vending`.

**How to apply:** to feature a bot in the hero/"Heavy Hitters" strike team, edit `STRIKE_TEAM_SLUGS` (missing slugs are skipped, falling back to `featured` rows). Hero = `claw-bot` (JEAN CLAW).
