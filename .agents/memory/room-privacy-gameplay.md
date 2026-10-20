---
name: Room privacy and acoustic gameplay
description: Defines visual and sound boundaries plus the fictional scope of eavesdropping in the Tower.
---

Keep the player's current room clear. Fog belongs beyond its boundary; closed office doors obscure private interiors from the hallway, and open doors reveal only a limited view. Keep the elevator cabin clear while fogging the outside view during travel.

Sound follows the same boundary: closed doors strongly muffle in-game audio and open doors allow more sound through. In-world voice and video use direct quick-key toggles for real microphone/webcam capture, with no separate app-level opt-in flow. Keep them separate from phone calls; do not route private COMMS into eavesdropping. Eavesdropping and spying are gameplay mechanics that must respect server room authorization. Corporate intel is a persistent information-inventory category, gathered from validated game-world sources rather than treated as a consumable. Fog and sound attenuation are not access controls.

**Why:** The user specified room fog, limited visibility through open doors, sound leakage, eavesdropping/spying and corporate espionage, plus player-controlled access to real webcams and microphones for proximity chat and meetings—not phone calls. On October 7, 2026, they clarified that in-world voice/video should be direct quick-key toggles, not a separate opt-in flow.

**How to apply:** Implement sensory effects and spy actions against game-world state only. Map voice/video hotkeys directly to the real capture/meeting pipeline without adding a separate app opt-in flow. Any action that reads hidden game data must be validated server-side and must not bypass existing private-office permissions.

Building cameras should feed relevant in-game incidents to building security
and debt collectors. Both groups are small and poorly managed, so response can
be delayed or inconsistent; evidence and room authorization still matter, and
cameras must not bypass private-office access rules.

**Why:** The user wants cameras connected to security and collections within a
small, badly managed workforce.

**How to apply:** Route game-world camera incidents to the appropriate security
or debt-collection roles, model limited capacity and poor management, and keep
investigations evidence-led and within authorized room boundaries.
