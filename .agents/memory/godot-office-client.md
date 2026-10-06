---
name: Godot office client runtime verification
description: The optional Godot renderer is source-implemented but this workspace may not include a Godot executable.
---

The Godot office client can be inspected and tested structurally here, but a
Godot binary is not guaranteed to be installed in the workspace. Treat Python
bridge tests and asset URI checks as necessary but not sufficient; a live
Godot launch is required before claiming camera framing, GLTF scale, animation
clips, or lighting are verified. Headless mode selects the dummy renderer, so
Viewport.get_texture() returns no image. For visual captures, use a real
rendering context under Xvfb with the OpenGL compatibility renderer; the Xvfb
binary may exist in the Nix store even when xvfb-run is unavailable.

**Why:** The Pygame authority and bridge can pass completely while the optional
renderer remains un-launched, and the dummy headless renderer cannot validate
or capture the actual 3D presentation.

**How to apply:** When changing `godot/office-client`, check for `godot` or
`godot4` first and report runtime verification status explicitly. For images,
start Xvfb and run Godot with `DISPLAY`, `--display-driver x11`,
`--rendering-method gl_compatibility`, and `--rendering-driver opengl3`.