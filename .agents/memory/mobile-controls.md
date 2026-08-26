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

# Movement supports BOTH an analog joystick and tap-to-move

The bottom-left floating joystick provides continuous 360-degree movement. Tap-to-move
remains available everywhere outside the joystick and action controls: a canvas tap
routes through `handleInteraction`, resolves building/NPC/enemy/loot/ranged taps, and
otherwise sets a move target. Joystick input takes priority while held and cancels the
active target; releasing it smoothly brakes rather than snapping to a stop.

**Why:** the fluid-movement requirement explicitly restored analog touch control while
retaining the existing point-and-walk option. Both must feed the same normalized
velocity/collision model as keyboard and gamepad.

**Two separate move targets — the city loop and the interior loop do NOT share one.**
- City/world movement consumes `g.moveTarget` (world coords, set via `resolveWorldCoords`).
- Interiors run in interior-space coords and the interior movement loop does NOT read
  `g.moveTarget`. It consumes a separate `g.interiorMoveTarget`. **Why:** before this,
  interior movement on mobile worked ONLY because the joystick fed it; removing the
  joystick with no interior tap-to-move silently broke walking inside every building.
- `handleInteraction` branches early on `g.interior`: convert client→interior coords with
  the SAME `iScale/iox/ioy` centering math the decor-placement + interior render use, set
  `g.interiorMoveTarget`, return (skip city logic). Get this transform wrong and taps land
  in the wrong spot.

**Gotchas for interior tap-to-move:**
- Clear `interiorMoveTarget` when any direct control moves the player, when within ~8px, and when
  collision fully blocks both axes (else the player jams into a wall forever).
- Clear it on blur/visibilitychange alongside `moveTarget`.
- Stale-target across interior enter/exit/floor change: there are ~12 `g.interior = …`
  sites, so DON'T edit each. One guard in the interior loop — `if (interiorMoveDefRef.current
  !== iDef) { ref = iDef; g.interiorMoveTarget = null; }` — covers all transitions because
  every enter/exit/floor change builds a fresh def object.

# On-screen button layout (avoid overlaps)

The joystick lives bottom-left and action buttons (E/ATK/RUN + TEL/INV/DIR) live
bottom-right. Keep zoom +/- on the left edge at vertical center, above the joystick.
All controls are DOM elements layered above the canvas, so their touches must stop
propagation and never create accidental tap-to-move targets.
