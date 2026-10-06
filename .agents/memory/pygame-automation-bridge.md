---
name: Pygame automation bridge
description: Security and product boundaries for showing existing SALARYMAN automations in the downloadable office.
---

The Pygame office may visualize SALARYMAN's existing automation domains, but it must not become another automation engine or expose controls that start, stop, or edit workflows. Character movement and status must reflect only a fresh, authorized server snapshot. NPC inspection may offer a user-invoked link to the matching practical app module; label character movement as a representative routine, not a live job.

**Why:** Automation execution, billing, and organization permissions already belong to the browser/API product. A game-side copy would create conflicting state and an unintended path around access checks. The NPC handoff connects the simulator to those real tools without suggesting that its animation performs them.

**How to apply:** Authenticate the desktop through its linked-device credential; scope the snapshot to that user's current organization; retain the existing autopilot subscription and `autopilot.manage` checks, hide finance and owner-only domains when the user lacks access, and return only domain, enabled, and last-run status. Build browser links from fixed, verified module routes, never from server-provided paths. Unlinked, failed, or missing sync must render as idle/unavailable, never as active.
