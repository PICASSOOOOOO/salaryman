---
name: Staged battle scenes + safe streets
description: Durable design invariants for SALARYMAN's staged-battle mode and the retirement of open-world roaming combat.
---

# Staged battle scenes + safe streets

Real combat happens ONLY inside staged battle scenes (a self-contained sub-scene
launched from the world). The open world is a safe networking zone. Key durable
decisions/invariants (the wiring is discoverable in code; these are the WHYs):

- **"Retire roaming combat" means gating BOTH directions.** Gating only
  enemy→player damage is INCOMPLETE — leaving player→threat damage on creates
  risk-free XP/bounty/loot farming, which review will (correctly) reject. Gate
  every enemy→player path AND every player→threat path (melee, projectile, AoE,
  and the dog companion) behind the same lethal-combat flag.
  **Why:** found the hard way — first pass only disabled enemy aggro/damage.

- **Keep ANIMALS huntable even when streets are non-lethal.** Animal kills drop
  FOOD, which feeds the KEPT hunger/cold survival system. So the player→threat
  gate carries an animal exception; combatant threats (gangs/syndicates/guards)
  go inert, animals do not.

- **Battle music must go through the audio-settings channel model, never master
  alone.** The battle track is a `soundtrack`-channel asset: drive its volume
  from `channelGain("soundtrack")` (which bundles soundtrack-slider × master ×
  voice-duck) times a battle boost, and duck the ambient `music` channel on mount.
  `subscribeAudioSettings` re-fires on voice-priority changes, so subscribing is
  enough to honor live ducking. **Why:** review rejected a `master*0.75` version —
  the soundtrack slider had no effect and voice ducking wasn't honored.

- **Battle outcome (rewards + story progression) must fire exactly once.** Keep a
  hard one-shot guard in the report path; don't rely on the RAF stop alone.
  Player base attack is snapshotted WITHOUT the magic multiplier and the arena
  applies gear magic mult once — don't double-apply.

- **Untouched on purpose:** gas/safe-zone, radiation, hunger/cold,
  debt/collections, police/wanted enforcement, and open-world peer PvP (separate
  multiplayer system, out of scope).

- **Verifying world-page edits:** full `tsc --noEmit` on the interview-helper
  artifact is too slow for the tool window while dev workflows run (the world
  page is ~24k lines) and detached runs get reaped. Use
  `getLatestLspDiagnostics({filePath})` — the IDE tsserver already has the
  project loaded and answers instantly.
