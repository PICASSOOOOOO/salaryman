# Stylized salaryman review

Run the isolated scene with:

```sh
godot --path godot/office-client res://review/character_walk_preview.tscn
```

Use WASD or the arrow keys to move, Shift to sprint, and Escape to exit. The
scene uses the native Godot office props, two review-only coworkers, and the
game's elevated overhead 3D camera.

The review GLB keeps the existing seven-bone rig and all 32 named animation
clips. The review scene uses a broader adult silhouette, a slightly larger
head, and an in-memory walk override with a slower stride and softer arm swing.
The source GLB and its animations remain unchanged. This character is not wired into the
shared player/NPC roster; do not promote it until the appearance is explicitly
approved.

## Asset sources

- The MakeHuman base character uses MakeHuman's CC0 asset/output terms.
- `Jacket_Tie_Pants` by MRT and `SR Shoes 01` by spamrakuen are CC0 assets.
- Shirt, tie, short hair, and glasses are procedural geometry/materials.
- No third-party AGPL hair or glasses assets, external images, or Pygame art
  are included in the review GLB.
