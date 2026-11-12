---
name: Shared localStorage blob ownership
description: Why a page that loads a whole shared localStorage blob into state can silently clobber another store's keys.
---

When two independent stores persist into the SAME localStorage key (e.g. game
settings and the central audio store both writing `sm_game_settings_v1`), a page
that does `state = {...DEFAULTS, ...JSON.parse(raw)}` and later re-persists
`{...existing, ...state}` will carry the OTHER store's keys inside its local
`state` and write stale copies back — clobbering values the other store owns,
on any unrelated change.

**Why:** `JSON.parse` returns ALL persisted keys at runtime regardless of the
TypeScript type; spreading it into typed state quietly smuggles foreign keys in.
Merge-on-save does not help because the foreign keys are already inside `state`.

**How to apply:** When a page shares a localStorage blob with another store,
whitelist on LOAD — copy only the page's own keys (e.g. iterate
`Object.keys(DEFAULTS)`) out of the parsed blob. Then merge-on-save preserves
the other store's keys from `existing`. Keep each store's keys canonical in its
own module; pages never re-persist keys they don't own.
