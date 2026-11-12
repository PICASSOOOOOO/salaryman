---
name: Quarter / season / weather model
description: How SALARYMAN story quarters drive season+weather, which quarter source is authoritative, and where assignment progress belongs
---

# Quarter → season → weather (SALARYMAN city)

The story runs in quarters Q1–Q4 mapped to the **real calendar year**, matching the year-long gas arc. Each quarter pins a season; weather re-picks at the quarter/season boundary.

## Durable rules (not obvious from the code)

- **The calendar tick returns a fresh object — assign it back.** The world loop must capture the return of the calendar tick; calling it for side effects silently no-ops (season/weather and the quarter-boundary re-pick never apply) yet still typechecks. **Why:** invisible to the type checker; makes weather appear static.
- **The real-calendar quarter is the authoritative current quarter for UI/progress — not the story's stored quarter.** The server seeds the story quarter once and never advances it, so reading it pins the assignments UI to Q1 forever. Derive both the quarter and the season shown beside it from the same real-quarter source. **Why:** otherwise quarter+season drift apart and progress sticks on Q1 once the real quarter advances.
- **Weather must survive a reload.** Weather is randomly picked, so it has to be persisted in the save blob and restored before the loop starts; on restore, re-pin season to the real quarter and let the tick re-pick weather only if the quarter changed. **Why:** "persist across sessions" includes weather, and a fresh init would re-roll it every load.

## Where assignment progress belongs

Per-quarter story-assignment progress lives in the per-save-slot story blob, **not** the per-user season/battle-pass tables. **Why:** the season layer is a per-user monetized battle-pass (XP/tiers/premium, daily/weekly grind missions); story assignments are per-character ordered narrative content (slot 1 is that character's Shadow Tower mission). Forcing them into the battle-pass tables conflates two different concepts. **How to apply:** add new per-character story progress to the story blob; reserve the season tables for the battle-pass.
