---
name: Quarter / season / weather model
description: How SALARYMAN's story quarters drive season+weather and which quarter source is authoritative
---

# Quarter → season → weather (WorldPlay city)

The story runs in quarters Q1–Q4 mapped to the **real calendar year** (`getRealQuarter()` in gameSystems.ts), matching the year-long gas arc. Each quarter pins a season (`QUARTER_SEASON` {1:WINTER,2:SPRING,3:SUMMER,4:AUTUMN}); weather is re-picked at the quarter/season boundary.

## Two gotchas that cost real time

1. **`tickCalendar(cal, dtMs, forcedSeason?)` returns a NEW WorldCalendar — it does NOT mutate.** The city loop MUST assign the result back: `g.calendar = tickCalendar(...)`. A bare `tickCalendar(g.calendar, ...)` silently no-ops, so season/weather and the forced-season quarter-boundary re-pick never apply, yet everything still typechecks.

2. **`getRealQuarter()` is the authoritative current-quarter source for UI/progress — NOT `story.quarter`.** Server seeds `story.quarter = 1` on begin-story and never advances it, so `story?.quarter ?? getRealQuarter()` pins the assignments panel to Q1 forever. Derive quarter (and the season shown next to it) from `getRealQuarter()` everywhere in the assignments UI so quarter+season stay consistent and real-calendar aligned.

**Why:** both bugs are invisible to the type checker and to a quick glance; the first makes weather static, the second makes assignment quarter wrong once the real quarter advances.

## Assignment persistence
Per-quarter assignment progress lives in `story.assignmentsCompleted: string[]` inside the per-slot jsonb `data.story` blob (NOT a per-user season table) — assignments are per-character story content (slot 1 = per-character Shadow Tower mission `and_it_all_falls_down`). Server story-merge spreads `incomingStory`, so the field rides along with no DB migration.
