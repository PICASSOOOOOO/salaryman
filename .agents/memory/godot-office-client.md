---
name: Godot office client runtime verification
description: The optional Godot renderer is source-implemented but this workspace may not include a Godot executable.
---

The Godot office client can be inspected and tested structurally here, but a
Godot binary is not guaranteed to be installed in the workspace. Treat Python
bridge tests and asset URI checks as necessary but not sufficient; a live
Godot launch is required before claiming camera framing, GLTF scale, animation
clips, or lighting are verified.

**Why:** The Pygame authority and bridge can pass completely while the optional
renderer remains un-launched.

**How to apply:** When changing `godot/office-client`, check for `godot` or
`godot4` first and report runtime verification status explicitly.