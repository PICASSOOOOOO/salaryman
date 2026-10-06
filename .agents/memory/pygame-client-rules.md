---
name: Pygame client rules
description: Rendering, animation, gameplay authority, and atmosphere constraints for the desktop client.
---

Keep the desktop game orthogonal/top-down, preserve one grounded scale for actors, and keep avatar identity separate from movement animation. Character-sheet columns are fixed appearance variants, not walk frames; animate movement with a small separate pose. Decorative room choices must not change collisions or live-object authority.

**Why:** Cycling character-sheet columns changes the avatar's appearance instead of showing a walk cycle, and decorative geometry must not become gameplay authority.

**How to apply:** Keep the game bright and solar-punk at the start, preserve camera and actor-grounding rules, and open the specialized notes below for the affected subsystem.

- [Spatial-object authority](pygame-spatial-objects.md) — registry and room-state boundary.
- [Office camera](desktop-office-camera.md) — straight top-down orthogonal framing.
- [Character grounding](pygame-character-grounding.md) — actor scale, baseline, and clipping.
- [Idle sleep](pygame-idle-sleep.md) — authoritative five-minute sleep behavior.
- [Lobby resolution](pygame-lobby-room-resolution.md) — resolve the smallest playable room before lobby fallback.
- [Real-time wages](pygame-real-time-wages.md) — wall-clock production and wage floor.
- [Solar-punk decay](pygame-solarpunk-decay.md) — atmosphere progression.
- [Automation bridge](pygame-automation-bridge.md) — permission-filtered, read-only server status.
