---
name: Tower floor previews
description: The user's visual direction and hands-on test scope for accessible Tower floors.
---

Use Godot-native 3D dioramas for Tower floor previews B1–B6 and F1–F12. Do not present Pygame-rendered Tower floor art. Review renders are visual references, not proof that gameplay interactions work.

For review dioramas, compress the Tower simulation coordinates by 10× while leaving authored prop dimensions and wall heights unchanged. Do not use that preview scale in gameplay.

The user's hands-on desktop test covers every floor layout, doors, objects, character mechanics, and controls.

**Why:** The user rejected Pygame Tower art and specified the actual gameplay areas they intend to test.

**How to apply:** Keep Tower preview imagery Godot-rendered. Keep coordinate compression confined to visual reviews; before saying a desktop build is ready for the user's test, confirm it was built from the current game source and distinguish static preview checks from live interaction testing.
