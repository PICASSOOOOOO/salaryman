---
name: Pygame idle sleep
description: The automatic idle timer and wake behavior for the standalone Pygame office.
---

The player enters a persistent sleep state after five minutes with no movement input and zero velocity. Any directional input or direct bridge movement wakes the player, resets the idle timer, and returns the player to standing.

**Why:** Sleep is an ambient consequence of leaving the character unattended, not a short-lived animation that depends on a manual key or renderer timing.

**How to apply:** Keep the timer and wake rules in the authoritative TowerScene movement path so Pygame and bridge-driven clients behave identically. Explicit jump/sit actions may still reset the timer, but automatic sleep must not reset it when it triggers.