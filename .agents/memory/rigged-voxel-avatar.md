---
name: Rigged voxel avatar conversion
description: Lessons for converting animated SALARYMAN character meshes to voxel-style geometry.
---

Do not voxel-remesh overlapping body, clothing, and accessory shells independently for the live character. Independent remeshes can leave visible seams, and subdividing each attached box creates z-fighting where pieces overlap. Preserve the existing animation skeleton and verify the result in Godot before replacing the production avatar.

**Why:** Separate shell geometry and the current bone-attached block construction produced visible artifacts instead of the supplied clean voxel style.

**How to apply:** Prefer a unified voxel surface with correctly transferred per-bone weights, or use a clean supplied rigged asset. Check front and three-quarter views and confirm all 32 clips before integration.
