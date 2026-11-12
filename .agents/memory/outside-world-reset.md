---
name: View-only Tower exterior
description: Product boundary for the new exterior scenery and retired outside-world gameplay/audio
---

The legacy exterior world remains retired: keep its old renderer, map/directory/travel/land UI, and navigation out of the playable app. The replacement is a Godot-native landscape beyond the Tower's exterior windows, visible as players walk and zoom. It is only a backdrop, not an outdoor area: no traversal, collision, navigation, interactions, audio, or property access.

Facade visibility depends on aligning window openings across co-planar floor shells and perimeter business-suite walls; overlapping panes also need a very low alpha or their tint stacks toward opacity.

Background audio must not start from route entry, onboarding, Pablo, immigration, or office load. The only intended source is an explicit interaction with the physical in-world Shadow Radio; spoken Pablo/Mila replies remain available through their separate voice path.

**Why:** The user clarified that WorldClaw should populate scenery outside the Tower for views through the windows, not restore outdoor gameplay. The old outside-world surface and ambient behavior remain retired. Overlapping room shells can otherwise hide the view even when the window glass itself is translucent.

**How to apply:** Keep the landscape in the Godot client and strictly visual. When editing facade windows, check every co-planar shell and suite boundary that crosses the same sightline, not just the room shell that owns the visible window. Treat old exterior routes as redirects or remove them from navigation/search. Do not restore procedural world/office ambience as a convenience on mount or first gesture; any future audio work must retain the radio's explicit-toggle behavior.