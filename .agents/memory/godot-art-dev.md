---
name: Godot art development
description: Godot 4 is the animation review/export renderer for shared SALARYMAN sprite sheets, not the gameplay or art-catalog authority.
---

Godot 4 art-dev consumes the existing 16×32 character-sheet contract and
publishes rendered PNG review frames through the API's `/ws/godot/render`
bridge. The web app remains the gameplay runtime; the API remains authoritative
for prompts, asset records, QA, and provider selection.

**Why:** This gives animation work a real game-rendering loop without splitting
gameplay state or duplicating the art pipeline across another server.

**How to apply:** Keep Godot changes focused on preview/export quality and
renderer-side animation. Promote reviewed outputs through the existing art
catalog and QA flow rather than making the Godot project a second source of
truth.