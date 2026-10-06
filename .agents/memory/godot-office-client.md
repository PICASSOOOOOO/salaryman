---
name: Godot office game client
description: Godot is the real-time game client; Python and the server retain business simulation and authoritative MMO data.
---

The owner chose Godot for moment-to-moment game mechanics such as movement,
sprint, jump, fighting, sweep attacks, and animation. Python remains part of the
downloadable product for business simulation and practical systems; React
continues to use the shared browser APIs. Keep the local bridge and server
validation, especially for MMO access, movement bounds, and shared placements.

The Godot client can be inspected and tested structurally, but source checks and
Python bridge tests are not enough to verify gameplay feel or 3D presentation.
A live Godot launch is required before claiming camera framing, model scale,
physics, animation, or lighting are verified. Headless mode selects the dummy
renderer, so Viewport.get_texture() returns no image. For visual captures, use
a real rendering context under Xvfb with the OpenGL compatibility renderer; the
Xvfb binary may exist in the Nix store even when xvfb-run is unavailable.

**Why:** A Pygame/bridge pass cannot prove responsive Godot movement or an
enjoyable 3D client, and the dummy headless renderer cannot validate or capture
the actual presentation.

**How to apply:** When changing the Godot client, test its real-time controls
and local bridge behavior, then launch it with `godot` or `godot4`. For visual
captures, start Xvfb and run Godot with `DISPLAY`, `--display-driver x11`,
`--rendering-method gl_compatibility`, and `--rendering-driver opengl3`.