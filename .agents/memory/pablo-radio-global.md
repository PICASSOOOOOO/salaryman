---
name: Pablo Radio global station
description: Rules for the single, continuous Call Home radio experience.
---

Pablo Radio is a single global, opt-in Call Home station rather than a separate
office and world player. It remains tuned across route changes and toggles;
controls and in-world HUDs must only update the shared radio setting, never
mount an additional audio player.

**Why:** Multiple route-owned players restarted tracks and fought the background
audio coordinator, making the station feel like several unrelated radios.

**How to apply:** Preserve the current track position when pausing. Phone routes
and active calls take priority and pause the station; resume it after they end.
Pablo DJ interstitials are brief, cancellable, and must honor voice volume,
master mute, and phone priority. Ambient/procedural score remains a separate
opt-in-aware background layer.