# Candidate B — in-game character

Run this separate review scene from the repository root:

```sh
godot --path godot/office-client res://review/in_game_salaryman_review.tscn
```

Use ←/→ to turn, R to reset, and Esc to exit. It instances the production-base
`character-male-a.glb`, applies the 1980s salaryman atlas as a review-only
material override, plays its existing idle clip, and scales only the head joint
to 0.82. Review-only mesh cleanup removes the source head's merged eyewear
details, and small pupils make its eye surfaces read clearly. **UNAPPROVED
REVIEW ART**; production files and all 32 source clips remain unchanged.
