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
In this workspace, Xvfb is not on PATH, and the installed FFmpeg does not
provide the x11grab input; check both capabilities before choosing a capture
command.

**Why:** A Pygame/bridge pass cannot prove responsive Godot movement or an
enjoyable 3D client, and the dummy headless renderer cannot validate or capture
the actual presentation.

**How to apply:** When changing the Godot client, test its real-time controls
and local bridge behavior, then launch it with `godot` or `godot4`. For visual
captures, start Xvfb and run Godot with `DISPLAY`, `--display-driver x11`,
`--rendering-method gl_compatibility`, and `--rendering-driver opengl3`; use a
virtual screen at least as large as the configured game window.
Locate Xvfb in the Nix store if it is not on PATH, and verify that the selected
screenshot tool supports X11 capture rather than assuming FFmpeg has x11grab.

Godot 4.4.1 can print `SCRIPT ERROR` during a headless runtime and still exit
with status 0, so a successful process result alone does not prove a clean
launch. Headless editor asset imports may also log `texture_2d_get` null errors
from the dummy renderer; distinguish those import messages from runtime script
errors.

**Why:** A paired smoke returned success despite runtime script errors, which
would have hidden a broken floor scene if the logs were not reviewed.

**How to apply:** Inspect Godot stdout/stderr for script errors after clean
imports and paired launches, even when the process and bridge return success.

Paired Godot/Python snapshots serialize static objects across rooms. A full-world
payload can exceed the bridge's roughly 256 KiB pending-write limit; oversized
messages are silently dropped. Keep snapshots bounded to the active room or
introduce chunking, while preserving the data needed for room transitions. The
basement HUD expects `basement` to be a Dictionary even when no offline snapshot
exists, so missing data must be encoded as `{}`.

**Why:** Live gameplay capture exposed stale room frames when an oversized
snapshot was dropped, and `null` basement data caused a repeated Godot script
error.

**How to apply:** Keep bridge payloads within the queue limit or make rejection
explicit; test live room transitions and offline basement rendering in Godot.

The product is an open-world office-simulation MMO. Make player interaction and
communication easy to discover across shared spaces and office devices; preserve
the distinction between proximity voice/video meetings and phone calls.

**Why:** The user explicitly described SALARYMAN as an open-world office sim MMO
and said players need easy ways to interact and communicate.

**How to apply:** Keep shared spaces populated and interaction-focused, with
communication entry points integrated into the relevant in-world devices.

For this game initiative, changes stay in the downloadable game and its game-side
services; do not modify browser versions, which the user says are good for now.

**Why:** The user explicitly limited the current work to the game and asked to
leave browser versions unchanged.

**How to apply:** Before editing a shared frontend or API surface, verify the
change serves only the native game flow; avoid browser UI changes unless the
user later asks for them.

For entry scripts that instantiate a newly added controller, preload the script
by resource path instead of relying only on its `class_name`; a clean direct
launch can happen before Godot generates the global script-class cache.

**Why:** An editor-assisted launch can populate `.godot` metadata and hide a
missing cold-start dependency.

**How to apply:** Keep direct, clean-project launch in verification and use a
preload constant when a runtime entry script needs the new controller type.

The native downloadable game must support common Xbox- and PlayStation-style
controllers, in addition to keyboard controls.

**Why:** The user explicitly asked to play the native game with a controller.

**How to apply:** Preserve standard Godot gamepad mappings in the native client
and package them with the game. Do not claim physical-controller compatibility
was verified unless an actual device is tested.