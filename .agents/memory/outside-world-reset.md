---
name: Outside-world reset
description: Product boundary for the temporary removal of the exterior world gameplay surface and its audio behavior
---

The exterior world is intentionally absent until it is rebuilt as a new, scoped experience. Keep its old renderer, map/directory/travel/land UI, and navigation out of the playable app; preserving backend data or APIs is acceptable only when they do not activate the old client runtime.

Background audio must not start from route entry, onboarding, Pablo, immigration, or office load. The only intended source is an explicit interaction with the physical in-world Shadow Radio; spoken Pablo/Mila replies remain available through their separate voice path.

**Why:** The previous outside-world surface had accumulated too much gameplay and ambient behavior to patch safely. The user explicitly chose a clean reset and wants the product to stay quiet unless the player deliberately turns on a tiny radio.

**How to apply:** Treat old exterior routes as redirects or remove them from navigation/search. Do not restore procedural world/office ambience as a convenience on mount or first gesture; any future world rebuild must add radio proximity and explicit-toggle tests before adding ambient audio.