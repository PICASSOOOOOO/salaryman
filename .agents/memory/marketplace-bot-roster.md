---
name: Marketplace bot roster (Pixel Agents)
description: How to add/modify an in-game marketplace bot in SALARYMAN and the gotchas that go with it.
---

# Adding a marketplace bot

Bots live in the `MARKETPLACE_BOTS` array in `artifacts/api-server/src/lib/seed-bots-marketplace.ts`. Each is a plain object: `slug, name, tagline, description, personality, systemPrompt, category, icon, priceMonthly, permissions, capabilities, featured`.

- `seedBotMarketplace()` runs on API startup: it deactivates any DB rows whose slug is NOT in the array, then upserts (insert-if-absent / update+reactivate by slug). So adding an entry + restarting the API server is all it takes to make it live. No migration.
- `primeName(name, slug)` transforms the display name (e.g. `MARCUS` → `Marcus Prime`); core bots like PABLO/RICK/JEAN CLAW keep their names.
- `permissions` must be valid `PermissionKey` values from `PERMISSION_KEYS` in `lib/db/src/schema/bots.ts` (crm_*, email_send, calendar_*, ai_chat, trading_*, phone_*, sheets_*, music/audio_generate, bot_management, etc.). Most non-trading bots just use `["ai_chat"]`.
- `priceMonthly` is usually `0` — individual bots are free; the whole roster is gated behind the $149/mo Jean Claw/PRIME subscription.
- `category` is a free-form string bucketed dynamically by the frontend (e.g. "core", "business", "finance", "creative", "publishing"). No enum to update.
- `icon` is looked up in `ICON_MAP` in `artifacts/interview-helper/src/pages/BotFactory.tsx`; the map is SMALL (terminal/target/shield/pen-tool/calendar/briefcase/bot/table/clapperboard/music) and anything unknown falls back to the generic `Bot` icon. Pick a mapped name if you want a real icon.
- The marketplace UI fetches bots from the API (`/api/bots/ln/list`), so no frontend list edit is needed — new bots appear automatically.

# Gotcha: hardcoded roster count

The Jean Claw and Pablo `description`/`personality`/`systemPrompt` strings contain hardcoded copy like "78 bots", "all 78 bots", "78-bot roster", and Pablo's orchestration prompt lists every department with a `(N)` count. These do NOT auto-update. When you add/remove a bot you must bump those counts by hand (or they drift and mislead the LLM/marketing copy). There's no single source-of-truth count — grep for the old number across the seed file.
