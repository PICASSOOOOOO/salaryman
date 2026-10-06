---
name: Room privacy and acoustic gameplay
description: Defines visual and sound boundaries plus the fictional scope of eavesdropping in the Tower.
---

Keep the player's current room clear. Fog belongs beyond its boundary; closed office doors obscure private interiors from the hallway, and open doors reveal only a limited view. Keep the elevator cabin clear while fogging the outside view during travel.

Sound follows the same boundary: closed doors strongly muffle in-game audio and open doors allow more sound through. Proximity voice and video meetings may use real microphone/webcam devices only through explicit player-controlled settings. Keep them separate from phone calls; do not auto-enable capture or route private COMMS into eavesdropping. Eavesdropping and spying are gameplay mechanics but must respect consent settings and server room authorization. Corporate intel is a persistent information-inventory category, gathered from validated game-world sources rather than treated as a consumable. Fog and sound attenuation are not access controls.

**Why:** The user specified room fog, limited visibility through open doors, sound leakage, eavesdropping/spying and corporate espionage, plus player-controlled access to real webcams and microphones for proximity chat and meetings—not phone calls.

**How to apply:** Implement sensory effects and spy actions against game-world state only. Any action that reads hidden game data must be validated server-side and must not bypass existing private-office permissions.
