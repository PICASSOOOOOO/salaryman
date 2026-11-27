---
name: Production game release gate
description: Release policy for production gameplay routes and the public test build.
---

Game routes must show a simple “Coming soon” state in the production build until the official game trailer is ready. The PTU must remain playable.

**Why:** the user explicitly asked not to include the game in the production release and tied its release to the game trailer.

**How to apply:** keep gameplay routes behind the production release gate; use `VITE_GAME_RELEASE_CHANNEL=ptu` for a production-built PTU, and only set `VITE_GAME_TRAILER_READY=true` when the trailer is ready.
