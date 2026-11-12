---
name: Pixel Agents showcase (interview-helper)
description: Canonical "Pledge Store" / "Pixel Agents" naming + how the merged store + agents showcase work (procedural faces).
---

# CANONICAL NAMING (owner directive — FULL MERGE DONE)
**"Pledge Store" (`/pledge`) is the ONE SALARYMAN marketplace.** **"Pixel Agents" are
the bots FOR SALE — the product line shown INSIDE the store, NOT the page name.**
**Kill all user-facing "Bot Factory" / "Factory" / generic "MARKETPLACE" naming for
bots** (brand it Pledge Store / Pixel Agents instead).
**Why:** owner brand/product decision (also in replit.md User Preferences).

# Surface map after the merge
- `/pledge` = PledgeStore.tsx. Has a Store / Pixel Agents view toggle (`view` state,
  reads `?view=agents`, and `switchView` keeps the URL in sync via replaceState).
  The Pixel Agents tab renders `<PixelAgents embedded />` (embedded prop strips its
  own page chrome/nav/bg).
- `/pledge/agents` → **redirects** to `/pledge?view=agents` (App.tsx). No standalone
  showcase route anymore.
- `/bots` = BotFactory.tsx, **intentionally NOT redirected** — kept as the rebranded
  management/CONTROL arm (deep bot CRUD, connectors, tasks, memory, deploy/activate +
  Bot Finder/command center landing). Branding inside is "Pixel Agents"; do NOT rename
  the component or rewrite it.
- Nav: primary tab (NavBar + MobileBottomBar) is `id:'bots'` but points to `/pledge`,
  label "AGENTS"; active-state checks include both `/pledge` and `/bots`. modules.ts
  `bots` module: defaultPath `/pledge`, sub "store"(/pledge,"PLEDGE STORE") +
  "my-bots"("MY AGENTS"); getModuleForPath maps `/pledge`→MODULES[2].
- **i18n:** all bot-surface copy lives under the `botFactory` key block in
  `i18n/locales/*.json` (8 langs). title/titleCodename/tabStore/tabStoreCodename/
  browseStoreCodename/signInContext/noBotsYetCodename were rebranded off Factory/
  Marketplace to Pixel Agents / Pledge Store. If you add bot copy, brand it there.

# Pixel Agents showcase internals
- Roster from public `GET /api/bots/marketplace/list`.
- **Faces are procedural, not stored.** `bot_marketplace` has no image column;
  `PixelAgentFace.tsx` renders a deterministic SVG bust seeded by bot `slug`
  (FNV-1a + mulberry32). Division (`category`) accent tints eyes/mouth/antenna.
- **Teams = `category`** (`DIVISIONS`/`DIVISION_ORDER`/`divisionFor()`).
- **Pricing:** every per-bot `priceMonthly` is 0; whole roster gated behind $149/mo
  PRIME / Jean Claw sub. CTAs: "Go Prime" (Stripe `PRIME_PAYMENT_LINK` +
  `client_reference_id`) and "Open in Command Center" (`onFactory` → `/vending`).
- Hero/strike team: edit `STRIKE_TEAM_SLUGS` (missing slugs fall back to `featured`).
  Hero = `claw-bot` (JEAN CLAW).
