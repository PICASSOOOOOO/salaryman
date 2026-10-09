---
name: Godot review model attachments
description: Reliable placement and rendering of procedural details on normalized character models.
---

For procedural hair, glasses, and similar head details on a normalized character model, derive positions from the normalized head and eye geometry, not the whole-body center. Ensure shell faces point outward.

**Why:** Preview iterations showed that body-center placement can leave details floating away from the face, and reversed surface winding can make an exported mesh disappear in the Godot import even when it looks present in Blender.

**How to apply:** Measure the normalized head/eye bounds, weight details to the head bone, and validate the imported Godot scene visually before treating a Blender render as evidence.
