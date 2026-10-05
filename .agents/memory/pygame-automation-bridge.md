---
name: Pygame automation bridge
description: Security and product boundaries for showing existing SALARYMAN automations in the downloadable office.
---

The Pygame office may visualize SALARYMAN's existing automation domains, but it must not become another automation engine or expose controls that start, stop, or edit workflows. Character movement and status must reflect only a fresh, authorized server snapshot.

**Why:** Automation execution, billing, and organization permissions already belong to the browser/API product. A game-side copy would create conflicting state and an unintended path around access checks.

**How to apply:** Authenticate the desktop through its linked-device credential; scope the snapshot to that user's current organization; retain the existing autopilot subscription and `autopilot.manage` checks, hide finance and owner-only domains when the user lacks access, and return only domain, enabled, and last-run status. Unlinked, failed, or missing sync must render as idle/unavailable, never as active.
