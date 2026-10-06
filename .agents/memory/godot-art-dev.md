---
name: Godot and Unreal art development
description: Godot handles sprite/animation and spatial blocking; Unreal handles production 3D/spatial/cinematic assets behind the shared art pipeline, with solar-punk physical art and dark-noir narrative treatment.
---

Godot 4 art-dev consumes the existing 16×32 character-sheet contract and
publishes rendered PNG review frames through the API's `/ws/godot/render`
bridge. Unreal is the production renderer for realistic characters, spatial
environments, and cinematic output through the configured remote render node.
The web app remains the gameplay runtime; the API remains authoritative for
prompts, asset records, QA, and provider selection.

**Why:** This gives sprite and spatial work purpose-built tools without
splitting gameplay state or duplicating the art pipeline across another server.

**How to apply:** Keep Godot changes focused on preview/export quality and
renderer-side animation and blocking. Keep Unreal jobs explicitly pinned for
production 3D/cinematic work and never silently fall back to another renderer.
Promote reviewed outputs through the existing art catalog and QA flow rather
than making either project a second source of truth. The physical world should
feel like a 1970s–1980s solar-punk retrofuture even when the story is dark noir.
All new assets must be animation-worthy: readable silhouettes, separable layers,
clean pivots and contacts, stable lighting, and no baked text or UI.

Portable Godot bundles should ship source GLTF/GLB assets and floor-plan data,
but not the generated `.godot` import cache. A cache-free smoke test must run
one editor import pass before launching the runtime; otherwise first-load
resource errors are a test-order artifact, not necessarily a package defect.

**Why:** Godot can import assets on first launch, while copying editor caches
makes releases stale and platform-specific. The previous cache-free runtime
check launched before import completed and reported misleading missing-resource
errors.

**How to apply:** Validate the bundle's required source assets in the desktop
build script, run `godot --headless --editor --quit` once in a clean copy, then
run the headless runtime smoke test.

## Pygame coordinate fidelity in visual previews

Pygame snapshots may use a large absolute origin in the lobby and room-local
coordinates elsewhere. Godot may rebase that origin for rendering only; never
rewrite snapshot or command coordinates. Visual fixtures should use actual
Pygame coordinates and cover both the large-origin lobby and a local room.

**Why:** A hand-authored small position can make a Godot screenshot look correct
while concealing a mismatch with the live lobby spawn.

**How to apply:** Build review frames from a Pygame snapshot (or an exact fixture
from its contract), and test lobby and local-room placement before delivery.