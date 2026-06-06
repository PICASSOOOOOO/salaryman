---
name: Office divider spawn-lock
description: Why the /office player "couldn't move" — spawning on the bullpen divider center line permanently locks horizontal movement.
---

# Office divider spawn-lock

PixelOffice's bullpen divider is crossable only through a door band; everywhere
else the crossing guard does `if ((cOld-dividerCenter)*(cNew-dividerCenter) <= 0) nx = x`.
If the player's center sits EXACTLY on `dividerCenter = (leftCols+0.5)*TILE`, that
product is always `0 <= 0`, so X is pinned every frame and the player "can't move /
dead end" (reads worst on mobile/tap-to-move).

The old spawn `x = (cols*TILE)/2 - FRAME_W/2` landed on that exact line whenever the
floor was symmetric (leftCols == rightCols), which is the HQ layout.

**Rule:** never spawn (or teleport) the player onto the divider center line. Spawn in
the bullpen half when `bullpen`: `x = (leftCols+dividerCols+rightCols/2)*TILE - FRAME_W/2`,
else floor center. Keep `y = charNativeY` (row ~5, above the exec wing rows 12+, always open).

**Why:** the `<= 0` crossing test treats the center line as the wall; equality is the
trap. Any guard of the form `(a-c)*(b-c) <= 0` will lock motion when the start point
equals `c`.
