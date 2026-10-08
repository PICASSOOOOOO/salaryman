---
name: Godot visual continuity
description: User-stated visual direction for SALARYMAN assets, animations, mechanics, and features.
---

SALARYMAN visual work should preserve continuity across assets, animation, and mechanics while bridging the established old-world feel with newer gameplay features. For the Godot game client, use Godot-side character and prop assets/scenes; do not reuse Pygame-derived pixel character sheets or pixel props as the Godot art source.

**Why:** The user said, “Every asset should be with the upmost continuity as well as the animation and mechanics. Bridge old world vibes with new world mechanics animations and features,” then clarified that the old Pygame look does not fit the dynamic Godot gameplay and asked to develop visuals from Godot assets.

**How to apply:** Preserve continuity and a dimensional Godot presentation while making character, prop, and animation choices fit Godot-driven exploration and combat.

Use green enamel, warm wood, and brass as the approved material direction for
the Tower's native office props.

**Why:** The user chose “Keep this direction” after viewing the native Godot
office prop render and said, “Looks good.”

**How to apply:** Extend this material language consistently to the remaining
Tower props; do not replace it with a different visual direction without asking.

For this mid-50s Japanese 1980s office character, the user's latest direction is a pixel-styled presentation optimized for the angled overhead game view. Keep the existing Godot rig and its locomotion animations, do not use Pygame art, and keep the character in an isolated preview until review.

**Why:** The user redirected this character from an earlier realistic redesign toward an overhead-ready pixel look; this is a character-specific update, not a general visual change for the Godot cast.

**How to apply:** Preserve the existing rig, movement, and animation. Keep the shared player, automation, and receptionist actors unchanged until the new appearance is reviewed.

For the Floor 1/6 Tower game, elevator travel needs a camera push-in, and manual zoom-in/zoom-out controls need sound effects.

**Why:** The user explicitly said the camera zoom at transitions is important for making travel feel like a game, and requested sound effects for zooming in and out.

**How to apply:** Preserve the camera push and zoom cues when changing elevator travel or camera controls in this scene.

Keep the player's current room completely clear. Place fog only beyond its boundary: closed office doors obscure private interiors from the hallway, while an open door reveals only a limited view. Keep the elevator cabin clear and fog the outside view during travel, fading back to the destination as its doors open. Fog is presentation only; server-side authorization remains the privacy boundary.

**Why:** The user requested fog around rooms for privacy and to focus attention on the player's location.

**How to apply:** Keep the active room legible and do not rely on fog to protect room or player data.
