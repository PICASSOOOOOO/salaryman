---
name: Godot office game client
description: Godot is the real-time game client; Python and the server retain business simulation and authoritative MMO data.
---

The owner chose Godot for moment-to-moment game mechanics such as movement,
sprint, jump, fighting, sweep attacks, and animation. Python remains part of the
downloadable product for business simulation and practical systems; React
continues to use the shared browser APIs. Keep the local bridge and server
validation, especially for MMO access, movement bounds, and shared placements.

Godot is the essential player-facing runtime of the downloadable SALARYMAN OS
app, not an optional renderer or a separate product. Its playable game and the
Python-authoritative simulation go hand in hand and must be treated as one
coordinated desktop experience.

**Why:** The user corrected this explicitly: “Godot this direction is the app
itself. They go hand and hand.”

**How to apply:** Do not describe Godot as optional or position Python-only and
Godot-only launches as complete product builds. Preserve each runtime's
authority boundary while developing and packaging them together.

The Godot client can be inspected and tested structurally, but source checks and
Python bridge tests are not enough to verify gameplay feel or 3D presentation.
A live Godot launch is required before claiming camera framing, model scale,
physics, animation, or lighting are verified. Headless mode selects the dummy
renderer, so Viewport.get_texture() returns no image. For visual captures, use
a real rendering context under Xvfb with the OpenGL compatibility renderer; the
Xvfb binary may exist in the Nix store even when xvfb-run is unavailable.
Match Xvfb's virtual resolution to Godot's configured window size; a smaller
screen can clip the game window and hide HUD elements from the capture.

**Why:** A Pygame/bridge pass cannot prove responsive Godot movement or an
enjoyable 3D client, and the dummy headless renderer cannot validate or capture
the actual presentation.

**How to apply:** When changing the Godot client, test its real-time controls
and local bridge behavior, then launch it with `godot` or `godot4`. For visual
captures, start Xvfb and run Godot with `DISPLAY`, `--display-driver x11`,
`--rendering-method gl_compatibility`, and `--rendering-driver opengl3`; use a
virtual screen at least as large as the configured game window.

For entry scripts that instantiate a newly added controller, preload the script
by resource path instead of relying only on its `class_name`; a clean direct
launch can happen before Godot generates the global script-class cache.

**Why:** An editor-assisted launch can populate `.godot` metadata and hide a
missing cold-start dependency.

**How to apply:** Keep direct, clean-project launch in verification and use a
preload constant when a runtime entry script needs the new controller type.