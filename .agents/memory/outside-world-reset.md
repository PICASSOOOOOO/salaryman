---
name: Outside-world reset
description: Product boundary for the temporary removal of the exterior world gameplay surface and its audio behavior
---

The legacy exterior world remains retired: keep its old renderer, map/directory/travel/land UI, and navigation out of the playable app. On 2026-10-08, the user explicitly approved a new, scoped Godot-native exterior around the Tower, starting beyond the B1 loading-yard gate. This is not a restoration of the old browser-world runtime.

Background audio must not start from route entry, onboarding, Pablo, immigration, or office load. The only intended source is an explicit interaction with the physical in-world Shadow Radio; spoken Pablo/Mila replies remain available through their separate voice path.

**Why:** The previous outside-world surface had accumulated too much gameplay and ambient behavior to patch safely. The user chose a clean reset, then separately asked for a new Tower exterior using WorldClaw's research; the new work should stay scoped to the native game.

**How to apply:** Keep the new exterior in the Godot client and preserve the existing separation between rendering and Python-owned gameplay authority. Treat old exterior routes as redirects or remove them from navigation/search. Do not restore procedural world/office ambience as a convenience on mount or first gesture; any future audio work must retain the radio's explicit-toggle behavior.