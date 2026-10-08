---
name: Packaged game capture
description: Capture authentic SALARYMAN Godot gameplay when the virtual Linux display cannot read the OpenGL window.
---

On Replit's virtual Linux display, a window-level XWD capture can be entirely
black even while the bundled Godot client renders. Use Godot Movie Maker through
the packaged Python/Godot pair, then extract a still from the finished recording.
Keep any temporary launcher or manifest override out of the release archive and
restore it on every exit path. At 1080p/15 fps, llvmpipe rendering can run far
below real time; give it a generous timeout and verify the finished video's
duration, frame count, and decode. Do not assume injected keyboard input worked:
check that the resulting frames actually show the intended movement or action.

**Why:** XWD failed to capture the OpenGL contents, while Movie Maker produced
the actual game viewport. Rendering and shutdown took much longer than the
video's playback duration.

**How to apply:** Use this path for media that must show the real packaged game.
If a static review render is also useful, deliver and label it separately from
gameplay footage.
