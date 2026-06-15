---
name: SALARYMAN economy reset, starting cash, and office-sim roadmap
description: Starting-cash rules, the Picasso-safe world wipe, and the large office-sim feature roadmap the owner specified (so future sessions don't re-derive or clobber it).
---

# Starting cash (bank seed)

- New-player bank seed lives in `artifacts/api-server/src/routes/bank.ts` `ensureSeeded` (idempotent; only seeds when the player has zero accounts).
- Two seed profiles: STAFF (Picasso org / owner / dev-org) checking = `PICASSO_START_FIAT` (999,999,999, defined in `lib/plan.ts`); STARTER (everyone else).
- **STARTER checking is currently a TESTING infusion of 200,000ƒ** (owner asked: make buying office/apartment layouts easy during testing). Lower it back toward a lean grant once testing wraps.
- The hourly **unemployment stipend stays 500ƒ/in-game-hour** (separate system, `lib/salary.ts`) — do not conflate it with the bank seed.
- Seed is never quarantined (`player_ledger.quarantineFiat` defaults 0, never written) → fully spendable.

# Picasso-safe world wipe

- `POST /admin/bulk-reset` `{target:"world"}` is a full fresh-start (wipes ~25 player tables + nulls `users.active_profile_id`).
- **It now PRESERVES the Picasso org** (and any `is_developer=true` org / reserved name): it deletes every OTHER org via `WHERE is_developer=false AND lower(name) NOT IN (reserved picasso names)`, cascading to those orgs' members/grants/locks/chat/tickets. Owner hard rule: **never delete Picasso.**
- Picasso org in this DB: id 3, name "PICASSO", is_developer=true.
- It does NOT touch the bot catalog (`bot_marketplace`) or logins/billing/tester tables.

# Office-sim roadmap (owner-specified, large — build one system at a time, verify)

Owner wants SALARYMAN to be an office-sim-first cyberpunk world. Pending systems (most not built yet):

- **Bot consolidation — VERY aggressive.** ~6–8 combined multi-skill bots, one per TEAM, grouped with the pixel-agent pledge-store product. Keep **Pablo, Jean Claw, and Mila (when activated) as the ONLY assistant/chat/memory/info/management/delegation bots** — every other bot must NOT do assistant/chat. NOTE: owner said the bot catalog (`seed-bots-marketplace.ts`) "is being updated as we speak" — coordinate / don't clobber concurrent edits. Job-search (`recruiter-bot`) + LinkedIn (`recon-li`) become permanent.
- **Stock market / "Economy" section.** Every registered enterprise (fictitious OR real) gets listed in an in-game market; players trade stock, options, index funds, bonds. Make it elaborate.
- **Stamina.** Overwork drains stamina; players take breaks to refill. Money + stamina matter to every aspect. (Energy/stamina partially exists — `g.energy`, gas drains it.)
- **Office/apartment layouts.** Each floor & apartment ships a basic layout, then players customize look + layout. Org-size-gated PAID layouts chosen during onboarding if affordable; buyable with real money OR fiat via the pledge store. Money needed to buy land/buildings/construction/offices/layouts. Art = cyberpunk office sim (desks, terminal-station computers, pay phones for phone systems).
- **ATM network — pivotal.** ATMs everywhere: 3 per floor, 1 per apartment, 3 at city intersections. Shows balance, purchase history, deposits, real-money + fiat — everything. Links to pledge store + onboarding reports. Players must find an ATM to see account details.
- **Terminal access gating by in-world OBJECTS.** Only admin/Picasso/testers get the FULL terminal; everyone else reaches each tool only via the matching in-world object (computer→terminal, ATM→banking, pay phone→phone system, etc.). Build toggleable art objects mapped to existing features.
- **Entity type for tax.** Capture real enterprise type (LLC / S-corp / C-corp / sole-prop) at business registration and surface to the tax team (`tax-engine.ts`); `world_businesses`/`organizations` currently have NO entityType field.
- **Finance HUD in terminal near the nav bar** — but money-ticker/sync HUD work is already in flight via separate tasks (money ticker on phones, sync-on-change); don't duplicate.
