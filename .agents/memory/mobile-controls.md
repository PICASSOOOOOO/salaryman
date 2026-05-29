---
name: Mobile touch controls (SALARYMAN WorldPlay)
description: How on-screen mobile buttons must drive gameplay actions in WorldPlay.tsx
---

# Mobile buttons must dispatch real synthetic KeyboardEvents, not mutate the keys Set

Many WorldPlay actions are **keydown-only** (handled in the `dn` window listener),
not polled every frame from `gs.current.keys`. The space/attack handler and most
interactions (building entry, secrets, NPC dialog via `e`) only run on the keydown
edge.

**Why:** a mobile button that merely does `gs.current.keys.add(' ')` / `.add('e')`
will never trigger those keydown-only paths, so attacks and many interactions
silently do nothing on phones. The fix is to `window.dispatchEvent(new
KeyboardEvent('keydown', {key}))` (and a matching `keyup`), which routes through the
same `dn` handler as a physical key. The `dn` handler already tolerates synthetic
window-targeted events (it only bails when an INPUT/TEXTAREA is focused).

**How to apply:**
- Tap action (E): dispatch keydown then a delayed keyup (~200ms).
- Hold-to-attack (ATK): dispatch keydown immediately + on a setInterval (~120ms);
  keyup on release. Space attack self-gates on `g.attackCooldown`, so re-dispatching
  faster than the weapon cadence is safe.
- Any held-button interval needs a safety stop: clear it on unmount AND in an effect
  that fires when the mobile controls hide (pause/death/phone/dir-overlay/HUD-close),
  because touchEnd may never arrive if the control unmounts mid-hold.

# Floating joystick

Movement joystick anchors its base at the touch-down point (left half of screen,
below the top HUD strip) rather than a fixed corner, so the thumb never has to reach.
Store the anchor in state (e.g. `joystickBase`), clear it on touchEnd, and render the
ring at that fixed position when set, else docked bottom-left.
