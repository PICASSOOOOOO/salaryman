# SALARYMAN appearance review

Run the standalone, review-only character scene from the repository root:

```sh
godot --path godot/office-client res://review/realistic_salaryman_review.tscn
```

Use the left/right arrow keys to turn the model, R to reset, and Escape to exit.
The isolated full-body three-quarter view uses `realistic_salaryman_preview.glb`,
hides all explicit glasses meshes, and applies a smaller head proportion through
the head skeleton joint only (0.82 scale). Review-only materials reinterpret the
sprite's warm-brown hair, visible face, blue jacket, white shirt, black tie, and
dark trousers as 3D colors; the pixel sheet is identity/color reference only and
is not used as rendered art.

**UNAPPROVED REVIEW ART.** This is a visual candidate only. No production player
or NPC model, shared roster, animation clip, material, UI avatar, browser/Pygame
art, or backend asset is changed.
