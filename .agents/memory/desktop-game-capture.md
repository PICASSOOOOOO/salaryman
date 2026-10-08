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
The bundled Godot 4.4.1 Movie Maker rejects MP4; capture MJPEG AVI at the
requested resolution, then transcode it with ffmpeg and verify both files.
When 4K is requested, render the packaged game at 3840×2160 rather than upscaling
a 1080p capture. Verify that the game received real simulation data and that the
requested zoom/action is visible; a live bridge connection alone is insufficient.

**Why:** XWD failed to capture the OpenGL contents, while Movie Maker produced
the actual game viewport. A prior capture showed an idle waiting screen despite
a live bridge; the bundled writer accepted AVI but rejected MP4, and rendering
and shutdown took much longer than playback.

**How to apply:** Use this path for media that must show the real packaged game.
For high-resolution requests, set the engine viewport to the requested output
size, then verify file metadata and inspect frames before delivery. If a static
review render is also useful, label it separately from gameplay footage.
