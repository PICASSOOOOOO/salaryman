---
name: Pest work and carcass bounty
description: Separates local work-order tracking from shared co-op pest fights and carcass rewards.
---

Keep pest-job listings/progress local to each player, but let players cooperate against the same shared pest actors. Carcasses are valuable sale goods and should yield a single server-issued in-game FIAT bounty per carcass.

**Why:** The user chose local work orders while clarifying that the game is an MMO, players can cooperate on the pests, and someone pays for carcasses.

**How to apply:** Keep each order local, synchronize hostile health/defeat in the shared world, and make carcass turn-in server-authoritative and idempotent so one carcass cannot pay twice.
