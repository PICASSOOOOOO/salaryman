---
name: Godot visual continuity
description: User-stated visual direction for SALARYMAN assets, animations, mechanics, and features.
---

SALARYMAN visual work should preserve continuity across assets, animation, and mechanics while bridging the established old-world feel with newer gameplay features. For the Godot game client, use Godot-side character and prop assets/scenes; do not reuse Pygame-derived pixel character sheets or pixel props as the Godot art source. Pygame character identity can guide faithful Godot recreations, but not supply the rendered art.

**Why:** The user said, “Every asset should be with the upmost continuity as well as the animation and mechanics. Bridge old world vibes with new world mechanics animations and features,” then clarified that the old Pygame look does not fit the dynamic Godot gameplay and asked to develop visuals from Godot assets. They later explicitly reaffirmed that new assets should be Godot art, not Pygame art, while asking for avatars with comparable identity fidelity.

**How to apply:** Preserve continuity and a dimensional Godot presentation while making character, prop, and animation choices fit Godot-driven exploration and combat.

Use green enamel, warm wood, and brass as the approved material direction for
the Tower's native office props.

**Why:** The user chose “Keep this direction” after viewing the native Godot
office prop render and said, “Looks good.”

**How to apply:** Extend this material language consistently to the remaining
Tower props; do not replace it with a different visual direction without asking.

For this mid-50s Japanese salaryman, use a stylized adult 3D game look rather than hyperreal proportions, with a natural walk and the game's elevated isometric three-quarter view. The old spring teaser may guide suit, shirt, and tie choices, but its footage is reference only. Keep the full source animation library and treat appearance changes as review-only until approved.

**Why:** The user rejected hyperreal proportions and corrected a near-vertical overhead review angle to the established isometric view; they also asked for a whole-building tour rather than another character close-up.

**How to apply:** Preserve movement and all source clips; override only the review character as needed. Keep the shared player/NPC roster unchanged until approval, and prioritize a floor-by-floor Tower tour over isolated idle/walk footage.

The main Godot avatars should closely resemble the Pygame characters overall, not only copy their palette or outfit, while avoiding oversized heads and sunglasses. Recreate that look with native Godot art unless the user explicitly asks to use the sprites.

**Why:** The user rejected the large-head/sunglasses direction, asked for similarity to the Pygame characters, and rejected two studies that matched mostly palette/clothing.

**How to apply:** Match the full character read more closely than color alone, keep natural head proportions and no sunglasses, and use the existing Godot pipeline. The base direction is approved; keep later cast designs review-only until the user approves them.

The user approved the attached voxel/pixel-inspired 3D character reference: stepped block geometry, adult proportions, brown hair, blue blazer, white shirt, black tie, and dark trousers. A smooth low-poly humanoid with only matching colors does not satisfy the direction. Retire the oversized-head player look, then build a varied cast: multiple men, women, human-looking replicants in civilian clothes, distinct NPCs, and pets.

**Why:** The user explicitly approved this character style and corrected the first production preview because its smooth model did not resemble the attached voxel example.

**How to apply:** Preserve the established animation/runtime path for playable humanoids, build visible block geometry rather than merely recoloring a smooth model, keep replicants visually human and civilian-dressed, and develop new cast assets in this style rather than reusing the pixel sprite sheet as finished Godot art.

The source humanoid rig can serve as an animation skeleton while all original mesh instances are hidden and block-built parts are attached to its named bones. Compute each attachment transform from the unscaled bone rest transform and the desired model-space part transform; apply shape scaling to mesh dimensions instead of independently stretching target positions.

**Why:** Nonuniformly stretching target positions against the existing bone-rest transforms caused head/torso alignment failures in the first voxel avatar pass.

**How to apply:** Keep attachment centers in the rig's native coordinate frame, verify arm and leg parts follow their individual bones, and test the visible avatar with the source animation library.

For the Floor 1/6 Tower game, elevator travel needs a camera push-in, and manual zoom-in/zoom-out controls need sound effects.

**Why:** The user explicitly said the camera zoom at transitions is important for making travel feel like a game, and requested sound effects for zooming in and out.

**How to apply:** Preserve the camera push and zoom cues when changing elevator travel or camera controls in this scene.

Keep the player's current room completely clear. Place fog only beyond its boundary: closed office doors obscure private interiors from the hallway, while an open door reveals only a limited view. Keep the elevator cabin clear and fog the outside view during travel, fading back to the destination as its doors open. Fog is presentation only; server-side authorization remains the privacy boundary.

**Why:** The user requested fog around rooms for privacy and to focus attention on the player's location.

**How to apply:** Keep the active room legible and do not rely on fog to protect room or player data.

Character-review and Tower-tour cameras should use the elevated isometric three-quarter 3D view, not a near-vertical overhead or close perspective chase angle.

**Why:** The user explicitly corrected the review camera to “isometric view like before” and rejected another close-up in place of the full building tour.

**How to apply:** Match the established isometric Tower framing when building character-review scenes and previews.
