---
name: Audio MUSIC vs AMBIANCE model
description: The two background-audio beds in SALARYMAN, which is opt-in vs default, and the dual volume-control reality that makes transport (not gain) the off-switch in-game.
---

# MUSIC vs AMBIANCE

Two distinct background beds with two distinct user-facing toggles, both persisted
in the central audio store:

- **MUSIC** = office radio songs. Internally the `soundtrack` channel. **Opt-in:
  default OFF.** Plays only on a game/office scene route AND when enabled. Never
  auto-plays.
- **AMBIANCE** = the procedural synthwave score. Internally the `music` channel.
  **Default ON, intentionally EXTREMELY LOW.** Only ever runs inside WorldPlay.

**Why:** owner wanted music to stop auto-playing (opt-in, in-game only) plus a
separate faint ambient bed that runs during the game but is toggleable off.

## The non-obvious decision: transport, not gain, is the in-game off-switch
The central store gates both channels by their enable flag, BUT inside WorldPlay a
second volume path overrides the engine music volume directly (bypassing the central
ambiance gate) so the in-game ambient loudness tracks WorldPlay's own output slider.
Consequence: AMBIANCE-off cannot be enforced by the central gain gate in-game — it
must be enforced by TRANSPORT (pause the ambient) and restored by restarting it.

**How to apply:**
- `ambianceEnabled` is the single source of truth for the ambient bed. Flip it via
  the central store; do not poke the engine directly. The in-world SCORE button must
  also flip `ambianceEnabled` (not call play/pause itself) or the two controls drift.
- A WorldPlay subscription to the store does the actual start-on / pause-off and keeps
  the SCORE button's displayed state in sync. The first-gesture autostart only fires
  if AMBIANCE is enabled at that moment, so the subscription is what restarts it when
  toggled on mid-game.
- To change in-game ambiance loudness, lower WorldPlay's output-slider multiplier, NOT
  just the central `music` default (the central value is overridden in-game).
- Any music-gain test must enable MUSIC to see `soundtrack` gain at all.
