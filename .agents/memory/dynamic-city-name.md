---
name: Dynamic active-city name on chrome surfaces
description: How SALARYMAN surfaces display the current realm name dynamically instead of hardcoded "Minx City"
---

# Dynamic city name

The current realm/city name is module-level state in `lib/city-defs.ts`
(`getActiveCityDef()` / `getActiveCityName()`). It is ONLY set by WorldPlay's
mount-time resolution (`setActiveCityId(...)`). Any chrome surface reached
WITHOUT first loading WorldPlay (office, terminal, profile, maps, settings,
billboard admin, home dashboard) would otherwise show the default (Minx).

**Rule:** chrome pages that name the city call `hydrateActiveCityFromSave()`
as the first line of the component body, then render `getActiveCityName()`
(or `getActiveCityDef().name` inside WorldPlay, which already imports it).
`hydrateActiveCityFromSave()` mirrors WorldPlay's resolution (fresh
`city_travel` <60s wins, else `sm_save.cityId`, else default) and feeds the
SAME active-city system — it is not a parallel source.

**Why:** the user reported "Minx City" hardcoded everywhere including the
sign-in page; cities are regional/timezone servers (Minx=NA, Huda=Asia) and
each must self-name.

**Deliberately LEFT as "Minx City" / `CITY_NAME` (out of scope):**
- NPC dialogue, backstories, narration, history book, faction lore, item/
  property names (e.g. `MINX CITY STUDIO`), and the `minx_city` region def.
- `worldInteriorData.ts` real-estate label + studio/penthouse `zone` fields:
  these are MODULE-EVAL static data (evaluated at import, before any active
  city exists), so they cannot read the active city without a forbidden
  lazy/parallel mechanism. Accepted limitation.
- Hardcoded `PST` timezone readouts (the task was the city NAME, not tz).
