---
name: Retail-grade asset pipeline
description: Asset URLs are not enough; game-consumable art requires technical QA, explicit renderer selection, and human approval for cutouts.
---

The art pipeline must distinguish provider completion from game readiness. Every
rendered output needs server-side validation for reachable HTTPS URL, decodable
format, minimum dimensions, expected aspect ratio, and file size. Cutout
categories additionally need alpha or an explicit visual-review state. Keep the
original output metadata and make human approval explicit rather than silently
promoting questionable art.

**Why:** A URL-only `ready` state allowed low-resolution, opaque, malformed, or
visually unsuitable images to enter the game while appearing successful in the
admin library.

**How to apply:** Keep renderer-specific contracts behind the provider registry,
never silently fall back when an asset selects a backend, use lossless 2K+ output
for production source art, and treat Godot as the in-game acceptance target.